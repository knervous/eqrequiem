import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('Babylon render integration boundary', () => {
  it('does not replace mesh.render or submit private mesh draws', () => {
    const roots = [
      'src/materials/ShadoMaterial.ts',
      'src/render/ShadoDynamicEntityRenderer.ts',
      'src/msdf/index.ts',
    ];
    for (const file of roots) {
      const source = fs.readFileSync(path.resolve(file), 'utf8');
      expect(source).not.toMatch(/\bmesh\.render\s*=/);
      expect(source).not.toMatch(/\._draw\s*\(/);
      expect(source).not.toMatch(/\._preBind\s*\(/);
      expect(source).not.toMatch(/\._getDrawWrapper\s*\(/);
    }
  });

  it('uses Babylon thin-instance buffers for glyph draw submission', () => {
    const source = fs.readFileSync(path.resolve('src/msdf/index.ts'), 'utf8');
    expect(source).toMatch(/thinInstanceSetBuffer\('matrix'/);
    expect(source).not.toMatch(/mesh\.forcedInstanceCount\s*=\s*glyphCount/);
  });
});
