// thin-accessors.ts
import { isScalar, floatStrideOf } from './type-helpers';

export function installThinAccessors(Ctor: any) {
  if (Ctor.__thinInstalled) return;
  const schema = Ctor.getSchema();
  const proto = Ctor.prototype;

  // parent arena & dataview (host if present, else self)
  Object.defineProperty(proto, '_hostOrSelf', {
    get() {
      return this._host ?? this;
    },
  });
  Object.defineProperty(proto, '_dv', {
    get() {
      return this._hostOrSelf._arena.dataView();
    },
  });
  Object.defineProperty(proto, '_arenaRef', {
    get() {
      return this._hostOrSelf._arena;
    },
  });

  proto._markDirty = function (offF: number, lenF: number) {
    this._hostOrSelf.emitHeaderDirty((this._baseF + offF) * 4, lenF * 4);
  };

  for (const f of schema.fields) {
    if (f.type?.arrayOf || f.type?.structOf) continue; // only plain fields here
    const offF = (f.headerFloatOffset ?? 0) | 0;
    const lenF = f.headerFloatSize ?? floatStrideOf(f.type);

    if (isScalar(f.type)) {
      const kind = f.type; // "f32" | "i32" | "u32"
      Object.defineProperty(proto, f.name, {
        get() {
          const b = (this._baseF + offF) * 4;
          switch (kind) {
            case 'f32':
              return this._dv.getFloat32(b, true);
            case 'i32':
              return this._dv.getInt32(b, true);
            case 'u32':
              return this._dv.getUint32(b, true);
          }
        },
        set(v: number) {
          const b = (this._baseF + offF) * 4;
          switch (kind) {
            case 'f32':
              this._dv.setFloat32(b, v, true);
              break;
            case 'i32':
              this._dv.setInt32(b, v | 0, true);
              break;
            case 'u32':
              this._dv.setUint32(b, v >>> 0, true);
              break;
          }
          this._markDirty(offF, 1);
        },
        enumerable: true,
      });
    } else {
      // vec/mat: live alias that refreshes if parent arena re-adopts memory
      const cacheKey = `__live_${f.name}`;
      Object.defineProperty(proto, f.name, {
        get() {
          let v = this[cacheKey];
          const buf = this._arenaRef.take().buffer;
          if (!v || v.buffer !== buf) {
            v = this._arenaRef.view(this._baseF + offF, lenF);
            this[cacheKey] = v;
          }
          return v;
        },
        set(arr: ArrayLike<number>) {
          const L = Math.min(lenF, (arr as any)?.length ?? 0);
          this._arenaRef.write(this._baseF + offF, arr, L);
          this._markDirty(offF, L);
        },
        enumerable: true,
      });
    }
  }

  Ctor.__thinInstalled = true;
}
