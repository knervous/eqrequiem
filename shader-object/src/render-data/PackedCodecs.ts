const floatBits = new Float32Array(1);
const uintBits = new Uint32Array(floatBits.buffer);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function float32ToUint32(value: number): number {
  floatBits[0] = value;
  return uintBits[0] >>> 0;
}

export function uint32ToFloat32(value: number): number {
  uintBits[0] = value >>> 0;
  return floatBits[0];
}

export function pack2x16Unorm(x: number, y: number): number {
  const low = Math.round(clamp(x, 0, 1) * 0xffff);
  const high = Math.round(clamp(y, 0, 1) * 0xffff);
  return (low | (high << 16)) >>> 0;
}

export function unpack2x16Unorm(value: number): [number, number] {
  return [(value & 0xffff) / 0xffff, ((value >>> 16) & 0xffff) / 0xffff];
}

export function pack2x16Snorm(x: number, y: number): number {
  const low = Math.round(clamp(x, -1, 1) * 0x7fff) & 0xffff;
  const high = Math.round(clamp(y, -1, 1) * 0x7fff) & 0xffff;
  return (low | (high << 16)) >>> 0;
}

function unpackSnorm16(value: number): number {
  const signed = value & 0x8000 ? value - 0x10000 : value;
  return Math.max(-1, signed / 0x7fff);
}

export function unpack2x16Snorm(value: number): [number, number] {
  return [unpackSnorm16(value & 0xffff), unpackSnorm16((value >>> 16) & 0xffff)];
}

export function packRgba8Unorm(color: ArrayLike<number>): number {
  const r = Math.round(clamp(color[0] ?? 0, 0, 1) * 0xff);
  const g = Math.round(clamp(color[1] ?? 0, 0, 1) * 0xff);
  const b = Math.round(clamp(color[2] ?? 0, 0, 1) * 0xff);
  const a = Math.round(clamp(color[3] ?? 1, 0, 1) * 0xff);
  return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}

export function unpackRgba8Unorm(value: number): [number, number, number, number] {
  return [
    (value & 0xff) / 0xff,
    ((value >>> 8) & 0xff) / 0xff,
    ((value >>> 16) & 0xff) / 0xff,
    ((value >>> 24) & 0xff) / 0xff,
  ];
}
