import { ascField, ascRecord } from '../asc/records';
import { SHADO_DYNAMIC_ENTITY_REDUCER_WASM_GZ_BASE64 } from './wasm/shado-dynamic-entity-reducer-wasm-gz-b64';

export const SHADO_DYNAMIC_ENTITY_REDUCER_MAGIC = 0x44524453;
export const SHADO_DYNAMIC_ENTITY_REDUCER_VERSION = 1;
export const SHADO_DYNAMIC_ENTITY_DELTA_HEADER_BYTES = 16;
export const SHADO_DYNAMIC_ENTITY_DELTA_RECORD_BYTES = 48;
export const SHADO_DYNAMIC_ENTITY_EXPIRATION_RECORD_BYTES = 24;

export const SHADO_DYNAMIC_ENTITY_VISIBLE = 1 << 0;

export const SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_FRAME = 1 << 0;
export const SHADO_DYNAMIC_ENTITY_EXPIRATION_BY_SIMULATION_TIME = 1 << 1;

export const ShadoDynamicEntityReducerOp = {
  SetDestination: 1,
  DirectPlace: 2,
  SetVisibility: 3,
  SetExpiration: 4,
  MarkActive: 5,
} as const;

export type ShadoDynamicEntityReducerOp =
  (typeof ShadoDynamicEntityReducerOp)[keyof typeof ShadoDynamicEntityReducerOp];

@ascRecord({ name: 'ShadoDynamicEntityDeltaRecord', byteSize: SHADO_DYNAMIC_ENTITY_DELTA_RECORD_BYTES })
export class ShadoDynamicEntityDeltaRecord {
  @ascField('u32')
  op!: number;

  @ascField('i32')
  index!: number;

  @ascField('vec4')
  positionSize!: Float32Array;

  @ascField('f32')
  z!: number;

  @ascField('f32')
  speed!: number;

  @ascField('u32')
  flags!: number;

  @ascField('i32')
  removeAfterFrame!: number;

  @ascField('f64')
  removeAfterSimulationTime!: number;
}

@ascRecord({
  name: 'ShadoDynamicEntityExpirationRecord',
  byteSize: SHADO_DYNAMIC_ENTITY_EXPIRATION_RECORD_BYTES,
})
export class ShadoDynamicEntityExpirationRecord {
  @ascField('i32')
  index!: number;

  @ascField('i32')
  removeAfterFrame!: number;

  @ascField('i32')
  flags!: number;

  @ascField('i32')
  padding!: number;

  @ascField('f64')
  removeAfterSimulationTime!: number;
}

export const SHADO_ENTITY2D_REDUCER_LAYOUT = {
  strideBytes: 112,
  positionSizeOffset: 0,
  renderOffset: 16,
  destinationSizeOffset: 32,
  motionOffset: 48,
  uvRectOffset: 64,
  colorOffset: 80,
  renderStateOffset: 96,
} as const;

export type ShadoDynamicEntityReducerDeltaRecord = {
  op: ShadoDynamicEntityReducerOp;
  index: number;
  x?: number;
  y?: number;
  width?: number;
  depth?: number;
  z?: number;
  speed?: number;
  flags?: number;
  removeAfterFrame?: number;
  removeAfterSimulationTime?: number;
};

export type ShadoDynamicEntityReducerInit = {
  entityBasePtr: number;
  entityCapacity: number;
  entityStrideBytes?: number;
  positionSizeOffset?: number;
  renderOffset?: number;
  destinationSizeOffset?: number;
  motionOffset?: number;
  renderStateOffset?: number;
  activeIndexPtr?: number;
  activeIndexCapacity?: number;
  changedIndexPtr?: number;
  changedIndexCapacity?: number;
  expirationPtr?: number;
  expirationCapacity?: number;
  expirationStrideBytes?: number;
};

export type ShadoDynamicEntityReducerOptions = {
  wasmBytes?: BufferSource;
  wasmModule?: WebAssembly.Module;
  imports?: WebAssembly.Imports;
};

export type ShadoDynamicEntityReducerExports = {
  memory: WebAssembly.Memory;
  alloc(byteLength: number): number;
  resetAllocator(byteOffset?: number): void;
  init(
    entityBasePtr: number,
    entityCapacity: number,
    entityStrideBytes: number,
    positionSizeOffset: number,
    renderOffset: number,
    destinationSizeOffset: number,
    motionOffset: number,
    renderStateOffset: number,
    activeIndexPtr: number,
    activeIndexCapacity: number,
    changedIndexPtr: number,
    changedIndexCapacity: number,
    expirationPtr: number,
    expirationCapacity: number,
    expirationStrideBytes: number
  ): void;
  applyDelta(deltaPtr: number, deltaByteLength: number): number;
  stepTransitions(nowMs: number, dtMs: number): number;
  sweepExpired(frameId: number, simulationTime: number): number;
  buildTimeline(recordPtr: number, recordByteLength: number): number;
  scrubTimeline(anchorOffset: number, nextOffset: number): number;
  getChangedIndexPtr(): number;
  getChangedIndexCount(): number;
  clearChanged(): void;
  getActiveIndexPtr(): number;
  getActiveIndexCount(): number;
  setActiveIndexCount(count: number): void;
  getExpirationPtr(): number;
  getExpirationCount(): number;
  setExpirationCount(count: number): void;
};

export type ShadoDynamicEntityReducer = {
  exports: ShadoDynamicEntityReducerExports;
  memory: WebAssembly.Memory;
  initArena(config: ShadoDynamicEntityReducerInit): ShadoDynamicEntityReducerResolvedInit;
  alloc(byteLength: number): number;
  writeDelta(
    records: readonly ShadoDynamicEntityReducerDeltaRecord[],
    ptr?: number
  ): {
    ptr: number;
    byteLength: number;
  };
  applyDelta(records: readonly ShadoDynamicEntityReducerDeltaRecord[]): number;
  changedIndices(): Int32Array;
  clearChanged(): void;
};

export type ShadoDynamicEntityReducerResolvedInit = Required<
  Pick<
    ShadoDynamicEntityReducerInit,
    | 'entityBasePtr'
    | 'entityCapacity'
    | 'entityStrideBytes'
    | 'positionSizeOffset'
    | 'renderOffset'
    | 'destinationSizeOffset'
    | 'motionOffset'
    | 'renderStateOffset'
    | 'activeIndexPtr'
    | 'activeIndexCapacity'
    | 'changedIndexPtr'
    | 'changedIndexCapacity'
    | 'expirationPtr'
    | 'expirationCapacity'
    | 'expirationStrideBytes'
  >
>;

let defaultWasmBytesPromise: Promise<ArrayBuffer> | undefined;
let debugWasmBytesPromise: Promise<ArrayBuffer> | undefined;

export async function createShadoDynamicEntityReducer(
  options: ShadoDynamicEntityReducerOptions = {}
): Promise<ShadoDynamicEntityReducer> {
  const imports = {
    env: {
      abort() {
        throw new Error('Shado dynamic entity reducer aborted');
      },
    },
    ...(options.imports ?? {}),
  };
  const instance = options.wasmModule
    ? await WebAssembly.instantiate(options.wasmModule, imports)
    : await WebAssembly.instantiate(
        options.wasmBytes ?? (await defaultShadoDynamicEntityReducerWasmBytes()),
        imports
      );
  const exports = assertReducerExports(
    (instance instanceof WebAssembly.Instance ? instance : instance.instance).exports
  );

  return wrapShadoDynamicEntityReducerExports(exports);
}

export function wrapShadoDynamicEntityReducerExports(
  reducerExports: WebAssembly.Exports | ShadoDynamicEntityReducerExports
): ShadoDynamicEntityReducer {
  const exports = assertReducerExports(reducerExports as WebAssembly.Exports);
  const reducer: ShadoDynamicEntityReducer = {
    exports,
    memory: exports.memory,
    initArena(config) {
      const resolved = resolveInitConfig(exports, config);
      exports.init(
        resolved.entityBasePtr,
        resolved.entityCapacity,
        resolved.entityStrideBytes,
        resolved.positionSizeOffset,
        resolved.renderOffset,
        resolved.destinationSizeOffset,
        resolved.motionOffset,
        resolved.renderStateOffset,
        resolved.activeIndexPtr,
        resolved.activeIndexCapacity,
        resolved.changedIndexPtr,
        resolved.changedIndexCapacity,
        resolved.expirationPtr,
        resolved.expirationCapacity,
        resolved.expirationStrideBytes
      );
      return resolved;
    },
    alloc(byteLength) {
      return exports.alloc(byteLength | 0);
    },
    writeDelta(records, ptr) {
      const bytes = encodeShadoDynamicEntityReducerDelta(records);
      const outPtr = ptr ?? exports.alloc(bytes.byteLength);
      new Uint8Array(exports.memory.buffer, outPtr, bytes.byteLength).set(bytes);
      return { ptr: outPtr, byteLength: bytes.byteLength };
    },
    applyDelta(records) {
      const delta = reducer.writeDelta(records);
      return exports.applyDelta(delta.ptr, delta.byteLength);
    },
    changedIndices() {
      const count = exports.getChangedIndexCount();
      if (count <= 0) return new Int32Array();
      const ptr = exports.getChangedIndexPtr();
      return new Int32Array(exports.memory.buffer, ptr, count).slice();
    },
    clearChanged() {
      exports.clearChanged();
    },
  };

  return reducer;
}

export async function defaultShadoDynamicEntityReducerWasmBytes(): Promise<ArrayBuffer> {
  defaultWasmBytesPromise ??= maybeGunzipReducerBytes(
    decodeBase64Bytes(SHADO_DYNAMIC_ENTITY_REDUCER_WASM_GZ_BASE64)
  );
  return defaultWasmBytesPromise;
}

export async function defaultShadoDynamicEntityReducerDebugWasmBytes(): Promise<ArrayBuffer> {
  debugWasmBytesPromise ??= import('./wasm/shado-dynamic-entity-reducer-debug-wasm-gz-b64').then(
    mod =>
      maybeGunzipReducerBytes(
        decodeBase64Bytes(mod.SHADO_DYNAMIC_ENTITY_REDUCER_DEBUG_WASM_GZ_BASE64)
      )
  );
  return debugWasmBytesPromise;
}

export function encodeShadoDynamicEntityReducerDelta(
  records: readonly ShadoDynamicEntityReducerDeltaRecord[]
): Uint8Array {
  const bytes = new Uint8Array(
    SHADO_DYNAMIC_ENTITY_DELTA_HEADER_BYTES +
      records.length * SHADO_DYNAMIC_ENTITY_DELTA_RECORD_BYTES
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, SHADO_DYNAMIC_ENTITY_REDUCER_MAGIC, true);
  view.setUint32(4, SHADO_DYNAMIC_ENTITY_REDUCER_VERSION, true);
  view.setInt32(8, records.length, true);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const offset =
      SHADO_DYNAMIC_ENTITY_DELTA_HEADER_BYTES + i * SHADO_DYNAMIC_ENTITY_DELTA_RECORD_BYTES;
    view.setUint32(offset, record.op, true);
    view.setInt32(offset + 4, record.index, true);
    view.setFloat32(offset + 8, record.x ?? 0, true);
    view.setFloat32(offset + 12, record.y ?? 0, true);
    view.setFloat32(offset + 16, record.width ?? 0.0001, true);
    view.setFloat32(offset + 20, record.depth ?? record.width ?? 0.0001, true);
    view.setFloat32(offset + 24, record.z ?? 0, true);
    view.setFloat32(offset + 28, record.speed ?? 10, true);
    view.setUint32(offset + 32, record.flags ?? SHADO_DYNAMIC_ENTITY_VISIBLE, true);
    view.setInt32(offset + 36, record.removeAfterFrame ?? 0, true);
    view.setFloat64(offset + 40, record.removeAfterSimulationTime ?? 0, true);
  }

  return bytes;
}

function resolveInitConfig(
  exports: ShadoDynamicEntityReducerExports,
  config: ShadoDynamicEntityReducerInit
): ShadoDynamicEntityReducerResolvedInit {
  const entityCapacity = Math.max(0, config.entityCapacity | 0);
  const activeIndexCapacity = Math.max(1, config.activeIndexCapacity ?? entityCapacity);
  const changedIndexCapacity = Math.max(1, config.changedIndexCapacity ?? entityCapacity * 2);
  const expirationCapacity = Math.max(1, config.expirationCapacity ?? entityCapacity);
  return {
    entityBasePtr: config.entityBasePtr,
    entityCapacity,
    entityStrideBytes: config.entityStrideBytes ?? SHADO_ENTITY2D_REDUCER_LAYOUT.strideBytes,
    positionSizeOffset:
      config.positionSizeOffset ?? SHADO_ENTITY2D_REDUCER_LAYOUT.positionSizeOffset,
    renderOffset: config.renderOffset ?? SHADO_ENTITY2D_REDUCER_LAYOUT.renderOffset,
    destinationSizeOffset:
      config.destinationSizeOffset ?? SHADO_ENTITY2D_REDUCER_LAYOUT.destinationSizeOffset,
    motionOffset: config.motionOffset ?? SHADO_ENTITY2D_REDUCER_LAYOUT.motionOffset,
    renderStateOffset: config.renderStateOffset ?? SHADO_ENTITY2D_REDUCER_LAYOUT.renderStateOffset,
    activeIndexPtr: config.activeIndexPtr ?? exports.alloc(activeIndexCapacity * 4),
    activeIndexCapacity,
    changedIndexPtr: config.changedIndexPtr ?? exports.alloc(changedIndexCapacity * 4),
    changedIndexCapacity,
    expirationPtr:
      config.expirationPtr ??
      exports.alloc(expirationCapacity * SHADO_DYNAMIC_ENTITY_EXPIRATION_RECORD_BYTES),
    expirationCapacity,
    expirationStrideBytes:
      config.expirationStrideBytes ?? SHADO_DYNAMIC_ENTITY_EXPIRATION_RECORD_BYTES,
  };
}

function assertReducerExports(exports: WebAssembly.Exports): ShadoDynamicEntityReducerExports {
  const candidate = exports as unknown as ShadoDynamicEntityReducerExports;
  const required: Array<keyof ShadoDynamicEntityReducerExports> = [
    'memory',
    'alloc',
    'init',
    'applyDelta',
    'stepTransitions',
    'sweepExpired',
    'buildTimeline',
    'scrubTimeline',
    'getChangedIndexPtr',
    'getChangedIndexCount',
    'clearChanged',
  ];
  for (const key of required) {
    if (candidate[key] == null) {
      throw new Error(`Shado dynamic entity reducer missing export '${key}'`);
    }
  }
  return candidate;
}

async function maybeGunzipReducerBytes(bytes: Uint8Array): Promise<ArrayBuffer> {
  if (bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) {
    return copyBytes(bytes);
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This runtime cannot decompress the embedded Shado reducer gzip payload');
  }
  const stream = new Blob([copyBytes(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeBase64Bytes(value: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const bufferCtor = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (bufferCtor) {
    return new Uint8Array(bufferCtor.from(value, 'base64'));
  }
  throw new Error('No base64 decoder is available for the Shado dynamic entity reducer');
}
