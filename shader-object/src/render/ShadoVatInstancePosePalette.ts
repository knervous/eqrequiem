/**
 * Phase 3 for the ordinary instanced VAT path: resolve every visible actor's
 * pose into a bone palette once per frame, so the vertex shader reads one
 * already-interpolated DQ per influence instead of sampling the DQ atlas twice.
 *
 * This is deliberately *not* the pre-skin cache. That one deforms the whole
 * module library once and rigid-instances the result, which only works when
 * every actor holds the same pose. A bone palette has no such constraint: each
 * actor gets its own slot, so clip, phase, and speed stay per-instance.
 *
 * Slots are assigned by draw order rather than through the pose-key cache in
 * `ShadoVatPoseCache`. That cache earns its keep when poses repeat; with
 * independent per-actor phases nearly every key is unique, so the Map lookups
 * cost CPU for nothing. One slot per visible actor is 112 bones * 20 B ~= 2 KiB.
 */

import type { Scene, StorageBuffer, WebGPUEngine } from '../babylon';
import { BABYLON } from '../babylon';
import type { VATBuilder } from '../extensions/VATBuilder/VATBuilder';
import {
  emitPoseResolveWGSL,
  POSE_PALETTE_BYTES_PER_BONE,
  POSE_REQUEST_WORDS,
} from './ShadoVatPoseCache';

const RESOLVE_WORKGROUP_SIZE = 64;

export type ShadoVatInstancePosePaletteStats = {
  /** Slots the palette can hold. */
  capacity: number;
  /** Poses resolved by the most recent dispatch. */
  resolved: number;
  paletteBytes: number;
  slotBytes: number;
  requestBytes: number;
  bonesPerSlot: number;
};

export class ShadoVatInstancePosePalette {
  private readonly requests: Uint32Array;
  private readonly requestFloats: Float32Array;
  private readonly slots: Uint32Array;
  private readonly requestBuffer: StorageBuffer;
  private readonly paletteBuffer: StorageBuffer;
  private readonly scaleBuffer: StorageBuffer;
  private readonly slotBuffer: StorageBuffer;
  private readonly atlasParamsBuffer: StorageBuffer;
  private readonly shader: any;
  private readonly boneCount: number;
  private readonly capacity: number;
  private resolved = 0;

  constructor(
    scene: Scene,
    private readonly vat: VATBuilder,
    options: { capacity: number },
  ) {
    const engine = scene.getEngine() as WebGPUEngine;
    if (!engine.isWebGPU || !vat.dqTex) {
      throw new Error('Instance pose palette requires a WebGPU engine and a populated DQ atlas.');
    }
    this.capacity = Math.max(1, options.capacity | 0);
    // Address against the atlas' padded bone capacity, so a clamped bone index
    // can never read into the neighbouring slot.
    this.boneCount = Math.max(1, vat.dqTilesX * vat.dqWidthBones);

    this.requests = new Uint32Array(this.capacity * POSE_REQUEST_WORDS);
    this.requestFloats = new Float32Array(this.requests.buffer);
    this.slots = new Uint32Array(this.capacity);

    const write = BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE;
    this.requestBuffer = new BABYLON.StorageBuffer(
      engine, this.requests.byteLength, write, 'Shado instance pose requests');
    this.paletteBuffer = new BABYLON.StorageBuffer(
      engine, this.capacity * this.boneCount * POSE_PALETTE_BYTES_PER_BONE, write,
      'Shado instance pose palette');
    this.scaleBuffer = new BABYLON.StorageBuffer(
      engine, this.capacity * this.boneCount * Float32Array.BYTES_PER_ELEMENT, write,
      'Shado instance pose scales');
    this.slotBuffer = new BABYLON.StorageBuffer(
      engine, this.slots.byteLength, write, 'Shado instance pose slots');

    const atlasParams = new Uint32Array([
      vat.dqWidthBones, vat.dqTilesX, vat.dqFramesX ?? 1,
      vat.dqStrideTexels, vat.dqHasScale ? 1 : 0, 0, 0, 0,
    ]);
    this.atlasParamsBuffer = new BABYLON.StorageBuffer(
      engine, atlasParams.byteLength, write, 'Shado instance pose atlas params');
    this.atlasParamsBuffer.update(atlasParams);

    this.shader = new BABYLON.ComputeShader(
      'Shado instance pose resolve',
      engine,
      { computeSource: emitPoseResolveWGSL(RESOLVE_WORKGROUP_SIZE) },
      {
        bindingsMapping: {
          poseRequests: { group: 0, binding: 0 },
          dqAtlas: { group: 0, binding: 1 },
          posePalette: { group: 0, binding: 2 },
          poseScales: { group: 0, binding: 3 },
          atlasParams: { group: 0, binding: 4 },
        },
      }
    );
    this.shader.setStorageBuffer('poseRequests', this.requestBuffer);
    this.shader.setTexture('dqAtlas', vat.dqTex, false);
    this.shader.setStorageBuffer('posePalette', this.paletteBuffer);
    this.shader.setStorageBuffer('poseScales', this.scaleBuffer);
    this.shader.setStorageBuffer('atlasParams', this.atlasParamsBuffer);
  }

  public get palette(): StorageBuffer { return this.paletteBuffer; }
  public get scales(): StorageBuffer { return this.scaleBuffer; }
  public get slotIndices(): StorageBuffer { return this.slotBuffer; }
  public get bonesPerSlot(): number { return this.boneCount; }

  /**
   * Build one resolve request per visible actor from its own animation record.
   *
   * `readAnimation` yields the packed `[startFrame, endFrame, phase, rate]` the
   * vertex shader would otherwise evaluate itself; the wrap arithmetic here is
   * the same, so the palette holds exactly the pose the atlas path would sample.
   */
  public update(
    visible: ArrayLike<number>,
    visibleCount: number,
    readAnimation: (actorIndex: number, out: Float32Array) => void,
    timeSeconds: number,
  ): number {
    const count = Math.min(visibleCount, this.capacity);
    const animation = new Float32Array(4);
    for (let i = 0; i < count; i++) {
      const actorIndex = visible[i];
      readAnimation(actorIndex, animation);
      const start = animation[0];
      const end = Math.max(animation[1], start);
      const frameCount = end - start + 1;
      const animationFrame = timeSeconds * animation[3] + animation[2];
      const absolute = start + (animationFrame - frameCount * Math.floor(animationFrame / frameCount));
      const frame0 = Math.floor(absolute);
      const base = i * POSE_REQUEST_WORDS;
      this.requests[base] = frame0 >>> 0;
      this.requests[base + 1] = Math.min(frame0 + 1, Math.floor(end)) >>> 0;
      this.requestFloats[base + 2] = absolute - frame0;
      this.requests[base + 3] = i >>> 0;
      this.requests[base + 4] = this.boneCount >>> 0;
      this.requests[base + 5] = 0;
      this.slots[actorIndex] = i >>> 0;
    }
    if (count > 0) {
      this.requestBuffer.update(this.requests);
      this.slotBuffer.update(this.slots);
    }
    this.resolved = count;
    return count;
  }

  /**
   * Resolve the requested poses. WebGPU submits in order, so encoding this
   * before the draw is enough to make the palette visible to the vertex stage.
   */
  public dispatchResolve(): number {
    if (this.resolved === 0) return 0;
    const ok = this.shader.dispatch(
      Math.ceil(this.boneCount / RESOLVE_WORKGROUP_SIZE), this.resolved, 1);
    return ok ? this.resolved : 0;
  }

  public async warmUp(): Promise<void> {
    if (this.resolved === 0) return;
    await this.shader.dispatchWhenReady(
      Math.ceil(this.boneCount / RESOLVE_WORKGROUP_SIZE), this.resolved, 1);
  }

  public getStats(): ShadoVatInstancePosePaletteStats {
    return {
      capacity: this.capacity,
      resolved: this.resolved,
      paletteBytes: this.capacity * this.boneCount * POSE_PALETTE_BYTES_PER_BONE,
      slotBytes: this.slots.byteLength,
      requestBytes: this.requests.byteLength,
      bonesPerSlot: this.boneCount,
    };
  }

  public dispose(): void {
    this.requestBuffer.dispose();
    this.paletteBuffer.dispose();
    this.scaleBuffer.dispose();
    this.slotBuffer.dispose();
    this.atlasParamsBuffer.dispose();
  }
}
