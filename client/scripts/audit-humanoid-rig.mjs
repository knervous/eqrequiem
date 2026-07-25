#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP, KHRMaterialsSpecular } from '@gltf-transform/extensions'

function parseArguments(argv) {
  const options = { maxVertices: 5000 }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--reference') options.reference = argv[++index]
    else if (value === '--target') options.target = argv[++index]
    else if (value === '--output') options.output = argv[++index]
    else if (value === '--max-vertices') options.maxVertices = Number(argv[++index])
    else if (value === '--help') options.help = true
    else throw new Error(`Unknown argument: ${value}`)
  }
  return options
}

function usage() {
  return `Usage: node scripts/audit-humanoid-rig.mjs \\
  --reference reference.glb --target candidate.glb [--output audit.json]

Checks exported topology, skin weights, bone names/hierarchy, inverse-bind matrices,
and animation coverage. Exits non-zero when the candidate is not rig-compatible.`
}

const round = (value) => Math.round(value * 1e6) / 1e6
const rounded = (values) => Array.from(values ?? [], round)
const transformsEqual = (first, second, epsilon = 1e-5) =>
  first.length === second.length && first.every((value, index) =>
    Math.abs(value - second[index]) <= epsilon)

function summarizeDocument(file, document) {
  const root = document.getRoot()
  const primarySkin = root.listNodes().find((node) => node.getMesh() && node.getSkin())?.getSkin()
  const orderedSkins = primarySkin
    ? [primarySkin, ...root.listSkins().filter((skin) => skin !== primarySkin)]
    : root.listSkins()
  const skins = orderedSkins.map((skin, skinIndex) => {
    const joints = skin.listJoints()
    const jointSet = new Set(joints)
    const inverseBindMatrices = skin.getInverseBindMatrices()?.getArray()
    return {
      index: skinIndex,
      name: skin.getName() || `skin_${skinIndex}`,
      skeletonRoot: skin.getSkeleton()?.getName() ?? null,
      jointCount: joints.length,
      inverseBindMatrixCount: inverseBindMatrices ? inverseBindMatrices.length / 16 : 0,
      joints: joints.map((joint, index) => {
        const parent = joint.getParentNode()
        return {
          index,
          name: joint.getName(),
          parent: parent && jointSet.has(parent) ? parent.getName() : null,
          translation: rounded(joint.getTranslation()),
          rotation: rounded(joint.getRotation()),
          scale: rounded(joint.getScale()),
        }
      }),
    }
  })

  let vertices = 0
  let triangles = 0
  let primitiveCount = 0
  let weightedVertices = 0
  let unweightedVertices = 0
  let maxInfluences = 0
  let invalidWeightVertices = 0
  let maximumWeightSumError = 0
  let invalidJointReferences = 0
  let degenerateTriangles = 0
  let invalidTriangleIndices = 0
  const positionIds = new Map()
  const triangleVertices = []
  let nextPositionId = 0
  const positionKey = (array, index) => {
    const offset = index * 3
    return `${Math.round(array[offset] * 1e6)},${Math.round(array[offset + 1] * 1e6)},${Math.round(array[offset + 2] * 1e6)}`
  }
  const positionId = (array, index) => {
    const key = positionKey(array, index)
    if (!positionIds.has(key)) positionIds.set(key, nextPositionId++)
    return positionIds.get(key)
  }
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      primitiveCount++
      const position = primitive.getAttribute('POSITION')
      if (!position) continue
      const count = position.getCount()
      vertices += count
      const indices = primitive.getIndices()
      triangles += indices ? indices.getCount() / 3 : count / 3
      const positions = position.getArray()
      const indexValues = indices?.getArray() ?? Uint32Array.from({ length: count }, (_, index) => index)
      for (let offset = 0; offset + 2 < indexValues.length; offset += 3) {
        const raw = [indexValues[offset], indexValues[offset + 1], indexValues[offset + 2]]
        if (raw.some((index) => index < 0 || index >= count)) {
          invalidTriangleIndices++
          continue
        }
        const ids = raw.map((index) => positionId(positions, index))
        triangleVertices.push(ids)
        const [a, b, c] = raw.map((index) => {
          const start = index * 3
          return [positions[start], positions[start + 1], positions[start + 2]]
        })
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        const cross = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ]
        if (Math.hypot(...cross) <= 1e-10 || new Set(ids).size < 3) degenerateTriangles++
      }
      const weightSets = [primitive.getAttribute('WEIGHTS_0'), primitive.getAttribute('WEIGHTS_1')]
        .filter(Boolean)
        .map((accessor) => accessor.getArray())
      const jointSets = [primitive.getAttribute('JOINTS_0'), primitive.getAttribute('JOINTS_1')]
        .filter(Boolean)
        .map((accessor) => accessor.getArray())
      if (!weightSets.length) {
        unweightedVertices += count
        continue
      }
      const elementSizes = weightSets.map((array) => array.length / count)
      for (let vertex = 0; vertex < count; vertex++) {
        let sum = 0
        let influences = 0
        for (let set = 0; set < weightSets.length; set++) {
          const array = weightSets[set]
          const size = elementSizes[set]
          for (let component = 0; component < size; component++) {
            const weight = array[vertex * size + component]
            sum += weight
            if (weight > 1e-6) influences++
            const joint = jointSets[set]?.[vertex * size + component]
            if (weight > 1e-6 && (!Number.isInteger(joint) || joint < 0 || joint >= (skins[0]?.jointCount ?? 0))) {
              invalidJointReferences++
            }
          }
        }
        if (sum > 1e-5) weightedVertices++
        else unweightedVertices++
        const error = Math.abs(sum - 1)
        maximumWeightSumError = Math.max(maximumWeightSumError, error)
        if (!Number.isFinite(sum) || error > 1e-4) invalidWeightVertices++
        maxInfluences = Math.max(maxInfluences, influences)
      }
    }
  }

  const edgeUse = new Map()
  const adjacency = Array.from({ length: nextPositionId }, () => new Set())
  for (const [a, b, c] of triangleVertices) {
    for (const [first, second] of [[a, b], [b, c], [c, a]]) {
      if (first === second) continue
      const low = Math.min(first, second)
      const high = Math.max(first, second)
      const key = `${low}:${high}`
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
      adjacency[first].add(second)
      adjacency[second].add(first)
    }
  }
  let connectedComponents = 0
  const visited = new Set()
  for (let start = 0; start < adjacency.length; start++) {
    if (visited.has(start) || adjacency[start].size === 0) continue
    connectedComponents++
    const stack = [start]
    visited.add(start)
    while (stack.length) {
      const current = stack.pop()
      for (const neighbor of adjacency[current]) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        stack.push(neighbor)
      }
    }
  }

  const animations = root.listAnimations().map((animation) => {
    let duration = 0
    for (const sampler of animation.listSamplers()) {
      const times = sampler.getInput()?.getArray()
      if (times?.length) duration = Math.max(duration, times[times.length - 1])
    }
    return {
      name: animation.getName(),
      durationSeconds: round(duration),
      channels: animation.listChannels().length,
      targets: [...new Set(animation.listChannels().map((channel) =>
        channel.getTargetNode()?.getName()).filter(Boolean))].sort(),
    }
  })

  return {
    file: path.resolve(file),
    meshes: root.listMeshes().length,
    primitives: primitiveCount,
    exportedVertices: vertices,
    triangles: Math.round(triangles),
    skins,
    skinCount: skins.length,
    weightedVertices,
    unweightedVertices,
    maxInfluences,
    invalidWeightVertices,
    maximumWeightSumError: round(maximumWeightSumError),
    invalidJointReferences,
    topology: {
      weldedVertices: nextPositionId,
      duplicateAttributeVertices: vertices - nextPositionId,
      connectedComponents,
      boundaryEdges: [...edgeUse.values()].filter((count) => count === 1).length,
      nonManifoldEdges: [...edgeUse.values()].filter((count) => count > 2).length,
      degenerateTriangles,
      invalidTriangleIndices,
    },
    animations,
    animationCount: animations.length,
  }
}

function compare(reference, target, maxVertices) {
  const referenceJoints = reference.skins[0]?.joints ?? []
  const targetJoints = target.skins[0]?.joints ?? []
  const referenceByName = new Map(referenceJoints.map((joint) => [joint.name, joint]))
  const targetByName = new Map(targetJoints.map((joint) => [joint.name, joint]))
  const missingJoints = referenceJoints.map((joint) => joint.name).filter((name) => !targetByName.has(name))
  const extraJoints = targetJoints.map((joint) => joint.name).filter((name) => !referenceByName.has(name))
  const parentMismatches = []
  const transformMismatches = []
  for (const [name, referenceJoint] of referenceByName) {
    const targetJoint = targetByName.get(name)
    if (!targetJoint) continue
    if (targetJoint.parent !== referenceJoint.parent) {
      parentMismatches.push({ name, expected: referenceJoint.parent, actual: targetJoint.parent })
    }
    for (const property of ['translation', 'rotation', 'scale']) {
      if (!transformsEqual(targetJoint[property], referenceJoint[property])) {
        transformMismatches.push({ name, property, expected: referenceJoint[property], actual: targetJoint[property] })
      }
    }
  }
  const targetAnimations = new Set(target.animations.map((animation) => animation.name))
  const referenceAnimations = new Set(reference.animations.map((animation) => animation.name))
  const missingAnimations = [...referenceAnimations].filter((name) => !targetAnimations.has(name))
  const extraAnimations = [...targetAnimations].filter((name) => !referenceAnimations.has(name))
  const requiredAnimations = ['Idle', 'Walk', 'Run']
  const checks = {
    exactlyOneMesh: target.meshes === 1,
    exactlyOnePrimitive: target.primitives === 1,
    exactlyOneSkin: target.skinCount === 1,
    vertexBudget: target.exportedVertices <= maxVertices,
    closedSingleComponentSurface: target.topology.connectedComponents === 1
      && target.topology.boundaryEdges === 0
      && target.topology.nonManifoldEdges === 0,
    validTriangles: target.topology.degenerateTriangles === 0
      && target.topology.invalidTriangleIndices === 0,
    allVerticesWeighted: target.unweightedVertices === 0,
    weightsNormalized: target.invalidWeightVertices === 0,
    maximumFourInfluences: target.maxInfluences <= 4,
    jointIndicesValid: target.invalidJointReferences === 0,
    jointNamesMatch: missingJoints.length === 0 && extraJoints.length === 0,
    jointParentsMatch: parentMismatches.length === 0,
    jointRestTransformsMatch: transformMismatches.length === 0,
    inverseBindMatricesValid: target.skins[0]?.inverseBindMatrixCount === target.skins[0]?.jointCount,
    referenceAnimationsPresent: missingAnimations.length === 0,
    priorityAnimationsPresent: requiredAnimations.every((name) => targetAnimations.has(name)),
    animationDurationsValid: target.animations.every((animation) => animation.durationSeconds > 0),
  }
  return {
    compatible: Object.values(checks).every(Boolean),
    maxVertices,
    checks,
    warnings: [],
    missingJoints,
    extraJoints,
    parentMismatches,
    transformMismatches,
    missingAnimations,
    extraAnimations,
  }
}

export async function auditHumanoidRig({ reference: referenceFile, target: targetFile, maxVertices = 5000 }) {
  const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMaterialsSpecular])
  const [referenceDocument, targetDocument] = await Promise.all([
    io.read(path.resolve(referenceFile)),
    io.read(path.resolve(targetFile)),
  ])
  const reference = summarizeDocument(referenceFile, referenceDocument)
  const target = summarizeDocument(targetFile, targetDocument)
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reference,
    target,
    comparison: compare(reference, target, maxVertices),
  }
}

const options = parseArguments(process.argv.slice(2))
if (options.help || !options.reference || !options.target) {
  console.log(usage())
  process.exitCode = options.help ? 0 : 1
} else {
  const report = await auditHumanoidRig(options)
  const json = `${JSON.stringify(report, null, 2)}\n`
  if (options.output) {
    await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
    await fs.writeFile(path.resolve(options.output), json)
  }
  if (options.output) {
    console.log(JSON.stringify({
      output: path.resolve(options.output),
      compatible: report.comparison.compatible,
      checks: report.comparison.checks,
    }, null, 2))
  } else {
    console.log(json)
  }
  if (!report.comparison.compatible) process.exitCode = 2
}
