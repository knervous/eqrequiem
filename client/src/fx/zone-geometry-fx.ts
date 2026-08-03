import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import type {
  ShadoWorldSpatialPackage,
  ShadoWorldVisibilityCoordinator,
} from "@knervous/shado/world";
import {
  createGrassClumpGeometry,
  createGrassCellsForSurface,
  createGrassCrossGeometry,
} from "./grass-geometry";
import {
  GRASS_NEAR_ENABLE_RADIUS,
  PromotedGrassCellStreamer,
} from "./grass-cell-streamer";
import { createGrassMaterial } from "./grass-shader";
import { createGrassSurfaceMaterial } from "./grass-surface-shader";
import { ShadoSceneFxVisibility } from "./scene-fx-visibility";
import { createWaterMaterial } from "./water-shader";
import { bindZoneShaderLighting } from "./zone-shader-lighting";

type ZoneShaderRole = "grass" | "water";

const MAX_ZONE_GRASS_BLADES = 48_000;
const MAX_GRASS_BLADES_PER_SURFACE = 18_000;

function shaderRole(material: BJS.Material | null): ZoneShaderRole | null {
  const extras = material?.metadata?.gltf?.extras as
    { eltania?: { extraShader?: unknown } } | undefined;
  const role = extras?.eltania?.extraShader;
  return role === "grass" || role === "water" ? role : null;
}

function baseColorTexture(
  material: BJS.Material | null,
): BJS.BaseTexture | null {
  if (material instanceof BABYLON.PBRMaterial) {
    return material.albedoTexture;
  }
  if (material instanceof BABYLON.StandardMaterial) {
    return material.diffuseTexture;
  }
  return null;
}

type GrassSpatialSegment = {
  surface: BJS.Mesh;
  cluster: number | null;
  sourceIndices?: number[];
};

type TerrainTintAccumulator = {
  red: number;
  green: number;
  blue: number;
  count: number;
};

function coarseGrassTerrainTints(
  surfaces: readonly BJS.Mesh[],
  grass: ShadoWorldSpatialPackage["grass"],
  useVertexTint: boolean,
): ReadonlyMap<string, readonly [number, number, number]> {
  const result = new Map<string, readonly [number, number, number]>();
  if (!grass || !useVertexTint) return result;

  const samples = new Map<string, TerrainTintAccumulator>();
  for (const surface of surfaces) {
    const positions = surface.getVerticesData(
      BABYLON.VertexBuffer.PositionKind,
    );
    const colors = surface.getVerticesData(BABYLON.VertexBuffer.ColorKind);
    const colorSize = surface
      .getVertexBuffer(BABYLON.VertexBuffer.ColorKind)
      ?.getSize();
    if (!positions || !colors || !colorSize || colorSize < 3) continue;
    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
      const x = Math.floor(positions[vertex * 3]! / grass.cellSize);
      const z = Math.floor(positions[vertex * 3 + 2]! / grass.cellSize);
      const key = `${x}:${z}`;
      let sample = samples.get(key);
      if (!sample) {
        sample = { red: 0, green: 0, blue: 0, count: 0 };
        samples.set(key, sample);
      }
      sample.red += Math.min(1, Math.max(0.18, colors[vertex * colorSize]!));
      sample.green += Math.min(
        1,
        Math.max(0.18, colors[vertex * colorSize + 1]!),
      );
      sample.blue += Math.min(
        1,
        Math.max(0.18, colors[vertex * colorSize + 2]!),
      );
      sample.count++;
    }
  }

  for (let cell = 0; cell < grass.cells.x.length; cell++) {
    const x = grass.cells.x[cell]!;
    const z = grass.cells.z[cell]!;
    let matched: TerrainTintAccumulator | undefined;
    // Large terrain triangles can leave a cell without an owned vertex. A
    // small neighborhood search keeps the sample coarse and avoids hard gaps.
    for (let radius = 0; radius <= 2 && !matched; radius++) {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) {
            continue;
          }
          const candidate = samples.get(`${x + dx}:${z + dz}`);
          const distance = dx * dx + dz * dz;
          if (candidate && distance < bestDistance) {
            matched = candidate;
            bestDistance = distance;
          }
        }
      }
    }
    if (matched) {
      result.set(`${x}:${z}`, [
        matched.red / matched.count,
        matched.green / matched.count,
        matched.blue / matched.count,
      ]);
    }
  }
  return result;
}

function grassSpatialSegments(
  surfaces: readonly BJS.Mesh[],
  _world: ShadoWorldSpatialPackage,
): GrassSpatialSegment[] {
  // Promoted world chunks are already compact primitive/cell batches. Their
  // local index buffers no longer share source-primitive index numbering, so
  // each bounded chunk is the correct grass-placement domain.
  return surfaces.map((surface) => ({ surface, cluster: null }));
}

export class ZoneGeometryFx {
  private elapsedSeconds = 0;
  private lastGrassLightingSampleSeconds = Number.NEGATIVE_INFINITY;

  private constructor(
    private readonly visibility: ShadoSceneFxVisibility,
    private readonly scene: BJS.Scene,
    private readonly grassMaterial: BJS.ShaderMaterial | null,
    private readonly farGrassMaterial: BJS.ShaderMaterial | null,
    private readonly grassSurfaceMaterials: BJS.ShaderMaterial[],
    private readonly waterMaterial: BJS.ShaderMaterial | null,
    private readonly grassMeshes: BJS.Mesh[],
    private readonly grassTemplate: BJS.Mesh | null,
    private readonly farGrassTemplate: BJS.Mesh | null,
    private readonly grassStreamer: PromotedGrassCellStreamer | null,
  ) {}

  static attach(
    meshes: readonly BJS.Mesh[],
    scene: BJS.Scene,
    world: ShadoWorldSpatialPackage,
    coordinator: ShadoWorldVisibilityCoordinator,
  ): ZoneGeometryFx {
    const visibility = new ShadoSceneFxVisibility(world, coordinator, scene);
    const staticMaterials = new Set<BJS.Material>();
    for (const mesh of meshes) {
      if (mesh.material && !shaderRole(mesh.material)) {
        staticMaterials.add(mesh.material);
      }
    }
    for (const material of staticMaterials) material.freeze();

    const grassSurfaces = meshes.filter(
      (mesh) => shaderRole(mesh.material) === "grass",
    );
    const waterSurfaces = meshes.filter(
      (mesh) => shaderRole(mesh.material) === "water",
    );
    const grassMaterial = grassSurfaces.length
      ? createGrassMaterial(scene, {
          name: "RequiemGrassMaterial:near",
          fadeStart: 94,
          fadeEnd: 122,
          densityFadeStart: 70,
          densityFadeEnd: 114,
          minimumDensity: 0.62,
        })
      : null;
    const grassTemplate = grassMaterial
      ? createGrassClumpGeometry(scene)
      : null;
    if (grassTemplate) {
      grassTemplate.material = grassMaterial;
      grassTemplate.setEnabled(false);
    }
    const farGrassMaterial =
      world.grass && grassSurfaces.length
        ? createGrassMaterial(scene, {
            name: "RequiemGrassMaterial:far",
            windStrength: 0.12,
            baseColor: BABYLON.Color3.FromHexString("#52743B"),
            colorVariance: 0.1,
            fadeInStart: 90,
            fadeInEnd: 118,
            fadeStart: 205,
            fadeEnd: 250,
            densityFadeStart: 160,
            densityFadeEnd: 238,
            minimumDensity: 0.32,
          })
        : null;
    const farGrassTemplate = farGrassMaterial
      ? createGrassCrossGeometry(scene, "RequiemGrassFarTemplate")
      : null;
    if (farGrassTemplate) {
      farGrassTemplate.material = farGrassMaterial;
      farGrassTemplate.setEnabled(false);
    }
    const waterMaterial = waterSurfaces.length
      ? createWaterMaterial(scene, {
          useVertexLighting:
            world.lighting?.vertexColors === "baked-irradiance",
        })
      : null;
    const grassSurfaceMaterials: BJS.ShaderMaterial[] = [];
    const grassMeshes: BJS.Mesh[] = [];
    let remainingGrassBlades = MAX_ZONE_GRASS_BLADES;
    const grassSegments = grassSpatialSegments(grassSurfaces, world);
    const terrainTintByCell = coarseGrassTerrainTints(
      grassSurfaces,
      world.grass,
      world.lighting?.vertexColors === "material-tint",
    );

    for (const surface of grassSurfaces) {
      const baseTexture = baseColorTexture(surface.material);
      if (!baseTexture) continue;
      const surfaceMaterial = createGrassSurfaceMaterial(
        scene,
        baseTexture,
        world.lighting?.vertexColors === "material-tint" ||
          world.lighting?.vertexColors === "baked-irradiance",
      );
      grassSurfaceMaterials.push(surfaceMaterial);
      surface.material = surfaceMaterial;
    }

    const grassStreamer = world.grass
      ? new PromotedGrassCellStreamer(
          world.grass,
          grassTemplate!,
          grassMaterial!,
          farGrassTemplate!,
          farGrassMaterial!,
          visibility,
          terrainTintByCell,
        )
      : null;
    if (world.grass) {
      remainingGrassBlades -= world.grass.placements.positionX.length;
    } else {
      console.warn(
        "[ZoneFX] promoted grass data is absent; using runtime surface conversion",
      );
      for (let index = 0; index < grassSegments.length; index++) {
        if (remainingGrassBlades <= 0) break;
        const segment = grassSegments[index]!;
        const segmentsRemaining = grassSegments.length - index;
        const cells = createGrassCellsForSurface(
          segment.surface,
          grassTemplate!,
          grassMaterial!,
          {
            cellSize: 24,
            maxBlades: Math.min(
              MAX_GRASS_BLADES_PER_SURFACE,
              Math.ceil(remainingGrassBlades / segmentsRemaining),
            ),
            seed: 0xe17a_91a + index * 0x9e37,
            sourceIndices: segment.sourceIndices,
            nameSuffix:
              segment.cluster === null ? "" : `:cluster-${segment.cluster}`,
          },
        );
        for (const cell of cells) {
          remainingGrassBlades -= cell.bladeCount;
          grassMeshes.push(cell.mesh);
          visibility.registerMesh(cell.mesh, {
            id: cell.mesh.name,
            profile: "near-detail",
            maxDistance: GRASS_NEAR_ENABLE_RADIUS,
          });
        }
      }
    }
    for (const surface of waterSurfaces) {
      surface.material = waterMaterial;
      surface.isPickable = false;
    }

    bindZoneShaderLighting(scene, [
      grassMaterial,
      farGrassMaterial,
      ...grassSurfaceMaterials,
      waterMaterial,
    ]);

    console.info(
      `[ZoneFX] grass=${grassMeshes.length} cells/${MAX_ZONE_GRASS_BLADES - remainingGrassBlades} blades, ` +
        `water=${waterSurfaces.length} surfaces, ` +
        `patterns=${visibility.authoredPatterns.length}`,
    );
    return new ZoneGeometryFx(
      visibility,
      scene,
      grassMaterial,
      farGrassMaterial,
      grassSurfaceMaterials,
      waterMaterial,
      grassMeshes,
      grassTemplate,
      farGrassTemplate,
      grassStreamer,
    );
  }

  tick(
    deltaMs: number,
    camera: BJS.Camera | null,
    focusPosition: BJS.Vector3 | null = null,
  ): void {
    this.elapsedSeconds += Math.min(Math.max(deltaMs, 0), 100) / 1000;
    const grassFocus =
      focusPosition ?? camera?.globalPosition ?? BABYLON.Vector3.Zero();
    this.grassMaterial?.setFloat("uTime", this.elapsedSeconds);
    this.grassMaterial?.setVector3("uFocusPosition", grassFocus);
    this.farGrassMaterial?.setFloat("uTime", this.elapsedSeconds);
    this.farGrassMaterial?.setVector3("uFocusPosition", grassFocus);
    this.grassStreamer?.update(grassFocus);
    for (const material of this.grassSurfaceMaterials) {
      material.setFloat("uTime", this.elapsedSeconds);
    }
    if (this.waterMaterial) {
      this.waterMaterial.setFloat("uTime", this.elapsedSeconds);
      this.waterMaterial.setVector3(
        "uEyePosition",
        camera?.globalPosition ?? BABYLON.Vector3.Zero(),
      );
    }
    const refreshGrassLighting =
      this.elapsedSeconds - this.lastGrassLightingSampleSeconds >= 0.25;
    if (refreshGrassLighting) {
      this.lastGrassLightingSampleSeconds = this.elapsedSeconds;
    }
    bindZoneShaderLighting(this.scene, [
      ...(refreshGrassLighting
        ? [this.grassMaterial, this.farGrassMaterial]
        : []),
      ...this.grassSurfaceMaterials,
      this.waterMaterial,
    ]);
    this.visibility.tick(deltaMs);
  }

  dispose(): void {
    this.grassStreamer?.dispose();
    this.visibility.dispose();
    for (const mesh of this.grassMeshes) mesh.dispose(false, false);
    this.grassTemplate?.dispose(false, false);
    this.farGrassTemplate?.dispose(false, false);
    this.grassMaterial?.dispose();
    this.farGrassMaterial?.dispose();
    for (const material of this.grassSurfaceMaterials) material.dispose();
    this.waterMaterial?.dispose();
    this.grassSurfaceMaterials.length = 0;
    this.grassMeshes.length = 0;
  }
}
