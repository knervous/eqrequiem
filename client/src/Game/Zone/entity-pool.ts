
// src/Game/Zone/entity-pool.ts
import type * as BJS from "@babylonjs/core";

import ObjectMesh from "@game/Object/object-geometry";
import { EntityAnimation, EntityPositionUpdate, Spawn } from "@game/Net/internal/api/capnp/common";
import { Grid } from "./zone-grid";
import EntityCache from "@game/Model/entity-cache";
import { Entity } from "@game/Model/entity";
import { capnpToPlainObject } from "@game/Constants/util";
import { AnimationDefinitions } from "@game/Animation/animation-constants";

export default class EntityPool {
  parent: BJS.Node;
  entities: Record<number, Entity> = {};
  entityContainer: Record<string, Promise<ObjectMesh>> = {};
  entityObjectContainer: BJS.Node | null = null;
  loadedPromiseResolve: () => void = () => {};
  loadedPromise: Promise<void> | null = null;
  actorPool: EntityCache | null = null;
  private grid: Grid;
  private spawns: Record<number, Spawn> = {};
  private scene: BJS.Scene;

  constructor(parent: BJS.Node, scene: BJS.Scene) {
    this.scene = scene;
    this.parent = parent;
    // Only cellSize is needed now; we use string-based keys internally
    this.grid = new Grid(300.0);
    this.actorPool = new EntityCache();
  }


  dispose() {
    if (this.entityObjectContainer) {
      this.entityObjectContainer.dispose();
      this.entityObjectContainer = null;
    }
  }


  async process(_: number) {
    return;
   
  }

  async AddSpawn(spawn: Spawn) {
    // Filter for dev
    if (!spawn.name.includes("Guard") && !spawn.name.includes('Tubal')) return;
    console.log('Adding spawn', spawn.spawnId, spawn.name, {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      cellX: spawn.cellX,
      cellY: spawn.cellY,
      cellZ: spawn.cellZ,
    });
    this.spawns[spawn.spawnId] = spawn;
    this.grid.addSpawn(spawn);

    const entity = await this.actorPool!.getInstance(spawn, this.scene!, this.parent!);
    if (!entity) {
      console.error("Failed to acquire entity for spawn", spawn.spawnId);
      return;
    }
    entity.playAnimation(AnimationDefinitions.Idle2, true);
    this.entities[spawn.spawnId] = entity;

  }

  UpdateSpawnPosition(sp: EntityPositionUpdate) {
    // Disable this for NPC for now, work on it later
    return;
   
  }

  PlayAnimation(anim: EntityAnimation) {

  }

}
