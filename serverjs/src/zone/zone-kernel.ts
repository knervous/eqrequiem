import { readFile } from "node:fs/promises";

import {
  createRenderSnapshotNetBatch,
  NET_HEADER_BYTES,
  RENDER_SNAPSHOT_NET_STRIDE,
  type RenderSnapshotNetBatchView,
} from "../protocol/generated/net-structs.js";
import {
  EntityStore,
  NPC,
  type EntityArenaBinding,
} from "./entity-store.js";

interface ZoneKernelExports {
  memory: WebAssembly.Memory;
  capacity(): number;
  arenaPtr(): number;
  arenaByteLength(): number;
  bindEntityArena(
    idsPtr: number,
    kindsPtr: number,
    positionXPtr: number,
    positionYPtr: number,
    positionZPtr: number,
    velocityXPtr: number,
    velocityYPtr: number,
    velocityZPtr: number,
    animationPtr: number,
    movementStatePtr: number,
    targetXPtr: number,
    targetYPtr: number,
    targetZPtr: number,
    speedPtr: number,
    dirtyFlagsPtr: number,
    dirtyIndicesPtr: number,
  ): void;
  spawnEntity(
    index: number,
    id: number,
    kind: number,
    x: number,
    y: number,
    z: number,
    speed: number,
  ): void;
  setEntityTarget(index: number, x: number, y: number, z: number): void;
  markDirty(index: number): void;
  tickNpcs(count: number, deltaMs: number): void;
  collectDirty(count: number): number;
}

export interface ZoneKernelSnapshot {
  readonly count: number;
  readonly state: RenderSnapshotNetBatchView;
  readonly dirtyIndices: Uint32Array;
  /** The authoritative public arena prefix, already encoded as a Shado net batch. */
  readonly netPayload: Uint8Array;
}

export type ZoneKernelBuild = "debug" | "release";

export class ZoneSimulationKernel {
  readonly entities: EntityStore;
  private readonly publicState: RenderSnapshotNetBatchView;
  private readonly dirtyIndexPlane: Uint32Array;

  private constructor(private readonly wasm: ZoneKernelExports) {
    const capacity = wasm.capacity();
    const memory = wasm.memory.buffer;
    const arenaStart = wasm.arenaPtr();
    const arenaEnd = arenaStart + wasm.arenaByteLength();
    const publicByteLength = NET_HEADER_BYTES + RENDER_SNAPSHOT_NET_STRIDE * capacity;
    const publicBytes = new Uint8Array(memory, arenaStart, publicByteLength);
    this.publicState = createRenderSnapshotNetBatch(capacity, publicBytes);

    let cursor = alignUp(arenaStart + publicByteLength, 4);
    const floatPlane = (): Float32Array => {
      const plane = new Float32Array(memory, cursor, capacity);
      cursor += plane.byteLength;
      return plane;
    };
    const targetX = floatPlane();
    const targetY = floatPlane();
    const targetZ = floatPlane();
    const speed = floatPlane();
    const uintPlane = (): Uint32Array => {
      const plane = new Uint32Array(memory, cursor, capacity);
      cursor += plane.byteLength;
      return plane;
    };
    const serverFlags = uintPlane();
    const combatTimer = uintPlane();
    const aggroTarget = uintPlane();
    const dirtyFlags = new Uint8Array(memory, cursor, capacity);
    cursor = alignUp(cursor + dirtyFlags.byteLength, 4);
    this.dirtyIndexPlane = new Uint32Array(memory, cursor, capacity);
    cursor += this.dirtyIndexPlane.byteLength;
    if (cursor > arenaEnd) throw new RangeError("Shado entity planes exceed the WASM arena");

    const position = this.publicState.statePosition;
    const velocity = this.publicState.stateVelocity;
    wasm.bindEntityArena(
      this.publicState.entityId.byteOffset,
      this.publicState.stateKind.byteOffset,
      position.byteOffset,
      position.byteOffset + Float32Array.BYTES_PER_ELEMENT,
      position.byteOffset + Float32Array.BYTES_PER_ELEMENT * 2,
      velocity.byteOffset,
      velocity.byteOffset + Float32Array.BYTES_PER_ELEMENT,
      velocity.byteOffset + Float32Array.BYTES_PER_ELEMENT * 2,
      this.publicState.stateAnimation.byteOffset,
      this.publicState.stateMovementState.byteOffset,
      targetX.byteOffset,
      targetY.byteOffset,
      targetZ.byteOffset,
      speed.byteOffset,
      dirtyFlags.byteOffset,
      this.dirtyIndexPlane.byteOffset,
    );

    const binding: EntityArenaBinding = {
      capacity,
      publicState: this.publicState,
      targetX,
      targetY,
      targetZ,
      speed,
      serverFlags,
      combatTimer,
      aggroTarget,
      dirtyIndices: this.dirtyIndexPlane,
      spawnEntity: (index, id, kind, x, y, z, moveSpeed) =>
        wasm.spawnEntity(index, id, kind, x, y, z, moveSpeed),
      setEntityTarget: (index, x, y, z) => wasm.setEntityTarget(index, x, y, z),
      markDirty: (index) => wasm.markDirty(index),
    };
    this.entities = new EntityStore(binding);
  }

  static async load(
    build: ZoneKernelBuild = process.env.NODE_ENV === "production" ? "release" : "debug",
  ): Promise<ZoneSimulationKernel> {
    const bytes = await readFile(
      new URL(`./wasm/zone-simulation.${build}.wasm`, import.meta.url),
    );
    const result = await WebAssembly.instantiate(bytes, {
      env: {
        abort(): never {
          throw new Error("AssemblyScript zone kernel aborted");
        },
      },
    });
    return new ZoneSimulationKernel(
      result.instance.exports as unknown as ZoneKernelExports,
    );
  }

  get capacity(): number { return this.wasm.capacity(); }

  spawnNpc(
    index: number,
    id: number,
    x: number,
    y: number,
    z: number,
    speed: number,
  ): NPC {
    return this.entities.spawnNPCAt(index, { id, x, y, z, speed });
  }

  setNpcTarget(index: number, x: number, y: number, z: number): void {
    const entity = this.entities.at(index);
    if (!(entity instanceof NPC)) throw new TypeError(`Entity ${index} is not an NPC`);
    entity.target.set(x, y, z);
  }

  tick(deltaMs: number): ZoneKernelSnapshot;
  tick(count: number, deltaMs: number): ZoneKernelSnapshot;
  tick(countOrDeltaMs: number, maybeDeltaMs?: number): ZoneKernelSnapshot {
    const count = maybeDeltaMs === undefined ? this.entities.count : countOrDeltaMs;
    const deltaMs = maybeDeltaMs ?? countOrDeltaMs;
    this.wasm.tickNpcs(count, deltaMs);
    const dirtyCount = this.wasm.collectDirty(count);
    return {
      count,
      state: this.publicState,
      dirtyIndices: this.dirtyIndexPlane.subarray(0, dirtyCount),
      netPayload: this.entities.netPayload(),
    };
  }
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
