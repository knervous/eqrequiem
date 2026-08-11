import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { fetchShadoBytes } from "@knervous/shado/preprocess/runtime";
import {
  decodeShadoWorldCollision,
  deserializeShadoWorld,
  ShadoVisibilityBits,
  ShadoWorldVisibilityCoordinator,
  type ShadoWorldSpatialPackage,
  type ShadoWorldCollisionData,
} from "@knervous/shado/world";
import {
  flattenWorldFrustumPlanes,
  WORLD_VISIBILITY_INTERVAL_MS,
} from "./world-visibility-policy";
import { getZoneAssetKey } from "@game/Constants/supportedZones";

const WORLD_PACKAGE_REVISION = "babylon-rhs-y-up-v7-canonical-zone-identity";

export class ShadoWorldSceneLayer {
  private elapsedMs = WORLD_VISIBILITY_INTERVAL_MS;

  private constructor(
    public readonly world: ShadoWorldSpatialPackage,
    public readonly coordinator: ShadoWorldVisibilityCoordinator,
    public readonly collision: ShadoWorldCollisionData,
    private readonly sourceContainer: BJS.AssetContainer,
    private readonly runtimeRoot: BJS.TransformNode,
    private readonly chunks: BJS.Mesh[],
    /**
     * Render-chunk index for each entry of `chunks`. Chunks that can only ever
     * be disabled are not built, so the two are not the same sequence.
     */
    private readonly chunkIndices: number[],
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
    for (let index = 0; index < this.chunks.length; index++) {
      const renderMesh = this.chunks[index]!;
      const chunk = this.chunkIndices[index]!;
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
    const assetKey = getZoneAssetKey(zoneName);
    const zone = encodeURIComponent(assetKey.toLowerCase());
    const spatialUrl =
      `${import.meta.env.BASE_URL}eqrequiem/worlds/${zone}.spatial.json.gz` +
      `?revision=${WORLD_PACKAGE_REVISION}`;
    const world = await deserializeShadoWorld(spatialUrl);
    if (
      world.version !== 5 ||
      (world.name.toLowerCase() !== zoneName.toLowerCase() && world.name.toLowerCase() !== assetKey.toLowerCase()) ||
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
    applyWorldMaterialPolicy(sourceContainer.materials);
    logLocalWorldMaterialDiagnostics(world.name, sourceUrl, sourceContainer);

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
      const { meshes: chunks, chunkIndices } = createRenderChunks(world, sources);
      logLocalRenderChunkDiagnostics(world.name, chunks);
      validateRenderChunks(world, chunks, chunkIndices);
      const coordinator = await ShadoWorldVisibilityCoordinator.create(world, {
        entityVisibilityWorker: "required",
        worldObjectVisibilityFlags: "compact-only",
        worldObjectVisibilityHz: 30,
      });
      const layer = new ShadoWorldSceneLayer(
        world,
        coordinator,
        collision,
        sourceContainer,
        runtimeRoot,
        chunks,
        chunkIndices,
        usesBakedWorldLighting,
      );
      console.info(
        `[ZoneManager] Loaded promoted world scene ${world.name}: ` +
          `${world.triangleCount} triangles, ${chunks.length} render meshes ` +
          `of ${world.renderChunks.primitive.length} chunks, ` +
          `${world.collision.sourceTriangleCount} source collision triangles, ` +
          `${world.collision.chunkCount} physics chunks, ` +
          `source=${sourceUrl}, ` +
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

function logLocalWorldMaterialDiagnostics(
  worldName: string,
  sourceUrl: string,
  container: BJS.AssetContainer,
): void {
  if (import.meta.env.VITE_LOCAL_DEV !== "true") return;
  const inspectedNames = new Set([
    "1roof.003",
    "12roof.003",
    "citywal4.003",
    "REQ_Q2_GARDEN_CLIPPED_HEDGE.003",
  ]);
  const materials = container.materials
    .filter(
      (material): material is BJS.PBRMaterial =>
        material instanceof BABYLON.PBRMaterial && inspectedNames.has(material.name),
    )
    .map((material) => ({
      material: material.name,
      albedo: Boolean(material.albedoTexture),
      albedoReady: material.albedoTexture?.isReady() ?? false,
      normal: Boolean(material.bumpTexture),
      normalReady: material.bumpTexture?.isReady() ?? false,
      metallicRoughness: Boolean(material.metallicTexture),
      metallicRoughnessReady: material.metallicTexture?.isReady() ?? false,
      unlit: material.unlit,
    }));
  const meshes = container.meshes
    .filter(
      (mesh): mesh is BJS.Mesh =>
        mesh instanceof BABYLON.Mesh &&
        ["1ROOF_MDF.003", "12ROOF_MDF.003", "CastleWallModification_CITYWAL4_Mesh.003"].includes(mesh.name),
    )
    .map((mesh) => ({
      mesh: mesh.name,
      uv0: mesh.isVerticesDataPresent(BABYLON.VertexBuffer.UVKind),
      colors: mesh.isVerticesDataPresent(BABYLON.VertexBuffer.ColorKind),
    }));
  console.info(
    "[ZoneManager] Local world material diagnostic " +
      JSON.stringify({ world: worldName, source: sourceUrl, materials, meshes }),
  );
}

function logLocalRenderChunkDiagnostics(
  worldName: string,
  chunks: readonly BJS.Mesh[],
): void {
  if (import.meta.env.VITE_LOCAL_DEV !== "true") return;
  const inspectedNames = new Set(["1roof.003", "12roof.003", "citywal4.003"]);
  const matching = chunks.filter(
    (chunk) =>
      chunk.material instanceof BABYLON.PBRMaterial &&
      inspectedNames.has(chunk.material.name),
  );
  const samples = matching.slice(0, 6).map((chunk) => {
    const uv = chunk.getVerticesData(BABYLON.VertexBuffer.UVKind);
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (let index = 0; index + 1 < (uv?.length ?? 0); index += 2) {
      minU = Math.min(minU, uv![index]!);
      minV = Math.min(minV, uv![index + 1]!);
      maxU = Math.max(maxU, uv![index]!);
      maxV = Math.max(maxV, uv![index + 1]!);
    }
    return {
      material: chunk.material?.name,
      vertices: chunk.getTotalVertices(),
      uv0: Boolean(uv?.length),
      uvRange: uv?.length ? [minU, minV, maxU, maxV] : null,
      colors: chunk.isVerticesDataPresent(BABYLON.VertexBuffer.ColorKind),
      vertexColorTint: chunk.useVertexColors,
      albedo: Boolean((chunk.material as BJS.PBRMaterial).albedoTexture),
    };
  });
  console.info(
    "[ZoneManager] Local render-chunk diagnostic " +
      JSON.stringify({ world: worldName, matchingChunks: matching.length, samples }),
  );
}

/**
 * Current Requiem scene geometry is an open architectural surface set rather
 * than a collection of closed solids. Every material passed here belongs to
 * the promoted zone AssetContainer, so scene materials render both sides;
 * prototype/object materials are loaded by a different layer and retain their
 * own authored policy.
 */
function applyWorldMaterialPolicy(materials: readonly BJS.Material[]): void {
  const materialPreview =
    import.meta.env.VITE_LOCAL_DEV === "true" &&
    new URLSearchParams(window.location.search).has("materialPreview");
  for (const material of materials) {
    material.backFaceCulling = false;
    if (material instanceof BABYLON.PBRMaterial) {
      material.twoSidedLighting = true;
      // Baked world lighting is carried by each mesh's vertex colours; it is
      // not a reason to bypass the PBR shader. Keeping this lit preserves
      // normal maps plus metallic/roughness response in promoted zones.
      // The explicit local review mode remains intentionally unlit.
      material.unlit = materialPreview;
    }
  }
}

function sourceSceneUrl(world: ShadoWorldSpatialPackage, spatialUrl: string): string {
  if (world.source && /^(?:https?:)?\//.test(world.source)) {
    let source = world.source;
    if (world.source.startsWith("/") && import.meta.env.BASE_URL !== "/") {
      source = `${import.meta.env.BASE_URL}${world.source.slice(1)}`;
    }
    // The spatial package itself is revisioned, but previously an absolute
    // world source discarded that query. Carry it forward so a promotion
    // cannot be hidden behind a browser's cached GLB response.
    const sourceUrl = new URL(source, window.location.href);
    if (!sourceUrl.search) {
      sourceUrl.search = new URL(spatialUrl, window.location.href).search;
    }
    return sourceUrl.toString();
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
): { meshes: BJS.Mesh[]; chunkIndices: number[] } {
  const meshes: BJS.Mesh[] = [];
  const chunkIndices: number[] = [];

  // One lookup table instead of a linear scan of every scene material for
  // every chunk.
  const scene = sources.values().next().value?.getScene();
  const materialsByName = new Map<string, BJS.Material>();
  for (const material of scene?.materials ?? []) {
    if (!materialsByName.has(material.name)) {
      materialsByName.set(material.name, material);
    }
  }

  for (let chunk = 0; chunk < world.renderChunks.primitive.length; chunk++) {
    const primitive = world.primitives[world.renderChunks.primitive[chunk]!]!;
    const separator = primitive.name.lastIndexOf("#");
    const meshName =
      separator >= 0 ? primitive.name.slice(0, separator) : primitive.name;
    const source = sources.get(meshName);
    if (!(source instanceof BABYLON.Mesh)) {
      throw new Error(`Promoted world primitive source '${meshName}' is missing`);
    }

    const material =
      materialsByName.get(world.materials[world.renderChunks.material[chunk]!]!) ??
      source.material;
    // A chunk that can only ever be disabled still costs a geometry clone, a
    // bounding refresh, and a slot in the per-frame visibility sweep. Decide
    // before building anything rather than after.
    if (
      meshName === "CLOUD_MDF" ||
      material?.metadata?.gltf?.extras?.boundary === true
    ) {
      continue;
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
    clone.material = material;
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
    const persistent = primitive.persistent === true;
    clone.alwaysSelectAsActiveMesh = persistent;
    clone.metadata = {
      ...clone.metadata,
      shadoPersistentMesh: persistent,
      shadoCullingPolicy: persistent ? "never-cull" : "standard",
    };
    // Baked irradiance is stored in vertex colours on inherited zone meshes.
    // Babylon multiplies those colours into PBR albedo, which mutes detailed
    // legacy texture maps into broad flat tints. World PBR chunks use the
    // scene lighting path instead; non-PBR/FX geometry preserves its authored
    // vertex-colour behaviour.
    clone.useVertexColors =
      !(clone.material instanceof BABYLON.PBRMaterial) &&
      source.isVerticesDataPresent(BABYLON.VertexBuffer.ColorKind);
    clone.hasVertexAlpha = false;
    clone.refreshBoundingInfo();
    meshes.push(clone);
    chunkIndices.push(chunk);
  }
  sources.forEach((source) => {
    if (source.getTotalVertices() > 0) source.setEnabled(false);
  });
  return { meshes, chunkIndices };
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
  chunkIndices: readonly number[],
): void {
  const indexCount = chunks.reduce(
    (count, chunk) => count + (chunk.getIndices()?.length ?? 0),
    0,
  );
  // Chunks that can only ever be disabled are never built, so the package
  // triangle total is not the expected payload. Require instead that every
  // chunk that was built carries exactly the geometry the package assigned it.
  let expected = 0;
  for (const chunk of chunkIndices) {
    const first = world.renderChunks.firstClusterRef[chunk]!;
    const count = world.renderChunks.clusterRefCount[chunk]!;
    for (let ref = first; ref < first + count; ref++) {
      expected += world.clusters.indexCount[world.renderChunkClusters[ref]!]!;
    }
  }
  if (indexCount !== expected) {
    throw new Error(
      `World '${world.name}' render payload has ${indexCount / 3} triangles; ` +
        `its ${chunks.length} built chunks require ${expected / 3}`,
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
