// src/game/Actor/ActorPool.ts
import { Node3D } from "godot";
import Entity from "@game/Entity/entity";
import { Vector3 } from "@/godot-module";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import RACE_DATA from "@game/Constants/race-data";
type ModelKey = string;

export default class EntityCache {
  private packedScenes: Record<ModelKey, Promise<Entity>> = {};
  public Instances: Record<number, Entity> = {};

  /** 
   * Ensure we have a packed scene ready for this model. 
   * Returns the “base” Actor (with its packedScene created). 
   */
  async preloadModel(model: string): Promise<Entity> {
    if (!this.packedScenes[model]) {
      const base = new Entity("models", model);
      await base.createPackedEntityScene();
      this.packedScenes[model] = Promise.resolve(base);
    }
    return this.packedScenes[model]!;
  }

  /** 
   * Grab an instance from the pool (or make a new one). 
   */
  async acquire(spawn: Spawn, container: Node3D): Promise<Entity | null> {
    const race = spawn?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[spawn?.gender ?? 0] || raceDataEntry[2];
    const base = await this.preloadModel(model);


    const instance = (base.instancePackedActorScene() as Node3D);

    if (!instance) {
      console.error("Failed to acquire actor base");
      return null;
    }
    container.add_child(instance);
    instance.global_position = new Vector3(-spawn.y, spawn.z, spawn.x);
    //
    //instance.visible = true;
    const scale = (spawn.size ?? 0) === 0 ? 1.5 : spawn.size / 4;
    instance.scale = new Vector3(scale, scale, scale);
    const entity = base.clone(instance, spawn);
    entity.setNameplate(spawn.name);
    return entity;
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
  }
}
