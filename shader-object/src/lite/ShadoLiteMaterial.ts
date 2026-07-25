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
import type { ShadoLiteInstanceContainer } from './ShadoLiteInstanceContainer';

export interface ShadoLiteMaterialOptions {
  /** Reserved draw capacity. Grows geometrically when omitted or exceeded. */
  capacity?: number;
  name?: string;
  backFaceCulling?: boolean;
  needAlphaBlending?: boolean;
}

export interface ShadoLiteMaterialHandle {
  readonly material: ShaderMaterial;
  /** Synchronize immediately; normal scenes call this from onBeforeRender. */
  update(): void;
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
    .replace(
      new RegExp(
        `var<storage,\\s*read>\\s+${lname}Buf\\s*:\\s*array<u32>\\s*;`,
        'g'
      ),
      ''
    )
    .replace(
      new RegExp(
        `var<storage,\\s*read>\\s+${lname}Params\\s*:\\s*array<i32>\\s*;`,
        'g'
      ),
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

/**
 * Attach a packed Shado actor container to a Babylon Lite mesh exclusively
 * through public Lite APIs. No method replacement, private fields, or custom
 * render-pass interception is involved.
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
  const sources = buildBabylonLiteShadoShaderSources(schema);
  const material = createShaderMaterial({
    name: options.name ?? `${schema.name}LiteMaterial`,
    ...sources,
    attributes: ['position'],
    uniforms: ['worldViewProjection'],
    storageBuffers: [
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

  setShaderStorageBuffer(material, 'shadoVisibleIndices', visibleBuffer);
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
    container.commit();
    container.bindMaterial(material);

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
    }
  });
  update();

  return {
    material,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      setThinInstanceCount(mesh, 0);
      disposeStorageBuffer(visibleBuffer);
    },
  };
}
