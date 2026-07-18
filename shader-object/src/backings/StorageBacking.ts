import { BABYLON } from '../babylon';
import { EMPTY_UPLOAD_STATS, type BackendKind, type GPUBacking, type GPUUploadStats, type Segment } from '../types';
import { encodeGpuFloatUploadRange } from './encodeGpuFloatUpload';

export class StorageBacking implements GPUBacking {
  public kind: BackendKind = 'storage';
  private buf?: any;
  private bufCapBytes = 0;

  private paramsBuf?: any;
  private paramsCapBytes = 0;
  private paramsDirty = true;

  private paramsScratch = new Int32Array(64);

  /** Persistent GPU-encoded mirror of the arena; uploaded by subrange. */
  private mirror?: Float32Array;
  private lastStats: GPUUploadStats = EMPTY_UPLOAD_STATS;

  constructor(
    private engine: any,
    private schema: any,
    private owner: any
  ) {}

  /** Overridable for tests; production returns a Babylon storage buffer. */
  protected makeBuffer(byteLength: number): any {
    return new BABYLON.StorageBuffer(
      this.engine,
      byteLength,
      BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE
    );
  }

  commit(): GPUUploadStats {
    const arena = this.owner.arena ?? this.owner._arena;
    const payload: Float32Array = this.owner.prepareUnifiedForUpload();
    if (!payload) return (this.lastStats = EMPTY_UPLOAD_STATS);
    const needBytes = Math.max(16, payload.byteLength);

    let structuralUpload = false;
    if (!this.buf || this.bufCapBytes < needBytes) {
      this.buf?.dispose?.();
      this.buf = this.makeBuffer(needBytes);
      this.bufCapBytes = needBytes;
      structuralUpload = true;
    }
    if (!this.mirror || this.mirror.length !== payload.length) {
      this.mirror = new Float32Array(payload.length);
      structuralUpload = true;
    }

    if (!structuralUpload && !arena?.isDirty?.()) {
      return (this.lastStats = EMPTY_UPLOAD_STATS);
    }

    const ranges = structuralUpload
      ? [{ start: 0, end: payload.byteLength }]
      : (arena?.consumeDirtyRanges?.() ?? [{ start: 0, end: payload.byteLength }]);
    if (structuralUpload) arena?.markClean?.();

    let uploadCalls = 0;
    let uploadedBytes = 0;
    let encodedBytes = 0;
    for (const range of ranges) {
      // Keep offsets/lengths four-byte aligned float ranges.
      const startF = range.start >>> 2;
      const endF = Math.min(payload.length, (range.end + 3) >>> 2);
      if (endF <= startF) continue;
      encodeGpuFloatUploadRange(this.schema, this.owner, payload, this.mirror, startF, endF);
      const bytes = (endF - startF) * 4;
      this.buf.update(this.mirror.subarray(startF, endF), startF * 4);
      uploadCalls++;
      uploadedBytes += bytes;
      encodedBytes += bytes;
    }
    if (uploadCalls > 0) this.paramsDirty = true;
    return (this.lastStats = { uploadCalls, uploadedBytes, encodedBytes });
  }

  public getLastUploadStats(): GPUUploadStats {
    return this.lastStats;
  }

  private buildParams(): Int32Array {
    const self = this.owner;
    const sch = this.schema;
    const nInts =
      1 + Object.keys(sch.varArrays).length * 3 + Object.keys(sch.structArrays).length * 3;
    if (this.paramsScratch.length < nInts) {
      this.paramsScratch = new Int32Array(Math.max(nInts, this.paramsScratch.length * 2));
    }
    let w = 0;
    this.paramsScratch[w++] = self._headerSeg.offF | 0;
    for (const f of Object.keys(sch.varArrays)) {
      const seg: Segment = self._varSeg[f];
      const stride = sch.varArrays[f].floatStride | 0;
      const count = Math.floor((seg?.lenF ?? 0) / stride) | 0;
      this.paramsScratch[w++] = seg?.offF | 0;
      this.paramsScratch[w++] = stride;
      this.paramsScratch[w++] = count;
    }
    for (const f of Object.keys(sch.structArrays)) {
      const seg: Segment = self._structSeg[f];
      const stride = sch.structArrays[f].schema.headerFloatCount | 0;
      const count = self._structArrayCount?.[f] | 0;
      this.paramsScratch[w++] = seg?.offF | 0;
      this.paramsScratch[w++] = stride;
      this.paramsScratch[w++] = count;
    }
    return this.paramsScratch.subarray(0, w);
  }

  bind(effect: any, includeName: string) {
    if (!this.buf) return;
    this.applyBindings(effect, includeName);
  }

  bindMaterial(material: any, includeName: string) {
    if (!this.buf) return;
    this.applyBindings(material, includeName);
  }

  private applyBindings(target: any, includeName: string) {
    const lname = includeName.charAt(0).toLowerCase() + includeName.slice(1);
    if (typeof target.setStorageBuffer === 'function') {
      target.setStorageBuffer(`${lname}Buf`, this.buf);
    } else {
      this.engine.setStorageBuffer(`${lname}Buf`, this.buf);
    }

    const params = this.buildParams();
    const needBytes = Math.max(16, params.byteLength);
    if (!this.paramsBuf || this.paramsCapBytes < needBytes) {
      this.paramsBuf?.dispose?.();
      this.paramsBuf = this.makeBuffer(needBytes);
      this.paramsCapBytes = needBytes;
      this.paramsDirty = true;
    }
    if (this.paramsDirty) {
      this.paramsBuf.update(params);
      this.paramsDirty = false;
    }
    if (typeof target.setStorageBuffer === 'function') {
      target.setStorageBuffer(`${lname}Params`, this.paramsBuf);
    } else {
      this.engine.setStorageBuffer(`${lname}Params`, this.paramsBuf);
    }
  }

  dispose() {
    this.buf?.dispose?.();
    this.buf = undefined;
    this.bufCapBytes = 0;
    this.paramsBuf?.dispose?.();
    this.paramsBuf = undefined;
    this.paramsCapBytes = 0;
    this.mirror = undefined;
  }
}
