import {
  Node3D,
  Vector3,
  InputEventMouseButton,
  MouseButton,
  PhysicsRayQueryParameters3D,
  StaticBody3D,
} from "godot";
import { vec3 } from "gl-matrix";

import ObjectMesh from "@game/Object/object-geometry";
import { EntityAnimation, EntityPositionUpdate, Spawn } from "@game/Net/internal/api/capnp/common";
import Player from "@game/Player/player";
import EntityCache from "./entity-cache";
import Entity from "@game/Entity/entity";
import { Grid } from "./zone-grid";

type CellTriple = [number, number, number];
type Vec3 = { x: number; y: number; z: number };

export default class EntityPool {
  parent: Node3D;
  entities: Record<number, Entity> = {};
  entityContainer: Record<string, Promise<ObjectMesh>> = {};
  entityObjectContainer: Node3D | null = null;
  loadedPromiseResolve: () => void = () => {};
  loadedPromise: Promise<void> | null = null;
  actorPool: EntityCache | null = null;
  private spawnQueue: Set<Spawn> = new Set();  
  private grid: Grid;
  private spawns: Record<number, Spawn> = {};
  private maxInstantiated: number = 50;
  private accumulatedDelta: number = 0;

  constructor(parent: Node3D) {
    this.parent = parent;
    // Only cellSize is needed now; we use string-based keys internally
    this.grid = new Grid(300.0);
    this.loadedPromise = new Promise((res) => {
      this.loadedPromiseResolve = res;
    });
  }

  dispose() {
    if (this.entityObjectContainer) {
      this.entityObjectContainer.queue_free();
      this.entityObjectContainer = null;
    }
  }

  async Load(): Promise<void> {
    try {
      this.entityObjectContainer = new Node3D();
      this.entityObjectContainer.set_name("EntityPool");
      this.parent.add_child(this.entityObjectContainer);
      this.actorPool = new EntityCache();
      this.loadedPromiseResolve();
    } catch (e) {
      console.log("Error loading objects", e);
    }
  }

  async process(delta: number) {
    this.accumulatedDelta += delta;
    if (this.accumulatedDelta < 1) return;
    this.accumulatedDelta = 0;

    if (!Player.instance) return;

    const playerPos3D = Player.instance.getNode()?.global_position ?? Vector3.ZERO;
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

    // free distant entities
    if (Object.keys(this.entities).length >= this.maxInstantiated) {
      for (const sidStr in this.entities) {
        const sid = Number(sidStr);
        if (!nearbySpawnIds.includes(sid)) {
          const ent = this.entities[sid];
          const spawn = this.spawns[sid];
          this.grid.removeSpawn(spawn);
          ent.getNode()?.queue_free();
          delete this.entities[sid];
          this.AddSpawn(spawn);
        }
      }
    }


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

      const entity = await this.actorPool!.acquire(spawn, this.entityObjectContainer!);
      if (!entity) {
        console.error("Failed to acquire entity for spawn", spawn.spawnId);
        // fallback logic
        spawn.race = 1;
        retried.add(spawn.spawnId);
        continue;
      }
      console.log('Acquired entity', entity.data?.name);
      entity.playIdle();
      entity.setNPCTexture();

      this.entities[spawn.spawnId] = entity;
      // remove from queue once we've successfully instantiated it
      this.spawnQueue.delete(spawn);
    }
    // re-queue any that we want to retry
    for (const retryId of retried) {
      const spawn = this.spawns[retryId];
      if (spawn) this.spawnQueue.add(spawn);
    }

    // free any entities that moved out of range, and re-add their spawns
    for (const sidStr in this.entities) {
      const sid = Number(sidStr);
      if (!nearbySpawnIds.includes(sid)) {
        const ent   = this.entities[sid];
        const spawn = this.spawns[sid];
        console.log('Freeing entity', ent.data?.name);

        ent.getNode()?.queue_free();
        delete this.entities[sid];
        this.grid.removeSpawn(spawn);

        this.AddSpawn(spawn);
      }
    }
  }

  AddSpawn(spawn: Spawn) {
    // Filter for dev
    //if (!spawn.name.includes("Guard")) return;
    this.loadedPromise?.then(() => {
      console.log('Adding spawn', spawn.spawnId, spawn.name);
      this.spawns[spawn.spawnId] = spawn;
      this.grid.addSpawn(spawn);
      this.spawnQueue.add(spawn);
    });
  }

  UpdateSpawnPosition(sp: EntityPositionUpdate) {
    // Disable this for NPC for now, work on it later

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
    if (entity && entity.getNode() && entity.data) {
      // entity.data.x = -spawn.x;
      // entity.data.y = spawn.z;
      // entity.data.z = spawn.y;
      const node = entity.getNode()!;
      // node.rotate_y(sp.heading * (360 / 512));
      node.global_position = new Vector3(-spawn.x, spawn.z, spawn.y);
    }
  }

  PlayAnimation(anim: EntityAnimation) {
    const e = this.entities[anim.spawnId];
    if (!e || !e.data || !e.getNode()) return;
    console.log('Play animation', anim.spawnId);
    e.playAnimation(anim.animation as unknown as string);
  }

  mouseEvent(event: InputEvent) {
    if (
      event instanceof InputEventMouseButton &&
      event.button_index === MouseButton.MOUSE_BUTTON_LEFT &&
      event.pressed
    ) {
      const cam = this.parent.get_viewport().get_camera_3d();
      if (!cam) return;

      const mp = this.parent.get_viewport().get_mouse_position();
      const from = cam.project_ray_origin(mp);
      const dir  = cam.project_ray_normal(mp).normalized();
      const to   = from.addNoMutate(dir.multiplyScalar(1000));

      const params = new PhysicsRayQueryParameters3D();
      params.from = from;
      params.to   = to;
      params.collision_mask = (1<<1)|(1<<0);
      params.collide_with_bodies = true;
      params.collide_with_areas  = false;

      const hit = this.parent.get_world_3d().direct_space_state.intersect_ray(params);
      if (!hit) return;
      const collider = hit.get("collider") as StaticBody3D | undefined;
      if (collider?.get_parent() === this.entityObjectContainer) {
        this.handleEntityClick(collider);
      }
    }
  }

  private handleEntityClick(node: StaticBody3D) {
    const sid = node.get_meta("spawnId");
    console.log('Clicked spawn', sid);
    if (!Player.instance) return;
    Player.instance.Target = this.entities[sid].data;
  }
}
