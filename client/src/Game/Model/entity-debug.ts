
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type { Entity } from "./entity";

export class DebugWireframe {
  private wireframeMesh: BJS.Mesh | null = null;
  private scene: BJS.Scene;
  private entity: Entity;
  private static enabled: boolean = true;

  constructor(entity: Entity, scene: BJS.Scene) {
    this.entity = entity;
    this.scene = scene;
  }

  public static toggleDebugWireframes(): void {
    DebugWireframe.enabled = !DebugWireframe.enabled;
    console.log(`[DebugWireframe] Wireframes ${DebugWireframe.enabled ? 'enabled' : 'disabled'}`);
  }

  public createWireframe(): void {
    if (!DebugWireframe.enabled || this.wireframeMesh || !this.entity.entityContainer.boundingBox) {
      return;
    }

    const boundingBox = this.entity.entityContainer.boundingBox;
    const min = new BABYLON.Vector3(boundingBox.min[0], boundingBox.min[1], boundingBox.min[2]);
    const max = new BABYLON.Vector3(boundingBox.max[0], boundingBox.max[1], boundingBox.max[2]);

    // Calculate center and extents
    const center = BABYLON.Vector3.Center(min, max);
    const extents = max.subtract(min).scale(0.5);

    // Create wireframe box
    this.wireframeMesh = BABYLON.MeshBuilder.CreateBox(
      `wireframe_${this.entity.spawn.name}_${this.entity.spawn.spawnId}`,
      {
        width: extents.x * 2,
        height: extents.z * 2,
        depth: extents.y,
      },
      this.scene,
    );

    // Set wireframe material
    const material = new BABYLON.StandardMaterial(`wireframe_mat_${this.entity.spawn.name}`, this.scene);
    material.wireframe = true;
    material.emissiveColor = new BABYLON.Color3(0, 1, 0); // Green wireframe
    this.wireframeMesh.material = material;

    // Parent to the physics node's transform and position at the center
    this.wireframeMesh.parent = this.entity.physicsBody?.transformNode || null;
    this.wireframeMesh.position = center;
    this.wireframeMesh.position.y += boundingBox.yOffset;
    //this.wireframeMesh.position.y += 5; // Adjust height to match entity's position
    // Apply scaling to match entity
    this.wireframeMesh.scaling.setAll(1.5); // Match the entity's scaling
  }

  public dispose(): void {
    if (this.wireframeMesh) {
      this.wireframeMesh.dispose();
      this.wireframeMesh = null;
    }
  }
}