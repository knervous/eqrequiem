const CLASS_META_KEY = Symbol('gpu:classMeta');
const FIELD_META_KEY = Symbol('gpu:fieldMeta');
const META_FIELDS_KEY = '__gpu:fields:list';

export type PendingField = { name: string; type: any };

export type ShadoConfig = {
  name?: string;
  useWasm?: boolean;
  /** GPU is the existing float/storage layout; net uses the fixed byte-addressed ABI emitter. */
  layout?: 'gpu' | 'net';
  schemaId?: number;
  version?: number;
};

export function gpuStruct(meta: ShadoConfig = {}) {
  return function (...args: any[]) {
    args = args.filter(Boolean);
    if (args.length === 1 && typeof args[0] === 'function') {
      const ctor = args[0];
      (Reflect as any).defineMetadata?.(CLASS_META_KEY, meta, ctor);
      ctor[CLASS_META_KEY] = meta;
      return;
    }
    if (args.length === 2 && typeof args[1] === 'object' && 'kind' in args[1]) {
      const value = args[0] as Function;
      const context = args[1];
      (Reflect as any).defineMetadata?.(CLASS_META_KEY, meta, value);
      (value as any)[CLASS_META_KEY] = meta;
      const aggregated: PendingField[] =
        (context.metadata?.[META_FIELDS_KEY] as PendingField[] | undefined) ?? [];
      if (aggregated.length) {
        (Reflect as any).defineMetadata?.(FIELD_META_KEY, aggregated, value);
        (value as any)[FIELD_META_KEY] = aggregated;
      }
      return;
    }
  };
}

export function field(typeOrIndex: any, maybeType?: any) {
  const type = arguments.length > 1 ? maybeType : typeOrIndex;
  return function (...args: any[]) {
    args = args.filter(Boolean);
    if (args.length === 2 && (typeof args[1] === 'string' || typeof args[1] === 'symbol')) {
      const target = args[0];
      const name = String(args[1]);
      const ctor = target.constructor;
      const arr: PendingField[] = Object.prototype.hasOwnProperty.call(ctor, FIELD_META_KEY)
        ? ctor[FIELD_META_KEY]
        : ([...(ctor[FIELD_META_KEY] ?? [])] as PendingField[]);
      arr.push({ name, type });
      ctor[FIELD_META_KEY] = arr;
      return;
    }
    if (args.length === 2 && typeof args[1] === 'object' && 'kind' in args[1]) {
      const context = args[1];
      const name = String(context.name);
      context.addInitializer(function (this: any) {
        const ctor = typeof this === 'function' ? this : this?.constructor;
        if (!ctor) return;
        const arr: PendingField[] = Object.prototype.hasOwnProperty.call(ctor, FIELD_META_KEY)
          ? ctor[FIELD_META_KEY]
          : ([...(ctor[FIELD_META_KEY] ?? [])] as PendingField[]);
        if (!arr.some((f: any) => f.name === name)) arr.push({ name, type });
        ctor[FIELD_META_KEY] = arr;
      });
      return;
    }
  };
}

export function readClassMeta(ctor: any): ShadoConfig {
  return ((Reflect as any).getMetadata?.(CLASS_META_KEY, ctor) ??
    ctor[CLASS_META_KEY] ??
    {}) as ShadoConfig;
}
export function readFields(ctor: any): PendingField[] {
  return (
    ((Reflect as any).getMetadata?.(FIELD_META_KEY, ctor) ??
      ctor[FIELD_META_KEY] ??
      []) as PendingField[]
  ).slice();
}
