import { EMPTY_UPLOAD_STATS, type BackendKind, type GPUBacking, type GPUUploadStats, type Segment } from '../types';
import {
  getShadoRendererAdapter,
  type ShadoRendererAdapter,
  type ShadoRendererBuffer,
} from '../renderer/ShadoRendererAdapter';
import { encodeGpuStorageUploadRange } from './encodeGpuFloatUpload';

export class StorageBacking implements GPUBacking {
  public kind: BackendKind = 'storage';
  private renderer?: ShadoRendererAdapter;
  private buf?: ShadoRendererBuffer;
  private bufCapBytes = 0;

  private paramsBuf?: ShadoRendererBuffer;
  private paramsCapBytes = 0;
  private paramsDirty = true;

  private paramsScratch = new Int32Array(64);
  private lastParams = new Int32Array(0);
  private uploadMirror = new Float32Array(0);

  private lastStats: GPUUploadStats = EMPTY_UPLOAD_STATS;

  constructor(
    private engine: any,
    private schema: any,
    private owner: any
  ) {
    // Adapter lookup is lazy so backing-only tests can override makeBuffer()
    // without installing a renderer. Production constructors install one
    // during Shado.initialize() before the first commit/bind.
    try {
      this.renderer = getShadoRendererAdapter(engine);
    } catch {
      this.renderer = undefined;
    }
  }

  private getRenderer(): ShadoRendererAdapter {
    return (this.renderer ??= getShadoRendererAdapter(this.engine));
  }

  /** Overridable for tests; production returns a Babylon storage buffer. */
  protected makeBuffer(byteLength: number): any {
    return this.getRenderer().createStorageBuffer(byteLength, `${this.schema.name} storage`);
  }

  commit(): GPUUploadStats {
    const arena = this.owner.arena ?? this.owner._arena;
    const payload: Float32Array = this.owner.prepareUnifiedForUpload();
    if (!payload) return (this.lastStats = EMPTY_UPLOAD_STATS);
    const needBytes = Math.max(16, payload.byteLength);
    if (this.uploadMirror.length < payload.length) {
      this.uploadMirror = new Float32Array(payload.length);
    }

    let structuralUpload = false;
    if (!this.buf || this.bufCapBytes < needBytes) {
      this.buf?.dispose();
      this.buf = this.makeBuffer(needBytes);
      this.bufCapBytes = needBytes;
      structuralUpload = true;
    }

    if (!structuralUpload && !arena?.isDirty?.()) {
      return (this.lastStats = EMPTY_UPLOAD_STATS);
    }

    const ranges = structuralUpload
      ? this.buildActiveRanges(payload.byteLength)
      : (arena?.consumeDirtyRanges?.() ?? [{ start: 0, end: payload.byteLength }]);
    if (structuralUpload) arena?.markClean?.();

    let uploadCalls = 0;
    let uploadedBytes = 0;
    for (const range of ranges) {
      // Keep offsets/lengths four-byte aligned float ranges.
      const startF = range.start >>> 2;
      const endF = Math.min(payload.length, (range.end + 3) >>> 2);
      if (endF <= startF) continue;
      const bytes = (endF - startF) * 4;
      encodeGpuStorageUploadRange(
        this.schema,
        this.owner,
        payload,
        this.uploadMirror,
        startF,
        endF
      );
      // WGSL views the arena as raw u32 words and bitcasts float fields, so the
      // mirror preserves raw scalar/struct words while encoding numeric integer
      // var arrays such as glyph IDs and owners.
      this.buf!.update(this.uploadMirror.subarray(startF, endF), startF * 4);
      uploadCalls++;
      uploadedBytes += bytes;
    }
    return (this.lastStats = { uploadCalls, uploadedBytes, encodedBytes: 0 });
  }

  /**
   * A newly allocated GPU buffer needs every live segment, but not unused
   * reserved capacity. Segment offsets remain valid because the buffer itself
   * is still allocated at full arena capacity.
   */
  private buildActiveRanges(payloadBytes: number): Array<{ start: number; end: number }> {
    const self = this.owner;
    const ranges: Array<{ start: number; end: number }> = [];
    const add = (segment: Segment | undefined, lengthF?: number) => {
      const floats = Math.max(0, lengthF ?? segment?.lenF ?? 0);
      if (!segment || floats === 0) return;
      const start = Math.max(0, segment.offF | 0) * 4;
      const end = Math.min(payloadBytes, start + floats * 4);
      if (end > start) ranges.push({ start, end });
    };

    add(self._headerSeg, self._headerSeg?.lenF);
    for (const field of Object.keys(this.schema.varArrays)) {
      add(self._varSeg[field], self._varSeg[field]?.lenF);
    }
    for (const field of Object.keys(this.schema.structArrays)) {
      const segment: Segment | undefined = self._structSeg[field];
      const stride = this.schema.structArrays[field].schema.headerFloatCount | 0;
      add(segment, (self._structArrayCount?.[field] | 0) * stride);
    }

    ranges.sort((left, right) => left.start - right.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }
    return merged;
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
    const buffer = this.buf;
    if (!buffer) return;
    const lname = includeName.charAt(0).toLowerCase() + includeName.slice(1);
    this.getRenderer().bindStorageBuffer(target, `${lname}Buf`, buffer);

    const params = this.buildParams();
    let paramsChanged = params.length !== this.lastParams.length;
    if (!paramsChanged) {
      for (let i = 0; i < params.length; i++) {
        if (params[i] !== this.lastParams[i]) {
          paramsChanged = true;
          break;
        }
      }
    }
    if (paramsChanged) {
      this.lastParams = params.slice();
      this.paramsDirty = true;
    }
    const needBytes = Math.max(16, params.byteLength);
    if (!this.paramsBuf || this.paramsCapBytes < needBytes) {
      this.paramsBuf?.dispose();
      this.paramsBuf = this.makeBuffer(needBytes);
      this.paramsCapBytes = needBytes;
      this.paramsDirty = true;
    }
    if (this.paramsDirty) {
      this.paramsBuf!.update(params);
      this.paramsDirty = false;
    }
    this.getRenderer().bindStorageBuffer(target, `${lname}Params`, this.paramsBuf!);
  }

  dispose() {
    this.buf?.dispose();
    this.buf = undefined;
    this.bufCapBytes = 0;
    this.paramsBuf?.dispose();
    this.paramsBuf = undefined;
    this.paramsCapBytes = 0;
    this.lastParams = new Int32Array(0);
    this.uploadMirror = new Float32Array(0);
  }
}
