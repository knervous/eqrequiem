export class FloatArena {
  private ab: ArrayBuffer;
  private f32: Float32Array;
  private dv: DataView;
  private dirty = true;
  private listeners: Array<() => void> = [];
  private canResize = false;

  constructor(initialFloats = 1024, maxFloats = 1 << 22) {
    try {
      // @ts-ignore
      this.ab = new ArrayBuffer(initialFloats * 4, {
        maxByteLength: maxFloats * 4,
      });
      this.canResize = this.isResizableAB(this.ab);
    } catch {
      this.ab = new ArrayBuffer(initialFloats * 4);
    }
    this.f32 = new Float32Array(this.ab);
    this.dv = new DataView(this.ab, this.f32.byteOffset, this.f32.byteLength);
  }

  private isResizableAB(ab: ArrayBuffer): boolean {
    const any = ab as any;
    if (typeof any.resizable === 'boolean') return any.resizable;
    if (typeof any.maxByteLength === 'number') return any.maxByteLength > ab.byteLength;
    return false;
  }

  onRealloc(cb: () => void) {
    this.listeners.push(cb);
  }

  private rebroadcast() {
    for (const fn of this.listeners) fn();
  }

  ensureCapacity(nextF: number) {
    if (nextF <= this.f32.length) return;
    const newF = Math.max(nextF, this.f32.length ? this.f32.length * 2 : 1024);

    if (this.canResize && this.isResizableAB(this.ab)) {
      try {
        // @ts-ignore
        (this.ab as any).resize(newF * 4);
        this.f32 = new Float32Array(this.ab);
        this.dv = new DataView(this.ab, this.f32.byteOffset, this.f32.byteLength);
        this.dirty = true;
        this.rebroadcast();
        return;
      } catch {
        this.canResize = false;
      }
    }

    const nextAB = new ArrayBuffer(newF * 4);
    const nextF32 = new Float32Array(nextAB);
    nextF32.set(this.f32);
    this.ab = nextAB;
    this.f32 = nextF32;
    this.dv = new DataView(this.ab, this.f32.byteOffset, this.f32.byteLength);
    this.dirty = true;
    this.rebroadcast();
  }

  write(offF: number, src: ArrayLike<number>, lenF = (src as any).length ?? 0) {
    this.ensureCapacity(offF + lenF);
    if ((src as any).subarray) {
      this.f32.set((src as any).subarray(0, lenF), offF);
    } else {
      for (let i = 0; i < lenF; i++) this.f32[offF + i] = (src as any)[i];
    }
    this.dirty = true;
  }

  view(offF: number, lenF: number): Float32Array {
    return new Float32Array(this.ab, this.f32.byteOffset + offF * 4, lenF);
  }

  dataView(): DataView {
    return this.dv;
  }
  take(): Float32Array {
    return this.f32;
  }
  isDirty() {
    return this.dirty;
  }
  markClean() {
    this.dirty = false;
  }
  public markDirty() {
    this.dirty = true;
  }
  adopt(next: Float32Array) {
    this.ab = next.buffer as any;
    this.f32 = next;
    this.dv = new DataView(this.ab, this.f32.byteOffset, this.f32.byteLength);
    this.canResize = this.isResizableAB(this.ab);
    this.dirty = true;
    this.rebroadcast();
  }
}
