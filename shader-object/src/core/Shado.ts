import { FloatArena } from '../arena/FloatArena';
import type {
  DynamicMeta,
  SchemaSpec,
  ShadoBaseCtor,
  ShadoConcreteCtor,
  StorageSpec,
  Segment,
  DirtyHandler,
  DirtyEvent,
  InitializeConfig,
  BackendKind,
  WasmInitializeMode,
} from '../types';
import { BindingAlloc } from '../utils/binding-alloc';
import { registerIncludesOnEngine } from '../includes/register';
import { ShadoSchemaBuilder } from '../schema/ShadoSchemaBuilder';
import { genericASModuleSource } from '../asc/generic';
import { buildOpsForParent } from '../asc/ops';
import {
  isVarArray,
  isStructRef,
  isScalar,
  floatStrideOf,
  resolveCtor,
} from '../utils/type-helpers';
import { createEmbeddedProxyFromArena } from '../utils/embedded-proxy';
import { emitASUnmanagedFromSchema } from '../asc/schema';
import { installThinAccessors } from '../utils/thin-accessors';
import { StorageBacking } from '../backings/StorageBacking';
import { DataTexBacking } from '../backings/DataTexBacking';
import { PendingField, readClassMeta, readFields } from '../decorators';
import type { AbstractEngine } from '@babylonjs/core';
import { BABYLON } from '../babylon';
import type { ShadoStructSchema } from '../schema/ShadoStructSchema';

export type ASCExtension = {
  /** Extra AssemblyScript source to concat into the module (strings, not files). */
  source?: (schema: ShadoStructSchema) => string | string[];
  /** After instantiate: add custom ops under this class' ops tree. */
  bind?: (schema: any, exports: any, ops: any) => void;
};

function normalizeWasmMode(
  wasm: WasmInitializeMode | undefined
):
  | { mode: 'off' }
  | { mode: 'runtime' }
  | { mode: 'precompiled'; module: WebAssembly.Module | ArrayBuffer | Uint8Array } {
  if (wasm === false || wasm === 'off') return { mode: 'off' };
  if (!wasm || wasm === 'runtime') return { mode: 'runtime' };
  if (typeof wasm === 'object') {
    if (wasm.mode === 'off') return { mode: 'off' };
    if (wasm.mode === 'precompiled') {
      if (!wasm.module) {
        throw new Error('WASM precompiled mode requires a module');
      }
      return { mode: 'precompiled', module: wasm.module };
    }
    return { mode: 'runtime' };
  }
  return { mode: 'runtime' };
}

function schemaUsesWasm(schema: ShadoStructSchema, meta: { useWasm?: boolean }): boolean {
  return ((schema as any).config?.useWasm ?? meta.useWasm ?? true) !== false;
}

async function loadRuntimeASC(): Promise<any> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<any>;
  try {
    await dynamicImport('binaryen');
    const mod = await dynamicImport('assemblyscript/asc');
    return mod?.default ?? mod;
  } catch (e) {
    throw new Error(
      [
        'AssemblyScript runtime compilation requires optional peer dependencies.',
        'Install them with `npm i -D assemblyscript binaryen`, use `wasm: false`,',
        'or pass `wasm: { mode: "precompiled", module }`.',
        e instanceof Error ? e.message : String(e),
      ].join('\n')
    );
  }
}

export abstract class Shado {
  // Static counter for unique instance naming
  private static _instanceCounter = 0;

  // Per-instance binding allocator
  private _bindingAlloc = new BindingAlloc(10);

  private _dynamicMeta?: DynamicMeta;
  private _manualSchemas: SchemaSpec[] = [];
  private _extraStorages: StorageSpec[] = [];
  private _samplers: string[] = [];
  private _vsBody = '';
  private _fsBody = '';

  private _built = false;
  private _schemas: SchemaSpec[] = [];

  private _isDisposed = false;
  private _engineObs?: any; // engine.onDispose
  private _engineNewSceneObs?: any; // engine.onNewSceneAdded
  private _sceneObs: Array<{ scene: any; obs: any }> = [];

  _dirty(): this {
    this._built = false;
    return this;
  }

  setDynamicMeta(meta: DynamicMeta): this {
    this._dynamicMeta = meta;
    return this._dirty();
  }
  setSchemas(schemas: SchemaSpec[]): this {
    this._manualSchemas = schemas;
    return this._dirty();
  }
  addExtraStorage(s: StorageSpec): this {
    this._extraStorages.push(s);
    return this;
  }
  setSamplers(symbols: string[]): this {
    this._samplers = symbols;
    return this;
  }
  setBodies(vsBody: string, fsBody: string): this {
    this._vsBody = vsBody;
    this._fsBody = fsBody;
    return this;
  }

  public readonly headerRaw: ArrayBuffer;
  // Instance-level schema instead of static
  private static _schema: ShadoStructSchema;
  public static backingPreference?: BackendKind;
  protected readonly _view: DataView;
  private _visibleCount = 1;
  public getVisibleCount(): number {
    return this._visibleCount;
  }

  private _backing: DataTexBacking | StorageBacking;
  private _includeName: string;
  private _instanceId: number;

  protected _arena = new FloatArena();
  protected _headerSeg: Segment = { offF: 0, lenF: 0, capF: 0 };
  private _liveVecs: Record<string, Float32Array> = {};

  protected _varSeg: Record<string, Segment> = {};
  protected _structSeg: Record<string, Segment> = {};
  protected _engine!: any;
  protected _structArrayCount: Record<string, number> = {};
  protected _structArraySlots: Record<string, Shado[]> = {};
  protected _structArrayUnsubs: Record<string, Array<() => void>> = {};
  protected _structArrayIndex: Record<string, Map<Shado, number>> = {};

  private _dirtyHandlers?: DirtyHandler[];

  private _structVersion = 0;
  private _lastSyncedStructVersion = -1;
  private _lastSyncedBuffer: ArrayBuffer | null = null;

  public wasmModule?: {
    instance: WebAssembly.Instance;
    memory: WebAssembly.Memory;
    alloc: (n: number) => number;
    exports: Record<string, any>;
    ops: any;
    ready?: boolean;
  };

  public static wasmCompiled?: boolean;
  public static compiledWasmModule?: WebAssembly.Module;

  private __wasmBasePtr = 0;
  private __wasmArenaFloats = 0;
  private _useWasm: boolean;

  protected static get shadoBase() {
    const ctor = this as any as ShadoBaseCtor;
    return ctor;
  }

  protected constructor(engine: AbstractEngine, childInstance: boolean = false) {
    // Build instance-level schema
    const ctor = this as any as ShadoBaseCtor;
    const schema = ctor.getSchema([]);

    // Generate unique instance ID and include name
    this._instanceId = Shado._instanceCounter++;
    this._includeName = schema.name; //`${schema.name}_${this._instanceId}`;

    const meta = readClassMeta(this.constructor);
    const wasmMode = (this.constructor as any).__shadoWasmMode;
    this._useWasm = schemaUsesWasm(schema, meta) && wasmMode !== 'off';

    this._engine = engine;
    for (const scene of engine.scenes) {
      const obs = scene.onDisposeObservable.addOnce(() => this.dispose());
      this._sceneObs.push({ scene, obs });
    }
    this._engineNewSceneObs = engine.onNewSceneAddedObservable.add(scene => {
      const obs = scene.onDisposeObservable.addOnce(() => this.dispose());
      this._sceneObs.push({ scene, obs });
    });
    this._engineObs = engine.onDisposeObservable.addOnce(() => this.dispose());

    // Initialize headerRaw and _view
    this.headerRaw = new ArrayBuffer(schema.headerFloatCount * 4);
    this._view = new DataView(this.headerRaw);

    // CPU header buffer for live properties
    this._headerSeg = {
      offF: 0,
      lenF: schema.headerFloatCount,
      capF: schema.headerFloatCount,
    };
    this._ensureArenaLayout();
    (this as any)._headerDV = this._arena.dataView();

    this._arena.onRealloc(() => {
      // Re-create vec/mat live arrays
      for (const f of schema.fields) {
        if (isVarArray(f.type) || isStructRef(f.type) || isScalar(f.type)) continue;
        const offF = (f.headerFloatOffset ?? 0) + this._headerSeg.offF;
        const lenF = f.headerFloatSize ?? floatStrideOf(f.type);
        this._liveVecs[f.name] = this._arena.view(offF, lenF);
      }
    });

    // Set up property definitions
    for (const f of schema.fields) {
      if (isVarArray(f.type)) continue;

      // Offset within the arena (for arena.write and arena.view)
      const offFloatsArena = (f.headerFloatOffset ?? 0) + this._headerSeg.offF;
      // Offset relative to header start (for DataView, which already has header offset built in)
      const offFloatsHeader = f.headerFloatOffset ?? 0;
      const offBytesHeader = offFloatsHeader * 4;
      const sizeFloats = f.headerFloatSize ?? floatStrideOf(f.type as any);

      if (isStructRef(f.type)) {
        const childCtor = resolveCtor(f.type.structOf);
        const childProxy = createEmbeddedProxyFromArena(this, childCtor, offFloatsArena);
        Object.defineProperty(this, f.name, {
          get: () => childProxy,
          set: v => {
            if (v === null) return;
            if (v?.headerRaw) {
              const src = new Float32Array(v.headerRaw);
              this._arena.write(offFloatsArena, src, src.length);
            }
          },
          enumerable: true,
          configurable: true,
        });
        continue;
      }

      if (isScalar(f.type)) {
        Object.defineProperty(this, f.name, {
          get() {
            //this._refreshViewsIfGrown();
            switch (f.type) {
              case 'f32':
                return this._arena.dataView().getFloat32(offBytesHeader, true);
              case 'i32':
                return this._arena.dataView().getInt32(offBytesHeader, true);
              case 'u32':
                return this._arena.dataView().getUint32(offBytesHeader, true);
            }
          },
          set(v: number) {
            if (v === null) return;
            // this._refreshViewsIfGrown();
            switch (f.type) {
              case 'f32':
                this._arena.dataView().setFloat32(offBytesHeader, v, true);
                break;
              case 'i32':
                this._arena.dataView().setInt32(offBytesHeader, v | 0, true);
                break;
              case 'u32':
                this._arena.dataView().setUint32(offBytesHeader, v >>> 0, true);
                break;
            }
            this.emitHeaderDirty(offBytesHeader, 4);
          },
          enumerable: true,
          configurable: true,
        });
      } else {
        // vec/mat: live view
        this._liveVecs[f.name] = this._arena.view(offFloatsArena, sizeFloats);
        Object.defineProperty(this, f.name, {
          get() {
            return this._liveVecs[f.name];
          },
          set(arr: ArrayLike<number>) {
            if (arr === null) return;
            const live = this._liveVecs[f.name];
            const L = Math.min(live.length, (arr as any).length ?? 0);
            for (let i = 0; i < L; i++) live[i] = (arr as any)[i];
            this.emitHeaderDirty(offBytesHeader, L * 4);
          },
          enumerable: true,
          configurable: true,
        });
      }
    }

    // Register shader includes for this instance with unique name
    if (!childInstance) {
      //  this.registerIncludes();
    }

    // WASM init if not child instance, otherwise Parent has taken care of this
    if (!childInstance && this._useWasm) {
      this.initWasmArena();
    }

    const isWebGPU = (engine as any)?._isWebGPU ?? engine?.getClassName?.() === 'WebGPUEngine';
    const wantsStorageBacking = (this.constructor as any).backingPreference === 'storage';
    if (wantsStorageBacking && !isWebGPU) {
      throw new Error(
        `Shado ${schema.name} requires storage buffer backend, but engine is not WebGPU.`
      );
    }
    this._backing =
      isWebGPU && wantsStorageBacking
        ? new StorageBacking(engine, schema, this)
        : new DataTexBacking(engine, schema, this);
  }

  protected getBaseOffset(): number {
    return this.__wasmBasePtr;
  }

  public getWasmMemory(): WebAssembly.Memory | undefined {
    return this.wasmModule?.memory;
  }

  public getWasmArenaBasePtr(): number {
    this._prepareForWasm();
    return this.__wasmBasePtr >>> 0;
  }

  public getStructArrayPtr(field: string): number {
    this._prepareForWasm();
    const seg = this._structSeg[field];
    if (!this.wasmModule || !seg) return 0;
    return (this.__wasmBasePtr + (seg.offF | 0) * 4) >>> 0;
  }

  public getStructArrayCapacity(field: string): number {
    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }
    const strideF = meta.schema.headerFloatCount | 0;
    const seg = this._structSeg[field];
    return strideF > 0 && seg ? Math.floor((seg.capF | 0) / strideF) : 0;
  }

  public getStructArrayStrideBytes(field: string): number {
    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }
    return (meta.schema.headerFloatCount | 0) * 4;
  }

  public markArenaDirty(): void {
    this._arena.markDirty?.();
  }

  protected getFieldOffset(field: string): number {
    const seg = this._structSeg[field];
    if (!seg) return -1;
    return this.__wasmBasePtr + (seg.offF | 0) * 4;
  }

  public prepareUnifiedForUpload(): Float32Array {
    return this._arena.take();
  }

  static async initialize(
    this: ShadoConcreteCtor,
    engine: any,
    { logShaderCode, logAscCode, backend, debugWasm, additionalFields, wasm }: InitializeConfig = {
      logShaderCode: false,
      logAscCode: false,
      backend: 'datatex',
      debugWasm: false,
      wasm: 'runtime',
      additionalFields: [],
    }
  ): Promise<boolean> {
    try {
      this.schema = this.getSchema(additionalFields ?? []);
      const meta = readClassMeta(this);
      const wantsWasm = schemaUsesWasm(this.schema, meta);
      const wasmMode = normalizeWasmMode(wasm);
      (this as any).__shadoWasmMode = wantsWasm ? wasmMode.mode : 'off';
      if (wantsWasm && wasmMode.mode !== 'off') {
        await (this as any).initWasm(debugWasm, wasmMode);
      }
      this.registerIncludes();
      if (logShaderCode) {
        this.debugShaderCode(engine);
      }
      if (logAscCode) {
        this.debugAscCode();
      }
      this.backingPreference = backend ?? 'datatex';
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[${this.name}.initialize] Error:`, e);
      BABYLON.Logger?.Warn?.(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /**
   * Build schema for this instance (called once per instance).
   * This replaces the static getSchema() pattern.
   */
  public static buildSchema(): ShadoStructSchema {
    // Check if the class has a manually-defined static schema (legacy pattern)
    const ctor = this.constructor as any;
    if (ctor.schema) {
      return ctor.schema;
    }

    // Otherwise, build from decorators
    const meta = readClassMeta(this.constructor);
    const name = meta.name ?? (this.constructor as any).name ?? 'AnonymousStruct';
    const dec = readFields(this.constructor);
    if (!dec.length) {
      throw new Error(
        `No schema for ${name} (constructor: ${this.constructor.name}). ` +
          `Decorate with @field(). Fields found: ${dec.length}. ` +
          `Meta: ${JSON.stringify(meta)}`
      );
    }
    const b = new ShadoSchemaBuilder(name, meta);
    for (const f of dec) b.registerField(f.name, f.type);
    return b.build();
  }

  static async initWasm(
    this: ShadoConcreteCtor,
    debugWasm: boolean = false,
    wasmConfig:
      | { mode: 'runtime' }
      | { mode: 'precompiled'; module: WebAssembly.Module | ArrayBuffer | Uint8Array } = {
      mode: 'runtime',
    }
  ) {
    const ctor = this as ShadoBaseCtor;
    if (ctor.wasmCompiled) return;

    if (wasmConfig.mode === 'precompiled') {
      if (!wasmConfig.module) {
        throw new Error(
          `${(ctor as any).name}.initWasm({ mode: 'precompiled' }) requires a module`
        );
      }
      ctor.compiledWasmModule =
        wasmConfig.module instanceof WebAssembly.Module
          ? wasmConfig.module
          : await WebAssembly.compile(wasmConfig.module as BufferSource);
      ctor.wasmCompiled = true;
      return;
    }

    const asc = await loadRuntimeASC();
    if (asc.ready) {
      try {
        await asc.ready;
      } catch (e) {
        console.warn(e);
      }
    }
    const schema = ctor.getSchema([]);

    const entry = 'input.ts',
      out = 'out.wasm';
    let wasmBytes: ArrayBuffer | null = null;
    const parts: string[] = [];
    parts.push(genericASModuleSource());
    parts.push(emitASUnmanagedFromSchema(schema));
    const ext: ASCExtension | undefined = (this as any).ascExtension;
    if (ext?.source) {
      const s = ext.source(schema);
      if (Array.isArray(s)) parts.push(...s);
      else parts.push(s);
    }
    const source = parts.join('\n\n');

    const td = new TextDecoder();
    let stdoutStr = '';
    let stderrStr = '';
    const io = {
      readFile: (n: string) => (n.endsWith(entry) ? source : null),
      writeFile: (n: string, data: ArrayBuffer) => {
        if (n.endsWith(out)) wasmBytes = data;
        return true;
      },
      listFiles: () => [],
      stdout: {
        write: (chunk: string | Uint8Array) => {
          stdoutStr += typeof chunk === 'string' ? chunk : td.decode(chunk);
        },
      },
      stderr: {
        write: (chunk: string | Uint8Array) => {
          stderrStr += typeof chunk === 'string' ? chunk : td.decode(chunk);
        },
      },
    };
    const args = [
      entry,
      '--outFile',
      out,
      // Enable debug options when requested:
      ...(debugWasm ? ['--debug'] : ['--optimizeLevel', '4']),
      '--noAssert',
      '--enable',
      'simd', // Enable SIMD
      '--runtime',
      'stub',
      '--noColors',
    ];
    const exitCode = await asc.main(args, io as any).catch((err: unknown) => {
      // asc crashed before producing diagnostics
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      throw new Error(`AssemblyScript invocation failed:\n${msg}`);
    });
    const stripAnsi = (s: string) => s.replace(/\\x1B\[[0-9;]*m/g, '');

    if (exitCode?.error !== null || !wasmBytes) {
      const errText = stripAnsi((stderrStr || stdoutStr || '').trim());
      // Optional: parse a structured diagnostic list you can surface in UI
      const diags = [];
      const re = /(ERROR|WARNING)\s+TS\d+:\s+([^\n]+)\n\s+at\s+([^\s:]+):(\d+):(\d+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(errText))) {
        diags.push({
          severity: m[1],
          message: m[2],
          file: m[3],
          line: +m[4],
          column: +m[5],
        });
      }
      const details = diags.length
        ? `\n\nDiagnostics:\n${diags
            .map(d => `- ${d.severity} ${d.file}:${d.line}:${d.column} – ${d.message}`)
            .join('\n')}`
        : '';
      throw new Error(
        `AssemblyScript compilation failed (exit ${JSON.stringify(exitCode) ?? '?'}).\n\n` +
          `${errText || '(no compiler output)'}${details}`
      );
    }

    ctor.compiledWasmModule = await WebAssembly.compile(wasmBytes as ArrayBuffer).catch(e => {
      const errText = (stderrStr || stdoutStr || '').trim();
      throw new Error(
        `Error compiling ASC module: ${e?.message ?? e}\n\n${
          errText ? `Compiler output:\n${errText}` : ''
        }`
      );
    });

    ctor.wasmCompiled = true;
  }

  public initWasmArena(bytesHint?: number) {
    if (!this._useWasm) return;
    const Ctor = this.constructor as ShadoConcreteCtor;
    if (!Ctor.wasmCompiled || !Ctor.compiledWasmModule) {
      throw new Error(`${Ctor.name}.initWasm() was not awaited`);
    }

    const instance = new WebAssembly.Instance(Ctor.compiledWasmModule, {
      env: {
        abort(e: any) {
          console.log('Called abort', e);
        },
      },
    });

    const memory = instance.exports.memory as WebAssembly.Memory;
    const alloc = instance.exports.alloc as (n: number) => number;
    const exports = instance.exports as any;

    // Utilities to tag base-requirement on leaf wasm functions:
    const needsBase = (fn: Function) => (
      Object.defineProperty(fn, '__needsBase', { value: true }),
      fn
    );
    const noBase = (fn: Function) => (
      Object.defineProperty(fn, '__needsBase', { value: false }),
      fn
    );

    // Which export names obviously do NOT need base:
    const NO_BASE_NAMES = new Set(['alloc', 'free', 'memory', '__indirect_function_table']);

    // Deep map + tag: all functions default to needsBase except those listed
    function decorateOpsTree<T extends object>(root: T): T {
      const seen = new WeakMap<object, any>();
      const walk = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) return obj;
        const hit = seen.get(obj);
        if (hit) return hit;
        const out: any = Array.isArray(obj) ? [] : Object.create(null);
        seen.set(obj, out);
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === 'function') {
            out[k] = NO_BASE_NAMES.has(k) ? noBase(v) : needsBase(v);
          } else if (v && typeof v === 'object') {
            out[k] = walk(v);
          } else {
            out[k] = v;
          }
        }
        return out;
      };
      return walk(root);
    }

    // Build default ops
    const ops = buildOpsForParent(this.getSchema(), exports);
    Object.assign(ops, exports);
    const ext: ASCExtension | undefined = Ctor.ascExtension;

    if (ext?.bind) ext.bind(this.getSchema(), exports, ops);

    // Tag everything once; store alongside asc bundle
    const opsBound = decorateOpsTree(ops);
    this.wasmModule = {
      instance,
      memory,
      alloc,
      exports,
      ops: opsBound,
    };
    (Ctor as any).wasmModule = this.wasmModule;

    // Save current arena data before adopting WASM memory
    const currentData = this._arena.take().slice();

    // Allocate enough space for the entire arena in WASM memory
    const floats = Math.max(currentData.length, bytesHint ? bytesHint >> 2 : 0);
    const bytes = floats * 4;

    const ptr = this.wasmModule.alloc(bytes | 0);
    const view = new Float32Array(this.wasmModule.memory.buffer, ptr, floats);
    this.__wasmArenaFloats = floats;

    // Copy existing data to WASM memory
    view.set(currentData);

    // Adopt WASM memory and update references
    this._arena.adopt(view);
    (this as any)._headerDV = this._arena.dataView();
    this.__wasmBasePtr = ptr;
    this._lastMemBuf = this.wasmModule.memory.buffer;

    this.syncStructArrayHeaderFields?.();
  }

  public onDirty(cb: DirtyHandler): () => void {
    (this._dirtyHandlers ??= []).push(cb);
    let alive = true;
    return () => {
      if (!alive) return;
      alive = false;
      const a = this._dirtyHandlers;
      if (!a) return;
      const i = a.indexOf(cb);
      if (i >= 0) a.splice(i, 1);
    };
  }
  public emitHeaderDirty(byteOffset?: number, byteLength?: number) {
    this._arena.markDirty?.();
    const a = this._dirtyHandlers;
    if (!a) return;
    const ev: DirtyEvent = { kind: 'header', byteOffset, byteLength };
    for (let i = 0; i < a.length; i++) a[i](ev);
  }

  generateWGSL(): string {
    this.#ensureBuiltSchemas();
    const alloc = this._bindingAlloc;
    const preamble: string[] = [];
    for (const sch of this._schemas) {
      preamble.push(this.#emitSchemaWGSL(sch));
    }
    for (const s of this._extraStorages) {
      // const bind = alloc.takeFor(`ssbo:${s.storageName}`);
      preamble.push(`var<storage, ${s.access ?? 'read'}> ${s.storageName} : array<f32>;`);
      preamble.push('');
    }
    for (const sym of this._samplers) {
      preamble.push(this.#emitSamplerPair(sym, alloc));
    }
    preamble.push(this.#emitFSIn());
    const rewritten = this.#rewriteScalarUniformRefs(
      [this._vsBody, this._fsBody].join('\n\n'),
      this._schemas
    );
    const out = [preamble.join('\n'), rewritten].join('\n');
    this.#mustBalanceBraces(out);
    return out;
  }

  #ensureBuiltSchemas() {
    if (this._built) return;
    if (this._manualSchemas.length > 0) {
      this._schemas = this._manualSchemas;
    } else if (this._dynamicMeta) {
      const fields: any[] = [];
      const pushI32 = (k: string) => fields.push({ name: k, ty: 'i32' });
      for (const k of Object.keys(this._dynamicMeta.bases ?? {})) pushI32(k);
      for (const k of Object.keys(this._dynamicMeta.strides ?? {})) pushI32(k);
      for (const k of Object.keys(this._dynamicMeta.counts ?? {})) pushI32(k);
      for (const k of this._dynamicMeta.extraI32 ?? []) pushI32(k);
      this._schemas = [
        {
          name: 'AutoSchema',
          storageName: this._dynamicMeta.storageName,
          uboFields: fields,
        },
      ];
    } else {
      this._schemas = [];
    }
    this._built = true;
  }

  #emitSchemaWGSL(s: any): string {
    const uboType = `${s.name}UBO`;
    const uboStruct = [
      `// === ${s.name} bindings ===`,
      `struct ${uboType} {`,
      ...s.uboFields.map(
        (f: any) => `  ${f.name} : ${f.ty},${f.comment ? ` // ${f.comment}` : ''}`
      ),
      `};`,
    ].join('\n');
    const uboBinding = this._bindingAlloc.takeFor(`ubo:${s.name}`);
    const ssboBinding = this._bindingAlloc.takeFor(`ssbo:${s.storageName}`);
    return [
      uboStruct,
      `@group(0) @binding(${uboBinding}) var<uniform> u${s.name} : ${uboType};`,
      `@group(0) @binding(${ssboBinding}) var<storage, read> ${s.storageName} : array<f32>;`,
      ``,
      `fn ${s.name}_fetch(i: i32) -> f32 { return ${s.storageName}[i]; }`,
      `fn ${s.name}_fetch4(i: i32) -> vec4f {`,
      `  return vec4f(${s.storageName}[i+0], ${s.storageName}[i+1], ${s.storageName}[i+2], ${s.storageName}[i+3]);`,
      `}`,
      ``,
    ].join('\n');
  }

  #emitSamplerPair(symbol: string, alloc: any): string {
    const sampB = alloc.takeFor(`sampler:${symbol}`);
    const texB = alloc.takeFor(`texture:${symbol}`);
    return [
      `@group(0) @binding(${sampB}) var ${symbol}Sampler : sampler;`,
      `@group(0) @binding(${texB})  var ${symbol}        : texture_2d<f32>;`,
      ``,
    ].join('\n');
  }

  #emitFSIn(): string {
    return [
      `struct FSIn {`,
      `  @builtin(position) pos : vec4f,`,
      `  @location(0) vUV : vec2f,`,
      `  @location(1) vColor : vec4f,`,
      `};`,
      ``,
    ].join('\n');
  }

  #rewriteScalarUniformRefs(wgsl: string, schemas: any[]): string {
    for (const s of schemas) {
      for (const f of s.uboFields) {
        const re = new RegExp(`\\bu${s.name}_${f.name}\\b`, 'g');
        wgsl = wgsl.replace(re, `u${s.name}.${f.name}`);
      }
    }
    return wgsl;
  }

  #mustBalanceBraces(text: string) {
    let n = 0;
    for (const ch of text) {
      if (ch === '{') n++;
      else if (ch === '}') n--;
    }
    if (n !== 0) throw new Error(`WGSL emit error: unbalanced braces (${n}).`);
  }

  protected pickPrimaryChild() {
    const schema = this.getSchema();
    const entries = Object.entries(schema.structArrays ?? {});
    if (!entries.length) throw new Error(`Shado '${schema.name}' has no struct-array fields (AoS)`);
    // convention: take the first struct-array as the “instances” list
    const [childField, meta] = entries[0] as [string, any];
    const parent = schema; // ShadoStructSchema
    const child = meta.schema; // ShadoStructSchema (AoS header)
    return { parent, child, childField };
  }

  protected instanceHeaderNames() {
    return {
      visibleIndex: 'visibleIndex',
      instances: 'instances',
    };
  }

  protected instanceFieldNames() {
    return {
      visibleIndex: 'visibleIndex',
      translation: 'translation',
      color: 'color',
      animation: 'animationBuffer',
    };
  }

  public static shaderIO(engine: any): {
    uniforms: string[];
    samplers: string[];
  } {
    const isWebGPU = engine?._isWebGPU ?? engine?.getClassName?.() === 'WebGPUEngine';
    const wantsStorageBacking = (this as any).backingPreference === 'storage';
    return (this as any).getSchema().materialIOFor(isWebGPU && wantsStorageBacking ? engine : null);
  }

  public get arena(): FloatArena {
    return this._arena;
  }

  public getSchema(): ShadoStructSchema {
    const ctor = this.constructor as any as ShadoBaseCtor;

    return ctor.getSchema([]);
  }

  /**
   * Static method to build a schema for a class (used for static utilities).
   */
  public static getSchema(
    this: ShadoBaseCtor,
    extraFields: PendingField[] = []
  ): ShadoStructSchema {
    // Check if the class has a manually-defined static schema (legacy pattern)
    if (Object.prototype.hasOwnProperty.call(this, 'schema') && (this as any).schema) {
      return (this as any).schema;
    }

    // Check if we already built and cached the schema
    if (
      Object.prototype.hasOwnProperty.call(this, '__cachedSchema') &&
      (this as any).__cachedSchema
    ) {
      return (this as any).__cachedSchema;
    }

    const meta = readClassMeta(this);
    const name = meta.name ?? (this as any).name ?? 'AnonymousStruct';
    const dec = readFields(this);
    for (const f of extraFields) dec.push(f);
    if (!dec.length) throw new Error(`No schema for ${name}. Decorate with @field().`);
    const b = new ShadoSchemaBuilder(name, meta);
    for (const f of dec) b.registerField(f.name, f.type);
    const schema = b.build();

    // Cache it on the class
    (this as any).__cachedSchema = schema;
    return schema;
  }

  public static debugShaderCode(this: ShadoBaseCtor, engine: any): void {
    const schema = (this as any).getSchema();
    if (schema) schema.debugShaderCode(engine);
  }

  public static debugAscCode(this: ShadoBaseCtor): void {
    // eslint-disable-next-line no-console
    console.log('--- AssemblyScript code ---');
    // eslint-disable-next-line no-console
    console.debug(emitASUnmanagedFromSchema((this as any).getSchema()));
  }

  /**
   * Static method kept for backward compatibility.
   * New code should use instance.registerIncludes() instead.
   */
  public static registerIncludes(this: ShadoBaseCtor) {
    registerIncludesOnEngine((this as any).getSchema());
  }

  /**
   * Register shader includes for this specific instance.
   * This uses the unique instance include name.
   */
  // public registerIncludes() {
  //   registerIncludesOnEngine(this._schema, this._includeName);
  // }

  public generateWGSLPair(): { vs: string; fs: string } {
    throw new Error('WGSL generation must be implemented in subclass');
  }

  public generateGLSLPair(): { vs: string; fs: string } {
    throw new Error('GLSL generation must be implemented in subclass');
  }

  public getShaderNames(rewrite: boolean = true): { vertex: string; fragment: string } {
    const effect = BABYLON.Effect as any;
    const shaderStore = BABYLON.ShaderStore as any;
    const isWebGPU = this._engine._isWebGPU ?? this._engine.getClassName?.() === 'WebGPUEngine';
    const preferWGSL = isWebGPU && (this.constructor as any).backingPreference === 'storage';
    // Use instance-specific include name instead of schema name
    const idBase = this._includeName + this._instanceId;

    if (preferWGSL) {
      const vKey = `${idBase}VertexShader`;
      const fKey = `${idBase}FragmentShader`;
      if (rewrite || !shaderStore.ShadersStoreWGSL[vKey] || !shaderStore.ShadersStoreWGSL[fKey]) {
        const { vs, fs } = this.generateWGSLPair();
        shaderStore.ShadersStoreWGSL[vKey] = vs;
        shaderStore.ShadersStoreWGSL[fKey] = fs;
      }
      return { vertex: idBase, fragment: idBase };
    } else {
      const vKey = `${idBase}VertexShader`;
      const fKey = `${idBase}FragmentShader`;
      if (rewrite || !effect.ShadersStore[vKey] || !effect.ShadersStore[fKey]) {
        const { vs, fs } = this.generateGLSLPair();
        effect.ShadersStore[vKey] = vs;
        effect.ShadersStore[fKey] = fs;
      }
      return { vertex: idBase, fragment: idBase };
    }
  }

  public setVarArray(field: string, data: Float32Array | number[]) {
    if (this._isDisposed) return;
    const schema = this.getSchema();
    const meta = schema.varArrays[field];
    if (!meta) throw new Error(`'${field}' is not a variable array field on ${schema?.name}`);
    const src = data instanceof Float32Array ? data : new Float32Array(data);
    const seg = this._varSeg[field] || (this._varSeg[field] = { offF: 0, lenF: 0, capF: 0 });
    if (src.length > seg.capF) {
      this._repack({
        growVar: {
          field,
          newCapF: Math.max(src.length, Math.max(64, seg.capF * 2)),
        },
      });
    }
    this._arena.write(seg.offF, src, src.length);
    seg.lenF = src.length;
  }

  private _opsBoundOnce: any;

  private _bakeOpsOnce(raw: any) {
    const self = this; // eslint-disable-line
    const seen = new WeakMap<object, any>();

    const clone = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      const hit = seen.get(obj);
      if (hit) return hit;
      const out: any = Array.isArray(obj) ? [] : Object.create(null);
      seen.set(obj, out);
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (typeof v === 'function') {
          const wantBase = v.__needsBase !== false;
          out[k] = wantBase
            ? (...args: any[]) => v(self._prepareForWasm(), ...args)
            : (...args: any[]) => v(...args);
        } else if (v && typeof v === 'object') {
          out[k] = clone(v);
        } else {
          out[k] = v;
        }
      }
      return out;
    };

    return clone(raw);
  }

  public get ops() {
    if (!this._useWasm) return undefined;
    if (!this._opsBoundOnce) {
      if (!this.wasmModule) {
        throw new Error(
          `wasmModule module not initialized for ${this.getSchema()}. Did you forget to call .initialize() or set useWasm: false?`
        );
      }
      this._opsBoundOnce = this._bakeOpsOnce(this.wasmModule.ops);
    }
    return this._opsBoundOnce;
  }

  protected _makeThinChild<T>(
    field: string,
    ChildCtor: new (...args: any[]) => T,
    index: number
  ): T {
    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    const strideF = meta.schema.headerFloatCount | 0;

    installThinAccessors(ChildCtor);

    const child = Object.create(ChildCtor.prototype);
    child._engine = this._engine;
    child._host = this;
    child._baseF = this._structSeg[field].offF + index * strideF;

    child.emitHeaderDirty = (byteOffset?: number, byteLength?: number) =>
      this.emitHeaderDirty(byteOffset, byteLength);
    child.dispose = () => {};

    return child as T;
  }

  private _refreshStructArrayChildBases() {
    const schema = this.getSchema();
    for (const field of Object.keys(schema.structArrays)) {
      const seg = this._structSeg[field];
      const slots = this._structArraySlots[field];
      if (!seg || !slots?.length) continue;

      const strideF = schema.structArrays[field].schema.headerFloatCount | 0;
      for (let i = 0; i < slots.length; i++) {
        const child: any = slots[i];
        if (!child || child._host !== this) continue;
        child._baseF = seg.offF + i * strideF;
        for (const key of Object.keys(child)) {
          if (key.startsWith('__live_')) delete child[key];
        }
      }
    }
  }

  public tickInstances(field: string, deltaTime: number) {
    if (this._isDisposed || !this._useWasm) return;
    const asc = this.wasmModule;
    if (!asc) return;
    const seg = this._structSeg[field];
    const count = this._structArrayCount[field] | 0;
    if (!count) return;

    const base = this.__wasmBasePtr + seg.offF * 4;
    asc.ops[field].orbitDelta(base, count, deltaTime, 0.1234, 0.6, 0.9, 0.15);
    this._arena.markDirty?.();
  }

  protected _prepareForWasm(): number {
    if (!this._useWasm) return 0;
    this._refreshViewsIfGrown?.();
    this.syncStructArrayHeaderFields();
    return this.getBaseOffset();
  }

  protected syncStructArrayHeaderFields() {
    if (!this._useWasm || !this.__wasmBasePtr) return;
    const asc = this.wasmModule;
    const buf = asc?.memory?.buffer;
    if (this._lastSyncedBuffer === buf && this._lastSyncedStructVersion === this._structVersion)
      return;
    if (!buf) return;
    const schema = this.getSchema();
    for (const name of Object.keys(schema.structArrays)) {
      const seg = this._structSeg[name];
      const count = (this._structArrayCount[name] | 0) >>> 0;
      const ptrField = `${name}Ptr`;
      const cntField = `${name}Count`;

      // Even if count==0, a valid pointer is nice to have
      const ptr = seg ? (this.__wasmBasePtr + (seg.offF | 0) * 4) >>> 0 : 0;

      // If the TS class has those fields, set them. This writes into wasm memory.
      if ((this as any)[ptrField] !== undefined) (this as any)[ptrField] = ptr;
      if ((this as any)[cntField] !== undefined) (this as any)[cntField] = count;
    }
    this._lastSyncedBuffer = buf;
    this._lastSyncedStructVersion = this._structVersion;
    this.emitHeaderDirty(); // one notification is enough
  }

  /** Create, attach, and return a child struct instance in the given var-array. */
  public addStructToArray<T extends Shado = Shado>(field: string): T {
    if (this._isDisposed) throw new Error('addStructToArray on disposed object');

    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }

    // Ensure segment exists & capacity
    const strideF = meta.schema.headerFloatCount;
    const seg = (this._structSeg[field] ||= { offF: 0, lenF: 0, capF: 0 });
    const count = (this._structArrayCount[field] || 0) | 0;
    const needF = (count + 1) * strideF;
    if (needF > seg.capF) {
      this._repack({
        growStruct: {
          field,
          newCapF: Math.max(needF, Math.max(strideF * 4, seg.capF * 2)),
        },
      });
    }

    seg.lenF = needF;
    this._structArrayCount[field] = count + 1;

    const child = this._makeThinChild<T>(field, meta.ctor, count);

    (this._structArraySlots[field] ||= [])[count] = child as any;
    (this._structArrayIndex[field] ||= new Map()).set(child as any, count);

    this._structVersion++;
    this.syncStructArrayHeaderFields();

    return child;
  }

  public reserveStructArray(field: string, count: number): void {
    if (this._isDisposed) return;

    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }

    const nextCount = Math.max(0, count | 0);
    const strideF = meta.schema.headerFloatCount | 0;
    const needF = nextCount * strideF;
    const seg = (this._structSeg[field] ||= { offF: 0, lenF: 0, capF: 0 });
    if (needF > seg.capF) {
      this._repack({
        growStruct: {
          field,
          newCapF: Math.max(needF, Math.max(strideF * 4, seg.capF * 2)),
        },
      });
    }
  }

  public getStructArrayCount(field: string): number {
    const schema = this.getSchema();
    if (!schema.structArrays[field]) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }
    return this._structArrayCount[field] | 0;
  }

  public setStructArrayCount(field: string, count: number): void {
    if (this._isDisposed) return;

    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }

    const nextCount = Math.max(0, count | 0);
    const strideF = meta.schema.headerFloatCount | 0;
    this.reserveStructArray(field, nextCount);

    const seg = (this._structSeg[field] ||= { offF: 0, lenF: 0, capF: 0 });
    seg.lenF = nextCount * strideF;
    this._structArrayCount[field] = nextCount;

    const slots = (this._structArraySlots[field] ||= []);
    slots.length = nextCount;
    const index = (this._structArrayIndex[field] ||= new Map());
    index.clear();
    for (let i = 0; i < slots.length; i++) {
      const child = slots[i];
      if (!child) continue;
      (child as any)._baseF = seg.offF + i * strideF;
      index.set(child, i);
    }

    this._arena.markDirty?.();
    this._structVersion++;
    this.syncStructArrayHeaderFields();
  }

  public clearStructArray(field: string): void {
    this.setStructArrayCount(field, 0);
  }

  public copyStructArrayElement(field: string, fromIndex: number, toIndex: number): void {
    if (this._isDisposed) return;

    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }

    const count = this._structArrayCount[field] | 0;
    const from = fromIndex | 0;
    const to = toIndex | 0;
    if (from < 0 || from >= count || to < 0 || to >= count) {
      throw new RangeError(
        `copyStructArrayElement(${field}) index out of range: from=${from}, to=${to}, count=${count}`
      );
    }
    if (from === to) return;

    const strideF = meta.schema.headerFloatCount | 0;
    const seg = this._structSeg[field];
    const arena = this._arena.take();
    const src = arena.slice(seg.offF + from * strideF, seg.offF + (from + 1) * strideF);
    this._arena.write(seg.offF + to * strideF, src, strideF);

    const slots = (this._structArraySlots[field] ||= []);
    const index = (this._structArrayIndex[field] ||= new Map());
    const child = slots[from];
    slots[to] = child;
    if (child) {
      (child as any)._baseF = seg.offF + to * strideF;
      for (const key of Object.keys(child as any)) {
        if (key.startsWith('__live_')) delete (child as any)[key];
      }
      index.set(child, to);
    }

    this._structVersion++;
    this.syncStructArrayHeaderFields();
  }

  public removeStructFromArray(
    field: string,
    index: number,
    mode: 'swap' | 'stable' = 'swap'
  ): Shado | undefined {
    if (this._isDisposed) return undefined;

    const schema = this.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct var-array on ${schema.name}`);
    }

    const count = this._structArrayCount[field] | 0;
    const removeIndex = index | 0;
    if (removeIndex < 0 || removeIndex >= count) {
      throw new RangeError(
        `removeStructFromArray(${field}) index out of range: index=${removeIndex}, count=${count}`
      );
    }

    const strideF = meta.schema.headerFloatCount | 0;
    const seg = this._structSeg[field];
    const slots = (this._structArraySlots[field] ||= []);
    const indexMap = (this._structArrayIndex[field] ||= new Map());
    const removed = slots[removeIndex];
    if (removed) indexMap.delete(removed);

    if (mode === 'stable') {
      const arena = this._arena.take();
      for (let i = removeIndex + 1; i < count; i++) {
        const src = arena.slice(seg.offF + i * strideF, seg.offF + (i + 1) * strideF);
        this._arena.write(seg.offF + (i - 1) * strideF, src, strideF);
        const child = slots[i];
        slots[i - 1] = child;
        if (child) {
          (child as any)._baseF = seg.offF + (i - 1) * strideF;
          for (const key of Object.keys(child as any)) {
            if (key.startsWith('__live_')) delete (child as any)[key];
          }
          indexMap.set(child, i - 1);
        }
      }
    } else {
      const last = count - 1;
      if (removeIndex !== last) {
        const arena = this._arena.take();
        const src = arena.slice(seg.offF + last * strideF, seg.offF + (last + 1) * strideF);
        this._arena.write(seg.offF + removeIndex * strideF, src, strideF);
        const moved = slots[last];
        slots[removeIndex] = moved;
        if (moved) {
          (moved as any)._baseF = seg.offF + removeIndex * strideF;
          for (const key of Object.keys(moved as any)) {
            if (key.startsWith('__live_')) delete (moved as any)[key];
          }
          indexMap.set(moved, removeIndex);
        }
      }
    }

    slots.length = count - 1;
    seg.lenF = (count - 1) * strideF;
    this._structArrayCount[field] = count - 1;

    this._arena.write(seg.offF + (count - 1) * strideF, new Float32Array(strideF), strideF);
    this._arena.markDirty?.();
    this._structVersion++;
    this.syncStructArrayHeaderFields();

    return removed;
  }

  public commitAndBind(effect: any) {
    if (this._isDisposed) return;
    this.commit();
    this.bind(effect);
  }

  public commit() {
    if (this._isDisposed) return;
    this._backing.commit();
  }

  public bind(effect: any) {
    if (this._isDisposed) return;
    this._backing.bind(effect, this._includeName);
  }

  public bindMaterial(material: any) {
    if (this._isDisposed) return;
    (this._backing.bindMaterial ?? this._backing.bind).call(
      this._backing,
      material,
      this._includeName
    );
  }

  public dispose() {
    if (this._isDisposed) return;
    this._isDisposed = true;

    // 1) Unsubscribe Babylon observers
    try {
      const eng: any = this._engine;
      if (eng) {
        if (this._engineObs) eng.onDisposeObservable.remove(this._engineObs);
        if (this._engineNewSceneObs) eng.onNewSceneAddedObservable.remove(this._engineNewSceneObs);
      }
      for (const { scene, obs } of this._sceneObs) {
        scene?.onDisposeObservable?.remove?.(obs);
      }
    } catch (e) {
      console.warn('Error during Shado.dispose()', e);
    }
    this._engineObs = undefined;
    this._engineNewSceneObs = undefined;
    this._sceneObs.length = 0;

    // 2) Unsubscribe child mirrors (onDirty relays)
    try {
      for (const k of Object.keys(this._structArrayUnsubs)) {
        const arr = this._structArrayUnsubs[k];
        if (arr) {
          for (let i = 0; i < arr.length; i++) {
            try {
              arr[i]?.();
            } catch (e) {
              console.warn('Error during Shado.dispose()', e);
            }
            arr[i] = undefined as any;
          }
        }
      }
    } catch (e) {
      console.warn('Error during Shado.dispose()', e);
    }
    this._structArrayUnsubs = {};
    this._structArraySlots = {};
    this._structArrayIndex = {};
    this._structArrayCount = {};
    this._dirtyHandlers = [];
    // 3) Free wasmModule allocations (arena base + any owned pointers)
    if (this._useWasm) {
      try {
        const asc = this.wasmModule;
        const free = asc?.exports?.free as ((p: number) => void) | undefined;

        // Free the arena base block if we have one
        if (free && this.__wasmBasePtr) {
          try {
            free(this.__wasmBasePtr >>> 0);
          } catch (e) {
            console.warn('Error during Shado.dispose()', e);
          }
        }
      } catch (e) {
        console.warn('Error during Shado.dispose()', e);
      }
    }
    this.__wasmBasePtr = 0;
    this.__wasmArenaFloats = 0;
    this._lastMemBuf = null;

    // 4) Invalidate views so future writes no-op instead of crashing
    try {
      // Replace arena storage with a tiny inert view
      (this as any)._arena.adopt(new Float32Array(1));
    } catch (e) {
      console.warn('Error during Shado.dispose()', e);
    }
    for (const k of Object.keys(this._liveVecs)) {
      this._liveVecs[k] = new Float32Array(0);
    }

    // 5) Clear segments & versions
    this._headerSeg = { offF: 0, lenF: 0, capF: 0 };
    this._varSeg = {};
    this._structSeg = {};
    this._structVersion++;
    this._lastSyncedStructVersion = this._structVersion;

    // 6) Dispose GPU resources
    try {
      this._backing?.dispose?.();
    } catch (e) {
      console.warn('Error during Shado.dispose()', e);
    }
    this._backing = undefined as any;

    // 7) Make public calls safe after dispose
    this._engine = null as any;
  }

  protected onRefreshViewsIfGrown?(buf: ArrayBuffer): void;
  protected _lastMemBuf: ArrayBuffer | null = null;

  protected _refreshViewsIfGrown() {
    if (!this._useWasm) return;
    const asc = this.wasmModule;
    if (!asc?.memory) return;
    const buf = asc.memory.buffer;
    if (buf !== this._lastMemBuf) {
      this._lastMemBuf = buf;
      const currentLenF = this._arena.take().length;
      const next = new Float32Array(
        buf,
        this.getBaseOffset(),
        Math.max(1, this.__wasmArenaFloats || currentLenF)
      );
      this._arena.adopt(next);
      (this as any)._headerDV = this._arena.dataView();
      this.syncStructArrayHeaderFields();
      this?.onRefreshViewsIfGrown?.(buf);
    }
  }

  private _ensureArenaLayout() {
    const schema = this.getSchema();
    type Entry = {
      kind: 'header' | 'var' | 'struct';
      name?: string;
      seg: Segment;
      stride?: number;
    };
    const entries: Entry[] = [];
    entries.push({ kind: 'header', seg: this._headerSeg });
    for (const name of Object.keys(schema.varArrays)) {
      entries.push({
        kind: 'var',
        name,
        seg: (this._varSeg[name] ??= { offF: 0, lenF: 0, capF: 0 }),
        stride: schema.varArrays[name].floatStride,
      });
    }
    for (const name of Object.keys(schema.structArrays)) {
      entries.push({
        kind: 'struct',
        name,
        seg: (this._structSeg[name] ??= { offF: 0, lenF: 0, capF: 0 }),
        stride: schema.structArrays[name].floatStride,
      });
    }
    let cursor = 0;
    const round = (x: number, a: number) => Math.ceil(x / a) * a;
    for (const e of entries) {
      cursor = round(cursor, 4);
      e.seg.offF = cursor;
      cursor += e.seg.capF || 0;
    }
    this._arena.ensureCapacity(cursor);
    this.syncStructArrayHeaderFields(); // after initial placement
  }

  private _repack(opts?: {
    growVar?: { field: string; newCapF: number };
    growStruct?: { field: string; newCapF: number };
  }) {
    this._refreshViewsIfGrown?.();

    const prevView = this._arena.take();
    const prev = new Float32Array(prevView);
    const schema = this.getSchema();

    const oldHeaderOff = this._headerSeg.offF | 0;
    const oldHeaderLen = this._headerSeg.lenF | 0;
    const newHeaderCap = this._headerSeg.capF;

    const varFields = Object.keys(schema.varArrays);
    const structFields = Object.keys(schema.structArrays);

    const round = (x: number, a: number) => Math.ceil(x / a) * a;

    const newVarCaps: Record<string, number> = {};
    for (const f of varFields) {
      const seg = (this._varSeg[f] ??= { offF: 0, lenF: 0, capF: 0 });
      let cap = seg.capF;
      if (opts?.growVar && opts.growVar.field === f) cap = Math.max(cap, opts.growVar.newCapF);
      newVarCaps[f] = Math.max(cap, seg.lenF);
    }
    const newStructCaps: Record<string, number> = {};
    for (const f of structFields) {
      const seg = (this._structSeg[f] ??= { offF: 0, lenF: 0, capF: 0 });
      let cap = seg.capF;
      if (opts?.growStruct && opts.growStruct.field === f)
        cap = Math.max(cap, opts.growStruct.newCapF);
      newStructCaps[f] = Math.max(cap, seg.lenF);
    }

    let totalF = newHeaderCap;
    for (const f of varFields) {
      totalF = round(totalF, 4);
      totalF += newVarCaps[f];
    }
    for (const f of structFields) {
      totalF = round(totalF, 4);
      totalF += newStructCaps[f];
    }

    const asc = this.wasmModule;
    let next: Float32Array;
    if (asc?.alloc && asc?.memory) {
      const bytes = Math.max(1, totalF) * 4;
      const ptr = asc.alloc(bytes | 0); // may grow memory
      // Update last memory buffer reference
      this._lastMemBuf = asc.memory.buffer;
      next = new Float32Array(asc.memory.buffer, ptr, Math.max(1, totalF));
      (this as any).__wasmBasePtr = ptr;
      this.__wasmArenaFloats = Math.max(1, totalF);
    } else {
      next = new Float32Array(Math.max(1, totalF));
      (this as any).__wasmBasePtr = 0;
      this.__wasmArenaFloats = 0;
    }

    let cursor = 0;
    this._headerSeg.offF = cursor;
    this._headerSeg.capF = newHeaderCap;
    this._headerSeg.lenF = newHeaderCap;
    next.set(prev.subarray(oldHeaderOff, oldHeaderOff + oldHeaderLen), cursor);
    cursor += newHeaderCap;

    for (const f of varFields) {
      const seg = this._varSeg[f];
      const newCap = newVarCaps[f];
      const oldSlice =
        seg.capF && seg.lenF ? prev.subarray(seg.offF, seg.offF + seg.lenF) : undefined;
      cursor = round(cursor, 4);
      seg.offF = cursor;
      seg.capF = newCap;
      if (oldSlice) next.set(oldSlice, seg.offF);
      cursor += newCap;
    }

    for (const f of structFields) {
      const seg = this._structSeg[f];
      const newCap = newStructCaps[f];
      const oldSlice =
        seg.capF && seg.lenF ? prev.subarray(seg.offF, seg.offF + seg.lenF) : undefined;
      cursor = round(cursor, 4);
      seg.offF = cursor;
      seg.capF = newCap;
      if (oldSlice) next.set(oldSlice, seg.offF);
      cursor += newCap;
    }

    this._arena.adopt(next);
    (this as any)._headerDV = this._arena.dataView();
    this._refreshStructArrayChildBases();

    this._structVersion++;
    this.syncStructArrayHeaderFields(); // after initial placement
  }

  public getVarArrayPtr(field: string): number {
    const seg = this._varSeg[field];
    if (!this.wasmModule || !seg) return 0;
    return (this.getBaseOffset() + (seg.offF | 0) * 4) >>> 0;
  }
  public getVarArrayCount(field: string): number {
    return (this._varSeg[field]?.lenF ?? 0) / (this.getSchema().varArrays[field].floatStride | 1);
  }
  public getVarArrayStrideFloats(field: string): number {
    return this.getSchema().varArrays[field].floatStride | 0;
  }
}
