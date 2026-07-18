import { EMPTY_UPLOAD_STATS, type BackendKind, type GPUBacking, type GPUUploadStats, type Segment } from '../types';
import { BABYLON } from '../babylon';
import type { Shado } from '../core/Shado';
import { encodeGpuFloatUploadRange } from './encodeGpuFloatUpload';

export class DataTexBacking implements GPUBacking {
  public kind: BackendKind = 'datatex';
  private bufTex?: any;
  private texW = 2048;
  private texH = 1;
  private capTexels = this.texW * this.texH;
  private capFloats = this.capTexels * 4;

  private staging?: Float32Array;
  private lastUsedFloats = 0;
  private lastStats: GPUUploadStats = EMPTY_UPLOAD_STATS;

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

    const nextStaging = new Float32Array(this.capFloats);
    if (this.staging) {
      nextStaging.set(this.staging.subarray(0, Math.min(this.staging.length, this.capFloats)));
    }

    this.bufTex?.dispose?.();
    this.bufTex = new BABYLON.RawTexture(
      nextStaging,
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
    this.staging = nextStaging;
    this.lastUsedFloats = Math.min(this.lastUsedFloats, this.capFloats);
    (this.owner.arena as any)?.markDirty?.();
  }

  commit(): GPUUploadStats {
    const arena = this.owner.arena;
    if (!arena?.isDirty?.()) return (this.lastStats = EMPTY_UPLOAD_STATS);
    const payload: Float32Array = this.owner.prepareUnifiedForUpload();
    this.reserveFloats(payload.length);

    if (!this.staging || this.staging.length !== this.capFloats) {
      this.staging = new Float32Array(this.capFloats);
      (arena as any).markDirty?.();
    }

    // The staging buffer doubles as the persistent GPU-encoded mirror: only
    // dirty subranges are re-copied and integer-encoded, then the texture is
    // updated in one call. Partial raw-texture upload is not portable through
    // Babylon's high-level API, so the storage backing remains the preferred
    // path for sparse updates on WebGPU.
    const ranges =
      (arena as any).consumeDirtyRanges?.() ?? [{ start: 0, end: payload.byteLength }];
    let encodedBytes = 0;
    for (const range of ranges) {
      const startF = range.start >>> 2;
      const endF = Math.min(payload.length, (range.end + 3) >>> 2);
      if (endF <= startF) continue;
      encodeGpuFloatUploadRange(this.schema, this.owner, payload, this.staging, startF, endF);
      encodedBytes += (endF - startF) * 4;
    }
    if (payload.length < this.lastUsedFloats) {
      this.staging.fill(0, payload.length, this.lastUsedFloats);
    }
    this.lastUsedFloats = payload.length;
    if (!encodedBytes) return (this.lastStats = EMPTY_UPLOAD_STATS);
    this.bufTex!.update(this.staging);
    return (this.lastStats = {
      uploadCalls: 1,
      uploadedBytes: this.staging.byteLength,
      encodedBytes,
    });
  }

  public getLastUploadStats(): GPUUploadStats {
    return this.lastStats;
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
