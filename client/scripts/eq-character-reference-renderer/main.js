import * as BABYLON from '@babylonjs/core'
import '@babylonjs/loaders/glTF/index.js'

const canvas = document.querySelector('#render-canvas')
const engine = new BABYLON.Engine(canvas, true, {
  antialias: true,
  preserveDrawingBuffer: true,
  stencil: true,
})
engine.setHardwareScalingLevel(1)

const scene = new BABYLON.Scene(engine)
scene.clearColor = new BABYLON.Color4(1, 1, 1, 1)
scene.ambientColor = new BABYLON.Color3(0.5, 0.5, 0.5)
scene.imageProcessingConfiguration.toneMappingEnabled = true
scene.imageProcessingConfiguration.exposure = 1.12
scene.imageProcessingConfiguration.contrast = 1.04

const fill = new BABYLON.HemisphericLight(
  'character-fill',
  new BABYLON.Vector3(0.25, 1, -0.35),
  scene,
)
fill.intensity = 1.5
fill.groundColor = new BABYLON.Color3(0.72, 0.72, 0.74)

const key = new BABYLON.DirectionalLight(
  'character-key',
  new BABYLON.Vector3(-0.45, -0.7, 0.55),
  scene,
)
key.intensity = 1.65

const rim = new BABYLON.DirectionalLight(
  'character-rim',
  new BABYLON.Vector3(0.5, -0.25, -0.7),
  scene,
)
rim.intensity = 0.55

const camera = new BABYLON.FreeCamera(
  'character-camera',
  new BABYLON.Vector3(0, 0, -10),
  scene,
)
camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA
camera.minZ = 0.001
scene.activeCamera = camera

let current = null

function finiteBounds(meshes) {
  const min = new BABYLON.Vector3(Infinity, Infinity, Infinity)
  const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity)
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices() || !mesh.isEnabled()) continue
    mesh.computeWorldMatrix(true)
    mesh.refreshBoundingInfo({ applySkeleton: true, applyMorph: true })
    const box = mesh.getBoundingInfo().boundingBox
    min.minimizeInPlace(box.minimumWorld)
    max.maximizeInPlace(box.maximumWorld)
  }
  if (![...min.asArray(), ...max.asArray()].every(Number.isFinite)) {
    throw new Error('Character assembly has no finite render bounds')
  }
  return { min, max }
}

function disposeCurrent() {
  if (!current) return
  for (const container of current.containers) {
    container.removeAllFromScene()
    container.dispose()
  }
  current = null
}

function freezePose(container, pose) {
  for (const group of container.animationGroups) group.stop()
  const group = container.animationGroups.find(
    (candidate) => candidate.name.toLowerCase() === pose.toLowerCase(),
  )
  if (!group) {
    for (const skeleton of container.skeletons) {
      skeleton.returnToRest()
      skeleton.prepare(true)
      skeleton.computeAbsoluteMatrices(true)
    }
    return null
  }
  group.start(false, 1, group.from, group.to, false)
  group.goToFrame(group.from)
  group.pause()
  return { name: group.name, from: group.from, to: group.to }
}

async function load({ bodyUrl, headUrl, pose = 'pos' }) {
  disposeCurrent()
  const body = await BABYLON.LoadAssetContainerAsync(bodyUrl, scene, {
    pluginExtension: '.glb',
  })
  const head = await BABYLON.LoadAssetContainerAsync(headUrl, scene, {
    pluginExtension: '.glb',
  })
  body.addAllToScene()
  head.addAllToScene()

  const bodyPose = freezePose(body, pose)
  const headPose = freezePose(head, 'pos')
  await scene.whenReadyAsync()
  for (let index = 0; index < 12; index++) scene.render()

  const meshes = [...body.meshes, ...head.meshes]
    .filter((mesh) => mesh.getTotalVertices() > 0)
  const bounds = finiteBounds(meshes)
  const center = BABYLON.Vector3.Center(bounds.min, bounds.max)
  const size = bounds.max.subtract(bounds.min)
  current = {
    containers: [body, head],
    meshes,
    bounds,
    center,
    size,
  }
  return {
    pose: { body: bodyPose, head: headPose },
    bounds: { min: bounds.min.asArray(), max: bounds.max.asArray() },
    size: size.asArray(),
    meshCount: meshes.length,
    vertexCount: meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0),
    triangleCount: meshes.reduce(
      (total, mesh) => total + Math.floor((mesh.getTotalIndices() || 0) / 3),
      0,
    ),
    materials: meshes.map((mesh) => mesh.material?.name).filter(Boolean),
    skeletons: [body, head].map((container) =>
      container.skeletons.map((skeleton) => ({
        name: skeleton.name,
        bones: skeleton.bones.map((bone) => bone.name),
      })),
    ),
  }
}

function setView(name) {
  if (!current) throw new Error('Load a character before choosing a view')
  const directions = {
    // Classic EQ player models are authored facing +X.
    front: new BABYLON.Vector3(1, 0.02, 0),
    threeQuarter: new BABYLON.Vector3(1, 0.08, -0.7),
    side: new BABYLON.Vector3(0, 0.02, -1),
    back: new BABYLON.Vector3(-1, 0.02, 0),
  }
  const direction = directions[name]
  if (!direction) throw new Error(`Unknown character view: ${name}`)
  direction.normalize()

  const { center, size } = current
  const maxSpan = Math.max(...size.asArray(), 0.01)
  const distance = maxSpan * 3.5 + 1
  camera.position.copyFrom(center.add(direction.scale(distance)))
  camera.setTarget(center)

  const aspect = engine.getRenderWidth() / engine.getRenderHeight()
  const up = BABYLON.Vector3.Up()
  const right = BABYLON.Vector3.Cross(up, direction).normalize()
  const projectedWidth = Math.abs(right.x) * size.x
    + Math.abs(right.y) * size.y
    + Math.abs(right.z) * size.z
  const projectedHeight = Math.abs(up.x) * size.x
    + Math.abs(up.y) * size.y
    + Math.abs(up.z) * size.z
  const halfHeight = Math.max(
    projectedHeight * 0.57,
    projectedWidth / aspect * 0.57,
    maxSpan * 0.08,
  )
  camera.orthoLeft = -halfHeight * aspect
  camera.orthoRight = halfHeight * aspect
  camera.orthoTop = halfHeight
  camera.orthoBottom = -halfHeight
  camera.maxZ = distance * 5

  for (let index = 0; index < 10; index++) scene.render()
  return { view: name, camera: camera.position.asArray(), target: center.asArray() }
}

window.__EQ_CHARACTER_RENDERER__ = { load, setView, disposeCurrent }
window.__EQ_CHARACTER_RENDERER_STATE__ = { status: 'ready' }
engine.runRenderLoop(() => scene.render())
