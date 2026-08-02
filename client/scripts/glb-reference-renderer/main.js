import * as BABYLON from '@babylonjs/core'
// Register the complete glTF loader, including the glTF 2.0 implementation.
// Importing only glTFFileLoader registers the dispatcher but leaves fresh
// Blender 2.0 exports without a version-specific loader.
import '@babylonjs/loaders/glTF/index.js'

const state = { status: 'loading', models: [] }
window.__REFERENCE_RENDER_STATE__ = state

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
    throw new Error('Model has no finite render bounds')
  }
  return { min, max }
}

function createEdgeBaseline(mesh) {
  const positions = mesh._getData(
    { applySkeleton: true, applyMorph: true, updatePositionsArray: false },
    null,
    BABYLON.VertexBuffer.PositionKind,
  )
  const indices = mesh.getIndices()
  if (!positions || !indices) return null
  const edges = []
  const seen = new Set()
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]]
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const low = Math.min(a, b)
      const high = Math.max(a, b)
      const key = `${low}:${high}`
      if (seen.has(key)) continue
      seen.add(key)
      const offsetA = low * 3
      const offsetB = high * 3
      const dx = positions[offsetA] - positions[offsetB]
      const dy = positions[offsetA + 1] - positions[offsetB + 1]
      const dz = positions[offsetA + 2] - positions[offsetB + 2]
      const length = Math.hypot(dx, dy, dz)
      if (length > 1e-7) edges.push({ a: low, b: high, length })
    }
  }
  return { mesh, edges }
}

function measureEdgeDeformation(baselines) {
  const ratios = []
  for (const baseline of baselines) {
    if (!baseline) continue
    const positions = baseline.mesh._getData(
      { applySkeleton: true, applyMorph: true, updatePositionsArray: false },
      null,
      BABYLON.VertexBuffer.PositionKind,
    )
    for (const edge of baseline.edges) {
      const offsetA = edge.a * 3
      const offsetB = edge.b * 3
      const dx = positions[offsetA] - positions[offsetB]
      const dy = positions[offsetA + 1] - positions[offsetB + 1]
      const dz = positions[offsetA + 2] - positions[offsetB + 2]
      ratios.push(Math.hypot(dx, dy, dz) / edge.length)
    }
  }
  ratios.sort((a, b) => a - b)
  const percentile = (fraction) => ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * fraction))] ?? 1
  return {
    edgeCount: ratios.length,
    minEdgeRatio: ratios[0] ?? 1,
    p01EdgeRatio: percentile(0.01),
    p99EdgeRatio: percentile(0.99),
    maxEdgeRatio: ratios.at(-1) ?? 1,
    extremeEdgeFraction: ratios.filter((ratio) => ratio > 4 || ratio < 0.25).length / Math.max(1, ratios.length),
  }
}

async function run() {
  const params = new URLSearchParams(location.search)
  const modelSpecs = JSON.parse(params.get('models') ?? '[]')
  const poseName = params.get('pose') ?? 'pos'
  const poseFraction = Number(params.get('poseFraction') ?? 0)
  const frontAxis = params.get('frontAxis') ?? '-z'
  const focus = params.get('focus') ?? 'full'
  const auditSamples = Number(params.get('auditSamples') ?? 0)
  const maxSpanRatio = Number(params.get('maxSpanRatio') ?? 1.5)
  const minEdgeRatio = Number(params.get('minEdgeRatio') ?? 0.25)
  const maxEdgeRatio = Number(params.get('maxEdgeRatio') ?? 4)
  const maxP99EdgeRatio = Number(params.get('maxP99EdgeRatio') ?? 2)
  const maxExtremeEdgeFraction = Number(params.get('maxExtremeEdgeFraction') ?? 0.0015)
  if (!Array.isArray(modelSpecs) || !modelSpecs.length) {
    throw new Error('At least one GLB is required')
  }

  const canvas = document.querySelector('#render-canvas')
  const engine = new BABYLON.Engine(canvas, true, {
    antialias: true,
    preserveDrawingBuffer: true,
    stencil: true,
  })
  engine.setHardwareScalingLevel(1)

  const scene = new BABYLON.Scene(engine)
  scene.clearColor = new BABYLON.Color4(0.91, 0.91, 0.895, 1)
  scene.ambientColor = new BABYLON.Color3(0.5, 0.5, 0.5)
  scene.imageProcessingConfiguration.toneMappingEnabled = true
  scene.imageProcessingConfiguration.exposure = 1.15
  scene.imageProcessingConfiguration.contrast = 1.05
  const previewCamera = new BABYLON.FreeCamera(
    'reference-preview-camera',
    new BABYLON.Vector3(0, 1, -10),
    scene,
  )
  previewCamera.setTarget(BABYLON.Vector3.Zero())
  scene.activeCamera = previewCamera

  const hemi = new BABYLON.HemisphericLight(
    'reference-fill',
    new BABYLON.Vector3(0.25, 1, -0.35),
    scene,
  )
  hemi.intensity = 1.25
  hemi.groundColor = new BABYLON.Color3(0.45, 0.45, 0.48)
  const key = new BABYLON.DirectionalLight(
    'reference-key',
    new BABYLON.Vector3(-0.4, -0.65, 0.65),
    scene,
  )
  key.intensity = 1.4

  const entries = []
  for (const [index, spec] of modelSpecs.entries()) {
    const root = new BABYLON.TransformNode(`reference-root-${index}`, scene)
    const containers = []
    const poses = []
    for (const url of spec.urls ?? [spec.url]) {
      const container = await BABYLON.LoadAssetContainerAsync(url, scene, {
        pluginExtension: '.glb',
      })
      container.addAllToScene()
      containers.push(container)
      for (const group of container.animationGroups) group.stop()
      const pose = container.animationGroups.find(
        (group) => group.name.toLowerCase() === poseName.toLowerCase(),
      )
      for (const skeleton of container.skeletons) {
        skeleton.returnToRest()
        skeleton.prepare(true)
        skeleton.computeAbsoluteMatrices(true)
      }
      poses.push(pose)
      for (const node of container.rootNodes) node.parent = root
    }
    scene.render()
    const meshes = containers.flatMap((container) =>
      container.meshes.filter((mesh) => mesh.getTotalVertices() > 0),
    )
    const baselineBounds = finiteBounds(meshes)
    const edgeBaselines = meshes.map(createEdgeBaseline)
    for (const pose of poses.filter(Boolean)) {
      pose.start(false, 1, pose.from, pose.to)
      pose.goToFrame(pose.from + (pose.to - pose.from) * poseFraction)
      pose.pause()
    }
    for (const container of containers) {
      for (const skeleton of container.skeletons) {
        skeleton.prepare(true)
        skeleton.computeAbsoluteMatrices(true)
      }
    }
    const bounds = finiteBounds(meshes)
    entries.push({ containers, root, meshes, bounds, baselineBounds, spec, poses, edgeBaselines })
  }

  const maxHeight = Math.max(...entries.map(({ bounds }) => bounds.max.y - bounds.min.y))
  const gap = maxHeight * 0.16
  const horizontalAxis = frontAxis.endsWith('x') ? 'z' : 'x'
  const depthAxis = horizontalAxis === 'x' ? 'z' : 'x'
  let cursor = 0
  for (const entry of entries) {
    const width = entry.bounds.max[horizontalAxis] - entry.bounds.min[horizontalAxis]
    entry.root.position[horizontalAxis] += cursor - entry.bounds.min[horizontalAxis]
    entry.root.position.y -= entry.bounds.min.y
    entry.root.position[depthAxis] -=
      (entry.bounds.min[depthAxis] + entry.bounds.max[depthAxis]) / 2
    cursor += width + gap
    scene.render()
  }

  const animationAudit = []
  if (auditSamples >= 2) {
    for (const entry of entries) {
      const baselineSize = entry.baselineBounds.max.subtract(entry.baselineBounds.min)
      const baselineMaxSpan = Math.max(...baselineSize.asArray())
      const groups = entry.containers.flatMap((container) => container.animationGroups)
      for (const group of groups) {
        for (const other of groups) other.stop()
        for (const container of entry.containers) {
          for (const skeleton of container.skeletons) skeleton.returnToRest()
        }
        group.start(false, 1, group.from, group.to)
        group.pause()
        let worst = null
        const samples = []
        for (let sample = 0; sample < auditSamples; sample++) {
          const fraction = auditSamples === 1 ? 0 : sample / (auditSamples - 1)
          const frame = group.from + (group.to - group.from) * fraction
          group.goToFrame(frame)
          // scene.render() advances Babylon's own animatable clock and
          // overwrites the pose goToFrame just set (goToFrame alone matches
          // the source curve; a render() afterward stomps it back toward
          // bind pose). prepare() copies each bone's rotation/position from
          // its linked TransformNode (the actual animation target) into the
          // Bone object; computeAbsoluteMatrices alone reads stale/rest
          // values for any bone that hasn't been synced this way.
          for (const container of entry.containers) {
            for (const skeleton of container.skeletons) {
              skeleton.prepare(true)
              skeleton.computeAbsoluteMatrices(true)
            }
          }
          const sampleBounds = finiteBounds(entry.meshes)
          const size = sampleBounds.max.subtract(sampleBounds.min)
          const maxSpan = Math.max(...size.asArray())
          const ratio = maxSpan / baselineMaxSpan
          const edges = measureEdgeDeformation(entry.edgeBaselines)
          const result = {
            fraction,
            frame,
            size: size.asArray(),
            maxSpanRatio: ratio,
            ...edges,
          }
          samples.push(result)
          if (!worst || edges.maxEdgeRatio > worst.maxEdgeRatio) worst = result
        }
        group.stop()
        const failed = samples.some((sample) =>
          sample.maxSpanRatio > maxSpanRatio
          || sample.maxEdgeRatio > maxEdgeRatio
          || sample.p99EdgeRatio > maxP99EdgeRatio
          || sample.extremeEdgeFraction > maxExtremeEdgeFraction)
        const envelope = {
          maxSpanRatio: Math.max(...samples.map((sample) => sample.maxSpanRatio)),
          minEdgeRatio: Math.min(...samples.map((sample) => sample.minEdgeRatio)),
          maxP99EdgeRatio: Math.max(...samples.map((sample) => sample.p99EdgeRatio)),
          maxEdgeRatio: Math.max(...samples.map((sample) => sample.maxEdgeRatio)),
          maxExtremeEdgeFraction: Math.max(...samples.map((sample) => sample.extremeEdgeFraction)),
        }
        animationAudit.push({
          model: entry.spec.label,
          animation: group.name,
          from: group.from,
          to: group.to,
          failed,
          envelope,
          worst,
          samples,
        })
      }
      const pose = entry.poses.find(Boolean)
      if (pose) {
        pose.start(false, 1, pose.from, pose.to)
        pose.goToFrame(pose.from + (pose.to - pose.from) * poseFraction)
        pose.pause()
      } else {
        for (const container of entry.containers) {
          for (const skeleton of container.skeletons) skeleton.returnToRest()
        }
      }
    }
    scene.render()
  }

  const allMeshes = entries.flatMap((entry) => entry.meshes)
  const bounds = finiteBounds(allMeshes)
  const center = BABYLON.Vector3.Center(bounds.min, bounds.max)
  const width = bounds.max[horizontalAxis] - bounds.min[horizontalAxis]
  const height = bounds.max.y - bounds.min.y
  const depth = bounds.max.z - bounds.min.z
  const aspect = engine.getRenderWidth() / engine.getRenderHeight()
  const focusSpecs = {
    full: { centerY: 0.5, width: 1, height: 1 },
    head: { centerY: 0.865, width: 0.34, height: 0.29 },
    hands: { centerY: 0.39, width: 1, height: 0.34 },
    feet: { centerY: 0.105, width: 0.72, height: 0.24 },
  }
  const focusSpec = focusSpecs[focus]
  if (!focusSpec) throw new Error(`Unsupported focus: ${focus}`)
  center.y = bounds.min.y + height * focusSpec.centerY
  const focusWidth = width * focusSpec.width
  const focusHeight = height * focusSpec.height
  // A three-quarter orthographic view projects depth into screen width. The
  // old axis-aligned fit cropped cube-like props even though their world-space
  // bounds were valid. A raised three-quarter view also projects part of the
  // horizontal footprint into screen height.
  const diagonalView = frontAxis.includes('xz')
  const raisedView = frontAxis.endsWith('-high')
  const projectedWidth = diagonalView ? Math.hypot(focusWidth, depth) : focusWidth
  const projectedHeight = raisedView
    ? focusHeight + Math.max(width, depth) * 0.38
    : focusHeight
  const halfHeight = Math.max(
    projectedHeight * 0.58,
    (projectedWidth / aspect) * 0.58,
  )
  const halfWidth = halfHeight * aspect
  const distance = Math.max(width, height, depth) * 3 + 1

  const directions = {
    '-z': new BABYLON.Vector3(0, 0, -1),
    '+z': new BABYLON.Vector3(0, 0, 1),
    '-x': new BABYLON.Vector3(-1, 0, 0),
    '+x': new BABYLON.Vector3(1, 0, 0),
    '-xz': new BABYLON.Vector3(-1, 0, -1).normalize(),
    '+xz': new BABYLON.Vector3(1, 0, 1).normalize(),
    '-x+z': new BABYLON.Vector3(-1, 0, 1).normalize(),
    '+x-z': new BABYLON.Vector3(1, 0, -1).normalize(),
    '-xz-high': new BABYLON.Vector3(-1, 0.52, -1).normalize(),
  }
  const direction = directions[frontAxis]
  if (!direction) throw new Error(`Unsupported front axis: ${frontAxis}`)
  const camera = new BABYLON.FreeCamera(
    'reference-camera',
    center.add(direction.scale(distance)),
    scene,
  )
  camera.setTarget(center)
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA
  camera.orthoLeft = -halfWidth
  camera.orthoRight = halfWidth
  camera.orthoTop = halfHeight
  camera.orthoBottom = -halfHeight
  camera.minZ = 0.01
  camera.maxZ = distance * 4
  scene.activeCamera = camera
  previewCamera.dispose()

  for (let index = 0; index < 8; index++) scene.render()
  engine.runRenderLoop(() => scene.render())

  state.models = entries.map((entry) => ({
    label: entry.spec.label,
    poses: entry.poses.map((pose) => pose?.name ?? null),
    animationCount: entry.containers.reduce(
      (total, container) => total + container.animationGroups.length,
      0,
    ),
    skeletonCount: entry.containers.reduce(
      (total, container) => total + container.skeletons.length,
      0,
    ),
    bones: entry.containers.flatMap((container) =>
      container.skeletons.map((skeleton) => skeleton.bones.length),
    ),
  }))
  state.bounds = { min: bounds.min.asArray(), max: bounds.max.asArray() }
  state.frontAxis = frontAxis
  state.focus = focus
  state.animationAudit = {
    sampleCount: auditSamples,
    maxSpanRatio,
    minEdgeRatio,
    maxEdgeRatio,
    maxP99EdgeRatio,
    maxExtremeEdgeFraction,
    clipCount: animationAudit.length,
    failedClipCount: animationAudit.filter((clip) => clip.failed).length,
    clips: animationAudit,
  }
  state.status = 'ready'
}

run().catch((error) => {
  state.status = 'error'
  state.error = error instanceof Error ? error.stack ?? error.message : String(error)
})
