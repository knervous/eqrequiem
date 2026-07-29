import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { fetchShadoBytes } from "@knervous/shado/preprocess/runtime";
import {
  decodeShadoWorldCollision,
  deserializeShadoWorld,
  ShadoWorldVisibilityCoordinator,
  type ShadoWorldSpatialPackage,
} from "@knervous/shado/world";

const WORLD_PACKAGE_REVISION = "babylon-rhs-y-up-v4";

export class ShadoWorldSceneLayer {
  private constructor(
    public readonly world: ShadoWorldSpatialPackage,
    public readonly coordinator: ShadoWorldVisibilityCoordinator,
    public readonly collisionMesh: BJS.Mesh,
    private readonly sourceContainer: BJS.AssetContainer,
    private readonly runtimeRoot: BJS.TransformNode,
    private readonly chunks: BJS.Mesh[],
  ) {}

  get renderMeshes(): readonly BJS.Mesh[] {
    return this.chunks;
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
    const sourceUrl = materialPreviewSceneUrl(world, spatialUrl);
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
    applyWorldMaterialPolicy(sourceContainer.materials);

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
function applyWorldMaterialPolicy(materials: readonly BJS.Material[]): void {
  const materialPreview =
    import.meta.env.VITE_LOCAL_DEV === "true" &&
    new URLSearchParams(window.location.search).has("materialPreview");
  for (const material of materials) {
    material.backFaceCulling = false;
    if (material instanceof BABYLON.PBRMaterial) {
      material.twoSidedLighting = true;
      // A clean-room material review needs to expose the embedded albedo
      // rather than tinting it with an unfinished zone light/sky setup.
      material.unlit = materialPreview;
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

function materialPreviewSceneUrl(
  world: ShadoWorldSpatialPackage,
  spatialUrl: string,
): string {
  const requestedZone = new URLSearchParams(window.location.search)
    .get("materialPreview")
    ?.toLowerCase();
  if (
    import.meta.env.VITE_LOCAL_DEV === "true" &&
    requestedZone === world.name.toLowerCase()
  ) {
    const zone = encodeURIComponent(world.name.toLowerCase());
    return (
      `${import.meta.env.BASE_URL}eqrequiem/worlds/` +
      `${zone}.material-preview.glb.gz?revision=${WORLD_PACKAGE_REVISION}`
    );
  }
  return sourceSceneUrl(world, spatialUrl);
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
    clone.isPickable = true;
    clone.collisionMask = 0x0000dad1;
    clone.alwaysSelectAsActiveMesh = false;
    // The source primitive remains authoritative until render streams also
    // become a dedicated package artifact.
    clone.material = source.material;
    if (meshName === "CLOUD_MDF") {
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
