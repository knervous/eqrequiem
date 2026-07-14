import { describe, expect, it } from '@jest/globals';
import { ByteArena } from '../src/arena/ByteArena';
import { decodePackedAoS, encodePackedAoS } from '../src/net/PackedAoSCodec';
import { compileAoSLayout } from '../src/schema/AoSLayout';

describe('AoS layout', () => {
  it('aligns mixed scalar fields and pads the record stride', () => {
    const layout = compileAoSLayout('EntityCommand', [
      { id: 1, name: 'kind', type: 'u8' },
      { id: 2, name: 'entityId', type: 'u32' },
      { id: 3, name: 'position', type: 'f32', count: 3 },
      { id: 4, name: 'tick', type: 'u64' },
    ]);

    expect(layout.fields.map(field => field.byteOffset)).toEqual([0, 4, 8, 24]);
    expect(layout.byteSize).toBe(32);
    expect(layout.stride).toBe(32);
    expect(layout.alignment).toBe(8);
  });

  it('round trips a packed record at a non-zero record offset', () => {
    const layout = compileAoSLayout('ZoneSession', [
      { id: 1, name: 'zoneId', type: 'u32' },
      { id: 2, name: 'instanceId', type: 'u32' },
      { id: 3, name: 'ready', type: 'bool' },
    ]);
    const arena = new ByteArena(layout.stride * 2);

    encodePackedAoS(
      layout,
      { zoneId: 202, instanceId: 7, ready: true },
      arena.bytes,
      layout.stride
    );

    expect(decodePackedAoS(layout, arena.bytes, layout.stride)).toEqual({
      zoneId: 202,
      instanceId: 7,
      ready: true,
    });
  });

  it('rejects unstable schemas and undersized buffers', () => {
    expect(() =>
      compileAoSLayout('Bad', [
        { id: 1, name: 'a', type: 'u8' },
        { id: 1, name: 'b', type: 'u8' },
      ])
    ).toThrow('duplicate field id');

    const layout = compileAoSLayout('Int', [{ name: 'value', type: 'i32' }]);
    expect(() => encodePackedAoS(layout, { value: 1 }, new Uint8Array(3))).toThrow(RangeError);
  });
});
