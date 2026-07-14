import type { MatrixType, ScalarType, VectorType } from '../types';

export function toWGSLType(t: ScalarType | VectorType | MatrixType): string {
  switch (t) {
    case 'f32':
      return 'f32';
    case 'i32':
      return 'i32';
    case 'u32':
      return 'u32';
    case 'vec2':
      return 'vec2f';
    case 'vec3':
      return 'vec3f';
    case 'vec4':
      return 'vec4f';
    case 'mat2':
      return 'mat2x2f';
    case 'mat3':
      return 'mat3x3f';
    case 'mat4':
      return 'mat4x4f';
    default:
      throw new Error(`Unknown WGSL type: ${t as any}`);
  }
}

export function toGLSLType(t: ScalarType | VectorType | MatrixType): string {
  switch (t) {
    case 'f32':
      return 'float';
    case 'i32':
      return 'int';
    case 'u32':
      return 'uint';
    case 'vec2':
      return 'vec2';
    case 'vec3':
      return 'vec3';
    case 'vec4':
      return 'vec4';
    case 'mat2':
      return 'mat2';
    case 'mat3':
      return 'mat3';
    case 'mat4':
      return 'mat4';
    default:
      throw new Error(`Unknown GLSL type: ${t as any}`);
  }
}

export const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const roundUpFloats = (x: number, a: number) => Math.ceil(x / a) * a;
