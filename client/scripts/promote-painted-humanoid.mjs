#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'
import sharp from 'sharp'

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const defaultStylePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../assets/pipeline/humanoid-fantasy-style.json',
)

const riggedPath = path.resolve(option('rigged') ?? '')
const paintedPath = path.resolve(option('painted') ?? '')
const paintReferencePath = option('paint-reference')
  ? path.resolve(option('paint-reference'))
  : undefined
const styleReferencePath = option('style-reference')
  ? path.resolve(option('style-reference'))
  : undefined
const detailPaintedPath = option('detail-painted')
  ? path.resolve(option('detail-painted'))
  : undefined
const outputPath = path.resolve(option('output') ?? '')
const textureDir = path.resolve(option('texture-dir') ?? path.join(path.dirname(outputPath), 'pbr'))
const stylePath = path.resolve(option('style-profile') ?? defaultStylePath)
const textureAuditPath = path.resolve(
  option('texture-audit') ?? path.join(path.dirname(outputPath), 'texture-audit.json'),
)
const character = option('character')
  ?? (outputPath.toLowerCase().includes('female') ? 'female' : 'male')
if (!option('rigged') || !option('painted') || !option('output')) {
  throw new Error('Usage: promote-painted-humanoid.mjs --rigged animated.glb --painted painted.glb --output pbr.glb [--paint-reference old-unpainted.glb] [--texture-dir pbr]')
}

const io = new NodeIO()
const [rigged, painted, paintReference, style] = await Promise.all([
  io.read(riggedPath),
  io.read(paintedPath),
  paintReferencePath ? io.read(paintReferencePath) : undefined,
  fs.readFile(stylePath, 'utf8').then(JSON.parse),
])
const rigRoot = rigged.getRoot()
const paintedRoot = painted.getRoot()
const rigPrimitive = rigRoot.listMeshes()[0]?.listPrimitives()[0]
const paintedPrimitive = paintedRoot.listMeshes()[0]?.listPrimitives()[0]
const paintReferencePrimitive = paintReference?.getRoot().listMeshes()[0]?.listPrimitives()[0]
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
const mappingPosition = paintReferencePrimitive?.getAttribute('POSITION') ?? rigPosition
const mappingPositions = mappingPosition.getArray()
if (mappingPosition.getCount() !== rigPosition.getCount()) {
  throw new Error(
    `Paint reference has ${mappingPosition.getCount()} vertices; rigged source has ${rigPosition.getCount()}`,
  )
}
// Blender's GLB import/export round-trip can move a position by <5e-7 m.
// Quantize at 1e-5 m so UV-only repacks still use the exact topology map;
// the promoted output always restores the authoritative rig positions below.
const keyFor = (array, offset) => `${Math.round(array[offset] * 1e5)},${Math.round(array[offset + 1] * 1e5)},${Math.round(array[offset + 2] * 1e5)}`
const triangleSignature = (positions, indices, offset) => {
  const keys = [0, 1, 2].map((component) => keyFor(positions, indices[offset + component] * 3))
  const rotations = [
    `${keys[0]}|${keys[1]}|${keys[2]}`,
    `${keys[1]}|${keys[2]}|${keys[0]}`,
    `${keys[2]}|${keys[0]}|${keys[1]}`,
  ]
  return rotations.sort()[0]
}
const signatureCounts = (positions, indices) => {
  const counts = new Map()
  for (let offset = 0; offset < indices.length; offset += 3) {
    const signature = triangleSignature(positions, indices, offset)
    counts.set(signature, (counts.get(signature) ?? 0) + 1)
  }
  return counts
}
const deriveTopologyCorrespondence = (sourcePrimitive, targetPrimitive) => {
  const sourcePosition = sourcePrimitive.getAttribute('POSITION')
  const targetPosition = targetPrimitive.getAttribute('POSITION')
  const sourceIndices = sourcePrimitive.getIndices()?.getArray()
    ?? Uint32Array.from({ length: sourcePosition.getCount() }, (_, index) => index)
  const targetIndices = targetPrimitive.getIndices()?.getArray()
    ?? Uint32Array.from({ length: targetPosition.getCount() }, (_, index) => index)
  const sourceValues = sourcePosition.getArray()
  const targetValues = targetPosition.getArray()
  const directedOpposite = (indices) => {
    const result = new Map()
    for (let offset = 0; offset < indices.length; offset += 3) {
      const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2]
      result.set(`${a}:${b}`, c)
      result.set(`${b}:${c}`, a)
      result.set(`${c}:${a}`, b)
    }
    return result
  }
  const targetFaces = new Set()
  for (let offset = 0; offset < targetIndices.length; offset += 3) {
    const a = targetIndices[offset], b = targetIndices[offset + 1], c = targetIndices[offset + 2]
    targetFaces.add(`${a}:${b}:${c}`)
    targetFaces.add(`${b}:${c}:${a}`)
    targetFaces.add(`${c}:${a}:${b}`)
  }
  const nearest = new Uint32Array(sourcePosition.getCount())
  const nearestDistance = new Float64Array(sourcePosition.getCount())
  for (let source = 0; source < sourcePosition.getCount(); source++) {
    let best = Number.POSITIVE_INFINITY
    let bestIndex = 0
    for (let target = 0; target < targetPosition.getCount(); target++) {
      const dx = sourceValues[source * 3] - targetValues[target * 3]
      const dy = sourceValues[source * 3 + 1] - targetValues[target * 3 + 1]
      const dz = sourceValues[source * 3 + 2] - targetValues[target * 3 + 2]
      const distance = dx * dx + dy * dy + dz * dz
      if (distance < best) {
        best = distance
        bestIndex = target
      }
    }
    nearest[source] = bestIndex
    nearestDistance[source] = best
  }
  let seed
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    const oldFace = [sourceIndices[offset], sourceIndices[offset + 1], sourceIndices[offset + 2]]
    const newFace = oldFace.map((index) => nearest[index])
    if (new Set(newFace).size < 3 || !targetFaces.has(newFace.join(':'))) continue
    const score = oldFace.reduce((total, index) => total + nearestDistance[index], 0)
    if (!seed || score < seed.score) seed = { oldFace, newFace, score }
  }
  if (!seed) throw new Error('Could not seed painted topology correspondence')
  const sourceOpposite = directedOpposite(sourceIndices)
  const targetOpposite = directedOpposite(targetIndices)
  const mapping = new Int32Array(sourcePosition.getCount()).fill(-1)
  const reverse = new Int32Array(targetPosition.getCount()).fill(-1)
  const queue = []
  const assign = (source, target) => {
    if (mapping[source] >= 0 && mapping[source] !== target) {
      throw new Error(`Inconsistent topology map for source vertex ${source}`)
    }
    if (reverse[target] >= 0 && reverse[target] !== source) {
      throw new Error(`Topology map is not one-to-one at target vertex ${target}`)
    }
    if (mapping[source] < 0) {
      mapping[source] = target
      reverse[target] = source
      queue.push(source)
    }
  }
  seed.oldFace.forEach((source, index) => assign(source, seed.newFace[index]))
  while (queue.length) {
    const source = queue.shift()
    const target = mapping[source]
    for (const [key, third] of sourceOpposite) {
      const [first, second] = key.split(':').map(Number)
      if (first !== source || mapping[second] < 0) continue
      const targetThird = targetOpposite.get(`${target}:${mapping[second]}`)
      if (targetThird !== undefined) assign(third, targetThird)
    }
  }
  if ([...mapping].some((value) => value < 0) || new Set(mapping).size !== mapping.length) {
    throw new Error('Painted topology correspondence did not cover one connected surface')
  }
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    const face = [
      mapping[sourceIndices[offset]],
      mapping[sourceIndices[offset + 1]],
      mapping[sourceIndices[offset + 2]],
    ]
    if (!targetFaces.has(face.join(':'))) {
      throw new Error(`Topology correspondence changes oriented triangle ${offset / 3}`)
    }
  }
  return mapping
}
const sourceToRig = paintReferencePrimitive
  ? deriveTopologyCorrespondence(paintReferencePrimitive, rigPrimitive)
  : Int32Array.from({ length: rigPosition.getCount() }, (_, index) => index)
const sourceByPosition = new Map()
for (let index = 0; index < mappingPosition.getCount(); index++) {
  const key = keyFor(mappingPositions, index * 3)
  if (!sourceByPosition.has(key)) sourceByPosition.set(key, index)
}

const jointItemSize = rigJoints.getElementSize()
const weightItemSize = rigWeights.getElementSize()
const PaintedJointArray = rigJointValues.constructor
const paintedJoints = new PaintedJointArray(paintPosition.getCount() * jointItemSize)
const paintedWeights = new Float32Array(paintPosition.getCount() * weightItemSize)
const promotedPaintPositions = new Float32Array(paintPositions.length)
let nearestFallbacks = 0
let maximumDistance = 0
let roundTripRecoveries = 0
let maximumRoundTripDistance = 0
for (let target = 0; target < paintPosition.getCount(); target++) {
  const offset = target * 3
  let source = sourceByPosition.get(keyFor(paintPositions, offset))
  let bestDistance = 0
  if (source === undefined) {
    bestDistance = Number.POSITIVE_INFINITY
    for (let candidate = 0; candidate < rigPosition.getCount(); candidate++) {
      const candidateOffset = candidate * 3
      const dx = paintPositions[offset] - mappingPositions[candidateOffset]
      const dy = paintPositions[offset + 1] - mappingPositions[candidateOffset + 1]
      const dz = paintPositions[offset + 2] - mappingPositions[candidateOffset + 2]
      const distance = Math.hypot(dx, dy, dz)
      if (distance < bestDistance) {
        bestDistance = distance
        source = candidate
      }
    }
    if (bestDistance > 1e-5) throw new Error(`Painted vertex ${target} has no exact skinned source (${bestDistance})`)
    if (bestDistance <= 1e-6) {
      roundTripRecoveries++
      maximumRoundTripDistance = Math.max(maximumRoundTripDistance, bestDistance)
      bestDistance = 0
    } else {
      nearestFallbacks++
    }
  }
  maximumDistance = Math.max(maximumDistance, bestDistance)
  const rigSource = sourceToRig[source]
  promotedPaintPositions[offset] = rigPositions[rigSource * 3]
  promotedPaintPositions[offset + 1] = rigPositions[rigSource * 3 + 1]
  promotedPaintPositions[offset + 2] = rigPositions[rigSource * 3 + 2]
  for (let component = 0; component < jointItemSize; component++) {
    paintedJoints[target * jointItemSize + component] = rigJointValues[rigSource * jointItemSize + component]
  }
  for (let component = 0; component < weightItemSize; component++) {
    paintedWeights[target * weightItemSize + component] = rigWeightValues[rigSource * weightItemSize + component]
  }
}

const rigIndices = rigPrimitive.getIndices()?.getArray()
  ?? Uint32Array.from({ length: rigPosition.getCount() }, (_, index) => index)
const paintedIndexValues = paintIndices.getArray()
const rigTopology = signatureCounts(rigPositions, rigIndices)
const paintedTopology = signatureCounts(promotedPaintPositions, paintedIndexValues)
const topologyMismatches = new Set([...rigTopology.keys(), ...paintedTopology.keys()])
  .size === rigTopology.size && [...rigTopology].every(([signature, count]) =>
    paintedTopology.get(signature) === count)
  ? 0
  : [...new Set([...rigTopology.keys(), ...paintedTopology.keys()])].reduce(
    (total, signature) => total + Math.abs(
      (rigTopology.get(signature) ?? 0) - (paintedTopology.get(signature) ?? 0),
    ),
    0,
  )
if (topologyMismatches) {
  throw new Error(`Painted surface changes ${topologyMismatches} oriented triangles`)
}

let maximumInfluences = 0
let maximumWeightSumError = 0
for (let vertex = 0; vertex < paintPosition.getCount(); vertex++) {
  let sum = 0
  let influences = 0
  for (let component = 0; component < weightItemSize; component++) {
    const weight = paintedWeights[vertex * weightItemSize + component]
    sum += weight
    if (weight > 1e-6) influences++
  }
  maximumInfluences = Math.max(maximumInfluences, influences)
  maximumWeightSumError = Math.max(maximumWeightSumError, Math.abs(sum - 1))
}
if (maximumInfluences > 4 || maximumWeightSumError > 1e-4) {
  throw new Error(
    `Painted skin is invalid (${maximumInfluences} influences, ${maximumWeightSumError} weight-sum error)`,
  )
}

const paintedNormals = new Float32Array(paintPosition.getCount() * 3)
for (let offset = 0; offset < paintedIndexValues.length; offset += 3) {
  const a = paintedIndexValues[offset]
  const b = paintedIndexValues[offset + 1]
  const c = paintedIndexValues[offset + 2]
  const ax = promotedPaintPositions[a * 3], ay = promotedPaintPositions[a * 3 + 1], az = promotedPaintPositions[a * 3 + 2]
  const abx = promotedPaintPositions[b * 3] - ax, aby = promotedPaintPositions[b * 3 + 1] - ay, abz = promotedPaintPositions[b * 3 + 2] - az
  const acx = promotedPaintPositions[c * 3] - ax, acy = promotedPaintPositions[c * 3 + 1] - ay, acz = promotedPaintPositions[c * 3 + 2] - az
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
const sourceInfo = await sharp(baseImage).metadata()
const { data: sourceRgba, info: sourceRawInfo } = await sharp(baseImage)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
const albedoMode = style.albedo.mode ?? 'procedural-semantic'
if (!['procedural-semantic', 'source-preserved'].includes(albedoMode)) {
  throw new Error(`Unsupported albedo mode ${JSON.stringify(albedoMode)} in ${style.id}`)
}
const proceduralAlbedo = albedoMode === 'procedural-semantic'
const palette = style.characters?.[character]
if (proceduralAlbedo && !palette) {
  throw new Error(`Style profile ${style.id} has no character palette for ${character}`)
}

const paintedUvValues = paintUv.getArray()
const jointNames = rigRoot.listSkins()[0]?.listJoints().map((joint) => joint.getName()) ?? []
const jointIndex = new Map(jointNames.map((name, index) => [name, index]))
const semanticJointSets = {
  head: new Set(['head', 'neck'].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  hands: new Set(['hand.L', 'hand.R'].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  feet: new Set(['foot.L', 'foot.R', 'toe.L', 'toe.R'].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  arms: new Set([
    'upper_arm.L', 'forearm.L', 'hand.L',
    'upper_arm.R', 'forearm.R', 'hand.R',
  ].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  legs: new Set([
    'thigh.L', 'shin.L', 'foot.L', 'toe.L',
    'thigh.R', 'shin.R', 'foot.R', 'toe.R',
  ].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
}
const faceJointSet = new Set(
  ['head'].map((name) => jointIndex.get(name)).filter(Number.isInteger),
)
const semanticWeight = (vertex, set) => {
  let total = 0
  for (let component = 0; component < weightItemSize; component++) {
    if (set.has(paintedJoints[vertex * jointItemSize + component])) {
      total += paintedWeights[vertex * weightItemSize + component]
    }
  }
  return total
}
const headVertices = []
for (let vertex = 0; vertex < paintPosition.getCount(); vertex++) {
  if (semanticWeight(vertex, faceJointSet) >= 0.50) {
    headVertices.push([
      promotedPaintPositions[vertex * 3],
      promotedPaintPositions[vertex * 3 + 1],
      promotedPaintPositions[vertex * 3 + 2],
    ])
  }
}
const headRange = (axis) => [
  Math.min(...headVertices.map((point) => point[axis])),
  Math.max(...headVertices.map((point) => point[axis])),
]
const [headMinX, headMaxX] = headRange(0)
const [headMinY, headMaxY] = headRange(1)
const [headMinZ, headMaxZ] = headRange(2)
const headWidth = headMaxX - headMinX
const headHeight = headMaxY - headMinY
const headCenterX = (headMinX + headMaxX) / 2
const headDepth = headMaxZ - headMinZ
const bodyMinY = Math.min(...Array.from({ length: paintPosition.getCount() }, (_, vertex) =>
  promotedPaintPositions[vertex * 3 + 1]))
const bodyMaxY = Math.max(...Array.from({ length: paintPosition.getCount() }, (_, vertex) =>
  promotedPaintPositions[vertex * 3 + 1]))
const bodyMinX = Math.min(...Array.from({ length: paintPosition.getCount() }, (_, vertex) =>
  promotedPaintPositions[vertex * 3]))
const bodyMaxX = Math.max(...Array.from({ length: paintPosition.getCount() }, (_, vertex) =>
  promotedPaintPositions[vertex * 3]))
const bodyHeight = bodyMaxY - bodyMinY
const facial = {
  eyeY: headMinY + headHeight * 0.64,
  eyeSpacing: headWidth * 0.18,
  eyeRadiusX: headWidth * 0.060,
  eyeRadiusY: headHeight * 0.020,
  browY: headMinY + headHeight * 0.70,
  mouthY: headMinY + headHeight * 0.29,
  mouthRadiusX: headWidth * 0.19,
  mouthRadiusY: headHeight * 0.016,
  hairlineY: headMinY + headHeight * 0.76,
  frontZ: headMinZ + headDepth * 0.52,
}
const mix = (first, second, amount) => first.map((value, index) =>
  Math.max(0, Math.min(255, Math.round(value * (1 - amount) + second[index] * amount))))
let repairedRgba = Buffer.from(sourceRgba)
if (proceduralAlbedo) {
  for (let offset = 0; offset < repairedRgba.length; offset += 4) {
    repairedRgba[offset] = palette.tunicShadow[0]
    repairedRgba[offset + 1] = palette.tunicShadow[1]
    repairedRgba[offset + 2] = palette.tunicShadow[2]
    repairedRgba[offset + 3] = 255
  }
}
const setPixel = (offset, color) => {
  repairedRgba[offset] = color[0]
  repairedRgba[offset + 1] = color[1]
  repairedRgba[offset + 2] = color[2]
  repairedRgba[offset + 3] = 255
}
const ellipse = (x, y, centerX, centerY, radiusX, radiusY) =>
  ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1
const clamp01 = (value) => Math.max(0, Math.min(1, value))
const painterly = (base, shadow, [x, y, z], strength = 0.12) => {
  const heightLight = clamp01((y - bodyMinY) / Math.max(bodyHeight, 1e-5))
  const broadStroke = (Math.sin(x * 41 + y * 23 - z * 31)
    + Math.sin(x * 17 - y * 37 + z * 29)) * 0.25
  const amount = clamp01(0.72 + heightLight * 0.12 + broadStroke * strength)
  return mix(shadow, base, amount)
}
const semanticLabels = ['torso', 'head', 'hands', 'feet', 'arms', 'legs']
const semanticFlags = Object.fromEntries(semanticLabels.map((label, index) => [label, 1 << index]))
const semanticOwners = new Uint8Array(sourceRawInfo.width * sourceRawInfo.height)
const semanticBodyY = new Float32Array(sourceRawInfo.width * sourceRawInfo.height)
const conflictMask = new Uint8Array(sourceRawInfo.width * sourceRawInfo.height)
const coverage = new Uint8Array(sourceRawInfo.width * sourceRawInfo.height)
const paintedPixels = Object.fromEntries(semanticLabels.map((label) => [label, 0]))
const triangleSemantic = (triangle) => {
  const averageWeight = (semantic) => triangle.reduce(
    (total, vertex) => total + semanticWeight(vertex, semanticJointSets[semantic]), 0) / 3
  if (averageWeight('head') >= 0.35) return 'head'
  if (averageWeight('hands') >= 0.35) return 'hands'
  if (averageWeight('feet') >= 0.35) return 'feet'
  if (averageWeight('arms') >= 0.30) return 'arms'
  if (averageWeight('legs') >= 0.30) return 'legs'
  return 'torso'
}
const rasterizeTriangle = (a, b, c, semantic) => {
  const vertices = [a, b, c]
  const points = vertices.map((vertex) => ({
    x: paintedUvValues[vertex * 2] * (sourceRawInfo.width - 1),
    // glTF images and TEXCOORD_0 both use an upper-left origin. Flipping V
    // here paints the semantic colour into the vertically mirrored UV island.
    y: paintedUvValues[vertex * 2 + 1] * (sourceRawInfo.height - 1),
    position: [
      promotedPaintPositions[vertex * 3],
      promotedPaintPositions[vertex * 3 + 1],
      promotedPaintPositions[vertex * 3 + 2],
    ],
  }))
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))))
  const maxX = Math.min(sourceRawInfo.width - 1, Math.ceil(Math.max(...points.map((point) => point.x))))
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))))
  const maxY = Math.min(sourceRawInfo.height - 1, Math.ceil(Math.max(...points.map((point) => point.y))))
  const denominator = (points[1].y - points[2].y) * (points[0].x - points[2].x)
    + (points[2].x - points[1].x) * (points[0].y - points[2].y)
  if (Math.abs(denominator) < 1e-8) return
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const sampleX = px + 0.5
      const sampleY = py + 0.5
      const w0 = ((points[1].y - points[2].y) * (sampleX - points[2].x)
        + (points[2].x - points[1].x) * (sampleY - points[2].y)) / denominator
      const w1 = ((points[2].y - points[0].y) * (sampleX - points[2].x)
        + (points[0].x - points[2].x) * (sampleY - points[2].y)) / denominator
      const w2 = 1 - w0 - w1
      if (w0 <= 1e-6 || w1 <= 1e-6 || w2 <= 1e-6) continue
      const position = [0, 1, 2].map((axis) =>
        points[0].position[axis] * w0 + points[1].position[axis] * w1 + points[2].position[axis] * w2)
      const pixel = py * sourceRawInfo.width + px
      const offset = pixel * 4
      const existing = semanticOwners[pixel]
      if (existing && !(existing & semanticFlags[semantic])) conflictMask[pixel] = 1
      semanticOwners[pixel] |= semanticFlags[semantic]
      semanticBodyY[pixel] = position[1]
      coverage[pixel] = 1
      if (!proceduralAlbedo) {
        paintedPixels[semantic]++
        continue
      }
      if (semantic === 'hands') {
        setPixel(offset, painterly(palette.skin, palette.skinShadow, position, 0.08))
      } else if (semantic === 'feet') {
        const toeHighlight = clamp01((headMaxZ - position[2]) / Math.max(headDepth * 2, 1e-5))
        setPixel(offset, mix(
          painterly(palette.boot, palette.pantsShadow, position, 0.10),
          palette.bootHighlight,
          toeHighlight * 0.16,
        ))
      } else if (semantic === 'legs') {
        const bootLine = bodyMinY + bodyHeight * 0.17
        setPixel(offset, position[1] <= bootLine
          ? painterly(palette.boot, palette.pantsShadow, position, 0.10)
          : painterly(palette.pants, palette.pantsShadow, position, 0.11))
      } else if (semantic === 'arms') {
        const sleeveLine = bodyMinY + bodyHeight * 0.59
        setPixel(offset, position[1] <= sleeveLine
          ? painterly(palette.skin, palette.skinShadow, position, 0.08)
          : painterly(palette.tunic, palette.tunicShadow, position, 0.13))
      } else if (semantic === 'torso') {
        let color = painterly(palette.tunic, palette.tunicShadow, position, 0.14)
        const centerSeam = Math.abs(position[0]) < headWidth * 0.035
        if (centerSeam && position[1] > bodyMinY + bodyHeight * 0.50) {
          color = mix(color, palette.stitch, 0.18)
        }
        setPixel(offset, color)
      } else {
        const [x, y, z] = position
        // The authored body's visible front is +Z after Blender's glTF axis
        // conversion (the art-review camera uses +Z for its front views).
        const front = z >= facial.frontZ
        const hair = y >= facial.hairlineY
          || (!front && y > headMinY + headHeight * 0.42)
          || (Math.abs(x - headCenterX) > headWidth * 0.41 && y > headMinY + headHeight * 0.48)
        if (hair) {
          setPixel(offset, painterly(palette.hair, palette.brow, position, 0.06))
        } else {
          const light = 0.72 + 0.20 * clamp01((z - headMinZ) / Math.max(headDepth, 1e-5))
          let color = mix(palette.skinShadow, palette.skin, light)
          if (front && palette.beard && y < headMinY + headHeight * 0.46
            && ellipse(x, y, headCenterX, headMinY + headHeight * 0.20, headWidth * 0.34, headHeight * 0.17)) {
            const beardStroke = 0.46 + 0.08 * Math.sin(x * 71 + y * 47)
            color = mix(color, palette.beard, beardStroke)
          }
          if (front) {
            for (const side of [-1, 1]) {
              const eyeX = headCenterX + side * facial.eyeSpacing
              if (ellipse(x, y, eyeX, facial.browY, facial.eyeRadiusX * 1.35, facial.eyeRadiusY * 0.28)) {
                color = palette.brow
              }
              if (ellipse(x, y, eyeX, facial.eyeY, facial.eyeRadiusX, facial.eyeRadiusY)) {
                color = mix(palette.skin, [194, 177, 160], 0.58)
              }
              if (ellipse(x, y, eyeX, facial.eyeY, facial.eyeRadiusX * 0.38, facial.eyeRadiusY * 0.72)) {
                color = palette.iris
              }
              if (ellipse(x, y, eyeX, facial.eyeY, facial.eyeRadiusX * 0.13, facial.eyeRadiusY * 0.46)) {
                color = [31, 27, 26]
              }
            }
            if (ellipse(x, y, headCenterX, facial.mouthY, facial.mouthRadiusX, facial.mouthRadiusY)) {
              color = palette.lip
            }
          }
          setPixel(offset, color)
        }
      }
      paintedPixels[semantic]++
    }
  }
}
for (let offset = 0; offset < paintedIndexValues.length; offset += 3) {
  const triangle = [paintedIndexValues[offset], paintedIndexValues[offset + 1], paintedIndexValues[offset + 2]]
  rasterizeTriangle(...triangle, triangleSemantic(triangle))
}

let surfacePixels = 0
const uvPaddingPixels = proceduralAlbedo ? (style.albedo.uvPaddingPixels ?? 8) : 0
if (proceduralAlbedo) {
  surfacePixels = coverage.reduce((total, value) => total + value, 0)
  for (let pass = 0; pass < uvPaddingPixels; pass++) {
    const nextRgba = Buffer.from(repairedRgba)
    const nextCoverage = coverage.slice()
    for (let y = 0; y < sourceRawInfo.height; y++) {
      for (let x = 0; x < sourceRawInfo.width; x++) {
        const pixel = y * sourceRawInfo.width + x
        if (coverage[pixel]) continue
        const neighbours = [
          x > 0 ? pixel - 1 : -1,
          x + 1 < sourceRawInfo.width ? pixel + 1 : -1,
          y > 0 ? pixel - sourceRawInfo.width : -1,
          y + 1 < sourceRawInfo.height ? pixel + sourceRawInfo.width : -1,
        ]
        const source = neighbours.find((candidate) => candidate >= 0 && coverage[candidate])
        if (source === undefined) continue
        repairedRgba.copy(nextRgba, pixel * 4, source * 4, source * 4 + 4)
        nextCoverage[pixel] = 1
      }
    }
    repairedRgba = nextRgba
    coverage.set(nextCoverage)
  }
} else {
  for (let offset = 3; offset < sourceRgba.length; offset += 4) {
    if (sourceRgba[offset] > 0) surfacePixels++
  }
}

let referenceProjection = {
  enabled: false,
  reference: styleReferencePath ?? null,
  projectedPixels: 0,
  skippedBackgroundPixels: 0,
  foregroundBounds: null,
}
if (!proceduralAlbedo && style.albedo.referenceProjection?.enabled) {
  if (!styleReferencePath) {
    throw new Error(`Style profile ${style.id} requires --style-reference`)
  }
  const { data: referenceRgba, info: referenceInfo } = await sharp(styleReferencePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const backgroundThreshold = style.albedo.referenceProjection.backgroundThreshold ?? 245
  let minReferenceX = referenceInfo.width
  let maxReferenceX = -1
  let minReferenceY = referenceInfo.height
  let maxReferenceY = -1
  const isForeground = (offset) => referenceRgba[offset + 3] > 8 && !(
    referenceRgba[offset] >= backgroundThreshold
    && referenceRgba[offset + 1] >= backgroundThreshold
    && referenceRgba[offset + 2] >= backgroundThreshold
  )
  for (let y = 0; y < referenceInfo.height; y++) {
    for (let x = 0; x < referenceInfo.width; x++) {
      if (!isForeground((y * referenceInfo.width + x) * 4)) continue
      minReferenceX = Math.min(minReferenceX, x)
      maxReferenceX = Math.max(maxReferenceX, x)
      minReferenceY = Math.min(minReferenceY, y)
      maxReferenceY = Math.max(maxReferenceY, y)
    }
  }
  if (maxReferenceX < minReferenceX || maxReferenceY < minReferenceY) {
    throw new Error(`Style reference ${styleReferencePath} contains no non-background subject`)
  }
  const strength = style.albedo.referenceProjection.strength ?? 0.82
  const frontDepth = headMinZ + headDepth * (style.albedo.referenceProjection.frontDepthFraction ?? 0.54)
  const minimumHeadY = headMinY + headHeight * (style.albedo.referenceProjection.minimumHeadHeightFraction ?? 0.28)
  const edgeInset = style.albedo.referenceProjection.edgeInsetPixels ?? 0
  const referenceWidth = Math.max(1, maxReferenceX - minReferenceX)
  const referenceHeight = Math.max(1, maxReferenceY - minReferenceY)
  const bodyWidth = Math.max(1e-5, bodyMaxX - bodyMinX)
  const projectTriangle = (a, b, c) => {
    const vertices = [a, b, c]
    if (triangleSemantic(vertices) !== 'head') return
    const averageDepth = vertices.reduce(
      (sum, vertex) => sum + promotedPaintPositions[vertex * 3 + 2], 0,
    ) / 3
    if (averageDepth < frontDepth) return
    const averageHeight = vertices.reduce(
      (sum, vertex) => sum + promotedPaintPositions[vertex * 3 + 1], 0,
    ) / 3
    if (averageHeight < minimumHeadY) return
    const points = vertices.map((vertex) => ({
      x: paintedUvValues[vertex * 2] * (sourceRawInfo.width - 1),
      y: paintedUvValues[vertex * 2 + 1] * (sourceRawInfo.height - 1),
      position: [
        promotedPaintPositions[vertex * 3],
        promotedPaintPositions[vertex * 3 + 1],
      ],
    }))
    const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))))
    const maxX = Math.min(sourceRawInfo.width - 1, Math.ceil(Math.max(...points.map((point) => point.x))))
    const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))))
    const maxY = Math.min(sourceRawInfo.height - 1, Math.ceil(Math.max(...points.map((point) => point.y))))
    const denominator = (points[1].y - points[2].y) * (points[0].x - points[2].x)
      + (points[2].x - points[1].x) * (points[0].y - points[2].y)
    if (Math.abs(denominator) < 1e-8) return
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const sampleX = px + 0.5
        const sampleY = py + 0.5
        const w0 = ((points[1].y - points[2].y) * (sampleX - points[2].x)
          + (points[2].x - points[1].x) * (sampleY - points[2].y)) / denominator
        const w1 = ((points[2].y - points[0].y) * (sampleX - points[2].x)
          + (points[0].x - points[2].x) * (sampleY - points[2].y)) / denominator
        const w2 = 1 - w0 - w1
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
        const modelX = points[0].position[0] * w0 + points[1].position[0] * w1 + points[2].position[0] * w2
        const modelY = points[0].position[1] * w0 + points[1].position[1] * w1 + points[2].position[1] * w2
        const referenceX = Math.max(0, Math.min(referenceInfo.width - 1, Math.round(
          minReferenceX + ((modelX - bodyMinX) / bodyWidth) * referenceWidth,
        )))
        const referenceY = Math.max(0, Math.min(referenceInfo.height - 1, Math.round(
          maxReferenceY - ((modelY - bodyMinY) / bodyHeight) * referenceHeight,
        )))
        const referenceOffset = (referenceY * referenceInfo.width + referenceX) * 4
        let safeForeground = isForeground(referenceOffset)
        for (let insetY = -edgeInset; safeForeground && insetY <= edgeInset; insetY++) {
          for (let insetX = -edgeInset; insetX <= edgeInset; insetX++) {
            const insetReferenceX = Math.max(0, Math.min(referenceInfo.width - 1, referenceX + insetX))
            const insetReferenceY = Math.max(0, Math.min(referenceInfo.height - 1, referenceY + insetY))
            if (!isForeground((insetReferenceY * referenceInfo.width + insetReferenceX) * 4)) {
              safeForeground = false
              break
            }
          }
        }
        if (!safeForeground) {
          referenceProjection.skippedBackgroundPixels++
          continue
        }
        const outputOffset = (py * sourceRawInfo.width + px) * 4
        for (let channel = 0; channel < 3; channel++) {
          repairedRgba[outputOffset + channel] = Math.round(
            repairedRgba[outputOffset + channel] * (1 - strength)
            + referenceRgba[referenceOffset + channel] * strength,
          )
        }
        repairedRgba[outputOffset + 3] = 255
        referenceProjection.projectedPixels++
      }
    }
  }
  for (let offset = 0; offset < paintedIndexValues.length; offset += 3) {
    projectTriangle(
      paintedIndexValues[offset],
      paintedIndexValues[offset + 1],
      paintedIndexValues[offset + 2],
    )
  }
  referenceProjection = {
    ...referenceProjection,
    enabled: true,
    strength,
    frontDepth,
    minimumHeadY,
    edgeInset,
    foregroundBounds: [minReferenceX, minReferenceY, maxReferenceX, maxReferenceY],
  }
}

let detailPaint = {
  enabled: false,
  source: detailPaintedPath,
  blendedPixels: 0,
}
if (!proceduralAlbedo && style.albedo.detailPaint?.enabled) {
  if (!detailPaintedPath) throw new Error(`Style profile ${style.id} requires --detail-painted`)
  const detailDocument = await io.read(detailPaintedPath)
  const detailPrimitive = detailDocument.getRoot().listMeshes()[0]?.listPrimitives()[0]
  const detailPosition = detailPrimitive?.getAttribute('POSITION')
  const detailUv = detailPrimitive?.getAttribute('TEXCOORD_0')
  const detailIndices = detailPrimitive?.getIndices()
  const detailImage = detailPrimitive?.getMaterial()?.getBaseColorTexture()?.getImage()
  if (!detailPosition || !detailUv || !detailIndices || !detailImage) {
    throw new Error(`Detail paint ${detailPaintedPath} is missing geometry, UVs, indices, or albedo`)
  }
  const arraysMatch = (first, second, tolerance = 0) => {
    if (first.length !== second.length) return false
    for (let index = 0; index < first.length; index++) {
      if (Math.abs(first[index] - second[index]) > tolerance) return false
    }
    return true
  }
  if (!arraysMatch(detailPosition.getArray(), paintPosition.getArray(), 1e-7)
    || !arraysMatch(detailUv.getArray(), paintUv.getArray(), 1e-7)
    || !arraysMatch(detailIndices.getArray(), paintIndices.getArray())) {
    throw new Error('Detail paint does not have deterministic geometry and UV parity with the body paint')
  }
  const { data: detailRgba, info: detailInfo } = await sharp(detailImage)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (detailInfo.width !== sourceRawInfo.width || detailInfo.height !== sourceRawInfo.height) {
    throw new Error(`Detail paint texture is ${detailInfo.width}x${detailInfo.height}; expected ${sourceRawInfo.width}x${sourceRawInfo.height}`)
  }
  const strength = style.albedo.detailPaint.strength ?? 0.9
  const semantics = new Set(style.albedo.detailPaint.semantics ?? ['head'])
  const blendTriangle = (a, b, c) => {
    const vertices = [a, b, c]
    if (!semantics.has(triangleSemantic(vertices))) return
    const points = vertices.map((vertex) => ({
      x: paintedUvValues[vertex * 2] * (sourceRawInfo.width - 1),
      y: paintedUvValues[vertex * 2 + 1] * (sourceRawInfo.height - 1),
    }))
    const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))))
    const maxX = Math.min(sourceRawInfo.width - 1, Math.ceil(Math.max(...points.map((point) => point.x))))
    const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))))
    const maxY = Math.min(sourceRawInfo.height - 1, Math.ceil(Math.max(...points.map((point) => point.y))))
    const denominator = (points[1].y - points[2].y) * (points[0].x - points[2].x)
      + (points[2].x - points[1].x) * (points[0].y - points[2].y)
    if (Math.abs(denominator) < 1e-8) return
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const sampleX = px + 0.5
        const sampleY = py + 0.5
        const w0 = ((points[1].y - points[2].y) * (sampleX - points[2].x)
          + (points[2].x - points[1].x) * (sampleY - points[2].y)) / denominator
        const w1 = ((points[2].y - points[0].y) * (sampleX - points[2].x)
          + (points[0].x - points[2].x) * (sampleY - points[2].y)) / denominator
        const w2 = 1 - w0 - w1
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
        const outputOffset = (py * sourceRawInfo.width + px) * 4
        for (let channel = 0; channel < 3; channel++) {
          repairedRgba[outputOffset + channel] = Math.round(
            repairedRgba[outputOffset + channel] * (1 - strength)
            + detailRgba[outputOffset + channel] * strength,
          )
        }
        repairedRgba[outputOffset + 3] = 255
        detailPaint.blendedPixels++
      }
    }
  }
  for (let offset = 0; offset < paintedIndexValues.length; offset += 3) {
    blendTriangle(
      paintedIndexValues[offset],
      paintedIndexValues[offset + 1],
      paintedIndexValues[offset + 2],
    )
  }
  detailPaint = {
    ...detailPaint,
    enabled: true,
    strength,
    semantics: [...semantics],
    geometryParity: true,
    uvParity: true,
    textureSize: [detailInfo.width, detailInfo.height],
  }
}

let skinArtifactRepair = {
  enabled: false,
  repairedPixels: 0,
  semantics: [],
}
if (!proceduralAlbedo && style.albedo.skinArtifactRepair?.enabled) {
  const repairSemantics = style.albedo.skinArtifactRepair.semantics ?? ['hands']
  const repairFlags = repairSemantics.reduce(
    (flags, semantic) => flags | (semanticFlags[semantic] ?? 0), 0,
  )
  const minimumLuminance = style.albedo.skinArtifactRepair.minimumLuminance ?? 185
  const maximumChroma = style.albedo.skinArtifactRepair.maximumChroma ?? 35
  const thresholdsBySemantic = style.albedo.skinArtifactRepair.thresholdsBySemantic ?? {}
  const maximumSearchRadius = style.albedo.skinArtifactRepair.maximumSearchRadius ?? 48
  const strength = style.albedo.skinArtifactRepair.strength ?? 0.92
  const invalid = new Uint8Array(sourceRawInfo.width * sourceRawInfo.height)
  const isArtifact = (pixel) => {
    if (!(semanticOwners[pixel] & repairFlags)) return false
    const offset = pixel * 4
    const red = repairedRgba[offset]
    const green = repairedRgba[offset + 1]
    const blue = repairedRgba[offset + 2]
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
    return repairSemantics.some((semantic) => {
      if (!(semanticOwners[pixel] & (semanticFlags[semantic] ?? 0))) return false
      const thresholds = thresholdsBySemantic[semantic] ?? {}
      const heightFraction = (semanticBodyY[pixel] - bodyMinY) / Math.max(bodyHeight, 1e-5)
      return heightFraction <= (thresholds.maximumHeightFraction ?? 1)
        && heightFraction >= (thresholds.minimumHeightFraction ?? 0)
        && luminance >= (thresholds.minimumLuminance ?? minimumLuminance)
        && chroma <= (thresholds.maximumChroma ?? maximumChroma)
    })
  }
  const validChannels = [[], [], []]
  for (let pixel = 0; pixel < invalid.length; pixel++) {
    if (!(semanticOwners[pixel] & repairFlags)) continue
    if (isArtifact(pixel)) invalid[pixel] = 1
    else {
      const offset = pixel * 4
      for (let channel = 0; channel < 3; channel++) {
        validChannels[channel].push(repairedRgba[offset + channel])
      }
    }
  }
  const fallback = validChannels.map((values) => {
    values.sort((first, second) => first - second)
    return values[Math.floor(values.length / 2)] ?? 128
  })
  const sourceBeforeRepair = Buffer.from(repairedRgba)
  const width = sourceRawInfo.width
  const height = sourceRawInfo.height
  for (let pixel = 0; pixel < invalid.length; pixel++) {
    if (!invalid[pixel]) continue
    const x = pixel % width
    const y = Math.floor(pixel / width)
    let donor = null
    for (let radius = 1; radius <= maximumSearchRadius && !donor; radius++) {
      for (let dx = -radius; dx <= radius && !donor; dx++) {
        for (const dy of [-radius, radius]) {
          const sampleX = x + dx
          const sampleY = y + dy
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue
          const candidate = sampleY * width + sampleX
          if ((semanticOwners[candidate] & repairFlags) && !invalid[candidate]) {
            donor = candidate
            break
          }
        }
      }
      for (let dy = -radius + 1; dy < radius && !donor; dy++) {
        for (const dx of [-radius, radius]) {
          const sampleX = x + dx
          const sampleY = y + dy
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue
          const candidate = sampleY * width + sampleX
          if ((semanticOwners[candidate] & repairFlags) && !invalid[candidate]) {
            donor = candidate
            break
          }
        }
      }
    }
    const offset = pixel * 4
    const donorOffset = donor === null ? -1 : donor * 4
    for (let channel = 0; channel < 3; channel++) {
      const replacement = donorOffset < 0
        ? fallback[channel]
        : sourceBeforeRepair[donorOffset + channel]
      repairedRgba[offset + channel] = Math.round(
        repairedRgba[offset + channel] * (1 - strength) + replacement * strength,
      )
    }
    skinArtifactRepair.repairedPixels++
  }
  skinArtifactRepair = {
    ...skinArtifactRepair,
    enabled: true,
    semantics: repairSemantics,
    minimumLuminance,
    maximumChroma,
    thresholdsBySemantic,
    maximumSearchRadius,
    strength,
  }
}
const semanticOverlapPixels = conflictMask.reduce((total, value) => total + value, 0)
if (proceduralAlbedo && semanticOverlapPixels) {
  throw new Error(
    `UV atlas has ${semanticOverlapPixels} cross-semantic texels; repack it before procedural painting`,
  )
}

const repairedBaseImage = await sharp(repairedRgba, {
  raw: { width: sourceRawInfo.width, height: sourceRawInfo.height, channels: 4 },
}).png().toBuffer()
let albedoPipeline = sharp(repairedBaseImage).removeAlpha()
if ((style.albedo.medianRadius ?? 0) > 0) {
  albedoPipeline = albedoPipeline.median(style.albedo.medianRadius)
}
albedoPipeline = albedoPipeline.modulate({
  saturation: style.albedo.saturation ?? 1,
  brightness: style.albedo.brightness ?? 1,
})
if ((style.albedo.sharpenSigma ?? 0) > 0) {
  albedoPipeline = albedoPipeline.sharpen({ sigma: style.albedo.sharpenSigma })
}
const styledBaseImage = await albedoPipeline
  .png(proceduralAlbedo ? {
    palette: true,
    colours: style.albedo.paletteColors,
    dither: style.albedo.dither,
  } : {
    compressionLevel: 9,
    palette: false,
  })
  .toBuffer()
const { data: rgba, info } = await sharp(styledBaseImage)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
const normalPixels = Buffer.alloc(rgba.length)
const ormPixels = Buffer.alloc(rgba.length)
const [normalR, normalG, normalB] = style.pbr.normalRgb
const roughness = Math.round(style.pbr.roughness * 255)
const occlusion = Math.round(style.pbr.occlusion * 255)
const metallic = Math.round(style.pbr.metallic * 255)
const uniqueColors = new Set()
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * 4
    uniqueColors.add((rgba[offset] << 16) | (rgba[offset + 1] << 8) | rgba[offset + 2])
    normalPixels[offset] = normalR
    normalPixels[offset + 1] = normalG
    normalPixels[offset + 2] = normalB
    normalPixels[offset + 3] = 255
    ormPixels[offset] = occlusion
    ormPixels[offset + 1] = roughness
    ormPixels[offset + 2] = metallic
    ormPixels[offset + 3] = 255
  }
}
const normalImage = await sharp(normalPixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
const ormImage = await sharp(ormPixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()

const baseTexture = rigged.createTexture('BaseColor').setImage(styledBaseImage).setMimeType('image/png')
const normalTexture = rigged.createTexture('Normal').setImage(normalImage).setMimeType('image/png')
const ormTexture = rigged.createTexture('OcclusionRoughnessMetallic').setImage(ormImage).setMimeType('image/png')
const material = rigged.createMaterial('Humanoid_Painted_PBR')
  .setBaseColorTexture(baseTexture)
  .setBaseColorFactor([1, 1, 1, 1])
  .setNormalTexture(normalTexture)
  .setNormalScale(1)
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
  .setAttribute('POSITION', copyAccessor('POSITION', paintPosition, promotedPaintPositions))
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
    geometryReference: paintReferencePath ? path.basename(paintReferencePath) : null,
    channels: ['baseColor', 'normal', 'occlusion', 'roughness', 'metallic'],
    generatedChannels: ['normal', 'occlusion', 'roughness', 'metallic'],
    styleProfile: style.id,
    styleReference: styleReferencePath ? path.basename(styleReferencePath) : null,
    detailPaintSource: detailPaintedPath ? path.basename(detailPaintedPath) : null,
    albedoMode,
    albedoProcessing: proceduralAlbedo
      ? 'fully procedural semantic painterly palette; source projection discarded'
      : 'Hunyuan source projection preserved; lossless PNG color grade only',
    normalMethod: style.pbr.normalMethod,
  },
})

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.mkdir(textureDir, { recursive: true })
await Promise.all([
  io.write(outputPath, rigged),
  fs.writeFile(path.join(textureDir, 'base-color.png'), styledBaseImage),
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
  roundTripRecoveries,
  maximumRoundTripDistance,
  paintReference: paintReferencePath ?? null,
  topologyMismatches,
  maximumInfluences,
  maximumWeightSumError,
  textureSize: [info.width, info.height],
  animations: rigRoot.listAnimations().length,
  joints: rigRoot.listSkins()[0]?.listJoints().length ?? 0,
  channels: ['baseColor', 'normal', 'occlusion', 'roughness', 'metallic'],
  styleProfile: style.id,
  styleProfilePath: stylePath,
  albedoProcessing: {
    mode: albedoMode,
    sourceProjectionPreserved: !proceduralAlbedo,
    medianRadius: style.albedo.medianRadius ?? 0,
    saturation: style.albedo.saturation ?? 1,
    brightness: style.albedo.brightness ?? 1,
    sharpenSigma: style.albedo.sharpenSigma ?? 0,
    paletteColors: style.albedo.paletteColors ?? null,
    uniqueColors: uniqueColors.size,
    semanticPaintPixels: paintedPixels,
    surfacePixels,
    uvPaddingPixels,
    semanticOverlapPixels,
    referenceProjection,
    detailPaint,
    skinArtifactRepair,
  },
  normalMethod: style.pbr.normalMethod,
  roughness: style.pbr.roughness,
  metallic: style.pbr.metallic,
}
const textureChecks = {
  sourceTextureSize: sourceInfo.width >= style.albedo.minimumSourceSize
    && sourceInfo.height >= style.albedo.minimumSourceSize,
  outputTextureSize: info.width >= style.albedo.minimumSourceSize
    && info.height >= style.albedo.minimumSourceSize,
  sourceProjectionPolicy: proceduralAlbedo
    ? uniqueColors.size <= style.albedo.paletteColors
    : style.albedo.preserveSourceProjection === true,
  colourDetail: proceduralAlbedo
    ? uniqueColors.size <= style.albedo.paletteColors
    : uniqueColors.size >= (style.albedo.minimumUniqueColors ?? 1024),
  flatNeutralNormal: style.pbr.normalMethod === 'flat'
    && normalR === 128 && normalG === 128 && normalB === 255,
  nonMetallic: style.pbr.metallic === 0,
  groundedSurface: style.pbr.roughness >= 0.55 && style.pbr.roughness <= 0.9,
  surfaceCoverage: surfacePixels > 0,
  semanticUvIsolation: !proceduralAlbedo || semanticOverlapPixels === 0,
  referenceProjection: !style.albedo.referenceProjection?.enabled
    || referenceProjection.projectedPixels >= (style.albedo.referenceProjection.minimumPixels ?? 512),
  detailPaint: !style.albedo.detailPaint?.enabled
    || (detailPaint.geometryParity === true
      && detailPaint.uvParity === true
      && detailPaint.blendedPixels >= (style.albedo.detailPaint.minimumPixels ?? 512)),
  skinArtifactRepair: !style.albedo.skinArtifactRepair?.enabled
    || skinArtifactRepair.enabled === true,
}
const automatedPassed = Object.values(textureChecks).every(Boolean)
const textureAudit = {
  schemaVersion: 1,
  input: paintedPath,
  output: outputPath,
  styleProfile: style.id,
  automatedPassed,
  artReviewRequired: true,
  passed: automatedPassed,
  checks: textureChecks,
  metrics: {
    sourceTextureSize: [sourceInfo.width, sourceInfo.height],
    outputTextureSize: [info.width, info.height],
    uniqueColors: uniqueColors.size,
    paletteLimit: style.albedo.paletteColors ?? null,
    minimumUniqueColors: style.albedo.minimumUniqueColors ?? null,
    albedoMode,
    roughness: style.pbr.roughness,
    metallic: style.pbr.metallic,
    surfacePixels,
    semanticPaintPixels: paintedPixels,
    uvPaddingPixels,
    semanticOverlapPixels,
    referenceProjection,
    detailPaint,
    skinArtifactRepair,
  },
  note: 'This report covers deterministic texture checks only. A separate reviewed art-review.json is required for release.',
}
await fs.writeFile(outputPath.replace(/\.glb$/i, '.paint.json'), `${JSON.stringify(result, null, 2)}\n`)
await fs.writeFile(textureAuditPath, `${JSON.stringify(textureAudit, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
