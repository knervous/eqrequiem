import { ComputeShader, Constants, StorageBuffer, type WebGPUEngine } from '@babylonjs/core';

import {
  ActorRenderProjection,
  type ActorProjectionActor,
  type ActorProjectionScatterBatch,
  type ActorProjectionShapeSpan,
  type ActorProjectionStreamPlan,
  type ActorProjectionSyncOptions,
  type ActorProjectionSyncResult,
  type ActorRenderProjectionConfig,
} from '../render-data/ActorRenderProjection';
import {
  type ComputeScatterShape,
  emitComputeScatterWGSL,
  SHADO_SCATTER_WORKGROUP_SIZE,
} from '../render-data/ComputeScatter';

export interface BabylonProjectionPublicationResult {
  readonly projection: ActorProjectionSyncResult;
  readonly scatterDispatches: number;
  readonly fallbackFullWrites: number;
  readonly actualUploadCalls: number;
  readonly actualUploadedBytes: number;
}

export interface BabylonProjectionGPUTiming {
  /** Last transform scatter duration reported by Babylon, in milliseconds. */
  readonly transformScatterMs: number;
  /** Last appearance scatter duration reported by Babylon, in milliseconds. */
  readonly appearanceScatterMs: number;
}

function nextCapacity(current: number, required: number): number {
  let capacity = Math.max(4, current | 0);
  while (capacity < required) capacity *= 2;
  return capacity;
}

class BabylonComputeScatterExecutor {
  private deltaBuffer: StorageBuffer;
  private deltaCapacityBytes = 4;
  private readonly paramsBuffer: StorageBuffer;
  private readonly params = new Uint32Array(4);
  private readonly shader: ComputeShader;

  constructor(
    private readonly engine: WebGPUEngine,
    private readonly shape: ComputeScatterShape,
    name: string
  ) {
    this.deltaBuffer = this.createBuffer(4, `${name} delta`);
    this.paramsBuffer = this.createBuffer(16, `${name} params`);
    this.shader = new ComputeShader(
      name,
      engine,
      { computeSource: emitComputeScatterWGSL(shape) },
      {
        bindingsMapping: {
          shadoScatterDelta: { group: 0, binding: 0 },
          shadoScatterDestination: { group: 0, binding: 1 },
          shadoScatterParams: { group: 0, binding: 2 },
        },
      }
    );
  }

  get gpuTimeMs(): number {
    return (this.shader.gpuTimeInFrame?.counter.current ?? 0) / 1_000_000;
  }

  async warmUp(destination: StorageBuffer): Promise<void> {
    this.params.fill(0);
    this.paramsBuffer.update(this.params);
    this.bind(destination);
    await this.shader.dispatchWhenReady(1);
  }

  dispatch(batch: ActorProjectionScatterBatch, destination: StorageBuffer): boolean {
    const data = this.requireScatterData(batch);
    this.ensureDeltaCapacity(data.byteLength);
    this.bind(destination);
    if (!this.shader.isReady()) return false;
    this.upload(data, batch.changedRows);
    return this.shader.dispatch(Math.ceil(batch.changedRows / SHADO_SCATTER_WORKGROUP_SIZE));
  }

  async dispatchWhenReady(
    batch: ActorProjectionScatterBatch,
    destination: StorageBuffer
  ): Promise<void> {
    const data = this.requireScatterData(batch);
    this.ensureDeltaCapacity(data.byteLength);
    this.bind(destination);
    this.upload(data, batch.changedRows);
    await this.shader.dispatchWhenReady(
      Math.ceil(batch.changedRows / SHADO_SCATTER_WORKGROUP_SIZE)
    );
  }

  dispose(): void {
    this.deltaBuffer.dispose();
    this.paramsBuffer.dispose();
  }

  private createBuffer(byteLength: number, label: string): StorageBuffer {
    return new StorageBuffer(this.engine, byteLength, Constants.BUFFER_CREATIONFLAG_WRITE, label);
  }

  private requireScatterData(batch: ActorProjectionScatterBatch): Uint32Array {
    if (
      batch.destinationStrideWords !== this.shape.destinationStrideWords ||
      batch.destinationOffsetWords !== (this.shape.destinationOffsetWords ?? 0) ||
      batch.copyWords !== this.shape.copyWords
    ) {
      throw new Error(`Scatter batch ${batch.shapeName} does not match its compute shape.`);
    }
    return batch.data;
  }

  private ensureDeltaCapacity(required: number): void {
    if (required <= this.deltaCapacityBytes) return;
    this.deltaCapacityBytes = nextCapacity(this.deltaCapacityBytes, required);
    this.deltaBuffer.dispose();
    this.deltaBuffer = this.createBuffer(this.deltaCapacityBytes, 'Shado actor scatter delta');
  }

  private bind(destination: StorageBuffer): void {
    this.shader.setStorageBuffer('shadoScatterDelta', this.deltaBuffer);
    this.shader.setStorageBuffer('shadoScatterDestination', destination);
    this.shader.setStorageBuffer('shadoScatterParams', this.paramsBuffer);
  }

  private upload(data: Uint32Array, changedRows: number): void {
    this.params[0] = changedRows;
    this.deltaBuffer.update(data);
    this.paramsBuffer.update(this.params);
  }
}

function scatterShapeKey(shape: ComputeScatterShape): string {
  return `${shape.destinationStrideWords}:${shape.destinationOffsetWords ?? 0}:${shape.copyWords}`;
}

/**
 * Full-Babylon WebGPU publisher for projected actor streams.
 *
 * Call `publishWhenReady()` during asynchronous warm-up, then `publish()` in
 * frame code. If a synchronous scatter shader is unexpectedly not ready,
 * `publish()` safely writes the complete affected component stream.
 */
export class BabylonActorProjectionPipeline {
  readonly projection: ActorRenderProjection;

  private transformBuffer: StorageBuffer;
  private appearanceBuffer: StorageBuffer;
  private bufferCapacity: number;
  private readonly transformScatters: ReadonlyMap<string, BabylonComputeScatterExecutor>;
  private readonly appearanceScatters: ReadonlyMap<string, BabylonComputeScatterExecutor>;
  private readonly lastTransformScatters: BabylonComputeScatterExecutor[] = [];
  private readonly lastAppearanceScatters: BabylonComputeScatterExecutor[] = [];
  private initialization?: Promise<void>;
  private readonly bindings: Array<{
    material: {
      setStorageBuffer(name: string, buffer: StorageBuffer): unknown;
    };
    names: { transform: string; appearance: string };
  }> = [];

  constructor(
    private readonly engine: WebGPUEngine,
    config: ActorRenderProjectionConfig
  ) {
    if (!engine.isWebGPU) {
      throw new Error('BabylonActorProjectionPipeline requires WebGPU.');
    }
    this.projection = new ActorRenderProjection({
      ...config,
      initialCapacity: Math.max(4, config.initialCapacity ?? 0),
      uploadPolicy: {
        ...config.uploadPolicy,
        allowScatter: true,
      },
    });
    this.bufferCapacity = this.projection.capacity;
    this.transformBuffer = this.createResidentBuffer(
      this.bufferCapacity * this.projection.transformStrideWords * 4,
      'Shado projected actor transforms'
    );
    this.appearanceBuffer = this.createResidentBuffer(
      this.bufferCapacity * this.projection.appearanceStrideWords * 4,
      'Shado projected actor appearance'
    );
    this.transformScatters = this.createScatterExecutors(
      'Transform',
      this.projection.transformStrideWords,
      this.projection.transformShape
    );
    this.appearanceScatters = this.createScatterExecutors(
      'Appearance',
      this.projection.appearanceStrideWords,
      this.projection.appearanceShape
    );
  }

  bind(
    material: {
      setStorageBuffer(name: string, buffer: StorageBuffer): unknown;
    },
    names = {
      transform: 'shadoActorTransform',
      appearance: 'shadoActorAppearance',
    }
  ): void {
    material.setStorageBuffer(names.transform, this.transformBuffer);
    material.setStorageBuffer(names.appearance, this.appearanceBuffer);
    if (
      !this.bindings.some(
        binding =>
          binding.material === material &&
          binding.names.transform === names.transform &&
          binding.names.appearance === names.appearance
      )
    ) {
      this.bindings.push({ material, names: { ...names } });
    }
  }

  initialize(): Promise<void> {
    return (this.initialization ??= Promise.all([
      ...Array.from(this.transformScatters.values(), scatter =>
        scatter.warmUp(this.transformBuffer)
      ),
      ...Array.from(this.appearanceScatters.values(), scatter =>
        scatter.warmUp(this.appearanceBuffer)
      ),
    ]).then(() => undefined));
  }

  publish(
    actors: readonly ActorProjectionActor[],
    options: ActorProjectionSyncOptions = {}
  ): BabylonProjectionPublicationResult {
    const projection = this.projection.sync(actors, options);
    this.ensureResidentCapacity();
    return this.applySync(projection, false) as BabylonProjectionPublicationResult;
  }

  async publishWhenReady(
    actors: readonly ActorProjectionActor[],
    options: ActorProjectionSyncOptions = {}
  ): Promise<BabylonProjectionPublicationResult> {
    await this.initialize();
    const projection = this.projection.sync(actors, options);
    this.ensureResidentCapacity();
    return (await this.applySync(projection, true)) as BabylonProjectionPublicationResult;
  }

  getLastGPUTiming(): BabylonProjectionGPUTiming {
    return {
      transformScatterMs: this.lastTransformScatters.reduce(
        (sum, scatter) => sum + scatter.gpuTimeMs,
        0
      ),
      appearanceScatterMs: this.lastAppearanceScatters.reduce(
        (sum, scatter) => sum + scatter.gpuTimeMs,
        0
      ),
    };
  }

  dispose(): void {
    for (const scatter of this.transformScatters.values()) scatter.dispose();
    for (const scatter of this.appearanceScatters.values()) scatter.dispose();
    this.transformBuffer.dispose();
    this.appearanceBuffer.dispose();
    this.bindings.length = 0;
  }

  private createResidentBuffer(byteLength: number, label: string): StorageBuffer {
    return new StorageBuffer(
      this.engine,
      Math.max(4, byteLength),
      Constants.BUFFER_CREATIONFLAG_READWRITE,
      label
    );
  }

  private createScatterExecutors(
    streamName: string,
    strideWords: number,
    shape: readonly ActorProjectionShapeSpan[]
  ): ReadonlyMap<string, BabylonComputeScatterExecutor> {
    const executors = new Map<string, BabylonComputeScatterExecutor>();
    const spans = [{ name: 'Row', offsetWords: 0, wordCount: strideWords }, ...shape];
    for (const span of spans) {
      const scatterShape = {
        destinationStrideWords: strideWords,
        destinationOffsetWords: span.offsetWords,
        copyWords: span.wordCount,
      };
      const key = scatterShapeKey(scatterShape);
      if (!executors.has(key)) {
        executors.set(
          key,
          new BabylonComputeScatterExecutor(
            this.engine,
            scatterShape,
            `Shado${streamName}${span.name}Scatter`
          )
        );
      }
    }
    return executors;
  }

  private ensureResidentCapacity(): void {
    if (this.projection.capacity === this.bufferCapacity) return;
    this.bufferCapacity = this.projection.capacity;
    this.transformBuffer.dispose();
    this.appearanceBuffer.dispose();
    this.transformBuffer = this.createResidentBuffer(
      this.bufferCapacity * this.projection.transformStrideWords * 4,
      'Shado projected actor transforms'
    );
    this.appearanceBuffer = this.createResidentBuffer(
      this.bufferCapacity * this.projection.appearanceStrideWords * 4,
      'Shado projected actor appearance'
    );
    for (const binding of this.bindings) {
      binding.material.setStorageBuffer(binding.names.transform, this.transformBuffer);
      binding.material.setStorageBuffer(binding.names.appearance, this.appearanceBuffer);
    }
  }

  private applySync(
    projection: ActorProjectionSyncResult,
    waitUntilReady: boolean
  ): BabylonProjectionPublicationResult | Promise<BabylonProjectionPublicationResult> {
    const result: BabylonProjectionPublicationResult = {
      projection,
      scatterDispatches: 0,
      fallbackFullWrites: 0,
      actualUploadCalls: 0,
      actualUploadedBytes: 0,
    };
    const mutable = result as {
      scatterDispatches: number;
      fallbackFullWrites: number;
      actualUploadCalls: number;
      actualUploadedBytes: number;
    };
    this.lastTransformScatters.length = 0;
    this.lastAppearanceScatters.length = 0;

    const applyRanges = (plan: ActorProjectionStreamPlan, destination: StorageBuffer) => {
      for (const range of plan.ranges) {
        destination.update(range.data, range.byteOffset);
        mutable.actualUploadCalls++;
        mutable.actualUploadedBytes += range.data.byteLength;
      }
    };

    const plans = [
      {
        plan: projection.transform,
        destination: this.transformBuffer,
        scatters: this.transformScatters,
        timingScatters: this.lastTransformScatters,
        words: this.projection.transformWords,
      },
      {
        plan: projection.appearance,
        destination: this.appearanceBuffer,
        scatters: this.appearanceScatters,
        timingScatters: this.lastAppearanceScatters,
        words: this.projection.appearanceWords,
      },
    ] as const;

    const requireBatches = (plan: ActorProjectionStreamPlan) => {
      if (!plan.scatterBatches?.length) {
        throw new Error(`Scatter plan for ${plan.stream} has no batches.`);
      }
      return plan.scatterBatches;
    };

    const requireExecutor = (
      batch: ActorProjectionScatterBatch,
      scatters: ReadonlyMap<string, BabylonComputeScatterExecutor>
    ) => {
      const scatter = scatters.get(scatterShapeKey(batch));
      if (!scatter) {
        throw new Error(`No compute scatter kernel exists for ${batch.shapeName}.`);
      }
      return scatter;
    };

    const recordScatter = (
      batch: ActorProjectionScatterBatch,
      scatter: BabylonComputeScatterExecutor,
      timingScatters: BabylonComputeScatterExecutor[]
    ) => {
      mutable.scatterDispatches++;
      mutable.actualUploadCalls += 2;
      mutable.actualUploadedBytes += batch.data.byteLength + 16;
      timingScatters.push(scatter);
    };

    if (waitUntilReady) {
      return (async () => {
        for (const { plan, destination, scatters, timingScatters } of plans) {
          if (plan.mode === 'scatter') {
            for (const batch of requireBatches(plan)) {
              const scatter = requireExecutor(batch, scatters);
              await scatter.dispatchWhenReady(batch, destination);
              recordScatter(batch, scatter, timingScatters);
            }
          } else {
            applyRanges(plan, destination);
          }
        }
        return result;
      })();
    }

    for (const { plan, destination, scatters, timingScatters, words } of plans) {
      if (plan.mode !== 'scatter') {
        applyRanges(plan, destination);
        continue;
      }
      const batches = requireBatches(plan);
      let dispatchedAll = true;
      for (const batch of batches) {
        const scatter = requireExecutor(batch, scatters);
        if (scatter.dispatch(batch, destination)) {
          recordScatter(batch, scatter, timingScatters);
        } else {
          dispatchedAll = false;
          break;
        }
      }
      if (dispatchedAll) {
        continue;
      }
      const active = words.subarray(0, projection.count * plan.strideWords);
      destination.update(active);
      mutable.fallbackFullWrites++;
      mutable.actualUploadCalls++;
      mutable.actualUploadedBytes += active.byteLength;
    }
    return result;
  }
}
