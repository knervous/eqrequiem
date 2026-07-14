import { Shado } from '../core/Shado';
import { ShadoSchemaBuilder } from '../schema/ShadoSchemaBuilder';

export class NameplateData extends Shado {
  // Example of how to define the schema without TS decorators, i.e. in JavaScript
  static schema = new ShadoSchemaBuilder('NameplateData', { useWasm: false })
    .registerField('glyphUv4', { arrayOf: 'vec4' }) // atlas UVs per gid
    .registerField('glyphPlane4', { arrayOf: 'vec4' }) // quad plane per gid (EM)
    .registerField('glyphAdvance', { arrayOf: 'f32' }) // advance per gid (EM)
    .registerField('glyphGid', { arrayOf: 'u32' }) // per-glyph stream
    .registerField('glyphOfs2', { arrayOf: 'vec2' }) // per-glyph offsets (EM)
    .registerField('glyphOwner', { arrayOf: 'u32' }) // owner index per glyph
    .build();

  private _pool = new NamePool();
  private _lut?: FontGlyphLUT;
  private _streams?: NameplateStreams;

  constructor(engine: any, fontAsset: any) {
    super(engine);
    if (!fontAsset) {
      throw new Error('FontAsset required for NameplateData');
    }
    this._lut = new FontGlyphLUT(fontAsset);
    this._streams = new NameplateStreams(this._pool, this._lut);

    this.setVarArray('glyphUv4', this._lut.uv4);
    this.setVarArray('glyphPlane4', this._lut.plane4);
    this.setVarArray('glyphAdvance', this._lut.advance);
  }

  public addNamesToPool(names: string[]): number[] {
    const idxs = this._pool.addMany(names);
    return idxs;
  }
  public addName(name: string): number {
    return this._pool.add(name);
  }
  public nameCount(): number {
    return this._pool.size();
  }
  public poolGet(i: number) {
    return this._pool.get(i);
  }

  public rebuildStreams(children: Array<{ nameIndex: number }>) {
    if (!this._streams) return;
    const { glyphGid, glyphOwner, glyphOfs2 } = this._streams.build(children);
    this.setVarArray('glyphGid', glyphGid);
    this.setVarArray('glyphOwner', glyphOwner);
    this.setVarArray('glyphOfs2', glyphOfs2);
  }

  public glyphCount(): number {
    return (this as any)._varSeg['glyphGid']?.lenF | 0;
  }
}

// ───────────────────────────── Name & Glyph Utilities ─────────────────────────
class NamePool {
  private _names: string[] = [];
  private _byName = new Map<string, number>();

  constructor(initial?: readonly string[]) {
    if (initial?.length) this.addMany(initial);
  }

  add(name: string): number {
    const hit = this._byName.get(name);
    if (hit !== undefined) return hit;
    const idx = this._names.length;
    this._names.push(name);
    this._byName.set(name, idx);
    return idx;
  }

  addMany(names: readonly string[]): number[] {
    const out = new Array<number>(names.length);
    for (let i = 0; i < names.length; i++) out[i] = this.add(names[i]);
    return out;
  }

  get(index: number): string {
    return this._names[index] ?? '';
  }
  getIndex(name: string): number | undefined {
    return this._byName.get(name);
  }
  has(name: string) {
    return this._byName.has(name);
  }
  size() {
    return this._names.length;
  }
  asArray() {
    return this._names;
  }
}

class FontGlyphLUT {
  public readonly uv4: Float32Array;
  public readonly plane4: Float32Array;
  public readonly advance: Float32Array;
  public readonly emPx: number;

  private gidByCode = new Map<number, number>();
  private advanceByCode = new Map<number, number>();
  private fallbackAdvanceEM = 0.5;
  private kerningPx: (a: number, b: number) => number;

  constructor(fontAsset: any) {
    const f = fontAsset._font as {
      info: { size: number };
      common: { scaleW: number; scaleH: number; lineHeight: number };
      chars: Array<{
        id: number;
        x: number;
        y: number;
        width: number;
        height: number;
        xoffset: number;
        yoffset: number;
        xadvance: number;
      }>;
      kernings?: Array<{ first: number; second: number; amount: number }>;
    };

    this.emPx = f.info.size;
    this.fallbackAdvanceEM = (fontAsset._getChar?.(0xfffc)?.xadvance ?? this.emPx * 0.5) / this.emPx;

    const texW = f.common.scaleW;
    const texH = f.common.scaleH;
    const glyphs = f.chars.filter(g => g.width > 0 && g.height > 0);
    const N = glyphs.length;

    const uv4 = new Float32Array(N * 4);
    const plane4 = new Float32Array(N * 4);
    const adv = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const g = glyphs[i];
      this.gidByCode.set(g.id, i);
      this.advanceByCode.set(g.id, g.xadvance / this.emPx);

      const u = g.x / texW;
      const vT = g.y / texH;
      const du = g.width / texW;
      const dv = g.height / texH;
      uv4.set([u, vT, du, dv], i * 4);

      const invEm = 1 / this.emPx;
      const xmin = g.xoffset * invEm;
      const xmax = (g.xoffset + g.width) * invEm;
      const ymax = -g.yoffset * invEm;
      const ymin = -(g.yoffset + g.height) * invEm;
      plane4.set([xmin, ymin, xmax, ymax], i * 4);

      adv[i] = g.xadvance * invEm;
    }

    const kerningFn = fontAsset._getKerning?.bind(fontAsset) as
      | ((a: number, b: number) => number)
      | undefined;
    this.kerningPx = kerningFn ?? (() => 0);

    this.uv4 = uv4;
    this.plane4 = plane4;
    this.advance = adv;
  }

  codePointToGid(cp: number): number | undefined {
    return this.gidByCode.get(cp);
  }

  advanceEM(cp: number, gid?: number): number {
    if (gid !== undefined) return this.advance[gid] ?? this.fallbackAdvanceEM;
    return this.advanceByCode.get(cp) ?? this.fallbackAdvanceEM;
  }

  kerningEM(a: number, b: number): number {
    return this.kerningPx(a, b) / this.emPx;
  }
}

class NameplateStreams {
  constructor(
    private pool: NamePool,
    private font: FontGlyphLUT
  ) {}

  build(
    children: Array<{
      nameIndex: number;
      glyphBase?: number;
      glyphCount?: number;
      emitHeaderDirty?: () => void;
    }>
  ) {
    const gidList: number[] = [];
    const ownerList: number[] = [];
    const ofsList: number[] = [];

    for (let owner = 0; owner < children.length; owner++) {
      const name = this.pool.get(children[owner].nameIndex);

      const localGids: number[] = [];
      const localOfsX: number[] = [];
      let penX_EM = 0;
      let prevCP: number | null = null;

      for (const ch of [...name]) {
        const cp = ch.codePointAt(0)!;
        const gid = this.font.codePointToGid(cp);
        if (prevCP != null) penX_EM += this.font.kerningEM(prevCP, cp);
        if (gid !== undefined) {
          localGids.push(gid);
          localOfsX.push(penX_EM);
        }
        penX_EM += this.font.advanceEM(cp, gid);
        prevCP = cp;
      }

      const nameWidthEM = penX_EM;
      const shift = -0.5 * nameWidthEM;

      const base = gidList.length;
      const count = localGids.length;

      for (let i = 0; i < count; i++) {
        gidList.push(localGids[i] >>> 0);
        ownerList.push(owner >>> 0);
        ofsList.push(localOfsX[i] + shift, 0.0);
      }

      const child: any = children[owner];
      if (child) {
        child.glyphBase = base >>> 0;
        child.glyphCount = count >>> 0;
        child.emitHeaderDirty?.();
      }
    }

    return {
      glyphGid: gidList,
      glyphOwner: ownerList,
      glyphOfs2: new Float32Array(ofsList),
    };
  }
}
