import type * as BJS from "@babylonjs/core";
import {
  EntityAnimation,
  EntityPositionUpdate,
  EntityPositionUpdateBase,
  Spawn,
} from "@game/Net/internal/api/capnp/common";
import { Entity } from "@game/Model/entity";
import { Grid } from "./zone-grid";
import EntityCache from "@game/Model/entity-cache";
import type GameManager from "@game/Manager/game-manager";

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

  constructor(private gameManager: GameManager, parent: BJS.Node, scene: BJS.Scene) {
    this.scene = scene;
    this.parent = parent;
    this.grid = new Grid(300.0, scene);
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
    // if (!spawn.name.includes('Moodoro')) return;
    console.log("Adding spawn", spawn.spawnId, spawn.name, {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      cellX: spawn.cellX,
      cellY: spawn.cellY,
      cellZ: spawn.cellZ,
    });
    this.spawns[spawn.spawnId] = spawn;

    const entity = await EntityCache.getInstance(this.gameManager, spawn, this.scene!, this.parent);
    if (!entity) {
      console.error("Failed to acquire entity for spawn", spawn.spawnId);
      return;
    }
    this.grid.addEntity(entity);
    this.entities[spawn.spawnId] = entity;
  }

  UpdateSpawnPosition(sp: EntityPositionUpdateBase) {
    // Disable this for NPC for now, work on it later
    const entity = this.entities[sp.spawnId];
    if (!entity || !entity.spawn) {
      console.warn("Entity not found for spawnId", sp.spawnId);
    }
    // console.log("Updating spawn position", entity.name, sp.spawnId, {
    //   x: sp.position.x,
    //   y: sp.position.y,
    //   z: sp.position.z,
    // });
    entity.setPosition(sp.position.x, sp.position.y, sp.position.z);
    return;
  }

  PlayAnimation(anim: EntityAnimation) {
    const e = this.entities[anim.spawnId];
    if (!e || !e.spawn) return;
  }
}
