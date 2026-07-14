import { describe, expect, it } from '@jest/globals';
import { compileNetLayouts } from '../src/net/NetLayout';
import { NetSoABatchView, NetStringSidecarBuilder, readNetString } from '../src/net/NetSoA';

describe('net SoA storage', () => {
  it('creates direct typed planes and excludes private state from public plane lists', () => {
    const schema = compileNetLayouts([
      {
        name: 'EntityState',
        layout: 'net',
        storage: 'soa',
        schemaId: 1,
        variants: [
          { name: 'player', tag: 1, fields: ['position', 'mana'] },
          { name: 'npc', tag: 2, fields: ['position', 'aggroTarget'] },
        ],
        fields: [
          { id: 1, name: 'kind', type: 'u8' },
          { id: 2, name: 'position', type: 'f32', count: 3 },
          { id: 3, name: 'mana', type: 'u32' },
          { id: 4, name: 'aggroTarget', type: 'u32', visibility: 'private' },
        ],
      },
    ]).get('EntityState')!;
    const backing = new SharedArrayBuffer(128);
    const batch = new NetSoABatchView(schema, 4, backing);
    (batch.plane('kind') as Uint8Array).set([1, 2, 2, 1]);
    (batch.plane('position') as Float32Array).set([1, 2, 3], 3);

    expect(batch.gpuPayload().buffer).toBe(backing);
    expect(Array.from(batch.plane('kind') as Uint8Array)).toEqual([1, 2, 2, 1]);
    expect(batch.publicPlaneNames()).not.toContain('aggroTarget');
  });

  it('uses offset/length references for a UTF-8 string sidecar', () => {
    const builder = new NetStringSidecarBuilder();
    const a = builder.add('Guard Thomas');
    const b = builder.add('a moss snake');
    const sidecar = builder.finish();
    expect(readNetString(sidecar, a.byteOffset, a.byteLength)).toBe('Guard Thomas');
    expect(readNetString(sidecar, b.byteOffset, b.byteLength)).toBe('a moss snake');
  });
});
