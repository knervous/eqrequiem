
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { vec3 } from "gl-matrix";

import ObjectMesh from "@game/Object/object-geometry";
import { EntityAnimation, EntityPositionUpdate, Spawn } from "@game/Net/internal/api/capnp/common";
import Player from "@game/Player/player";
import Entity from "@game/Entity/entity";
import { Grid } from "./zone-grid";
import EntityCache from "@game/Model/entity-cache";
import RACE_DATA from "@game/Constants/race-data";

type CellTriple = [number, number, number];
type Vec3 = { x: number; y: number; z: number };

export default class EntityPool {
  parent: BJS.Node;
  entities: Record<number, Entity> = {};
  entityContainer: Record<string, Promise<ObjectMesh>> = {};
  entityObjectContainer: BJS.Node | null = null;
  loadedPromiseResolve: () => void = () => {};
  loadedPromise: Promise<void> | null = null;
  actorPool: EntityCache | null = null;
  private spawnQueue: Set<Spawn> = new Set();  
  private grid: Grid;
  private spawns: Record<number, Spawn> = {};
  private maxInstantiated: number = 50;
  private accumulatedDelta: number = 0;
  private scene: BJS.Scene;

  constructor(parent: BJS.Node, scene: BJS.Scene) {
    this.scene = scene;
    this.parent = parent;
    // Only cellSize is needed now; we use string-based keys internally
    this.grid = new Grid(300.0);
    this.actorPool = new EntityCache(this.parent as BJS.TransformNode);
  }

  dispose() {
    if (this.entityObjectContainer) {
      this.entityObjectContainer.dispose();
      this.entityObjectContainer = null;
    }
  }


  async process(delta: number) {
    return;
    this.accumulatedDelta += delta;
    if (this.accumulatedDelta < 1000) return;
    this.accumulatedDelta = 0;

    if (!Player.instance) return;

    const playerPos3D = Player.instance.mesh!.position!;
    const logicalPlayer: Vec3 = {
      x: -playerPos3D.x,
      y: playerPos3D.z,
      z: playerPos3D.y,
    };

    const nearbySpawnIds = this.grid.getNearbySpawnIds(logicalPlayer);
    const playerVec = vec3.fromValues(
      playerPos3D.x,
      playerPos3D.y,
      playerPos3D.z,
    );

    // sort queue by distance
    const sortedSpawns = Array.from(this.spawnQueue).sort((a, b) => {
      const pa = vec3.fromValues(-a.y, a.z, a.x);
      const pb = vec3.fromValues(-b.y, b.z, b.x);
      return vec3.squaredDistance(pa, playerVec) 
           - vec3.squaredDistance(pb, playerVec);
    });

    // // free distant entities
    // if (Object.keys(this.entities).length >= this.maxInstantiated) {
    //   for (const sidStr in this.entities) {
    //     const sid = Number(sidStr);
    //     if (!nearbySpawnIds.includes(sid)) {
    //       const ent = this.entities[sid];
    //       const spawn = this.spawns[sid];
    //       this.grid.removeSpawn(spawn);
    //       ent.getNode()?.queue_free();
    //       delete this.entities[sid];
    //       this.AddSpawn(spawn);
    //     }
    //   }
    // }
    console.log('s spawns', this.spawnQueue);

    // instantiate new nearby
    const retried: Set<number> = new Set();
    for (const spawn of sortedSpawns) {
      if (Object.keys(this.entities).length >= this.maxInstantiated) break;
      if (retried.has(spawn.spawnId)) continue;

      if (!nearbySpawnIds.includes(spawn.spawnId)) {
        retried.add(spawn.spawnId);
        continue;
      }

      if (this.entities[spawn.spawnId]) continue;
      const race = spawn?.race ?? 1;
      const raceDataEntry = RACE_DATA[race];
      const model = raceDataEntry[spawn.gender ?? 0] || raceDataEntry[2];
      const entity = await this.actorPool!.getInstance(model, this.scene!);
      if (!entity) {
        console.error("Failed to acquire entity for spawn", spawn.spawnId);
        // fallback logic
        spawn.race = 1;
        retried.add(spawn.spawnId);
        continue;
      }
      // console.log('Acquired entity', entity.data?.name);
      // entity.playIdle();
      // entity.setNPCTexture();

      // this.entities[spawn.spawnId] = entity;
      // remove from queue once we've successfully instantiated it
      this.spawnQueue.delete(spawn);
    }
    // re-queue any that we want to retry
    // for (const retryId of retried) {
    //   const spawn = this.spawns[retryId];
    //   if (spawn) this.spawnQueue.add(spawn);
    // }

    // free any entities that moved out of range, and re-add their spawns
    // for (const sidStr in this.entities) {
    //   const sid = Number(sidStr);
    //   if (!nearbySpawnIds.includes(sid)) {
    //     const ent   = this.entities[sid];
    //     const spawn = this.spawns[sid];
    //     console.log('Freeing entity', ent.data?.name);

    //     ent.getNode()?.queue_free();
    //     delete this.entities[sid];
    //     this.grid.removeSpawn(spawn);

    //     this.AddSpawn(spawn);
    //   }
    // }
  }

  async AddSpawn(spawn: Spawn) {
    // Filter for dev
    if (!spawn.name.includes("Guard")) return;
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

    const entity = await this.actorPool!.getInstance(spawn, this.scene!);
    if (!entity) {
      console.error("Failed to acquire entity for spawn", spawn.spawnId);
      return;
    }
    //entity.parent = this.entityContainer!;
    entity.position = new BABYLON.Vector3(-spawn.y, spawn.z, spawn.x);
    entity.name = spawn.name;
    //entity.scaling.setAll(10);
    //entity.parent = this.entityContainer!;
    //if (!spawn.name.includes("Guard")) return;
    // this.loadedPromise?.then(() => {
    //   console.log('Adding spawn', spawn.spawnId, spawn.name);
    //   this.spawns[spawn.spawnId] = spawn;
    //   this.grid.addSpawn(spawn);
    //   this.spawnQueue.add(spawn);
    // });
  }

  UpdateSpawnPosition(sp: EntityPositionUpdate) {
    // Disable this for NPC for now, work on it later
    return;
    const sid = sp.spawnId;
    const spawn = this.spawns[sid];
    const entity = this.entities[sid];
    if (spawn) {
      console.log('Spawn is NPC', spawn.isNpc, sid, spawn.name);

    } else {
      console.log('Spawn not found', sid);
      return;
    }
    if (!spawn) return;
    console.log('Update spawn position', sid, spawn.name);
    // record old cell
    const oldCell: CellTriple = [spawn.cellX, spawn.cellY, spawn.cellZ];

    // apply new pos & cell
    spawn.x = sp.position.x;
    spawn.y = sp.position.y;
    spawn.z = sp.position.z;
    spawn.cellX = sp.cellX;
    spawn.cellY = sp.cellY;
    spawn.cellZ = sp.cellZ;

    // update bucket if needed
    if (oldCell[0] !== spawn.cellX ||
        oldCell[1] !== spawn.cellY ||
        oldCell[2] !== spawn.cellZ) {
      this.grid.updateSpawnCell(spawn, oldCell);
    }

    // update visual
    // if (entity && entity.getNode() && entity.data) {
    //   // entity.data.x = -spawn.x;
    //   // entity.data.y = spawn.z;
    //   // entity.data.z = spawn.y;
    //   const node = entity.getNode()!;
    //   // node.rotate_y(sp.heading * (360 / 512));
    //   node.global_position = new Vector3(-spawn.x, spawn.z, spawn.y);
    // }
  }

  PlayAnimation(anim: EntityAnimation) {
    const e = this.entities[anim.spawnId];
    if (!e || !e.data || !e.getNode()) return;
    console.log('Play animation', anim.spawnId);
    e.playAnimation(anim.animation as unknown as string);
  }

}
