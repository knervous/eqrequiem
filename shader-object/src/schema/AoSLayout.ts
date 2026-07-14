export type AoSScalarType =
  | 'bool'
  | 'i8'
  | 'u8'
  | 'i16'
  | 'u16'
  | 'i32'
  | 'u32'
  | 'f32'
  | 'i64'
  | 'u64'
  | 'f64';

export interface AoSFieldSpec {
  name: string;
  type: AoSScalarType;
  count?: number;
  id?: number;
}

export interface AoSFieldLayout extends AoSFieldSpec {
  count: number;
  byteOffset: number;
  byteSize: number;
  alignment: number;
}

export interface AoSLayout {
  readonly name: string;
  readonly layout: 'aos';
  readonly byteSize: number;
  readonly stride: number;
  readonly alignment: number;
  readonly fields: readonly AoSFieldLayout[];
}

type ScalarInfo = { byteSize: number; alignment: number };

export const AOS_SCALAR_INFO: Readonly<Record<AoSScalarType, ScalarInfo>> = Object.freeze({
  bool: { byteSize: 1, alignment: 1 },
  i8: { byteSize: 1, alignment: 1 },
  u8: { byteSize: 1, alignment: 1 },
  i16: { byteSize: 2, alignment: 2 },
  u16: { byteSize: 2, alignment: 2 },
  i32: { byteSize: 4, alignment: 4 },
  u32: { byteSize: 4, alignment: 4 },
  f32: { byteSize: 4, alignment: 4 },
  i64: { byteSize: 8, alignment: 8 },
  u64: { byteSize: 8, alignment: 8 },
  f64: { byteSize: 8, alignment: 8 },
});

export function compileAoSLayout(name: string, specs: readonly AoSFieldSpec[]): AoSLayout {
  if (!name.trim()) throw new Error('AoS layout name cannot be empty');

  const names = new Set<string>();
  const ids = new Set<number>();
  const fields: AoSFieldLayout[] = [];
  let cursor = 0;
  let structAlignment = 1;

  for (const spec of specs) {
    if (!spec.name || names.has(spec.name)) {
      throw new Error(`Duplicate or empty field name: ${spec.name}`);
    }
    names.add(spec.name);
    if (spec.id !== undefined) {
      if (!Number.isSafeInteger(spec.id) || spec.id <= 0 || ids.has(spec.id)) {
        throw new Error(`Invalid or duplicate field id: ${spec.id}`);
      }
      ids.add(spec.id);
    }

    const info = AOS_SCALAR_INFO[spec.type];
    if (!info) throw new Error(`Unsupported AoS scalar type: ${String(spec.type)}`);
    const count = spec.count ?? 1;
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error(`${name}.${spec.name} count must be a positive safe integer`);
    }

    cursor = alignUp(cursor, info.alignment);
    const byteSize = info.byteSize * count;
    fields.push({ ...spec, count, byteOffset: cursor, byteSize, alignment: info.alignment });
    cursor += byteSize;
    structAlignment = Math.max(structAlignment, info.alignment);
  }

  const stride = alignUp(cursor, structAlignment);
  return Object.freeze({
    name,
    layout: 'aos',
    byteSize: cursor,
    stride,
    alignment: structAlignment,
    fields: Object.freeze(fields.map(field => Object.freeze(field))),
  });
}

export function alignUp(value: number, alignment: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('value must be non-negative');
  if (!Number.isSafeInteger(alignment) || alignment <= 0 || (alignment & (alignment - 1)) !== 0) {
    throw new RangeError('alignment must be a positive power of two');
  }
  return Math.ceil(value / alignment) * alignment;
}
