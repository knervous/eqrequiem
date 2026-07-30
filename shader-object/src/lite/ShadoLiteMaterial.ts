import {
  createShaderMaterial,
  createStorageBuffer,
  disposeStorageBuffer,
  enableThinInstanceDynamicDrawCount,
  onBeforeRender,
  onSceneDispose,
  setShaderStorageBuffer,
  setThinInstanceCount,
  setThinInstanceDrawCount,
  setThinInstances,
  updateStorageBuffer,
  type EngineContext,
  type Mesh,
  type SceneContext,
  type ShaderMaterial,
  type StorageBuffer,
} from '@babylonjs/lite';

import type { ShadoStructSchema } from '../schema/ShadoStructSchema';
import {
  ActorRenderProjection,
  type ActorProjectionShapeSpan,
  type ActorProjectionStreamPlan,
  type ActorProjectionSyncResult,
  type ActorRenderProjectionConfig,
} from '../render-data/ActorRenderProjection';
import type { ComputeScatterShape } from '../render-data/ComputeScatter';
import {
  BabylonLiteComputeScatterExecutor,
  canUseBabylonLiteComputeScatter,
} from './BabylonLiteComputeScatter';
import type { ShadoLiteInstanceContainer } from './ShadoLiteInstanceContainer';

export interface ShadoLiteMaterialOptions {
  /** Reserved draw capacity. Grows geometrically when omitted or exceeded. */
  capacity?: number;
  name?: string;
  backFaceCulling?: boolean;
  needAlphaBlending?: boolean;
  /**
   * Opt in to pass-specific actor streams. The legacy packed actor arena
   * remains the default and stays the canonical CPU representation.
   */
  projection?: ActorRenderProjectionConfig | false;
  /**
   * Use Lite's feature-detected WebGPU compatibility bridge for projected
   * random sparse writes. Defaults to true when projection mode is enabled.
   */
  computeScatter?: boolean;
  /** Measure the latest compute scatter with timestamp queries when available. */
  computeScatterGPUTiming?: boolean;
}

export interface ShadoLiteProjectionPublicationResult {
  readonly projection: ActorProjectionSyncResult;
  readonly scatterDispatches: number;
  readonly fallbackFullWrites: number;
  readonly actualUploadCalls: number;
  readonly actualUploadedBytes: number;
}

export interface ShadoLiteProjectionGPUTiming {
  readonly transformScatterMs: number;
  readonly appearanceScatterMs: number;
}

export interface ShadoLiteMaterialHandle {
  readonly material: ShaderMaterial;
  /** Synchronize immediately; normal scenes call this from onBeforeRender. */
  update(): void;
  /** Last projected-stream publication, when projection mode is enabled. */
  getLastProjectionSync(): ActorProjectionSyncResult | undefined;
  /** Actual writes/dispatches performed by the latest projected publication. */
  getLastProjectionPublication(): ShadoLiteProjectionPublicationResult | undefined;
  /** Latest enabled timestamp-query results for the dispatched stream shapes. */
  getLastProjectionGPUTiming(): ShadoLiteProjectionGPUTiming;
  dispose(): void;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function nextCapacity(current: number, required: number): number {
  let capacity = Math.max(4, current | 0);
  while (capacity < required) capacity *= 2;
  return capacity;
}

function identityMatrices(capacity: number): Float32Array {
  const matrices = new Float32Array(capacity * 16);
  for (let i = 0; i < capacity; i++) {
    const offset = i * 16;
    matrices[offset] = 1;
    matrices[offset + 5] = 1;
    matrices[offset + 10] = 1;
    matrices[offset + 15] = 1;
  }
  return matrices;
}

function scatterShapeKey(shape: ComputeScatterShape): string {
  return `${shape.destinationStrideWords}:${shape.destinationOffsetWords ?? 0}:${shape.copyWords}`;
}

/**
 * Emit the declarations/getters used by Lite's native ShaderMaterial. Resource
 * declarations themselves are omitted because Lite assigns their public
 * storageBuffers entries to the correct group/binding slots.
 */
export function emitBabylonLiteStorageSource(schema: ShadoStructSchema): string {
  const childHeaders = Object.values(schema.structArrays)
    .map(entry => entry.schema.emitHeaderStructWGSL())
    .join('\n');
  const lname = lowerFirst(schema.name);
  const source = schema.emitWGSLStorage();
  const withoutResources = source
    .replace(new RegExp(`var<storage,\\s*read>\\s+${lname}Buf\\s*:\\s*array<u32>\\s*;`, 'g'), '')
    .replace(
      new RegExp(`var<storage,\\s*read>\\s+${lname}Params\\s*:\\s*array<i32>\\s*;`, 'g'),
      ''
    );
  return `${childHeaders}\n${withoutResources}`;
}

export function buildBabylonLiteShadoShaderSources(schema: ShadoStructSchema): {
  vertexSource: string;
  fragmentSource: string;
} {
  const actor = schema.structArrays.instances?.schema;
  if (!actor) {
    throw new Error(`${schema.name} must declare a struct-array field named instances.`);
  }
  for (const field of ['translation', 'rotation', 'color']) {
    if (!actor.fields.some(candidate => candidate.name === field)) {
      throw new Error(
        `${actor.name} must expose ${field} for the default Babylon Lite Shado material.`
      );
    }
  }
  const storage = emitBabylonLiteStorageSource(schema);
  const vertexSource = `
${storage}

struct ShadoLiteVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

fn ShadoLite_rotatePoint(q: vec4<f32>, point: vec3<f32>) -> vec3<f32> {
  return point + 2.0 * cross(q.xyz, cross(q.xyz, point) + q.w * point);
}

@vertex
fn mainVertex(
  input: VertexInput,
  @builtin(instance_index) drawIndex: u32
) -> ShadoLiteVertexOutput {
  var out: ShadoLiteVertexOutput;
  let sourceIndex = i32(shadoVisibleIndices[drawIndex]);
  let actor = ${schema.name}_instances_get(sourceIndex);
  let scaled = input.position * actor.translation.w;
  let worldPosition =
    ShadoLite_rotatePoint(actor.rotation, scaled) + actor.translation.xyz;
  out.position =
    shaderSystem.worldViewProjection * vec4<f32>(worldPosition, 1.0);
  out.color = actor.color;
  return out;
}
`;
  const fragmentSource = `
struct ShadoLiteVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@fragment
fn mainFragment(input: ShadoLiteVertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`;
  return { vertexSource, fragmentSource };
}

function wgslFloat(value: number): string {
  if (!Number.isFinite(value)) throw new Error('WGSL projection constants must be finite.');
  const source = value.toString();
  return source.includes('.') || source.includes('e') ? source : `${source}.0`;
}

/**
 * The projected shader reads only transform/appearance words needed by this
 * pass. Domain constants specialize packed decoding without another per-frame
 * uniform upload.
 */
export function buildBabylonLiteProjectedShaderSources(config: ActorRenderProjectionConfig): {
  vertexSource: string;
  fragmentSource: string;
} {
  const projection = new ActorRenderProjection(config);
  const origin = projection.domain.origin.map(wgslFloat).join(', ');
  const extent = projection.domain.extent.map(wgslFloat).join(', ');
  const scaleRange = projection.domain.scaleRange.map(wgslFloat).join(', ');
  const decode =
    config.encoding === 'packed'
      ? `
  let transformBase = sourceIndex * 4u;
  let positionXY = unpack2x16unorm(shadoActorTransform[transformBase]);
  let positionZScale = unpack2x16unorm(shadoActorTransform[transformBase + 1u]);
  let rotationXY = unpack2x16snorm(shadoActorTransform[transformBase + 2u]);
  let rotationZW = unpack2x16snorm(shadoActorTransform[transformBase + 3u]);
  let translation = vec4<f32>(
    vec3<f32>(${origin}) +
      vec3<f32>(positionXY, positionZScale.x) * vec3<f32>(${extent}),
    vec2<f32>(${scaleRange}).x +
      positionZScale.y * (vec2<f32>(${scaleRange}).y - vec2<f32>(${scaleRange}).x)
  );
  let rotation = normalize(vec4<f32>(rotationXY, rotationZW));
  let color = unpack4x8unorm(shadoActorAppearance[sourceIndex]);`
      : `
  let transformBase = sourceIndex * 8u;
  let appearanceBase = sourceIndex * 4u;
  let translation = vec4<f32>(
    bitcast<f32>(shadoActorTransform[transformBase]),
    bitcast<f32>(shadoActorTransform[transformBase + 1u]),
    bitcast<f32>(shadoActorTransform[transformBase + 2u]),
    bitcast<f32>(shadoActorTransform[transformBase + 3u])
  );
  let rotation = vec4<f32>(
    bitcast<f32>(shadoActorTransform[transformBase + 4u]),
    bitcast<f32>(shadoActorTransform[transformBase + 5u]),
    bitcast<f32>(shadoActorTransform[transformBase + 6u]),
    bitcast<f32>(shadoActorTransform[transformBase + 7u])
  );
  let color = vec4<f32>(
    bitcast<f32>(shadoActorAppearance[appearanceBase]),
    bitcast<f32>(shadoActorAppearance[appearanceBase + 1u]),
    bitcast<f32>(shadoActorAppearance[appearanceBase + 2u]),
    bitcast<f32>(shadoActorAppearance[appearanceBase + 3u])
  );`;

  return {
    vertexSource: `
struct ShadoLiteVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

fn ShadoLite_rotatePoint(q: vec4<f32>, point: vec3<f32>) -> vec3<f32> {
  return point + 2.0 * cross(q.xyz, cross(q.xyz, point) + q.w * point);
}

@vertex
fn mainVertex(
  input: VertexInput,
  @builtin(instance_index) drawIndex: u32
) -> ShadoLiteVertexOutput {
  var out: ShadoLiteVertexOutput;
  let sourceIndex = shadoVisibleIndices[drawIndex];
${decode}
  let scaled = input.position * translation.w;
  let worldPosition =
    ShadoLite_rotatePoint(rotation, scaled) + translation.xyz;
  out.position =
    shaderSystem.worldViewProjection * vec4<f32>(worldPosition, 1.0);
  out.color = color;
  return out;
}
`,
    fragmentSource: `
struct ShadoLiteVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@fragment
fn mainFragment(input: ShadoLiteVertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`,
  };
}

/**
 * Attach a packed Shado actor container to a Babylon Lite mesh. The default
 * path uses public Lite APIs; projected compute scatter delegates its opaque
 * device/buffer access to BabylonLiteComputeScatterExecutor. No method
 * replacement or custom render-pass interception is involved.
 */
export function createShadoLiteMaterial<T extends ShadoLiteInstanceContainer<any>>(
  engine: EngineContext,
  scene: SceneContext,
  mesh: Mesh,
  container: T,
  options: ShadoLiteMaterialOptions = {}
): ShadoLiteMaterialHandle {
  const schema = container.getSchema();
  const lname = lowerFirst(schema.name);
  const projectionConfig =
    options.projection &&
    ({
      ...options.projection,
      uploadPolicy: {
        ...options.projection.uploadPolicy,
        allowScatter: options.computeScatter !== false,
      },
    } satisfies ActorRenderProjectionConfig);
  const projection = projectionConfig
    ? new ActorRenderProjection({
        ...projectionConfig,
        initialCapacity: Math.max(
          4,
          projectionConfig.initialCapacity ?? 0,
          options.capacity ?? 0,
          container.instanceCount
        ),
      })
    : undefined;
  const sources = projectionConfig
    ? buildBabylonLiteProjectedShaderSources(projectionConfig)
    : buildBabylonLiteShadoShaderSources(schema);
  const material = createShaderMaterial({
    name: options.name ?? `${schema.name}LiteMaterial`,
    ...sources,
    attributes: ['position'],
    uniforms: ['worldViewProjection'],
    storageBuffers: projection
      ? [
          { name: 'shadoActorTransform', type: 'array<u32>' },
          { name: 'shadoActorAppearance', type: 'array<u32>' },
          { name: 'shadoVisibleIndices', type: 'array<u32>' },
        ]
      : [
          { name: `${lname}Buf`, type: 'array<u32>' },
          { name: `${lname}Params`, type: 'array<i32>' },
          { name: 'shadoVisibleIndices', type: 'array<u32>' },
        ],
    backFaceCulling: options.backFaceCulling ?? false,
    needAlphaBlending: options.needAlphaBlending ?? false,
  });

  let capacity = nextCapacity(0, Math.max(options.capacity ?? 0, container.instanceCount));
  let visibleBuffer: StorageBuffer = createStorageBuffer(
    engine,
    new Uint32Array(capacity),
    `${schema.name} visible indices`
  );
  let publishedVisibilityVersion = -1;
  let disposed = false;
  let drawCountReady = false;
  let transformBuffer: StorageBuffer | undefined;
  let appearanceBuffer: StorageBuffer | undefined;
  let projectionBufferCapacity = 0;
  let lastProjectionSync: ActorProjectionSyncResult | undefined;
  let lastProjectionPublication: ShadoLiteProjectionPublicationResult | undefined;
  const lastTransformScatters: BabylonLiteComputeScatterExecutor[] = [];
  const lastAppearanceScatters: BabylonLiteComputeScatterExecutor[] = [];

  const createScatterExecutors = (
    streamName: string,
    strideWords: number,
    shape: readonly ActorProjectionShapeSpan[]
  ): ReadonlyMap<string, BabylonLiteComputeScatterExecutor> => {
    const executors = new Map<string, BabylonLiteComputeScatterExecutor>();
    for (const span of [{ name: 'Row', offsetWords: 0, wordCount: strideWords }, ...shape]) {
      const scatterShape = {
        destinationStrideWords: strideWords,
        destinationOffsetWords: span.offsetWords,
        copyWords: span.wordCount,
      };
      const key = scatterShapeKey(scatterShape);
      if (!executors.has(key)) {
        executors.set(
          key,
          new BabylonLiteComputeScatterExecutor(
            engine,
            scatterShape,
            `ShadoLite${streamName}${span.name}Scatter`,
            options.computeScatterGPUTiming
          )
        );
      }
    }
    return executors;
  };

  const transformScatters =
    projection && options.computeScatter !== false
      ? createScatterExecutors(
          'Transform',
          projection.transformStrideWords,
          projection.transformShape
        )
      : new Map<string, BabylonLiteComputeScatterExecutor>();
  const appearanceScatters =
    projection && options.computeScatter !== false
      ? createScatterExecutors(
          'Appearance',
          projection.appearanceStrideWords,
          projection.appearanceShape
        )
      : new Map<string, BabylonLiteComputeScatterExecutor>();

  const createProjectionBuffers = () => {
    if (!projection) return;
    if (transformBuffer) disposeStorageBuffer(transformBuffer);
    if (appearanceBuffer) disposeStorageBuffer(appearanceBuffer);
    projectionBufferCapacity = projection.capacity;
    transformBuffer = createStorageBuffer(
      engine,
      new Uint32Array(projectionBufferCapacity * projection.transformStrideWords),
      `${schema.name} projected transforms`
    );
    appearanceBuffer = createStorageBuffer(
      engine,
      new Uint32Array(projectionBufferCapacity * projection.appearanceStrideWords),
      `${schema.name} projected appearance`
    );
    setShaderStorageBuffer(material, 'shadoActorTransform', transformBuffer);
    setShaderStorageBuffer(material, 'shadoActorAppearance', appearanceBuffer);
  };

  const applyProjectionPlan = (
    buffer: StorageBuffer,
    plan: ActorProjectionStreamPlan,
    words: Uint32Array,
    scatters: ReadonlyMap<string, BabylonLiteComputeScatterExecutor>,
    timingScatters: BabylonLiteComputeScatterExecutor[],
    publication: {
      scatterDispatches: number;
      fallbackFullWrites: number;
      actualUploadCalls: number;
      actualUploadedBytes: number;
    }
  ) => {
    if (plan.mode === 'scatter' && plan.scatterBatches?.length) {
      let dispatchedAll = canUseBabylonLiteComputeScatter(engine, buffer);
      if (dispatchedAll) {
        for (const batch of plan.scatterBatches) {
          const scatter = scatters.get(scatterShapeKey(batch));
          if (!scatter?.dispatch(batch, buffer)) {
            dispatchedAll = false;
            break;
          }
          timingScatters.push(scatter);
          publication.scatterDispatches++;
          publication.actualUploadCalls += 2;
          publication.actualUploadedBytes += batch.data.byteLength + 16;
        }
      }
      if (dispatchedAll) return;
      const active = words.subarray(0, projection!.count * plan.strideWords);
      if (active.byteLength) {
        updateStorageBuffer(engine, buffer, active, 0);
        publication.fallbackFullWrites++;
        publication.actualUploadCalls++;
        publication.actualUploadedBytes += active.byteLength;
      }
      return;
    }
    for (const range of plan.ranges) {
      if (range.data.byteLength) {
        updateStorageBuffer(engine, buffer, range.data, range.byteOffset);
        publication.actualUploadCalls++;
        publication.actualUploadedBytes += range.data.byteLength;
      }
    }
  };

  setShaderStorageBuffer(material, 'shadoVisibleIndices', visibleBuffer);
  createProjectionBuffers();
  setThinInstances(mesh, identityMatrices(capacity), capacity);
  setThinInstanceCount(mesh, 0);
  enableThinInstanceDynamicDrawCount(mesh);
  mesh.material = material;

  const ensureCapacity = (required: number) => {
    if (required <= capacity) return;
    capacity = nextCapacity(capacity, required);
    disposeStorageBuffer(visibleBuffer);
    visibleBuffer = createStorageBuffer(
      engine,
      new Uint32Array(capacity),
      `${schema.name} visible indices`
    );
    setShaderStorageBuffer(material, 'shadoVisibleIndices', visibleBuffer);
    setThinInstances(mesh, identityMatrices(capacity), capacity);
    setThinInstanceCount(mesh, 0);
    enableThinInstanceDynamicDrawCount(mesh);
    drawCountReady = false;
    publishedVisibilityVersion = -1;
  };

  const update = () => {
    if (disposed) return;
    ensureCapacity(container.instanceCount);
    if (projection) {
      lastProjectionSync = projection.sync(container.children, {
        dirtyFlags: container.getStructDirtyFlags('instances'),
      });
      if (projection.capacity !== projectionBufferCapacity) createProjectionBuffers();
      lastTransformScatters.length = 0;
      lastAppearanceScatters.length = 0;
      const publication: ShadoLiteProjectionPublicationResult = {
        projection: lastProjectionSync,
        scatterDispatches: 0,
        fallbackFullWrites: 0,
        actualUploadCalls: 0,
        actualUploadedBytes: 0,
      };
      const mutable = publication as {
        scatterDispatches: number;
        fallbackFullWrites: number;
        actualUploadCalls: number;
        actualUploadedBytes: number;
      };
      applyProjectionPlan(
        transformBuffer!,
        lastProjectionSync.transform,
        projection.transformWords,
        transformScatters,
        lastTransformScatters,
        mutable
      );
      applyProjectionPlan(
        appearanceBuffer!,
        lastProjectionSync.appearance,
        projection.appearanceWords,
        appearanceScatters,
        lastAppearanceScatters,
        mutable
      );
      lastProjectionPublication = publication;
      container.clearStructDirtyFlags('instances');
    } else {
      container.commit();
      container.bindMaterial(material);
    }

    if (publishedVisibilityVersion !== container.visibilityVersion) {
      const indices = container.visibleActorIndices;
      if (indices.byteLength) updateStorageBuffer(engine, visibleBuffer, indices, 0);
      publishedVisibilityVersion = container.visibilityVersion;
    }

    const count = container.getVisibleCount();
    if (drawCountReady) {
      setThinInstanceDrawCount(mesh, count);
      return;
    }
    // Before Lite's first normal GPU sync there is no stable matrix buffer yet.
    // The ordinary count path performs that one-time upload; later frames use
    // the draw-argument-only update above.
    try {
      setThinInstanceDrawCount(mesh, count);
      drawCountReady = true;
    } catch {
      setThinInstanceCount(mesh, count);
    }
  };

  onBeforeRender(scene, update);
  onSceneDispose(scene, () => {
    if (!disposed) {
      disposed = true;
      disposeStorageBuffer(visibleBuffer);
      if (transformBuffer) disposeStorageBuffer(transformBuffer);
      if (appearanceBuffer) disposeStorageBuffer(appearanceBuffer);
      for (const scatter of transformScatters.values()) scatter.dispose();
      for (const scatter of appearanceScatters.values()) scatter.dispose();
    }
  });
  update();

  return {
    material,
    update,
    getLastProjectionSync() {
      return lastProjectionSync;
    },
    getLastProjectionPublication() {
      return lastProjectionPublication;
    },
    getLastProjectionGPUTiming() {
      return {
        transformScatterMs: lastTransformScatters.reduce(
          (sum, scatter) => sum + scatter.gpuTimeMs,
          0
        ),
        appearanceScatterMs: lastAppearanceScatters.reduce(
          (sum, scatter) => sum + scatter.gpuTimeMs,
          0
        ),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      setThinInstanceCount(mesh, 0);
      disposeStorageBuffer(visibleBuffer);
      if (transformBuffer) disposeStorageBuffer(transformBuffer);
      if (appearanceBuffer) disposeStorageBuffer(appearanceBuffer);
      for (const scatter of transformScatters.values()) scatter.dispose();
      for (const scatter of appearanceScatters.values()) scatter.dispose();
    },
  };
}
