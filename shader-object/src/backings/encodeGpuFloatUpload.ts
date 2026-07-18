type Segment = { offF: number; lenF: number; capF: number };

type SchemaField = {
  name: string;
  type: any;
  headerFloatOffset?: number;
};

type StructSchema = {
  fields: SchemaField[];
  headerFloatCount?: number;
  structArrays?: Record<string, { schema: StructSchema; headerFloatCount?: number }>;
};

function encodeIntegerFields(
  out: Float32Array,
  dataView: DataView,
  baseF: number,
  fields: SchemaField[]
) {
  for (const field of fields) {
    if (field.type?.arrayOf) continue;
    const offF = baseF + ((field.headerFloatOffset ?? 0) | 0);
    const offBytes = offF * 4;
    if (field.type === 'i32') {
      out[offF] = dataView.getInt32(offBytes, true);
    } else if (field.type === 'u32') {
      out[offF] = dataView.getUint32(offBytes, true);
    } else if (field.type?.structOf?.fields) {
      encodeIntegerFields(out, dataView, offF, field.type.structOf.fields);
    }
  }
}

export function encodeGpuFloatUpload(
  schema: StructSchema,
  owner: any,
  payload: Float32Array
): Float32Array {
  const out = payload.slice();
  const dataView = owner.arena.dataView();

  encodeIntegerFields(out, dataView, owner._headerSeg.offF | 0, schema.fields);

  for (const [field, meta] of Object.entries(schema.structArrays ?? {})) {
    const seg = owner._structSeg[field] as Segment | undefined;
    const count = (owner._structArrayCount?.[field] as number) | 0;
    if (!seg || count <= 0) continue;

    const childSchema = meta.schema;
    const stride = childSchema.headerFloatCount ?? 0;
    for (let i = 0; i < count; i++) {
      encodeIntegerFields(out, dataView, (seg.offF | 0) + i * stride, childSchema.fields);
    }
  }

  return out;
}

/**
 * Encode one float subrange [startF, endF) of the arena into a persistent
 * GPU-ready mirror: copy the raw floats, then re-run integer-field encoding
 * for exactly the header/struct records that intersect the range. This keeps
 * upload preparation proportional to changed bytes rather than arena size.
 */
export function encodeGpuFloatUploadRange(
  schema: StructSchema,
  owner: any,
  payload: Float32Array,
  mirror: Float32Array,
  startF: number,
  endF: number
): void {
  const clampedStart = Math.max(0, startF | 0);
  const clampedEnd = Math.min(payload.length, endF | 0);
  if (clampedEnd <= clampedStart) return;
  mirror.set(payload.subarray(clampedStart, clampedEnd), clampedStart);

  const dataView = owner.arena.dataView();
  const headerBase = owner._headerSeg.offF | 0;
  const headerCount = (schema.headerFloatCount ?? 0) | 0;
  if (headerBase < clampedEnd && headerBase + headerCount > clampedStart) {
    encodeIntegerFields(mirror, dataView, headerBase, schema.fields);
  }

  for (const [field, meta] of Object.entries(schema.structArrays ?? {})) {
    const seg = owner._structSeg[field] as Segment | undefined;
    const count = (owner._structArrayCount?.[field] as number) | 0;
    if (!seg || count <= 0) continue;

    const childSchema = meta.schema;
    const stride = (childSchema.headerFloatCount ?? 0) | 0;
    if (stride <= 0) continue;
    const base = seg.offF | 0;
    const first = Math.max(0, Math.floor((clampedStart - base) / stride));
    const last = Math.min(count - 1, Math.floor((clampedEnd - 1 - base) / stride));
    for (let i = first; i <= last; i++) {
      encodeIntegerFields(mirror, dataView, base + i * stride, childSchema.fields);
    }
  }
}
