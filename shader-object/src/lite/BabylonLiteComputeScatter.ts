/// <reference types="@webgpu/types" />

import type { EngineContext, StorageBuffer } from '@babylonjs/lite';

import type { ActorProjectionScatterBatch } from '../render-data/ActorRenderProjection';
import {
  type ComputeScatterShape,
  emitComputeScatterWGSL,
  SHADO_SCATTER_WORKGROUP_SIZE,
} from '../render-data/ComputeScatter';

interface BabylonLiteEngineRuntime extends EngineContext {
  _device?: GPUDevice;
  _currentEncoder?: GPUCommandEncoder;
}

interface BabylonLiteStorageBufferRuntime extends StorageBuffer {
  _buffer?: GPUBuffer | null;
  _data?: Uint8Array | null;
  _destroyed?: boolean;
}

interface TimestampResources {
  readonly querySet: GPUQuerySet;
  readonly resolve: GPUBuffer;
  readonly readback: GPUBuffer;
}

function nextCapacity(current: number, required: number): number {
  let capacity = Math.max(4, current | 0);
  while (capacity < required) capacity *= 2;
  return capacity;
}

/**
 * Babylon Lite intentionally keeps its device and storage handles opaque.
 * Current Lite releases nevertheless use these handles throughout their own
 * compute passes. This small, feature-detected bridge contains that dependency
 * and lets callers retain a correct full-stream fallback.
 */
export function canUseBabylonLiteComputeScatter(
  engine: EngineContext,
  destination?: StorageBuffer
): boolean {
  const runtime = engine as BabylonLiteEngineRuntime;
  const storage = destination as BabylonLiteStorageBufferRuntime | undefined;
  return Boolean(
    runtime._device?.createComputePipeline && (!storage || (!storage._destroyed && storage._buffer))
  );
}

export class BabylonLiteComputeScatterExecutor {
  private device?: GPUDevice;
  private pipeline?: GPUComputePipeline;
  private deltaBuffer?: GPUBuffer;
  private deltaCapacityBytes = 4;
  private paramsBuffer?: GPUBuffer;
  private timestamp?: TimestampResources;
  private timingPending = false;
  private gpuTimeValue = 0;
  private readonly params = new Uint32Array(4);

  constructor(
    private readonly engine: EngineContext,
    private readonly shape: ComputeScatterShape,
    private readonly name: string,
    private readonly gpuTiming = false
  ) {}

  get gpuTimeMs(): number {
    return this.gpuTimeValue;
  }

  dispatch(batch: ActorProjectionScatterBatch, destination: StorageBuffer): boolean {
    if (!this.requireShape(batch) || !this.ensureDevice()) return false;
    const storage = destination as BabylonLiteStorageBufferRuntime;
    const destinationBuffer = storage._buffer;
    if (!destinationBuffer || storage._destroyed) return false;

    this.ensureDeltaCapacity(batch.data.byteLength);
    const device = this.device!;
    device.queue.writeBuffer(
      this.deltaBuffer!,
      0,
      batch.data.buffer,
      batch.data.byteOffset,
      batch.data.byteLength
    );
    this.params[0] = batch.changedRows;
    device.queue.writeBuffer(this.paramsBuffer!, 0, this.params);

    const bindGroup = device.createBindGroup({
      label: `${this.name} bindings`,
      layout: this.pipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.deltaBuffer! } },
        { binding: 1, resource: { buffer: destinationBuffer } },
        { binding: 2, resource: { buffer: this.paramsBuffer! } },
      ],
    });
    const runtime = this.engine as BabylonLiteEngineRuntime;
    const sharedEncoder = runtime._currentEncoder;
    const encoder =
      sharedEncoder ?? device.createCommandEncoder({ label: `${this.name} standalone` });
    const measure = Boolean(this.timestamp && !this.timingPending);
    const pass = encoder.beginComputePass(
      measure
        ? {
            label: this.name,
            timestampWrites: {
              querySet: this.timestamp!.querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : { label: this.name }
    );
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(batch.changedRows / SHADO_SCATTER_WORKGROUP_SIZE));
    pass.end();
    if (measure) {
      encoder.resolveQuerySet(this.timestamp!.querySet, 0, 2, this.timestamp!.resolve, 0);
      encoder.copyBufferToBuffer(this.timestamp!.resolve, 0, this.timestamp!.readback, 0, 16);
      this.timingPending = true;
    }
    this.updateRecoveryMirror(storage, batch);

    if (!sharedEncoder) device.queue.submit([encoder.finish()]);
    if (measure) {
      // A shared frame encoder is submitted synchronously after onBeforeRender
      // returns. The microtask therefore starts mapping after that submission.
      const timestamp = this.timestamp!;
      queueMicrotask(() => void this.readTiming(timestamp));
    }
    return true;
  }

  dispose(): void {
    this.deltaBuffer?.destroy();
    this.paramsBuffer?.destroy();
    this.timestamp?.querySet.destroy();
    this.timestamp?.resolve.destroy();
    this.timestamp?.readback.destroy();
    this.deltaBuffer = undefined;
    this.paramsBuffer = undefined;
    this.timestamp = undefined;
    this.pipeline = undefined;
    this.device = undefined;
    this.timingPending = false;
    this.gpuTimeValue = 0;
  }

  private requireShape(batch: ActorProjectionScatterBatch): boolean {
    return (
      batch.destinationStrideWords === this.shape.destinationStrideWords &&
      batch.destinationOffsetWords === (this.shape.destinationOffsetWords ?? 0) &&
      batch.copyWords === this.shape.copyWords &&
      batch.changedRows > 0
    );
  }

  private ensureDevice(): boolean {
    const device = (this.engine as BabylonLiteEngineRuntime)._device;
    if (!device || typeof GPUBufferUsage === 'undefined' || typeof GPUMapMode === 'undefined') {
      return false;
    }
    if (device === this.device && this.pipeline) return true;
    this.dispose();
    this.device = device;
    this.pipeline = device.createComputePipeline({
      label: this.name,
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          label: `${this.name} WGSL`,
          code: emitComputeScatterWGSL(this.shape),
        }),
        entryPoint: 'main',
      },
    });
    this.paramsBuffer = device.createBuffer({
      label: `${this.name} params`,
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.deltaCapacityBytes = 4;
    this.deltaBuffer = this.createDeltaBuffer(this.deltaCapacityBytes);
    if (this.gpuTiming && device.features.has('timestamp-query')) {
      this.timestamp = {
        querySet: device.createQuerySet({
          label: `${this.name} timestamps`,
          type: 'timestamp',
          count: 2,
        }),
        resolve: device.createBuffer({
          label: `${this.name} timestamp resolve`,
          size: 16,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        }),
        readback: device.createBuffer({
          label: `${this.name} timestamp readback`,
          size: 16,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        }),
      };
    }
    return true;
  }

  private ensureDeltaCapacity(required: number): void {
    if (required <= this.deltaCapacityBytes) return;
    this.deltaCapacityBytes = nextCapacity(this.deltaCapacityBytes, required);
    this.deltaBuffer?.destroy();
    this.deltaBuffer = this.createDeltaBuffer(this.deltaCapacityBytes);
  }

  private createDeltaBuffer(byteLength: number): GPUBuffer {
    return this.device!.createBuffer({
      label: `${this.name} delta`,
      size: byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private updateRecoveryMirror(
    storage: BabylonLiteStorageBufferRuntime,
    batch: ActorProjectionScatterBatch
  ): void {
    if (!storage._data) return;
    const mirror = new Uint32Array(
      storage._data.buffer,
      storage._data.byteOffset,
      storage._data.byteLength / Uint32Array.BYTES_PER_ELEMENT
    );
    const recordWords = batch.copyWords + 1;
    for (let record = 0; record < batch.changedRows; record++) {
      const source = record * recordWords;
      const destination =
        batch.data[source] * batch.destinationStrideWords + batch.destinationOffsetWords;
      mirror.set(batch.data.subarray(source + 1, source + recordWords), destination);
    }
  }

  private async readTiming(timestamp: TimestampResources): Promise<void> {
    if (timestamp !== this.timestamp || !this.timingPending) return;
    try {
      await timestamp.readback.mapAsync(GPUMapMode.READ);
      const values = new BigUint64Array(timestamp.readback.getMappedRange());
      if (timestamp === this.timestamp) {
        this.gpuTimeValue = Number(values[1] - values[0]) / 1_000_000;
      }
      timestamp.readback.unmap();
    } catch {
      if (timestamp === this.timestamp) this.gpuTimeValue = 0;
    } finally {
      if (timestamp === this.timestamp) this.timingPending = false;
    }
  }
}
