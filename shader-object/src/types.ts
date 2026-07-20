import type { ASCExtension } from './core/Shado';
import { PendingField } from './decorators';
import type { ShadoStructSchema } from './schema/ShadoStructSchema';

export type ScalarType = 'f32' | 'i32' | 'u32';
export type VectorType = 'vec2' | 'vec3' | 'vec4';
export type MatrixType = 'mat2' | 'mat3' | 'mat4';

export interface VarArrayType {
  arrayOf: FieldType;
}
export type FieldType = ScalarType | VectorType | MatrixType | VarArrayType | StructRef;

export type BackendKind = 'storage' | 'datatex';

export type WasmInitializeMode =
  | false
  | 'off'
  | 'runtime'
  | {
      mode: 'off' | 'runtime' | 'precompiled';
      module?: WebAssembly.Module | ArrayBuffer | Uint8Array;
    };

export type InitializeConfig = {
  logShaderCode?: boolean;
  logAscCode?: boolean;
  backend?: BackendKind;
  debugWasm?: boolean;
  wasm?: WasmInitializeMode;
  additionalFields?: PendingField[];
  extra?: any;
};

export interface GPUUploadStats {
  /** Discrete GPU upload calls issued by the last commit. */
  uploadCalls: number;
  /** Bytes handed to the GPU by the last commit. */
  uploadedBytes: number;
  /** Bytes re-encoded (integer conversion) by the last commit. */
  encodedBytes: number;
}

export const EMPTY_UPLOAD_STATS: GPUUploadStats = Object.freeze({
  uploadCalls: 0,
  uploadedBytes: 0,
  encodedBytes: 0,
});

export interface GPUBacking {
  kind: BackendKind;
  commit(): GPUUploadStats;
  bind(effect: any, includeName: string): void;
  bindMaterial?(material: any, includeName: string): void;
  dispose(): void;
}

export interface FieldDef {
  name: string;
  type: FieldType;
  headerFloatOffset?: number;
  headerFloatSize?: number;
}

export type Segment = { offF: number; lenF: number; capF: number };

export type ScalarTy = 'i32' | 'u32' | 'f32';
export type UboField = { name: string; ty: ScalarTy; comment?: string };

export type SchemaSpec = {
  name: string;
  storageName: string;
  uboFields: UboField[];
};

export type DynamicMeta = {
  storageName: string;
  bases?: Record<string, number>;
  strides?: Record<string, number>;
  counts?: Record<string, number>;
  extraI32?: string[];
};

export type StorageSpec = {
  storageName: string;
  access?: 'read' | 'read_write';
};

export type ShadoStatics = {
  schema?: ShadoStructSchema;
  backingPreference?: BackendKind;
  getSchema(additionalFields: PendingField[]): ShadoStructSchema;
  registerIncludes(): void;
  buildSchema(): ShadoStructSchema;
  debugShaderCode(engine: any): void;
  debugAscCode(): void;
  shaderIO(engine: any): { uniforms: string[]; samplers: string[] };
  wasmCompiled?: boolean;
  compiledWasmModule?: WebAssembly.Module;
  compiledWasmBytes?: Uint8Array;
  ascExtension?: ASCExtension;
};

export type ShadoBaseCtor = ShadoStatics & { new?: any };

// add at top-level exports
export const LAZY_CTOR: unique symbol = Symbol('shado.lazyCtor');

export type LazyCtor<T = any> = (() => T) & { [LAZY_CTOR]: true };

export type StructRef = { structOf: any } | { structOf: LazyCtor<any> };

export type ShadoConcreteCtor<T = any> = (new (engine: any, ...args: any[]) => T) & ShadoStatics;

export interface StructArrayType<T = any> {
  arrayOf: { structOf: ShadoConcreteCtor<T> };
}

export type ShadoAbstractCtor<T = any> = ShadoBaseCtor & (abstract new (engine: any) => T);

export type DirtyEvent =
  | { kind: 'header'; byteOffset?: number; byteLength?: number }
  | { kind: 'var'; field: string; byteOffset?: number; byteLength?: number }
  | {
      kind: 'struct-array';
      field: string;
      index?: number;
      byteOffset?: number;
      byteLength?: number;
    };

export type DirtyHandler = (ev: DirtyEvent) => void;
