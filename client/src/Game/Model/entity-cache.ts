// src/game/Actor/ActorPool.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import { AnimationDefinitions } from "@game/Animation/animation-constants";

type ModelKey = string;

export default class EntityCache {
  public containers: Record<ModelKey, Promise<BJS.AssetContainer>> = {};
  private physicsBodies: Record<ModelKey, BJS.PhysicsBody[] | null> = {};
  private entityContainer: BJS.TransformNode | null = null;
  private intervals: NodeJS.Timeout[] = [];
  constructor(container: BJS.TransformNode | null = null) {
    if (container) {
      this.entityContainer = container;
    }
  }

  async getContainer(
    model: string,
    scene: BJS.Scene,
  ): Promise<BJS.AssetContainer | null> {
    if (!this.containers[model]) {
      this.containers[model] = new Promise(async (res) => {
        const bytes = await FileSystem.getFileBytes(
          `eqrequiem/models`,
          `${model}.glb`,
        );
        if (!bytes) {
          console.warn(`[EntityCache] Failed to load model ${model}`);
          return null;
        }
        const file = new File([bytes!], `${model}.glb`, {
          type: "model/gltf-binary",
        });
        const result = await BABYLON.LoadAssetContainerAsync(file, scene);
        if (!result) {
          console.error(`Failed to load model ${model}`);
          return null;
        }
        //console.log('Redult', result);
        // if (this.entityContainer) {
        //   result.rootNodes[0].parent = this.entityContainer;
        // }
        result.rootNodes[0].name = `container_${model}`;
        res(result);
      });

   
    }
    return this.containers[model]!;
  }

  async getInstance(model: ModelKey, scene: BJS.Scene) : (Promise<BJS.Mesh | null>) {
    const container = await this.getContainer(model, scene);
    if (!container) { return null; }
    //console.log('Cont', container);
    const instance = container.instantiateModelsToScene(() => model, false, { doNotInstantiate: true });
    const ag = instance.animationGroups.find((a) => a.name === AnimationDefinitions.Idle1 || a.targetedAnimations[0].animation.name.startsWith(AnimationDefinitions.Idle1));
    if (ag) {
      ag.loopAnimation = true;
      ag.start();
    } else {
      console.warn(`Animation ${AnimationDefinitions.Idle1} not found for model ${model}`);
    }
    //console.log('Instance', instance);
    return instance.rootNodes[0] as BJS.Mesh;
  }

  dispose(model: ModelKey): void {
    if (model in this.containers) {
      this.containers[model].then((container) => {
        // Dispose of physics body if it exists
        if (this.physicsBodies[model]) {
          this.physicsBodies[model]?.forEach?.((p) => p.dispose());
          delete this.physicsBodies[model];
        }
        // Dispose of the container
        container.dispose();
      });
      // Remove from cache
      delete this.containers[model];
    }
  }

  disposeAll(): void {
    this.intervals.forEach((interval) => clearInterval(interval));

    Object.keys(this.containers).forEach((model) => this.dispose(model));
  }
}