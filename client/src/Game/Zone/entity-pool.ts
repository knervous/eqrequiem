import type * as BJS from '@babylonjs/core';
import type GameManager from '@game/Manager/game-manager';
import emitter from '@game/Events/events';
import Player from '@game/Player/player';
import { AnimationDefinitions } from '@game/Animation/animation-constants';
import { Entity } from '@game/Model/entity';
import EntityCache from '@game/Model/entity-cache';
import {
  EntityAnimation,
  EntityPositionUpdateBase,
  type Spawn,
} from '@game/Net/messages';
import type { RenderSnapshotNetBatchView } from '@game/Net/generated/net-structs';
import { readWorldSpawn, type WorldStatePacketView } from '@game/Net/world-state';
import {
  correctRemotePosition,
  eqHeadingToRadians,
  predictRemotePosition,
  REMOTE_MOTION_DEFAULTS,
  resolveDeadReckonedYaw,
  shortestYawDelta,
  type RemoteMotionSnapshot,
} from './entity-motion';

interface AuthoritativeMotionSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly receivedAtMs: number;
}

interface ActiveRemoteMotion {
  readonly snapshot: RemoteMotionSnapshot;
  readonly moving: boolean;
}

const YAW_UPDATE_THRESHOLD = (0.5 * Math.PI) / 180;

export default class EntityPool {
  parent: BJS.Node;
  entities: Record<number, Entity> = {};
  loadedPromiseResolve: () => void = () => {};
  loadedPromise: Promise<void> | null = null;
  entityCache: EntityCache | null = null;
  private spawns: Record<number, Spawn> = {};
  private pendingUpdates = new Map<number, EntityPositionUpdateBase>();
  private authoritativeMotionSamples = new Map<number, AuthoritativeMotionSample>();
  private activeRemoteMotion = new Map<number, ActiveRemoteMotion>();
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
    this.authoritativeMotionSamples.clear();
    this.activeRemoteMotion.clear();
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

  process(deltaMs: number) {
    if (!this.activeRemoteMotion.size) return;
    const nowMs = performance.now();
    for (const [spawnId, motion] of this.activeRemoteMotion) {
      const entity = this.entities[spawnId];
      if (!entity || entity.lifecycleDisposed) {
        this.activeRemoteMotion.delete(spawnId);
        continue;
      }
      const target = predictRemotePosition(motion.snapshot, nowMs);
      const correction = correctRemotePosition(
        entity.spawnPosition,
        target,
        deltaMs,
      );
      if (correction.changed) {
        entity.setPosition(
          correction.position.x,
          correction.position.y,
          correction.position.z,
        );
        this.zone?.grid?.updateEntityPosition(entity);
        entity.syncMatrix();
      }
      const stale =
        nowMs - motion.snapshot.receivedAtMs >=
        REMOTE_MOTION_DEFAULTS.maxExtrapolationMs;
      if ((!motion.moving || stale) && correction.settled) {
        this.activeRemoteMotion.delete(spawnId);
        if (stale && motion.moving) {
          entity.playAnimation(AnimationDefinitions.Idle1);
        }
      }
    }
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
    // Entity setup reserves and populates its shared Shado actor, but actors
    // intentionally begin disabled so partial asynchronous setup can never
    // flash on screen. NPCs require the same explicit activation as players.
    await entity.initialize();
    if (
      generation !== this.generation ||
      this.spawnRevisions.get(spawn.spawnId) !== revision
    ) {
      entity.dispose();
      return;
    }
    if (spawn.isCorpse) {
      entity.presentAsCorpse();
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

    const speed2 =
      sp.velocity.x * sp.velocity.x + sp.velocity.z * sp.velocity.z;
    const animation =
      typeof sp.animation === 'string'
        ? sp.animation
        : (speed2 > 1e-6 ? AnimationDefinitions.Walking : AnimationDefinitions.Idle1);
    this.applyMotionSample(
      e,
      sp.spawnId,
      sp.position,
      sp.velocity,
      sp.heading,
      false,
      speed2 > 1e-6,
      animation,
    );
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
      if (packet.state.stateKind[index] !== 0) {
        this.applyWorldStateRow(packet.state, index, packet.full);
      }
    }
  }

  private applyWorldStateRow(
    state: RenderSnapshotNetBatchView,
    index: number,
    headingIsEqUnits: boolean,
  ): void {
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
    const moving = state.stateMovementState[index] !== 0;
    entity.spawn.currentHp = state.stateCurrentHp[index]!;
    entity.spawn.maximumHp = state.stateMaximumHp[index]!;
    const wasCorpse = entity.spawn.isCorpse === true;
    entity.spawn.kind = state.stateKind[index]!;
    entity.spawn.isNpc =
      entity.spawn.kind === 2 || entity.spawn.kind === 3;
    entity.spawn.isCorpse = entity.spawn.kind === 3;
    if (entity.spawn.isCorpse && !wasCorpse) {
      this.activeRemoteMotion.delete(spawnId);
      entity.presentAsCorpse();
    }
    if (Player.instance?.Target === entity) {
      emitter.emit('entityHealth', {
        spawnId,
        currentHp: entity.spawn.currentHp,
        maximumHp: entity.spawn.maximumHp,
      });
    }
    this.applyMotionSample(
      entity,
      spawnId,
      {
        x: state.statePosition[position]!,
        y: state.statePosition[position + 1]!,
        z: state.statePosition[position + 2]!,
      },
      {
        x: state.stateVelocity[position]!,
        y: state.stateVelocity[position + 1]!,
        z: state.stateVelocity[position + 2]!,
      },
      state.stateHeading[index]!,
      headingIsEqUnits,
      moving,
      entity.spawn.isCorpse
        ? AnimationDefinitions.Death
        : moving
          ? AnimationDefinitions.Walking
          : AnimationDefinitions.Idle1,
    );
  }

  private applyMotionSample(
    entity: Entity,
    spawnId: number,
    position: { readonly x: number; readonly y: number; readonly z: number },
    packetVelocity: { readonly x: number; readonly y: number; readonly z: number },
    heading: number,
    headingIsEqUnits: boolean,
    moving: boolean,
    animation: string,
  ): void {
    const nowMs = performance.now();
    const previous = this.authoritativeMotionSamples.get(spawnId);
    const observed = {
      x: previous ? position.x - previous.x : 0,
      z: previous ? position.z - previous.z : 0,
    };
    this.authoritativeMotionSamples.set(spawnId, {
      ...position,
      receivedAtMs: nowMs,
    });

    let vx = Number.isFinite(packetVelocity.x) ? packetVelocity.x : 0;
    let vy = Number.isFinite(packetVelocity.y) ? packetVelocity.y : 0;
    let vz = Number.isFinite(packetVelocity.z) ? packetVelocity.z : 0;
    const packetSpeedSquared = vx * vx + vz * vz;
    const elapsedSeconds = previous
      ? (nowMs - previous.receivedAtMs) / 1000
      : 0;

    // Velocity drives bounded presentation extrapolation between snapshots. If
    // a moving packet lacks it, estimate velocity from authoritative samples.
    if (moving && packetSpeedSquared <= 1e-8 && elapsedSeconds > 0) {
      vx = observed.x / elapsedSeconds;
      vy = (position.y - previous!.y) / elapsedSeconds;
      vz = observed.z / elapsedSeconds;
    }

    const snapshot: RemoteMotionSnapshot = {
      x: position.x,
      y: position.y,
      z: position.z,
      velocityX: moving ? vx : 0,
      velocityY: moving ? vy : 0,
      velocityZ: moving ? vz : 0,
      receivedAtMs: nowMs,
    };
    const target = predictRemotePosition(snapshot, nowMs);
    const correction = correctRemotePosition(
      entity.spawnPosition,
      target,
      0,
    );
    if (correction.snapped || !previous) {
      entity.setPosition(position.x, position.y, position.z);
      this.zone?.grid?.updateEntityPosition(entity);
      entity.syncMatrix();
    }
    this.activeRemoteMotion.set(spawnId, { snapshot, moving });

    const fallbackHeading = headingIsEqUnits
      ? eqHeadingToRadians(heading)
      : heading;
    const yaw = resolveDeadReckonedYaw(
      observed,
      { x: vx, z: vz },
      fallbackHeading,
    );
    if (
      yaw !== null &&
      Math.abs(shortestYawDelta(entity.getHeading(), yaw)) >=
        YAW_UPDATE_THRESHOLD
    ) {
      entity.setRotation(yaw);
      entity.syncMatrix();
    }
    entity.playAnimation(animation);
  }

  RemoveSpawn(spawnId: number) {
    this.spawnRevisions.set(spawnId, (this.spawnRevisions.get(spawnId) ?? 0) + 1);
    const entity = this.entities[spawnId];
    if (!entity) {
      delete this.spawns[spawnId];
      this.pendingUpdates.delete(spawnId);
      this.authoritativeMotionSamples.delete(spawnId);
      this.activeRemoteMotion.delete(spawnId);
      return;
    }
    if (Player.instance?.Target === entity) {
      Player.instance.Target = null;
    }
    this.zone?.grid?.removeEntity(entity);
    entity.dispose();
    delete this.entities[spawnId];
    delete this.spawns[spawnId];
    this.pendingUpdates.delete(spawnId);
    this.authoritativeMotionSamples.delete(spawnId);
    this.activeRemoteMotion.delete(spawnId);
  }




  PlayAnimation(anim: EntityAnimation) {
    const e = this.entities[anim.spawnId];
    if (!e || !e.spawn) {return;}
    e.playAnimation(anim.animation);
  }
}
