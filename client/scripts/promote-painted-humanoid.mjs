#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'
import sharp from 'sharp'

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const riggedPath = path.resolve(option('rigged') ?? '')
const paintedPath = path.resolve(option('painted') ?? '')
const outputPath = path.resolve(option('output') ?? '')
const textureDir = path.resolve(option('texture-dir') ?? path.join(path.dirname(outputPath), 'pbr'))
if (!option('rigged') || !option('painted') || !option('output')) {
  throw new Error('Usage: promote-painted-humanoid.mjs --rigged animated.glb --painted painted.glb --output pbr.glb [--texture-dir pbr]')
}

const io = new NodeIO()
const [rigged, painted] = await Promise.all([io.read(riggedPath), io.read(paintedPath)])
const rigRoot = rigged.getRoot()
const paintedRoot = painted.getRoot()
const rigPrimitive = rigRoot.listMeshes()[0]?.listPrimitives()[0]
const paintedPrimitive = paintedRoot.listMeshes()[0]?.listPrimitives()[0]
if (!rigPrimitive || !paintedPrimitive) throw new Error('Both inputs must contain one mesh primitive')

const rigPosition = rigPrimitive.getAttribute('POSITION')
const rigJoints = rigPrimitive.getAttribute('JOINTS_0')
const rigWeights = rigPrimitive.getAttribute('WEIGHTS_0')
const paintPosition = paintedPrimitive.getAttribute('POSITION')
const paintNormal = paintedPrimitive.getAttribute('NORMAL')
const paintUv = paintedPrimitive.getAttribute('TEXCOORD_0')
const paintIndices = paintedPrimitive.getIndices()
if (!rigPosition || !rigJoints || !rigWeights) throw new Error('Rigged input has incomplete skin attributes')
if (!paintPosition || !paintUv || !paintIndices) throw new Error('Painted input has incomplete PBR geometry attributes')

const rigPositions = rigPosition.getArray()
const rigJointValues = rigJoints.getArray()
const rigWeightValues = rigWeights.getArray()
const paintPositions = paintPosition.getArray()
const keyFor = (array, offset) => `${Math.round(array[offset] * 1e6)},${Math.round(array[offset + 1] * 1e6)},${Math.round(array[offset + 2] * 1e6)}`
const sourceByPosition = new Map()
for (let index = 0; index < rigPosition.getCount(); index++) {
  const key = keyFor(rigPositions, index * 3)
  if (!sourceByPosition.has(key)) sourceByPosition.set(key, index)
}

const jointItemSize = rigJoints.getElementSize()
const weightItemSize = rigWeights.getElementSize()
const PaintedJointArray = rigJointValues.constructor
const paintedJoints = new PaintedJointArray(paintPosition.getCount() * jointItemSize)
const paintedWeights = new Float32Array(paintPosition.getCount() * weightItemSize)
let nearestFallbacks = 0
let maximumDistance = 0
for (let target = 0; target < paintPosition.getCount(); target++) {
  const offset = target * 3
  let source = sourceByPosition.get(keyFor(paintPositions, offset))
  let bestDistance = 0
  if (source === undefined) {
    nearestFallbacks++
    bestDistance = Number.POSITIVE_INFINITY
    for (let candidate = 0; candidate < rigPosition.getCount(); candidate++) {
      const candidateOffset = candidate * 3
      const dx = paintPositions[offset] - rigPositions[candidateOffset]
      const dy = paintPositions[offset + 1] - rigPositions[candidateOffset + 1]
      const dz = paintPositions[offset + 2] - rigPositions[candidateOffset + 2]
      const distance = Math.hypot(dx, dy, dz)
      if (distance < bestDistance) {
        bestDistance = distance
        source = candidate
      }
    }
    if (bestDistance > 1e-5) throw new Error(`Painted vertex ${target} has no exact skinned source (${bestDistance})`)
  }
  maximumDistance = Math.max(maximumDistance, bestDistance)
  for (let component = 0; component < jointItemSize; component++) {
    paintedJoints[target * jointItemSize + component] = rigJointValues[source * jointItemSize + component]
  }
  for (let component = 0; component < weightItemSize; component++) {
    paintedWeights[target * weightItemSize + component] = rigWeightValues[source * weightItemSize + component]
  }
}

const paintedNormals = new Float32Array(paintPosition.getCount() * 3)
const paintedIndexValues = paintIndices.getArray()
for (let offset = 0; offset < paintedIndexValues.length; offset += 3) {
  const a = paintedIndexValues[offset]
  const b = paintedIndexValues[offset + 1]
  const c = paintedIndexValues[offset + 2]
  const ax = paintPositions[a * 3], ay = paintPositions[a * 3 + 1], az = paintPositions[a * 3 + 2]
  const abx = paintPositions[b * 3] - ax, aby = paintPositions[b * 3 + 1] - ay, abz = paintPositions[b * 3 + 2] - az
  const acx = paintPositions[c * 3] - ax, acy = paintPositions[c * 3 + 1] - ay, acz = paintPositions[c * 3 + 2] - az
  const nx = aby * acz - abz * acy
  const ny = abz * acx - abx * acz
  const nz = abx * acy - aby * acx
  for (const vertex of [a, b, c]) {
    paintedNormals[vertex * 3] += nx
    paintedNormals[vertex * 3 + 1] += ny
    paintedNormals[vertex * 3 + 2] += nz
  }
}
for (let vertex = 0; vertex < paintPosition.getCount(); vertex++) {
  const offset = vertex * 3
  const length = Math.hypot(paintedNormals[offset], paintedNormals[offset + 1], paintedNormals[offset + 2]) || 1
  paintedNormals[offset] /= length
  paintedNormals[offset + 1] /= length
  paintedNormals[offset + 2] /= length
}

const paintedBaseTexture = paintedPrimitive.getMaterial()?.getBaseColorTexture()
const baseImage = paintedBaseTexture?.getImage()
if (!baseImage) throw new Error('Painted input contains no base-color image')
const { data: rgba, info } = await sharp(baseImage).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const normalPixels = Buffer.alloc(rgba.length)
const ormPixels = Buffer.alloc(rgba.length)
const luminance = (x, y) => {
  const clampedX = Math.max(0, Math.min(info.width - 1, x))
  const clampedY = Math.max(0, Math.min(info.height - 1, y))
  const offset = (clampedY * info.width + clampedX) * 4
  return (rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722) / 255
}
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * 4
    const dx = (luminance(x + 1, y) - luminance(x - 1, y)) * 1.4
    const dy = (luminance(x, y + 1) - luminance(x, y - 1)) * 1.4
    const length = Math.hypot(-dx, -dy, 1)
    normalPixels[offset] = Math.round(((-dx / length) * 0.5 + 0.5) * 255)
    normalPixels[offset + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255)
    normalPixels[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255)
    normalPixels[offset + 3] = 255

    const max = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]) / 255
    const min = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]) / 255
    const saturation = max ? (max - min) / max : 0
    const roughness = Math.max(0.58, Math.min(0.92, 0.88 - saturation * 0.18 + Math.abs(dx + dy) * 0.12))
    ormPixels[offset] = 255
    ormPixels[offset + 1] = Math.round(roughness * 255)
    ormPixels[offset + 2] = 0
    ormPixels[offset + 3] = 255
  }
}
const normalImage = await sharp(normalPixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
const ormImage = await sharp(ormPixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()

const baseTexture = rigged.createTexture('BaseColor').setImage(baseImage).setMimeType('image/png')
const normalTexture = rigged.createTexture('Normal').setImage(normalImage).setMimeType('image/png')
const ormTexture = rigged.createTexture('OcclusionRoughnessMetallic').setImage(ormImage).setMimeType('image/png')
const material = rigged.createMaterial('Humanoid_Painted_PBR')
  .setBaseColorTexture(baseTexture)
  .setBaseColorFactor([1, 1, 1, 1])
  .setNormalTexture(normalTexture)
  .setNormalScale(0.35)
  .setMetallicRoughnessTexture(ormTexture)
  .setMetallicFactor(1)
  .setRoughnessFactor(1)
  .setOcclusionTexture(ormTexture)
  .setDoubleSided(false)

const copyAccessor = (name, source, array = source.getArray()) => rigged.createAccessor(name)
  .setType(source.getType())
  .setArray(new array.constructor(array))
  .setNormalized(source.getNormalized())
const primitive = rigged.createPrimitive()
  .setMode(paintedPrimitive.getMode())
  .setIndices(copyAccessor('indices', paintIndices))
  .setAttribute('POSITION', copyAccessor('POSITION', paintPosition))
  .setAttribute('NORMAL', paintNormal
    ? copyAccessor('NORMAL', paintNormal)
    : rigged.createAccessor('NORMAL').setType('VEC3').setArray(paintedNormals))
  .setAttribute('TEXCOORD_0', copyAccessor('TEXCOORD_0', paintUv))
  .setAttribute('JOINTS_0', copyAccessor('JOINTS_0', rigJoints, paintedJoints))
  .setAttribute('WEIGHTS_0', copyAccessor('WEIGHTS_0', rigWeights, paintedWeights))
  .setMaterial(material)

const rigMesh = rigRoot.listMeshes()[0]
for (const oldPrimitive of rigMesh.listPrimitives()) rigMesh.removePrimitive(oldPrimitive)
rigMesh.addPrimitive(primitive)
rigMesh.setExtras({
  ...rigMesh.getExtras(),
  pbrPaint: {
    source: path.basename(paintedPath),
    channels: ['baseColor', 'normal', 'occlusion', 'roughness', 'metallic'],
    generatedChannels: ['normal', 'occlusion', 'roughness', 'metallic'],
  },
})

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.mkdir(textureDir, { recursive: true })
await Promise.all([
  io.write(outputPath, rigged),
  fs.writeFile(path.join(textureDir, 'base-color.png'), baseImage),
  fs.writeFile(path.join(textureDir, 'normal.png'), normalImage),
  fs.writeFile(path.join(textureDir, 'orm.png'), ormImage),
])
const result = {
  output: outputPath,
  riggedVertices: rigPosition.getCount(),
  paintedVertices: paintPosition.getCount(),
  triangles: paintIndices.getCount() / 3,
  nearestFallbacks,
  maximumDistance,
  textureSize: [info.width, info.height],
  animations: rigRoot.listAnimations().length,
  joints: rigRoot.listSkins()[0]?.listJoints().length ?? 0,
  channels: ['baseColor', 'normal', 'occlusion', 'roughness', 'metallic'],
}
await fs.writeFile(outputPath.replace(/\.glb$/i, '.paint.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
