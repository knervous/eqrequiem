import { resolveCtor } from '../utils/type-helpers';

// asc/schema.ts
export function emitASUnmanagedFromSchema(parentSchema: any): string {
  const lines: string[] = [];

  function emitClass(name: string, fields: any[]) {
    const structFields = [] as string[];
    lines.push(`@unmanaged\nclass ${name}Header {`);
    let totalSize = 0;
    for (const f of fields) {
      if (f.type?.arrayOf) {
        if (f.type.arrayOf?.structOf) {
          const childCtor = resolveCtor(f.type.arrayOf.structOf);
          const childSchema = childCtor.getSchema();
          structFields.push(childSchema.name);
        } else {
          // Need to map up vec and mat families to unmanaged classes here
          // lines.push(`  ${f.name}: StaticArray<${f.type.arrayOf}>;`);
        }
        continue;
      }
      switch (f.type) {
        case 'f32':
          totalSize += 4;
          lines.push(`  ${f.name}: f32;`);
          break;
        case 'i32':
          totalSize += 4;
          lines.push(`  ${f.name}: i32;`);
          break;
        case 'u32':
          totalSize += 4;
          lines.push(`  ${f.name}: u32;`);
          break;
        case 'vec2':
          totalSize += 8;
          lines.push(`  ${f.name}_x:f32; ${f.name}_y:f32;`);
          break;
        case 'vec3':
          totalSize += 12;
          lines.push(`  ${f.name}_x:f32; ${f.name}_y:f32; ${f.name}_z:f32;`);
          break;
        case 'vec4':
          totalSize += 16;
          lines.push(`  ${f.name}_x:f32; ${f.name}_y:f32; ${f.name}_z:f32; ${f.name}_w:f32;`);
          break;
        case 'mat2':
          totalSize += 16;
          lines.push(
            `  ${f.name}_m00:f32; ${f.name}_m10:f32; ${f.name}_m01:f32; ${f.name}_m11:f32;`
          );
          break;
        case 'mat3':
          totalSize += 48;
          // 3 vec4 rows/cols with last lane pad — keep 12 floats
          lines.push(
            `  ${f.name}_c0x:f32; ${f.name}_c0y:f32; ${f.name}_c0z:f32; ${f.name}_c0w:f32;`,
            `  ${f.name}_c1x:f32; ${f.name}_c1y:f32; ${f.name}_c1z:f32; ${f.name}_c1w:f32;`,
            `  ${f.name}_c2x:f32; ${f.name}_c2y:f32; ${f.name}_c2z:f32; ${f.name}_c2w:f32;`
          );
          break;
        case 'mat4':
          totalSize += 64;
          // 16 floats, 4x vec4 columns
          for (let c = 0; c < 4; c++)
            lines.push(
              `  ${f.name}_c${c}x:f32; ${f.name}_c${c}y:f32; ${f.name}_c${c}z:f32; ${f.name}_c${c}w:f32;`
            );
          break;
        default:
          break;
      }
    }
    // pad to headerFloatCount * 4
    const needF =
      parentSchema.name === name
        ? parentSchema.headerFloatCount
        : (parentSchema.structArrays[name]?.schema?.headerFloatCount ?? 0);

    const haveF = totalSize >> 2;
    const padF = Math.max(0, needF - haveF);
    for (let i = 0; i < padF; i++) lines.push(`  __pad${i}: f32;`);

    lines.push(`}`);

    for (const f of fields) {
      if (f.type?.arrayOf) continue;
      const offF = f.headerFloatOffset ?? 0;
      lines.push(`export const OFFSET_${name}_${f.name}: i32 = ${offF * 4};`);
    }
    for (const field of structFields) {
      lines.push(`
@inline
function instancePtr_${field}(h: ${name}Header, i: i32): usize {
  return h.instancesPtr + usize(i) * SIZEOF_${field}Header;
}

@inline
function instanceRef_${field}(h: ${name}Header, i: i32): ${field}Header {
  return changetype<${field}Header>(instancePtr_${field}(h, i));
}

`);
    }
    lines.push(`export const SIZEOF_${name}Header: i32 = ${totalSize};\n`);
  }

  for (const [_arrName, meta] of Object.entries(parentSchema.structArrays)) {
    const child = (meta as any).schema;
    emitClass(child.name, child.fields);
  }

  emitClass(parentSchema.name, parentSchema.fields);

  return lines.join('\n');
}
