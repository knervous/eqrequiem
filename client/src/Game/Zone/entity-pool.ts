

import type * as BJS from "@babylonjs/core";

import { EntityAnimation, EntityPositionUpdate, Spawn } from "@game/Net/internal/api/capnp/common";
import { Entity } from "@game/Model/entity";
import { Grid } from "./zone-grid";
import EntityCache from "@game/Model/entity-cache";

export default class EntityPool {
  parent: BJS.Node;
  entities: Record<number, Entity> = {};
  entityObjectContainer: BJS.Node | null = null;
  loadedPromiseResolve: () => void = () => {};
  loadedPromise: Promise<void> | null = null;
  entityCache: EntityCache | null = null;
  private grid: Grid;
  private spawns: Record<number, Spawn> = {};
  private scene: BJS.Scene;

  constructor(parent: BJS.Node, scene: BJS.Scene) {
    this.scene = scene;
    this.parent = parent;
    this.grid = new Grid(300.0, scene);
    this.entityCache = new EntityCache(this.parent);
  }

  dispose() {
    if (this.entityObjectContainer) {
      this.entityObjectContainer.dispose();
      this.entityObjectContainer = null;
    }
  }


  async process() {
    return;
  
  }

  async AddSpawn(spawn: Spawn) {
    // if (!spawn.name.includes('Fippy')) return;
    console.log('Adding spawn', spawn.spawnId, spawn.name, {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      cellX: spawn.cellX,
      cellY: spawn.cellY,
      cellZ: spawn.cellZ,
    });
    this.spawns[spawn.spawnId] = spawn;

    const entity = await this.entityCache!.getInstance(spawn, this.scene!);
    if (!entity) {
      console.error("Failed to acquire entity for spawn", spawn.spawnId);
      return;
    }
    this.grid.addEntity(entity);

    //await entity.initialize();
    // Going to call this when syncing with grid system
    // entity.hide();
    this.entities[spawn.spawnId] = entity;

  }

  UpdateSpawnPosition(sp: EntityPositionUpdate) {
    // Disable this for NPC for now, work on it later
    console.log(sp);
    return;
  }

  PlayAnimation(anim: EntityAnimation) {
    const e = this.entities[anim.spawnId];
    if (!e || !e.spawn) return;
  }

}
