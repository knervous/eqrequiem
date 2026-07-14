export type ByteArenaBuffer = ArrayBuffer | SharedArrayBuffer;

export class ByteArena {
  private bufferValue: ByteArenaBuffer;
  private bytesValue: Uint8Array;
  private dataViewValue: DataView;

  constructor(initialBytesOrBuffer: number | ByteArenaBuffer = 1024) {
    this.bufferValue =
      typeof initialBytesOrBuffer === 'number'
        ? new ArrayBuffer(assertNonNegativeInteger(initialBytesOrBuffer, 'initialBytes'))
        : initialBytesOrBuffer;
    this.bytesValue = new Uint8Array(this.bufferValue);
    this.dataViewValue = new DataView(this.bufferValue);
  }

  get buffer(): ByteArenaBuffer {
    return this.bufferValue;
  }

  get byteLength(): number {
    return this.bufferValue.byteLength;
  }

  get bytes(): Uint8Array {
    return this.bytesValue;
  }

  get dataView(): DataView {
    return this.dataViewValue;
  }

  ensureCapacity(requiredBytes: number): void {
    requiredBytes = assertNonNegativeInteger(requiredBytes, 'requiredBytes');
    if (requiredBytes <= this.byteLength) return;
    if (this.bufferValue instanceof SharedArrayBuffer) {
      throw new RangeError('A SharedArrayBuffer-backed ByteArena cannot be resized');
    }

    const nextLength = Math.max(requiredBytes, this.byteLength > 0 ? this.byteLength * 2 : 1024);
    const next = new ArrayBuffer(nextLength);
    new Uint8Array(next).set(this.bytesValue);
    this.adopt(next);
  }

  adopt(buffer: ByteArenaBuffer): void {
    this.bufferValue = buffer;
    this.bytesValue = new Uint8Array(buffer);
    this.dataViewValue = new DataView(buffer);
  }

  viewU8(byteOffset: number, count: number): Uint8Array {
    return new Uint8Array(this.bufferValue, byteOffset, count);
  }

  viewU16(byteOffset: number, count: number): Uint16Array {
    return new Uint16Array(this.bufferValue, byteOffset, count);
  }

  viewI16(byteOffset: number, count: number): Int16Array {
    return new Int16Array(this.bufferValue, byteOffset, count);
  }

  viewU32(byteOffset: number, count: number): Uint32Array {
    return new Uint32Array(this.bufferValue, byteOffset, count);
  }

  viewI32(byteOffset: number, count: number): Int32Array {
    return new Int32Array(this.bufferValue, byteOffset, count);
  }

  viewF32(byteOffset: number, count: number): Float32Array {
    return new Float32Array(this.bufferValue, byteOffset, count);
  }

  viewF64(byteOffset: number, count: number): Float64Array {
    return new Float64Array(this.bufferValue, byteOffset, count);
  }
}

function assertNonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}
