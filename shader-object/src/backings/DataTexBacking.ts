import type { BackendKind, GPUBacking, Segment } from '../types';
import { BABYLON } from '../babylon';
import type { Shado } from '../core/Shado';
import { encodeGpuFloatUpload } from './encodeGpuFloatUpload';

export class DataTexBacking implements GPUBacking {
  public kind: BackendKind = 'datatex';
  private bufTex?: any;
  private texW = 2048;
  private texH = 1;
  private capTexels = this.texW * this.texH;
  private capFloats = this.capTexels * 4;

  private staging?: Float32Array;
  private lastUsedFloats = 0;

  constructor(
    private engine: any,
    private schema: any,
    private owner: Shado
  ) {}

  reserveFloats(minFloats: number) {
    if (minFloats <= this.capFloats && this.bufTex) return;
    const needTexels = Math.max(1, Math.ceil(minFloats / 4));
    const needH = Math.max(1, Math.ceil(needTexels / this.texW));
    this.texH = Math.max(this.texH, needH);
    this.capTexels = this.texW * this.texH;
    this.capFloats = this.capTexels * 4;

    const initData =
      this.staging && this.staging.length === this.capFloats
        ? this.staging
        : new Float32Array(this.capFloats);

    this.bufTex?.dispose?.();
    this.bufTex = new BABYLON.RawTexture(
      initData,
      this.texW,
      this.texH,
      BABYLON.Engine.TEXTUREFORMAT_RGBA,
      this.engine,
      false,
      false,
      BABYLON.Texture.NEAREST_SAMPLINGMODE,
      BABYLON.Engine.TEXTURETYPE_FLOAT
    );
    this.bufTex.wrapU = this.bufTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    this.staging = initData;
    this.lastUsedFloats = Math.min(this.lastUsedFloats, this.capFloats);
  }

  commit() {
    const arena = this.owner.arena;
    if (!arena?.isDirty?.()) return;
    const payload: Float32Array = encodeGpuFloatUpload(
      this.schema,
      this.owner,
      this.owner.prepareUnifiedForUpload()
    );
    this.reserveFloats(payload.length);

    if (!this.staging || this.staging.length !== this.capFloats) {
      this.staging = new Float32Array(this.capFloats);
    }
    this.staging.set(payload, 0);
    if (payload.length < this.lastUsedFloats) {
      this.staging.fill(0, payload.length, this.lastUsedFloats);
    }
    this.lastUsedFloats = payload.length;
    this.bufTex!.update(this.staging);
    arena.markClean?.();
  }

  bind(effect: any, includeName: string) {
    if (!this.bufTex) return;
    this.applyBindings(effect, includeName);
  }

  bindMaterial(material: any, includeName: string) {
    if (!this.bufTex) return;
    this.applyBindings(material, includeName);
  }

  private applyBindings(target: any, includeName: string) {
    const self: any = this.owner;
    const schema = this.schema;

    // Bind buffer texture
    target.setTexture(`u${includeName}BufTex`, this.bufTex);
    target.setInt(`u${includeName}BufTexWidth`, this.texW);
    target.setInt(`u${includeName}HeaderBase`, self._headerSeg.offF | 0);

    // Bind var array uniforms
    for (const f of Object.keys(schema.varArrays)) {
      const seg: Segment = self._varSeg[f];
      const stride = schema.varArrays[f].floatStride;
      const count = Math.floor((seg?.lenF ?? 0) / stride);
      target.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
      target.setInt(`u${includeName}_${f}Stride`, stride | 0);
      target.setInt(`u${includeName}_${f}Count`, count | 0);
    }

    // Bind struct array uniforms
    for (const f of Object.keys(schema.structArrays)) {
      const seg: Segment = self._structSeg[f];
      const stride = schema.structArrays[f].schema.headerFloatCount;
      const count = (self._structArrayCount?.[f] as number) | 0;
      target.setInt(`u${includeName}_${f}Base`, seg?.offF | 0);
      target.setInt(`u${includeName}_${f}Stride`, stride | 0);
      target.setInt(`u${includeName}_${f}Count`, count | 0);
    }
  }

  dispose() {
    this.bufTex?.dispose?.();
  }
}
