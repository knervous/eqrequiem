/**
 * WebGPU resources for the active pose-palette cache.
 *
 * Kept separate from `ShadoVatPoseCache` so the slot-allocation policy and the
 * resolve numerics stay free of GPU types and remain unit-testable without a
 * device. This file owns only the Babylon buffers and the dispatch.
 */

import type { ComputeShader, Scene, StorageBuffer, WebGPUEngine } from '../babylon';
import { BABYLON } from '../babylon';
import type { VATBuilder } from '../extensions/VATBuilder/VATBuilder';
import {
  emitPoseResolveWGSL,
  POSE_PALETTE_BYTES_PER_BONE,
  POSE_REQUEST_WORDS,
  ShadoPoseSlotTable,
  type ShadoPoseCacheStats,
  type ShadoPoseKey,
  type ShadoPoseSlot,
} from './ShadoVatPoseCache';

const RESOLVE_WORKGROUP_SIZE = 64;

export type ShadoVatPosePaletteOptions = {
  /**
   * Maximum simultaneously resident poses. Each costs `bones * 16` bytes plus
   * 4 bytes of scale, so 64 slots of a 107-bone rig is ~114 KiB.
   */
  maxPoses?: number;
};

export class ShadoVatPosePalette {
  public readonly table: ShadoPoseSlotTable;
  private readonly requests: Uint32Array;
  private readonly requestBuffer: StorageBuffer;
  private readonly paletteBuffer: StorageBuffer;
  private readonly scaleBuffer: StorageBuffer;
  private readonly atlasParamsBuffer: StorageBuffer;
  private readonly shader: ComputeShader;
  private readonly boneCount: number;

  constructor(
    scene: Scene,
    private readonly vat: VATBuilder,
    options: ShadoVatPosePaletteOptions = {}
  ) {
    const engine = scene.getEngine() as WebGPUEngine;
    if (!engine.isWebGPU || !vat.dqTex) {
      throw new Error('Pose palette requires a WebGPU engine and a populated DQ atlas.');
    }

    const maxPoses = Math.max(1, options.maxPoses ?? 64);
    // The atlas pads bone capacity out to tilesX * widthBones; index against the
    // same capacity so a clamped bone index can never read another pose's slot.
    this.boneCount = Math.max(1, vat.dqTilesX * vat.dqWidthBones);
    this.table = new ShadoPoseSlotTable(maxPoses);

    this.requests = new Uint32Array(maxPoses * POSE_REQUEST_WORDS);
    this.requestBuffer = new BABYLON.StorageBuffer(
      engine,
      this.requests.byteLength,
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      'Shado pose resolve requests'
    );
    this.paletteBuffer = new BABYLON.StorageBuffer(
      engine,
      maxPoses * this.boneCount * POSE_PALETTE_BYTES_PER_BONE,
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      'Shado active pose palette'
    );
    this.scaleBuffer = new BABYLON.StorageBuffer(
      engine,
      maxPoses * this.boneCount * Float32Array.BYTES_PER_ELEMENT,
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      'Shado active pose scales'
    );

    const atlasParams = new Uint32Array([
      vat.dqWidthBones,
      vat.dqTilesX,
      vat.dqFramesX,
      vat.dqStrideTexels,
      vat.dqHasScale ? 1 : 0,
      0,
      0,
      0,
    ]);
    this.atlasParamsBuffer = new BABYLON.StorageBuffer(
      engine,
      atlasParams.byteLength,
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      'Shado pose resolve atlas params'
    );
    this.atlasParamsBuffer.update(atlasParams);

    this.shader = new BABYLON.ComputeShader(
      'Shado active pose resolve',
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

  /** Bone stride used to address the palette; consumers need it in their shader. */
  public get bonesPerSlot(): number {
    return this.boneCount;
  }

  public get palette(): StorageBuffer {
    return this.paletteBuffer;
  }

  public get scales(): StorageBuffer {
    return this.scaleBuffer;
  }

  public beginFrame(): void {
    this.table.beginFrame();
  }

  public acquire(key: ShadoPoseKey): ShadoPoseSlot {
    return this.table.acquire(key);
  }

  public release(slot: number): void {
    this.table.release(slot);
  }

  /**
   * Resolve every pose that changed since the last dispatch. Returns the number
   * of poses resolved, or 0 when the palette is already current.
   *
   * Must be encoded before any consumer reads the palette in the same frame;
   * WebGPU's in-order submission gives us the compute-write to read dependency.
   */
  public dispatchResolve(): number {
    const count = this.table.buildRequestBuffer(this.requests, this.boneCount);
    if (count === 0) return 0;
    this.requestBuffer.update(this.requests);
    const dispatched = this.shader.dispatch(
      Math.ceil(this.boneCount / RESOLVE_WORKGROUP_SIZE),
      count,
      1
    );
    if (dispatched) this.table.markResolved();
    return dispatched ? count : 0;
  }

  /** Same as {@link dispatchResolve}, but waits for shader compilation first. */
  public async warmUp(): Promise<void> {
    const count = this.table.buildRequestBuffer(this.requests, this.boneCount);
    if (count === 0) return;
    this.requestBuffer.update(this.requests);
    await this.shader.dispatchWhenReady(
      Math.ceil(this.boneCount / RESOLVE_WORKGROUP_SIZE),
      count,
      1
    );
    this.table.markResolved();
  }

  public getStats(): ShadoPoseCacheStats {
    return this.table.getStats(
      this.table.capacity * this.boneCount * (POSE_PALETTE_BYTES_PER_BONE + 4),
      this.requests.byteLength
    );
  }

  public dispose(): void {
    this.requestBuffer.dispose();
    this.paletteBuffer.dispose();
    this.scaleBuffer.dispose();
    this.atlasParamsBuffer.dispose();
  }
}
