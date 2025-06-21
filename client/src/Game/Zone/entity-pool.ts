import type * as BJS from "@babylonjs/core";
import {
  EntityAnimation,
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
    if (spawn.isNpc) {
      //   return;
    }

    if (!spawn.name.includes('Connie')) {
      return;
    }

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
    const e = this.entities[sp.spawnId];
    if (!e || !e.spawn) return;

    const { x, y, z } = sp.position;
    e.setPosition(x, y, z);

    const vx = sp.velocity.x;
    const vy = sp.velocity.y;
    const vz = sp.velocity.z;
    e.setVelocity(vx, vy, vz);

    const speed2 = vx*vx + vz*vz;
    if (speed2 > 1e-6) {
    // compute, then flip 180°
      const raw = Math.atan2(vz, vx);
      const yawFromVel = raw + Math.PI;
      e.setRotation(yawFromVel);
    } else {
      e.setRotation(sp.heading);
    }

    if (sp.animation) {
      e.playAnimation(sp.animation);
    }
  }




  PlayAnimation(anim: EntityAnimation) {
    const e = this.entities[anim.spawnId];
    if (!e || !e.spawn) return;
    e.playAnimation(anim.animation);
  }
}
