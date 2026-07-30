import { NullEngine } from '@babylonjs/core';
import { jest } from '@jest/globals';

import { NameplateData } from '../src/extensions/NameplateData';

function makeFontAsset() {
  const glyph = (id: number, x: number) => ({
    id,
    x,
    y: 0,
    width: 16,
    height: 24,
    xoffset: 0,
    yoffset: 0,
    xadvance: 18,
  });
  return {
    _font: {
      info: { size: 32 },
      common: { scaleW: 64, scaleH: 32, lineHeight: 32 },
      chars: [glyph('A'.codePointAt(0)!, 0), glyph('B'.codePointAt(0)!, 16)],
      kernings: [],
    },
    _getChar: () => ({ xadvance: 16 }),
    _getKerning: () => 0,
  };
}

function numericVarArray(owner: NameplateData, field: string): number[] {
  const segment = (owner as any)._varSeg[field];
  const arena = (owner as any)._arena.take() as Float32Array;
  return Array.from(arena.subarray(segment.offF, segment.offF + segment.lenF));
}

describe('visible nameplate compaction', () => {
  it('publishes glyphs for capped visible membership and reuses an unchanged result', async () => {
    const engine = new NullEngine();
    await NameplateData.initialize(engine, { wasm: false, backend: 'datatex' });
    const nameplates = new NameplateData(engine, makeFontAsset());
    nameplates.enableVisibilityCompaction(2);

    const names = ['AA', 'B', 'ABA'].map(name => nameplates.addName(name));
    const children = names.map(nameIndex => ({
      nameIndex,
      emitHeaderDirty: jest.fn(),
    }));

    nameplates.rebuildStreams(children);
    expect(nameplates.glyphCount()).toBe(0);

    expect(nameplates.updateVisibleActors(children, Uint32Array.from([2, 0, 1]))).toBe(true);
    expect(nameplates.glyphCount()).toBe(5);
    expect(numericVarArray(nameplates, 'glyphOwner')).toEqual([2, 2, 2, 0, 0]);

    expect(nameplates.updateVisibleActors(children, Uint32Array.from([2, 0, 1]))).toBe(false);
    expect(numericVarArray(nameplates, 'glyphOwner')).toEqual([2, 2, 2, 0, 0]);

    nameplates.dispose();
    engine.dispose();
  });
});
