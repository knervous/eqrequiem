import { describe, expect, it } from '@jest/globals';
import { emitNetStructModule } from '../src/net/emitNetStructModule';

describe('net struct emitter', () => {
  it('emits in-place views, schema hashes, batches, and zero-copy payloads', () => {
    const source = emitNetStructModule([
      {
        name: 'ZoneSession',
        layout: 'net',
        schemaId: 4097,
        fields: [
          { id: 1, name: 'zoneId', type: 'u32' },
          { id: 2, name: 'instanceId', type: 'u32' },
        ],
      },
    ]);

    expect(source).toContain('export class ZoneSessionView');
    expect(source).toContain('export class ZoneSessionBatchView');
    expect(source).toContain('export const ZONE_SESSION_SCHEMA_HASH = 0x');
    expect(source).toContain('this.payload = bytes.subarray(NET_HEADER_BYTES)');
    expect(source).toContain(
      'new DataView(this.buffer).setUint32(this.byteOffset + 0, value, true)'
    );
    expect(source).not.toContain("from '");
  });

  it('inlines whole structs and projections as contiguous record regions', () => {
    const source = emitNetStructModule([
      {
        name: 'Transform',
        layout: 'net',
        schemaId: 0x2001,
        fields: [
          { id: 1, name: 'position', type: 'f32', count: 3 },
          { id: 2, name: 'rotation', type: 'f32', count: 4 },
          { id: 3, name: 'velocity', type: 'f32', count: 3 },
        ],
      },
      {
        name: 'RenderSnapshot',
        layout: 'net',
        schemaId: 0x2002,
        fields: [
          { id: 1, name: 'entityId', type: 'u32' },
          {
            id: 2,
            name: 'transform',
            type: { struct: 'Transform', pick: ['position', 'rotation'] },
          },
        ],
      },
    ]);

    expect(source).toContain('export interface RenderSnapshotTransform');
    expect(source).toContain('get transform(): RenderSnapshotTransformView');
    expect(source.match(/export interface Transform \{/g)).toHaveLength(1);
  });
});
