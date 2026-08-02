import type { ZoneWorkspace, ZoneWorkspaceSpawn } from '@libra/libra/types'

type BabylonApi = typeof import('@bjs').default
type BabylonArcRotateCamera = InstanceType<BabylonApi['ArcRotateCamera']>
type BabylonAssetContainer = InstanceType<BabylonApi['AssetContainer']>
type BabylonAbstractMesh = InstanceType<BabylonApi['AbstractMesh']>
type BabylonMesh = InstanceType<BabylonApi['Mesh']>

export interface RuntimePoint {
  x: number
  y: number
  z: number
}

export interface ZoneSpawnViewer {
  dispose(): void
  setDraft(point: RuntimePoint | null): void
  setSpawns(spawns: ZoneWorkspaceSpawn[]): void
}

export async function createZoneSpawnViewer(
  canvas: HTMLCanvasElement,
  workspace: ZoneWorkspace,
  onPick: (point: RuntimePoint) => void,
  onStatus: (status: string) => void,
): Promise<ZoneSpawnViewer> {
  const BABYLON = (await import('@bjs')).default
  await BABYLON.loadFeature('gltf')

  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  })
  const scene = new BABYLON.Scene(engine)
  scene.useRightHandedSystem = true
  scene.clearColor = new BABYLON.Color4(0.025, 0.04, 0.065, 1)

  const camera = new BABYLON.ArcRotateCamera(
    'LibraZoneCamera',
    -Math.PI / 2,
    Math.PI / 3,
    220,
    BABYLON.Vector3.Zero(),
    scene,
  )
  camera.lowerRadiusLimit = 3
  camera.upperRadiusLimit = 5_000
  camera.wheelPrecision = 10
  camera.attachControl(canvas, true)

  const ambient = new BABYLON.HemisphericLight(
    'LibraZoneAmbient',
    new BABYLON.Vector3(0, 1, 0),
    scene,
  )
  ambient.intensity = 1.15
  const sun = new BABYLON.DirectionalLight(
    'LibraZoneSun',
    new BABYLON.Vector3(-0.45, -0.8, -0.3),
    scene,
  )
  sun.intensity = 1.5

  onStatus('Loading authoring preview…')
  const { bytes, source } = await fetchZoneAsset(workspace)
  const blobUrl = URL.createObjectURL(
    new Blob([bytes], { type: 'model/gltf-binary' }),
  )
  let container: BabylonAssetContainer
  try {
    container = await BABYLON.LoadAssetContainerAsync(blobUrl, scene, {
      pluginExtension: '.glb',
    })
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
  container.addAllToScene()
  const zoneMeshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0)
  zoneMeshes.forEach((mesh) => {
    mesh.isPickable = true
  })
  focusCamera(camera, zoneMeshes)

  const existingMaterial = new BABYLON.StandardMaterial(
    'LibraExistingSpawnMaterial',
    scene,
  )
  existingMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.8, 0.95)
  existingMaterial.emissiveColor = new BABYLON.Color3(0.03, 0.25, 0.32)
  const draftMaterial = new BABYLON.StandardMaterial(
    'LibraDraftSpawnMaterial',
    scene,
  )
  draftMaterial.diffuseColor = new BABYLON.Color3(1, 0.65, 0.08)
  draftMaterial.emissiveColor = new BABYLON.Color3(0.45, 0.18, 0.01)

  let spawnMarkers: BabylonMesh[] = []
  let draftMarker: BabylonMesh | null = null
  const setSpawns = (spawns: ZoneWorkspaceSpawn[]) => {
    spawnMarkers.forEach((marker) => marker.dispose())
    spawnMarkers = spawns.map((spawn) => {
      const marker = BABYLON.MeshBuilder.CreateSphere(
        `LibraSpawn:${spawn.id}`,
        { diameter: 3, segments: 10 },
        scene,
      )
      marker.position.set(spawn.x, spawn.y + 1.5, spawn.z)
      marker.material = existingMaterial
      marker.isPickable = false
      marker.metadata = { spawn }
      return marker
    })
  }
  const setDraft = (point: RuntimePoint | null) => {
    if (!point) {
      draftMarker?.dispose()
      draftMarker = null
      return
    }
    const marker = draftMarker ?? BABYLON.MeshBuilder.CreateSphere(
      'LibraSpawnDraft',
      { diameter: 4, segments: 12 },
      scene,
    )
    draftMarker = marker
    marker.material = draftMaterial
    marker.isPickable = false
    marker.position.set(point.x, point.y + 2, point.z)
  }
  setSpawns(workspace.spawns)

  const pointerObserver = scene.onPointerObservable.add((event) => {
    const pick = event.pickInfo
    if (
      event.type !== BABYLON.PointerEventTypes.POINTERPICK
      || !pick?.hit
      || !pick.pickedPoint
      || !pick.pickedMesh
      || !zoneMeshes.includes(pick.pickedMesh)
    ) return
    onPick({
      x: roundCoordinate(pick.pickedPoint.x),
      y: roundCoordinate(pick.pickedPoint.y),
      z: roundCoordinate(pick.pickedPoint.z),
    })
  })

  const resize = () => engine.resize()
  window.addEventListener('resize', resize)
  engine.runRenderLoop(() => scene.render())
  onStatus(
    source === workspace.asset.authoringPreview
      ? 'Authoring preview · click geometry to place'
      : 'Runtime package fallback · click geometry to place',
  )

  return {
    dispose() {
      window.removeEventListener('resize', resize)
      scene.onPointerObservable.remove(pointerObserver)
      scene.dispose()
      engine.dispose()
    },
    setDraft,
    setSpawns,
  }
}

async function fetchZoneAsset(
  workspace: ZoneWorkspace,
): Promise<{ bytes: ArrayBuffer; source: string }> {
  const preview = await fetch(workspace.asset.authoringPreview)
  if (preview.ok) {
    return {
      bytes: await preview.arrayBuffer(),
      source: workspace.asset.authoringPreview,
    }
  }

  const runtime = await fetch(workspace.asset.runtimePackage)
  if (!runtime.ok) {
    throw new Error(
      `No authoring preview or runtime zone asset was found (${runtime.status})`,
    )
  }
  const decompressed = runtime.body?.pipeThrough(new DecompressionStream('gzip'))
  if (!decompressed) throw new Error('The runtime package could not be decompressed')
  return {
    bytes: await new Response(decompressed).arrayBuffer(),
    source: workspace.asset.runtimePackage,
  }
}

function focusCamera(
  camera: BabylonArcRotateCamera,
  meshes: BabylonAbstractMesh[],
): void {
  const authored = meshes.filter((mesh) =>
    mesh.name.toLowerCase().includes('castle_')
  )
  const subjects = authored.length > 0 ? authored : meshes
  if (subjects.length === 0) return

  subjects[0].computeWorldMatrix(true)
  const firstBounds = subjects[0].getBoundingInfo().boundingBox
  const minimum = firstBounds.minimumWorld.clone()
  const maximum = firstBounds.maximumWorld.clone()
  for (const mesh of subjects.slice(1)) {
    mesh.computeWorldMatrix(true)
    const bounds = mesh.getBoundingInfo().boundingBox
    minimum.minimizeInPlace(bounds.minimumWorld)
    maximum.maximizeInPlace(bounds.maximumWorld)
  }
  const center = minimum.add(maximum).scale(0.5)
  const extent = maximum.subtract(minimum)
  camera.setTarget(center)
  camera.radius = Math.max(40, extent.length() * 0.7)
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100
}
