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
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      primitiveCount++
      const position = primitive.getAttribute('POSITION')
      if (!position) continue
      const count = position.getCount()
      vertices += count
      const indices = primitive.getIndices()
      triangles += indices ? indices.getCount() / 3 : count / 3
      const weightSets = [primitive.getAttribute('WEIGHTS_0'), primitive.getAttribute('WEIGHTS_1')]
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
          }
        }
        if (sum > 1e-5) weightedVertices++
        else unweightedVertices++
        maxInfluences = Math.max(maxInfluences, influences)
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
      if (JSON.stringify(targetJoint[property]) !== JSON.stringify(referenceJoint[property])) {
        transformMismatches.push({ name, property, expected: referenceJoint[property], actual: targetJoint[property] })
      }
    }
  }
  const targetAnimations = new Set(target.animations.map((animation) => animation.name))
  const referenceAnimations = new Set(reference.animations.map((animation) => animation.name))
  const missingAnimations = [...referenceAnimations].filter((name) => !targetAnimations.has(name))
  const extraAnimations = [...targetAnimations].filter((name) => !referenceAnimations.has(name))
  const checks = {
    hasSkin: target.skinCount >= 1,
    vertexBudget: target.exportedVertices <= maxVertices,
    allVerticesWeighted: target.unweightedVertices === 0,
    maximumFourInfluences: target.maxInfluences <= 4,
    jointNamesMatch: missingJoints.length === 0 && extraJoints.length === 0,
    jointParentsMatch: parentMismatches.length === 0,
    jointRestTransformsMatch: transformMismatches.length === 0,
    inverseBindMatricesValid: [0, target.skins[0]?.jointCount]
      .includes(target.skins[0]?.inverseBindMatrixCount),
    referenceAnimationsPresent: missingAnimations.length === 0,
  }
  const criticalChecks = Object.fromEntries(
    Object.entries(checks).filter(([name]) => name !== 'jointRestTransformsMatch'),
  )
  return {
    compatible: Object.values(criticalChecks).every(Boolean),
    maxVertices,
    checks,
    warnings: transformMismatches.length
      ? ['Non-deforming attachment-node rest transforms changed during Blender round-trip.']
      : [],
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
