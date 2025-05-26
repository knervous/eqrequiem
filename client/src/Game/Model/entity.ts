// src/Game/Model/entity.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import { AnimationDefinitions } from "@game/Animation/animation-constants";

export type EntityContainer = {
  meshes: BJS.Mesh[];
  animationRanges: BJS.Nullable<BJS.AnimationRange>[];
  manager: BJS.BakedVertexAnimationManager | null;
  renderObserver: BJS.Observer<BJS.Scene> | null;
};

export class Entity {
  public entityContainer: EntityContainer;
  public spawn: Spawn;
  private scene: BJS.Scene;
  private nodeContainer: BJS.TransformNode | null = null;
  public instance: BJS.InstancedMesh | null = null;
  private animationVector: BJS.Vector4 = new BABYLON.Vector4(0, 0, 0, 0);
  constructor(
    spawn: Spawn,
    container: EntityContainer,
    scene: BJS.Scene,
    node: BJS.Node,
  ) {
    this.entityContainer = container;
    this.nodeContainer = new BABYLON.TransformNode(
      `${spawn.name}_${spawn.spawnId}`,
      scene,
    ) as BJS.TransformNode;
    this.nodeContainer.position = new BABYLON.Vector3(
      -spawn.y,
      spawn.z,
      spawn.x,
    );
    this.nodeContainer.scaling.setAll(2);
    this.nodeContainer.parent = node;
    this.scene = scene;
    this.spawn = spawn;
    let i = 0;
    for (const mesh of this.entityContainer.meshes) {
      const instance = mesh.createInstance(
        `${this.spawn.name}_${this.spawn.spawnId}_${i++}`,
      );
      if (instance.instancedBuffers) {
        instance.instancedBuffers.bakedVertexAnimationSettingsInstanced =
        this.animationVector;
      }
      instance.parent = this.nodeContainer;
    }
    this.playAnimation(AnimationDefinitions.Idle2);
  }

  public playAnimation(animation: string) {
    const animationRange =
      this.entityContainer.animationRanges.find(
        (range) => range!.name === animation,
      ) ?? this.entityContainer.animationRanges[0];
    if (animationRange) {
      this.animationVector.set(animationRange.from, animationRange.to, 0, 60);
    } else {
      console.warn(`Animation ${animation} not found in entity container.`);
    }
  }
  public stopAnimation() {}
}
