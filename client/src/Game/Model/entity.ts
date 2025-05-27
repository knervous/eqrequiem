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
  private equipments: BJS.InstancedMesh[] = [];
  private scene: BJS.Scene;
  private currentAnim: { index: number; loop: boolean; speed: number; ranges: { from: number; to: number } } | null = null;
  private currentAnimVATTimeAtStart: number = 0;
  private currentAnimVATOffset: number = 0;
  private fromFrame: number = 0;
  private toFrame: number = 0;
  private endOfLoop: boolean = false;

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
    this.instance.instancedBuffers.bakedVertexAnimationSettingsInstanced = new BABYLON.Vector4(0, 0, 0, 0);
    this.instance.position = new BABYLON.Vector3(
      -this.spawn.y,
      this.spawn.z,
      this.spawn.x,
    );
    // Start with the first animation (assumed to be Idle) or a fallback
    this.playAnimation(AnimationDefinitions.Idle1, true);
  }

  public playAnimation(animation: string, loop: boolean) {
    // Find the animation range by name
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

    // Update animation settings
    this.setAnimationParameters(
      this.instance.instancedBuffers.bakedVertexAnimationSettingsInstanced,
      this.currentAnim,
    );

    // Register render observer for non-looping animation completion
    if (!loop && !this.endOfLoop) {
      const observer = this.scene.onBeforeRenderObservable.add(() => {
        const currentVATTime = this.entityContainer.manager!.time;
        const currentAnimFrame = Math.floor((currentVATTime - this.currentAnimVATTimeAtStart) * 60);
        if (currentAnimFrame >= this.toFrame - this.fromFrame) {
          this.instance.instancedBuffers.bakedVertexAnimationSettingsInstanced.set(
            this.toFrame - 1,
            this.toFrame,
            this.currentAnimVATOffset,
            60,
          );
          this.equipments.forEach((item) => {
            item.instancedBuffers.bakedVertexAnimationSettingsInstanced.set(
              this.toFrame - 1,
              this.toFrame,
              this.currentAnimVATOffset,
              60,
            );
          });
          this.endOfLoop = true;
          this.scene.onBeforeRenderObservable.remove(observer);
          // Revert to first animation (assumed Idle) after a delay
          setTimeout(() => {
            this.endOfLoop = false;
            this.playAnimation(AnimationDefinitions.Idle1, true);
          }, 2000);
        }
      });
    }
  }

  public stopAnimation() {
    this.playAnimation(AnimationDefinitions.Idle2, true);
  }

  private computeOffsetInAnim(fromFrame: number, toFrame: number, time: number, fps: number = 60): number {
    const totalFrames = toFrame - fromFrame + 1;
    const t = (time * fps) / totalFrames;
    const frame = Math.floor((t - Math.floor(t)) * totalFrames);
    return totalFrames - frame;
  }

  private setAnimationParameters(vec: BJS.Vector4, currentAnim: any, fps: number = 60) {
    const anim = currentAnim.ranges;
    this.fromFrame = Math.floor(anim.from);
    this.toFrame = Math.floor(anim.to) - 1;
    console.log('Set anim params', anim);
    this.currentAnimVATTimeAtStart = this.entityContainer.manager!.time;
    this.currentAnimVATOffset = this.computeOffsetInAnim(this.fromFrame, this.toFrame, this.currentAnimVATTimeAtStart, fps);
    vec.set(this.fromFrame, this.toFrame, this.currentAnimVATOffset, fps);
  }
}