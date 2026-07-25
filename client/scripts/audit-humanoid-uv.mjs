#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'

const option = (name) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const input = option('input') ? path.resolve(option('input')) : undefined
const output = option('output') ? path.resolve(option('output')) : undefined
const resolution = Number(option('resolution') ?? 1024)
if (!input || !output || !Number.isInteger(resolution) || resolution < 64) {
  throw new Error('Usage: audit-humanoid-uv.mjs --input model.glb --output uv-audit.json [--resolution 1024]')
}

const document = await new NodeIO().read(input)
const root = document.getRoot()
const primitive = root.listMeshes()[0]?.listPrimitives()[0]
const skin = root.listSkins()[0]
if (!primitive || !skin) throw new Error('Input must contain one skinned mesh')

const uvAccessor = primitive.getAttribute('TEXCOORD_0')
const jointAccessor = primitive.getAttribute('JOINTS_0')
const weightAccessor = primitive.getAttribute('WEIGHTS_0')
const indexAccessor = primitive.getIndices()
if (!uvAccessor || !jointAccessor || !weightAccessor || !indexAccessor) {
  throw new Error('Input is missing UV, joint, weight, or index data')
}

const uvs = uvAccessor.getArray()
const joints = jointAccessor.getArray()
const weights = weightAccessor.getArray()
const indices = indexAccessor.getArray()
const jointNames = skin.listJoints().map((joint) => joint.getName())
const jointIndex = new Map(jointNames.map((name, index) => [name, index]))
const semanticJoints = {
  head: new Set(['neck', 'head'].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  hands: new Set(['hand.L', 'hand.R'].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  feet: new Set(['foot.L', 'toe.L', 'foot.R', 'toe.R'].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  arms: new Set([
    'upper_arm.L', 'forearm.L', 'hand.L',
    'upper_arm.R', 'forearm.R', 'hand.R',
  ].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
  legs: new Set([
    'thigh.L', 'shin.L', 'foot.L', 'toe.L',
    'thigh.R', 'shin.R', 'foot.R', 'toe.R',
  ].map((name) => jointIndex.get(name)).filter(Number.isInteger)),
}
const labels = ['torso', 'head', 'hands', 'feet', 'arms', 'legs']
const flags = Object.fromEntries(labels.map((label, index) => [label, 1 << index]))
const triangleCounts = Object.fromEntries(labels.map((label) => [label, 0]))
const occupiedByLabel = Object.fromEntries(labels.map((label) => [label, 0]))
const occupancy = new Uint8Array(resolution * resolution)
const firstTriangle = new Int32Array(resolution * resolution).fill(-1)
const firstFlag = new Uint8Array(resolution * resolution)
const conflictExamples = []
const conflictTriangles = new Set()
const jointItemSize = jointAccessor.getElementSize()
const weightItemSize = weightAccessor.getElementSize()

const semanticWeight = (vertex, set) => {
  let result = 0
  for (let component = 0; component < weightItemSize; component++) {
    if (set.has(joints[vertex * jointItemSize + component])) {
      result += weights[vertex * weightItemSize + component]
    }
  }
  return result
}

const classify = (triangle) => {
  for (const label of ['head', 'hands', 'feet', 'arms', 'legs']) {
    const average = triangle.reduce(
      (total, vertex) => total + semanticWeight(vertex, semanticJoints[label]),
      0,
    ) / 3
    const threshold = label === 'arms' || label === 'legs' ? 0.30 : 0.35
    if (average >= threshold) return label
  }
  return 'torso'
}

const rasterize = (triangle, triangleIndex, label) => {
  const points = triangle.map((vertex) => ({
    x: uvs[vertex * 2] * resolution,
    y: (1 - uvs[vertex * 2 + 1]) * resolution,
  }))
  const denominator = (points[1].y - points[2].y) * (points[0].x - points[2].x)
    + (points[2].x - points[1].x) * (points[0].y - points[2].y)
  if (Math.abs(denominator) < 1e-10) return
  const minX = Math.max(0, Math.floor(Math.min(...points.map(({ x }) => x))))
  const maxX = Math.min(resolution - 1, Math.ceil(Math.max(...points.map(({ x }) => x))))
  const minY = Math.max(0, Math.floor(Math.min(...points.map(({ y }) => y))))
  const maxY = Math.min(resolution - 1, Math.ceil(Math.max(...points.map(({ y }) => y))))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const sampleX = x + 0.5
      const sampleY = y + 0.5
      const w0 = ((points[1].y - points[2].y) * (sampleX - points[2].x)
        + (points[2].x - points[1].x) * (sampleY - points[2].y)) / denominator
      const w1 = ((points[2].y - points[0].y) * (sampleX - points[2].x)
        + (points[0].x - points[2].x) * (sampleY - points[2].y)) / denominator
      const w2 = 1 - w0 - w1
      // Ignore exact shared edges. They are legal adjacency, not overlapping area.
      if (w0 <= 1e-6 || w1 <= 1e-6 || w2 <= 1e-6) continue
      const pixel = y * resolution + x
      if (firstTriangle[pixel] < 0) {
        firstTriangle[pixel] = triangleIndex
        firstFlag[pixel] = flags[label]
      } else if (firstFlag[pixel] !== flags[label]
        && !(occupancy[pixel] & flags[label])) {
        conflictTriangles.add(firstTriangle[pixel])
        conflictTriangles.add(triangleIndex)
        if (conflictExamples.length < 20) {
          conflictExamples.push({
            pixel: [x, y],
            firstTriangle: firstTriangle[pixel],
            firstLabel: labels[Math.log2(firstFlag[pixel])],
            triangle: triangleIndex,
            label,
          })
        }
      }
      occupancy[pixel] |= flags[label]
    }
  }
}

for (let offset = 0; offset < indices.length; offset += 3) {
  const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]]
  const label = classify(triangle)
  triangleCounts[label]++
  rasterize(triangle, offset / 3, label)
}

let occupiedPixels = 0
let crossSemanticPixels = 0
const conflictPairs = {}
for (const bits of occupancy) {
  if (!bits) continue
  occupiedPixels++
  for (const label of labels) {
    if (bits & flags[label]) occupiedByLabel[label]++
  }
  const present = labels.filter((label) => bits & flags[label])
  if (present.length <= 1) continue
  crossSemanticPixels++
  for (let a = 0; a < present.length; a++) {
    for (let b = a + 1; b < present.length; b++) {
      const pair = `${present[a]}:${present[b]}`
      conflictPairs[pair] = (conflictPairs[pair] ?? 0) + 1
    }
  }
}

const crossSemanticFraction = occupiedPixels ? crossSemanticPixels / occupiedPixels : 1
const report = {
  schemaVersion: 1,
  input,
  resolution,
  passed: crossSemanticPixels === 0,
  checks: {
    uvRange: [...uvs].every((value) => value >= 0 && value <= 1),
    semanticIsolation: crossSemanticPixels === 0,
  },
  metrics: {
    triangles: indices.length / 3,
    triangleCounts,
    occupiedPixels,
    occupiedByLabel,
    crossSemanticPixels,
    crossSemanticFraction,
    conflictPairs,
    conflictTriangles: [...conflictTriangles].sort((a, b) => a - b),
    conflictExamples,
  },
  note: 'Any cross-semantic overlap is release-blocking because a face, hand, or boot repaint could alter an unrelated surface.',
}
report.passed = Object.values(report.checks).every(Boolean)
await fs.mkdir(path.dirname(output), { recursive: true })
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
