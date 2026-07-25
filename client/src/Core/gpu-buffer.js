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
import BABYLON from "@bjs";
// ------------------------------ Helpers ------------------------------------
function isVarArray(t) {
    return typeof t === "object" && !!t?.varOf;
}
function isStructRef(t) {
    return t && typeof t === "object" && "structOf" in t;
}
function isScalar(t) {
    return t === "f32" || t === "i32" || t === "u32";
}
function isVector(t) {
    return t === "vec2" || t === "vec3" || t === "vec4";
}
function isMatrix(t) {
    return t === "mat2" || t === "mat3" || t === "mat4";
}
function isVarArrayOfStruct(t) {
    return isVarArray(t) && isStructRef(t.varOf);
}
// floats per element in our packed representation
function floatStrideOf(t) {
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
    throw new Error(`Unknown type: ${t}`);
}
// glsl type names
function toGLSLType(t) {
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
            throw new Error(`Unknown type: ${t}`);
    }
}
function lc(s) {
    return s.charAt(0).toLowerCase() + s.slice(1);
}
function roundUpFloats(x, a) {
    return Math.ceil(x / a) * a;
}
class FloatArena {
    buf = new Float32Array(0);
    dirty = true;
    ensureCapacity(nextF) {
        if (nextF <= this.buf.length) {
            return;
        }
        const nextLen = Math.max(nextF, this.buf.length ? this.buf.length * 2 : 1024);
        const next = new Float32Array(nextLen);
        next.set(this.buf);
        this.buf = next;
        this.dirty = true;
    }
    write(offF, src, lenF = src.length) {
        this.ensureCapacity(offF + lenF);
        // @ts-ignore
        this.buf.set(src.subarray ? src.subarray(0, lenF) : src, offF);
        this.dirty = true;
    }
    view(offF, lenF) {
        return new Float32Array(this.buf.buffer, offF * 4, lenF);
    }
    take() {
        return this.buf;
    }
    isDirty() {
        return this.dirty;
    }
    markClean() {
        this.dirty = false;
    }
    adopt(newBuf) {
        this.buf = newBuf;
        this.dirty = true;
    }
}
// ------------------------------ Schema --------------------------------------
export class GPUStructSchema {
    name;
    fields;
    headerFloatCount;
    embeddedStructs = {};
    structArrays = {};
    // var arrays metadata: fieldName -> { elemType, floatStride }
    varArrays;
    constructor(name, laidOut, headerFloatCount) {
        this.name = name;
        this.fields = laidOut;
        this.headerFloatCount = headerFloatCount;
        this.varArrays = {};
        for (const f of laidOut) {
            if (isVarArray(f.type)) {
                const elem = f.type.varOf;
                if (!isStructRef(elem)) {
                    this.varArrays[f.name] = {
                        elemType: elem,
                        floatStride: floatStrideOf(elem),
                    };
                }
            }
        }
        for (const f of laidOut) {
            if (isVarArray(f.type) &&
                isStructRef(f.type.varOf)) {
                const child = f.type.varOf.structOf.getSchema();
                this.structArrays[f.name] = {
                    schema: child,
                    floatStride: child.headerFloatCount,
                };
            }
            else if (isStructRef(f.type)) {
                const child = f.type.structOf.getSchema();
                this.embeddedStructs[f.name] = {
                    schema: child,
                    headerFloatOffset: f.headerFloatOffset ?? 0,
                    headerFloatSize: f.headerFloatSize ?? child.headerFloatCount,
                };
            }
        }
    }
    materialIOFor(engine) {
        const isWebGPU = engine._isWebGPU ||
            engine.getClassName?.() === "WebGPUEngine";
        const name = this.name;
        const uniforms = [];
        const samplers = [];
        // Single backing resource: sampler only on WebGL
        if (!isWebGPU) {
            samplers.push(`u${name}BufTex`);
            uniforms.push(`u${name}BufTexWidth`);
        }
        // Header base
        uniforms.push(`u${name}HeaderBase`);
        // Per-field Base/Stride/Count uniforms
        for (const field of Object.keys(this.varArrays)) {
            uniforms.push(`u${name}_${field}Base`, `u${name}_${field}Stride`, `u${name}_${field}Count`);
        }
        for (const field of Object.keys(this.structArrays)) {
            uniforms.push(`u${name}_${field}Base`, `u${name}_${field}Stride`, `u${name}_${field}Count`);
        }
        const uniq = (a) => [...new Set(a)];
        return { uniforms: uniq(uniforms), samplers: uniq(samplers) };
    }
    // ---------------- Emission (GLSL) ----------------
    /** Header struct for both backends (name + "Header"). */
    emitHeaderStruct() {
        const name = this.name;
        const L = [];
        for (const f of this.fields) {
            if (isVarArray(f.type)) {
                continue;
            }
            if (isStructRef(f.type)) {
                const child = f.type.structOf.getSchema();
                L.push(`  ${child.name}Header ${f.name};`);
            }
            else {
                L.push(`  ${toGLSLType(f.type)} ${f.name};`);
            }
        }
        if (!L.length) {
            L.push("  float _dummy;");
        }
        return `struct ${name}Header {\n${L.join("\n")}\n};`;
    }
    /** GLSL include: single buffer fetch + helpers */
    emitGLSLStorage(group = 1, startBinding = 12) {
        const name = this.name;
        const lname = lc(name);
        const headerFloats = this.headerFloatCount;
        const L = [];
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
            const glslT = toGLSLType(t);
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
            }
            else if (t === "vec2") {
                L.push(`
${glslT} ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return vec2(${name}_fetch(base+0), ${name}_fetch(base+1));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
            }
            else if (t === "vec3") {
                L.push(`
${glslT} ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return vec3(${name}_fetch(base+0), ${name}_fetch(base+1), ${name}_fetch(base+2));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
            }
            else if (t === "vec4") {
                L.push(`
${glslT} ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return vec4(${name}_fetch(base+0), ${name}_fetch(base+1), ${name}_fetch(base+2), ${name}_fetch(base+3));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
            }
            else if (t === "mat2") {
                L.push(`
mat2 ${name}_${field}_get(int rec, int j) {
  int base = u${name}_${field}Base + j * u${name}_${field}Stride;
  return mat2(${name}_fetch(base+0), ${name}_fetch(base+1),
              ${name}_fetch(base+2), ${name}_fetch(base+3));
}
int ${name}_${field}_count(int rec) { return u${name}_${field}Count; }
`);
            }
            else if (t === "mat3") {
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
            }
            else {
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
            }
            else if (f.type === "i32") {
                L.push(`  h.${f.name} = int(${name}_fetch(base+${off}));`);
            }
            else if (f.type === "u32") {
                L.push(`  h.${f.name} = uint(${name}_fetch(base+${off}));`);
            }
            else if (f.type === "vec2") {
                L.push(`  h.${f.name} = vec2(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}));`);
            }
            else if (f.type === "vec3") {
                L.push(`  h.${f.name} = vec3(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}));`);
            }
            else if (f.type === "vec4") {
                L.push(`  h.${f.name} = vec4(${name}_fetch(base+${off}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}));`);
            }
            else if (f.type === "mat2") {
                L.push(`  h.${f.name} = mat2(${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}), ${name}_fetch(base+${off + 3}));`);
            }
            else if (f.type === "mat3") {
                L.push(`  h.${f.name} = mat3(
    ${name}_fetch(base+${off + 0}), ${name}_fetch(base+${off + 1}), ${name}_fetch(base+${off + 2}),
    ${name}_fetch(base+${off + 4}), ${name}_fetch(base+${off + 5}), ${name}_fetch(base+${off + 6}),
    ${name}_fetch(base+${off + 8}), ${name}_fetch(base+${off + 9}), ${name}_fetch(base+${off + 10})
  );`);
            }
            else {
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
            const child = f.type.structOf.getSchema();
            for (const cf of child.fields) {
                if (isVarArray(cf.type)) {
                    continue;
                }
                const coff = (cf.headerFloatOffset ?? 0) + off;
                if (cf.type === "f32") {
                    L.push(`  h.${f.name}.${cf.name} = ${name}_fetch(base+${coff});`);
                }
                else if (cf.type === "i32") {
                    L.push(`  h.${f.name}.${cf.name} = int(${name}_fetch(base+${coff}));`);
                }
                else if (cf.type === "u32") {
                    L.push(`  h.${f.name}.${cf.name} = uint(${name}_fetch(base+${coff}));`);
                }
                else if (cf.type === "vec2") {
                    L.push(`  h.${f.name}.${cf.name} = vec2(${name}_fetch(base+${coff}), ${name}_fetch(base+${coff + 1}));`);
                }
                else if (cf.type === "vec3") {
                    L.push(`  h.${f.name}.${cf.name} = vec3(${name}_fetch(base+${coff}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}));`);
                }
                else if (cf.type === "vec4") {
                    L.push(`  h.${f.name}.${cf.name} = vec4(${name}_fetch(base+${coff}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}), ${name}_fetch(base+${coff + 3}));`);
                }
                else if (cf.type === "mat2") {
                    L.push(`  h.${f.name}.${cf.name} = mat2(${name}_fetch(base+${coff + 0}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}), ${name}_fetch(base+${coff + 3}));`);
                }
                else if (cf.type === "mat3") {
                    L.push(`  h.${f.name}.${cf.name} = mat3(
    ${name}_fetch(base+${coff + 0}), ${name}_fetch(base+${coff + 1}), ${name}_fetch(base+${coff + 2}),
    ${name}_fetch(base+${coff + 4}), ${name}_fetch(base+${coff + 5}), ${name}_fetch(base+${coff + 6}),
    ${name}_fetch(base+${coff + 8}), ${name}_fetch(base+${coff + 9}), ${name}_fetch(base+${coff + 10})
  );`);
                }
                else {
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
    _name;
    fields = [];
    built = false;
    constructor(name) {
        this._name = name;
    }
    registerField(order, name, type) {
        if (this.built) {
            throw new Error("Schema already built");
        }
        this.fields.push({ order, name, type });
        return this;
    }
    build() {
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
                const childSchema = f.type.structOf.getSchema();
                const size = childSchema.headerFloatCount;
                f.headerFloatOffset = roundUpFloats(fcursor, 1);
                f.headerFloatSize = size;
                fcursor = f.headerFloatOffset + size;
            }
            else {
                const size = floatStrideOf(f.type);
                f.headerFloatOffset = roundUpFloats(fcursor, 1);
                f.headerFloatSize = size;
                fcursor = f.headerFloatOffset + size;
            }
        }
        return new GPUStructSchema(this._name, sorted, fcursor);
    }
}
// --------------------------- Include registration ---------------------------
function setIncludeChunkFX(name, fx) {
    const Eff = BABYLON.Effect;
    const Store = BABYLON.ShaderStore;
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
export function registerIncludesOnEngine(schema) {
    for (const f of schema.fields) {
        if (isStructRef(f.type)) {
            const child = f.type.structOf.getSchema();
            registerIncludesOnEngine(child);
        }
        else if (isVarArrayOfStruct(f.type)) {
            const child = f.type.varOf.structOf.getSchema();
            registerIncludesOnEngine(child);
        }
    }
    const name = schema.name;
    setIncludeChunkFX(name, schema.emitHeaderStruct());
    setIncludeChunkFX(`${name}Storage`, schema.emitGLSLStorage(1, 12));
}
const CLASS_META_KEY = Symbol("gpu:classMeta");
const FIELD_META_KEY = Symbol("gpu:fieldMeta");
export function gpuStruct(meta = {}) {
    return function (ctor) {
        Reflect.defineMetadata?.(CLASS_META_KEY, meta, ctor);
        ctor[CLASS_META_KEY] = meta;
    };
}
export function field(order, type) {
    return function (target, propertyKey) {
        const ctor = target.constructor;
        const arr = Reflect.getMetadata?.(FIELD_META_KEY, ctor) ||
            (ctor[FIELD_META_KEY] ?? []);
        arr.push({ order, name: propertyKey, type });
        Reflect.defineMetadata?.(FIELD_META_KEY, arr, ctor);
        ctor[FIELD_META_KEY] = arr;
    };
}
function readClassMeta(ctor) {
    return (Reflect.getMetadata?.(CLASS_META_KEY, ctor) ||
        ctor[CLASS_META_KEY] ||
        {});
}
function readFields(ctor) {
    return (Reflect.getMetadata?.(FIELD_META_KEY, ctor) ||
        ctor[FIELD_META_KEY] ||
        []).slice();
}
function createEmbeddedProxy(parent, childCtor, baseFloatOffset) {
    const schema = childCtor.getSchema();
    const view = new DataView(parent.headerRaw);
    const baseByte = baseFloatOffset * 4;
    const proxy = {};
    for (const f of schema.fields) {
        if (isVarArray(f.type)) {
            continue;
        } // header-only
        const offB = baseByte + f.headerFloatOffset * 4;
        const szF = f.headerFloatSize;
        if (isScalar(f.type)) {
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
                set: (v) => {
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
        }
        else {
            const live = new Float32Array(parent.headerRaw, offB, szF);
            Object.defineProperty(proxy, f.name, {
                get: () => live,
                set: (arr) => {
                    const L = Math.min(live.length, arr.length ?? 0);
                    for (let i = 0; i < L; i++) {
                        live[i] = arr[i];
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
class DataTexBacking {
    engine;
    schema;
    owner;
    kind = "datatex";
    bufTex;
    bufWidth = 1;
    constructor(engine, schema, owner) {
        this.engine = engine;
        this.schema = schema;
        this.owner = owner;
    }
    commit() {
        const payload = this.owner.prepareUnifiedForUpload();
        if (!payload) {
            return;
        }
        const width = Math.max(1, payload.length);
        if (!this.bufTex || this.bufTex.getSize().width !== width) {
            this.bufTex?.dispose();
            this.bufTex = new BABYLON.RawTexture(payload.length ? payload : new Float32Array([0]), width, 1, BABYLON.Engine.TEXTUREFORMAT_RED, this.engine, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, BABYLON.Engine.TEXTURETYPE_FLOAT);
            this.bufTex.wrapU = this.bufTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        }
        else {
            this.bufTex.update(payload.length ? payload : new Float32Array([0]));
        }
        this.bufWidth = width;
    }
    bind(effect, includeName) {
        if (!this.bufTex) {
            return;
        } // nothing to bind yet
        const self = this.owner;
        const schema = this.schema;
        // resource + width
        effect.setTexture(`u${includeName}BufTex`, this.bufTex);
        effect.setInt(`u${includeName}BufTexWidth`, this.bufWidth);
        // header base
        effect.setInt(`u${includeName}HeaderBase`, self._headerSeg.offF | 0);
        // per-field bases/strides/counts
        for (const f of Object.keys(schema.varArrays)) {
            const seg = self._varSeg[f];
            const stride = schema.varArrays[f].floatStride;
            const count = Math.floor((seg?.lenF ?? 0) / stride);
            effect.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
            effect.setInt(`u${includeName}_${f}Stride`, stride | 0);
            effect.setInt(`u${includeName}_${f}Count`, count | 0);
        }
        for (const f of Object.keys(schema.structArrays)) {
            const seg = self._structSeg[f];
            const stride = schema.structArrays[f].schema.headerFloatCount;
            const count = self._structArrayCount?.[f] | 0;
            effect.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
            effect.setInt(`u${includeName}_${f}Stride`, stride | 0);
            effect.setInt(`u${includeName}_${f}Count`, count | 0);
        }
    }
    dispose() {
        this.bufTex?.dispose();
    }
}
class StorageBacking {
    engine;
    schema;
    owner;
    kind = "storage";
    buf;
    constructor(engine, schema, owner) {
        this.engine = engine;
        this.schema = schema;
        this.owner = owner;
    }
    commit() {
        const payload = this.owner.prepareUnifiedForUpload();
        if (!payload) {
            return;
        }
        const needBytes = Math.max(16, payload.byteLength);
        const RW = BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE;
        if (!this.buf || this.buf._size < needBytes) {
            this.buf?.dispose();
            this.buf = new BABYLON.StorageBuffer(this.engine, needBytes, RW);
        }
        if (payload.byteLength) {
            this.buf.update(payload.buffer, 0, payload.byteLength);
        }
    }
    bind(effect, includeName) {
        if (!this.buf) {
            return;
        }
        const lname = lc(includeName);
        const schema = this.schema;
        const self = this.owner;
        // resource
        this.engine.setStorageBuffer(`${lname}Buf`, this.buf);
        // header base
        effect.setInt(`u${includeName}HeaderBase`, self._headerSeg.offF | 0);
        // per-field bases/strides/counts
        for (const f of Object.keys(schema.varArrays)) {
            const seg = self._varSeg[f];
            const stride = schema.varArrays[f].floatStride;
            const count = Math.floor((seg?.lenF ?? 0) / stride);
            effect.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
            effect.setInt(`u${includeName}_${f}Stride`, stride | 0);
            effect.setInt(`u${includeName}_${f}Count`, count | 0);
        }
        for (const f of Object.keys(schema.structArrays)) {
            const seg = self._structSeg[f];
            const stride = schema.structArrays[f].schema.headerFloatCount;
            const count = self._structArrayCount?.[f] | 0;
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
export class GPURecord {
    // CPU header storage; edited by live properties; copied into arena on commit
    headerRaw;
    static schema;
    _view;
    _backing;
    _includeName;
    // Single arena & segments
    _arena = new FloatArena();
    _headerSeg = { offF: 0, lenF: 0, capF: 0 };
    _varSeg = {};
    _structSeg = {};
    _structArrayCount = {};
    _structArraySlots = {};
    _structArrayUnsubs = {};
    _dirtyHandlers;
    _headerDirty = true; // headerRaw -> arena sync pending
    // ---- Dirty events API -----------------------------------------------------
    onDirty(cb) {
        (this._dirtyHandlers ??= []).push(cb);
        let alive = true;
        return () => {
            if (!alive) {
                return;
            }
            alive = false;
            const a = this._dirtyHandlers;
            const i = a.indexOf(cb);
            if (i >= 0) {
                a.splice(i, 1);
            }
        };
    }
    emitHeaderDirty(byteOffset, byteLength) {
        this._headerDirty = true;
        const a = this._dirtyHandlers;
        if (!a) {
            return;
        }
        const ev = { kind: "header", byteOffset, byteLength };
        for (let i = 0; i < a.length; i++) {
            a[i](ev);
        }
    }
    // ---- Schema introspection -------------------------------------------------
    static shaderIO(engine) {
        return this.getSchema().materialIOFor(engine);
    }
    static getSchema() {
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
    static registerIncludes() {
        registerIncludesOnEngine(this.getSchema());
    }
    // ---- Public mutators ------------------------------------------------------
    /** Assign/resize a variable array. Data is copied into the record arena. */
    setVarArray(field, data) {
        const ctor = this.constructor;
        const schema = ctor.getSchema();
        const meta = schema.varArrays[field];
        if (!meta) {
            throw new Error(`'${field}' is not a variable array field on ${schema?.name}`);
        }
        const src = data instanceof Float32Array ? data : new Float32Array(data);
        const seg = this._varSeg[field] ||
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
    initStructArray(field, countPerParent, childSchema) {
        const strideF = childSchema.headerFloatCount;
        const needF = countPerParent * strideF;
        const seg = this._structSeg[field] ||
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
    setStructArray(field, items, countPerParent) {
        const ctor = this.constructor;
        const schema = ctor.getSchema();
        const meta = schema.structArrays[field];
        if (!meta) {
            throw new Error(`'${field}' is not a struct array on ${schema.name}`);
        }
        const strideF = meta.schema.headerFloatCount;
        const totalF = items.length * strideF;
        const seg = this._structSeg[field] ||
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
            const hdr = new Float32Array(it.headerRaw);
            this._arena.write(seg.offF + w, hdr, hdr.length);
            w += strideF;
        }
        seg.lenF = totalF;
        this._structArrayCount[field] = countPerParent | 0;
    }
    /** Bind/update a child into an existing struct-array slot with live propagation. */
    bindStructArrayItem(field, index, child, childSchema) {
        const ctor = this.constructor;
        const schema = ctor.getSchema();
        const meta = schema.structArrays[field];
        if (!meta) {
            throw new Error(`'${field}' is not a struct array on ${schema.name}`);
        }
        const strideF = (childSchema ?? meta.schema).headerFloatCount;
        const seg = this._structSeg[field];
        if (!seg) {
            throw new Error(`Call initStructArray('${field}', ...) or setStructArray(...) first`);
        }
        const baseF = seg.offF + index * strideF;
        // initial copy
        const src = new Float32Array(child.headerRaw);
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
            const srcp = new Float32Array(child.headerRaw, offB, lenF);
            this._arena.write(baseF + offF, srcp, lenF);
        });
        this._structArrayUnsubs[field][index] = unsub;
        // logical length ensure
        seg.lenF = Math.max(seg.lenF, (index + 1) * strideF);
    }
    /** Upload + bind. Call before drawing. */
    commitAndBind(effect) {
        this._backing.commit();
        this._backing.bind(effect, this._includeName);
    }
    dispose() {
        this._backing.dispose();
    }
    // ----------------------------- ctor -----------------------------
    constructor(engine) {
        const ctor = this.constructor;
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
                const childCtor = f.type.structOf;
                const childProxy = createEmbeddedProxy(this, childCtor, offFloats);
                Object.defineProperty(this, f.name, {
                    get: () => childProxy,
                    set: (v) => {
                        if (v && v.headerRaw) {
                            const src = new Float32Array(v.headerRaw);
                            const dst = new Float32Array(this.headerRaw, offFloats * 4, src.length);
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
            const sizeFloats = f.headerFloatSize ?? floatStrideOf(f.type);
            const offBytes = offFloats * 4;
            if (isScalar(f.type)) {
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
                                throw new Error(`Unsupported type ${f.type} for field ${f.name}`);
                        }
                    },
                    set: (v) => {
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
                                throw new Error(`Unsupported type ${f.type} for field ${f.name}`);
                        }
                        this.emitHeaderDirty(offBytes, 4);
                    },
                });
            }
            else {
                const live = new Float32Array(this.headerRaw, offBytes, sizeFloats);
                Object.defineProperty(this, f.name, {
                    configurable: true,
                    enumerable: true,
                    get: () => live,
                    set: (arr) => {
                        const L = Math.min(live.length, arr.length ?? 0);
                        for (let i = 0; i < L; i++) {
                            live[i] = arr[i];
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
                set: (v) => this.setVarArray(field, v),
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
        const isWebGPU = engine._isWebGPU ||
            engine.getClassName?.() === "WebGPUEngine";
        this._backing = isWebGPU
            ? new StorageBacking(engine, schema, this)
            : new DataTexBacking(engine, schema, this);
    }
    // ---------------------- Arena + repacking internals ------------------------
    _ensureArenaLayout() {
        // Pack: header + all current var segments + all struct segments (in declaration order)
        const schema = this.constructor.getSchema();
        const entries = [];
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
    _repack(opts) {
        const schema = this.constructor.getSchema();
        // compute new caps in order
        const newHeaderCap = this._headerSeg.capF;
        const varFields = Object.keys(schema.varArrays);
        const structFields = Object.keys(schema.structArrays);
        const newVarCaps = {};
        for (const f of varFields) {
            const seg = (this._varSeg[f] ??= { offF: 0, lenF: 0, capF: 0 });
            let cap = seg.capF;
            if (opts?.growVar && opts.growVar.field === f) {
                cap = Math.max(cap, opts.growVar.newCapF);
            }
            newVarCaps[f] = Math.max(cap, seg.lenF);
        }
        const newStructCaps = {};
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
            const oldSlice = seg.capF && seg.lenF
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
            const oldSlice = seg.capF && seg.lenF
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
    prepareUnifiedForUpload() {
        // Ensure layout exists
        if (this._headerSeg.capF === 0) {
            const schema = this.constructor.getSchema();
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
            this._arena.write(this._headerSeg.offF, new Float32Array(this.headerRaw), this._headerSeg.lenF);
            this._headerDirty = false;
        }
        return this._arena.take();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3B1LWJ1ZmZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdwdS1idWZmZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEscUNBQXFDO0FBQ3JDLGdGQUFnRjtBQUNoRix3RUFBd0U7QUFDeEUsRUFBRTtBQUNGLHlDQUF5QztBQUN6Qyx1RkFBdUY7QUFDdkYsK0VBQStFO0FBQy9FLGdGQUFnRjtBQUNoRixpQ0FBaUM7QUFDakMsZ0ZBQWdGO0FBQ2hGLEVBQUU7QUFDRiwyRUFBMkU7QUFDM0UsZ0ZBQWdGO0FBR2hGLE9BQU8sT0FBTyxNQUFNLE1BQU0sQ0FBQztBQXdDM0IsOEVBQThFO0FBQzlFLFNBQVMsVUFBVSxDQUFDLENBQVk7SUFDOUIsT0FBTyxPQUFPLENBQUMsS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFFLENBQVMsRUFBRSxLQUFLLENBQUM7QUFDdEQsQ0FBQztBQUNELFNBQVMsV0FBVyxDQUFDLENBQU07SUFDekIsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEtBQUssUUFBUSxJQUFJLFVBQVUsSUFBSSxDQUFDLENBQUM7QUFDdkQsQ0FBQztBQUNELFNBQVMsUUFBUSxDQUFDLENBQU07SUFDdEIsT0FBTyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxLQUFLLEtBQUssQ0FBQztBQUNuRCxDQUFDO0FBQ0QsU0FBUyxRQUFRLENBQUMsQ0FBTTtJQUN0QixPQUFPLENBQUMsS0FBSyxNQUFNLElBQUksQ0FBQyxLQUFLLE1BQU0sSUFBSSxDQUFDLEtBQUssTUFBTSxDQUFDO0FBQ3RELENBQUM7QUFDRCxTQUFTLFFBQVEsQ0FBQyxDQUFNO0lBQ3RCLE9BQU8sQ0FBQyxLQUFLLE1BQU0sSUFBSSxDQUFDLEtBQUssTUFBTSxJQUFJLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDdEQsQ0FBQztBQUNELFNBQVMsa0JBQWtCLENBQUMsQ0FBWTtJQUN0QyxPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxX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QUFJLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQztRQUM1QixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzVCLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8vIGNvcmUvc3JjL2VuZ2luZS9ncHVTY2hlbWFCdWZmZXIudHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTaW5nbGUtYnVmZmVyIEdQVSBzdHJ1Y3Qgc2NoZW1hIHN5c3RlbSBmb3IgQmFieWxvbi5qcyAoV2ViR0wvV2ViR1BVKS5cbi8vXG4vLyBIaWdobGlnaHQgY2hhbmdlcyB2cyBwcmV2aW91cyB2ZXJzaW9uOlxuLy8gIC0gRVhBQ1RMWSBPTkUgR1BVIFJFU09VUkNFIFBFUiBSRUNPUkQgKHRleHR1cmUgb24gV2ViR0wsIHN0b3JhZ2UgYnVmZmVyIG9uIFdlYkdQVSkuXG4vLyAgLSBIZWFkZXIsIHZhci1hcnJheXMsIGFuZCBzdHJ1Y3QtYXJyYXkgaGVhZGVycyBhcmUgYWxsIHNsaWNlcyBvZiBvbmUgYXJlbmEuXG4vLyAgLSBTaGFkZXIgc2lkZTogb25lIGZldGNoIGZ1bmN0aW9uLCBwbHVzIEJhc2UvU3RyaWRlL0NvdW50IHVuaWZvcm1zIHBlciBmaWVsZFxuLy8gICAgYW5kIG9uZSBIZWFkZXJCYXNlIHVuaWZvcm0uXG4vLyAgLSBDUFUgc2lkZTogcGVyLXJlY29yZCBGbG9hdEFyZW5hIHdpdGggc2ltcGxlIHJlcGFja2VyIHdoZW4gc2VnbWVudHMgcmVzaXplLlxuLy9cbi8vIFVzYWdlOiBzYW1lIGRlY29yYXRvcnMvYnVpbGRlci4gQ2FsbCAuY29tbWl0QW5kQmluZChlZmZlY3QpIGJlZm9yZSBkcmF3LlxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW1wb3J0IHR5cGUgKiBhcyBCSlMgZnJvbSBcIkBiYWJ5bG9uanMvY29yZVwiO1xuaW1wb3J0IEJBQllMT04gZnJvbSBcIkBianNcIjtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gVHlwZXMgJiBMYXlvdXQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuZXhwb3J0IHR5cGUgU2NhbGFyVHlwZSA9IFwiZjMyXCIgfCBcImkzMlwiIHwgXCJ1MzJcIjtcbmV4cG9ydCB0eXBlIFZlY3RvclR5cGUgPSBcInZlYzJcIiB8IFwidmVjM1wiIHwgXCJ2ZWM0XCI7XG5leHBvcnQgdHlwZSBNYXRyaXhUeXBlID0gXCJtYXQyXCIgfCBcIm1hdDNcIiB8IFwibWF0NFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZhckFycmF5VHlwZSB7XG4gIHZhck9mOiBTY2FsYXJUeXBlIHwgVmVjdG9yVHlwZSB8IE1hdHJpeFR5cGUgfCBTdHJ1Y3RSZWY7XG59XG5cbmV4cG9ydCB0eXBlIEZpZWxkVHlwZSA9XG4gIHwgU2NhbGFyVHlwZVxuICB8IFZlY3RvclR5cGVcbiAgfCBNYXRyaXhUeXBlXG4gIHwgVmFyQXJyYXlUeXBlXG4gIHwgU3RydWN0UmVmO1xuXG50eXBlIEJhY2tlbmRLaW5kID0gXCJzdG9yYWdlXCIgfCBcImRhdGF0ZXhcIjtcblxuaW50ZXJmYWNlIEdQVUJhY2tpbmcge1xuICBraW5kOiBCYWNrZW5kS2luZDtcbiAgY29tbWl0KCk6IHZvaWQ7IC8vIFVwbG9hZCBDUFUgYXJlbmEgdG8gR1BVIGlmIGRpcnR5LlxuICBiaW5kKGVmZmVjdDogQkpTLkVmZmVjdCwgaW5jbHVkZU5hbWU6IHN0cmluZyk6IHZvaWQ7IC8vIEJpbmQgdGhlIHJlc291cmNlICsgdW5pZm9ybXMuXG4gIGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuLy8gU2NoZW1hIGZpZWxkIChubyBmaXhlZCBhcnJheXMpXG5leHBvcnQgaW50ZXJmYWNlIEZpZWxkRGVmIHtcbiAgb3JkZXI6IG51bWJlcjtcbiAgbmFtZTogc3RyaW5nO1xuICB0eXBlOiBGaWVsZFR5cGU7IC8vIHNjYWxhciB8IHZlY3RvciB8IG1hdHJpeCB8IHZhciBhcnJheSB8IGVtYmVkZGVkIHN0cnVjdFxuICBoZWFkZXJGbG9hdE9mZnNldD86IG51bWJlcjsgLy8gaW4gZmxvYXRzXG4gIGhlYWRlckZsb2F0U2l6ZT86IG51bWJlcjsgLy8gaW4gZmxvYXRzICh2ZWMzPTQsIG1hdDM9MTIpXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NoZW1hQnVpbGRPcHRpb25zIHtcbiAgYWxpZ25GbG9hdHM/OiAxIHwgMiB8IDQ7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuZnVuY3Rpb24gaXNWYXJBcnJheSh0OiBGaWVsZFR5cGUpOiB0IGlzIFZhckFycmF5VHlwZSB7XG4gIHJldHVybiB0eXBlb2YgdCA9PT0gXCJvYmplY3RcIiAmJiAhISh0IGFzIGFueSk/LnZhck9mO1xufVxuZnVuY3Rpb24gaXNTdHJ1Y3RSZWYodDogYW55KTogdCBpcyBTdHJ1Y3RSZWYge1xuICByZXR1cm4gdCAmJiB0eXBlb2YgdCA9PT0gXCJvYmplY3RcIiAmJiBcInN0cnVjdE9mXCIgaW4gdDtcbn1cbmZ1bmN0aW9uIGlzU2NhbGFyKHQ6IGFueSk6IHQgaXMgU2NhbGFyVHlwZSB7XG4gIHJldHVybiB0ID09PSBcImYzMlwiIHx8IHQgPT09IFwiaTMyXCIgfHwgdCA9PT0gXCJ1MzJcIjtcbn1cbmZ1bmN0aW9uIGlzVmVjdG9yKHQ6IGFueSk6IHQgaXMgVmVjdG9yVHlwZSB7XG4gIHJldHVybiB0ID09PSBcInZlYzJcIiB8fCB0ID09PSBcInZlYzNcIiB8fCB0ID09PSBcInZlYzRcIjtcbn1cbmZ1bmN0aW9uIGlzTWF0cml4KHQ6IGFueSk6IHQgaXMgTWF0cml4VHlwZSB7XG4gIHJldHVybiB0ID09PSBcIm1hdDJcIiB8fCB0ID09PSBcIm1hdDNcIiB8fCB0ID09PSBcIm1hdDRcIjtcbn1cbmZ1bmN0aW9uIGlzVmFyQXJyYXlPZlN0cnVjdCh0OiBGaWVsZFR5cGUpOiB0IGlzIFZhckFycmF5VHlwZSB7XG4gIHJldHVybiBpc1ZhckFycmF5KHQpICYmIGlzU3RydWN0UmVmKCh0IGFzIFZhckFycmF5VHlwZSkudmFyT2YgYXMgYW55KTtcbn1cblxuLy8gZmxvYXRzIHBlciBlbGVtZW50IGluIG91ciBwYWNrZWQgcmVwcmVzZW50YXRpb25cbmZ1bmN0aW9uIGZsb2F0U3RyaWRlT2YodDogU2NhbGFyVHlwZSB8IFZlY3RvclR5cGUgfCBNYXRyaXhUeXBlKTogbnVtYmVyIHtcbiAgaWYgKGlzU2NhbGFyKHQpKSB7XG4gICAgcmV0dXJuIDE7XG4gIH1cbiAgaWYgKHQgPT09IFwidmVjMlwiKSB7XG4gICAgcmV0dXJuIDI7XG4gIH1cbiAgaWYgKHQgPT09IFwidmVjM1wiKSB7XG4gICAgcmV0dXJuIDQ7XG4gIH0gLy8gcGFkZGVkIHRvIDRcbiAgaWYgKHQgPT09IFwidmVjNFwiKSB7XG4gICAgcmV0dXJuIDQ7XG4gIH1cbiAgaWYgKHQgPT09IFwibWF0MlwiKSB7XG4gICAgcmV0dXJuIDQ7XG4gIH0gLy8gMiBjb2x1bW5zICogdmVjMlxuICBpZiAodCA9PT0gXCJtYXQzXCIpIHtcbiAgICByZXR1cm4gMTI7XG4gIH0gLy8gMyBjb2x1bW5zICogcGFkZGVkIHZlYzNcbiAgaWYgKHQgPT09IFwibWF0NFwiKSB7XG4gICAgcmV0dXJuIDE2O1xuICB9IC8vIDQgY29sdW1ucyAqIHZlYzRcbiAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHR5cGU6ICR7dCBhcyBhbnl9YCk7XG59XG5cbi8vIGdsc2wgdHlwZSBuYW1lc1xuZnVuY3Rpb24gdG9HTFNMVHlwZSh0OiBTY2FsYXJUeXBlIHwgVmVjdG9yVHlwZSB8IE1hdHJpeFR5cGUpOiBzdHJpbmcge1xuICBzd2l0Y2ggKHQpIHtcbiAgICBjYXNlIFwiZjMyXCI6XG4gICAgICByZXR1cm4gXCJmbG9hdFwiO1xuICAgIGNhc2UgXCJpMzJcIjpcbiAgICAgIHJldHVybiBcImludFwiO1xuICAgIGNhc2UgXCJ1MzJcIjpcbiAgICAgIHJldHVybiBcInVpbnRcIjtcbiAgICBjYXNlIFwidmVjMlwiOlxuICAgICAgcmV0dXJuIFwidmVjMlwiO1xuICAgIGNhc2UgXCJ2ZWMzXCI6XG4gICAgICByZXR1cm4gXCJ2ZWMzXCI7XG4gICAgY2FzZSBcInZlYzRcIjpcbiAgICAgIHJldHVybiBcInZlYzRcIjtcbiAgICBjYXNlIFwibWF0MlwiOlxuICAgICAgcmV0dXJuIFwibWF0MlwiO1xuICAgIGNhc2UgXCJtYXQzXCI6XG4gICAgICByZXR1cm4gXCJtYXQzXCI7XG4gICAgY2FzZSBcIm1hdDRcIjpcbiAgICAgIHJldHVybiBcIm1hdDRcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHR5cGU6ICR7dCBhcyBhbnl9YCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbGMoczogc3RyaW5nKSB7XG4gIHJldHVybiBzLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgcy5zbGljZSgxKTtcbn1cbmZ1bmN0aW9uIHJvdW5kVXBGbG9hdHMoeDogbnVtYmVyLCBhOiBudW1iZXIpIHtcbiAgcmV0dXJuIE1hdGguY2VpbCh4IC8gYSkgKiBhO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gRmxvYXQgYXJlbmEgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuLy8gT25lIHBlciBHUFVSZWNvcmQuIFdlIGV4cG9zZSBhZG9wdCgpIHNvIHRoZSByZWNvcmQgY2FuIHJlcGFjay5cbi8vXG50eXBlIFNlZ21lbnQgPSB7IG9mZkY6IG51bWJlcjsgbGVuRjogbnVtYmVyOyBjYXBGOiBudW1iZXIgfTtcblxuY2xhc3MgRmxvYXRBcmVuYSB7XG4gIHByaXZhdGUgYnVmID0gbmV3IEZsb2F0MzJBcnJheSgwKTtcbiAgcHJpdmF0ZSBkaXJ0eSA9IHRydWU7XG5cbiAgZW5zdXJlQ2FwYWNpdHkobmV4dEY6IG51bWJlcikge1xuICAgIGlmIChuZXh0RiA8PSB0aGlzLmJ1Zi5sZW5ndGgpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbmV4dExlbiA9IE1hdGgubWF4KFxuICAgICAgbmV4dEYsXG4gICAgICB0aGlzLmJ1Zi5sZW5ndGggPyB0aGlzLmJ1Zi5sZW5ndGggKiAyIDogMTAyNCxcbiAgICApO1xuICAgIGNvbnN0IG5leHQgPSBuZXcgRmxvYXQzMkFycmF5KG5leHRMZW4pO1xuICAgIG5leHQuc2V0KHRoaXMuYnVmKTtcbiAgICB0aGlzLmJ1ZiA9IG5leHQ7XG4gICAgdGhpcy5kaXJ0eSA9IHRydWU7XG4gIH1cblxuICB3cml0ZShvZmZGOiBudW1iZXIsIHNyYzogQXJyYXlMaWtlPG51bWJlcj4sIGxlbkYgPSBzcmMubGVuZ3RoKSB7XG4gICAgdGhpcy5lbnN1cmVDYXBhY2l0eShvZmZGICsgbGVuRik7XG4gICAgLy8gQHRzLWlnbm9yZVxuICAgIHRoaXMuYnVmLnNldChcbiAgICAgIChzcmMgYXMgYW55KS5zdWJhcnJheSA/IChzcmMgYXMgYW55KS5zdWJhcnJheSgwLCBsZW5GKSA6IHNyYyxcbiAgICAgIG9mZkYsXG4gICAgKTtcbiAgICB0aGlzLmRpcnR5ID0gdHJ1ZTtcbiAgfVxuXG4gIHZpZXcob2ZmRjogbnVtYmVyLCBsZW5GOiBudW1iZXIpOiBGbG9hdDMyQXJyYXkge1xuICAgIHJldHVybiBuZXcgRmxvYXQzMkFycmF5KHRoaXMuYnVmLmJ1ZmZlciwgb2ZmRiAqIDQsIGxlbkYpO1xuICB9XG5cbiAgdGFrZSgpOiBGbG9hdDMyQXJyYXkge1xuICAgIHJldHVybiB0aGlzLmJ1ZjtcbiAgfVxuICBpc0RpcnR5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmRpcnR5O1xuICB9XG4gIG1hcmtDbGVhbigpIHtcbiAgICB0aGlzLmRpcnR5ID0gZmFsc2U7XG4gIH1cblxuICBhZG9wdChuZXdCdWY6IEZsb2F0MzJBcnJheTxBcnJheUJ1ZmZlcj4pIHtcbiAgICB0aGlzLmJ1ZiA9IG5ld0J1ZjtcbiAgICB0aGlzLmRpcnR5ID0gdHJ1ZTtcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gU2NoZW1hIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5leHBvcnQgY2xhc3MgR1BVU3RydWN0U2NoZW1hIHtcbiAgcHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IGZpZWxkczogUmVhZG9ubHlBcnJheTxGaWVsZERlZj47XG4gIHB1YmxpYyByZWFkb25seSBoZWFkZXJGbG9hdENvdW50OiBudW1iZXI7XG5cbiAgcHVibGljIHJlYWRvbmx5IGVtYmVkZGVkU3RydWN0czogUmVjb3JkPFxuICAgIHN0cmluZyxcbiAgICB7XG4gICAgICBzY2hlbWE6IEdQVVN0cnVjdFNjaGVtYTtcbiAgICAgIGhlYWRlckZsb2F0T2Zmc2V0OiBudW1iZXI7XG4gICAgICBoZWFkZXJGbG9hdFNpemU6IG51bWJlcjtcbiAgICB9XG4gID4gPSB7fTtcblxuICBwdWJsaWMgcmVhZG9ubHkgc3RydWN0QXJyYXlzOiBSZWNvcmQ8XG4gICAgc3RyaW5nLFxuICAgIHtcbiAgICAgIHNjaGVtYTogR1BVU3RydWN0U2NoZW1hO1xuICAgICAgZmxvYXRTdHJpZGU6IG51bWJlciAvKiBjaGlsZC5oZWFkZXJGbG9hdENvdW50ICovO1xuICAgIH1cbiAgPiA9IHt9O1xuXG4gIC8vIHZhciBhcnJheXMgbWV0YWRhdGE6IGZpZWxkTmFtZSAtPiB7IGVsZW1UeXBlLCBmbG9hdFN0cmlkZSB9XG4gIHB1YmxpYyByZWFkb25seSB2YXJBcnJheXM6IFJlY29yZDxcbiAgICBzdHJpbmcsXG4gICAgeyBlbGVtVHlwZTogU2NhbGFyVHlwZSB8IFZlY3RvclR5cGUgfCBNYXRyaXhUeXBlOyBmbG9hdFN0cmlkZTogbnVtYmVyIH1cbiAgPjtcblxuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGxhaWRPdXQ6IEZpZWxkRGVmW10sIGhlYWRlckZsb2F0Q291bnQ6IG51bWJlcikge1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5maWVsZHMgPSBsYWlkT3V0O1xuICAgIHRoaXMuaGVhZGVyRmxvYXRDb3VudCA9IGhlYWRlckZsb2F0Q291bnQ7XG5cbiAgICB0aGlzLnZhckFycmF5cyA9IHt9O1xuICAgIGZvciAoY29uc3QgZiBvZiBsYWlkT3V0KSB7XG4gICAgICBpZiAoaXNWYXJBcnJheShmLnR5cGUpKSB7XG4gICAgICAgIGNvbnN0IGVsZW0gPSAoZi50eXBlIGFzIFZhckFycmF5VHlwZSkudmFyT2YgYXMgYW55O1xuICAgICAgICBpZiAoIWlzU3RydWN0UmVmKGVsZW0pKSB7XG4gICAgICAgICAgdGhpcy52YXJBcnJheXNbZi5uYW1lXSA9IHtcbiAgICAgICAgICAgIGVsZW1UeXBlOiBlbGVtLFxuICAgICAgICAgICAgZmxvYXRTdHJpZGU6IGZsb2F0U3RyaWRlT2YoZWxlbSksXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZiBvZiBsYWlkT3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIGlzVmFyQXJyYXkoZi50eXBlKSAmJlxuICAgICAgICBpc1N0cnVjdFJlZigoZi50eXBlIGFzIFZhckFycmF5VHlwZSkudmFyT2YgYXMgYW55KVxuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gKFxuICAgICAgICAgIChmLnR5cGUgYXMgVmFyQXJyYXlUeXBlKS52YXJPZiBhcyBTdHJ1Y3RSZWZcbiAgICAgICAgKS5zdHJ1Y3RPZi5nZXRTY2hlbWEoKTtcbiAgICAgICAgKHRoaXMgYXMgYW55KS5zdHJ1Y3RBcnJheXNbZi5uYW1lXSA9IHtcbiAgICAgICAgICBzY2hlbWE6IGNoaWxkLFxuICAgICAgICAgIGZsb2F0U3RyaWRlOiBjaGlsZC5oZWFkZXJGbG9hdENvdW50LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChpc1N0cnVjdFJlZihmLnR5cGUpKSB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gKGYudHlwZSBhcyBTdHJ1Y3RSZWYpLnN0cnVjdE9mLmdldFNjaGVtYSgpO1xuICAgICAgICAodGhpcyBhcyBhbnkpLmVtYmVkZGVkU3RydWN0c1tmLm5hbWVdID0ge1xuICAgICAgICAgIHNjaGVtYTogY2hpbGQsXG4gICAgICAgICAgaGVhZGVyRmxvYXRPZmZzZXQ6IGYuaGVhZGVyRmxvYXRPZmZzZXQgPz8gMCxcbiAgICAgICAgICBoZWFkZXJGbG9hdFNpemU6IGYuaGVhZGVyRmxvYXRTaXplID8/IGNoaWxkLmhlYWRlckZsb2F0Q291bnQsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHVibGljIG1hdGVyaWFsSU9Gb3IoZW5naW5lOiBCSlMuRW5naW5lKSB7XG4gICAgY29uc3QgaXNXZWJHUFUgPVxuICAgICAgKGVuZ2luZSBhcyBhbnkpLl9pc1dlYkdQVSB8fFxuICAgICAgKGVuZ2luZSBhcyBhbnkpLmdldENsYXNzTmFtZT8uKCkgPT09IFwiV2ViR1BVRW5naW5lXCI7XG4gICAgY29uc3QgbmFtZSA9IHRoaXMubmFtZTtcblxuICAgIGNvbnN0IHVuaWZvcm1zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHNhbXBsZXJzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gU2luZ2xlIGJhY2tpbmcgcmVzb3VyY2U6IHNhbXBsZXIgb25seSBvbiBXZWJHTFxuICAgIGlmICghaXNXZWJHUFUpIHtcbiAgICAgIHNhbXBsZXJzLnB1c2goYHUke25hbWV9QnVmVGV4YCk7XG4gICAgICB1bmlmb3Jtcy5wdXNoKGB1JHtuYW1lfUJ1ZlRleFdpZHRoYCk7XG4gICAgfVxuXG4gICAgLy8gSGVhZGVyIGJhc2VcbiAgICB1bmlmb3Jtcy5wdXNoKGB1JHtuYW1lfUhlYWRlckJhc2VgKTtcblxuICAgIC8vIFBlci1maWVsZCBCYXNlL1N0cmlkZS9Db3VudCB1bmlmb3Jtc1xuICAgIGZvciAoY29uc3QgZmllbGQgb2YgT2JqZWN0LmtleXModGhpcy52YXJBcnJheXMpKSB7XG4gICAgICB1bmlmb3Jtcy5wdXNoKFxuICAgICAgICBgdSR7bmFtZX1fJHtmaWVsZH1CYXNlYCxcbiAgICAgICAgYHUke25hbWV9XyR7ZmllbGR9U3RyaWRlYCxcbiAgICAgICAgYHUke25hbWV9XyR7ZmllbGR9Q291bnRgLFxuICAgICAgKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBPYmplY3Qua2V5cyh0aGlzLnN0cnVjdEFycmF5cykpIHtcbiAgICAgIHVuaWZvcm1zLnB1c2goXG4gICAgICAgIGB1JHtuYW1lfV8ke2ZpZWxkfUJhc2VgLFxuICAgICAgICBgdSR7bmFtZX1fJHtmaWVsZH1TdHJpZGVgLFxuICAgICAgICBgdSR7bmFtZX1fJHtmaWVsZH1Db3VudGAsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHVuaXEgPSAoYTogc3RyaW5nW10pID0+IFsuLi5uZXcgU2V0KGEpXTtcbiAgICByZXR1cm4geyB1bmlmb3JtczogdW5pcSh1bmlmb3JtcyksIHNhbXBsZXJzOiB1bmlxKHNhbXBsZXJzKSB9O1xuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLSBFbWlzc2lvbiAoR0xTTCkgLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8qKiBIZWFkZXIgc3RydWN0IGZvciBib3RoIGJhY2tlbmRzIChuYW1lICsgXCJIZWFkZXJcIikuICovXG4gIHB1YmxpYyBlbWl0SGVhZGVyU3RydWN0KCk6IHN0cmluZyB7XG4gICAgY29uc3QgbmFtZSA9IHRoaXMubmFtZTtcbiAgICBjb25zdCBMOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgZiBvZiB0aGlzLmZpZWxkcykge1xuICAgICAgaWYgKGlzVmFyQXJyYXkoZi50eXBlKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChpc1N0cnVjdFJlZihmLnR5cGUpKSB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gKGYudHlwZSBhcyBTdHJ1Y3RSZWYpLnN0cnVjdE9mLmdldFNjaGVtYSgpO1xuICAgICAgICBMLnB1c2goYCAgJHtjaGlsZC5uYW1lfUhlYWRlciAke2YubmFtZX07YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBMLnB1c2goYCAgJHt0b0dMU0xUeXBlKGYudHlwZSBhcyBhbnkpfSAke2YubmFtZX07YCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghTC5sZW5ndGgpIHtcbiAgICAgIEwucHVzaChcIiAgZmxvYXQgX2R1bW15O1wiKTtcbiAgICB9XG4gICAgcmV0dXJuIGBzdHJ1Y3QgJHtuYW1lfUhlYWRlciB7XFxuJHtMLmpvaW4oXCJcXG5cIil9XFxufTtgO1xuICB9XG5cbiAgLyoqIEdMU0wgaW5jbHVkZTogc2luZ2xlIGJ1ZmZlciBmZXRjaCArIGhlbHBlcnMgKi9cbiAgcHVibGljIGVtaXRHTFNMU3RvcmFnZShncm91cCA9IDEsIHN0YXJ0QmluZGluZyA9IDEyKTogc3RyaW5nIHtcbiAgICBjb25zdCBuYW1lID0gdGhpcy5uYW1lO1xuICAgIGNvbnN0IGxuYW1lID0gbGMobmFtZSk7XG4gICAgY29uc3QgaGVhZGVyRmxvYXRzID0gdGhpcy5oZWFkZXJGbG9hdENvdW50O1xuICAgIGNvbnN0IEw6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyAtLS0tLS0tLS0tIENvbW1vbjogaGVhZGVyIHN0cnVjdCAtLS0tLS0tLS0tXG4gICAgTC5wdXNoKHRoaXMuZW1pdEhlYWRlclN0cnVjdCgpKTtcbiAgICBMLnB1c2goYGNvbnN0IGludCAke25hbWV9X0hFQURFUl9GTE9BVFMgPSAke2hlYWRlckZsb2F0c307XFxuYCk7XG5cbiAgICAvLyAtLS0tLS0tLS0tIFNpbmdsZSBiYWNraW5nIHJlc291cmNlICsgZmV0Y2ggLS0tLS0tLS0tLVxuICAgIEwucHVzaChgI2lmZGVmIFdFQkdQVVxubGF5b3V0KHNldCA9ICR7Z3JvdXB9LCBiaW5kaW5nID0gJHtzdGFydEJpbmRpbmd9KSByZWFkb25seSBidWZmZXIgJHtuYW1lfUJ1ZiB7IGZsb2F0IGRhdGFbXTsgfSAke2xuYW1lfUJ1ZjtcbmZsb2F0ICR7bmFtZX1fZmV0Y2goaW50IGkpIHsgcmV0dXJuICR7bG5hbWV9QnVmLmRhdGFbaV07IH1cbiNlbHNlXG51bmlmb3JtIGhpZ2hwIHNhbXBsZXIyRCB1JHtuYW1lfUJ1ZlRleDtcbnVuaWZvcm0gaW50IHUke25hbWV9QnVmVGV4V2lkdGg7XG5mbG9hdCAke25hbWV9X2ZldGNoKGludCBsaSkge1xuICBpbnQgeCA9IGxpICUgdSR7bmFtZX1CdWZUZXhXaWR0aDtcbiAgaW50IHkgPSBsaSAvIHUke25hbWV9QnVmVGV4V2lkdGg7XG4gIHJldHVybiB0ZXhlbEZldGNoKHUke25hbWV9QnVmVGV4LCBpdmVjMih4LHkpLCAwKS5yO1xufVxuI2VuZGlmXG5gKTtcblxuICAgIC8vIC0tLS0tLS0tLS0gSGVhZGVyIGJhc2UgKyBoZWxwZXIgLS0tLS0tLS0tLVxuICAgIEwucHVzaChgdW5pZm9ybSBpbnQgdSR7bmFtZX1IZWFkZXJCYXNlO1xuZmxvYXQgJHtuYW1lfV9oZmV0Y2goaW50IGkpIHsgcmV0dXJuICR7bmFtZX1fZmV0Y2godSR7bmFtZX1IZWFkZXJCYXNlICsgaSk7IH1cbmApO1xuXG4gICAgLy8gLS0tLS0tLS0tLSBWYXItYXJyYXkgYWNjZXNzb3JzIC0tLS0tLS0tLS1cbiAgICBmb3IgKGNvbnN0IFtmaWVsZCwgbWV0YV0gb2YgT2JqZWN0LmVudHJpZXModGhpcy52YXJBcnJheXMpKSB7XG4gICAgICBjb25zdCB0ID0gbWV0YS5lbGVtVHlwZTtcbiAgICAgIGNvbnN0IGdsc2xUID0gdG9HTFNMVHlwZSh0IGFzIGFueSk7XG4gICAgICBMLnB1c2goYHVuaWZvcm0gaW50IHUke25hbWV9XyR7ZmllbGR9QmFzZTtcbnVuaWZvcm0gaW50IHUke25hbWV9XyR7ZmllbGR9U3RyaWRlO1xudW5pZm9ybSBpbnQgdSR7bmFtZX1fJHtmaWVsZH1Db3VudDtcbmApO1xuICAgICAgaWYgKHQgPT09IFwiZjMyXCIgfHwgdCA9PT0gXCJpMzJcIiB8fCB0ID09PSBcInUzMlwiKSB7XG4gICAgICAgIEwucHVzaChgXG5mbG9hdCAke25hbWV9XyR7ZmllbGR9X2dldChpbnQgcmVjLCBpbnQgaikge1xuICBpbnQgYmFzZSA9IHUke25hbWV9XyR7ZmllbGR9QmFzZSArIGogKiB1JHtuYW1lfV8ke2ZpZWxkfVN0cmlkZTtcbiAgcmV0dXJuICR7bmFtZX1fZmV0Y2goYmFzZSk7XG59XG5pbnQgJHtuYW1lfV8ke2ZpZWxkfV9jb3VudChpbnQgcmVjKSB7IHJldHVybiB1JHtuYW1lfV8ke2ZpZWxkfUNvdW50OyB9XG5gKTtcbiAgICAgIH0gZWxzZSBpZiAodCA9PT0gXCJ2ZWMyXCIpIHtcbiAgICAgICAgTC5wdXNoKGBcbiR7Z2xzbFR9ICR7bmFtZX1fJHtmaWVsZH1fZ2V0KGludCByZWMsIGludCBqKSB7XG4gIGludCBiYXNlID0gdSR7bmFtZX1fJHtmaWVsZH1CYXNlICsgaiAqIHUke25hbWV9XyR7ZmllbGR9U3RyaWRlO1xuICByZXR1cm4gdmVjMigke25hbWV9X2ZldGNoKGJhc2UrMCksICR7bmFtZX1fZmV0Y2goYmFzZSsxKSk7XG59XG5pbnQgJHtuYW1lfV8ke2ZpZWxkfV9jb3VudChpbnQgcmVjKSB7IHJldHVybiB1JHtuYW1lfV8ke2ZpZWxkfUNvdW50OyB9XG5gKTtcbiAgICAgIH0gZWxzZSBpZiAodCA9PT0gXCJ2ZWMzXCIpIHtcbiAgICAgICAgTC5wdXNoKGBcbiR7Z2xzbFR9ICR7bmFtZX1fJHtmaWVsZH1fZ2V0KGludCByZWMsIGludCBqKSB7XG4gIGludCBiYXNlID0gdSR7bmFtZX1fJHtmaWVsZH1CYXNlICsgaiAqIHUke25hbWV9XyR7ZmllbGR9U3RyaWRlO1xuICByZXR1cm4gdmVjMygke25hbWV9X2ZldGNoKGJhc2UrMCksICR7bmFtZX1fZmV0Y2goYmFzZSsxKSwgJHtuYW1lfV9mZXRjaChiYXNlKzIpKTtcbn1cbmludCAke25hbWV9XyR7ZmllbGR9X2NvdW50KGludCByZWMpIHsgcmV0dXJuIHUke25hbWV9XyR7ZmllbGR9Q291bnQ7IH1cbmApO1xuICAgICAgfSBlbHNlIGlmICh0ID09PSBcInZlYzRcIikge1xuICAgICAgICBMLnB1c2goYFxuJHtnbHNsVH0gJHtuYW1lfV8ke2ZpZWxkfV9nZXQoaW50IHJlYywgaW50IGopIHtcbiAgaW50IGJhc2UgPSB1JHtuYW1lfV8ke2ZpZWxkfUJhc2UgKyBqICogdSR7bmFtZX1fJHtmaWVsZH1TdHJpZGU7XG4gIHJldHVybiB2ZWM0KCR7bmFtZX1fZmV0Y2goYmFzZSswKSwgJHtuYW1lfV9mZXRjaChiYXNlKzEpLCAke25hbWV9X2ZldGNoKGJhc2UrMiksICR7bmFtZX1fZmV0Y2goYmFzZSszKSk7XG59XG5pbnQgJHtuYW1lfV8ke2ZpZWxkfV9jb3VudChpbnQgcmVjKSB7IHJldHVybiB1JHtuYW1lfV8ke2ZpZWxkfUNvdW50OyB9XG5gKTtcbiAgICAgIH0gZWxzZSBpZiAodCA9PT0gXCJtYXQyXCIpIHtcbiAgICAgICAgTC5wdXNoKGBcbm1hdDIgJHtuYW1lfV8ke2ZpZWxkfV9nZXQoaW50IHJlYywgaW50IGopIHtcbiAgaW50IGJhc2UgPSB1JHtuYW1lfV8ke2ZpZWxkfUJhc2UgKyBqICogdSR7bmFtZX1fJHtmaWVsZH1TdHJpZGU7XG4gIHJldHVybiBtYXQyKCR7bmFtZX1fZmV0Y2goYmFzZSswKSwgJHtuYW1lfV9mZXRjaChiYXNlKzEpLFxuICAgICAgICAgICAgICAke25hbWV9X2ZldGNoKGJhc2UrMiksICR7bmFtZX1fZmV0Y2goYmFzZSszKSk7XG59XG5pbnQgJHtuYW1lfV8ke2ZpZWxkfV9jb3VudChpbnQgcmVjKSB7IHJldHVybiB1JHtuYW1lfV8ke2ZpZWxkfUNvdW50OyB9XG5gKTtcbiAgICAgIH0gZWxzZSBpZiAodCA9PT0gXCJtYXQzXCIpIHtcbiAgICAgICAgTC5wdXNoKGBcbm1hdDMgJHtuYW1lfV8ke2ZpZWxkfV9nZXQoaW50IHJlYywgaW50IGopIHtcbiAgaW50IGJhc2UgPSB1JHtuYW1lfV8ke2ZpZWxkfUJhc2UgKyBqICogdSR7bmFtZX1fJHtmaWVsZH1TdHJpZGU7XG4gIHJldHVybiBtYXQzKFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSswKSwgJHtuYW1lfV9mZXRjaChiYXNlKzEpLCAke25hbWV9X2ZldGNoKGJhc2UrMiksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKzQpLCAke25hbWV9X2ZldGNoKGJhc2UrNSksICR7bmFtZX1fZmV0Y2goYmFzZSs2KSxcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrOCksICR7bmFtZX1fZmV0Y2goYmFzZSs5KSwgJHtuYW1lfV9mZXRjaChiYXNlKzEwKVxuICApO1xufVxuaW50ICR7bmFtZX1fJHtmaWVsZH1fY291bnQoaW50IHJlYykgeyByZXR1cm4gdSR7bmFtZX1fJHtmaWVsZH1Db3VudDsgfVxuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBtYXQ0XG4gICAgICAgIEwucHVzaChgXG5tYXQ0ICR7bmFtZX1fJHtmaWVsZH1fZ2V0KGludCByZWMsIGludCBqKSB7XG4gIGludCBiYXNlID0gdSR7bmFtZX1fJHtmaWVsZH1CYXNlICsgaiAqIHUke25hbWV9XyR7ZmllbGR9U3RyaWRlO1xuICByZXR1cm4gbWF0NChcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrMCksICR7bmFtZX1fZmV0Y2goYmFzZSsxKSwgJHtuYW1lfV9mZXRjaChiYXNlKzIpLCAke25hbWV9X2ZldGNoKGJhc2UrMyksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKzQpLCAke25hbWV9X2ZldGNoKGJhc2UrNSksICR7bmFtZX1fZmV0Y2goYmFzZSs2KSwgJHtuYW1lfV9mZXRjaChiYXNlKzcpLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSs4KSwgJHtuYW1lfV9mZXRjaChiYXNlKzkpLCAke25hbWV9X2ZldGNoKGJhc2UrMTApLCAke25hbWV9X2ZldGNoKGJhc2UrMTEpLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSsxMiksICR7bmFtZX1fZmV0Y2goYmFzZSsxMyksICR7bmFtZX1fZmV0Y2goYmFzZSsxNCksICR7bmFtZX1fZmV0Y2goYmFzZSsxNSlcbiAgKTtcbn1cbmludCAke25hbWV9XyR7ZmllbGR9X2NvdW50KGludCByZWMpIHsgcmV0dXJuIHUke25hbWV9XyR7ZmllbGR9Q291bnQ7IH1cbmApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0gU3RydWN0LWFycmF5IGFjY2Vzc29ycyAtLS0tLS0tLS0tXG4gICAgZm9yIChjb25zdCBbZmllbGQsIG1ldGFdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMuc3RydWN0QXJyYXlzKSkge1xuICAgICAgY29uc3QgY2hpbGQgPSBtZXRhLnNjaGVtYTtcbiAgICAgIEwucHVzaChgXG51bmlmb3JtIGludCB1JHtuYW1lfV8ke2ZpZWxkfUJhc2U7XG51bmlmb3JtIGludCB1JHtuYW1lfV8ke2ZpZWxkfVN0cmlkZTsgIC8vID0gJHtjaGlsZC5oZWFkZXJGbG9hdENvdW50fVxudW5pZm9ybSBpbnQgdSR7bmFtZX1fJHtmaWVsZH1Db3VudDtcblxuJHtjaGlsZC5uYW1lfUhlYWRlciAke25hbWV9XyR7ZmllbGR9X2dldChpbnQgcmVjLCBpbnQgaikge1xuICBpbnQgYmFzZSA9IHUke25hbWV9XyR7ZmllbGR9QmFzZSArIGogKiB1JHtuYW1lfV8ke2ZpZWxkfVN0cmlkZTtcbiAgJHtjaGlsZC5uYW1lfUhlYWRlciBoO1xuJHtjaGlsZC5maWVsZHNcbiAgLm1hcCgoY2YpID0+IHtcbiAgICBpZiAoaXNWYXJBcnJheShjZi50eXBlKSkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuICAgIGNvbnN0IG9mZiA9IGNmLmhlYWRlckZsb2F0T2Zmc2V0ID8/IDA7XG4gICAgaWYgKGNmLnR5cGUgPT09IFwiZjMyXCIpIHtcbiAgICAgIHJldHVybiBgICBoLiR7Y2YubmFtZX0gPSAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmZ9KTtgO1xuICAgIH1cbiAgICBpZiAoY2YudHlwZSA9PT0gXCJpMzJcIikge1xuICAgICAgcmV0dXJuIGAgIGguJHtjZi5uYW1lfSA9IGludCgke25hbWV9X2ZldGNoKGJhc2UrJHtvZmZ9KSk7YDtcbiAgICB9XG4gICAgaWYgKGNmLnR5cGUgPT09IFwidTMyXCIpIHtcbiAgICAgIHJldHVybiBgICBoLiR7Y2YubmFtZX0gPSB1aW50KCR7bmFtZX1fZmV0Y2goYmFzZSske29mZn0pKTtgO1xuICAgIH1cbiAgICBpZiAoY2YudHlwZSA9PT0gXCJ2ZWMyXCIpIHtcbiAgICAgIHJldHVybiBgICBoLiR7Y2YubmFtZX0gPSB2ZWMyKCR7bmFtZX1fZmV0Y2goYmFzZSske29mZn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAxfSkpO2A7XG4gICAgfVxuICAgIGlmIChjZi50eXBlID09PSBcInZlYzNcIikge1xuICAgICAgcmV0dXJuIGAgIGguJHtjZi5uYW1lfSA9IHZlYzMoJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDF9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMn0pKTtgO1xuICAgIH1cbiAgICBpZiAoY2YudHlwZSA9PT0gXCJ2ZWM0XCIpIHtcbiAgICAgIHJldHVybiBgICBoLiR7Y2YubmFtZX0gPSB2ZWM0KCR7bmFtZX1fZmV0Y2goYmFzZSske29mZn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAxfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDJ9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgM30pKTtgO1xuICAgIH1cbiAgICBpZiAoY2YudHlwZSA9PT0gXCJtYXQyXCIpIHtcbiAgICAgIHJldHVybiBgICBoLiR7Y2YubmFtZX0gPSBtYXQyKCR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDB9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAyfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDN9KSk7YDtcbiAgICB9XG4gICAgaWYgKGNmLnR5cGUgPT09IFwibWF0M1wiKSB7XG4gICAgICByZXR1cm4gYCAgaC4ke2NmLm5hbWV9ID0gbWF0MyhcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAwfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDF9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMn0pLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDR9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgNX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyA2fSksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgOH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyA5fSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDEwfSlcbiAgKTtgO1xuICAgIH1cbiAgICByZXR1cm4gYCAgaC4ke2NmLm5hbWV9ID0gbWF0NChcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAwfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDF9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAzfSksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgNH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyA1fSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDZ9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgN30pLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDh9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgOX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAxMH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAxMX0pLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDEyfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDEzfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDE0fSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDE1fSlcbiAgKTtgO1xuICB9KVxuICAuam9pbihcIlxcblwiKX1cbiAgcmV0dXJuIGg7XG59XG5pbnQgJHtuYW1lfV8ke2ZpZWxkfV9jb3VudChpbnQgcmVjKSB7IHJldHVybiB1JHtuYW1lfV8ke2ZpZWxkfUNvdW50OyB9XG5gKTtcbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tIEhlYWRlciBsb2FkZXIgLS0tLS0tLS0tLVxuICAgIEwucHVzaChgXG4ke25hbWV9SGVhZGVyICR7bmFtZX1fbG9hZEhlYWRlcihpbnQgcmVjKSB7XG4gIGludCBiYXNlID0gdSR7bmFtZX1IZWFkZXJCYXNlOyAvLyBzaW5nbGUtcmVjb3JkIGJ1ZmZlcjsgcmVjIGtlcHQgZm9yIGZ1dHVyZSBBb1MgcGFja2luZ1xuICAke25hbWV9SGVhZGVyIGg7XG5gKTtcblxuICAgIGZvciAoY29uc3QgZiBvZiB0aGlzLmZpZWxkcykge1xuICAgICAgaWYgKGlzVmFyQXJyYXkoZi50eXBlKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG9mZiA9IGYuaGVhZGVyRmxvYXRPZmZzZXQgPz8gMDtcblxuICAgICAgaWYgKGYudHlwZSA9PT0gXCJmMzJcIikge1xuICAgICAgICBMLnB1c2goYCAgaC4ke2YubmFtZX0gPSAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmZ9KTtgKTtcbiAgICAgIH0gZWxzZSBpZiAoZi50eXBlID09PSBcImkzMlwiKSB7XG4gICAgICAgIEwucHVzaChgICBoLiR7Zi5uYW1lfSA9IGludCgke25hbWV9X2ZldGNoKGJhc2UrJHtvZmZ9KSk7YCk7XG4gICAgICB9IGVsc2UgaWYgKGYudHlwZSA9PT0gXCJ1MzJcIikge1xuICAgICAgICBMLnB1c2goYCAgaC4ke2YubmFtZX0gPSB1aW50KCR7bmFtZX1fZmV0Y2goYmFzZSske29mZn0pKTtgKTtcbiAgICAgIH0gZWxzZSBpZiAoZi50eXBlID09PSBcInZlYzJcIikge1xuICAgICAgICBMLnB1c2goXG4gICAgICAgICAgYCAgaC4ke2YubmFtZX0gPSB2ZWMyKCR7bmFtZX1fZmV0Y2goYmFzZSske29mZn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAxfSkpO2AsXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGYudHlwZSA9PT0gXCJ2ZWMzXCIpIHtcbiAgICAgICAgTC5wdXNoKFxuICAgICAgICAgIGAgIGguJHtmLm5hbWV9ID0gdmVjMygke25hbWV9X2ZldGNoKGJhc2UrJHtvZmZ9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAyfSkpO2AsXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGYudHlwZSA9PT0gXCJ2ZWM0XCIpIHtcbiAgICAgICAgTC5wdXNoKFxuICAgICAgICAgIGAgIGguJHtmLm5hbWV9ID0gdmVjNCgke25hbWV9X2ZldGNoKGJhc2UrJHtvZmZ9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAyfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDN9KSk7YCxcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoZi50eXBlID09PSBcIm1hdDJcIikge1xuICAgICAgICBMLnB1c2goXG4gICAgICAgICAgYCAgaC4ke2YubmFtZX0gPSBtYXQyKCR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDB9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAyfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDN9KSk7YCxcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoZi50eXBlID09PSBcIm1hdDNcIikge1xuICAgICAgICBMLnB1c2goYCAgaC4ke2YubmFtZX0gPSBtYXQzKFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDB9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAyfSksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgNH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyA1fSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDZ9KSxcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyA4fSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDl9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMTB9KVxuICApO2ApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgTC5wdXNoKGAgIGguJHtmLm5hbWV9ID0gbWF0NChcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAwfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDF9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgMn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAzfSksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgNH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyA1fSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDZ9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgN30pLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDh9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7b2ZmICsgOX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAxMH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtvZmYgKyAxMX0pLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDEyfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDEzfSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDE0fSksICR7bmFtZX1fZmV0Y2goYmFzZSske29mZiArIDE1fSlcbiAgKTtgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpbmxpbmUtbG9hZCBlbWJlZGRlZCBjaGlsZHJlbiAod2l0aGluIGhlYWRlciBzdHJlYW0pXG4gICAgZm9yIChjb25zdCBmIG9mIHRoaXMuZmllbGRzKSB7XG4gICAgICBpZiAoIWlzU3RydWN0UmVmKGYudHlwZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBvZmYgPSBmLmhlYWRlckZsb2F0T2Zmc2V0ID8/IDA7XG4gICAgICBjb25zdCBjaGlsZCA9IChmLnR5cGUgYXMgU3RydWN0UmVmKS5zdHJ1Y3RPZi5nZXRTY2hlbWEoKTtcbiAgICAgIGZvciAoY29uc3QgY2Ygb2YgY2hpbGQuZmllbGRzKSB7XG4gICAgICAgIGlmIChpc1ZhckFycmF5KGNmLnR5cGUpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29mZiA9IChjZi5oZWFkZXJGbG9hdE9mZnNldCA/PyAwKSArIG9mZjtcbiAgICAgICAgaWYgKGNmLnR5cGUgPT09IFwiZjMyXCIpIHtcbiAgICAgICAgICBMLnB1c2goYCAgaC4ke2YubmFtZX0uJHtjZi5uYW1lfSA9ICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmZ9KTtgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjZi50eXBlID09PSBcImkzMlwiKSB7XG4gICAgICAgICAgTC5wdXNoKFxuICAgICAgICAgICAgYCAgaC4ke2YubmFtZX0uJHtjZi5uYW1lfSA9IGludCgke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmfSkpO2AsXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjZi50eXBlID09PSBcInUzMlwiKSB7XG4gICAgICAgICAgTC5wdXNoKFxuICAgICAgICAgICAgYCAgaC4ke2YubmFtZX0uJHtjZi5uYW1lfSA9IHVpbnQoJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZn0pKTtgLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2YudHlwZSA9PT0gXCJ2ZWMyXCIpIHtcbiAgICAgICAgICBMLnB1c2goXG4gICAgICAgICAgICBgICBoLiR7Zi5uYW1lfS4ke2NmLm5hbWV9ID0gdmVjMigke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmfSksICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyAxfSkpO2AsXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjZi50eXBlID09PSBcInZlYzNcIikge1xuICAgICAgICAgIEwucHVzaChcbiAgICAgICAgICAgIGAgIGguJHtmLm5hbWV9LiR7Y2YubmFtZX0gPSB2ZWMzKCR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmZ9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDF9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDJ9KSk7YCxcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNmLnR5cGUgPT09IFwidmVjNFwiKSB7XG4gICAgICAgICAgTC5wdXNoKFxuICAgICAgICAgICAgYCAgaC4ke2YubmFtZX0uJHtjZi5uYW1lfSA9IHZlYzQoJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgMX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgMn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgM30pKTtgLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2YudHlwZSA9PT0gXCJtYXQyXCIpIHtcbiAgICAgICAgICBMLnB1c2goXG4gICAgICAgICAgICBgICBoLiR7Zi5uYW1lfS4ke2NmLm5hbWV9ID0gbWF0Migke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgMH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgMX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgMn0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgM30pKTtgLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2YudHlwZSA9PT0gXCJtYXQzXCIpIHtcbiAgICAgICAgICBMLnB1c2goYCAgaC4ke2YubmFtZX0uJHtjZi5uYW1lfSA9IG1hdDMoXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDB9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDF9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDJ9KSxcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgNH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgNX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgNn0pLFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyA4fSksICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyA5fSksICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyAxMH0pXG4gICk7YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgTC5wdXNoKGAgIGguJHtmLm5hbWV9LiR7Y2YubmFtZX0gPSBtYXQ0KFxuICAgICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyAwfSksICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyAxfSksICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyAyfSksICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyAzfSksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDR9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDV9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDZ9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDd9KSxcbiAgICAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgOH0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgOX0pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgMTB9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDExfSksXG4gICAgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDEyfSksICR7bmFtZX1fZmV0Y2goYmFzZSske2NvZmYgKyAxM30pLCAke25hbWV9X2ZldGNoKGJhc2UrJHtjb2ZmICsgMTR9KSwgJHtuYW1lfV9mZXRjaChiYXNlKyR7Y29mZiArIDE1fSlcbiAgKTtgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIEwucHVzaChcIiAgcmV0dXJuIGg7XFxufVxcblwiKTtcbiAgICByZXR1cm4gTC5qb2luKFwiXFxuXCIpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBTY2hlbWEgYnVpbGRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmV4cG9ydCBjbGFzcyBHUFVTdHJ1Y3RTY2hlbWFCdWlsZGVyIHtcbiAgcHJpdmF0ZSBfbmFtZTogc3RyaW5nO1xuICBwcml2YXRlIGZpZWxkczogRmllbGREZWZbXSA9IFtdO1xuICBwcml2YXRlIGJ1aWx0ID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nKSB7XG4gICAgdGhpcy5fbmFtZSA9IG5hbWU7XG4gIH1cblxuICBwdWJsaWMgcmVnaXN0ZXJGaWVsZChvcmRlcjogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIHR5cGU6IEZpZWxkVHlwZSk6IHRoaXMge1xuICAgIGlmICh0aGlzLmJ1aWx0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTY2hlbWEgYWxyZWFkeSBidWlsdFwiKTtcbiAgICB9XG4gICAgdGhpcy5maWVsZHMucHVzaCh7IG9yZGVyLCBuYW1lLCB0eXBlIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgcHVibGljIGJ1aWxkKCk6IEdQVVN0cnVjdFNjaGVtYSB7XG4gICAgaWYgKHRoaXMuYnVpbHQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlNjaGVtYSBhbHJlYWR5IGJ1aWx0XCIpO1xuICAgIH1cbiAgICB0aGlzLmJ1aWx0ID0gdHJ1ZTtcblxuICAgIGNvbnN0IHNvcnRlZCA9IHRoaXMuZmllbGRzXG4gICAgICAuc2xpY2UoKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyIHx8IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXG4gICAgLy8gUGFjayBoZWFkZXIgYXMgb3VyIG93biBmbG9hdCBsYXlvdXQgKEFvUyksIG1pbmltYWwgYWxpZ25tZW50IChjYW4gbWFrZSA0IGlmIGRlc2lyZWQpXG4gICAgbGV0IGZjdXJzb3IgPSAwO1xuICAgIGZvciAoY29uc3QgZiBvZiBzb3J0ZWQpIHtcbiAgICAgIGlmIChpc1ZhckFycmF5KGYudHlwZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoaXNTdHJ1Y3RSZWYoZi50eXBlKSkge1xuICAgICAgICBjb25zdCBjaGlsZFNjaGVtYSA9IChmLnR5cGUgYXMgU3RydWN0UmVmKS5zdHJ1Y3RPZi5nZXRTY2hlbWEoKTtcbiAgICAgICAgY29uc3Qgc2l6ZSA9IGNoaWxkU2NoZW1hLmhlYWRlckZsb2F0Q291bnQ7XG4gICAgICAgIGYuaGVhZGVyRmxvYXRPZmZzZXQgPSByb3VuZFVwRmxvYXRzKGZjdXJzb3IsIDEpO1xuICAgICAgICBmLmhlYWRlckZsb2F0U2l6ZSA9IHNpemU7XG4gICAgICAgIGZjdXJzb3IgPSBmLmhlYWRlckZsb2F0T2Zmc2V0ICsgc2l6ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHNpemUgPSBmbG9hdFN0cmlkZU9mKGYudHlwZSBhcyBhbnkpO1xuICAgICAgICBmLmhlYWRlckZsb2F0T2Zmc2V0ID0gcm91bmRVcEZsb2F0cyhmY3Vyc29yLCAxKTtcbiAgICAgICAgZi5oZWFkZXJGbG9hdFNpemUgPSBzaXplO1xuICAgICAgICBmY3Vyc29yID0gZi5oZWFkZXJGbG9hdE9mZnNldCArIHNpemU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuZXcgR1BVU3RydWN0U2NoZW1hKHRoaXMuX25hbWUsIHNvcnRlZCwgZmN1cnNvcik7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIEluY2x1ZGUgcmVnaXN0cmF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuZnVuY3Rpb24gc2V0SW5jbHVkZUNodW5rRlgobmFtZTogc3RyaW5nLCBmeDogc3RyaW5nKSB7XG4gIGNvbnN0IEVmZjogYW55ID0gQkFCWUxPTi5FZmZlY3Q7XG4gIGNvbnN0IFN0b3JlOiBhbnkgPSBCQUJZTE9OLlNoYWRlclN0b3JlO1xuICBmb3IgKGNvbnN0IHMgb2YgW0VmZj8uSW5jbHVkZXNTaGFkZXJzU3RvcmUsIFN0b3JlPy5JbmNsdWRlc1NoYWRlcnNTdG9yZV0pIHtcbiAgICBpZiAocykge1xuICAgICAgc1tuYW1lXSA9IGZ4O1xuICAgIH1cbiAgfVxuICAvLyBDbGVhciBhbnkgc3RhbGUgV0dTTCBpbmNsdWRlcyBmb3IgdGhlIHNhbWUga2V5XG4gIGZvciAoY29uc3QgcyBvZiBbXG4gICAgRWZmPy5JbmNsdWRlc1NoYWRlcnNTdG9yZVdHU0wsXG4gICAgRWZmPy5TaGFkZXJzU3RvcmVXR1NMPy5JbmNsdWRlc1NoYWRlcnNTdG9yZSxcbiAgICBTdG9yZT8uSW5jbHVkZXNTaGFkZXJzU3RvcmVXR1NMLFxuICAgIFN0b3JlPy5TaGFkZXJzU3RvcmVXR1NMPy5JbmNsdWRlc1NoYWRlcnNTdG9yZSxcbiAgXSkge1xuICAgIGlmIChzKSB7XG4gICAgICBkZWxldGUgc1tuYW1lXTtcbiAgICB9XG4gIH1cbn1cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckluY2x1ZGVzT25FbmdpbmUoc2NoZW1hOiBHUFVTdHJ1Y3RTY2hlbWEpIHtcbiAgZm9yIChjb25zdCBmIG9mIHNjaGVtYS5maWVsZHMpIHtcbiAgICBpZiAoaXNTdHJ1Y3RSZWYoZi50eXBlKSkge1xuICAgICAgY29uc3QgY2hpbGQgPSAoZi50eXBlIGFzIFN0cnVjdFJlZikuc3RydWN0T2YuZ2V0U2NoZW1hKCk7XG4gICAgICByZWdpc3RlckluY2x1ZGVzT25FbmdpbmUoY2hpbGQpO1xuICAgIH0gZWxzZSBpZiAoaXNWYXJBcnJheU9mU3RydWN0KGYudHlwZSkpIHtcbiAgICAgIGNvbnN0IGNoaWxkID0gKFxuICAgICAgICAoZi50eXBlIGFzIFZhckFycmF5VHlwZSkudmFyT2YgYXMgU3RydWN0UmVmXG4gICAgICApLnN0cnVjdE9mLmdldFNjaGVtYSgpO1xuICAgICAgcmVnaXN0ZXJJbmNsdWRlc09uRW5naW5lKGNoaWxkKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbmFtZSA9IHNjaGVtYS5uYW1lO1xuICBzZXRJbmNsdWRlQ2h1bmtGWChuYW1lLCBzY2hlbWEuZW1pdEhlYWRlclN0cnVjdCgpKTtcbiAgc2V0SW5jbHVkZUNodW5rRlgoYCR7bmFtZX1TdG9yYWdlYCwgc2NoZW1hLmVtaXRHTFNMU3RvcmFnZSgxLCAxMikpO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gRGVjb3JhdG9ycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5leHBvcnQgaW50ZXJmYWNlIEdQVUNsYXNzTWV0YSB7XG4gIG5hbWU/OiBzdHJpbmc7XG59XG5jb25zdCBDTEFTU19NRVRBX0tFWSA9IFN5bWJvbChcImdwdTpjbGFzc01ldGFcIik7XG5jb25zdCBGSUVMRF9NRVRBX0tFWSA9IFN5bWJvbChcImdwdTpmaWVsZE1ldGFcIik7XG50eXBlIFBlbmRpbmdGaWVsZCA9IHsgb3JkZXI6IG51bWJlcjsgbmFtZTogc3RyaW5nOyB0eXBlOiBGaWVsZFR5cGUgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdwdVN0cnVjdChtZXRhOiBHUFVDbGFzc01ldGEgPSB7fSkge1xuICByZXR1cm4gZnVuY3Rpb24gKGN0b3I6IGFueSkge1xuICAgIChSZWZsZWN0IGFzIGFueSkuZGVmaW5lTWV0YWRhdGE/LihDTEFTU19NRVRBX0tFWSwgbWV0YSwgY3Rvcik7XG4gICAgKGN0b3IgYXMgYW55KVtDTEFTU19NRVRBX0tFWV0gPSBtZXRhO1xuICB9O1xufVxuZXhwb3J0IGZ1bmN0aW9uIGZpZWxkKG9yZGVyOiBudW1iZXIsIHR5cGU6IEZpZWxkVHlwZSkge1xuICByZXR1cm4gZnVuY3Rpb24gKHRhcmdldDogYW55LCBwcm9wZXJ0eUtleTogc3RyaW5nKSB7XG4gICAgY29uc3QgY3RvciA9IHRhcmdldC5jb25zdHJ1Y3RvcjtcbiAgICBjb25zdCBhcnI6IFBlbmRpbmdGaWVsZFtdID1cbiAgICAgIChSZWZsZWN0IGFzIGFueSkuZ2V0TWV0YWRhdGE/LihGSUVMRF9NRVRBX0tFWSwgY3RvcikgfHxcbiAgICAgIChjdG9yW0ZJRUxEX01FVEFfS0VZXSA/PyBbXSk7XG4gICAgYXJyLnB1c2goeyBvcmRlciwgbmFtZTogcHJvcGVydHlLZXksIHR5cGUgfSk7XG4gICAgKFJlZmxlY3QgYXMgYW55KS5kZWZpbmVNZXRhZGF0YT8uKEZJRUxEX01FVEFfS0VZLCBhcnIsIGN0b3IpO1xuICAgIGN0b3JbRklFTERfTUVUQV9LRVldID0gYXJyO1xuICB9O1xufVxuZnVuY3Rpb24gcmVhZENsYXNzTWV0YShjdG9yOiBhbnkpOiBHUFVDbGFzc01ldGEge1xuICByZXR1cm4gKChSZWZsZWN0IGFzIGFueSkuZ2V0TWV0YWRhdGE/LihDTEFTU19NRVRBX0tFWSwgY3RvcikgfHxcbiAgICBjdG9yW0NMQVNTX01FVEFfS0VZXSB8fFxuICAgIHt9KSBhcyBHUFVDbGFzc01ldGE7XG59XG5mdW5jdGlvbiByZWFkRmllbGRzKGN0b3I6IGFueSk6IFBlbmRpbmdGaWVsZFtdIHtcbiAgcmV0dXJuIChcbiAgICAoKFJlZmxlY3QgYXMgYW55KS5nZXRNZXRhZGF0YT8uKEZJRUxEX01FVEFfS0VZLCBjdG9yKSB8fFxuICAgICAgY3RvcltGSUVMRF9NRVRBX0tFWV0gfHxcbiAgICAgIFtdKSBhcyBQZW5kaW5nRmllbGRbXVxuICApLnNsaWNlKCk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIEJhc2UgY2xhc3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmV4cG9ydCBpbnRlcmZhY2UgU3RydWN0UmVmIHtcbiAgc3RydWN0T2Y6IEdQVVJlY29yZEN0b3I7XG59XG5cbnR5cGUgRGlydHlFdmVudCA9XG4gIHwgeyBraW5kOiBcImhlYWRlclwiOyBieXRlT2Zmc2V0PzogbnVtYmVyOyBieXRlTGVuZ3RoPzogbnVtYmVyIH1cbiAgfCB7IGtpbmQ6IFwidmFyXCI7IGZpZWxkOiBzdHJpbmc7IGJ5dGVPZmZzZXQ/OiBudW1iZXI7IGJ5dGVMZW5ndGg/OiBudW1iZXIgfVxuICB8IHtcbiAgICAgIGtpbmQ6IFwic3RydWN0LWFycmF5XCI7XG4gICAgICBmaWVsZDogc3RyaW5nO1xuICAgICAgaW5kZXg/OiBudW1iZXI7XG4gICAgICBieXRlT2Zmc2V0PzogbnVtYmVyO1xuICAgICAgYnl0ZUxlbmd0aD86IG51bWJlcjtcbiAgICB9O1xuXG50eXBlIERpcnR5SGFuZGxlciA9IChldjogRGlydHlFdmVudCkgPT4gdm9pZDtcblxudHlwZSBHUFVSZWNvcmRDdG9yID0gdHlwZW9mIEdQVVJlY29yZCAmIHtcbiAgZ2V0U2NoZW1hKCk6IEdQVVN0cnVjdFNjaGVtYTtcbiAgcmVnaXN0ZXJJbmNsdWRlcygpOiB2b2lkO1xufTtcblxuZnVuY3Rpb24gY3JlYXRlRW1iZWRkZWRQcm94eTxUIGV4dGVuZHMgR1BVUmVjb3JkPihcbiAgcGFyZW50OiBHUFVSZWNvcmQsXG4gIGNoaWxkQ3RvcjogeyBnZXRTY2hlbWEoKTogR1BVU3RydWN0U2NoZW1hIH0sXG4gIGJhc2VGbG9hdE9mZnNldDogbnVtYmVyLFxuKTogYW55IHtcbiAgY29uc3Qgc2NoZW1hID0gY2hpbGRDdG9yLmdldFNjaGVtYSgpO1xuICBjb25zdCB2aWV3ID0gbmV3IERhdGFWaWV3KHBhcmVudC5oZWFkZXJSYXcpO1xuICBjb25zdCBiYXNlQnl0ZSA9IGJhc2VGbG9hdE9mZnNldCAqIDQ7XG5cbiAgY29uc3QgcHJveHk6IGFueSA9IHt9O1xuICBmb3IgKGNvbnN0IGYgb2Ygc2NoZW1hLmZpZWxkcykge1xuICAgIGlmIChpc1ZhckFycmF5KGYudHlwZSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gLy8gaGVhZGVyLW9ubHlcbiAgICBjb25zdCBvZmZCID0gYmFzZUJ5dGUgKyBmLmhlYWRlckZsb2F0T2Zmc2V0ISAqIDQ7XG4gICAgY29uc3Qgc3pGID0gZi5oZWFkZXJGbG9hdFNpemUhO1xuICAgIGlmIChpc1NjYWxhcihmLnR5cGUgYXMgYW55KSkge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb3h5LCBmLm5hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgc3dpdGNoIChmLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJmMzJcIjpcbiAgICAgICAgICAgICAgcmV0dXJuIHZpZXcuZ2V0RmxvYXQzMihvZmZCLCB0cnVlKTtcbiAgICAgICAgICAgIGNhc2UgXCJpMzJcIjpcbiAgICAgICAgICAgICAgcmV0dXJuIHZpZXcuZ2V0SW50MzIob2ZmQiwgdHJ1ZSk7XG4gICAgICAgICAgICBjYXNlIFwidTMyXCI6XG4gICAgICAgICAgICAgIHJldHVybiB2aWV3LmdldFVpbnQzMihvZmZCLCB0cnVlKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgc2NhbGFyIHR5cGU6ICR7Zi50eXBlfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiAodjogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgc3dpdGNoIChmLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJmMzJcIjpcbiAgICAgICAgICAgICAgdmlldy5zZXRGbG9hdDMyKG9mZkIsIHYsIHRydWUpO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJpMzJcIjpcbiAgICAgICAgICAgICAgdmlldy5zZXRJbnQzMihvZmZCLCB2IHwgMCwgdHJ1ZSk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInUzMlwiOlxuICAgICAgICAgICAgICB2aWV3LnNldFVpbnQzMihvZmZCLCB2ID4+PiAwLCB0cnVlKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHNjYWxhciB0eXBlOiAke2YudHlwZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcGFyZW50LmVtaXRIZWFkZXJEaXJ0eShvZmZCLCA0KTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGxpdmUgPSBuZXcgRmxvYXQzMkFycmF5KHBhcmVudC5oZWFkZXJSYXcsIG9mZkIsIHN6Rik7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkocHJveHksIGYubmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IGxpdmUsXG4gICAgICAgIHNldDogKGFycjogQXJyYXlMaWtlPG51bWJlcj4pID0+IHtcbiAgICAgICAgICBjb25zdCBMID0gTWF0aC5taW4obGl2ZS5sZW5ndGgsIChhcnIgYXMgYW55KS5sZW5ndGggPz8gMCk7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBMOyBpKyspIHtcbiAgICAgICAgICAgIGxpdmVbaV0gPSAoYXJyIGFzIGFueSlbaV07XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcmVudC5lbWl0SGVhZGVyRGlydHkob2ZmQiwgTCAqIDQpO1xuICAgICAgICB9LFxuICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHByb3h5O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIEJhY2tpbmdzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jbGFzcyBEYXRhVGV4QmFja2luZyBpbXBsZW1lbnRzIEdQVUJhY2tpbmcge1xuICBwdWJsaWMga2luZDogQmFja2VuZEtpbmQgPSBcImRhdGF0ZXhcIjtcblxuICBwcml2YXRlIGJ1ZlRleD86IEJKUy5SYXdUZXh0dXJlO1xuICBwcml2YXRlIGJ1ZldpZHRoID0gMTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIGVuZ2luZTogQkpTLkVuZ2luZSxcbiAgICBwcml2YXRlIHNjaGVtYTogR1BVU3RydWN0U2NoZW1hLFxuICAgIHByaXZhdGUgb3duZXI6IEdQVVJlY29yZCxcbiAgKSB7fVxuXG4gIGNvbW1pdCgpIHtcbiAgICBjb25zdCBwYXlsb2FkID0gdGhpcy5vd25lci5wcmVwYXJlVW5pZmllZEZvclVwbG9hZCgpO1xuICAgIGlmICghcGF5bG9hZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMSwgcGF5bG9hZC5sZW5ndGgpO1xuICAgIGlmICghdGhpcy5idWZUZXggfHwgdGhpcy5idWZUZXguZ2V0U2l6ZSgpLndpZHRoICE9PSB3aWR0aCkge1xuICAgICAgdGhpcy5idWZUZXg/LmRpc3Bvc2UoKTtcbiAgICAgIHRoaXMuYnVmVGV4ID0gbmV3IEJBQllMT04uUmF3VGV4dHVyZShcbiAgICAgICAgcGF5bG9hZC5sZW5ndGggPyBwYXlsb2FkIDogbmV3IEZsb2F0MzJBcnJheShbMF0pLFxuICAgICAgICB3aWR0aCxcbiAgICAgICAgMSxcbiAgICAgICAgQkFCWUxPTi5FbmdpbmUuVEVYVFVSRUZPUk1BVF9SRUQsXG4gICAgICAgIHRoaXMuZW5naW5lLFxuICAgICAgICBmYWxzZSxcbiAgICAgICAgZmFsc2UsXG4gICAgICAgIEJBQllMT04uVGV4dHVyZS5ORUFSRVNUX1NBTVBMSU5HTU9ERSxcbiAgICAgICAgQkFCWUxPTi5FbmdpbmUuVEVYVFVSRVRZUEVfRkxPQVQsXG4gICAgICApO1xuICAgICAgdGhpcy5idWZUZXgud3JhcFUgPSB0aGlzLmJ1ZlRleC53cmFwViA9IEJBQllMT04uVGV4dHVyZS5DTEFNUF9BRERSRVNTTU9ERTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5idWZUZXgudXBkYXRlKHBheWxvYWQubGVuZ3RoID8gcGF5bG9hZCA6IG5ldyBGbG9hdDMyQXJyYXkoWzBdKSk7XG4gICAgfVxuICAgIHRoaXMuYnVmV2lkdGggPSB3aWR0aDtcbiAgfVxuXG4gIGJpbmQoZWZmZWN0OiBCSlMuRWZmZWN0LCBpbmNsdWRlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLmJ1ZlRleCkge1xuICAgICAgcmV0dXJuO1xuICAgIH0gLy8gbm90aGluZyB0byBiaW5kIHlldFxuICAgIGNvbnN0IHNlbGYgPSB0aGlzLm93bmVyIGFzIGFueTtcbiAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYTtcblxuICAgIC8vIHJlc291cmNlICsgd2lkdGhcbiAgICBlZmZlY3Quc2V0VGV4dHVyZShgdSR7aW5jbHVkZU5hbWV9QnVmVGV4YCwgdGhpcy5idWZUZXgpO1xuICAgIGVmZmVjdC5zZXRJbnQoYHUke2luY2x1ZGVOYW1lfUJ1ZlRleFdpZHRoYCwgdGhpcy5idWZXaWR0aCk7XG5cbiAgICAvLyBoZWFkZXIgYmFzZVxuICAgIGVmZmVjdC5zZXRJbnQoYHUke2luY2x1ZGVOYW1lfUhlYWRlckJhc2VgLCBzZWxmLl9oZWFkZXJTZWcub2ZmRiB8IDApO1xuXG4gICAgLy8gcGVyLWZpZWxkIGJhc2VzL3N0cmlkZXMvY291bnRzXG4gICAgZm9yIChjb25zdCBmIG9mIE9iamVjdC5rZXlzKHNjaGVtYS52YXJBcnJheXMpKSB7XG4gICAgICBjb25zdCBzZWc6IFNlZ21lbnQgPSBzZWxmLl92YXJTZWdbZl07XG4gICAgICBjb25zdCBzdHJpZGUgPSBzY2hlbWEudmFyQXJyYXlzW2ZdLmZsb2F0U3RyaWRlO1xuICAgICAgY29uc3QgY291bnQgPSBNYXRoLmZsb29yKChzZWc/LmxlbkYgPz8gMCkgLyBzdHJpZGUpO1xuICAgICAgZWZmZWN0LnNldEludChgdSR7aW5jbHVkZU5hbWV9XyR7Zn1CYXNlYCwgc2VnPy5vZmZGIHwgMCk7XG4gICAgICBlZmZlY3Quc2V0SW50KGB1JHtpbmNsdWRlTmFtZX1fJHtmfVN0cmlkZWAsIHN0cmlkZSB8IDApO1xuICAgICAgZWZmZWN0LnNldEludChgdSR7aW5jbHVkZU5hbWV9XyR7Zn1Db3VudGAsIGNvdW50IHwgMCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgZiBvZiBPYmplY3Qua2V5cyhzY2hlbWEuc3RydWN0QXJyYXlzKSkge1xuICAgICAgY29uc3Qgc2VnOiBTZWdtZW50ID0gc2VsZi5fc3RydWN0U2VnW2ZdO1xuICAgICAgY29uc3Qgc3RyaWRlID0gc2NoZW1hLnN0cnVjdEFycmF5c1tmXS5zY2hlbWEuaGVhZGVyRmxvYXRDb3VudDtcbiAgICAgIGNvbnN0IGNvdW50ID0gKHNlbGYuX3N0cnVjdEFycmF5Q291bnQ/LltmXSBhcyBudW1iZXIpIHwgMDtcbiAgICAgIGVmZmVjdC5zZXRJbnQoYHUke2luY2x1ZGVOYW1lfV8ke2Z9QmFzZWAsIHNlZz8ub2ZmRiB8IDApO1xuICAgICAgZWZmZWN0LnNldEludChgdSR7aW5jbHVkZU5hbWV9XyR7Zn1TdHJpZGVgLCBzdHJpZGUgfCAwKTtcbiAgICAgIGVmZmVjdC5zZXRJbnQoYHUke2luY2x1ZGVOYW1lfV8ke2Z9Q291bnRgLCBjb3VudCB8IDApO1xuICAgIH1cbiAgfVxuXG4gIGRpc3Bvc2UoKSB7XG4gICAgdGhpcy5idWZUZXg/LmRpc3Bvc2UoKTtcbiAgfVxufVxuXG5jbGFzcyBTdG9yYWdlQmFja2luZyBpbXBsZW1lbnRzIEdQVUJhY2tpbmcge1xuICBwdWJsaWMga2luZDogQmFja2VuZEtpbmQgPSBcInN0b3JhZ2VcIjtcblxuICBwcml2YXRlIGJ1Zj86IEJKUy5TdG9yYWdlQnVmZmVyO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgZW5naW5lOiBCSlMuV2ViR1BVRW5naW5lLFxuICAgIHByaXZhdGUgc2NoZW1hOiBHUFVTdHJ1Y3RTY2hlbWEsXG4gICAgcHJpdmF0ZSBvd25lcjogR1BVUmVjb3JkLFxuICApIHt9XG5cbiAgY29tbWl0KCkge1xuICAgIGNvbnN0IHBheWxvYWQgPSB0aGlzLm93bmVyLnByZXBhcmVVbmlmaWVkRm9yVXBsb2FkKCk7XG4gICAgaWYgKCFwYXlsb2FkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbmVlZEJ5dGVzID0gTWF0aC5tYXgoMTYsIHBheWxvYWQuYnl0ZUxlbmd0aCk7XG4gICAgY29uc3QgUlcgPSBCQUJZTE9OLkNvbnN0YW50cy5CVUZGRVJfQ1JFQVRJT05GTEFHX1JFQURXUklURTtcblxuICAgIGlmICghdGhpcy5idWYgfHwgKHRoaXMuYnVmIGFzIGFueSkuX3NpemUgPCBuZWVkQnl0ZXMpIHtcbiAgICAgIHRoaXMuYnVmPy5kaXNwb3NlKCk7XG4gICAgICB0aGlzLmJ1ZiA9IG5ldyBCQUJZTE9OLlN0b3JhZ2VCdWZmZXIodGhpcy5lbmdpbmUsIG5lZWRCeXRlcywgUlcpO1xuICAgIH1cbiAgICBpZiAocGF5bG9hZC5ieXRlTGVuZ3RoKSB7XG4gICAgICB0aGlzLmJ1ZiEudXBkYXRlKHBheWxvYWQuYnVmZmVyIGFzIEFycmF5QnVmZmVyLCAwLCBwYXlsb2FkLmJ5dGVMZW5ndGgpO1xuICAgIH1cbiAgfVxuXG4gIGJpbmQoZWZmZWN0OiBCSlMuRWZmZWN0LCBpbmNsdWRlTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLmJ1Zikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsbmFtZSA9IGxjKGluY2x1ZGVOYW1lKTtcbiAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYTtcbiAgICBjb25zdCBzZWxmID0gdGhpcy5vd25lciBhcyBhbnk7XG5cbiAgICAvLyByZXNvdXJjZVxuICAgIHRoaXMuZW5naW5lLnNldFN0b3JhZ2VCdWZmZXIoYCR7bG5hbWV9QnVmYCwgdGhpcy5idWYpO1xuXG4gICAgLy8gaGVhZGVyIGJhc2VcbiAgICBlZmZlY3Quc2V0SW50KGB1JHtpbmNsdWRlTmFtZX1IZWFkZXJCYXNlYCwgc2VsZi5faGVhZGVyU2VnLm9mZkYgfCAwKTtcblxuICAgIC8vIHBlci1maWVsZCBiYXNlcy9zdHJpZGVzL2NvdW50c1xuICAgIGZvciAoY29uc3QgZiBvZiBPYmplY3Qua2V5cyhzY2hlbWEudmFyQXJyYXlzKSkge1xuICAgICAgY29uc3Qgc2VnOiBTZWdtZW50ID0gc2VsZi5fdmFyU2VnW2ZdO1xuICAgICAgY29uc3Qgc3RyaWRlID0gc2NoZW1hLnZhckFycmF5c1tmXS5mbG9hdFN0cmlkZTtcbiAgICAgIGNvbnN0IGNvdW50ID0gTWF0aC5mbG9vcigoc2VnPy5sZW5GID8/IDApIC8gc3RyaWRlKTtcbiAgICAgIGVmZmVjdC5zZXRJbnQoYHUke2luY2x1ZGVOYW1lfV8ke2Z9QmFzZWAsIHNlZz8ub2ZmRiB8IDApO1xuICAgICAgZWZmZWN0LnNldEludChgdSR7aW5jbHVkZU5hbWV9XyR7Zn1TdHJpZGVgLCBzdHJpZGUgfCAwKTtcbiAgICAgIGVmZmVjdC5zZXRJbnQoYHUke2luY2x1ZGVOYW1lfV8ke2Z9Q291bnRgLCBjb3VudCB8IDApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGYgb2YgT2JqZWN0LmtleXMoc2NoZW1hLnN0cnVjdEFycmF5cykpIHtcbiAgICAgIGNvbnN0IHNlZzogU2VnbWVudCA9IHNlbGYuX3N0cnVjdFNlZ1tmXTtcbiAgICAgIGNvbnN0IHN0cmlkZSA9IHNjaGVtYS5zdHJ1Y3RBcnJheXNbZl0uc2NoZW1hLmhlYWRlckZsb2F0Q291bnQ7XG4gICAgICBjb25zdCBjb3VudCA9IChzZWxmLl9zdHJ1Y3RBcnJheUNvdW50Py5bZl0gYXMgbnVtYmVyKSB8IDA7XG4gICAgICBlZmZlY3Quc2V0SW50KGB1JHtpbmNsdWRlTmFtZX1fJHtmfUJhc2VgLCBzZWc/Lm9mZkYgfCAwKTtcbiAgICAgIGVmZmVjdC5zZXRJbnQoYHUke2luY2x1ZGVOYW1lfV8ke2Z9U3RyaWRlYCwgc3RyaWRlIHwgMCk7XG4gICAgICBlZmZlY3Quc2V0SW50KGB1JHtpbmNsdWRlTmFtZX1fJHtmfUNvdW50YCwgY291bnQgfCAwKTtcbiAgICB9XG4gIH1cblxuICBkaXNwb3NlKCkge1xuICAgIHRoaXMuYnVmPy5kaXNwb3NlKCk7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBHUFVSZWNvcmQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEdQVVJlY29yZCB7XG4gIC8vIENQVSBoZWFkZXIgc3RvcmFnZTsgZWRpdGVkIGJ5IGxpdmUgcHJvcGVydGllczsgY29waWVkIGludG8gYXJlbmEgb24gY29tbWl0XG4gIHB1YmxpYyByZWFkb25seSBoZWFkZXJSYXc6IEFycmF5QnVmZmVyO1xuICBwcm90ZWN0ZWQgc3RhdGljIHNjaGVtYT86IEdQVVN0cnVjdFNjaGVtYTtcbiAgcHJvdGVjdGVkIHJlYWRvbmx5IF92aWV3OiBEYXRhVmlldztcblxuICBwcml2YXRlIF9iYWNraW5nOiBHUFVCYWNraW5nO1xuICBwcml2YXRlIF9pbmNsdWRlTmFtZTogc3RyaW5nO1xuXG4gIC8vIFNpbmdsZSBhcmVuYSAmIHNlZ21lbnRzXG4gIHByaXZhdGUgX2FyZW5hID0gbmV3IEZsb2F0QXJlbmEoKTtcbiAgcHJpdmF0ZSBfaGVhZGVyU2VnOiBTZWdtZW50ID0geyBvZmZGOiAwLCBsZW5GOiAwLCBjYXBGOiAwIH07XG4gIHByaXZhdGUgX3ZhclNlZzogUmVjb3JkPHN0cmluZywgU2VnbWVudD4gPSB7fTtcbiAgcHJpdmF0ZSBfc3RydWN0U2VnOiBSZWNvcmQ8c3RyaW5nLCBTZWdtZW50PiA9IHt9O1xuXG4gIHByaXZhdGUgX3N0cnVjdEFycmF5Q291bnQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgcHJpdmF0ZSBfc3RydWN0QXJyYXlTbG90czogUmVjb3JkPHN0cmluZywgR1BVUmVjb3JkW10+ID0ge307XG4gIHByaXZhdGUgX3N0cnVjdEFycmF5VW5zdWJzOiBSZWNvcmQ8c3RyaW5nLCBBcnJheTwoKSA9PiB2b2lkPj4gPSB7fTtcblxuICBwcml2YXRlIF9kaXJ0eUhhbmRsZXJzPzogRGlydHlIYW5kbGVyW107XG4gIHByaXZhdGUgX2hlYWRlckRpcnR5ID0gdHJ1ZTsgLy8gaGVhZGVyUmF3IC0+IGFyZW5hIHN5bmMgcGVuZGluZ1xuXG4gIC8vIC0tLS0gRGlydHkgZXZlbnRzIEFQSSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBwdWJsaWMgb25EaXJ0eShjYjogRGlydHlIYW5kbGVyKTogKCkgPT4gdm9pZCB7XG4gICAgKHRoaXMuX2RpcnR5SGFuZGxlcnMgPz89IFtdKS5wdXNoKGNiKTtcbiAgICBsZXQgYWxpdmUgPSB0cnVlO1xuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICBpZiAoIWFsaXZlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGFsaXZlID0gZmFsc2U7XG4gICAgICBjb25zdCBhID0gdGhpcy5fZGlydHlIYW5kbGVycyE7XG4gICAgICBjb25zdCBpID0gYS5pbmRleE9mKGNiKTtcbiAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgYS5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuICBwdWJsaWMgZW1pdEhlYWRlckRpcnR5KGJ5dGVPZmZzZXQ/OiBudW1iZXIsIGJ5dGVMZW5ndGg/OiBudW1iZXIpIHtcbiAgICB0aGlzLl9oZWFkZXJEaXJ0eSA9IHRydWU7XG4gICAgY29uc3QgYSA9IHRoaXMuX2RpcnR5SGFuZGxlcnM7XG4gICAgaWYgKCFhKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGV2OiBEaXJ0eUV2ZW50ID0geyBraW5kOiBcImhlYWRlclwiLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoIH07XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhW2ldKGV2KTtcbiAgICB9XG4gIH1cblxuICAvLyAtLS0tIFNjaGVtYSBpbnRyb3NwZWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgcHVibGljIHN0YXRpYyBzaGFkZXJJTyhlbmdpbmU6IEJKUy5FbmdpbmUpOiB7XG4gICAgdW5pZm9ybXM6IHN0cmluZ1tdO1xuICAgIHNhbXBsZXJzOiBzdHJpbmdbXTtcbiAgfSB7XG4gICAgcmV0dXJuICh0aGlzIGFzIGFueSkuZ2V0U2NoZW1hKCkubWF0ZXJpYWxJT0ZvcihlbmdpbmUpO1xuICB9XG5cbiAgcHVibGljIHN0YXRpYyBnZXRTY2hlbWEodGhpczogR1BVUmVjb3JkQ3Rvcik6IEdQVVN0cnVjdFNjaGVtYSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWE7XG4gICAgfVxuICAgIGNvbnN0IG1ldGEgPSByZWFkQ2xhc3NNZXRhKHRoaXMpO1xuICAgIGNvbnN0IG5hbWUgPSBtZXRhLm5hbWUgfHwgdGhpcy5uYW1lO1xuICAgIGNvbnN0IGRlYyA9IHJlYWRGaWVsZHModGhpcyk7XG4gICAgaWYgKCFkZWMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIHNjaGVtYSBmb3IgJHtuYW1lfS4gRGVjb3JhdGUgd2l0aCBAZmllbGQoKS5gKTtcbiAgICB9XG4gICAgY29uc3QgYiA9IG5ldyBHUFVTdHJ1Y3RTY2hlbWFCdWlsZGVyKG5hbWUpO1xuICAgIGZvciAoY29uc3QgZiBvZiBkZWMpIHtcbiAgICAgIGIucmVnaXN0ZXJGaWVsZChmLm9yZGVyLCBmLm5hbWUsIGYudHlwZSk7XG4gICAgfVxuICAgIHRoaXMuc2NoZW1hID0gYi5idWlsZCgpO1xuICAgIHJldHVybiB0aGlzLnNjaGVtYTtcbiAgfVxuXG4gIHB1YmxpYyBzdGF0aWMgcmVnaXN0ZXJJbmNsdWRlcyh0aGlzOiBHUFVSZWNvcmRDdG9yKSB7XG4gICAgcmVnaXN0ZXJJbmNsdWRlc09uRW5naW5lKHRoaXMuZ2V0U2NoZW1hKCkpO1xuICB9XG5cbiAgLy8gLS0tLSBQdWJsaWMgbXV0YXRvcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLyoqIEFzc2lnbi9yZXNpemUgYSB2YXJpYWJsZSBhcnJheS4gRGF0YSBpcyBjb3BpZWQgaW50byB0aGUgcmVjb3JkIGFyZW5hLiAqL1xuICBwdWJsaWMgc2V0VmFyQXJyYXkoZmllbGQ6IHN0cmluZywgZGF0YTogRmxvYXQzMkFycmF5IHwgbnVtYmVyW10pIHtcbiAgICBjb25zdCBjdG9yID0gdGhpcy5jb25zdHJ1Y3RvciBhcyBHUFVSZWNvcmRDdG9yO1xuICAgIGNvbnN0IHNjaGVtYSA9IGN0b3IuZ2V0U2NoZW1hKCk7XG4gICAgY29uc3QgbWV0YSA9IHNjaGVtYS52YXJBcnJheXNbZmllbGRdO1xuICAgIGlmICghbWV0YSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgJyR7ZmllbGR9JyBpcyBub3QgYSB2YXJpYWJsZSBhcnJheSBmaWVsZCBvbiAke3NjaGVtYT8ubmFtZX1gLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBzcmMgPSBkYXRhIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5ID8gZGF0YSA6IG5ldyBGbG9hdDMyQXJyYXkoZGF0YSk7XG4gICAgY29uc3Qgc2VnID1cbiAgICAgIHRoaXMuX3ZhclNlZ1tmaWVsZF0gfHxcbiAgICAgICh0aGlzLl92YXJTZWdbZmllbGRdID0geyBvZmZGOiAwLCBsZW5GOiAwLCBjYXBGOiAwIH0pO1xuXG4gICAgLy8gZW5zdXJlIHNlZ21lbnQgY2FwYWNpdHk7IHJlcGFjayBpZiBuZWVkZWRcbiAgICBpZiAoc3JjLmxlbmd0aCA+IHNlZy5jYXBGKSB7XG4gICAgICB0aGlzLl9yZXBhY2soe1xuICAgICAgICBncm93VmFyOiB7XG4gICAgICAgICAgZmllbGQsXG4gICAgICAgICAgbmV3Q2FwRjogTWF0aC5tYXgoc3JjLmxlbmd0aCwgTWF0aC5tYXgoNjQsIHNlZy5jYXBGICogMikpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuICAgIC8vIFdyaXRlXG4gICAgdGhpcy5fYXJlbmEud3JpdGUoc2VnLm9mZkYsIHNyYywgc3JjLmxlbmd0aCk7XG4gICAgc2VnLmxlbkYgPSBzcmMubGVuZ3RoO1xuICB9XG5cbiAgLyoqIEluaXRpYWxpemUgYSBzdHJ1Y3QtYXJyYXkgc2VnbWVudCBmb3IgTiBjaGlsZHJlbiBwZXIgcGFyZW50IChzaW5nbGUgcGFyZW50IHBoYXNlKS4gKi9cbiAgcHVibGljIGluaXRTdHJ1Y3RBcnJheShcbiAgICBmaWVsZDogc3RyaW5nLFxuICAgIGNvdW50UGVyUGFyZW50OiBudW1iZXIsXG4gICAgY2hpbGRTY2hlbWE6IEdQVVN0cnVjdFNjaGVtYSxcbiAgKSB7XG4gICAgY29uc3Qgc3RyaWRlRiA9IGNoaWxkU2NoZW1hLmhlYWRlckZsb2F0Q291bnQ7XG4gICAgY29uc3QgbmVlZEYgPSBjb3VudFBlclBhcmVudCAqIHN0cmlkZUY7XG4gICAgY29uc3Qgc2VnID1cbiAgICAgIHRoaXMuX3N0cnVjdFNlZ1tmaWVsZF0gfHxcbiAgICAgICh0aGlzLl9zdHJ1Y3RTZWdbZmllbGRdID0geyBvZmZGOiAwLCBsZW5GOiAwLCBjYXBGOiAwIH0pO1xuICAgIGlmIChuZWVkRiA+IHNlZy5jYXBGKSB7XG4gICAgICB0aGlzLl9yZXBhY2soeyBncm93U3RydWN0OiB7IGZpZWxkLCBuZXdDYXBGOiBuZWVkRiB9IH0pO1xuICAgIH1cbiAgICBzZWcubGVuRiA9IG5lZWRGO1xuICAgIHRoaXMuX3N0cnVjdEFycmF5Q291bnRbZmllbGRdID0gY291bnRQZXJQYXJlbnQgfCAwO1xuICAgIHRoaXMuX3N0cnVjdEFycmF5U2xvdHNbZmllbGRdID0gbmV3IEFycmF5KGNvdW50UGVyUGFyZW50KTtcbiAgICB0aGlzLl9zdHJ1Y3RBcnJheVVuc3Vic1tmaWVsZF0gPSBuZXcgQXJyYXkoY291bnRQZXJQYXJlbnQpO1xuICB9XG5cbiAgLyoqIEJ1bGsgc2V0IGEgc3RydWN0LWFycmF5IChjb3BpZXMgY2hpbGQgaGVhZGVycyBpbnRvIHRoZSBhcmVuYSkuICovXG4gIHB1YmxpYyBzZXRTdHJ1Y3RBcnJheShcbiAgICBmaWVsZDogc3RyaW5nLFxuICAgIGl0ZW1zOiBHUFVSZWNvcmRbXSxcbiAgICBjb3VudFBlclBhcmVudDogbnVtYmVyLFxuICApIHtcbiAgICBjb25zdCBjdG9yID0gdGhpcy5jb25zdHJ1Y3RvciBhcyBHUFVSZWNvcmRDdG9yO1xuICAgIGNvbnN0IHNjaGVtYSA9IGN0b3IuZ2V0U2NoZW1hKCk7XG4gICAgY29uc3QgbWV0YSA9IHNjaGVtYS5zdHJ1Y3RBcnJheXNbZmllbGRdO1xuICAgIGlmICghbWV0YSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGAnJHtmaWVsZH0nIGlzIG5vdCBhIHN0cnVjdCBhcnJheSBvbiAke3NjaGVtYS5uYW1lfWApO1xuICAgIH1cblxuICAgIGNvbnN0IHN0cmlkZUYgPSBtZXRhLnNjaGVtYS5oZWFkZXJGbG9hdENvdW50O1xuICAgIGNvbnN0IHRvdGFsRiA9IGl0ZW1zLmxlbmd0aCAqIHN0cmlkZUY7XG5cbiAgICBjb25zdCBzZWcgPVxuICAgICAgdGhpcy5fc3RydWN0U2VnW2ZpZWxkXSB8fFxuICAgICAgKHRoaXMuX3N0cnVjdFNlZ1tmaWVsZF0gPSB7IG9mZkY6IDAsIGxlbkY6IDAsIGNhcEY6IDAgfSk7XG4gICAgaWYgKHRvdGFsRiA+IHNlZy5jYXBGKSB7XG4gICAgICB0aGlzLl9yZXBhY2soe1xuICAgICAgICBncm93U3RydWN0OiB7XG4gICAgICAgICAgZmllbGQsXG4gICAgICAgICAgbmV3Q2FwRjogTWF0aC5tYXgodG90YWxGLCBNYXRoLm1heChzdHJpZGVGICogNCwgc2VnLmNhcEYgKiAyKSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBsZXQgdyA9IDA7XG4gICAgZm9yIChjb25zdCBpdCBvZiBpdGVtcykge1xuICAgICAgY29uc3QgaGRyID0gbmV3IEZsb2F0MzJBcnJheSgoaXQgYXMgYW55KS5oZWFkZXJSYXcpO1xuICAgICAgdGhpcy5fYXJlbmEud3JpdGUoc2VnLm9mZkYgKyB3LCBoZHIsIGhkci5sZW5ndGgpO1xuICAgICAgdyArPSBzdHJpZGVGO1xuICAgIH1cbiAgICBzZWcubGVuRiA9IHRvdGFsRjtcbiAgICB0aGlzLl9zdHJ1Y3RBcnJheUNvdW50W2ZpZWxkXSA9IGNvdW50UGVyUGFyZW50IHwgMDtcbiAgfVxuXG4gIC8qKiBCaW5kL3VwZGF0ZSBhIGNoaWxkIGludG8gYW4gZXhpc3Rpbmcgc3RydWN0LWFycmF5IHNsb3Qgd2l0aCBsaXZlIHByb3BhZ2F0aW9uLiAqL1xuICBwdWJsaWMgYmluZFN0cnVjdEFycmF5SXRlbShcbiAgICBmaWVsZDogc3RyaW5nLFxuICAgIGluZGV4OiBudW1iZXIsXG4gICAgY2hpbGQ6IEdQVVJlY29yZCxcbiAgICBjaGlsZFNjaGVtYT86IEdQVVN0cnVjdFNjaGVtYSxcbiAgKSB7XG4gICAgY29uc3QgY3RvciA9IHRoaXMuY29uc3RydWN0b3IgYXMgR1BVUmVjb3JkQ3RvcjtcbiAgICBjb25zdCBzY2hlbWEgPSBjdG9yLmdldFNjaGVtYSgpO1xuICAgIGNvbnN0IG1ldGEgPSBzY2hlbWEuc3RydWN0QXJyYXlzW2ZpZWxkXTtcbiAgICBpZiAoIW1ldGEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJyR7ZmllbGR9JyBpcyBub3QgYSBzdHJ1Y3QgYXJyYXkgb24gJHtzY2hlbWEubmFtZX1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBzdHJpZGVGID0gKGNoaWxkU2NoZW1hID8/IG1ldGEuc2NoZW1hKS5oZWFkZXJGbG9hdENvdW50O1xuICAgIGNvbnN0IHNlZyA9IHRoaXMuX3N0cnVjdFNlZ1tmaWVsZF07XG4gICAgaWYgKCFzZWcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENhbGwgaW5pdFN0cnVjdEFycmF5KCcke2ZpZWxkfScsIC4uLikgb3Igc2V0U3RydWN0QXJyYXkoLi4uKSBmaXJzdGAsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IGJhc2VGID0gc2VnLm9mZkYgKyBpbmRleCAqIHN0cmlkZUY7XG5cbiAgICAvLyBpbml0aWFsIGNvcHlcbiAgICBjb25zdCBzcmMgPSBuZXcgRmxvYXQzMkFycmF5KChjaGlsZCBhcyBhbnkpLmhlYWRlclJhdyk7XG4gICAgdGhpcy5fYXJlbmEud3JpdGUoYmFzZUYsIHNyYywgTWF0aC5taW4oc3JjLmxlbmd0aCwgc3RyaWRlRikpO1xuXG4gICAgLy8gbGl2ZSBzdWJzY3JpYmUgKGhlYWRlci1vbmx5IHVwZGF0ZXMpXG4gICAgdGhpcy5fc3RydWN0QXJyYXlVbnN1YnNbZmllbGRdPy5baW5kZXhdPy4oKTtcbiAgICB0aGlzLl9zdHJ1Y3RBcnJheVNsb3RzW2ZpZWxkXVtpbmRleF0gPSBjaGlsZDtcblxuICAgIGNvbnN0IHVuc3ViID0gY2hpbGQub25EaXJ0eSgoZXYpID0+IHtcbiAgICAgIGlmIChldi5raW5kICE9PSBcImhlYWRlclwiKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG9mZkIgPSBldi5ieXRlT2Zmc2V0ID8/IDA7XG4gICAgICBjb25zdCBsZW5CID0gZXYuYnl0ZUxlbmd0aCA/PyBzdHJpZGVGICogNDtcbiAgICAgIGNvbnN0IG9mZkYgPSBvZmZCID4+IDI7XG4gICAgICBjb25zdCBsZW5GID0gbGVuQiA+PiAyO1xuICAgICAgY29uc3Qgc3JjcCA9IG5ldyBGbG9hdDMyQXJyYXkoKGNoaWxkIGFzIGFueSkuaGVhZGVyUmF3LCBvZmZCLCBsZW5GKTtcbiAgICAgIHRoaXMuX2FyZW5hLndyaXRlKGJhc2VGICsgb2ZmRiwgc3JjcCwgbGVuRik7XG4gICAgfSk7XG4gICAgdGhpcy5fc3RydWN0QXJyYXlVbnN1YnNbZmllbGRdW2luZGV4XSA9IHVuc3ViO1xuXG4gICAgLy8gbG9naWNhbCBsZW5ndGggZW5zdXJlXG4gICAgc2VnLmxlbkYgPSBNYXRoLm1heChzZWcubGVuRiwgKGluZGV4ICsgMSkgKiBzdHJpZGVGKTtcbiAgfVxuXG4gIC8qKiBVcGxvYWQgKyBiaW5kLiBDYWxsIGJlZm9yZSBkcmF3aW5nLiAqL1xuICBwdWJsaWMgY29tbWl0QW5kQmluZChlZmZlY3Q6IEJKUy5FZmZlY3QpIHtcbiAgICB0aGlzLl9iYWNraW5nLmNvbW1pdCgpO1xuICAgIHRoaXMuX2JhY2tpbmcuYmluZChlZmZlY3QsIHRoaXMuX2luY2x1ZGVOYW1lKTtcbiAgfVxuXG4gIHB1YmxpYyBkaXNwb3NlKCkge1xuICAgIHRoaXMuX2JhY2tpbmcuZGlzcG9zZSgpO1xuICB9XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gY3RvciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBwcm90ZWN0ZWQgY29uc3RydWN0b3IoZW5naW5lOiBCSlMuRW5naW5lKSB7XG4gICAgY29uc3QgY3RvciA9IHRoaXMuY29uc3RydWN0b3IgYXMgR1BVUmVjb3JkQ3RvcjtcbiAgICBjb25zdCBzY2hlbWEgPSBjdG9yLmdldFNjaGVtYSgpO1xuICAgIHRoaXMuX2luY2x1ZGVOYW1lID0gc2NoZW1hLm5hbWU7XG5cbiAgICAvLyBDUFUgaGVhZGVyIGJ1ZmZlciBmb3IgbGl2ZSBwcm9wZXJ0aWVzXG4gICAgdGhpcy5oZWFkZXJSYXcgPSBuZXcgQXJyYXlCdWZmZXIoc2NoZW1hLmhlYWRlckZsb2F0Q291bnQgKiA0KTtcbiAgICB0aGlzLl92aWV3ID0gbmV3IERhdGFWaWV3KHRoaXMuaGVhZGVyUmF3KTtcblxuICAgIC8vIGRlZmluZSBsaXZlIHByb3BlcnRpZXMgKGhlYWRlciArIGVtYmVkZGVkIHN0cnVjdHMpXG4gICAgZm9yIChjb25zdCBmIG9mIHNjaGVtYS5maWVsZHMpIHtcbiAgICAgIGlmIChpc1ZhckFycmF5KGYudHlwZSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1N0cnVjdFJlZihmLnR5cGUpKSB7XG4gICAgICAgIGNvbnN0IG9mZkZsb2F0cyA9IGYuaGVhZGVyRmxvYXRPZmZzZXQgPz8gMDtcbiAgICAgICAgY29uc3QgY2hpbGRDdG9yID0gKGYudHlwZSBhcyBTdHJ1Y3RSZWYpLnN0cnVjdE9mO1xuICAgICAgICBjb25zdCBjaGlsZFByb3h5ID0gY3JlYXRlRW1iZWRkZWRQcm94eSh0aGlzLCBjaGlsZEN0b3IsIG9mZkZsb2F0cyk7XG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBmLm5hbWUsIHtcbiAgICAgICAgICBnZXQ6ICgpID0+IGNoaWxkUHJveHksXG4gICAgICAgICAgc2V0OiAodikgPT4ge1xuICAgICAgICAgICAgaWYgKHYgJiYgKHYgYXMgYW55KS5oZWFkZXJSYXcpIHtcbiAgICAgICAgICAgICAgY29uc3Qgc3JjID0gbmV3IEZsb2F0MzJBcnJheSgodiBhcyBhbnkpLmhlYWRlclJhdyk7XG4gICAgICAgICAgICAgIGNvbnN0IGRzdCA9IG5ldyBGbG9hdDMyQXJyYXkoXG4gICAgICAgICAgICAgICAgdGhpcy5oZWFkZXJSYXcsXG4gICAgICAgICAgICAgICAgb2ZmRmxvYXRzICogNCxcbiAgICAgICAgICAgICAgICBzcmMubGVuZ3RoLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBkc3Quc2V0KHNyYyk7XG4gICAgICAgICAgICAgIHRoaXMuZW1pdEhlYWRlckRpcnR5KG9mZkZsb2F0cyAqIDQsIHNyYy5sZW5ndGggKiA0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG9mZkZsb2F0cyA9IGYuaGVhZGVyRmxvYXRPZmZzZXQgPz8gMDtcbiAgICAgIGNvbnN0IHNpemVGbG9hdHMgPSBmLmhlYWRlckZsb2F0U2l6ZSA/PyBmbG9hdFN0cmlkZU9mKGYudHlwZSBhcyBhbnkpO1xuICAgICAgY29uc3Qgb2ZmQnl0ZXMgPSBvZmZGbG9hdHMgKiA0O1xuXG4gICAgICBpZiAoaXNTY2FsYXIoZi50eXBlIGFzIGFueSkpIHtcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGYubmFtZSwge1xuICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgICAgc3dpdGNoIChmLnR5cGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBcImYzMlwiOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl92aWV3LmdldEZsb2F0MzIob2ZmQnl0ZXMsIHRydWUpO1xuICAgICAgICAgICAgICBjYXNlIFwiaTMyXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZXcuZ2V0SW50MzIob2ZmQnl0ZXMsIHRydWUpO1xuICAgICAgICAgICAgICBjYXNlIFwidTMyXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3ZpZXcuZ2V0VWludDMyKG9mZkJ5dGVzLCB0cnVlKTtcbiAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICBgVW5zdXBwb3J0ZWQgdHlwZSAke2YudHlwZX0gZm9yIGZpZWxkICR7Zi5uYW1lfWAsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHNldDogKHY6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgc3dpdGNoIChmLnR5cGUpIHtcbiAgICAgICAgICAgICAgY2FzZSBcImYzMlwiOlxuICAgICAgICAgICAgICAgIHRoaXMuX3ZpZXcuc2V0RmxvYXQzMihvZmZCeXRlcywgdiwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgXCJpMzJcIjpcbiAgICAgICAgICAgICAgICB0aGlzLl92aWV3LnNldEludDMyKG9mZkJ5dGVzLCB2IHwgMCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgXCJ1MzJcIjpcbiAgICAgICAgICAgICAgICB0aGlzLl92aWV3LnNldFVpbnQzMihvZmZCeXRlcywgdiA+Pj4gMCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgYFVuc3VwcG9ydGVkIHR5cGUgJHtmLnR5cGV9IGZvciBmaWVsZCAke2YubmFtZX1gLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVtaXRIZWFkZXJEaXJ0eShvZmZCeXRlcywgNCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBsaXZlID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLmhlYWRlclJhdywgb2ZmQnl0ZXMsIHNpemVGbG9hdHMpO1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgZi5uYW1lLCB7XG4gICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgZ2V0OiAoKSA9PiBsaXZlLFxuICAgICAgICAgIHNldDogKGFycjogQXJyYXlMaWtlPG51bWJlcj4pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IEwgPSBNYXRoLm1pbihsaXZlLmxlbmd0aCwgKGFyciBhcyBhbnkpLmxlbmd0aCA/PyAwKTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTDsgaSsrKSB7XG4gICAgICAgICAgICAgIGxpdmVbaV0gPSAoYXJyIGFzIGFueSlbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVtaXRIZWFkZXJEaXJ0eShvZmZCeXRlcywgTCAqIDQpO1xuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEV4cG9zZSB2YXItYXJyYXkgYWNjZXNzb3JzIGFzIHZpZXdzIG9uIHRoZSBhcmVuYSAobmV3IHZpZXcgZWFjaCBnZXQoKSlcbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIE9iamVjdC5rZXlzKHNjaGVtYS52YXJBcnJheXMpKSB7XG4gICAgICB0aGlzLl92YXJTZWdbZmllbGRdID0geyBvZmZGOiAwLCBsZW5GOiAwLCBjYXBGOiAwIH07XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgZmllbGQsIHtcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBjb25zdCBzZWcgPSB0aGlzLl92YXJTZWdbZmllbGRdO1xuICAgICAgICAgIGlmICghc2VnLmNhcEYpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRmxvYXQzMkFycmF5KDApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fYXJlbmEudmlldyhzZWcub2ZmRiwgc2VnLmxlbkYpO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6ICh2OiBGbG9hdDMyQXJyYXkgfCBudW1iZXJbXSkgPT4gdGhpcy5zZXRWYXJBcnJheShmaWVsZCwgdiksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBBbGxvY2F0ZSBoZWFkZXIgc2VnbWVudCBhdCBmcm9udFxuICAgIHRoaXMuX2hlYWRlclNlZyA9IHtcbiAgICAgIG9mZkY6IDAsXG4gICAgICBsZW5GOiBzY2hlbWEuaGVhZGVyRmxvYXRDb3VudCxcbiAgICAgIGNhcEY6IHNjaGVtYS5oZWFkZXJGbG9hdENvdW50LFxuICAgIH07XG4gICAgdGhpcy5fZW5zdXJlQXJlbmFMYXlvdXQoKTtcblxuICAgIC8vIENob29zZSBiYWNraW5nXG4gICAgY29uc3QgaXNXZWJHUFUgPVxuICAgICAgKGVuZ2luZSBhcyBhbnkpLl9pc1dlYkdQVSB8fFxuICAgICAgKGVuZ2luZSBhcyBhbnkpLmdldENsYXNzTmFtZT8uKCkgPT09IFwiV2ViR1BVRW5naW5lXCI7XG4gICAgdGhpcy5fYmFja2luZyA9IGlzV2ViR1BVXG4gICAgICA/IG5ldyBTdG9yYWdlQmFja2luZyhlbmdpbmUgYXMgYW55IGFzIEJKUy5XZWJHUFVFbmdpbmUsIHNjaGVtYSwgdGhpcylcbiAgICAgIDogbmV3IERhdGFUZXhCYWNraW5nKGVuZ2luZSwgc2NoZW1hLCB0aGlzKTtcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQXJlbmEgKyByZXBhY2tpbmcgaW50ZXJuYWxzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICBwcml2YXRlIF9lbnN1cmVBcmVuYUxheW91dCgpIHtcbiAgICAvLyBQYWNrOiBoZWFkZXIgKyBhbGwgY3VycmVudCB2YXIgc2VnbWVudHMgKyBhbGwgc3RydWN0IHNlZ21lbnRzIChpbiBkZWNsYXJhdGlvbiBvcmRlcilcbiAgICBjb25zdCBzY2hlbWEgPSAodGhpcy5jb25zdHJ1Y3RvciBhcyBHUFVSZWNvcmRDdG9yKS5nZXRTY2hlbWEoKTtcblxuICAgIHR5cGUgRW50cnkgPSB7XG4gICAgICBraW5kOiBcImhlYWRlclwiIHwgXCJ2YXJcIiB8IFwic3RydWN0XCI7XG4gICAgICBuYW1lPzogc3RyaW5nO1xuICAgICAgc2VnOiBTZWdtZW50O1xuICAgICAgc3RyaWRlPzogbnVtYmVyO1xuICAgIH07XG4gICAgY29uc3QgZW50cmllczogRW50cnlbXSA9IFtdO1xuXG4gICAgZW50cmllcy5wdXNoKHsga2luZDogXCJoZWFkZXJcIiwgc2VnOiB0aGlzLl9oZWFkZXJTZWcgfSk7XG4gICAgZm9yIChjb25zdCBuYW1lIG9mIE9iamVjdC5rZXlzKHNjaGVtYS52YXJBcnJheXMpKSB7XG4gICAgICBlbnRyaWVzLnB1c2goe1xuICAgICAgICBraW5kOiBcInZhclwiLFxuICAgICAgICBuYW1lLFxuICAgICAgICBzZWc6ICh0aGlzLl92YXJTZWdbbmFtZV0gPz89IHsgb2ZmRjogMCwgbGVuRjogMCwgY2FwRjogMCB9KSxcbiAgICAgICAgc3RyaWRlOiBzY2hlbWEudmFyQXJyYXlzW25hbWVdLmZsb2F0U3RyaWRlLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbmFtZSBvZiBPYmplY3Qua2V5cyhzY2hlbWEuc3RydWN0QXJyYXlzKSkge1xuICAgICAgZW50cmllcy5wdXNoKHtcbiAgICAgICAga2luZDogXCJzdHJ1Y3RcIixcbiAgICAgICAgbmFtZSxcbiAgICAgICAgc2VnOiAodGhpcy5fc3RydWN0U2VnW25hbWVdID8/PSB7IG9mZkY6IDAsIGxlbkY6IDAsIGNhcEY6IDAgfSksXG4gICAgICAgIHN0cmlkZTogc2NoZW1hLnN0cnVjdEFycmF5c1tuYW1lXS5mbG9hdFN0cmlkZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIGFzc2lnbiBvZmZzZXRzIGxpbmVhcmx5XG4gICAgbGV0IGN1cnNvciA9IDA7XG4gICAgZm9yIChjb25zdCBlIG9mIGVudHJpZXMpIHtcbiAgICAgIGUuc2VnLm9mZkYgPSBjdXJzb3I7XG4gICAgICBjdXJzb3IgKz0gZS5zZWcuY2FwRiB8fCAwO1xuICAgIH1cbiAgICAvLyBlbnN1cmUgY2FwYWNpdHlcbiAgICB0aGlzLl9hcmVuYS5lbnN1cmVDYXBhY2l0eShjdXJzb3IpO1xuICB9XG5cbiAgcHJpdmF0ZSBfcmVwYWNrKG9wdHM/OiB7XG4gICAgZ3Jvd1Zhcj86IHsgZmllbGQ6IHN0cmluZzsgbmV3Q2FwRjogbnVtYmVyIH07XG4gICAgZ3Jvd1N0cnVjdD86IHsgZmllbGQ6IHN0cmluZzsgbmV3Q2FwRjogbnVtYmVyIH07XG4gIH0pIHtcbiAgICBjb25zdCBzY2hlbWEgPSAodGhpcy5jb25zdHJ1Y3RvciBhcyBHUFVSZWNvcmRDdG9yKS5nZXRTY2hlbWEoKTtcblxuICAgIC8vIGNvbXB1dGUgbmV3IGNhcHMgaW4gb3JkZXJcbiAgICBjb25zdCBuZXdIZWFkZXJDYXAgPSB0aGlzLl9oZWFkZXJTZWcuY2FwRjtcblxuICAgIGNvbnN0IHZhckZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS52YXJBcnJheXMpO1xuICAgIGNvbnN0IHN0cnVjdEZpZWxkcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5zdHJ1Y3RBcnJheXMpO1xuXG4gICAgY29uc3QgbmV3VmFyQ2FwczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICAgIGZvciAoY29uc3QgZiBvZiB2YXJGaWVsZHMpIHtcbiAgICAgIGNvbnN0IHNlZyA9ICh0aGlzLl92YXJTZWdbZl0gPz89IHsgb2ZmRjogMCwgbGVuRjogMCwgY2FwRjogMCB9KTtcbiAgICAgIGxldCBjYXAgPSBzZWcuY2FwRjtcbiAgICAgIGlmIChvcHRzPy5ncm93VmFyICYmIG9wdHMuZ3Jvd1Zhci5maWVsZCA9PT0gZikge1xuICAgICAgICBjYXAgPSBNYXRoLm1heChjYXAsIG9wdHMuZ3Jvd1Zhci5uZXdDYXBGKTtcbiAgICAgIH1cbiAgICAgIG5ld1ZhckNhcHNbZl0gPSBNYXRoLm1heChjYXAsIHNlZy5sZW5GKTtcbiAgICB9XG4gICAgY29uc3QgbmV3U3RydWN0Q2FwczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICAgIGZvciAoY29uc3QgZiBvZiBzdHJ1Y3RGaWVsZHMpIHtcbiAgICAgIGNvbnN0IHNlZyA9ICh0aGlzLl9zdHJ1Y3RTZWdbZl0gPz89IHsgb2ZmRjogMCwgbGVuRjogMCwgY2FwRjogMCB9KTtcbiAgICAgIGxldCBjYXAgPSBzZWcuY2FwRjtcbiAgICAgIGlmIChvcHRzPy5ncm93U3RydWN0ICYmIG9wdHMuZ3Jvd1N0cnVjdC5maWVsZCA9PT0gZikge1xuICAgICAgICBjYXAgPSBNYXRoLm1heChjYXAsIG9wdHMuZ3Jvd1N0cnVjdC5uZXdDYXBGKTtcbiAgICAgIH1cbiAgICAgIG5ld1N0cnVjdENhcHNbZl0gPSBNYXRoLm1heChjYXAsIHNlZy5sZW5GKTtcbiAgICB9XG5cbiAgICAvLyBuZXcgdG90YWxcbiAgICBsZXQgdG90YWxGID0gbmV3SGVhZGVyQ2FwO1xuICAgIGZvciAoY29uc3QgZiBvZiB2YXJGaWVsZHMpIHtcbiAgICAgIHRvdGFsRiArPSBuZXdWYXJDYXBzW2ZdO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGYgb2Ygc3RydWN0RmllbGRzKSB7XG4gICAgICB0b3RhbEYgKz0gbmV3U3RydWN0Q2Fwc1tmXTtcbiAgICB9XG5cbiAgICAvLyBidWlsZCBuZXcgYnVmZmVyIGFuZCBjb3B5IGV4aXN0aW5nIGNvbnRlbnRzXG4gICAgY29uc3Qgb2xkQnVmID0gdGhpcy5fYXJlbmEudGFrZSgpO1xuICAgIGNvbnN0IG5leHQgPSBuZXcgRmxvYXQzMkFycmF5KE1hdGgubWF4KDEsIHRvdGFsRikpO1xuXG4gICAgbGV0IGN1cnNvciA9IDA7XG4gICAgLy8gaGVhZGVyIC0+IGZyb20gaGVhZGVyUmF3IChhdXRob3JpdGF0aXZlKVxuICAgIHRoaXMuX2hlYWRlclNlZy5vZmZGID0gY3Vyc29yO1xuICAgIHRoaXMuX2hlYWRlclNlZy5jYXBGID0gbmV3SGVhZGVyQ2FwO1xuICAgIHRoaXMuX2hlYWRlclNlZy5sZW5GID0gbmV3SGVhZGVyQ2FwO1xuICAgIG5leHQuc2V0KG5ldyBGbG9hdDMyQXJyYXkodGhpcy5oZWFkZXJSYXcpLCBjdXJzb3IpO1xuICAgIGN1cnNvciArPSBuZXdIZWFkZXJDYXA7XG5cbiAgICAvLyB2YXIgZmllbGRzXG4gICAgZm9yIChjb25zdCBmIG9mIHZhckZpZWxkcykge1xuICAgICAgY29uc3Qgc2VnID0gdGhpcy5fdmFyU2VnW2ZdO1xuICAgICAgY29uc3QgbmV3Q2FwID0gbmV3VmFyQ2Fwc1tmXTtcbiAgICAgIGNvbnN0IG9sZFNsaWNlID1cbiAgICAgICAgc2VnLmNhcEYgJiYgc2VnLmxlbkZcbiAgICAgICAgICA/IG9sZEJ1Zi5zdWJhcnJheShzZWcub2ZmRiwgc2VnLm9mZkYgKyBzZWcubGVuRilcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgc2VnLm9mZkYgPSBjdXJzb3I7XG4gICAgICBzZWcuY2FwRiA9IG5ld0NhcDtcbiAgICAgIC8vIGNvcHkgY3VycmVudCBkYXRhIChub3QgcGFkZGluZylcbiAgICAgIGlmIChvbGRTbGljZSkge1xuICAgICAgICBuZXh0LnNldChvbGRTbGljZSwgc2VnLm9mZkYpO1xuICAgICAgfVxuICAgICAgY3Vyc29yICs9IG5ld0NhcDtcbiAgICB9XG5cbiAgICAvLyBzdHJ1Y3QgZmllbGRzXG4gICAgZm9yIChjb25zdCBmIG9mIHN0cnVjdEZpZWxkcykge1xuICAgICAgY29uc3Qgc2VnID0gdGhpcy5fc3RydWN0U2VnW2ZdO1xuICAgICAgY29uc3QgbmV3Q2FwID0gbmV3U3RydWN0Q2Fwc1tmXTtcbiAgICAgIGNvbnN0IG9sZFNsaWNlID1cbiAgICAgICAgc2VnLmNhcEYgJiYgc2VnLmxlbkZcbiAgICAgICAgICA/IG9sZEJ1Zi5zdWJhcnJheShzZWcub2ZmRiwgc2VnLm9mZkYgKyBzZWcubGVuRilcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgc2VnLm9mZkYgPSBjdXJzb3I7XG4gICAgICBzZWcuY2FwRiA9IG5ld0NhcDtcbiAgICAgIGlmIChvbGRTbGljZSkge1xuICAgICAgICBuZXh0LnNldChvbGRTbGljZSwgc2VnLm9mZkYpO1xuICAgICAgfVxuICAgICAgY3Vyc29yICs9IG5ld0NhcDtcbiAgICB9XG5cbiAgICAvLyBhZG9wdCBuZXcgYnVmZmVyXG4gICAgdGhpcy5fYXJlbmEuYWRvcHQobmV4dCk7XG4gICAgLy8gaGVhZGVyIGlzIHVwLXRvLWRhdGUgaW4gdGhlIGFyZW5hIG5vd1xuICAgIHRoaXMuX2hlYWRlckRpcnR5ID0gZmFsc2U7XG4gIH1cblxuICAvKiogQ2FsbGVkIGJ5IGJhY2tpbmdzIGR1cmluZyBjb21taXQuIENvcGllcyBoZWFkZXIgaWYgbmVlZGVkIGFuZCByZXR1cm5zIHRoZSB3aG9sZSBmbG9hdCBhcmVuYS4gKi9cbiAgcHVibGljIHByZXBhcmVVbmlmaWVkRm9yVXBsb2FkKCk6IEZsb2F0MzJBcnJheSB7XG4gICAgLy8gRW5zdXJlIGxheW91dCBleGlzdHNcbiAgICBpZiAodGhpcy5faGVhZGVyU2VnLmNhcEYgPT09IDApIHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9ICh0aGlzLmNvbnN0cnVjdG9yIGFzIEdQVVJlY29yZEN0b3IpLmdldFNjaGVtYSgpO1xuICAgICAgdGhpcy5faGVhZGVyU2VnID0ge1xuICAgICAgICBvZmZGOiAwLFxuICAgICAgICBsZW5GOiBzY2hlbWEuaGVhZGVyRmxvYXRDb3VudCxcbiAgICAgICAgY2FwRjogc2NoZW1hLmhlYWRlckZsb2F0Q291bnQsXG4gICAgICB9O1xuICAgICAgdGhpcy5fZW5zdXJlQXJlbmFMYXlvdXQoKTtcbiAgICAgIHRoaXMuX2hlYWRlckRpcnR5ID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5faGVhZGVyRGlydHkpIHtcbiAgICAgIC8vIE1ha2Ugc3VyZSBoZWFkZXIgc2xpY2UgZXhpc3RzLCB0aGVuIGNvcHkgaGVhZGVyUmF3IGludG8gYXJlbmFcbiAgICAgIHRoaXMuX2FyZW5hLndyaXRlKFxuICAgICAgICB0aGlzLl9oZWFkZXJTZWcub2ZmRixcbiAgICAgICAgbmV3IEZsb2F0MzJBcnJheSh0aGlzLmhlYWRlclJhdyksXG4gICAgICAgIHRoaXMuX2hlYWRlclNlZy5sZW5GLFxuICAgICAgKTtcbiAgICAgIHRoaXMuX2hlYWRlckRpcnR5ID0gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9hcmVuYS50YWtlKCk7XG4gIH1cbn1cbiJdfQ==