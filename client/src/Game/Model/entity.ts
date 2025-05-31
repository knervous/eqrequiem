// src/Game/Model/entity.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import { AnimationDefinitions } from "@game/Animation/animation-constants";

export type EntityContainer = {
  mesh: BJS.Mesh;
  animationRanges: { name: string; from: number; to: number }[];
  manager: BJS.BakedVertexAnimationManager | null;
  renderObserver: BJS.Observer<BJS.Scene> | null;

};

export class Entity  extends BABYLON.TransformNode {
  public entityContainer: EntityContainer;
  public spawn: Spawn;
  private instance: BJS.InstancedMesh;
  private instanceBuffer: BJS.Vector4 = new BABYLON.Vector4(10, 230, 0, 60);
  constructor(spawn: Spawn, container: EntityContainer, scene: BJS.Scene, node: BJS.Node) {
    super(`${spawn.name}_${spawn.spawnId}`, scene);

    this.entityContainer = container;
    this.spawn = spawn;
    this.scene = scene;
    this.parent = node;

    // Set up main instance
    this.instance = container.mesh.createInstance(`${spawn.name}_${spawn.spawnId}`);
    this.instance.setParent(this);
    this.instance.rotationQuaternion = null;
    this.instance.rotation.set(0, Math.PI, 0); // Apply rotationFix
    this.instance.scaling.setAll(1); // Apply scale
    this.instance.metadata = { sessionId: `${spawn.spawnId}` };
    this.instance.instancedBuffers.bakedVertexAnimationSettingsInstanced = this.instanceBuffer;
    this.instance.position = new BABYLON.Vector3(
      -this.spawn.y,
      this.spawn.z,
      this.spawn.x,
    );
    // Start with the first animation (assumed to be Idle) or a fallback
    this.playAnimation(AnimationDefinitions.Kick, true);
  }

  public playAnimation(animation: string, loop: boolean) {
    const animIndex = this.entityContainer.animationRanges.findIndex(
      (range) => range.name === animation,
    );
    if (animIndex === -1) {
      console.warn(`Animation ${animation} not found in entity container.`);
      return;
    }
    console.log('Found anim index', animIndex, 'for animation', animation);
    const animRange = this.entityContainer.animationRanges[animIndex];
    this.currentAnim = {
      index: animIndex,
      loop,
      speed: 1,
      ranges: animRange,
    };

    // // Update VAT parameters for the selected animation range
    this.instance.instancedBuffers.bakedVertexAnimationSettingsInstanced.set(
      animRange.from, // Start frame
      animRange.to,   // End frame
      0,   // Loop flag (1 for looping, 0 for non-looping)
      60,
    );

    // Reset VAT time to the start of the animation
  }
  public stopAnimation() {
    this.playAnimation(AnimationDefinitions.Idle2, true);
  }

}