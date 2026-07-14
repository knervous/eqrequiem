import { AOS_SCALAR_INFO, alignUp, type AoSScalarType } from '../schema/AoSLayout';

export interface NetScalarFieldSpec {
  readonly id: number;
  readonly name: string;
  readonly type: AoSScalarType;
  readonly count?: number;
  readonly visibility?: 'public' | 'private';
}

export interface NetStructRef {
  readonly struct: string;
  /** Inline only these fields from the referenced struct. Omit to inline all fields. */
  readonly pick?: readonly string[];
  /** Inline every non-private field. Mutually exclusive with pick. */
  readonly visibility?: 'public';
}

export interface NetStructFieldSpec {
  readonly id: number;
  readonly name: string;
  readonly type: NetStructRef;
  readonly count?: number;
  readonly visibility?: 'public' | 'private';
}

export type NetFieldSpec = NetScalarFieldSpec | NetStructFieldSpec;

export interface NetStructSpec {
  readonly name: string;
  readonly layout: 'net';
  readonly schemaId: number;
  readonly version?: number;
  readonly storage?: 'aos' | 'soa';
  readonly variants?: readonly NetVariantSpec[];
  readonly fields: readonly NetFieldSpec[];
}

export interface NetVariantSpec {
  readonly name: string;
  readonly tag: number;
  readonly fields: readonly string[];
}

export interface NetScalarFieldLayout extends NetScalarFieldSpec {
  readonly kind: 'scalar';
  readonly count: number;
  readonly byteOffset: number;
  readonly byteSize: number;
  readonly alignment: number;
}

export interface NetStructFieldLayout extends NetStructFieldSpec {
  readonly kind: 'struct';
  readonly count: number;
  readonly byteOffset: number;
  readonly byteSize: number;
  readonly alignment: number;
  readonly struct: NetStructLayout;
}

export type NetFieldLayout = NetScalarFieldLayout | NetStructFieldLayout;

export interface NetStructLayout {
  readonly name: string;
  readonly layout: 'net';
  readonly schemaId: number;
  readonly version: number;
  readonly byteSize: number;
  readonly stride: number;
  readonly alignment: number;
  readonly schemaHash: bigint;
  readonly fields: readonly NetFieldLayout[];
  /** Projection layouts are inline-only and do not have their own packet identity. */
  readonly projectionOf?: string;
  readonly storage: 'aos' | 'soa';
  readonly variants: readonly NetVariantSpec[];
}

/**
 * Compile the fixed-width network ABI. Struct references are inline regions, so a
 * packet remains one contiguous block suitable for Wasm memory and GPU upload.
 */
export function compileNetLayouts(
  specs: readonly NetStructSpec[]
): ReadonlyMap<string, NetStructLayout> {
  const byName = new Map<string, NetStructSpec>();
  const schemaIds = new Set<number>();
  for (const spec of specs) {
    if (!/^[$A-Z_a-z][$\w]*$/.test(spec.name) || byName.has(spec.name)) {
      throw new Error(`Invalid or duplicate net struct name: ${spec.name}`);
    }
    if (spec.layout !== 'net') throw new Error(`${spec.name} must use layout \"net\"`);
    if (
      !Number.isSafeInteger(spec.schemaId) ||
      spec.schemaId <= 0 ||
      schemaIds.has(spec.schemaId)
    ) {
      throw new Error(`Invalid or duplicate net schema ID: ${spec.schemaId}`);
    }
    byName.set(spec.name, spec);
    schemaIds.add(spec.schemaId);
  }

  const compiled = new Map<string, NetStructLayout>();
  const compiling = new Set<string>();

  const compile = (name: string): NetStructLayout => {
    const existing = compiled.get(name);
    if (existing) return existing;
    const spec = byName.get(name);
    if (!spec) throw new Error(`Unknown net struct reference: ${name}`);
    if (compiling.has(name)) throw new Error(`Recursive net struct reference involving ${name}`);
    compiling.add(name);
    const result = compileFields(spec, spec.fields, compile);
    compiling.delete(name);
    compiled.set(name, result);
    return result;
  };

  for (const spec of specs) compile(spec.name);
  return compiled;
}

function compileFields(
  owner: NetStructSpec,
  fields: readonly NetFieldSpec[],
  resolve: (name: string) => NetStructLayout,
  projectionOf?: string
): NetStructLayout {
  const names = new Set<string>();
  const ids = new Set<number>();
  const laidOut: NetFieldLayout[] = [];
  let cursor = 0;
  let alignment = 1;

  for (const field of fields) {
    if (!field.name || names.has(field.name))
      throw new Error(`Duplicate or empty field name: ${field.name}`);
    if (!Number.isSafeInteger(field.id) || field.id <= 0 || ids.has(field.id)) {
      throw new Error(`Invalid or duplicate field id: ${field.id}`);
    }
    const count = field.count ?? 1;
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error(`${owner.name}.${field.name} count must be a positive safe integer`);
    }
    names.add(field.name);
    ids.add(field.id);

    if (typeof field.type === 'string') {
      const info = AOS_SCALAR_INFO[field.type];
      if (!info) throw new Error(`Unsupported net scalar type: ${String(field.type)}`);
      cursor = alignUp(cursor, info.alignment);
      const byteSize = info.byteSize * count;
      laidOut.push(
        Object.freeze({
          ...field,
          kind: 'scalar',
          count,
          byteOffset: cursor,
          byteSize,
          alignment: info.alignment,
        })
      );
      cursor += byteSize;
      alignment = Math.max(alignment, info.alignment);
      continue;
    }

    const referenced = resolve(field.type.struct);
    let nested = referenced;
    if (field.type.pick && field.type.visibility) {
      throw new Error(`${owner.name}.${field.name} cannot specify both pick and visibility`);
    }
    const selection =
      field.type.pick ??
      (field.type.visibility === 'public'
        ? referenced.fields
            .filter(candidate => candidate.visibility !== 'private')
            .map(candidate => candidate.name)
        : undefined);
    if (selection) {
      const picked = selection.map(fieldName => {
        const match = referenced.fields.find(candidate => candidate.name === fieldName);
        if (!match)
          throw new Error(
            `${owner.name}.${field.name} picks unknown field ${referenced.name}.${fieldName}`
          );
        return toSpec(match);
      });
      if (new Set(selection).size !== selection.length) {
        throw new Error(`${owner.name}.${field.name} contains duplicate picked fields`);
      }
      nested = compileFields(
        {
          ...owner,
          name: `${owner.name}_${field.name}`,
          schemaId: 0,
          storage: 'aos',
          variants: undefined,
        },
        picked,
        resolve,
        referenced.name
      );
    }
    cursor = alignUp(cursor, nested.alignment);
    const byteSize = nested.stride * count;
    laidOut.push(
      Object.freeze({
        ...field,
        kind: 'struct',
        count,
        byteOffset: cursor,
        byteSize,
        alignment: nested.alignment,
        struct: nested,
      })
    );
    cursor += byteSize;
    alignment = Math.max(alignment, nested.alignment);
  }

  const stride = alignUp(cursor, alignment);
  const version = owner.version ?? 1;
  validateVariants(owner, laidOut);
  const storage = owner.storage ?? 'aos';
  const variants = owner.variants ?? [];
  const normalized = `${version}|${storage}|${stride}|${laidOut
    .map(field =>
      field.kind === 'scalar'
        ? `${field.id}:${field.type}:${field.count}:${field.byteOffset}:${field.visibility ?? 'public'}`
        : `${field.id}:struct:${field.count}:${field.byteOffset}:${field.struct.schemaHash.toString(16)}:${field.visibility ?? 'public'}`
    )
    .join('|')}|${variants.map(variant => `${variant.tag}:${variant.fields.join(',')}`).join(';')}`;
  return Object.freeze({
    name: owner.name,
    layout: 'net',
    schemaId: owner.schemaId,
    version,
    byteSize: cursor,
    stride,
    alignment,
    schemaHash: fnv1a64(normalized),
    fields: Object.freeze(laidOut),
    ...(projectionOf ? { projectionOf } : {}),
    storage,
    variants: Object.freeze(
      variants.map(variant =>
        Object.freeze({ ...variant, fields: Object.freeze([...variant.fields]) })
      )
    ),
  });
}

function validateVariants(owner: NetStructSpec, fields: readonly NetFieldLayout[]): void {
  const variants = owner.variants ?? [];
  if (variants.length === 0) return;
  const kind = fields.find(field => field.name === 'kind' && field.kind === 'scalar');
  if (!kind || (kind.type !== 'u8' && kind.type !== 'u16' && kind.type !== 'u32')) {
    throw new Error(`${owner.name} variants require a u8/u16/u32 kind field`);
  }
  const names = new Set<string>();
  const tags = new Set<number>();
  const fieldNames = new Set(fields.map(field => field.name));
  for (const variant of variants) {
    if (
      !variant.name ||
      names.has(variant.name) ||
      !Number.isSafeInteger(variant.tag) ||
      variant.tag < 0 ||
      tags.has(variant.tag)
    ) {
      throw new Error(`${owner.name} has an invalid or duplicate variant`);
    }
    for (const field of variant.fields) {
      if (!fieldNames.has(field)) {
        throw new Error(`${owner.name}.${variant.name} references unknown field ${field}`);
      }
    }
    names.add(variant.name);
    tags.add(variant.tag);
  }
}

function toSpec(field: NetFieldLayout): NetFieldSpec {
  return field.kind === 'scalar'
    ? {
        id: field.id,
        name: field.name,
        type: field.type,
        count: field.count,
        visibility: field.visibility,
      }
    : {
        id: field.id,
        name: field.name,
        type: field.type,
        count: field.count,
        visibility: field.visibility,
      };
}

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}
