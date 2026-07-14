import type { FieldDef } from '../types';
import { lc, toGLSLType, toWGSLType } from '../utils/glsl-wgsl';
import { floatStrideOf, isStructRef, isVarArray, resolveCtor } from '../utils/type-helpers';

export class ShadoStructSchema {
  public readonly name: string;
  public readonly fields: ReadonlyArray<FieldDef>;
  public readonly headerFloatCount: number;

  public readonly embeddedStructs: Record<
    string,
    {
      schema: ShadoStructSchema;
      headerFloatOffset: number;
      headerFloatSize: number;
    }
  > = {};
  public readonly structArrays: Record<
    string,
    { schema: ShadoStructSchema; floatStride: number; ctor: any }
  > = {};
  public readonly varArrays: Record<string, { elemType: any; floatStride: number }>;

  constructor(name: string, laidOut: FieldDef[], headerFloatCount: number) {
    this.name = name;
    this.fields = laidOut;
    this.headerFloatCount = headerFloatCount;

    this.varArrays = {};
    for (const f of laidOut) {
      if (isVarArray(f.type)) {
        const elem = (f.type as any).arrayOf;
        if (!isStructRef(elem)) {
          this.varArrays[f.name] = {
            elemType: elem,
            floatStride: floatStrideOf(elem),
          };
        }
      }
    }

    for (const f of laidOut) {
      if (isVarArray(f.type) && isStructRef((f.type as any).arrayOf)) {
        const childCtor = resolveCtor((f.type as any).arrayOf.structOf);
        const childSchema = childCtor.getSchema();
        (this as any).structArrays[f.name] = {
          schema: childSchema,
          floatStride: childSchema.headerFloatCount,
          ctor: childCtor,
        };
      } else if (isStructRef(f.type)) {
        const childCtor = resolveCtor(f.type.structOf);
        const childSchema = childCtor.getSchema();
        (this as any).embeddedStructs[f.name] = {
          schema: childSchema,
          headerFloatOffset: f.headerFloatOffset ?? 0,
          headerFloatSize: f.headerFloatSize ?? childSchema.headerFloatCount,
        };
      }
    }
  }

  public emitHeaderStructWGSL(): string {
    const name = this.name;
    const L: string[] = [];
    for (const f of this.fields) {
      if (isVarArray(f.type)) continue;
      if (isStructRef(f.type)) {
        const childCtor = resolveCtor(f.type.structOf);
        const childSchema = childCtor.getSchema();
        L.push(`  ${f.name}: ${childSchema.name}Header;`);
      } else {
        L.push(`  ${f.name}: ${toWGSLType(f.type as any)},`);
      }
    }
    if (!L.length) L.push('  _dummy: f32,');
    return `struct ${name}Header {\n${L.join('\n')}\n};`;
  }

  public emitOffsetsWGSL(): string {
    const name = this.name;
    const L: string[] = [];
    L.push(`const ${name}_STRIDE_F : i32 = ${this.headerFloatCount};`);
    for (const f of this.fields) {
      if (isVarArray(f.type)) continue;
      L.push(`const ${name}_${f.name}_OFF : i32 = ${f.headerFloatOffset ?? 0};`);
    }
    return L.join('\n');
  }

  public emitHeaderStruct(): string {
    const name = this.name;
    const L: string[] = [];
    for (const f of this.fields) {
      if (isVarArray(f.type)) continue;
      if (isStructRef(f.type)) {
        const childCtor = resolveCtor(f.type.structOf);
        const childSchema = childCtor.getSchema();
        L.push(`  ${childSchema.name}Header ${f.name};`);
      } else {
        L.push(`  ${toGLSLType(f.type as any)} ${f.name};`);
      }
    }
    if (!L.length) L.push('  float _dummy;');
    return `struct ${name}Header {\n${L.join('\n')}\n};`;
  }

  public emitOffsets(): string {
    const name = this.name;
    const L: string[] = [];
    L.push(`const int ${name}_STRIDE_F = ${this.headerFloatCount};`);
    for (const f of this.fields) {
      if (isVarArray(f.type)) continue;
      L.push(`const int ${name}_${f.name}_OFF = ${f.headerFloatOffset ?? 0};`);
    }
    return L.join('\n');
  }

  public emitGLSLStorage(group = 1, startBinding = 12): string {
    const name = this.name;
    const lname = lc(name);
    const headerFloats = this.headerFloatCount;
    const L: string[] = [];

    // ---------- Common: header struct ----------
    L.push(this.emitHeaderStruct());
    L.push(`const int ${name}_HEADER_FLOATS = ${headerFloats};\n`);

    // ---------- Single backing resource + fetch ----------
    L.push(`#ifdef WEBGPU_NEXT
layout(set = ${group}, binding = ${startBinding}) readonly buffer ${name}Buf { float data[]; } ${lname}Buf;
float ${name}_fetch(int i) { return ${lname}Buf.data[i]; }
// NOTE: On storage buffers we synthesize fetch4() from 4 scalar loads.
// (Still far fewer lines in the generated helpers; GPU may coalesce).
vec4 ${name}_fetch4(int i4) {
  return vec4(${name}_fetch(i4+0), ${name}_fetch(i4+1), ${name}_fetch(i4+2), ${name}_fetch(i4+3));
}
#else
uniform highp sampler2D u${name}BufTex;
uniform int u${name}BufTexWidth;   // width in TEXELS (not floats)

// Scalar read from RGBA32F at float index 'li'
float ${name}_fetch(int li) {
  int t = li >> 2;           // texel index
  int c = li & 3;            // channel 0..3
  int x = t % u${name}BufTexWidth;
  int y = t / u${name}BufTexWidth;
  vec4 v = texelFetch(u${name}BufTex, ivec2(x,y), 0);
  return c == 0 ? v.r : (c == 1 ? v.g : (c == 2 ? v.b : v.a));
}

// Aligned vec4 read: li4 MUST be a multiple of 4 (float index)
vec4 ${name}_fetch4(int li4) {
  int t = li4 >> 2;          // texel index
  int x = t % u${name}BufTexWidth;
  int y = t / u${name}BufTexWidth;
  return texelFetch(u${name}BufTex, ivec2(x,y), 0);
}
#endif
`);

    // ---------- Header base + helper ----------
    L.push(`uniform int u${name}HeaderBase;\n`);

    // ---------- Per-field Base/Stride/Count uniforms ----------
    for (const field of Object.keys(this.varArrays)) {
      L.push(
        `uniform int u${name}_${field}Base;`,
        `uniform int u${name}_${field}Stride;`,
        `uniform int u${name}_${field}Count;\n`
      );
    }
    for (const field of Object.keys(this.structArrays)) {
      const child = this.structArrays[field].schema;
      L.push(
        `uniform int u${name}_${field}Base;`,
        `uniform int u${name}_${field}Stride;  // = ${child.headerFloatCount}`,
        `uniform int u${name}_${field}Count;\n`
      );
    }

    // ---------- Var-array accessors (no 'rec') ----------
    for (const [field, meta] of Object.entries(this.varArrays)) {
      const t = meta.elemType;
      // scalar
      if (t === 'f32' || t === 'i32' || t === 'u32') {
        L.push(`
float ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return ${name}_fetch(base);
}
int ${name}_${field}_count() { return u${name}_${field}Count; }
`);
        continue;
      }

      // vector/matrix helpers use as few fetches as possible
      if (t === 'vec2') {
        L.push(`
vec2 ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  // stride may be 2; base may not be 4-aligned → use scalar fallback
  return vec2(${name}_fetch(base+0), ${name}_fetch(base+1));
}
int ${name}_${field}_count() { return u${name}_${field}Count; }
`);
      } else if (t === 'vec3') {
        L.push(`
vec3 ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  // layout is padded to 4 floats → one fetch4
  vec4 v = ${name}_fetch4(base);
  return v.xyz;
}
int ${name}_${field}_count() { return u${name}_${field}Count; }
`);
      } else if (t === 'vec4') {
        L.push(`
vec4 ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return ${name}_fetch4(base);
}
int ${name}_${field}_count() { return u${name}_${field}Count; }
`);
      } else if (t === 'mat2') {
        L.push(`
mat2 ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  vec4 v = ${name}_fetch4(base);            // [m00,m10,m01,m11] column-major
  return mat2(v.x, v.y, v.z, v.w);
}
int ${name}_${field}_count() { return u${name}_${field}Count; }
`);
      } else if (t === 'mat3') {
        L.push(`
mat3 ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  // three padded columns at +0, +4, +8
  vec4 c0 = ${name}_fetch4(base + 0);
  vec4 c1 = ${name}_fetch4(base + 4);
  vec4 c2 = ${name}_fetch4(base + 8);
  return mat3(c0.xyz, c1.xyz, c2.xyz);
}
int ${name}_${field}_count() { return u${name}_${field}Count; }
`);
      } else {
        // mat4
        L.push(`
mat4 ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  vec4 c0 = ${name}_fetch4(base + 0);
  vec4 c1 = ${name}_fetch4(base + 4);
  vec4 c2 = ${name}_fetch4(base + 8);
  vec4 c3 = ${name}_fetch4(base + 12);
  return mat4(c0, c1, c2, c3);              // column-major
}
int ${name}_${field}_count() { return u${name}_${field}Count; }
`);
      }
    }

    // ---------- Struct-array accessors (no 'rec') ----------
    for (const [field, meta] of Object.entries(this.structArrays)) {
      const child = meta.schema;
      L.push(`
${child.name}Header ${name}_${field}_get(int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  ${child.name}Header h;
`);
      for (const cf of child.fields) {
        if (isVarArray(cf.type)) continue;
        const off = cf.headerFloatOffset ?? 0;
        if (cf.type === 'f32') {
          L.push(`  h.${cf.name} = ${name}_fetch(base + ${off});`);
        } else if (cf.type === 'i32') {
          L.push(`  h.${cf.name} = int(${name}_fetch(base + ${off}));`);
        } else if (cf.type === 'u32') {
          L.push(`  h.${cf.name} = uint(${name}_fetch(base + ${off}));`);
        } else if (cf.type === 'vec2') {
          L.push(
            `  { vec2 v = vec2(${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1})); h.${cf.name} = v; }`
          );
        } else if (cf.type === 'vec3') {
          L.push(`  { vec4 v = ${name}_fetch4(base + ${off}); h.${cf.name} = v.xyz; }`);
        } else if (cf.type === 'vec4') {
          L.push(`  h.${cf.name} = ${name}_fetch4(base + ${off});`);
        } else if (cf.type === 'mat2') {
          L.push(
            `  { vec4 v = ${name}_fetch4(base + ${off}); h.${cf.name} = mat2(v.x, v.y, v.z, v.w); }`
          );
        } else if (cf.type === 'mat3') {
          L.push(`  { vec4 c0 = ${name}_fetch4(base + ${off + 0});
             vec4 c1 = ${name}_fetch4(base + ${off + 4});
             vec4 c2 = ${name}_fetch4(base + ${off + 8});
             h.${cf.name} = mat3(c0.xyz, c1.xyz, c2.xyz); }`);
        } else {
          // mat4
          L.push(`  { vec4 c0 = ${name}_fetch4(base + ${off + 0});
             vec4 c1 = ${name}_fetch4(base + ${off + 4});
             vec4 c2 = ${name}_fetch4(base + ${off + 8});
             vec4 c3 = ${name}_fetch4(base + ${off + 12});
             h.${cf.name} = mat4(c0, c1, c2, c3); }`);
        }
      }
      L.push(`  return h;\n}\n`);
      L.push(`int ${name}_${field}_count() { return u${name}_${field}Count; }\n`);
    }

    // ---------- Header loader (no 'rec') ----------
    L.push(`
${name}Header ${name}_loadHeader() {
  int base = u${name}HeaderBase;
  ${name}Header h;
`);
    for (const f of this.fields) {
      if (isVarArray(f.type)) continue;
      const off = f.headerFloatOffset ?? 0;
      if (f.type === 'f32') {
        L.push(`  h.${f.name} = ${name}_fetch(base + ${off});`);
      } else if (f.type === 'i32') {
        L.push(`  h.${f.name} = int(${name}_fetch(base + ${off}));`);
      } else if (f.type === 'u32') {
        L.push(`  h.${f.name} = uint(${name}_fetch(base + ${off}));`);
      } else if (f.type === 'vec2') {
        L.push(
          `  { vec2 v = vec2(${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1})); h.${f.name} = v; }`
        );
      } else if (f.type === 'vec3') {
        L.push(`  { vec4 v = ${name}_fetch4(base + ${off}); h.${f.name} = v.xyz; }`);
      } else if (f.type === 'vec4') {
        L.push(`  h.${f.name} = ${name}_fetch4(base + ${off});`);
      } else if (f.type === 'mat2') {
        L.push(
          `  { vec4 v = ${name}_fetch4(base + ${off}); h.${f.name} = mat2(v.x, v.y, v.z, v.w); }`
        );
      } else if (f.type === 'mat3') {
        L.push(`  { vec4 c0 = ${name}_fetch4(base + ${off + 0});
           vec4 c1 = ${name}_fetch4(base + ${off + 4});
           vec4 c2 = ${name}_fetch4(base + ${off + 8});
           h.${f.name} = mat3(c0.xyz, c1.xyz, c2.xyz); }`);
      } else {
        // mat4
        L.push(`  { vec4 c0 = ${name}_fetch4(base + ${off + 0});
           vec4 c1 = ${name}_fetch4(base + ${off + 4});
           vec4 c2 = ${name}_fetch4(base + ${off + 8});
           vec4 c3 = ${name}_fetch4(base + ${off + 12});
           h.${f.name} = mat4(c0, c1, c2, c3); }`);
      }
    }

    // Inline-load embedded children (within header stream)
    for (const f of this.fields) {
      if (!isStructRef(f.type)) continue;
      const off = f.headerFloatOffset ?? 0;
      const childCtor = resolveCtor(f.type.structOf);
      const child = childCtor.getSchema();
      for (const cf of child.fields) {
        if (isVarArray(cf.type)) continue;
        const coff = (cf.headerFloatOffset ?? 0) + off;
        if (cf.type === 'f32') {
          L.push(`  h.${f.name}.${cf.name} = ${name}_fetch(base + ${coff});`);
        } else if (cf.type === 'i32') {
          L.push(`  h.${f.name}.${cf.name} = int(${name}_fetch(base + ${coff}));`);
        } else if (cf.type === 'u32') {
          L.push(`  h.${f.name}.${cf.name} = uint(${name}_fetch(base + ${coff}));`);
        } else if (cf.type === 'vec2') {
          L.push(`  { vec2 v = vec2(${name}_fetch(base+${coff + 0}), ${name}_fetch(base+${coff + 1}));
              h.${f.name}.${cf.name} = v; }`);
        } else if (cf.type === 'vec3') {
          L.push(`  { vec4 v = ${name}_fetch4(base + ${coff});
              h.${f.name}.${cf.name} = v.xyz; }`);
        } else if (cf.type === 'vec4') {
          L.push(`  h.${f.name}.${cf.name} = ${name}_fetch4(base + ${coff});`);
        } else if (cf.type === 'mat2') {
          L.push(`  { vec4 v = ${name}_fetch4(base + ${coff});
              h.${f.name}.${cf.name} = mat2(v.x, v.y, v.z, v.w); }`);
        } else if (cf.type === 'mat3') {
          L.push(`  { vec4 c0 = ${name}_fetch4(base + ${coff + 0});
              vec4 c1 = ${name}_fetch4(base + ${coff + 4});
              vec4 c2 = ${name}_fetch4(base + ${coff + 8});
              h.${f.name}.${cf.name} = mat3(c0.xyz, c1.xyz, c2.xyz); }`);
        } else {
          // mat4
          L.push(`  { vec4 c0 = ${name}_fetch4(base + ${coff + 0});
              vec4 c1 = ${name}_fetch4(base + ${coff + 4});
              vec4 c2 = ${name}_fetch4(base + ${coff + 8});
              vec4 c3 = ${name}_fetch4(base + ${coff + 12});
              h.${f.name}.${cf.name} = mat4(c0, c1, c2, c3); }`);
        }
      }
    }
    L.push('  return h;\n}\n');

    return L.join('\n');
  }

  public emitWGSLStorage(): string {
    const name = this.name;
    const lname = lc(name);
    const header = this.emitHeaderStructWGSL();
    const offsets = this.emitOffsetsWGSL();
    const headerFloats = this.headerFloatCount;

    // Build a flat param table layout (int32) and remember indices.
    const paramNames: string[] = [];
    const push = (s: string) => {
      paramNames.push(s);
      return paramNames.length - 1;
    };

    const PI_HeaderBase = push('HeaderBase');
    const varIdx: Record<string, { Base: number; Stride: number; Count: number }> = {};
    for (const f of Object.keys(this.varArrays)) {
      varIdx[f] = {
        Base: push(`${f}Base`),
        Stride: push(`${f}Stride`),
        Count: push(`${f}Count`),
      };
    }
    const structIdx: Record<string, { Base: number; Stride: number; Count: number }> = {};
    for (const f of Object.keys(this.structArrays)) {
      structIdx[f] = {
        Base: push(`${f}Base`),
        Stride: push(`${f}Stride`),
        Count: push(`${f}Count`),
      };
    }
    // Build WGSL
    return `
${header}
const ${name}_HEADER_FLOATS : i32 = ${headerFloats};
${offsets}

// Arena (data) SSBO
var<storage, read> ${lname}Buf : array<f32>;
// Params SSBO (packed i32 per the indices below)
var<storage, read> ${lname}Params : array<i32>;

// Param indices (generated)
${[
  `const u${name}_HeaderBase_I : i32 = ${PI_HeaderBase};`,
  ...Object.entries(varIdx).flatMap(([f, i]) => [
    `const u${name}_${f}Base_I   : i32 = ${i.Base};`,
    `const u${name}_${f}Stride_I : i32 = ${i.Stride};`,
    `const u${name}_${f}Count_I  : i32 = ${i.Count};`,
  ]),
  ...Object.entries(structIdx).flatMap(([f, i]) => [
    `const u${name}_${f}Base_I   : i32 = ${i.Base};`,
    `const u${name}_${f}Stride_I : i32 = ${i.Stride};`,
    `const u${name}_${f}Count_I  : i32 = ${i.Count};`,
  ]),
].join('\n')}

// Low-level fetch from arena
fn ${name}_fetch(i:i32)->f32 { return ${lname}Buf[i]; }
fn ${name}_fetch4(i:i32)->vec4f {
  return vec4f(${lname}Buf[i+0], ${lname}Buf[i+1], ${lname}Buf[i+2], ${lname}Buf[i+3]);
}

// Param getters
fn u${name}_HeaderBase()->i32 { return ${lname}Params[u${name}_HeaderBase_I]; }

${Object.keys(this.varArrays)
  .map(
    f => `
fn u${name}_${f}Base()  -> i32 { return ${lname}Params[u${name}_${f}Base_I]; }
fn u${name}_${f}Stride()-> i32 { return ${lname}Params[u${name}_${f}Stride_I]; }
fn u${name}_${f}Count() -> i32 { return ${lname}Params[u${name}_${f}Count_I]; }
`
  )
  .join('')}

${Object.keys(this.structArrays)
  .map(
    f => `
fn u${name}_${f}Base()  -> i32 { return ${lname}Params[u${name}_${f}Base_I]; }
fn u${name}_${f}Stride()-> i32 { return ${lname}Params[u${name}_${f}Stride_I]; }
fn u${name}_${f}Count() -> i32 { return ${lname}Params[u${name}_${f}Count_I]; }
`
  )
  .join('')}

// Var-array getters (unchanged API, but pull bases/strides/counts from params SSBO)
${Object.entries(this.varArrays)
  .map(([field, meta]) => {
    const t = (meta as any).elemType;
    const base = `u${name}_${field}Base()`;
    const stride = `u${name}_${field}Stride()`;
    const count = `u${name}_${field}Count()`;
    if (t === 'f32')
      return `
fn ${name}_${field}_get(j:i32)->f32 {
  let b = ${base} + j * ${stride};
  return ${name}_fetch(b);
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
    if (t === 'i32' || t === 'u32')
      return `
fn ${name}_${field}_get(j:i32)->${t} {
  let b = ${base} + j * ${stride};
  return ${t}(${name}_fetch(b));
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
    if (t === 'vec2')
      return `
fn ${name}_${field}_get(j:i32)->vec2f {
  let b = ${base} + j * ${stride};
  return vec2f(${name}_fetch(b+0), ${name}_fetch(b+1));
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
    if (t === 'vec3')
      return `
fn ${name}_${field}_get(j:i32)->vec3f {
  let b = ${base} + j * ${stride};
  let v = ${name}_fetch4(b);
  return v.xyz;
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
    if (t === 'vec4')
      return `
fn ${name}_${field}_get(j:i32)->vec4f {
  let b = ${base} + j * ${stride};
  return ${name}_fetch4(b);
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
    if (t === 'mat2')
      return `
fn ${name}_${field}_get(j:i32)->mat2x2f {
  let b = ${base} + j * ${stride};
  let v = ${name}_fetch4(b);
  return mat2x2f(v.x, v.z, v.y, v.w);
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
    if (t === 'mat3')
      return `
fn ${name}_${field}_get(j:i32)->mat3x3f {
  let b = ${base} + j * ${stride};
  let c0 = ${name}_fetch4(b + 0);
  let c1 = ${name}_fetch4(b + 4);
  let c2 = ${name}_fetch4(b + 8);
  return mat3x3f(c0.xyz, c1.xyz, c2.xyz);
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
    return `
fn ${name}_${field}_get(j:i32)->mat4x4f {
  let b = ${base} + j * ${stride};
  let c0 = ${name}_fetch4(b + 0);
  let c1 = ${name}_fetch4(b + 4);
  let c2 = ${name}_fetch4(b + 8);
  let c3 = ${name}_fetch4(b + 12);
  return mat4x4f(c0, c1, c2, c3);
}
fn ${name}_${field}_count()->i32 { return ${count}; }`;
  })
  .join('\n')}

// Struct-array getters (same idea)
${Object.entries(this.structArrays)
  .map(([field, meta]) => {
    const child = meta.schema;
    return `
fn ${name}_${field}_get(j:i32)->${child.name}Header {
  let base = u${name}_${field}Base() + j * u${name}_${field}Stride();
  var h: ${child.name}Header;
${child.fields
  .filter(cf => !(cf as any).type?.arrayOf)
  .map(cf => {
    const off = cf.headerFloatOffset ?? 0;
    const dst = `h.${cf.name}`;
    if (cf.type === 'f32') return `  ${dst} = ${name}_fetch(base + ${off});`;
    if (cf.type === 'i32') return `  ${dst} = i32(${name}_fetch(base + ${off}));`;
    if (cf.type === 'u32') return `  ${dst} = u32(${name}_fetch(base + ${off}));`;
    if (cf.type === 'vec2')
      return `  ${dst} = vec2f(${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}));`;
    if (cf.type === 'vec3') return `  ${dst} = ${name}_fetch4(base + ${off}).xyz;`;
    if (cf.type === 'vec4') return `  ${dst} = ${name}_fetch4(base + ${off});`;
    if (cf.type === 'mat2')
      return `  ${dst} = mat2x2f(${name}_fetch4(base + ${off}).x, ${name}_fetch4(base + ${off}).z, ${name}_fetch4(base + ${off}).y, ${name}_fetch4(base + ${off}).w);`;
    if (cf.type === 'mat3')
      return `  ${dst} = mat3x3f(${name}_fetch4(base + ${off + 0}).xyz, ${name}_fetch4(base + ${off + 4}).xyz, ${name}_fetch4(base + ${off + 8}).xyz);`;
    return `  ${dst} = mat4x4f(${name}_fetch4(base + ${off + 0}), ${name}_fetch4(base + ${off + 4}), ${name}_fetch4(base + ${off + 8}), ${name}_fetch4(base + ${off + 12}));`;
  })
  .join('\n')}
  return h;
}
fn ${name}_${field}_count()->i32 { return u${name}_${field}Count(); }`;
  })
  .join('\n')}

// Header loader
fn ${name}_loadHeader()->${name}Header {
  let base = u${name}_HeaderBase();
  var h: ${name}Header;
${this.fields
  .filter(f => !isVarArray(f.type))
  .map(f => {
    const off = f.headerFloatOffset ?? 0;
    const dst = `h.${f.name}`;
    if (f.type === 'f32') return `  ${dst} = ${name}_fetch(base + ${off});`;
    if (f.type === 'i32') return `  ${dst} = i32(${name}_fetch(base + ${off}));`;
    if (f.type === 'u32') return `  ${dst} = u32(${name}_fetch(base + ${off}));`;
    if (f.type === 'vec2')
      return `  ${dst} = vec2f(${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}));`;
    if (f.type === 'vec3') return `  ${dst} = ${name}_fetch4(base + ${off}).xyz;`;
    if (f.type === 'vec4') return `  ${dst} = ${name}_fetch4(base + ${off});`;
    if (f.type === 'mat2')
      return `  ${dst} = mat2x2f(${name}_fetch4(base + ${off}).x, ${name}_fetch4(base + ${off}).z, ${name}_fetch4(base + ${off}).y, ${name}_fetch4(base + ${off}).w);`;
    if (f.type === 'mat3')
      return `  ${dst} = mat3x3f(${name}_fetch4(base + ${off + 0}).xyz, ${name}_fetch4(base + ${off + 4}).xyz, ${name}_fetch4(base + ${off + 8}).xyz);`;
    return `  ${dst} = mat4x4f(${name}_fetch4(base + ${off + 0}), ${name}_fetch4(base + ${off + 4}), ${name}_fetch4(base + ${off + 8}), ${name}_fetch4(base + ${off + 12}));`;
  })
  .join('\n')}
  return h;
}
`;
  }

  public debugShaderCode(engine: any): void {
    const isWebGPU = engine?._isWebGPU ?? engine?.getClassName?.() === 'WebGPUEngine';
    if (!isWebGPU) {
      console.log(this.emitHeaderStruct());
      console.log(this.emitGLSLStorage());
      console.log(this.emitOffsets());
    } else {
      console.log(this.emitHeaderStructWGSL());
      console.log(this.emitWGSLStorage());
      console.log(this.emitOffsetsWGSL());
    }
  }

  public materialIOFor(engine: any) {
    const isWebGPU = engine?._isWebGPU ?? engine?.getClassName?.() === 'WebGPUEngine';
    const name = this.name;

    const uniforms: string[] = [];
    const samplers: string[] = [];
    if (!isWebGPU) {
      samplers.push(`u${name}BufTex`);
      uniforms.push(`u${name}BufTexWidth`);
    }
    uniforms.push(`u${name}HeaderBase`);
    for (const field of Object.keys(this.varArrays)) {
      uniforms.push(`u${name}_${field}Base`, `u${name}_${field}Stride`, `u${name}_${field}Count`);
    }
    for (const field of Object.keys(this.structArrays)) {
      uniforms.push(`u${name}_${field}Base`, `u${name}_${field}Stride`, `u${name}_${field}Count`);
    }
    const uniq = (a: string[]) => [...new Set(a)];
    return { uniforms: uniq(uniforms), samplers: uniq(samplers) };
  }
}
