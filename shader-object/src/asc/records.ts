const ASC_RECORD_META_KEY = Symbol('shado:ascRecordMeta');
const ASC_RECORD_FIELDS_KEY = Symbol('shado:ascRecordFields');
const ASC_RECORD_FIELD_LIST_KEY = '__shado:ascRecordFields:list';

export type AscRecordFieldType = 'i32' | 'u32' | 'f32' | 'f64' | 'vec2' | 'vec3' | 'vec4';

export type AscRecordField = {
  name: string;
  type: AscRecordFieldType;
  byteOffset?: number;
};

export type AscRecordSchema = {
  name: string;
  fields: AscRecordField[];
  byteSize?: number;
};

export type AscRecordConfig = {
  name?: string;
  byteSize?: number;
};

export type AscRecordFieldConfig = {
  byteOffset?: number;
};

export function ascRecord(meta: AscRecordConfig = {}) {
  return function (...args: any[]) {
    args = args.filter(Boolean);
    if (args.length === 1 && typeof args[0] === 'function') {
      const ctor = args[0];
      writeAscRecordMeta(ctor, meta);
      return;
    }
    if (args.length === 2 && typeof args[1] === 'object' && 'kind' in args[1]) {
      const value = args[0] as Function;
      const context = args[1];
      writeAscRecordMeta(value, meta);
      const aggregated =
        (context.metadata?.[ASC_RECORD_FIELD_LIST_KEY] as AscRecordField[] | undefined) ?? [];
      if (aggregated.length) {
        writeAscRecordFields(value, aggregated);
      }
      return;
    }
  };
}

export function ascField(type: AscRecordFieldType, config: AscRecordFieldConfig = {}) {
  return function (...args: any[]) {
    args = args.filter(Boolean);
    if (args.length === 2 && (typeof args[1] === 'string' || typeof args[1] === 'symbol')) {
      const target = args[0];
      const name = String(args[1]);
      const ctor = target.constructor;
      appendAscRecordField(ctor, { name, type, byteOffset: config.byteOffset });
      return;
    }
    if (args.length === 2 && typeof args[1] === 'object' && 'kind' in args[1]) {
      const context = args[1];
      const name = String(context.name);
      context.addInitializer(function (this: any) {
        const ctor = typeof this === 'function' ? this : this?.constructor;
        if (!ctor) return;
        appendAscRecordField(ctor, { name, type, byteOffset: config.byteOffset });
      });
      return;
    }
  };
}

export function readAscRecordSchema(ctor: any): AscRecordSchema | undefined {
  if (!ctor) return undefined;
  const existing = ctor.ascRecord ?? ctor.record ?? ctor.schema;
  if (isAscRecordSchema(existing)) {
    return {
      name: existing.name,
      fields: existing.fields.slice(),
      byteSize: existing.byteSize,
    };
  }
  const meta = readAscRecordMeta(ctor);
  const fields = readAscRecordFields(ctor);
  if (!meta && !fields.length) return undefined;
  return {
    name: meta?.name ?? ctor.name,
    fields,
    byteSize: meta?.byteSize,
  };
}

function writeAscRecordMeta(ctor: any, meta: AscRecordConfig): void {
  (Reflect as any).defineMetadata?.(ASC_RECORD_META_KEY, meta, ctor);
  ctor[ASC_RECORD_META_KEY] = meta;
}

function readAscRecordMeta(ctor: any): AscRecordConfig | undefined {
  return (
    (Reflect as any).getMetadata?.(ASC_RECORD_META_KEY, ctor) ??
    ctor[ASC_RECORD_META_KEY]
  ) as AscRecordConfig | undefined;
}

function writeAscRecordFields(ctor: any, fields: AscRecordField[]): void {
  (Reflect as any).defineMetadata?.(ASC_RECORD_FIELDS_KEY, fields, ctor);
  ctor[ASC_RECORD_FIELDS_KEY] = fields;
}

function readAscRecordFields(ctor: any): AscRecordField[] {
  return (
    ((Reflect as any).getMetadata?.(ASC_RECORD_FIELDS_KEY, ctor) ??
      ctor[ASC_RECORD_FIELDS_KEY] ??
      []) as AscRecordField[]
  ).slice();
}

function appendAscRecordField(ctor: any, field: AscRecordField): void {
  const fields = readAscRecordFields(ctor);
  if (!fields.some(existing => existing.name === field.name)) {
    fields.push(field);
  }
  writeAscRecordFields(ctor, fields);
}

function isAscRecordSchema(value: any): value is AscRecordSchema {
  return (
    value != null &&
    typeof value.name === 'string' &&
    Array.isArray(value.fields) &&
    value.fields.every(
      (field: any) => typeof field?.name === 'string' && typeof field?.type === 'string'
    )
  );
}
