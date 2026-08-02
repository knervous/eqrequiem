import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { fetchShadoBytes } from "@knervous/shado/preprocess/runtime";
import {
  decodeShadoWorldCollision,
  deserializeShadoWorld,
  ShadoVisibilityBits,
  ShadoWorldVisibilityCoordinator,
  type ShadoWorldSpatialPackage,
} from "@knervous/shado/world";
import {
  flattenWorldFrustumPlanes,
  WORLD_VISIBILITY_INTERVAL_MS,
} from "./world-visibility-policy";

const WORLD_PACKAGE_REVISION = "babylon-rhs-y-up-v5-hybrid-lighting-2x-v3";

export class ShadoWorldSceneLayer {
  private elapsedMs = WORLD_VISIBILITY_INTERVAL_MS;

  private constructor(
    public readonly world: ShadoWorldSpatialPackage,
    public readonly coordinator: ShadoWorldVisibilityCoordinator,
    public readonly collisionMesh: BJS.Mesh,
    private readonly sourceContainer: BJS.AssetContainer,
    private readonly runtimeRoot: BJS.TransformNode,
    private readonly chunks: BJS.Mesh[],
    public readonly usesBakedWorldLighting: boolean,
  ) {}

  get renderMeshes(): readonly BJS.Mesh[] {
    return this.chunks;
  }

  tick(deltaMs: number): void {
    this.elapsedMs += Math.max(0, deltaMs);
    if (this.elapsedMs < WORLD_VISIBILITY_INTERVAL_MS) return;
    this.elapsedMs %= WORLD_VISIBILITY_INTERVAL_MS;

    const scene = this.runtimeRoot.getScene();
    const camera = scene.activeCamera;
    if (!camera) return;
    scene.updateTransformMatrix(true);
    const planes = flattenWorldFrustumPlanes(
      BABYLON.Frustum.GetPlanes(scene.getTransformMatrix()),
    );
    const position = camera.globalPosition;
    const frame = this.coordinator.reduceWorld(planes, [
      position.x,
      position.y,
      position.z,
    ]);
    for (let chunk = 0; chunk < this.chunks.length; chunk++) {
      const renderMesh = this.chunks[chunk]!;
      if (renderMesh.metadata?.shadoAlwaysDisabled === true) {
        renderMesh.setEnabled(false);
        continue;
      }
      const first = this.world.renderChunks.firstClusterRef[chunk]!;
      const count = this.world.renderChunks.clusterRefCount[chunk]!;
      let visible = false;
      for (let ref = first; ref < first + count; ref++) {
        const cluster = this.world.renderChunkClusters[ref]!;
        if (frame.clusterFlags[cluster] & ShadoVisibilityBits.Visible) {
          visible = true;
          break;
        }
      }
      renderMesh.setEnabled(visible);
    }
  }

  static async load(
    zoneName: string,
    scene: BJS.Scene,
    zoneContainer: BJS.TransformNode,
  ): Promise<ShadoWorldSceneLayer> {
    const zone = encodeURIComponent(zoneName.toLowerCase());
    const spatialUrl =
      `${import.meta.env.BASE_URL}eqrequiem/worlds/${zone}.spatial.json.gz` +
      `?revision=${WORLD_PACKAGE_REVISION}`;
    const world = await deserializeShadoWorld(spatialUrl);
    if (
      world.version !== 5 ||
      world.name.toLowerCase() !== zoneName.toLowerCase() ||
      world.sourceTransform !== "mirror-x"
    ) {
      throw new Error(`World package '${zoneName}' does not satisfy the current contract`);
    }
    return await this.create(world, spatialUrl, scene, zoneContainer);
  }

  dispose(): void {
    this.coordinator.dispose();
    this.sourceContainer.dispose();
    this.chunks.forEach((chunk) => chunk.dispose());
    this.collisionMesh.dispose();
    this.runtimeRoot.dispose();
  }

  private static async create(
    world: ShadoWorldSpatialPackage,
    spatialUrl: string,
    scene: BJS.Scene,
    zoneContainer: BJS.TransformNode,
  ): Promise<ShadoWorldSceneLayer> {
    const sourceUrl = sourceSceneUrl(world, spatialUrl);
    const bytes = await fetchShadoBytes(sourceUrl);
    const blobUrl = URL.createObjectURL(
      new Blob([bytes], { type: "model/gltf-binary" }),
    );
    let sourceContainer: BJS.AssetContainer | undefined;
    try {
      sourceContainer = await BABYLON.LoadAssetContainerAsync(blobUrl, scene, {
        pluginExtension: ".glb",
      });
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    let collision: ReturnType<typeof decodeShadoWorldCollision>;
    try {
      const collisionBytes = await fetchShadoBytes(
        packageArtifactUrl(world.collision.source, spatialUrl),
      );
      collision = decodeShadoWorldCollision(
        new Uint8Array(collisionBytes),
        world.collision,
      );
    } catch (error) {
      sourceContainer.dispose();
      throw error;
    }
    sourceContainer.addAllToScene();
    const usesBakedWorldLighting = world.lighting?.mode === "baked";
    applyWorldMaterialPolicy(
      sourceContainer.materials,
      usesBakedWorldLighting,
    );

    const runtimeRoot = new BABYLON.TransformNode(
      `ShadoWorldRoot:${world.name}`,
      scene,
    );
    runtimeRoot.setParent(zoneContainer);
    sourceContainer.rootNodes.forEach((root) => {
      root.parent = runtimeRoot;
    });

    try {
      const sources = new Map(
        sourceContainer.meshes.map((mesh) => [mesh.name, mesh]),
      );
      const chunks = createRenderChunks(world, sources);
      validateRenderChunks(world, chunks);
      const collisionMesh = createCollisionMesh(collision, scene);
      collisionMesh.name = `ShadoWorldCollision:${world.name}`;
      collisionMesh.isVisible = false;
      collisionMesh.isPickable = false;
      collisionMesh.setParent(zoneContainer);
      const coordinator = await ShadoWorldVisibilityCoordinator.create(world, {
        entityVisibilityWorker: "required",
      });
      const layer = new ShadoWorldSceneLayer(
        world,
        coordinator,
        collisionMesh,
        sourceContainer,
        runtimeRoot,
        chunks,
        usesBakedWorldLighting,
      );
      console.info(
        `[ZoneManager] Loaded promoted world scene ${world.name}: ` +
          `${world.triangleCount} triangles, ${chunks.length} render chunks, ` +
          `${world.collision.triangleCount} collision triangles, ` +
          `layout=${world.integrity.layoutHash}`,
      );
      return layer;
    } catch (error) {
      sourceContainer.dispose();
      runtimeRoot.dispose();
      throw error;
    }
  }

}

/**
 * Current Requiem scene geometry is an open architectural surface set rather
 * than a collection of closed solids. Every material passed here belongs to
 * the promoted zone AssetContainer, so scene materials render both sides;
 * prototype/object materials are loaded by a different layer and retain their
 * own authored policy.
 */
function applyWorldMaterialPolicy(
  materials: readonly BJS.Material[],
  usesBakedWorldLighting: boolean,
): void {
  const materialPreview =
    import.meta.env.VITE_LOCAL_DEV === "true" &&
    new URLSearchParams(window.location.search).has("materialPreview");
  for (const material of materials) {
    material.backFaceCulling = false;
    if (material instanceof BABYLON.PBRMaterial) {
      material.twoSidedLighting = true;
      // A clean-room material review needs to expose the embedded albedo
      // rather than tinting it with an unfinished zone light/sky setup.
      material.unlit = materialPreview || usesBakedWorldLighting;
    }
  }
}

function sourceSceneUrl(world: ShadoWorldSpatialPackage, spatialUrl: string): string {
  if (world.source && /^(?:https?:)?\//.test(world.source)) {
    if (world.source.startsWith("/") && import.meta.env.BASE_URL !== "/") {
      return `${import.meta.env.BASE_URL}${world.source.slice(1)}`;
    }
    return world.source;
  }
  return spatialUrl.replace(/\.spatial\.json\.gz(?:[?#].*)?$/i, ".glb.gz");
}

function packageArtifactUrl(source: string, spatialUrl: string): string {
  if (/^(?:https?:)?\//.test(source)) {
    if (source.startsWith("/") && import.meta.env.BASE_URL !== "/") {
      return `${import.meta.env.BASE_URL}${source.slice(1)}`;
    }
    return source;
  }
  const spatial = new URL(spatialUrl, window.location.href);
  const artifact = new URL(source, spatial);
  artifact.search = spatial.search;
  return artifact.toString();
}

function createRenderChunks(
  world: ShadoWorldSpatialPackage,
  sources: ReadonlyMap<string, BJS.AbstractMesh>,
): BJS.Mesh[] {
  const chunks: BJS.Mesh[] = [];
  for (let chunk = 0; chunk < world.renderChunks.primitive.length; chunk++) {
    const primitive = world.primitives[world.renderChunks.primitive[chunk]!]!;
    const separator = primitive.name.lastIndexOf("#");
    const meshName =
      separator >= 0 ? primitive.name.slice(0, separator) : primitive.name;
    const source = sources.get(meshName);
    if (!(source instanceof BABYLON.Mesh)) {
      throw new Error(`Promoted world primitive source '${meshName}' is missing`);
    }
    const clone = source.clone(`ShadoWorldChunk:${chunk}`, source.parent, true);
    if (!clone) throw new Error(`Unable to clone promoted primitive '${meshName}'`);
    clone.makeGeometryUnique();
    const first = world.renderChunks.firstClusterRef[chunk]!;
    const count = world.renderChunks.clusterRefCount[chunk]!;
    const clusterIds = world.renderChunkClusters.slice(first, first + count);
    const compacted = compactGeometry(
      source,
      indicesForClusters(world, clusterIds),
    );
    for (const [kind, stream] of compacted.streams) {
      clone.setVerticesData(kind, stream.data, false, stream.size);
    }
    clone.setIndices(compacted.indices);
    clone.subMeshes = [];
    clone.material =
      source
        .getScene()
        .materials.find(
          (material) =>
            material.name === world.materials[world.renderChunks.material[chunk]!],
        ) ?? source.material;
    new BABYLON.SubMesh(
      0,
      0,
      clone.getTotalVertices(),
      0,
      compacted.indices.length,
      clone,
    );
    clone.isPickable = true;
    clone.collisionMask = 0x0000dad1;
    clone.alwaysSelectAsActiveMesh = false;
    clone.useVertexColors = source.isVerticesDataPresent(
      BABYLON.VertexBuffer.ColorKind,
    );
    clone.hasVertexAlpha = false;
    const boundaryOnly =
      clone.material?.metadata?.gltf?.extras?.boundary === true;
    if (meshName === "CLOUD_MDF" || boundaryOnly) {
      clone.metadata = { ...clone.metadata, shadoAlwaysDisabled: true };
      clone.setEnabled(false);
    }
    clone.refreshBoundingInfo();
    chunks.push(clone);
  }
  sources.forEach((source) => {
    if (source.getTotalVertices() > 0) source.setEnabled(false);
  });
  return chunks;
}

function indicesForClusters(
  world: ShadoWorldSpatialPackage,
  clusterIds: readonly number[],
): number[] {
  const indices: number[] = [];
  for (const cluster of clusterIds) {
    const first = world.clusters.firstIndex[cluster]!;
    const count = world.clusters.indexCount[cluster]!;
    indices.push(...world.clusterIndices.slice(first, first + count));
  }
  return indices;
}

function compactGeometry(
  source: BJS.Mesh,
  sourceIndices: readonly number[],
): {
  indices: Uint32Array;
  streams: Map<string, { data: Float32Array; size: number }>;
} {
  const sourceToLocal = new Map<number, number>();
  const referenced: number[] = [];
  const indices = Uint32Array.from(sourceIndices, (sourceIndex) => {
    let local = sourceToLocal.get(sourceIndex);
    if (local === undefined) {
      local = referenced.length;
      referenced.push(sourceIndex);
      sourceToLocal.set(sourceIndex, local);
    }
    return local;
  });
  const streams = new Map<
    string,
    { data: Float32Array; size: number }
  >();
  for (const kind of source.getVerticesDataKinds()) {
    const sourceData = source.getVerticesData(kind);
    const size = source.getVertexBuffer(kind)?.getSize() ?? 0;
    if (!sourceData || !size) continue;
    const data = new Float32Array(referenced.length * size);
    referenced.forEach((sourceIndex, localIndex) => {
      for (let component = 0; component < size; component++) {
        data[localIndex * size + component] =
          sourceData[sourceIndex * size + component]!;
      }
    });
    streams.set(kind, { data, size });
  }
  return { indices, streams };
}

function validateRenderChunks(
  world: ShadoWorldSpatialPackage,
  chunks: readonly BJS.Mesh[],
): void {
  const indexCount = chunks.reduce(
    (count, chunk) => count + (chunk.getIndices()?.length ?? 0),
    0,
  );
  if (indexCount !== world.triangleCount * 3) {
    throw new Error(
      `World '${world.name}' render payload has ${indexCount / 3} triangles; ` +
        `package requires ${world.triangleCount}`,
    );
  }
  for (const chunk of chunks) {
    const determinant = chunk.computeWorldMatrix(true).determinant();
    if (!Number.isFinite(determinant) || determinant <= 0) {
      throw new Error(
        `World '${world.name}' chunk '${chunk.name}' has invalid determinant ${determinant}`,
      );
    }
  }
}

function createCollisionMesh(
  collision: ReturnType<typeof decodeShadoWorldCollision>,
  scene: BJS.Scene,
): BJS.Mesh {
  const mesh = new BABYLON.Mesh("ShadoWorldCollision", scene);
  mesh.setVerticesData(
    BABYLON.VertexBuffer.PositionKind,
    collision.positions,
    false,
    3,
  );
  mesh.setIndices(collision.indices);
  mesh.refreshBoundingInfo();
  return mesh;
}
