// src/game/Actor/ActorPool.ts
import { Node3D } from "godot";
import Actor from "@game/Actor/actor";
import ObjectMesh from "@game/Object/object-geometry";

type ModelKey = string;

export default class ActorPool {
  private parent: Node3D;
  private packedScenes: Record<ModelKey, Promise<Actor>> = {};
  private freeLists: Record<ModelKey, Node3D[]> = {};

  constructor(parent: Node3D) {
    this.parent = parent;
  }

  /** 
   * Ensure we have a packed scene ready for this model. 
   * Returns the “base” Actor (with its packedScene created). 
   */
  async preloadModel(model: string): Promise<Actor> {
    if (!this.packedScenes[model]) {
      const base = new ObjectMesh("objects", "barrel3", true);
      // createPackedScene() calls instantiate() under the hood, then packs its node
      await base.createPackedScene();
      this.packedScenes[model] = Promise.resolve(base);
      this.freeLists[model] = [];
    }
    return this.packedScenes[model]!;
  }

  /** 
   * Grab an instance from the pool (or make a new one). 
   */
  async acquire(model: string): Promise<Node3D> {
    const base = await this.preloadModel(model);

    // reuse if possible
    const freeList = this.freeLists[model]!;
    if (freeList.length > 0) {
      const node = freeList.pop()!;
      return node;
    }

    // otherwise instance a new one
    const instance = (base.instancePackedScene(this.parent, true) as Node3D);
    return instance;
  }

  /** 
   * “Release” an actor node back into the pool. 
   * You should call this instead of queue_free() when an actor goes away. 
   */
  release(model: string, node: Node3D) {
    // detach from scene so it can be re-added later
    if (node.get_parent()) {
      node.get_parent().remove_child(node);
    }
    this.freeLists[model]!.push(node);
  }
}
