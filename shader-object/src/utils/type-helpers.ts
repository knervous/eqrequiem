import {
  type FieldType,
  type VarArrayType,
  type StructRef,
  type ScalarType,
  type VectorType,
  type MatrixType,
  type LazyCtor,
  LAZY_CTOR,
} from '../types';

// ------------------------------ Type Guards ------------------------------------
export function isVarArray(t: FieldType): t is VarArrayType {
  return typeof t === 'object' && !!(t as any)?.arrayOf;
}

export function isScalar(t: any): t is ScalarType {
  return t === 'f32' || t === 'i32' || t === 'u32';
}

export function isVector(t: any): t is VectorType {
  return t === 'vec2' || t === 'vec3' || t === 'vec4';
}

export function isMatrix(t: any): t is MatrixType {
  return t === 'mat2' || t === 'mat3' || t === 'mat4';
}

export function isVarArrayOfStruct(t: FieldType): t is VarArrayType {
  return isVarArray(t) && isStructRef(t.arrayOf as any);
}

// floats per element in our packed representation
export function floatStrideOf(t: ScalarType | VectorType | MatrixType): number {
  if (isScalar(t)) {
    return 1;
  }
  if (t === 'vec2') {
    return 2;
  }
  if (t === 'vec3') {
    return 4;
  } // padded to 4
  if (t === 'vec4') {
    return 4;
  }
  if (t === 'mat2') {
    return 4;
  } // 2 columns * vec2
  if (t === 'mat3') {
    return 12;
  } // 3 columns * padded vec3
  if (t === 'mat4') {
    return 16;
  } // 4 columns * vec4
  throw new Error(`Unknown type: ${t as any}`);
}

export function isStructRef(t: any): t is StructRef {
  return !!(t && typeof t === 'object' && 'structOf' in t);
}

// Utility so callers can write structOf: lazy(() => Foo)
export const lazy = <T>(fn: () => T): LazyCtor<T> => {
  (fn as any)[LAZY_CTOR] = true;
  return fn as LazyCtor<T>;
};

// Heuristic to detect a *class constructor* (works for native + most transpiled TS)
function isClassFunction(fn: any): boolean {
  if (typeof fn !== 'function') return false;
  const s = Function.prototype.toString.call(fn);
  if (/^\s*class\b/.test(s)) return true; // native class
  // transpiled/older patterns: prototype with members beyond 'constructor'
  const proto = fn.prototype;
  if (!proto) return false;
  const names = Object.getOwnPropertyNames(proto);
  // if it has any prototype methods besides constructor, it's likely a class-ish ctor
  return names.some(n => n !== 'constructor');
}

export function resolveCtor(x: any) {
  if (!x) return x;

  if (typeof x === 'function' && x[LAZY_CTOR]) {
    const out = (x as Function)();
    return resolveCtor(out);
  }

  if (typeof x === 'function' && isClassFunction(x)) {
    return x;
  }
  return x;
}
