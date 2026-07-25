#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { EXTTextureWebP, KHRMaterialsSpecular } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'

function parseArguments(argv) {
  const options = { preserve: new Set() }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--painted') options.painted = argv[++index]
    else if (value === '--animations') options.animations = argv[++index]
    else if (value === '--output') options.output = argv[++index]
    else if (value === '--preserve') {
      for (const name of argv[++index].split(',').map((entry) => entry.trim()).filter(Boolean)) {
        options.preserve.add(name)
      }
    }
    else throw new Error(`Unknown argument: ${value}`)
  }
  if (!options.painted || !options.animations || !options.output) {
    throw new Error(
      'Usage: merge-humanoid-animations.mjs --painted painted.glb ' +
      '--animations animated.glb --output output.glb [--preserve Idle,Walk,Run]',
    )
  }
  return options
}

function copyAccessor(document, source, buffer) {
  const sourceArray = source.getArray()
  if (!sourceArray) throw new Error(`Animation accessor ${source.getName() || '<unnamed>'} has no array`)
  return document.createAccessor(source.getName())
    .setType(source.getType())
    .setNormalized(source.getNormalized())
    .setArray(new sourceArray.constructor(sourceArray))
    .setBuffer(buffer)
    .setExtras(source.getExtras())
}

const options = parseArguments(process.argv.slice(2))
const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMaterialsSpecular])
const [painted, animated] = await Promise.all([
  io.read(path.resolve(options.painted)),
  io.read(path.resolve(options.animations)),
])
const paintedRoot = painted.getRoot()
const animatedRoot = animated.getRoot()
const targetNodes = new Map()
for (const node of paintedRoot.listNodes()) {
  if (!node.getName()) continue
  if (targetNodes.has(node.getName())) throw new Error(`Painted GLB has duplicate node ${node.getName()}`)
  targetNodes.set(node.getName(), node)
}
for (const animation of paintedRoot.listAnimations()) {
  if (!options.preserve.has(animation.getName())) animation.dispose()
}

const buffer = paintedRoot.listBuffers()[0] ?? painted.createBuffer('animation_buffer')
for (const sourceAnimation of animatedRoot.listAnimations()) {
  if (options.preserve.has(sourceAnimation.getName())) continue
  const targetAnimation = painted.createAnimation(sourceAnimation.getName())
    .setExtras(sourceAnimation.getExtras())
  const samplerMap = new Map()
  for (const sourceSampler of sourceAnimation.listSamplers()) {
    const input = sourceSampler.getInput()
    const output = sourceSampler.getOutput()
    if (!input || !output) throw new Error(`${sourceAnimation.getName()} has an incomplete sampler`)
    const targetSampler = painted.createAnimationSampler(sourceSampler.getName())
      .setInterpolation(sourceSampler.getInterpolation())
      .setInput(copyAccessor(painted, input, buffer))
      .setOutput(copyAccessor(painted, output, buffer))
      .setExtras(sourceSampler.getExtras())
    targetAnimation.addSampler(targetSampler)
    samplerMap.set(sourceSampler, targetSampler)
  }
  for (const sourceChannel of sourceAnimation.listChannels()) {
    const sourceNode = sourceChannel.getTargetNode()
    const targetNode = sourceNode ? targetNodes.get(sourceNode.getName()) : null
    if (!targetNode) {
      throw new Error(`${sourceAnimation.getName()} targets missing node ${sourceNode?.getName() ?? '<null>'}`)
    }
    const targetChannel = painted.createAnimationChannel(sourceChannel.getName())
      .setSampler(samplerMap.get(sourceChannel.getSampler()))
      .setTargetNode(targetNode)
      .setTargetPath(sourceChannel.getTargetPath())
      .setExtras(sourceChannel.getExtras())
    targetAnimation.addChannel(targetChannel)
  }
}

await painted.transform(prune({
  propertyTypes: [PropertyType.ACCESSOR, PropertyType.BUFFER],
  keepExtras: true,
}))
await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
await io.write(path.resolve(options.output), painted)

console.log(JSON.stringify({
  output: path.resolve(options.output),
  animations: paintedRoot.listAnimations().map((animation) => animation.getName()),
  materials: paintedRoot.listMaterials().length,
  textures: paintedRoot.listTextures().length,
  meshes: paintedRoot.listMeshes().length,
  skins: paintedRoot.listSkins().length,
  preservedAnimations: [...options.preserve],
}, null, 2))
