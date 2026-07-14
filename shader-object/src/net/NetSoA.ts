import { alignUp, type AoSScalarType } from '../schema/AoSLayout';
import type { NetFieldLayout, NetStructLayout } from './NetLayout';

export interface NetSoAPlane {
  readonly path: string;
  readonly type: AoSScalarType;
  readonly components: number;
  readonly alignment: number;
  readonly scalarBytes: number;
  readonly visibility: 'public' | 'private';
}

export interface NetSoAPlaneLayout extends NetSoAPlane {
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface NetSoALayout {
  readonly schema: NetStructLayout;
  readonly count: number;
  readonly byteLength: number;
  readonly planes: readonly NetSoAPlaneLayout[];
}

export type NetTypedArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | BigUint64Array
  | BigInt64Array
  | Float64Array;

/** Flatten nested fixed structs into GPU-friendly scalar planes. */
export function compileNetSoALayout(schema: NetStructLayout, count: number): NetSoALayout {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new RangeError('SoA count must be non-negative');
  const planes = flatten(schema.fields);
  const laidOut: NetSoAPlaneLayout[] = [];
  let cursor = 0;
  for (const plane of planes) {
    cursor = alignUp(cursor, plane.alignment);
    const byteLength = plane.scalarBytes * plane.components * count;
    laidOut.push(Object.freeze({ ...plane, byteOffset: cursor, byteLength }));
    cursor += byteLength;
  }
  return Object.freeze({
    schema,
    count,
    byteLength: alignUp(cursor, 8),
    planes: Object.freeze(laidOut),
  });
}

export class NetSoABatchView {
  readonly layout: NetSoALayout;
  readonly bytes: Uint8Array;
  private readonly byPath = new Map<string, NetSoAPlaneLayout>();

  constructor(
    readonly schema: NetStructLayout,
    readonly count: number,
    buffer: ArrayBufferLike = new ArrayBuffer(compileNetSoALayout(schema, count).byteLength),
    readonly byteOffset = 0
  ) {
    this.layout = compileNetSoALayout(schema, count);
    if (byteOffset < 0 || byteOffset + this.layout.byteLength > buffer.byteLength) {
      throw new RangeError('SoA batch exceeds its backing buffer');
    }
    this.bytes = new Uint8Array(buffer, byteOffset, this.layout.byteLength);
    for (const plane of this.layout.planes) this.byPath.set(plane.path, plane);
  }

  plane(path: string): NetTypedArray {
    const plane = this.byPath.get(path);
    if (!plane) throw new Error(`Unknown SoA plane ${path}`);
    return typedArray(
      plane.type,
      this.bytes.buffer,
      this.bytes.byteOffset + plane.byteOffset,
      this.count * plane.components
    );
  }

  /** A zero-copy byte region ready for a raw WebGPU storage-buffer upload. */
  gpuPayload(): Uint8Array {
    return this.bytes;
  }

  publicPlaneNames(): string[] {
    return this.layout.planes
      .filter(plane => plane.visibility === 'public')
      .map(plane => plane.path);
  }
}

/** UTF-8 sidecar with stable offset/length references for names and other strings. */
export class NetStringSidecarBuilder {
  private readonly encoded: Uint8Array[] = [];
  private totalBytes = 0;

  add(value: string): { byteOffset: number; byteLength: number } {
    const bytes = new TextEncoder().encode(value);
    const ref = { byteOffset: this.totalBytes, byteLength: bytes.byteLength };
    this.encoded.push(bytes);
    this.totalBytes += bytes.byteLength;
    return ref;
  }

  finish(target = new Uint8Array(this.totalBytes)): Uint8Array {
    if (target.byteLength < this.totalBytes) throw new RangeError('sidecar target is too small');
    let cursor = 0;
    for (const value of this.encoded) {
      target.set(value, cursor);
      cursor += value.byteLength;
    }
    return target.subarray(0, this.totalBytes);
  }
}

export function readNetString(sidecar: Uint8Array, byteOffset: number, byteLength: number): string {
  if (byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > sidecar.byteLength) {
    throw new RangeError('string reference exceeds its sidecar');
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(
    sidecar.subarray(byteOffset, byteOffset + byteLength)
  );
}

function flatten(fields: readonly NetFieldLayout[], prefix = ''): NetSoAPlane[] {
  const out: NetSoAPlane[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.kind === 'struct') {
      if (field.count !== 1)
        throw new Error(`${path}: arrays of nested structs need an explicit projection`);
      out.push(...flatten(field.struct.fields, path));
      continue;
    }
    const scalarBytes = field.byteSize / field.count;
    out.push({
      path,
      type: field.type,
      components: field.count,
      alignment: field.alignment,
      scalarBytes,
      visibility: field.visibility ?? 'public',
    });
  }
  return out;
}

function typedArray(
  type: AoSScalarType,
  buffer: ArrayBufferLike,
  byteOffset: number,
  count: number
): NetTypedArray {
  switch (type) {
    case 'bool':
    case 'u8':
      return new Uint8Array(buffer, byteOffset, count);
    case 'i8':
      return new Int8Array(buffer, byteOffset, count);
    case 'u16':
      return new Uint16Array(buffer, byteOffset, count);
    case 'i16':
      return new Int16Array(buffer, byteOffset, count);
    case 'u32':
      return new Uint32Array(buffer, byteOffset, count);
    case 'i32':
      return new Int32Array(buffer, byteOffset, count);
    case 'f32':
      return new Float32Array(buffer, byteOffset, count);
    case 'u64':
      return new BigUint64Array(buffer, byteOffset, count);
    case 'i64':
      return new BigInt64Array(buffer, byteOffset, count);
    case 'f64':
      return new Float64Array(buffer, byteOffset, count);
  }
}
