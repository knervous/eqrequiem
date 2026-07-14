import type { Shado } from '../core/Shado';
import type { ShadoStructSchema } from '../schema/ShadoStructSchema';
import { isVarArray, isScalar } from './type-helpers';

export function createEmbeddedProxyFromArena(
  parent: Shado,
  childCtor: { getSchema(): ShadoStructSchema },
  baseFloatOffset: number
): any {
  const schema = childCtor.getSchema();
  const view = (parent as any)._arena.dataView();
  const baseByte = baseFloatOffset * 4;

  const proxy: any = {};
  for (const f of schema.fields) {
    if (isVarArray(f.type) || f?.headerFloatOffset === undefined) {
      continue;
    } // header-only
    const offB = baseByte + f.headerFloatOffset * 4;
    const szF = f.headerFloatSize;
    if (isScalar(f.type as any)) {
      Object.defineProperty(proxy, f.name, {
        get: () => {
          switch (f.type) {
            case 'f32':
              return view.getFloat32(offB, true);
            case 'i32':
              return view.getInt32(offB, true);
            case 'u32':
              return view.getUint32(offB, true);
            default:
              throw new Error(`Unsupported scalar type: ${f.type}`);
          }
        },
        set: (v: number) => {
          if (v === null) return;
          switch (f.type) {
            case 'f32':
              view.setFloat32(offB, v, true);
              break;
            case 'i32':
              view.setInt32(offB, v | 0, true);
              break;
            case 'u32':
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
    } else {
      const live = (parent as any)._arena.view(offB >> 2, szF);
      Object.defineProperty(proxy, f.name, {
        get: () => live,
        set: (arr: ArrayLike<number>) => {
          if (arr === null) return;
          const L = Math.min(live.length, (arr as any).length ?? 0);
          for (let i = 0; i < L; i++) {
            live[i] = (arr as any)[i];
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
