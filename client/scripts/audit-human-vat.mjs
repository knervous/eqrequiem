#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import * as BABYLON from '@babylonjs/core/index.js'
import '@babylonjs/loaders/glTF/index.js'

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const repoRoot = path.resolve(import.meta.dirname, '../..')
const source = path.resolve(option('source', ''))
const model = option('model', source.includes('human_female') ? 'huf' : 'hum')
const runtimeRoot = path.resolve(option(
  'runtime-root',
  path.join(repoRoot, 'client/public/eqrequiem'),
))
const output = option('output') ? path.resolve(option('output')) : null
const tolerance = Number(option('tolerance', '0.00001'))
if (!option('source')) {
  throw new Error('Usage: audit-human-vat.mjs --source model.glb --model hum|huf [--output report.json]')
}

const [sourceBytes, sceneBytes, rangesText, vatCompressed] = await Promise.all([
  fs.readFile(source),
  fs.readFile(path.join(runtimeRoot, `babylon/${model}.babylon.gz`)),
  fs.readFile(path.join(runtimeRoot, `vat/${model}.json`), 'utf8'),
  fs.readFile(path.join(runtimeRoot, `vat/${model}_32.bin.gz`)),
])
const installedScene = JSON.parse(gunzipSync(sceneBytes))
const installedRanges = JSON.parse(rangesText)
const metadata = installedScene.meshes.find((mesh) => mesh.name === model)?.metadata?.gltf?.extras
if (!metadata) throw new Error(`Installed ${model} scene has no runtime metadata`)
const vatBuffer = gunzipSync(vatCompressed)
const installedVat = new Float32Array(
  vatBuffer.buffer.slice(vatBuffer.byteOffset, vatBuffer.byteOffset + vatBuffer.byteLength),
)

const engine = new NullEngine()
const scene = new Scene(engine)
scene.activeCamera = new BABYLON.FreeCamera(
  'vat_audit_camera',
  new BABYLON.Vector3(0, 0, -10),
  scene,
)
const dataUrl = `data:model/gltf-binary;base64,${sourceBytes.toString('base64')}`
const imported = await BABYLON.ImportMeshAsync(dataUrl, scene, { pluginExtension: '.glb' })
const animatedMeshes = imported.meshes.filter((mesh) => mesh.getTotalVertices() > 0)
const mergedMesh = BABYLON.Mesh.MergeMeshes(animatedMeshes, true, true, undefined, true, true)
const skeleton = imported.skeletons[0]
if (!mergedMesh || !skeleton) throw new Error('Source GLB has no mergeable skinned mesh')
mergedMesh.skeleton = skeleton

const alignment = BABYLON.Matrix.Scaling(
  metadata.runtimeScale,
  metadata.runtimeScale,
  metadata.runtimeScale,
).multiply(BABYLON.Matrix.RotationY(metadata.runtimeYawCorrection))
const floatsPerFrame = (skeleton.bones.length + 1) * 16
const expectedFrames = installedRanges.animations.reduce(
  (total, range) => total + range.to - range.from + 1,
  0,
)
const failures = []
if (installedVat.length !== expectedFrames * floatsPerFrame) {
  failures.push(
    `VAT length ${installedVat.length} does not match ${expectedFrames * floatsPerFrame}`,
  )
}

let installedFrame = 0
let maximumAbsoluteError = 0
let mismatchedValues = 0
const clips = []
for (const group of imported.animationGroups) {
  const range = installedRanges.animations.find((candidate) => candidate.name === group.name)
  if (!range) {
    failures.push(`Installed VAT is missing ${group.name}`)
    continue
  }
  const engineFps = group.targetedAnimations[0]?.animation.framePerSecond ?? 30
  const frameStep = engineFps / (range.fps ?? installedRanges.fps ?? 30)
  const frames = []
  for (let frame = group.from; frame <= group.to + 1e-6; frame += frameStep) frames.push(frame)
  const installedCount = range.to - range.from + 1
  if (frames.length !== installedCount) {
    failures.push(`${group.name} has ${frames.length} source frames but ${installedCount} installed frames`)
  }
  skeleton.returnToRest()
  group.reset()
  group.play(true)
  group.pause()
  let clipMaximumError = 0
  for (const frame of frames) {
    group.goToFrame(frame)
    skeleton.prepare(true)
    mergedMesh.computeWorldMatrix(true)
    skeleton.computeAbsoluteMatrices(true)
    const matrices = skeleton.getTransformMatrices(mergedMesh)
    for (let matrixOffset = 0; matrixOffset < matrices.length; matrixOffset += 16) {
      const expected = BABYLON.Matrix.FromArray(matrices, matrixOffset).multiply(alignment)
      for (let component = 0; component < 16; component++) {
        const index = installedFrame * floatsPerFrame + matrixOffset + component
        const error = Math.abs((installedVat[index] ?? Number.NaN) - expected.m[component])
        maximumAbsoluteError = Math.max(maximumAbsoluteError, error)
        clipMaximumError = Math.max(clipMaximumError, error)
        if (!Number.isFinite(error) || error > tolerance) mismatchedValues++
      }
    }
    installedFrame++
  }
  group.stop()
  clips.push({
    name: group.name,
    sourceFrames: frames.length,
    installedFrames: installedCount,
    maximumAbsoluteError: clipMaximumError,
  })
}
if (installedFrame !== expectedFrames) {
  failures.push(`Audited ${installedFrame} frames but the VAT declares ${expectedFrames}`)
}
if (mismatchedValues) failures.push(`${mismatchedValues} VAT values exceed ${tolerance}`)

const report = {
  schemaVersion: 1,
  source,
  model,
  runtimeRoot,
  passed: failures.length === 0,
  tolerance,
  skeletonBones: skeleton.bones.length,
  floatsPerFrame,
  expectedFrames,
  installedFrames: installedVat.length / floatsPerFrame,
  maximumAbsoluteError,
  mismatchedValues,
  clips,
  failures,
}
if (output) {
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
}
console.log(JSON.stringify(report, null, 2))
engine.dispose()
if (!report.passed) process.exitCode = 2
