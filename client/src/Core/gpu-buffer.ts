// core/src/engine/gpuSchemaBuffer.ts
// -----------------------------------------------------------------------------
// Single-buffer GPU struct schema system for Babylon.js (WebGL/WebGPU).
//
// Highlight changes vs previous version:
//  - EXACTLY ONE GPU RESOURCE PER RECORD (texture on WebGL, storage buffer on WebGPU).
//  - Header, var-arrays, and struct-array headers are all slices of one arena.
//  - Shader side: one fetch function, plus Base/Stride/Count uniforms per field
//    and one HeaderBase uniform.
//  - CPU side: per-record FloatArena with simple repacker when segments resize.
//
// Usage: same decorators/builder. Call .commitAndBind(effect) before draw.
// -----------------------------------------------------------------------------

import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";

// ----------------------------- Types & Layout -------------------------------
export type ScalarType = "f32" | "i32" | "u32";
export type VectorType = "vec2" | "vec3" | "vec4";
export type MatrixType = "mat2" | "mat3" | "mat4";

export interface VarArrayType {
  varOf: ScalarType | VectorType | MatrixType | StructRef;
}

export type FieldType =
  | ScalarType
  | VectorType
  | MatrixType
  | VarArrayType
  | StructRef;

type BackendKind = "storage" | "datatex";

interface GPUBacking {
  kind: BackendKind;
  commit(): void; // Upload CPU arena to GPU if dirty.
  bind(effect: BJS.Effect, includeName: string): void; // Bind the resource + uniforms.
  dispose(): void;
}

// Schema field (no fixed arrays)
export interface FieldDef {
  order: number;
  name: string;
  type: FieldType; // scalar | vector | matrix | var array | embedded struct
  headerFloatOffset?: number; // in floats
  headerFloatSize?: number; // in floats (vec3=4, mat3=12)
}

export interface SchemaBuildOptions {
  alignFloats?: 1 | 2 | 4;
}

// ------------------------------ Helpers ------------------------------------
function isVarArray(t: FieldType): t is VarArrayType {
  return typeof t === "object" && !!(t as any)?.varOf;
}
function isStructRef(t: any): t is StructRef {
  return t && typeof t === "object" && "structOf" in t;
}
function isScalar(t: any): t is ScalarType {
  return t === "f32" || t === "i32" || t === "u32";
}
function isVector(t: any): t is VectorType {
  return t === "vec2" || t === "vec3" || t === "vec4";
}
function isMatrix(t: any): t is MatrixType {
  return t === "mat2" || t === "mat3" || t === "mat4";
}
function isVarArrayOfStruct(t: FieldType): t is VarArrayType {
  return isVarArray(t) && isStructRef((t as VarArrayType).varOf as any);
}

// floats per element in our packed representation
function floatStrideOf(t: ScalarType | VectorType | MatrixType): number {
  if (isScalar(t)) {
    return 1;
  }
  if (t === "vec2") {
    return 2;
  }
  if (t === "vec3") {
    return 4;
  } // padded to 4
  if (t === "vec4") {
    return 4;
  }
  if (t === "mat2") {
    return 4;
  } // 2 columns * vec2
  if (t === "mat3") {
    return 12;
  } // 3 columns * padded vec3
  if (t === "mat4") {
    return 16;
  } // 4 columns * vec4
  throw new Error(`Unknown type: ${t as any}`);
}

// glsl type names
function toGLSLType(t: ScalarType | VectorType | MatrixType): string {
  switch (t) {
    case "f32":
      return "float";
    case "i32":
      return "int";
    case "u32":
      return "uint";
    case "vec2":
      return "vec2";
    case "vec3":
      return "vec3";
    case "vec4":
      return "vec4";
    case "mat2":
      return "mat2";
    case "mat3":
      return "mat3";
    case "mat4":
      return "mat4";
    default:
      throw new Error(`Unknown type: ${t as any}`);
  }
}

function lc(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function roundUpFloats(x: number, a: number) {
  return Math.ceil(x / a) * a;
}

// ------------------------------ Float arena ---------------------------------
//
// One per GPURecord. We expose adopt() so the record can repack.
//
type Segment = { offF: number; lenF: number; capF: number };

class FloatArena {
  private buf = new Float32Array(0);
  private dirty = true;

  ensureCapacity(nextF: number) {
    if (nextF <= this.buf.length) {
      return;
    }
    const nextLen = Math.max(
      nextF,
      this.buf.length ? this.buf.length * 2 : 1024,
    );
    const next = new Float32Array(nextLen);
    next.set(this.buf);
    this.buf = next;
    this.dirty = true;
  }

  write(offF: number, src: ArrayLike<number>, lenF = src.length) {
    this.ensureCapacity(offF + lenF);
    // @ts-ignore
    this.buf.set(
      (src as any).subarray ? (src as any).subarray(0, lenF) : src,
      offF,
    );
    this.dirty = true;
  }

  view(offF: number, lenF: number): Float32Array {
    return new Float32Array(this.buf.buffer, offF * 4, lenF);
  }

  take(): Float32Array {
    return this.buf;
  }
  isDirty(): boolean {
    return this.dirty;
  }
  markClean() {
    this.dirty = false;
  }

  adopt(newBuf: Float32Array<ArrayBuffer>) {
    this.buf = newBuf;
    this.dirty = true;
  }
}

// ------------------------------ Schema --------------------------------------
export class GPUStructSchema {
  public readonly name: string;
  public readonly fields: ReadonlyArray<FieldDef>;
  public readonly headerFloatCount: number;

  public readonly embeddedStructs: Record<
    string,
    {
      schema: GPUStructSchema;
      headerFloatOffset: number;
      headerFloatSize: number;
    }
  > = {};

  public readonly structArrays: Record<
    string,
    {
      schema: GPUStructSchema;
      floatStride: number /* child.headerFloatCount */;
    }
  > = {};

  // var arrays metadata: fieldName -> { elemType, floatStride }
  public readonly varArrays: Record<
    string,
    { elemType: ScalarType | VectorType | MatrixType; floatStride: number }
  >;

  constructor(name: string, laidOut: FieldDef[], headerFloatCount: number) {
    this.name = name;
    this.fields = laidOut;
    this.headerFloatCount = headerFloatCount;

    this.varArrays = {};
    for (const f of laidOut) {
      if (isVarArray(f.type)) {
        const elem = (f.type as VarArrayType).varOf as any;
        if (!isStructRef(elem)) {
          this.varArrays[f.name] = {
            elemType: elem,
            floatStride: floatStrideOf(elem),
          };
        }
      }
    }

    for (const f of laidOut) {
      if (
        isVarArray(f.type) &&
        isStructRef((f.type as VarArrayType).varOf as any)
      ) {
        const child = (
          (f.type as VarArrayType).varOf as StructRef
        ).structOf.getSchema();
        (this as any).structArrays[f.name] = {
          schema: child,
          floatStride: child.headerFloatCount,
        };
      } else if (isStructRef(f.type)) {
        const child = (f.type as StructRef).structOf.getSchema();
        (this as any).embeddedStructs[f.name] = {
          schema: child,
          headerFloatOffset: f.headerFloatOffset ?? 0,
          headerFloatSize: f.headerFloatSize ?? child.headerFloatCount,
        };
      }
    }
  }

  public materialIOFor(engine: BJS.Engine) {
    const isWebGPU =
      (engine as any)._isWebGPU ||
      (engine as any).getClassName?.() === "WebGPUEngine";
    const name = this.name;

    const uniforms: string[] = [];
    const samplers: string[] = [];

    // Single backing resource: sampler only on WebGL
    if (!isWebGPU) {
      samplers.push(`u${name}BufTex`);
      uniforms.push(`u${name}BufTexWidth`);
    }

    // Header base
    uniforms.push(`u${name}HeaderBase`);

    // Per-field Base/Stride/Count uniforms
    for (const field of Object.keys(this.varArrays)) {
      uniforms.push(
        `u${name}_${field}Base`,
        `u${name}_${field}Stride`,
        `u${name}_${field}Count`,
      );
    }
    for (const field of Object.keys(this.structArrays)) {
      uniforms.push(
        `u${name}_${field}Base`,
        `u${name}_${field}Stride`,
        `u${name}_${field}Count`,
      );
    }

    const uniq = (a: string[]) => [...new Set(a)];
    return { uniforms: uniq(uniforms), samplers: uniq(samplers) };
  }

  // ---------------- Emission (GLSL) ----------------

  /** Header struct for both backends (name + "Header"). */
  public emitHeaderStruct(): string {
    const name = this.name;
    const L: string[] = [];
    for (const f of this.fields) {
      if (isVarArray(f.type)) {
        continue;
      }
      if (isStructRef(f.type)) {
        const child = (f.type as StructRef).structOf.getSchema();
        L.push(`  ${child.name}Header ${f.name};`);
      } else {
        L.push(`  ${toGLSLType(f.type as any)} ${f.name};`);
      }
    }
    if (!L.length) {
      L.push("  float _dummy;");
    }
    return `struct ${name}Header {\n${L.join("\n")}\n};`;
  }

  /** GLSL include: single buffer fetch + helpers */
  public emitGLSLStorage(group = 1, startBinding = 12): string {
    const name = this.name;
    const lname = lc(name);
    const headerFloats = this.headerFloatCount;
    const L: string[] = [];

    // ---------- Common: header struct ----------
    L.push(this.emitHeaderStruct());
    L.push(`const int ${name}_HEADER_FLOATS = ${headerFloats};\n`);

    // ---------- Single backing resource + fetch ----------
    L.push(`#ifdef WEBGPU
layout(set = ${group}, binding = ${startBinding}) readonly buffer ${name}Buf { float data[]; } ${lname}Buf;
float ${name}_fetch(int i) { return ${lname}Buf.data[i]; }
#else
uniform highp sampler2D u${name}BufTex;
uniform int u${name}BufTexWidth;
float ${name}_fetch(int li) {
  int x = li % u${name}BufTexWidth;
  int y = li / u${name}BufTexWidth;
  return texelFetch(u${name}BufTex, ivec2(x,y), 0).r;
}
#endif
`);

    // ---------- Header base + helper ----------
    L.push(`uniform int u${name}HeaderBase;
float ${name}_hfetch(int i) { return ${name}_fetch(u${name}HeaderBase + i); }
`);

    // ---------- Var-array accessors ----------
    for (const [field, meta] of Object.entries(this.varArrays)) {
      const t = meta.elemType;
      const glslT = toGLSLType(t as any);
      L.push(`uniform int u${name}_${field}Base;
uniform int u${name}_${field}Stride;
uniform int u${name}_${field}Count;
`);
      if (t === "f32" || t === "i32" || t === "u32") {
        L.push(`
float ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return ${name}_fetch(base);
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
      } else if (t === "vec2") {
        L.push(`
${glslT} ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return vec2(${name}_fetch(base+0), ${name}_fetch(base+1));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
      } else if (t === "vec3") {
        L.push(`
${glslT} ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return vec3(${name}_fetch(base+0), ${name}_fetch(base+1), ${name}_fetch(base+2));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
      } else if (t === "vec4") {
        L.push(`
${glslT} ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return vec4(${name}_fetch(base+0), ${name}_fetch(base+1), ${name}_fetch(base+2), ${name}_fetch(base+3));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
      } else if (t === "mat2") {
        L.push(`
mat2 ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return mat2(${name}_fetch(base+0), ${name}_fetch(base+1),
              ${name}_fetch(base+2), ${name}_fetch(base+3));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
      } else if (t === "mat3") {
        L.push(`
mat3 ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return mat3(
    ${name}_fetch(base+0), ${name}_fetch(base+1), ${name}_fetch(base+2),
    ${name}_fetch(base+4), ${name}_fetch(base+5), ${name}_fetch(base+6),
    ${name}_fetch(base+8), ${name}_fetch(base+9), ${name}_fetch(base+10)
  );
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
      } else {
        // mat4
        L.push(`
mat4 ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return mat4(
    ${name}_fetch(base+0), ${name}_fetch(base+1), ${name}_fetch(base+2), ${name}_fetch(base+3),
    ${name}_fetch(base+4), ${name}_fetch(base+5), ${name}_fetch(base+6), ${name}_fetch(base+7),
    ${name}_fetch(base+8), ${name}_fetch(base+9), ${name}_fetch(base+10), ${name}_fetch(base+11),
    ${name}_fetch(base+12), ${name}_fetch(base+13), ${name}_fetch(base+14), ${name}_fetch(base+15)
  );
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
      }
    }

    // ---------- Struct-array accessors ----------
    for (const [field, meta] of Object.entries(this.structArrays)) {
      const child = meta.schema;
      L.push(`
uniform int u${name}_${field}Base;
uniform int u${name}_${field}Stride;  // = ${child.headerFloatCount}
uniform int u${name}_${field}Count;

${child.name}Header ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  ${child.name}Header h;
${child.fields
  .map((cf) => {
    if (isVarArray(cf.type)) {
      return "";
    }
    const off = cf.headerFloatOffset ?? 0;
    if (cf.type === "f32") {
      return `  h.${cf.name} = ${name}_fetch(base+${off});`;
    }
    if (cf.type === "i32") {
      return `  h.${cf.name} = int(${name}_fetch(base+${off}));`;
    }
    if (cf.type === "u32") {
      return `  h.${cf.name} = uint(${name}_fetch(base+${off}));`;
    }
    if (cf.type === "vec2") {
      return `  h.${cf.name} = vec2(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}));`;
    }
    if (cf.type === "vec3") {
      return `  h.${cf.name} = vec3(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}));`;
    }
    if (cf.type === "vec4") {
      return `  h.${cf.name} = vec4(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}));`;
    }
    if (cf.type === "mat2") {
      return `  h.${cf.name} = mat2(${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}));`;
    }
    if (cf.type === "mat3") {
      return `  h.${cf.name} = mat3(
    ${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}),
    ${name}_fetch(base+${off + 4}), ${name}_fetch(base+${off + 5}), ${name}_fetch(base+${off + 6}),
    ${name}_fetch(base+${off + 8}), ${name}_fetch(base+${off + 9}), ${name}_fetch(base+${off + 10})
  );`;
    }
    return `  h.${cf.name} = mat4(
    ${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}),
    ${name}_fetch(base+${off + 4}), ${name}_fetch(base+${off + 5}), ${name}_fetch(base+${off + 6}), ${name}_fetch(base+${off + 7}),
    ${name}_fetch(base+${off + 8}), ${name}_fetch(base+${off + 9}), ${name}_fetch(base+${off + 10}), ${name}_fetch(base+${off + 11}),
    ${name}_fetch(base+${off + 12}), ${name}_fetch(base+${off + 13}), ${name}_fetch(base+${off + 14}), ${name}_fetch(base+${off + 15})
  );`;
  })
  .join("\n")}
  return h;
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
    }

    // ---------- Header loader ----------
    L.push(`
${name}Header ${name}_loadHeader(int rec) {
  int base = u${name}HeaderBase; // single-record buffer; rec kept for future AoS packing
  ${name}Header h;
`);

    for (const f of this.fields) {
      if (isVarArray(f.type)) {
        continue;
      }
      const off = f.headerFloatOffset ?? 0;

      if (f.type === "f32") {
        L.push(`  h.${f.name} = ${name}_fetch(base+${off});`);
      } else if (f.type === "i32") {
        L.push(`  h.${f.name} = int(${name}_fetch(base+${off}));`);
      } else if (f.type === "u32") {
        L.push(`  h.${f.name} = uint(${name}_fetch(base+${off}));`);
      } else if (f.type === "vec2") {
        L.push(
          `  h.${f.name} = vec2(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}));`,
        );
      } else if (f.type === "vec3") {
        L.push(
          `  h.${f.name} = vec3(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}));`,
        );
      } else if (f.type === "vec4") {
        L.push(
          `  h.${f.name} = vec4(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}));`,
        );
      } else if (f.type === "mat2") {
        L.push(
          `  h.${f.name} = mat2(${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}));`,
        );
      } else if (f.type === "mat3") {
        L.push(`  h.${f.name} = mat3(
    ${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}),
    ${name}_fetch(base+${off + 4}), ${name}_fetch(base+${off + 5}), ${name}_fetch(base+${off + 6}),
    ${name}_fetch(base+${off + 8}), ${name}_fetch(base+${off + 9}), ${name}_fetch(base+${off + 10})
  );`);
      } else {
        L.push(`  h.${f.name} = mat4(
    ${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}),
    ${name}_fetch(base+${off + 4}), ${name}_fetch(base+${off + 5}), ${name}_fetch(base+${off + 6}), ${name}_fetch(base+${off + 7}),
    ${name}_fetch(base+${off + 8}), ${name}_fetch(base+${off + 9}), ${name}_fetch(base+${off + 10}), ${name}_fetch(base+${off + 11}),
    ${name}_fetch(base+${off + 12}), ${name}_fetch(base+${off + 13}), ${name}_fetch(base+${off + 14}), ${name}_fetch(base+${off + 15})
  );`);
      }
    }

    // inline-load embedded children (within header stream)
    for (const f of this.fields) {
      if (!isStructRef(f.type)) {
        continue;
      }
      const off = f.headerFloatOffset ?? 0;
      const child = (f.type as StructRef).structOf.getSchema();
      for (const cf of child.fields) {
        if (isVarArray(cf.type)) {
          continue;
        }
        const coff = (cf.headerFloatOffset ?? 0) + off;
        if (cf.type === "f32") {
          L.push(`  h.${f.name}.${cf.name} = ${name}_fetch(base+${coff});`);
        } else if (cf.type === "i32") {
          L.push(
            `  h.${f.name}.${cf.name} = int(${name}_fetch(base+${coff}));`,
          );
        } else if (cf.type === "u32") {
          L.push(
            `  h.${f.name}.${cf.name} = uint(${name}_fetch(base+${coff}));`,
          );
        } else if (cf.type === "vec2") {
          L.push(
            `  h.${f.name}.${cf.name} = vec2(${name}_fetch(base+${coff}), ${name}_fetch(base+${coff + 1}));`,
          );
        } else if (cf.type === "vec3") {
          L.push(
            `  h.${f.name}.${cf.name} = vec3(${name}_fetch(base+${coff}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}));`,
          );
        } else if (cf.type === "vec4") {
          L.push(
            `  h.${f.name}.${cf.name} = vec4(${name}_fetch(base+${coff}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}), ${name}_fetch(base+${coff + 3}));`,
          );
        } else if (cf.type === "mat2") {
          L.push(
            `  h.${f.name}.${cf.name} = mat2(${name}_fetch(base+${coff + 0}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}), ${name}_fetch(base+${coff + 3}));`,
          );
        } else if (cf.type === "mat3") {
          L.push(`  h.${f.name}.${cf.name} = mat3(
    ${name}_fetch(base+${coff + 0}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}),
    ${name}_fetch(base+${coff + 4}), ${name}_fetch(base+${coff + 5}), ${name}_fetch(base+${coff + 6}),
    ${name}_fetch(base+${coff + 8}), ${name}_fetch(base+${coff + 9}), ${name}_fetch(base+${coff + 10})
  );`);
        } else {
          L.push(`  h.${f.name}.${cf.name} = mat4(
    ${name}_fetch(base+${coff + 0}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}), ${name}_fetch(base+${coff + 3}),
    ${name}_fetch(base+${coff + 4}), ${name}_fetch(base+${coff + 5}), ${name}_fetch(base+${coff + 6}), ${name}_fetch(base+${coff + 7}),
    ${name}_fetch(base+${coff + 8}), ${name}_fetch(base+${coff + 9}), ${name}_fetch(base+${coff + 10}), ${name}_fetch(base+${coff + 11}),
    ${name}_fetch(base+${coff + 12}), ${name}_fetch(base+${coff + 13}), ${name}_fetch(base+${coff + 14}), ${name}_fetch(base+${coff + 15})
  );`);
        }
      }
    }

    L.push("  return h;\n}\n");
    return L.join("\n");
  }
}

// --------------------------- Schema builder ---------------------------------
export class GPUStructSchemaBuilder {
  private _name: string;
  private fields: FieldDef[] = [];
  private built = false;

  constructor(name: string) {
    this._name = name;
  }

  public registerField(order: number, name: string, type: FieldType): this {
    if (this.built) {
      throw new Error("Schema already built");
    }
    this.fields.push({ order, name, type });
    return this;
  }

  public build(): GPUStructSchema {
    if (this.built) {
      throw new Error("Schema already built");
    }
    this.built = true;

    const sorted = this.fields
      .slice()
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    // Pack header as our own float layout (AoS), minimal alignment (can make 4 if desired)
    let fcursor = 0;
    for (const f of sorted) {
      if (isVarArray(f.type)) {
        continue;
      }
      if (isStructRef(f.type)) {
        const childSchema = (f.type as StructRef).structOf.getSchema();
        const size = childSchema.headerFloatCount;
        f.headerFloatOffset = roundUpFloats(fcursor, 1);
        f.headerFloatSize = size;
        fcursor = f.headerFloatOffset + size;
      } else {
        const size = floatStrideOf(f.type as any);
        f.headerFloatOffset = roundUpFloats(fcursor, 1);
        f.headerFloatSize = size;
        fcursor = f.headerFloatOffset + size;
      }
    }
    return new GPUStructSchema(this._name, sorted, fcursor);
  }
}

// --------------------------- Include registration ---------------------------
function setIncludeChunkFX(name: string, fx: string) {
  const Eff: any = BABYLON.Effect;
  const Store: any = BABYLON.ShaderStore;
  for (const s of [Eff?.IncludesShadersStore, Store?.IncludesShadersStore]) {
    if (s) {
      s[name] = fx;
    }
  }
  // Clear any stale WGSL includes for the same key
  for (const s of [
    Eff?.IncludesShadersStoreWGSL,
    Eff?.ShadersStoreWGSL?.IncludesShadersStore,
    Store?.IncludesShadersStoreWGSL,
    Store?.ShadersStoreWGSL?.IncludesShadersStore,
  ]) {
    if (s) {
      delete s[name];
    }
  }
}
export function registerIncludesOnEngine(schema: GPUStructSchema) {
  for (const f of schema.fields) {
    if (isStructRef(f.type)) {
      const child = (f.type as StructRef).structOf.getSchema();
      registerIncludesOnEngine(child);
    } else if (isVarArrayOfStruct(f.type)) {
      const child = (
        (f.type as VarArrayType).varOf as StructRef
      ).structOf.getSchema();
      registerIncludesOnEngine(child);
    }
  }
  const name = schema.name;
  setIncludeChunkFX(name, schema.emitHeaderStruct());
  setIncludeChunkFX(`${name}Storage`, schema.emitGLSLStorage(1, 12));
}

// ------------------------------ Decorators ----------------------------------
export interface GPUClassMeta {
  name?: string;
}
const CLASS_META_KEY = Symbol("gpu:classMeta");
const FIELD_META_KEY = Symbol("gpu:fieldMeta");
type PendingField = { order: number; name: string; type: FieldType };

export function gpuStruct(meta: GPUClassMeta = {}) {
  return function (ctor: any) {
    (Reflect as any).defineMetadata?.(CLASS_META_KEY, meta, ctor);
    (ctor as any)[CLASS_META_KEY] = meta;
  };
}
export function field(order: number, type: FieldType) {
  return function (target: any, propertyKey: string) {
    const ctor = target.constructor;
    const arr: PendingField[] =
      (Reflect as any).getMetadata?.(FIELD_META_KEY, ctor) ||
      (ctor[FIELD_META_KEY] ?? []);
    arr.push({ order, name: propertyKey, type });
    (Reflect as any).defineMetadata?.(FIELD_META_KEY, arr, ctor);
    ctor[FIELD_META_KEY] = arr;
  };
}
function readClassMeta(ctor: any): GPUClassMeta {
  return ((Reflect as any).getMetadata?.(CLASS_META_KEY, ctor) ||
    ctor[CLASS_META_KEY] ||
    {}) as GPUClassMeta;
}
function readFields(ctor: any): PendingField[] {
  return (
    ((Reflect as any).getMetadata?.(FIELD_META_KEY, ctor) ||
      ctor[FIELD_META_KEY] ||
      []) as PendingField[]
  ).slice();
}

// ----------------------------- Base class -----------------------------------
export interface StructRef {
  structOf: GPURecordCtor;
}

type DirtyEvent =
  | { kind: "header"; byteOffset?: number; byteLength?: number }
  | { kind: "var"; field: string; byteOffset?: number; byteLength?: number }
  | {
      kind: "struct-array";
      field: string;
      index?: number;
      byteOffset?: number;
      byteLength?: number;
    };

type DirtyHandler = (ev: DirtyEvent) => void;

type GPURecordCtor = typeof GPURecord & {
  getSchema(): GPUStructSchema;
  registerIncludes(): void;
};

function createEmbeddedProxy<T extends GPURecord>(
  parent: GPURecord,
  childCtor: { getSchema(): GPUStructSchema },
  baseFloatOffset: number,
): any {
  const schema = childCtor.getSchema();
  const view = new DataView(parent.headerRaw);
  const baseByte = baseFloatOffset * 4;

  const proxy: any = {};
  for (const f of schema.fields) {
    if (isVarArray(f.type)) {
      continue;
    } // header-only
    const offB = baseByte + f.headerFloatOffset! * 4;
    const szF = f.headerFloatSize!;
    if (isScalar(f.type as any)) {
      Object.defineProperty(proxy, f.name, {
        get: () => {
          switch (f.type) {
            case "f32":
              return view.getFloat32(offB, true);
            case "i32":
              return view.getInt32(offB, true);
            case "u32":
              return view.getUint32(offB, true);
            default:
              throw new Error(`Unsupported scalar type: ${f.type}`);
          }
        },
        set: (v: number) => {
          switch (f.type) {
            case "f32":
              view.setFloat32(offB, v, true);
              break;
            case "i32":
              view.setInt32(offB, v | 0, true);
              break;
            case "u32":
              view.setUint32(offB, v >>> 0, true);
              break;
            default:
              throw new Error(`Unsupported scalar type: ${f.type}`);
          }
          parent.emitHeaderDirty(offB, 4);
        },
        enumerable: true,
        configurable: true,
      });
    } else {
      const live = new Float32Array(parent.headerRaw, offB, szF);
      Object.defineProperty(proxy, f.name, {
        get: () => live,
        set: (arr: ArrayLike<number>) => {
          const L = Math.min(live.length, (arr as any).length ?? 0);
          for (let i = 0; i < L; i++) {
            live[i] = (arr as any)[i];
          }
          parent.emitHeaderDirty(offB, L * 4);
        },
        enumerable: true,
        configurable: true,
      });
    }
  }
  return proxy;
}

// ------------------------------- Backings -----------------------------------
class DataTexBacking implements GPUBacking {
  public kind: BackendKind = "datatex";

  private bufTex?: BJS.RawTexture;
  private bufWidth = 1;

  constructor(
    private engine: BJS.Engine,
    private schema: GPUStructSchema,
    private owner: GPURecord,
  ) {}

  commit() {
    const payload = this.owner.prepareUnifiedForUpload();
    if (!payload) {
      return;
    }

    const width = Math.max(1, payload.length);
    if (!this.bufTex || this.bufTex.getSize().width !== width) {
      this.bufTex?.dispose();
      this.bufTex = new BABYLON.RawTexture(
        payload.length ? payload : new Float32Array([0]),
        width,
        1,
        BABYLON.Engine.TEXTUREFORMAT_RED,
        this.engine,
        false,
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
        BABYLON.Engine.TEXTURETYPE_FLOAT,
      );
      this.bufTex.wrapU = this.bufTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    } else {
      this.bufTex.update(payload.length ? payload : new Float32Array([0]));
    }
    this.bufWidth = width;
  }

  bind(effect: BJS.Effect, includeName: string) {
    if (!this.bufTex) {
      return;
    } // nothing to bind yet
    const self = this.owner as any;
    const schema = this.schema;

    // resource + width
    effect.setTexture(`u${includeName}BufTex`, this.bufTex);
    effect.setInt(`u${includeName}BufTexWidth`, this.bufWidth);

    // header base
    effect.setInt(`u${includeName}HeaderBase`, self._headerSeg.offF | 0);

    // per-field bases/strides/counts
    for (const f of Object.keys(schema.varArrays)) {
      const seg: Segment = self._varSeg[f];
      const stride = schema.varArrays[f].floatStride;
      const count = Math.floor((seg?.lenF ?? 0) / stride);
      effect.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
      effect.setInt(`u${includeName}_${f}Stride`, stride | 0);
      effect.setInt(`u${includeName}_${f}Count`, count | 0);
    }
    for (const f of Object.keys(schema.structArrays)) {
      const seg: Segment = self._structSeg[f];
      const stride = schema.structArrays[f].schema.headerFloatCount;
      const count = (self._structArrayCount?.[f] as number) | 0;
      effect.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
      effect.setInt(`u${includeName}_${f}Stride`, stride | 0);
      effect.setInt(`u${includeName}_${f}Count`, count | 0);
    }
  }

  dispose() {
    this.bufTex?.dispose();
  }
}

class StorageBacking implements GPUBacking {
  public kind: BackendKind = "storage";

  private buf?: BJS.StorageBuffer;

  constructor(
    private engine: BJS.WebGPUEngine,
    private schema: GPUStructSchema,
    private owner: GPURecord,
  ) {}

  commit() {
    const payload = this.owner.prepareUnifiedForUpload();
    if (!payload) {
      return;
    }

    const needBytes = Math.max(16, payload.byteLength);
    const RW = BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE;

    if (!this.buf || (this.buf as any)._size < needBytes) {
      this.buf?.dispose();
      this.buf = new BABYLON.StorageBuffer(this.engine, needBytes, RW);
    }
    if (payload.byteLength) {
      this.buf!.update(payload.buffer as ArrayBuffer, 0, payload.byteLength);
    }
  }

  bind(effect: BJS.Effect, includeName: string) {
    if (!this.buf) {
      return;
    }
    const lname = lc(includeName);
    const schema = this.schema;
    const self = this.owner as any;

    // resource
    this.engine.setStorageBuffer(`${lname}Buf`, this.buf);

    // header base
    effect.setInt(`u${includeName}HeaderBase`, self._headerSeg.offF | 0);

    // per-field bases/strides/counts
    for (const f of Object.keys(schema.varArrays)) {
      const seg: Segment = self._varSeg[f];
      const stride = schema.varArrays[f].floatStride;
      const count = Math.floor((seg?.lenF ?? 0) / stride);
      effect.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
      effect.setInt(`u${includeName}_${f}Stride`, stride | 0);
      effect.setInt(`u${includeName}_${f}Count`, count | 0);
    }
    for (const f of Object.keys(schema.structArrays)) {
      const seg: Segment = self._structSeg[f];
      const stride = schema.structArrays[f].schema.headerFloatCount;
      const count = (self._structArrayCount?.[f] as number) | 0;
      effect.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
      effect.setInt(`u${includeName}_${f}Stride`, stride | 0);
      effect.setInt(`u${includeName}_${f}Count`, count | 0);
    }
  }

  dispose() {
    this.buf?.dispose();
  }
}

// ------------------------------- GPURecord ----------------------------------
export abstract class GPURecord {
  // CPU header storage; edited by live properties; copied into arena on commit
  public readonly headerRaw: ArrayBuffer;
  protected static schema?: GPUStructSchema;
  protected readonly _view: DataView;

  private _backing: GPUBacking;
  private _includeName: string;

  // Single arena & segments
  private _arena = new FloatArena();
  private _headerSeg: Segment = { offF: 0, lenF: 0, capF: 0 };
  private _varSeg: Record<string, Segment> = {};
  private _structSeg: Record<string, Segment> = {};

  private _structArrayCount: Record<string, number> = {};
  private _structArraySlots: Record<string, GPURecord[]> = {};
  private _structArrayUnsubs: Record<string, Array<() => void>> = {};

  private _dirtyHandlers?: DirtyHandler[];
  private _headerDirty = true; // headerRaw -> arena sync pending

  // ---- Dirty events API -----------------------------------------------------
  public onDirty(cb: DirtyHandler): () => void {
    (this._dirtyHandlers ??= []).push(cb);
    let alive = true;
    return () => {
      if (!alive) {
        return;
      }
      alive = false;
      const a = this._dirtyHandlers!;
      const i = a.indexOf(cb);
      if (i >= 0) {
        a.splice(i, 1);
      }
    };
  }
  public emitHeaderDirty(byteOffset?: number, byteLength?: number) {
    this._headerDirty = true;
    const a = this._dirtyHandlers;
    if (!a) {
      return;
    }
    const ev: DirtyEvent = { kind: "header", byteOffset, byteLength };
    for (let i = 0; i < a.length; i++) {
      a[i](ev);
    }
  }

  // ---- Schema introspection -------------------------------------------------
  public static shaderIO(engine: BJS.Engine): {
    uniforms: string[];
    samplers: string[];
  } {
    return (this as any).getSchema().materialIOFor(engine);
  }

  public static getSchema(this: GPURecordCtor): GPUStructSchema {
    if (this.schema) {
      return this.schema;
    }
    const meta = readClassMeta(this);
    const name = meta.name || this.name;
    const dec = readFields(this);
    if (!dec.length) {
      throw new Error(`No schema for ${name}. Decorate with @field().`);
    }
    const b = new GPUStructSchemaBuilder(name);
    for (const f of dec) {
      b.registerField(f.order, f.name, f.type);
    }
    this.schema = b.build();
    return this.schema;
  }

  public static registerIncludes(this: GPURecordCtor) {
    registerIncludesOnEngine(this.getSchema());
  }

  // ---- Public mutators ------------------------------------------------------

  /** Assign/resize a variable array. Data is copied into the record arena. */
  public setVarArray(field: string, data: Float32Array | number[]) {
    const ctor = this.constructor as GPURecordCtor;
    const schema = ctor.getSchema();
    const meta = schema.varArrays[field];
    if (!meta) {
      throw new Error(
        `'${field}' is not a variable array field on ${schema?.name}`,
      );
    }

    const src = data instanceof Float32Array ? data : new Float32Array(data);
    const seg =
      this._varSeg[field] ||
      (this._varSeg[field] = { offF: 0, lenF: 0, capF: 0 });

    // ensure segment capacity; repack if needed
    if (src.length > seg.capF) {
      this._repack({
        growVar: {
          field,
          newCapF: Math.max(src.length, Math.max(64, seg.capF * 2)),
        },
      });
    }
    // Write
    this._arena.write(seg.offF, src, src.length);
    seg.lenF = src.length;
  }

  /** Initialize a struct-array segment for N children per parent (single parent phase). */
  public initStructArray(
    field: string,
    countPerParent: number,
    childSchema: GPUStructSchema,
  ) {
    const strideF = childSchema.headerFloatCount;
    const needF = countPerParent * strideF;
    const seg =
      this._structSeg[field] ||
      (this._structSeg[field] = { offF: 0, lenF: 0, capF: 0 });
    if (needF > seg.capF) {
      this._repack({ growStruct: { field, newCapF: needF } });
    }
    seg.lenF = needF;
    this._structArrayCount[field] = countPerParent | 0;
    this._structArraySlots[field] = new Array(countPerParent);
    this._structArrayUnsubs[field] = new Array(countPerParent);
  }

  /** Bulk set a struct-array (copies child headers into the arena). */
  public setStructArray(
    field: string,
    items: GPURecord[],
    countPerParent: number,
  ) {
    const ctor = this.constructor as GPURecordCtor;
    const schema = ctor.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct array on ${schema.name}`);
    }

    const strideF = meta.schema.headerFloatCount;
    const totalF = items.length * strideF;

    const seg =
      this._structSeg[field] ||
      (this._structSeg[field] = { offF: 0, lenF: 0, capF: 0 });
    if (totalF > seg.capF) {
      this._repack({
        growStruct: {
          field,
          newCapF: Math.max(totalF, Math.max(strideF * 4, seg.capF * 2)),
        },
      });
    }

    let w = 0;
    for (const it of items) {
      const hdr = new Float32Array((it as any).headerRaw);
      this._arena.write(seg.offF + w, hdr, hdr.length);
      w += strideF;
    }
    seg.lenF = totalF;
    this._structArrayCount[field] = countPerParent | 0;
  }

  /** Bind/update a child into an existing struct-array slot with live propagation. */
  public bindStructArrayItem(
    field: string,
    index: number,
    child: GPURecord,
    childSchema?: GPUStructSchema,
  ) {
    const ctor = this.constructor as GPURecordCtor;
    const schema = ctor.getSchema();
    const meta = schema.structArrays[field];
    if (!meta) {
      throw new Error(`'${field}' is not a struct array on ${schema.name}`);
    }

    const strideF = (childSchema ?? meta.schema).headerFloatCount;
    const seg = this._structSeg[field];
    if (!seg) {
      throw new Error(
        `Call initStructArray('${field}', ...) or setStructArray(...) first`,
      );
    }

    const baseF = seg.offF + index * strideF;

    // initial copy
    const src = new Float32Array((child as any).headerRaw);
    this._arena.write(baseF, src, Math.min(src.length, strideF));

    // live subscribe (header-only updates)
    this._structArrayUnsubs[field]?.[index]?.();
    this._structArraySlots[field][index] = child;

    const unsub = child.onDirty((ev) => {
      if (ev.kind !== "header") {
        return;
      }
      const offB = ev.byteOffset ?? 0;
      const lenB = ev.byteLength ?? strideF * 4;
      const offF = offB >> 2;
      const lenF = lenB >> 2;
      const srcp = new Float32Array((child as any).headerRaw, offB, lenF);
      this._arena.write(baseF + offF, srcp, lenF);
    });
    this._structArrayUnsubs[field][index] = unsub;

    // logical length ensure
    seg.lenF = Math.max(seg.lenF, (index + 1) * strideF);
  }

  /** Upload + bind. Call before drawing. */
  public commitAndBind(effect: BJS.Effect) {
    this._backing.commit();
    this._backing.bind(effect, this._includeName);
  }

  public dispose() {
    this._backing.dispose();
  }

  // ----------------------------- ctor -----------------------------
  protected constructor(engine: BJS.Engine) {
    const ctor = this.constructor as GPURecordCtor;
    const schema = ctor.getSchema();
    this._includeName = schema.name;

    // CPU header buffer for live properties
    this.headerRaw = new ArrayBuffer(schema.headerFloatCount * 4);
    this._view = new DataView(this.headerRaw);

    // define live properties (header + embedded structs)
    for (const f of schema.fields) {
      if (isVarArray(f.type)) {
        continue;
      }

      if (isStructRef(f.type)) {
        const offFloats = f.headerFloatOffset ?? 0;
        const childCtor = (f.type as StructRef).structOf;
        const childProxy = createEmbeddedProxy(this, childCtor, offFloats);
        Object.defineProperty(this, f.name, {
          get: () => childProxy,
          set: (v) => {
            if (v && (v as any).headerRaw) {
              const src = new Float32Array((v as any).headerRaw);
              const dst = new Float32Array(
                this.headerRaw,
                offFloats * 4,
                src.length,
              );
              dst.set(src);
              this.emitHeaderDirty(offFloats * 4, src.length * 4);
            }
          },
          enumerable: true,
          configurable: true,
        });
        continue;
      }

      const offFloats = f.headerFloatOffset ?? 0;
      const sizeFloats = f.headerFloatSize ?? floatStrideOf(f.type as any);
      const offBytes = offFloats * 4;

      if (isScalar(f.type as any)) {
        Object.defineProperty(this, f.name, {
          configurable: true,
          enumerable: true,
          get: () => {
            switch (f.type) {
              case "f32":
                return this._view.getFloat32(offBytes, true);
              case "i32":
                return this._view.getInt32(offBytes, true);
              case "u32":
                return this._view.getUint32(offBytes, true);
              default:
                throw new Error(
                  `Unsupported type ${f.type} for field ${f.name}`,
                );
            }
          },
          set: (v: number) => {
            switch (f.type) {
              case "f32":
                this._view.setFloat32(offBytes, v, true);
                break;
              case "i32":
                this._view.setInt32(offBytes, v | 0, true);
                break;
              case "u32":
                this._view.setUint32(offBytes, v >>> 0, true);
                break;
              default:
                throw new Error(
                  `Unsupported type ${f.type} for field ${f.name}`,
                );
            }
            this.emitHeaderDirty(offBytes, 4);
          },
        });
      } else {
        const live = new Float32Array(this.headerRaw, offBytes, sizeFloats);
        Object.defineProperty(this, f.name, {
          configurable: true,
          enumerable: true,
          get: () => live,
          set: (arr: ArrayLike<number>) => {
            const L = Math.min(live.length, (arr as any).length ?? 0);
            for (let i = 0; i < L; i++) {
              live[i] = (arr as any)[i];
            }
            this.emitHeaderDirty(offBytes, L * 4);
          },
        });
      }
    }

    // Expose var-array accessors as views on the arena (new view each get())
    for (const field of Object.keys(schema.varArrays)) {
      this._varSeg[field] = { offF: 0, lenF: 0, capF: 0 };
      Object.defineProperty(this, field, {
        enumerable: true,
        configurable: true,
        get: () => {
          const seg = this._varSeg[field];
          if (!seg.capF) {
            return new Float32Array(0);
          }
          return this._arena.view(seg.offF, seg.lenF);
        },
        set: (v: Float32Array | number[]) => this.setVarArray(field, v),
      });
    }

    // Allocate header segment at front
    this._headerSeg = {
      offF: 0,
      lenF: schema.headerFloatCount,
      capF: schema.headerFloatCount,
    };
    this._ensureArenaLayout();

    // Choose backing
    const isWebGPU =
      (engine as any)._isWebGPU ||
      (engine as any).getClassName?.() === "WebGPUEngine";
    this._backing = isWebGPU
      ? new StorageBacking(engine as any as BJS.WebGPUEngine, schema, this)
      : new DataTexBacking(engine, schema, this);
  }

  // ---------------------- Arena + repacking internals ------------------------
  private _ensureArenaLayout() {
    // Pack: header + all current var segments + all struct segments (in declaration order)
    const schema = (this.constructor as GPURecordCtor).getSchema();

    type Entry = {
      kind: "header" | "var" | "struct";
      name?: string;
      seg: Segment;
      stride?: number;
    };
    const entries: Entry[] = [];

    entries.push({ kind: "header", seg: this._headerSeg });
    for (const name of Object.keys(schema.varArrays)) {
      entries.push({
        kind: "var",
        name,
        seg: (this._varSeg[name] ??= { offF: 0, lenF: 0, capF: 0 }),
        stride: schema.varArrays[name].floatStride,
      });
    }
    for (const name of Object.keys(schema.structArrays)) {
      entries.push({
        kind: "struct",
        name,
        seg: (this._structSeg[name] ??= { offF: 0, lenF: 0, capF: 0 }),
        stride: schema.structArrays[name].floatStride,
      });
    }

    // assign offsets linearly
    let cursor = 0;
    for (const e of entries) {
      e.seg.offF = cursor;
      cursor += e.seg.capF || 0;
    }
    // ensure capacity
    this._arena.ensureCapacity(cursor);
  }

  private _repack(opts?: {
    growVar?: { field: string; newCapF: number };
    growStruct?: { field: string; newCapF: number };
  }) {
    const schema = (this.constructor as GPURecordCtor).getSchema();

    // compute new caps in order
    const newHeaderCap = this._headerSeg.capF;

    const varFields = Object.keys(schema.varArrays);
    const structFields = Object.keys(schema.structArrays);

    const newVarCaps: Record<string, number> = {};
    for (const f of varFields) {
      const seg = (this._varSeg[f] ??= { offF: 0, lenF: 0, capF: 0 });
      let cap = seg.capF;
      if (opts?.growVar && opts.growVar.field === f) {
        cap = Math.max(cap, opts.growVar.newCapF);
      }
      newVarCaps[f] = Math.max(cap, seg.lenF);
    }
    const newStructCaps: Record<string, number> = {};
    for (const f of structFields) {
      const seg = (this._structSeg[f] ??= { offF: 0, lenF: 0, capF: 0 });
      let cap = seg.capF;
      if (opts?.growStruct && opts.growStruct.field === f) {
        cap = Math.max(cap, opts.growStruct.newCapF);
      }
      newStructCaps[f] = Math.max(cap, seg.lenF);
    }

    // new total
    let totalF = newHeaderCap;
    for (const f of varFields) {
      totalF += newVarCaps[f];
    }
    for (const f of structFields) {
      totalF += newStructCaps[f];
    }

    // build new buffer and copy existing contents
    const oldBuf = this._arena.take();
    const next = new Float32Array(Math.max(1, totalF));

    let cursor = 0;
    // header -> from headerRaw (authoritative)
    this._headerSeg.offF = cursor;
    this._headerSeg.capF = newHeaderCap;
    this._headerSeg.lenF = newHeaderCap;
    next.set(new Float32Array(this.headerRaw), cursor);
    cursor += newHeaderCap;

    // var fields
    for (const f of varFields) {
      const seg = this._varSeg[f];
      const newCap = newVarCaps[f];
      const oldSlice =
        seg.capF && seg.lenF
          ? oldBuf.subarray(seg.offF, seg.offF + seg.lenF)
          : undefined;

      seg.offF = cursor;
      seg.capF = newCap;
      // copy current data (not padding)
      if (oldSlice) {
        next.set(oldSlice, seg.offF);
      }
      cursor += newCap;
    }

    // struct fields
    for (const f of structFields) {
      const seg = this._structSeg[f];
      const newCap = newStructCaps[f];
      const oldSlice =
        seg.capF && seg.lenF
          ? oldBuf.subarray(seg.offF, seg.offF + seg.lenF)
          : undefined;

      seg.offF = cursor;
      seg.capF = newCap;
      if (oldSlice) {
        next.set(oldSlice, seg.offF);
      }
      cursor += newCap;
    }

    // adopt new buffer
    this._arena.adopt(next);
    // header is up-to-date in the arena now
    this._headerDirty = false;
  }

  /** Called by backings during commit. Copies header if needed and returns the whole float arena. */
  public prepareUnifiedForUpload(): Float32Array {
    // Ensure layout exists
    if (this._headerSeg.capF === 0) {
      const schema = (this.constructor as GPURecordCtor).getSchema();
      this._headerSeg = {
        offF: 0,
        lenF: schema.headerFloatCount,
        capF: schema.headerFloatCount,
      };
      this._ensureArenaLayout();
      this._headerDirty = true;
    }

    if (this._headerDirty) {
      // Make sure header slice exists, then copy headerRaw into arena
      this._arena.write(
        this._headerSeg.offF,
        new Float32Array(this.headerRaw),
        this._headerSeg.lenF,
      );
      this._headerDirty = false;
    }
    return this._arena.take();
  }
}
