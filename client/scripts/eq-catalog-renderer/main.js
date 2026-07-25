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
scene.ambientColor = new BABYLON.Color3(0.42, 0.42, 0.42)
scene.imageProcessingConfiguration.toneMappingEnabled = true
scene.imageProcessingConfiguration.exposure = 1.08
scene.imageProcessingConfiguration.contrast = 1.03

const hemi = new BABYLON.HemisphericLight(
  'catalog-fill',
  new BABYLON.Vector3(0.25, 1, -0.35),
  scene,
)
hemi.intensity = 1.35
hemi.groundColor = new BABYLON.Color3(0.62, 0.62, 0.64)

const key = new BABYLON.DirectionalLight(
  'catalog-key',
  new BABYLON.Vector3(-0.45, -0.7, 0.55),
  scene,
)
key.intensity = 1.5

const camera = new BABYLON.FreeCamera(
  'catalog-camera',
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
    if (!mesh.getTotalVertices()) continue
    mesh.computeWorldMatrix(true)
    mesh.refreshBoundingInfo({ applySkeleton: true, applyMorph: true })
    const box = mesh.getBoundingInfo().boundingBox
    min.minimizeInPlace(box.minimumWorld)
    max.maximizeInPlace(box.maximumWorld)
  }
  if (![...min.asArray(), ...max.asArray()].every(Number.isFinite)) {
    throw new Error('Reference GLB has no finite render bounds')
  }
  return { min, max }
}

function disposeCurrent() {
  if (!current) return
  current.container.removeAllFromScene()
  current.container.dispose()
  current = null
}

async function load(url) {
  disposeCurrent()
  const pluginExtension = url.toLowerCase().endsWith('.babylon') ? '.babylon' : '.glb'
  const container = await BABYLON.LoadAssetContainerAsync(url, scene, {
    pluginExtension,
  })
  container.addAllToScene()
  for (const group of container.animationGroups) group.stop()
  for (const skeleton of container.skeletons) {
    skeleton.returnToRest()
    skeleton.prepare(true)
    skeleton.computeAbsoluteMatrices(true)
  }
  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0)
  const bounds = finiteBounds(meshes)
  const center = BABYLON.Vector3.Center(bounds.min, bounds.max)
  const size = bounds.max.subtract(bounds.min)
  current = { container, meshes, bounds, center, size }
  await scene.whenReadyAsync()
  for (let index = 0; index < 6; index++) scene.render()
  return {
    bounds: { min: bounds.min.asArray(), max: bounds.max.asArray() },
    size: size.asArray(),
    meshCount: meshes.length,
    vertexCount: meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0),
    triangleCount: meshes.reduce(
      (total, mesh) => total + Math.floor((mesh.getTotalIndices() || 0) / 3),
      0,
    ),
    materialCount: new Set(meshes.map((mesh) => mesh.material?.uniqueId).filter(Boolean)).size,
  }
}

function setView(name) {
  if (!current) throw new Error('Load a reference GLB before choosing a view')
  const directions = {
    front: new BABYLON.Vector3(0, 0.08, -1),
    side: new BABYLON.Vector3(-1, 0.08, 0),
    threeQuarter: new BABYLON.Vector3(-1, 0.55, -1),
  }
  const direction = directions[name]
  if (!direction) throw new Error(`Unknown catalog view: ${name}`)
  direction.normalize()

  const center = current.center
  const size = current.size
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
  const halfHeight = Math.max(projectedHeight * 0.62, projectedWidth / aspect * 0.62, maxSpan * 0.08)
  camera.orthoLeft = -halfHeight * aspect
  camera.orthoRight = halfHeight * aspect
  camera.orthoTop = halfHeight
  camera.orthoBottom = -halfHeight
  camera.maxZ = distance * 5

  for (let index = 0; index < 6; index++) scene.render()
  return { view: name, camera: camera.position.asArray(), target: center.asArray() }
}

window.__EQ_CATALOG_RENDERER__ = { load, setView, disposeCurrent }
window.__EQ_CATALOG_RENDERER_STATE__ = { status: 'ready' }
engine.runRenderLoop(() => scene.render())
