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
