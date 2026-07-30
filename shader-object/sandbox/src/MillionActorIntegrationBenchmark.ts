import { ShadoEntityVisibilityWorker } from '@knervous/shado/world';
import { deserializeShadoModel } from '@knervous/shado/preprocess/runtime';

type PackedVertexData = {
  positions: number[];
  indices: number[];
  matricesIndices: number[];
  matricesWeights: number[];
};

type PackedScene = {
  geometries?: { vertexData?: PackedVertexData[] };
};

type BenchmarkOptions = {
  actors: number;
  visible: number;
  frames: number;
  warmupFrames: number;
  cullHz: number;
  targetFps: number;
  targetSize: number;
  vatQuality: 'full' | 'medium' | 'low' | 'rigid';
};

type SampleSummary = {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

export type ResidentActorIntegrationInput = {
  actorCount?: number;
  visibleCount?: number;
  packedResidentWords?: Uint32Array;
  packedResidentSource?: {
    byteLength: number;
    upload(device: GPUDevice, destination: GPUBuffer): void | Promise<void>;
  };
};

const DOMAIN_ORIGIN = [-1024, -256, -1024] as const;
const DOMAIN_EXTENT = [2048, 512, 2048] as const;
const SCALE_RANGE = [0, 4] as const;
const VISIBILITY_TILES = {
  x: [0, 4],
  z: [0, 0],
  size: 256,
  originX: -128,
  originZ: -128,
};
const VISIBILITY_CELL_FLAGS = new Uint8Array([0x71, 0]);

/**
 * Sustained 1M-resident-actor integration benchmark.
 *
 * The hot loop overlaps a SharedArrayBuffer/WASM visibility pass with a raw
 * WebGPU draw using packed transforms, compact visible IDs, real mesh
 * skinning data, and a preprocessed dual-quaternion VAT.
 */
export async function runMillionActorIntegrationBenchmark(
  input: ResidentActorIntegrationInput = {}
): Promise<Record<string, unknown>> {
  const options = readOptions();
  if (input.actorCount !== undefined) options.actors = input.actorCount;
  if (input.visibleCount !== undefined) options.visible = input.visibleCount;
  options.visible = Math.min(options.actors, options.visible);
  if (!navigator.gpu) throw new Error('The million-actor benchmark requires WebGPU');
  if (!ShadoEntityVisibilityWorker.supported) {
    throw new Error(
      'The million-actor benchmark requires SharedArrayBuffer and a visibility worker'
    );
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter is available');
  const timestampSupported = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({
    requiredFeatures: timestampSupported ? ['timestamp-query'] : [],
  });
  const worker = await ShadoEntityVisibilityWorker.create(
    { tiles: VISIBILITY_TILES },
    { capacity: options.actors, publishFlags: false }
  );
  const resources: Array<{ destroy(): void }> = [];

  try {
    const setupStarted = performance.now();
    const loaded = await deserializeShadoModel(
      { modelUrl: '/shado/preprocessed/models/barbarian.model.json.gz' },
      { vat: 'float16', gpu: { textureHalfFloat: true } }
    );
    const vat = loaded.vat;
    const packedScene = loaded.model?.scene as PackedScene | undefined;
    const geometries = packedScene?.geometries?.vertexData;
    if (!vat || !geometries?.length) {
      throw new Error('The benchmark could not load preprocessed mesh and VAT data');
    }
    const geometry = mergeGeometry(geometries);

    populateVisibilityProjection(worker, options);
    if (input.packedResidentWords && input.packedResidentSource) {
      throw new Error('Supply packedResidentWords or packedResidentSource, not both');
    }
    const residentWords = input.packedResidentSource
      ? undefined
      : (input.packedResidentWords ?? createPackedResidentActors(options.actors, options.visible));
    const residentByteLength = input.packedResidentSource?.byteLength ?? residentWords!.byteLength;
    if (residentByteLength !== options.actors * 16) {
      throw new RangeError(
        `Packed resident source has ${residentByteLength} bytes; expected ${options.actors * 16}`
      );
    }
    const residentBuffer = track(
      resources,
      device.createBuffer({
        label: 'million-actor-packed-transforms',
        size: residentByteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
    );
    if (input.packedResidentSource) {
      await input.packedResidentSource.upload(device, residentBuffer);
    } else {
      device.queue.writeBuffer(residentBuffer, 0, residentWords!);
    }

    const visibleBuffer = track(
      resources,
      device.createBuffer({
        label: 'million-actor-visible-indices',
        size: Math.max(4, options.visible * Uint32Array.BYTES_PER_ELEMENT),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
    );
    const paramsBuffer = track(
      resources,
      device.createBuffer({
        label: 'million-actor-frame-params',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
    );
    const positionBuffer = createGpuBuffer(
      device,
      resources,
      'barbarian-positions',
      new Float32Array(geometry.positions),
      GPUBufferUsage.VERTEX
    );
    const skinBuffer = createGpuBuffer(
      device,
      resources,
      'barbarian-skinning',
      interleaveSkinning(geometry),
      GPUBufferUsage.VERTEX
    );
    const indexData = new Uint16Array(geometry.indices);
    const indexBuffer = createGpuBuffer(
      device,
      resources,
      'barbarian-indices',
      indexData,
      GPUBufferUsage.INDEX
    );
    const vatTexture = track(
      resources,
      createVatTexture(device, vat.widthTexels, vat.heightTexels, vat.data.value)
    );
    const totalFrames = options.warmupFrames + options.frames;
    const targetTexture = track(
      resources,
      device.createTexture({
        label: 'million-actor-vat-target',
        size: [options.targetSize, options.targetSize],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      })
    );
    const renderReadback = track(
      resources,
      device.createBuffer({
        label: 'million-actor-render-readback',
        size: totalFrames * 256,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })
    );

    const clip = vat.clips.find(candidate => candidate.frames > 1) ?? vat.clips[0];
    if (!clip) throw new Error('The preprocessed VAT has no clips');
    const module = device.createShaderModule({
      label: 'million-actor-vat-shader',
      code: emitVatBenchmarkWGSL({
        vatWidthBones: vat.dqWidthBones,
        vatTilesX: vat.dqTilesX,
        vatStrideTexels: vat.dqStrideTexels,
        vatHasScale: vat.dqHasScale,
        vatQuality: options.vatQuality,
        clipFrom: clip.from,
        clipFrames: clip.frames,
        clipFps: clip.fps,
      }),
    });
    const compilationInfo = await module.getCompilationInfo();
    const compilationErrors = compilationInfo.messages.filter(message => message.type === 'error');
    if (compilationErrors.length) {
      throw new Error(
        `VAT benchmark shader compilation failed:\n${compilationErrors
          .map(message => `${message.lineNum}:${message.linePos} ${message.message}`)
          .join('\n')}`
      );
    }
    device.pushErrorScope('validation');
    const pipeline = await device.createRenderPipelineAsync({
      label: 'million-actor-vat-pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'mainVertex',
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: 32,
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'mainFragment',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    const pipelineValidationError = await device.popErrorScope();
    if (pipelineValidationError) throw pipelineValidationError;
    device.pushErrorScope('validation');
    const bindGroup = device.createBindGroup({
      label: 'million-actor-vat-bind-group',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: residentBuffer } },
        { binding: 1, resource: { buffer: visibleBuffer } },
        { binding: 2, resource: vatTexture.createView() },
        { binding: 3, resource: { buffer: paramsBuffer } },
      ],
    });
    const bindGroupValidationError = await device.popErrorScope();
    if (bindGroupValidationError) throw bindGroupValidationError;

    const planes = createBenchmarkFrustumPlanes();
    const initialRequestStarted = performance.now();
    const initialGeneration = worker.requestScheduled(
      planes,
      VISIBILITY_CELL_FLAGS,
      {
        camera: [0, 0, 0],
        outsideWorldVisible: false,
      },
      { cameraEpoch: 0, cellEpoch: 0, force: true }
    )!;
    const initialRequestMs = performance.now() - initialRequestStarted;
    const initialVisibility = await waitForVisibility(worker);
    assertVisibleCount(initialVisibility.visibleIndices.length, options.visible);
    device.queue.writeBuffer(visibleBuffer, 0, initialVisibility.visibleIndices);
    await device.queue.onSubmittedWorkDone();
    const setupMs = performance.now() - setupStarted;

    const querySet = timestampSupported
      ? device.createQuerySet({ type: 'timestamp', count: totalFrames * 2 })
      : undefined;
    const queryBytes = totalFrames * 2 * BigUint64Array.BYTES_PER_ELEMENT;
    const queryResolve = querySet
      ? track(
          resources,
          device.createBuffer({
            size: queryBytes,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          })
        )
      : undefined;
    const queryReadback = querySet
      ? track(
          resources,
          device.createBuffer({
            size: queryBytes,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          })
        )
      : undefined;

    const frameIntervals: number[] = [];
    const completionIntervals: number[] = [];
    const frameWorkSamples: number[] = [];
    const cpuFrameSamples: number[] = [];
    const queueSamples: number[] = [];
    const requestSamples: number[] = [initialRequestMs];
    const workerSamples: number[] = [];
    let previousCompleted = performance.now();
    let previousRafTimestamp = 0;
    let visibleUploadBytes = initialVisibility.visibleIndices.byteLength;
    let visibleUploadCalls = 1;
    let consumedGenerations = 1;
    let lastVisibleCount = initialVisibility.visibleIndices.length;
    const cullEveryFrames = Math.max(1, Math.round(options.targetFps / options.cullHz));

    for (let frame = 0; frame < totalFrames; frame++) {
      const rafTimestamp = await nextAnimationFrame();
      const frameStarted = performance.now();
      const latest = worker.acquireLatest();
      if (latest) {
        assertVisibleCount(latest.visibleIndices.length, options.visible);
        device.queue.writeBuffer(visibleBuffer, 0, latest.visibleIndices);
        visibleUploadBytes += latest.visibleIndices.byteLength;
        visibleUploadCalls++;
        consumedGenerations++;
        lastVisibleCount = latest.visibleIndices.length;
        workerSamples.push(latest.workerDurationMs);
      }
      const requestStarted = performance.now();
      const requested = worker.requestScheduled(
        planes,
        VISIBILITY_CELL_FLAGS,
        {
          camera: [0, 0, 0],
          outsideWorldVisible: false,
        },
        {
          cameraEpoch: Math.floor(frame / cullEveryFrames) + 1,
          cellEpoch: 0,
          minimumIntervalMs: 1000 / options.cullHz,
          nowMs: rafTimestamp,
        }
      );
      if (requested !== null) {
        requestSamples.push(performance.now() - requestStarted);
      }

      device.queue.writeBuffer(
        paramsBuffer,
        0,
        new Float32Array([frame / options.targetFps, 0, 0, 0])
      );
      const encoder = device.createCommandEncoder({
        label: `million-actor-frame-${frame}`,
      });
      const pass = encoder.beginRenderPass({
        label: 'million-actor-vat-pass',
        colorAttachments: [
          {
            view: targetTexture.createView(),
            clearValue: { r: 0.015, g: 0.02, b: 0.03, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        ...(querySet
          ? {
              timestampWrites: {
                querySet,
                beginningOfPassWriteIndex: frame * 2,
                endOfPassWriteIndex: frame * 2 + 1,
              },
            }
          : {}),
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, positionBuffer);
      pass.setVertexBuffer(1, skinBuffer);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      pass.drawIndexed(indexData.length, lastVisibleCount);
      pass.end();
      encoder.copyTextureToBuffer(
        {
          texture: targetTexture,
          origin: [Math.floor(options.targetSize / 2), Math.floor(options.targetSize / 2)],
        },
        {
          buffer: renderReadback,
          offset: frame * 256,
          bytesPerRow: 256,
        },
        [1, 1]
      );
      device.queue.submit([encoder.finish()]);
      const submitted = performance.now();
      await device.queue.onSubmittedWorkDone();
      const completed = performance.now();

      if (frame >= options.warmupFrames) {
        if (previousRafTimestamp > 0) {
          frameIntervals.push(rafTimestamp - previousRafTimestamp);
        }
        completionIntervals.push(completed - previousCompleted);
        frameWorkSamples.push(completed - frameStarted);
        cpuFrameSamples.push(submitted - frameStarted);
        queueSamples.push(completed - submitted);
      }
      previousRafTimestamp = rafTimestamp;
      previousCompleted = completed;
    }

    const renderChecksum = await readRenderChecksum(renderReadback, totalFrames);
    const gpuSamples = querySet
      ? await readGpuSamples(
          device,
          querySet,
          queryResolve!,
          queryReadback!,
          totalFrames,
          options.warmupFrames
        )
      : [];
    const frame = summarize(frameIntervals);
    const completionInterval = summarize(completionIntervals);
    const frameWork = summarize(frameWorkSamples);
    const cpu = summarize(cpuFrameSamples);
    const queue = summarize(queueSamples);
    const gpu = summarize(gpuSamples);
    const workerTiming = summarize(workerSamples);
    const requestTiming = summarize(requestSamples);
    const frameBudgetMs = 1000 / options.targetFps;
    const missedFrameThresholdMs = frameBudgetMs * 1.5;
    const missedFrames = frameIntervals.filter(sample => sample > missedFrameThresholdMs).length;
    const missedFramePercent = (missedFrames / Math.max(1, frameIntervals.length)) * 100;
    const achievedFpsMean = frame.mean > 0 ? 1000 / frame.mean : 0;
    const gpuTimestampReliable = gpuSamples.some(sample => sample > 0);
    const gpuBudgetSample = gpuTimestampReliable ? gpu.p95 : queue.p95;
    // Headless Chrome can alternate early/late callbacks around the same
    // refresh without skipping one. Use aggregate cadence plus an explicit
    // skipped-refresh threshold rather than requiring every callback to land
    // within a sub-millisecond window around 16.667 ms.
    const sustained60Fps =
      achievedFpsMean >= options.targetFps * 0.98 &&
      missedFramePercent <= 1 &&
      frameWork.p95 <= frameBudgetMs &&
      gpuBudgetSample <= frameBudgetMs &&
      worker.stats.error === null;

    return {
      actorCount: options.actors,
      visibleCount: lastVisibleCount,
      packedResidentBytes: residentByteLength,
      packedBytesPerActor: residentByteLength / Math.max(1, options.actors),
      compactVisibleBytes: options.visible * Uint32Array.BYTES_PER_ELEMENT,
      meshVertices: geometry.positions.length / 3,
      meshIndices: indexData.length,
      vatVertexInvocationsPerFrame: indexData.length * lastVisibleCount,
      vatKind: vat.kind,
      vatVariant: loaded.vatVariant,
      vatBones: vat.bones,
      vatFrames: vat.framesTotal,
      vatClip: clip.name,
      vatQuality: options.vatQuality,
      vatTexture: {
        width: vat.widthTexels,
        height: vat.heightTexels,
        componentType: vat.componentType,
      },
      frames: options.frames,
      warmupFrames: options.warmupFrames,
      targetFps: options.targetFps,
      cullHz: options.cullHz,
      setupMs,
      frameBudgetMs,
      missedFrameThresholdMs,
      missedFrames,
      missedFramePercent,
      sustained60Fps,
      achievedFpsP50: frame.p50 > 0 ? 1000 / frame.p50 : 0,
      achievedFpsMean,
      frameMs: frame,
      completionIntervalMs: completionInterval,
      frameWorkMs: frameWork,
      cpuFrameMs: cpu,
      queueCompletionMs: queue,
      gpuVatPassMs: gpu,
      timestampSupported,
      gpuTimestampReliable,
      gpuTimingSource: gpuTimestampReliable ? 'timestamp-query' : 'queue-completion-upper-bound',
      renderChecksum,
      visibility: {
        initialGeneration,
        requestedGeneration: worker.stats.requestedGeneration,
        completedGeneration: worker.stats.completedGeneration,
        consumedGenerations,
        bootstrap: {
          workerMs: initialVisibility.workerDurationMs,
          candidateCount: initialVisibility.candidateCount,
          hierarchyRebuildMs: initialVisibility.hierarchyRebuildMs,
          copiedInputBytes: initialVisibility.copiedInputBytes,
          publishedFlagBytes: initialVisibility.publishedFlagBytes,
        },
        workerMs: workerTiming,
        requestMs: requestTiming,
        inFlight: worker.stats.inFlight,
        hasPendingRequest: worker.stats.hasPendingRequest,
        candidateCount: worker.stats.candidateCount,
        candidatePercent: (worker.stats.candidateCount / Math.max(1, options.actors)) * 100,
        candidateReduction: options.actors / Math.max(1, worker.stats.candidateCount),
        hierarchyRebuildMs: worker.stats.hierarchyRebuildMs,
        copiedInputBytes: worker.stats.copiedInputBytes,
        fullScanInputBytes: options.actors * 16,
        copiedInputReductionPercent:
          (1 - worker.stats.copiedInputBytes / Math.max(1, options.actors * 16)) * 100,
        publishedFlagBytes: worker.stats.publishedFlagBytes,
        fullFlagBytes: options.actors,
        publishedFlagReductionPercent:
          (1 - worker.stats.publishedFlagBytes / Math.max(1, options.actors)) * 100,
        scheduledSkips: worker.stats.scheduledSkips,
      },
      uploads: {
        residentBytes: residentByteLength,
        residentCalls: 1,
        visibleBytes: visibleUploadBytes,
        visibleCalls: visibleUploadCalls,
      },
      crossOriginIsolated,
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
      },
    };
  } finally {
    worker.dispose();
    for (const resource of resources.reverse()) resource.destroy();
    device.destroy();
  }
}

function readOptions(): BenchmarkOptions {
  const params = new URLSearchParams(location.search);
  const actors = boundedInteger(params.get('count'), 1_000_000, 1, 2_000_000);
  return {
    actors,
    visible: boundedInteger(params.get('visible'), Math.min(20_000, actors), 1, actors),
    frames: boundedInteger(params.get('frames'), 120, 1, 1_000),
    warmupFrames: boundedInteger(params.get('warmup'), 30, 0, 300),
    cullHz: boundedNumber(params.get('cullHz'), 15, 1, 240),
    targetFps: boundedNumber(params.get('targetFps'), 60, 1, 240),
    targetSize: boundedInteger(params.get('targetSize'), 512, 16, 2048),
    vatQuality: readVatQuality(params.get('vatQuality')),
  };
}

function readVatQuality(value: string | null): BenchmarkOptions['vatQuality'] {
  return value === 'medium' || value === 'low' || value === 'rigid' ? value : 'full';
}

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value ?? fallback) || fallback)));
}

function boundedNumber(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(minimum, Math.min(maximum, Number(value ?? fallback) || fallback));
}

function populateVisibilityProjection(
  worker: ShadoEntityVisibilityWorker,
  options: BenchmarkOptions
): void {
  const projection = worker.projection;
  const columns = Math.ceil(Math.sqrt(options.visible));
  const rows = Math.ceil(options.visible / columns);
  for (let index = 0; index < options.actors; index++) {
    if (index < options.visible) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      projection.positionX[index] = columns <= 1 ? 0 : -90 + (180 * column) / (columns - 1);
      projection.positionY[index] = 0;
      projection.positionZ[index] = rows <= 1 ? 0 : -90 + (180 * row) / (rows - 1);
    } else {
      projection.positionX[index] = 1000;
      projection.positionY[index] = 0;
      projection.positionZ[index] = 0;
    }
  }
  projection.radius.fill(1, 0, options.actors);
  projection.enabled.fill(1, 0, options.actors);
  projection.phaseMask.fill(0xffffffff, 0, options.actors);
  projection.count = options.actors;
}

export function createPackedResidentActors(actorCount: number, visibleCount: number): Uint32Array {
  const words = new Uint32Array(actorCount * 4);
  const columns = Math.ceil(Math.sqrt(visibleCount));
  const rows = Math.ceil(visibleCount / columns);
  const packedIdentityXY = pack2x16Snorm(0, 0);
  const packedIdentityZW = pack2x16Snorm(0, 1);
  for (let index = 0; index < actorCount; index++) {
    let x = 1000;
    let z = 0;
    if (index < visibleCount) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      x = columns <= 1 ? 0 : -90 + (180 * column) / (columns - 1);
      z = rows <= 1 ? 0 : -90 + (180 * row) / (rows - 1);
    }
    const offset = index * 4;
    words[offset] = pack2x16Unorm(
      (x - DOMAIN_ORIGIN[0]) / DOMAIN_EXTENT[0],
      (0 - DOMAIN_ORIGIN[1]) / DOMAIN_EXTENT[1]
    );
    words[offset + 1] = pack2x16Unorm(
      (z - DOMAIN_ORIGIN[2]) / DOMAIN_EXTENT[2],
      (1 - SCALE_RANGE[0]) / (SCALE_RANGE[1] - SCALE_RANGE[0])
    );
    words[offset + 2] = packedIdentityXY;
    words[offset + 3] = packedIdentityZW;
  }
  return words;
}

function mergeGeometry(geometries: PackedVertexData[]): PackedVertexData {
  const first = geometries[0];
  if (
    !first?.positions?.length ||
    !first.matricesIndices?.length ||
    !first.matricesWeights?.length
  ) {
    throw new Error('The preprocessed model has incomplete vertex data');
  }
  return {
    positions: first.positions,
    matricesIndices: first.matricesIndices,
    matricesWeights: first.matricesWeights,
    indices: geometries.flatMap(candidate => candidate.indices ?? []),
  };
}

function interleaveSkinning(geometry: PackedVertexData): Float32Array {
  const vertices = geometry.positions.length / 3;
  const output = new Float32Array(vertices * 8);
  for (let vertex = 0; vertex < vertices; vertex++) {
    const source = vertex * 4;
    const destination = vertex * 8;
    for (let lane = 0; lane < 4; lane++) {
      output[destination + lane] = geometry.matricesIndices[source + lane] ?? 0;
      output[destination + lane + 4] = geometry.matricesWeights[source + lane] ?? 0;
    }
  }
  return output;
}

function createGpuBuffer(
  device: GPUDevice,
  resources: Array<{ destroy(): void }>,
  label: string,
  data: ArrayBufferView,
  usage: GPUBufferUsageFlags
): GPUBuffer {
  const buffer = track(
    resources,
    device.createBuffer({
      label,
      size: Math.ceil(data.byteLength / 4) * 4,
      usage: usage | GPUBufferUsage.COPY_DST,
    })
  );
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function createVatTexture(
  device: GPUDevice,
  width: number,
  height: number,
  base64: string
): GPUTexture {
  const texture = device.createTexture({
    label: 'barbarian-dq-vat',
    size: [width, height],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const source = decodeBase64(base64);
  const sourceBytesPerRow = width * 4 * Uint16Array.BYTES_PER_ELEMENT;
  const bytesPerRow = Math.ceil(sourceBytesPerRow / 256) * 256;
  const upload =
    bytesPerRow === sourceBytesPerRow
      ? source
      : padTextureRows(source, sourceBytesPerRow, bytesPerRow, height);
  device.queue.writeTexture({ texture }, upload, { bytesPerRow, rowsPerImage: height }, [
    width,
    height,
  ]);
  return texture;
}

function padTextureRows(
  source: Uint8Array,
  sourceBytesPerRow: number,
  bytesPerRow: number,
  height: number
): Uint8Array {
  const output = new Uint8Array(bytesPerRow * height);
  for (let row = 0; row < height; row++) {
    output.set(
      source.subarray(row * sourceBytesPerRow, (row + 1) * sourceBytesPerRow),
      row * bytesPerRow
    );
  }
  return output;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function createBenchmarkFrustumPlanes(): Float32Array {
  return new Float32Array([
    1, 0, 0, 100, -1, 0, 0, 100, 0, 1, 0, 100, 0, -1, 0, 100, 0, 0, 1, 100, 0, 0, -1, 100,
  ]);
}

async function waitForVisibility(
  worker: ShadoEntityVisibilityWorker
): Promise<NonNullable<ReturnType<ShadoEntityVisibilityWorker['acquireLatest']>>> {
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    const result = worker.acquireLatest();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for the million-actor visibility pass');
}

function assertVisibleCount(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`Visibility reducer returned ${actual} actors; expected ${expected}`);
  }
}

async function nextAnimationFrame(): Promise<number> {
  return await new Promise<number>(resolve => requestAnimationFrame(resolve));
}

async function readGpuSamples(
  device: GPUDevice,
  querySet: GPUQuerySet,
  resolveBuffer: GPUBuffer,
  readbackBuffer: GPUBuffer,
  totalFrames: number,
  warmupFrames: number
): Promise<number[]> {
  const encoder = device.createCommandEncoder({
    label: 'million-actor-timestamp-readback',
  });
  const bytes = totalFrames * 2 * BigUint64Array.BYTES_PER_ELEMENT;
  encoder.resolveQuerySet(querySet, 0, totalFrames * 2, resolveBuffer, 0);
  encoder.copyBufferToBuffer(resolveBuffer, 0, readbackBuffer, 0, bytes);
  device.queue.submit([encoder.finish()]);
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const timestamps = new BigUint64Array(readbackBuffer.getMappedRange()).slice();
  readbackBuffer.unmap();
  querySet.destroy();
  const samples: number[] = [];
  for (let frame = warmupFrames; frame < totalFrames; frame++) {
    samples.push(Number(timestamps[frame * 2 + 1] - timestamps[frame * 2]) / 1_000_000);
  }
  return samples;
}

async function readRenderChecksum(readbackBuffer: GPUBuffer, totalFrames: number): Promise<number> {
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const bytes = new Uint8Array(readbackBuffer.getMappedRange());
  let checksum = 0;
  for (let frame = 0; frame < totalFrames; frame++) {
    const offset = frame * 256;
    checksum =
      (checksum +
        bytes[offset] +
        bytes[offset + 1] * 3 +
        bytes[offset + 2] * 7 +
        bytes[offset + 3] * 11) >>>
      0;
  }
  readbackBuffer.unmap();
  return checksum;
}

function summarize(values: number[]): SampleSummary {
  if (!values.length) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1],
  };
}

function track<T extends { destroy(): void }>(
  resources: Array<{ destroy(): void }>,
  resource: T
): T {
  resources.push(resource);
  return resource;
}

function pack2x16Unorm(first: number, second: number): number {
  return (
    (Math.round(clamp(first, 0, 1) * 65535) | (Math.round(clamp(second, 0, 1) * 65535) << 16)) >>> 0
  );
}

function pack2x16Snorm(first: number, second: number): number {
  const encode = (value: number) => Math.round(clamp(value, -1, 1) * 32767) & 0xffff;
  return (encode(first) | (encode(second) << 16)) >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function emitVatBenchmarkWGSL(config: {
  vatWidthBones: number;
  vatTilesX: number;
  vatStrideTexels: number;
  vatHasScale: boolean;
  vatQuality: BenchmarkOptions['vatQuality'];
  clipFrom: number;
  clipFrames: number;
  clipFps: number;
}): string {
  const blendFrameBody =
    config.vatQuality === 'low'
      ? `
  var lane = 0u;
  var dominantWeight = weights.x;
  if (weights.y > dominantWeight) { lane = 1u; dominantWeight = weights.y; }
  if (weights.z > dominantWeight) { lane = 2u; dominantWeight = weights.z; }
  if (weights.w > dominantWeight) { lane = 3u; }
  return normalizeDQ(loadDQ(indices[lane], frameRow));`
      : `
  var real = vec4f(0.0);
  var dual = vec4f(0.0);
  var scale = 0.0;
  for (var lane = 0u; lane < 4u; lane++) {
    let weight = weights[lane];
    if (weight > 0.0) {
      var value = loadDQ(indices[lane], frameRow);
      if (dot(real, real) > 0.0 && dot(value.real, real) < 0.0) {
        value.real = -value.real;
        value.dual = -value.dual;
      }
      real += value.real * weight;
      dual += value.dual * weight;
      scale += value.scale * weight;
    }
  }
  return normalizeDQ(DQ(real, dual, scale));`;
  const skinningBody =
    config.vatQuality === 'rigid'
      ? 'let skinned = meshPosition;'
      : config.vatQuality === 'full'
        ? `
  let dq0 = blendFrame(indices, weights, frame0);
  var dq1 = blendFrame(indices, weights, frame1);
  if (dot(dq0.real, dq1.real) < 0.0) {
    dq1.real = -dq1.real;
    dq1.dual = -dq1.dual;
  }
  let blended = normalizeDQ(DQ(
    mix(dq0.real, dq1.real, interpolation),
    mix(dq0.dual, dq1.dual, interpolation),
    mix(dq0.scale, dq1.scale, interpolation)
  ));
  let skinned = transformDQ(blended, meshPosition * blended.scale);`
        : `
  let blended = blendFrame(indices, weights, frame0);
  let skinned = transformDQ(blended, meshPosition * blended.scale);`;
  return `
struct FrameParams {
  time: f32,
  _padding: vec3f,
};

struct DQ {
  real: vec4f,
  dual: vec4f,
  scale: f32,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@group(0) @binding(0) var<storage, read> actors: array<vec4u>;
@group(0) @binding(1) var<storage, read> visibleIds: array<u32>;
@group(0) @binding(2) var dqVat: texture_2d<f32>;
@group(0) @binding(3) var<uniform> frame: FrameParams;

fn loadDQ(bone: u32, frameRow: u32) -> DQ {
  let boneIndex = min(bone, ${Math.max(0, config.vatWidthBones * config.vatTilesX - 1)}u);
  let x = (boneIndex % ${config.vatWidthBones}u) * ${config.vatStrideTexels}u;
  let tile = boneIndex / ${config.vatWidthBones}u;
  let y = frameRow * ${config.vatTilesX}u + tile;
  let real = textureLoad(dqVat, vec2i(i32(x), i32(y)), 0);
  let dual = textureLoad(dqVat, vec2i(i32(x + 1u), i32(y)), 0);
  ${
    config.vatHasScale
      ? `let scale = textureLoad(dqVat, vec2i(i32(x + 2u), i32(y)), 0).x;`
      : 'let scale = 1.0;'
  }
  return DQ(real, dual, scale);
}

fn normalizeDQ(value: DQ) -> DQ {
  let inverseLength = inverseSqrt(max(dot(value.real, value.real), 1e-20));
  let real = value.real * inverseLength;
  var dual = value.dual * inverseLength;
  dual -= real * dot(real, dual);
  return DQ(real, dual, value.scale);
}

fn blendFrame(indices: vec4u, weights: vec4f, frameRow: u32) -> DQ {
  ${blendFrameBody}
}

fn transformDQ(value: DQ, point: vec3f) -> vec3f {
  let qv = value.real.xyz;
  let translated = 2.0 * (
    value.dual.xyz * value.real.w - qv * value.dual.w +
    cross(qv, value.dual.xyz)
  );
  let rotated = point + 2.0 * value.real.w * cross(qv, point) +
    2.0 * cross(qv, cross(qv, point));
  return rotated + translated;
}

fn rotateQuaternion(rotation: vec4f, point: vec3f) -> vec3f {
  return point +
    2.0 * cross(rotation.xyz, cross(rotation.xyz, point) + rotation.w * point);
}

@vertex
fn mainVertex(
  @location(0) meshPosition: vec3f,
  @location(1) boneIndicesInput: vec4f,
  @location(2) boneWeightsInput: vec4f,
  @builtin(instance_index) drawIndex: u32
) -> VertexOutput {
  let actorIndex = visibleIds[drawIndex];
  let packed = actors[actorIndex];
  let xy = unpack2x16unorm(packed.x);
  let zScale = unpack2x16unorm(packed.y);
  let rotationXY = unpack2x16snorm(packed.z);
  let rotationZW = unpack2x16snorm(packed.w);
  let actorPosition = vec3f(
    ${DOMAIN_ORIGIN[0]}.0 + xy.x * ${DOMAIN_EXTENT[0]}.0,
    ${DOMAIN_ORIGIN[1]}.0 + xy.y * ${DOMAIN_EXTENT[1]}.0,
    ${DOMAIN_ORIGIN[2]}.0 + zScale.x * ${DOMAIN_EXTENT[2]}.0
  );
  let actorScale = ${SCALE_RANGE[0]}.0 +
    zScale.y * ${(SCALE_RANGE[1] - SCALE_RANGE[0]).toFixed(1)};
  let rotation = normalize(vec4f(rotationXY, rotationZW));
  let clipTime = frame.time * ${config.clipFps.toFixed(1)} +
    f32(actorIndex % ${config.clipFrames}u);
  let localFrame = clipTime - floor(clipTime / ${config.clipFrames}.0) *
    ${config.clipFrames}.0;
  let frame0 = ${config.clipFrom}u + u32(floor(localFrame));
  let frame1 = ${config.clipFrom}u +
    ((u32(floor(localFrame)) + 1u) % ${config.clipFrames}u);
  let interpolation = fract(localFrame);
  let indices = vec4u(boneIndicesInput + vec4f(0.5));
  let weightSum = max(dot(boneWeightsInput, vec4f(1.0)), 1e-8);
  let weights = boneWeightsInput / weightSum;
  ${skinningBody}
  let world = rotateQuaternion(rotation, skinned * actorScale) + actorPosition;
  var output: VertexOutput;
  output.position = vec4f(
    world.x / 100.0,
    (world.z + world.y) / 100.0,
    0.5,
    1.0
  );
  let tint = f32((actorIndex * 2654435761u) >> 24u) / 255.0;
  output.color = vec4f(0.35 + tint * 0.35, 0.5, 0.72 - tint * 0.2, 1.0);
  return output;
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}
`;
}
