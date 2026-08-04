import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { fetchShadoBytes } from '@knervous/shado/preprocess/runtime';
import {
  deserializeShadoWorld,
  deserializeShadoWorldAuthoring,
  createShadoWorldAuthoring,
  upgradeShadoWorldAuthoring,
  ShadoWorldVisibilityCoordinator,
  type ShadoVisibilityReducibleContainer,
  type ShadoWorldVisibilityFrame,
  type ShadoWorldSpatialPackage,
} from '@knervous/shado/world';
import { createWorldRegionEditor } from './WorldRegionEditor';
import { WorldObjectRenderer } from './WorldObjectRenderer';

export type WorldDevState = {
  status: 'loading' | 'ready' | 'failed';
  name?: string;
  triangles?: number;
  clusters?: number;
  visibleClusters?: number;
  tiles?: number;
  packets?: number;
  renderChunks?: number;
  cells?: number;
  portals?: number;
  layoutHash?: string;
  bvhNodes?: number;
  reducerMs?: number;
  objectPrototypes?: number;
  objectStamps?: number;
  visibleObjects?: number;
  error?: string;
};

type WorldOptions = {
  showClusterBounds: boolean;
  showTiles: boolean;
  showRegions: boolean;
  showObjects: boolean;
  freezeCulling: boolean;
  soloSelectedRegion: boolean;
  navigationMode: 'orbit' | 'pan';
};

type WorldGlbImport = { file: File };
type WorldObjectGlbImport = { prototype: string; file: File };

export type ProcessedWorldLayer = {
  world: ShadoWorldSpatialPackage;
  coordinator: ShadoWorldVisibilityCoordinator;
  getFrame(): ShadoWorldVisibilityFrame | undefined;
  reduceContainerVisibility(
    container: ShadoVisibilityReducibleContainer,
    camera: BABYLON.Camera,
    baseRadius: number,
    maxDistance?: number
  ): void;
};

export type ProcessedWorldLayerOptions = {
  canvas?: HTMLCanvasElement;
  editor?: boolean;
  createCamera?: boolean;
  publishState?: boolean;
};

declare global {
  interface Window {
    __shadoWorldDev?: WorldDevState;
  }
}

export class WorldPlayground {
  public static CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement) {
    return createWorldScene(engine, canvas, false);
  }
}

export class WorldEditorPlayground {
  public static CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement) {
    return createWorldScene(engine, canvas, true);
  }
}

async function createWorldScene(
  engine: BABYLON.Engine,
  canvas: HTMLCanvasElement,
  editor: boolean
) {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.035, 0.045, 0.06, 1);
  (globalThis as any).__shadoScene = scene;
  const worldLayer = await attachProcessedWorld(scene, {
    canvas,
    editor,
    createCamera: true,
    publishState: true,
  });
  (globalThis as any).__shadoWorld = worldLayer;
  return scene;
}

/** Adds the prebuilt world to a scene for the dedicated world and editor routes. */
export async function attachProcessedWorld(
  scene: BABYLON.Scene,
  options: ProcessedWorldLayerOptions = {}
): Promise<ProcessedWorldLayer> {
  const editor = options.editor ?? false;
  const shouldPublish = options.publishState ?? true;
  if (shouldPublish) publish({ status: 'loading' });
  try {
    const world = await deserializeShadoWorld('/shado/worlds/qey2hh1.spatial.json.gz?v=3');
    const coordinator = await ShadoWorldVisibilityCoordinator.create(world, {
      entityVisibilityWorker: editor ? 'auto' : 'required',
    });
    if (options.createCamera || !scene.activeCamera) {
      const center = BABYLON.Vector3.Center(
        BABYLON.Vector3.FromArray(world.bounds.min),
        BABYLON.Vector3.FromArray(world.bounds.max)
      );
      const radius =
        Math.max(
          world.bounds.max[0] - world.bounds.min[0],
          world.bounds.max[1] - world.bounds.min[1],
          world.bounds.max[2] - world.bounds.min[2]
        ) * 0.38;
      const camera = new BABYLON.ArcRotateCamera(
        'world-camera',
        -Math.PI / 2,
        1.05,
        radius,
        center,
        scene
      );
      camera.minZ = 1;
      camera.maxZ = radius * 8;
      camera.wheelDeltaPercentage = 0.01;
      camera.panningSensibility = 75;
      if (options.canvas) camera.attachControl(options.canvas, true);
    }
    if (!scene.lights.length) {
      new BABYLON.HemisphericLight('world-sky', new BABYLON.Vector3(0, 1, 0), scene).intensity =
        1.15;
    }

    // Spatial packages bake the Requiem client's asset root into `source`
    // (/eqrequiem/worlds/...). The sandbox serves the same GLBs from its own
    // public directory, and the `??` fallback never fired because `source` is
    // set — so the request fell through to the SPA index.html and the glTF
    // loader reported "Unexpected magic: 1868833084" ("<!do"). Resolve by name.
    const sourceName = (world.source ?? `${world.name}.glb.gz`).split('/').pop();
    const sources = await loadSourceWorld(scene, `/shado/worlds/${sourceName}`);
    const renderChunks = createRenderChunks(scene, world, sources);
    const boundsMeshes = createClusterBounds(scene, world);
    const tileLines = createTileLines(scene, world);
    const authoring = editor ? await loadWorldAuthoring(world.name) : undefined;
    const regionEditor = authoring ? createWorldRegionEditor(scene, world, authoring) : undefined;
    const objectRenderer = new WorldObjectRenderer(
      scene,
      authoring ?? authoringFromSpatialWorld(world),
      { outsideWorldVisible: editor, liveAuthoring: editor }
    );
    const displayOptions: WorldOptions = {
      showClusterBounds: false,
      showTiles: false,
      showRegions: editor,
      showObjects: true,
      freezeCulling: false,
      soloSelectedRegion: false,
      navigationMode: 'orbit',
    };
    const cameraNavigation =
      editor && options.canvas && scene.activeCamera instanceof BABYLON.ArcRotateCamera
        ? createEditorCameraNavigation(scene.activeCamera, options.canvas)
        : undefined;
    let importedContainer: BABYLON.AssetContainer | undefined;
    const handleOptions = (event: Event) => {
      Object.assign(displayOptions, (event as CustomEvent<Partial<WorldOptions>>).detail);
      cameraNavigation?.setMode(displayOptions.navigationMode);
      regionEditor?.setSoloSelected(displayOptions.soloSelectedRegion);
      objectRenderer.setVisible(displayOptions.showObjects);
    };
    const handleGlbImport = async (event: Event) => {
      const { file } = (event as CustomEvent<WorldGlbImport>).detail;
      const url = URL.createObjectURL(file);
      try {
        const next = await BABYLON.LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
        importedContainer?.dispose();
        importedContainer = next;
        next.addAllToScene();
        renderChunks.meshes.forEach(mesh => mesh.setEnabled(false));
        frameMeshes(scene.activeCamera, next.meshes);
        window.dispatchEvent(
          new CustomEvent('shado-world-glb-imported', {
            detail: {
              name: file.name,
              meshes: next.meshes.filter(mesh => mesh.getTotalVertices() > 0).length,
            },
          })
        );
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent('shado-world-glb-import-error', {
            detail: error instanceof Error ? error.message : String(error),
          })
        );
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    const handleAuthoringState = (event: Event) => {
      objectRenderer.setDocument(
        (event as CustomEvent<{ document: ReturnType<typeof authoringFromSpatialWorld> }>).detail
          .document
      );
    };
    const handleObjectGlbImport = async (event: Event) => {
      const { prototype, file } = (event as CustomEvent<WorldObjectGlbImport>).detail;
      try {
        await objectRenderer.importPrototype(prototype, file);
        window.dispatchEvent(
          new CustomEvent('shado-world-object-imported', {
            detail: { prototype, name: file.name },
          })
        );
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent('shado-world-object-load-error', {
            detail: {
              prototype,
              source: file.name,
              error: error instanceof Error ? error.message : String(error),
            },
          })
        );
      }
    };
    window.addEventListener('shado-world-options', handleOptions);
    window.addEventListener('shado-world-import-glb', handleGlbImport);
    window.addEventListener('shado-world-region-state', handleAuthoringState);
    window.addEventListener('shado-world-import-object-glb', handleObjectGlbImport);
    scene.onDisposeObservable.add(() => {
      window.removeEventListener('shado-world-options', handleOptions);
      window.removeEventListener('shado-world-import-glb', handleGlbImport);
      window.removeEventListener('shado-world-region-state', handleAuthoringState);
      window.removeEventListener('shado-world-import-object-glb', handleObjectGlbImport);
      cameraNavigation?.dispose();
      importedContainer?.dispose();
      regionEditor?.dispose();
      objectRenderer.dispose();
      coordinator.dispose();
    });

    let lastVisible = -1;
    let currentFrame: ShadoWorldVisibilityFrame | undefined;
    let currentPlanes = new Float32Array(24);
    scene.onBeforeRenderObservable.add(() => {
      boundsMeshes.forEach(mesh => mesh.setEnabled(displayOptions.showClusterBounds));
      tileLines.setEnabled(displayOptions.showTiles);
      regionEditor?.setVisible(displayOptions.showRegions);
      if (displayOptions.freezeCulling) return;
      const started = performance.now();
      currentPlanes = frustumPlanes(scene);
      const camera = scene.activeCamera;
      if (!camera) return;
      const position = camera.globalPosition ?? camera.position;
      currentFrame = coordinator.reduceWorld(currentPlanes, [position.x, position.y, position.z]);
      const visibleObjects = objectRenderer.update(
        currentPlanes,
        BABYLON.Vector3.FromArray([position.x, position.y, position.z]),
        currentFrame,
        coordinator
      );
      const visible = currentFrame.visibleClusters;
      const elapsed = performance.now() - started;
      const flags = new Uint8Array(world.clusters.radius.length);
      visible.forEach(id => {
        if (id < flags.length) flags[id] = 1;
      });
      if (!importedContainer) renderChunks.update(flags);
      boundsMeshes.forEach((mesh, id) => (mesh.visibility = flags[id] ? 0.2 : 0.035));
      if (lastVisible !== visible.length || scene.getFrameId() % 30 === 0) {
        lastVisible = visible.length;
        if (shouldPublish) publish(summary(world, visible.length, elapsed, visibleObjects));
      }
    });
    if (shouldPublish) publish(summary(world, world.clusters.radius.length, 0));
    return {
      world,
      coordinator,
      getFrame: () => currentFrame,
      reduceContainerVisibility(container, camera, baseRadius, maxDistance = 0) {
        if (!currentFrame) {
          currentPlanes = frustumPlanes(scene);
          const position = camera.globalPosition ?? camera.position;
          currentFrame = coordinator.reduceWorld(currentPlanes, [
            position.x,
            position.y,
            position.z,
          ]);
        }
        const position = camera.globalPosition ?? camera.position;
        coordinator.reduceContainer(container, currentPlanes, currentFrame, {
          camera: [position.x, position.y, position.z],
          defaultRadius: baseRadius,
          maxDistance,
          outsideWorldVisible: true,
        });
      },
    };
  } catch (error) {
    if (shouldPublish) {
      publish({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  }
}

function authoringFromSpatialWorld(world: ShadoWorldSpatialPackage) {
  const document = createShadoWorldAuthoring(world.name);
  const objects = world.objects;
  if (!objects) return document;
  document.objects.prototypes = objects.prototypes.id.map((id, prototype) => ({
    id,
    source: objects.prototypes.source[prototype],
    boundsRadius: objects.prototypes.boundsRadius[prototype],
    metadata: { ...objects.prototypes.metadata[prototype] },
  }));
  document.objects.stamps = objects.stamps.id.map((id, stamp) => ({
    id,
    prototype: objects.prototypes.id[objects.stamps.prototype[stamp]],
    enabled: Boolean(objects.stamps.enabled[stamp]),
    position: [
      objects.stamps.positionX[stamp],
      objects.stamps.positionY[stamp],
      objects.stamps.positionZ[stamp],
    ],
    rotationDegrees: [
      objects.stamps.rotationX[stamp],
      objects.stamps.rotationY[stamp],
      objects.stamps.rotationZ[stamp],
    ],
    scale: [
      objects.stamps.scaleX[stamp],
      objects.stamps.scaleY[stamp],
      objects.stamps.scaleZ[stamp],
    ],
    phaseMask: objects.stamps.phaseMask[stamp],
    tags: [...objects.stamps.tags[stamp]],
    metadata: { ...objects.stamps.metadata[stamp] },
  }));
  return document;
}

async function loadSourceWorld(
  scene: BABYLON.Scene,
  url: string
): Promise<Map<string, BABYLON.AbstractMesh>> {
  const bytes = await fetchShadoBytes(url);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  try {
    const container = await BABYLON.LoadAssetContainerAsync(blobUrl, scene, {
      pluginExtension: '.glb',
    });
    container.addAllToScene();
    return new Map(container.meshes.map(mesh => [mesh.name, mesh]));
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function loadWorldAuthoring(world: string) {
  const saved = localStorage.getItem(`shado-world-authoring:${world}`);
  if (saved) {
    try {
      const upgraded = upgradeShadoWorldAuthoring(JSON.parse(saved), world);
      localStorage.setItem(`shado-world-authoring:${world}`, JSON.stringify(upgraded));
      return upgraded;
    } catch {
      localStorage.removeItem(`shado-world-authoring:${world}`);
    }
  }
  try {
    return upgradeShadoWorldAuthoring(
      await deserializeShadoWorldAuthoring(`/shado/worlds/${world}.authoring.json?v=1`, world),
      world
    );
  } catch {
    return createShadoWorldAuthoring(world);
  }
}

function createRenderChunks(
  scene: BABYLON.Scene,
  world: ShadoWorldSpatialPackage,
  sources: Map<string, BABYLON.AbstractMesh>
): { meshes: BABYLON.Mesh[]; update(flags: Uint8Array): void } {
  const meshes: BABYLON.Mesh[] = [];
  const clusterIdsByChunk: number[][] = [];
  const signatures = Array.from({ length: world.renderChunks.primitive.length }, () => '');
  for (let id = 0; id < world.renderChunks.primitive.length; id++) {
    const primitive = world.primitives[world.renderChunks.primitive[id]];
    const split = primitive.name.lastIndexOf('#');
    const meshName = split >= 0 ? primitive.name.slice(0, split) : primitive.name;
    const source = sources.get(meshName);
    if (!(source instanceof BABYLON.Mesh)) {
      throw new Error(`Processed primitive source '${meshName}' is missing`);
    }
    const clone = source.clone(`world-chunk-${id}`, source.parent, true);
    if (!clone) throw new Error(`Unable to clone world primitive '${meshName}'`);
    clone.makeGeometryUnique();
    const firstRef = world.renderChunks.firstClusterRef[id];
    const refCount = world.renderChunks.clusterRefCount[id];
    const clusterIds = world.renderChunkClusters.slice(firstRef, firstRef + refCount);
    clusterIdsByChunk.push(clusterIds);
    const indices = indicesForClusters(world, clusterIds);
    clone.setIndices(indices);
    clone.subMeshes = [];
    const materialName = world.materials[world.renderChunks.material[id]];
    clone.material =
      scene.materials.find(material => material.name === materialName) ?? source.material;
    new BABYLON.SubMesh(0, 0, clone.getTotalVertices(), 0, indices.length, clone);
    clone.alwaysSelectAsActiveMesh = true;
    meshes.push(clone);
  }
  for (const source of sources.values()) {
    if (source.getTotalVertices() > 0) source.setEnabled(false);
  }
  return {
    meshes,
    update(flags) {
      clusterIdsByChunk.forEach((clusterIds, chunk) => {
        const signature = clusterIds.map(id => (flags[id] ? '1' : '0')).join('');
        if (signature === signatures[chunk]) return;
        signatures[chunk] = signature;
        const visible = clusterIds.filter(id => flags[id]);
        const mesh = meshes[chunk];
        mesh.setEnabled(visible.length > 0);
        if (!visible.length) return;
        const indices = indicesForClusters(world, visible);
        mesh.setIndices(indices);
        mesh.subMeshes = [];
        new BABYLON.SubMesh(0, 0, mesh.getTotalVertices(), 0, indices.length, mesh);
      });
    },
  };
}

function indicesForClusters(world: ShadoWorldSpatialPackage, clusterIds: readonly number[]) {
  const indices: number[] = [];
  for (const cluster of clusterIds) {
    const first = world.clusters.firstIndex[cluster];
    const count = world.clusters.indexCount[cluster];
    for (let i = 0; i < count; i++) indices.push(world.clusterIndices[first + i]);
  }
  return indices;
}

function createClusterBounds(scene: BABYLON.Scene, world: ShadoWorldSpatialPackage) {
  const material = new BABYLON.StandardMaterial('cluster-bounds-material', scene);
  material.wireframe = true;
  material.disableLighting = true;
  material.emissiveColor = new BABYLON.Color3(0.15, 1, 0.45);
  material.alpha = 0.2;
  material.disableDepthWrite = true;
  return world.clusters.radius.map((radius, id) => {
    const mesh = BABYLON.MeshBuilder.CreateBox(`cluster-bound-${id}`, { size: radius * 2 }, scene);
    mesh.position.set(
      world.clusters.centerX[id],
      world.clusters.centerY[id],
      world.clusters.centerZ[id]
    );
    mesh.material = material;
    mesh.isPickable = false;
    mesh.renderingGroupId = 2;
    return mesh;
  });
}

function createTileLines(scene: BABYLON.Scene, world: ShadoWorldSpatialPackage) {
  const y = world.bounds.min[1];
  const lines = world.tiles.x.map((x, id) => {
    const z = world.tiles.z[id];
    const x0 = world.tiles.originX + x * world.tiles.size;
    const z0 = world.tiles.originZ + z * world.tiles.size;
    const x1 = x0 + world.tiles.size;
    const z1 = z0 + world.tiles.size;
    return [
      new BABYLON.Vector3(x0, y, z0),
      new BABYLON.Vector3(x1, y, z0),
      new BABYLON.Vector3(x1, y, z1),
      new BABYLON.Vector3(x0, y, z1),
      new BABYLON.Vector3(x0, y, z0),
    ];
  });
  const mesh = BABYLON.MeshBuilder.CreateLineSystem('world-tiles', { lines }, scene);
  mesh.color = new BABYLON.Color3(0.15, 0.65, 1);
  mesh.alpha = 0.28;
  mesh.isPickable = false;
  mesh.renderingGroupId = 2;
  return mesh;
}

function createEditorCameraNavigation(camera: BABYLON.ArcRotateCamera, canvas: HTMLCanvasElement) {
  const pointers = camera.inputs.attached.pointers as
    BABYLON.ArcRotateCameraPointersInput | undefined;
  const buttons = [...(pointers?.buttons ?? [0, 1, 2])];
  let mode: 'orbit' | 'pan' = 'orbit';
  let active = false;
  let lastX = 0;
  let lastY = 0;
  camera.movement.input.setInteractions('pointer', { button: 2 }, 'pan');
  const setMode = (next: 'orbit' | 'pan') => {
    mode = next;
    if (pointers)
      pointers.buttons = next === 'pan' ? buttons.filter(button => button !== 0) : buttons;
    canvas.style.cursor = next === 'pan' ? 'grab' : '';
  };
  const down = (event: PointerEvent) => {
    if (mode !== 'pan' || event.button !== 0) return;
    active = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!active) return;
    const scale = (camera.radius / Math.max(240, canvas.clientHeight)) * 1.5;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const right = camera
      .getDirection(BABYLON.Axis.X)
      .normalize()
      .scale(-dx * scale);
    const up = camera
      .getDirection(BABYLON.Axis.Y)
      .normalize()
      .scale(dy * scale);
    camera.target.addInPlace(right).addInPlace(up);
    event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    if (!active) return;
    active = false;
    canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', up, true);
  return {
    setMode,
    dispose() {
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', up, true);
      if (pointers) pointers.buttons = buttons;
      canvas.style.cursor = '';
    },
  };
}

function frameMeshes(camera: BABYLON.Camera | null, meshes: BABYLON.AbstractMesh[]) {
  if (!(camera instanceof BABYLON.ArcRotateCamera)) return;
  const visible = meshes.filter(mesh => mesh.getTotalVertices() > 0);
  if (!visible.length) return;
  let min = new BABYLON.Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  let max = new BABYLON.Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  );
  for (const mesh of visible) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
  }
  camera.setTarget(BABYLON.Vector3.Center(min, max));
  camera.radius = Math.max(1, BABYLON.Vector3.Distance(min, max) * 0.75);
}

function frustumPlanes(scene: BABYLON.Scene) {
  const planes = BABYLON.Frustum.GetPlanes(scene.getTransformMatrix());
  const out = new Float32Array(24);
  planes.forEach((plane, index) =>
    out.set([plane.normal.x, plane.normal.y, plane.normal.z, plane.d], index * 4)
  );
  return out;
}

function summary(
  world: ShadoWorldSpatialPackage,
  visibleClusters: number,
  reducerMs: number,
  visibleObjects = world.objects?.stamps.id.length ?? 0
): WorldDevState {
  return {
    status: 'ready',
    name: world.name,
    triangles: world.triangleCount,
    clusters: world.clusters.radius.length,
    visibleClusters,
    tiles: world.tiles.x.length,
    packets: world.packets.cellId.length,
    renderChunks: world.renderChunks.primitive.length,
    cells: world.cells.kind.length,
    portals: world.portals.fromCell.length,
    layoutHash: world.integrity.layoutHash,
    bvhNodes: world.bvh.nodeCount,
    reducerMs,
    objectPrototypes: world.objects?.prototypes.id.length ?? 0,
    objectStamps: world.objects?.stamps.id.length ?? 0,
    visibleObjects,
  };
}

function publish(state: WorldDevState) {
  window.__shadoWorldDev = state;
  window.dispatchEvent(new CustomEvent('shado-world-state', { detail: state }));
}
