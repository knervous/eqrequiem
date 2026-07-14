import type * as BJS from '@babylonjs/core';
import type GameManager from '@game/Manager/game-manager';
import { Entity } from '@game/Model/entity';
import EntityCache from '@game/Model/entity-cache';
import {
  EntityAnimation,
  EntityPositionUpdateBase,
  type Spawn,
} from '@game/Net/messages';
import type { RenderSnapshotNetBatchView } from '@game/Net/generated/net-structs';
import { readWorldSpawn, type WorldStatePacketView } from '@game/Net/world-state';

export default class EntityPool {
  parent: BJS.Node;
  entities: Record<number, Entity> = {};
  loadedPromiseResolve: () => void = () => {};
  loadedPromise: Promise<void> | null = null;
  entityCache: EntityCache | null = null;
  private spawns: Record<number, Spawn> = {};
  private pendingUpdates = new Map<number, EntityPositionUpdateBase>();
  private spawnRevisions = new Map<number, number>();
  private latestWorldRevision = 0;
  latestWorldState: WorldStatePacketView | null = null;
  private generation = 0;
  private scene: BJS.Scene;

  private get zone() {
    return this.gameManager?.ZoneManager;
  }

  constructor(private gameManager: GameManager, parent: BJS.Node, scene: BJS.Scene) {
    this.scene = scene;
    this.parent = parent;
  }

  dispose() {
    this.generation++;
    for (const entity of Object.values(this.entities)) {
      entity.dispose();
    }
    this.entities = {};
    this.spawns = {};
    this.loadedPromise = null;
    this.loadedPromiseResolve = () => {};
    this.pendingUpdates.clear();
    this.spawnRevisions.clear();
    this.latestWorldRevision = 0;
    this.latestWorldState = null;

  }

  getPlayerEntities(): Entity[] {
    const playerEntities: Entity[] = [];
    for (const entity of Object.values(this.entities)) {
      if (entity?.spawn && !entity.spawn.isNpc) {
        playerEntities.push(entity);
      }
    }
    return playerEntities;
  }

  async process() {
    
  }

  async AddSpawn(spawn: Spawn) {
    if (spawn.name === this.gameManager.player?.player?.name) {
      // This is the player, skip adding it to the pool
      return;
    }
    if (this.entities[spawn.spawnId]) return;
    const generation = this.generation;
    const revision = (this.spawnRevisions.get(spawn.spawnId) ?? 0) + 1;
    this.spawnRevisions.set(spawn.spawnId, revision);
    this.spawns[spawn.spawnId] = spawn;

    let entity: Entity | null;
    try {
      entity = await EntityCache.getInstance(this.gameManager, spawn, this.scene!, this.parent);
    } catch (error) {
      delete this.spawns[spawn.spawnId];
      console.error('Failed to initialize entity for spawn', spawn.spawnId, error);
      return;
    }
    if (!entity) {
      console.error('Failed to acquire entity for spawn', spawn.spawnId);
      return;
    }
    if (generation !== this.generation || this.spawnRevisions.get(spawn.spawnId) !== revision) {
      entity.dispose();
      return;
    }
    this.zone?.grid?.addEntity(entity);
    this.entities[spawn.spawnId] = entity;
    const pending = this.pendingUpdates.get(spawn.spawnId);
    if (pending) {
      this.pendingUpdates.delete(spawn.spawnId);
      this.UpdateSpawnPosition(pending);
    }
  }
  
  UpdateSpawnPosition(sp: EntityPositionUpdateBase) {
    const e = this.entities[sp.spawnId];
    if (!e || !e.spawn) {
      this.pendingUpdates.set(sp.spawnId, sp);
      return;
    }

    const { x, y, z } = sp.position;
    e.setPosition(x, y, z);
    this.zone?.grid?.updateEntityPosition(e);

    const vx = sp.velocity.x;
    const vy = sp.velocity.y;
    const vz = sp.velocity.z;
    e.setVelocity(vx, vy, vz);

    const speed2 = vx * vx + vz * vz;
    if (speed2 > 1e-6) {
    // compute, then flip 180°
      const raw = Math.atan2(vz, vx);
      const yawFromVel = raw + Math.PI;
      e.setRotation(yawFromVel);
    } else if (Number.isFinite(sp.heading) && sp.heading !== 0) {
      e.setRotation(sp.heading);
    }

    if (sp.animation) {
      e.playAnimation(sp.animation);
    }
  }

  async ApplyWorldState(packet: WorldStatePacketView): Promise<void> {
    if (!packet.full && packet.revision && packet.revision <= this.latestWorldRevision) return;
    if (!packet.full && packet.revision) this.latestWorldRevision = packet.revision;
    this.latestWorldState = packet;
    const additions: Promise<void>[] = [];
    for (let index = 0; index < packet.state.count; index++) {
      const spawnId = packet.state.entityId[index]!;
      const kind = packet.state.stateKind[index]!;
      if (kind === 0) {
        this.RemoveSpawn(spawnId);
        continue;
      }
      if (!this.entities[spawnId] && packet.full) {
        additions.push(this.AddSpawn(readWorldSpawn(packet.state, packet.sidecar, index) as Spawn));
      }
    }
    if (additions.length) await Promise.all(additions);
    for (let index = 0; index < packet.state.count; index++) {
      if (packet.state.stateKind[index] !== 0) this.applyWorldStateRow(packet.state, index);
    }
  }

  private applyWorldStateRow(state: RenderSnapshotNetBatchView, index: number): void {
    const spawnId = state.entityId[index]!;
    const entity = this.entities[spawnId];
    const position = index * 3;
    if (!entity || !entity.spawn) {
      this.pendingUpdates.set(spawnId, {
        spawnId,
        position: {
          x: state.statePosition[position]!,
          y: state.statePosition[position + 1]!,
          z: state.statePosition[position + 2]!,
        },
        velocity: {
          x: state.stateVelocity[position]!,
          y: state.stateVelocity[position + 1]!,
          z: state.stateVelocity[position + 2]!,
        },
        heading: state.stateHeading[index]!,
        animation: state.stateAnimation[index]!,
      });
      return;
    }
    entity.setPosition(
      state.statePosition[position]!,
      state.statePosition[position + 1]!,
      state.statePosition[position + 2]!,
    );
    this.zone?.grid?.updateEntityPosition(entity);
    const vx = state.stateVelocity[position]!;
    const vy = state.stateVelocity[position + 1]!;
    const vz = state.stateVelocity[position + 2]!;
    entity.setVelocity(vx, vy, vz);
    const speed2 = vx * vx + vz * vz;
    if (speed2 > 1e-6) entity.setRotation(Math.atan2(vz, vx) + Math.PI);
    else if (state.stateHeading[index]) entity.setRotation(state.stateHeading[index]!);
    if (state.stateAnimation[index]) entity.playAnimation(state.stateAnimation[index]!);
  }

  RemoveSpawn(spawnId: number) {
    this.spawnRevisions.set(spawnId, (this.spawnRevisions.get(spawnId) ?? 0) + 1);
    const entity = this.entities[spawnId];
    if (!entity) {
      delete this.spawns[spawnId];
      this.pendingUpdates.delete(spawnId);
      return;
    }
    this.zone?.grid?.removeEntity(entity);
    entity.dispose();
    delete this.entities[spawnId];
    delete this.spawns[spawnId];
    this.pendingUpdates.delete(spawnId);
  }




  PlayAnimation(anim: EntityAnimation) {
    const e = this.entities[anim.spawnId];
    if (!e || !e.spawn) {return;}
    e.playAnimation(anim.animation);
  }
}
