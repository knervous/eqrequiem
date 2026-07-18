#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP, KHRMaterialsSpecular } from '@gltf-transform/extensions'
import { copyToDocument, prune, unpartition } from '@gltf-transform/functions'

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reference') out.reference = argv[++i]
    else if (argv[i] === '--candidate') out.candidate = argv[++i]
    else if (argv[i] === '--output') out.output = argv[++i]
    else if (argv[i] === '--yaw-degrees') out.yawDegrees = Number(argv[++i])
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  if (!out.reference || !out.candidate || !out.output) {
    throw new Error('Required: --reference source.glb --candidate blender.glb --output rigged.glb')
  }
  return out
}

const options = args(process.argv.slice(2))
const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMaterialsSpecular])
const [reference, candidate] = await Promise.all([
  io.read(path.resolve(options.reference)),
  io.read(path.resolve(options.candidate)),
])
const referenceNode = reference.getRoot().listNodes().find((node) => node.getMesh() && node.getSkin())
const candidateNode = candidate.getRoot().listNodes().find((node) => node.getMesh() && node.getSkin())
if (!referenceNode || !candidateNode) throw new Error('Both files must contain a skinned mesh node')

const referenceSkin = referenceNode.getSkin()
const candidateSkin = candidateNode.getSkin()
const referenceJointIndex = new Map(referenceSkin.listJoints().map((joint, index) => [joint.getName(), index]))
const jointRemap = candidateSkin.listJoints().map((joint) => {
  const mapped = referenceJointIndex.get(joint.getName())
  // HUM's visible body skin omits the unused guild attachment present on its
  // sibling source skin. Its zero-weight JOINT slots can safely resolve to root.
  if (mapped === undefined && joint.getName() === 'guild_point') return 0
  if (mapped === undefined) throw new Error(`Candidate joint is absent from reference: ${joint.getName()}`)
  return mapped
})
for (const primitive of candidateNode.getMesh().listPrimitives()) {
  for (const semantic of ['JOINTS_0', 'JOINTS_1']) {
    const accessor = primitive.getAttribute(semantic)
    if (!accessor) continue
    const values = accessor.getArray()
    for (let index = 0; index < values.length; index++) values[index] = jointRemap[values[index]]
  }
}

for (const extension of candidate.getRoot().listExtensionsUsed()) {
  if (!reference.getRoot().listExtensionsUsed().some((item) => item.extensionName === extension.extensionName)) {
    reference.createExtension(extension.constructor).setRequired(extension.isRequired())
  }
}
const copied = copyToDocument(reference, candidate, [candidateNode.getMesh()])
referenceNode.setMesh(copied.get(candidateNode.getMesh()))
if (options.yawDegrees) {
  const radians = options.yawDegrees * Math.PI / 180
  for (const scene of reference.getRoot().listScenes()) {
    const children = scene.listChildren()
    const correction = reference.createNode('EQREF_Forward_Correction')
      .setRotation([0, Math.sin(radians / 2), 0, Math.cos(radians / 2)])
    for (const child of children) correction.addChild(child)
    scene.addChild(correction)
  }
}
await reference.transform(prune(), unpartition())
await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
await io.write(path.resolve(options.output), reference)
console.log(JSON.stringify({
  output: path.resolve(options.output),
  joints: referenceSkin.listJoints().map((joint) => joint.getName()),
  animations: reference.getRoot().listAnimations().length,
  vertices: referenceNode.getMesh().listPrimitives().reduce(
    (sum, primitive) => sum + primitive.getAttribute('POSITION').getCount(), 0),
}, null, 2))
