import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { createGrassForSurface } from "./grass-geometry";
import { createGrassMaterial } from "./grass-shader";
import { createWaterMaterial } from "./water-shader";

type ZoneShaderRole = "grass" | "water";

const MAX_ZONE_GRASS_BLADES = 28_000;
const MAX_GRASS_BLADES_PER_SURFACE = 14_000;

function shaderRole(material: BJS.Material | null): ZoneShaderRole | null {
  const extras = material?.metadata?.gltf?.extras as
    | { eltania?: { extraShader?: unknown } }
    | undefined;
  const role = extras?.eltania?.extraShader;
  return role === "grass" || role === "water" ? role : null;
}

export class ZoneGeometryFx {
  private elapsedSeconds = 0;

  private constructor(
    private readonly grassMaterial: BJS.ShaderMaterial | null,
    private readonly waterMaterial: BJS.ShaderMaterial | null,
    private readonly grassMeshes: BJS.Mesh[],
  ) {}

  static attach(
    meshes: readonly BJS.Mesh[],
    scene: BJS.Scene,
  ): ZoneGeometryFx {
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
      ? createGrassMaterial(scene)
      : null;
    const waterMaterial = waterSurfaces.length
      ? createWaterMaterial(scene)
      : null;
    const grassMeshes: BJS.Mesh[] = [];
    let remainingGrassBlades = MAX_ZONE_GRASS_BLADES;

    for (let index = 0; index < grassSurfaces.length; index++) {
      if (remainingGrassBlades <= 0) break;
      const grass = createGrassForSurface(grassSurfaces[index]!, scene, {
        maxBlades: Math.min(
          MAX_GRASS_BLADES_PER_SURFACE,
          remainingGrassBlades,
        ),
        seed: 0xe17a_91a + index * 0x9e37,
      });
      if (!grass) continue;
      grass.material = grassMaterial;
      const bladeCount =
        (grass.metadata?.requiemGrassBladeCount as number | undefined) ?? 0;
      remainingGrassBlades -= bladeCount;
      grassMeshes.push(grass);
    }
    for (const surface of waterSurfaces) {
      surface.material = waterMaterial;
      surface.isPickable = false;
    }

    console.info(
      `[ZoneFX] grass=${grassMeshes.length} surfaces/${MAX_ZONE_GRASS_BLADES - remainingGrassBlades} blades, ` +
        `water=${waterSurfaces.length} surfaces`,
    );
    return new ZoneGeometryFx(grassMaterial, waterMaterial, grassMeshes);
  }

  tick(deltaMs: number, camera: BJS.Camera | null): void {
    this.elapsedSeconds += Math.min(Math.max(deltaMs, 0), 100) / 1000;
    this.grassMaterial?.setFloat("uTime", this.elapsedSeconds);
    if (this.waterMaterial) {
      this.waterMaterial.setFloat("uTime", this.elapsedSeconds);
      this.waterMaterial.setVector3(
        "uEyePosition",
        camera?.globalPosition ?? BABYLON.Vector3.Zero(),
      );
    }
  }

  dispose(): void {
    for (const mesh of this.grassMeshes) mesh.dispose(false, false);
    this.grassMaterial?.dispose();
    this.waterMaterial?.dispose();
    this.grassMeshes.length = 0;
  }
}
