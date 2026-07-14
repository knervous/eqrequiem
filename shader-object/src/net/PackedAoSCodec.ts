import type { AoSFieldLayout, AoSLayout, AoSScalarType } from '../schema/AoSLayout';

export type AoSScalarValue = number | bigint | boolean;
export type AoSFieldValue = AoSScalarValue | readonly AoSScalarValue[];
export type AoSRecord = Record<string, AoSFieldValue>;

export function encodePackedAoS(
  layout: AoSLayout,
  value: Readonly<AoSRecord>,
  target = new Uint8Array(layout.stride),
  byteOffset = 0
): Uint8Array {
  assertBounds(target.byteLength, byteOffset, layout.stride);
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  target.fill(0, byteOffset, byteOffset + layout.stride);
  for (const field of layout.fields) writeField(view, byteOffset, field, value[field.name]);
  return target;
}

export function decodePackedAoS(layout: AoSLayout, source: Uint8Array, byteOffset = 0): AoSRecord {
  assertBounds(source.byteLength, byteOffset, layout.stride);
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const out: AoSRecord = {};
  for (const field of layout.fields) {
    if (field.count === 1) {
      out[field.name] = readScalar(view, byteOffset + field.byteOffset, field.type);
    } else {
      const values: AoSScalarValue[] = [];
      const scalarSize = field.byteSize / field.count;
      for (let i = 0; i < field.count; i++) {
        values.push(readScalar(view, byteOffset + field.byteOffset + i * scalarSize, field.type));
      }
      out[field.name] = values;
    }
  }
  return out;
}

function writeField(
  view: DataView,
  baseOffset: number,
  field: AoSFieldLayout,
  value: AoSFieldValue | undefined
): void {
  if (value === undefined) throw new TypeError(`Missing AoS field ${field.name}`);
  const values = field.count === 1 ? [value as AoSScalarValue] : value;
  if (!Array.isArray(values) || values.length !== field.count) {
    throw new TypeError(`${field.name} must contain exactly ${field.count} values`);
  }
  const scalarSize = field.byteSize / field.count;
  for (let i = 0; i < field.count; i++) {
    writeScalar(view, baseOffset + field.byteOffset + i * scalarSize, field.type, values[i]!);
  }
}

function writeScalar(
  view: DataView,
  offset: number,
  type: AoSScalarType,
  value: AoSScalarValue
): void {
  switch (type) {
    case 'bool':
      view.setUint8(offset, value ? 1 : 0);
      break;
    case 'i8':
      view.setInt8(offset, Number(value));
      break;
    case 'u8':
      view.setUint8(offset, Number(value));
      break;
    case 'i16':
      view.setInt16(offset, Number(value), true);
      break;
    case 'u16':
      view.setUint16(offset, Number(value), true);
      break;
    case 'i32':
      view.setInt32(offset, Number(value), true);
      break;
    case 'u32':
      view.setUint32(offset, Number(value), true);
      break;
    case 'f32':
      view.setFloat32(offset, Number(value), true);
      break;
    case 'i64':
      view.setBigInt64(offset, BigInt(value), true);
      break;
    case 'u64':
      view.setBigUint64(offset, BigInt(value), true);
      break;
    case 'f64':
      view.setFloat64(offset, Number(value), true);
      break;
  }
}

function readScalar(view: DataView, offset: number, type: AoSScalarType): AoSScalarValue {
  switch (type) {
    case 'bool':
      return view.getUint8(offset) !== 0;
    case 'i8':
      return view.getInt8(offset);
    case 'u8':
      return view.getUint8(offset);
    case 'i16':
      return view.getInt16(offset, true);
    case 'u16':
      return view.getUint16(offset, true);
    case 'i32':
      return view.getInt32(offset, true);
    case 'u32':
      return view.getUint32(offset, true);
    case 'f32':
      return view.getFloat32(offset, true);
    case 'i64':
      return view.getBigInt64(offset, true);
    case 'u64':
      return view.getBigUint64(offset, true);
    case 'f64':
      return view.getFloat64(offset, true);
  }
}

function assertBounds(byteLength: number, byteOffset: number, required: number): void {
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset + required > byteLength) {
    throw new RangeError(
      `AoS record at byte offset ${byteOffset} exceeds the ${byteLength}-byte buffer`
    );
  }
}
