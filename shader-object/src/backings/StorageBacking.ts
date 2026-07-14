import { BABYLON } from '../babylon';
import type { BackendKind, GPUBacking, Segment } from '../types';
import { encodeGpuFloatUpload } from './encodeGpuFloatUpload';

export class StorageBacking implements GPUBacking {
  public kind: BackendKind = 'storage';
  private buf?: any;
  private bufCapBytes = 0;

  private paramsBuf?: any;
  private paramsCapBytes = 0;

  private paramsScratch = new Int32Array(64);

  constructor(
    private engine: any,
    private schema: any,
    private owner: any
  ) {}

  commit() {
    const payload = encodeGpuFloatUpload(this.schema, this.owner, this.owner.prepareUnifiedForUpload());
    if (!payload) return;
    const needBytes = Math.max(16, payload.byteLength);
    const RW = BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE;

    if (!this.buf || this.bufCapBytes < needBytes) {
      this.buf?.dispose?.();
      this.buf = new BABYLON.StorageBuffer(this.engine, needBytes, RW);
      this.bufCapBytes = needBytes;
    }
    this.buf.update(payload);
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
    const RW = BABYLON.Constants.BUFFER_CREATIONFLAG_READWRITE;
    if (!this.paramsBuf || this.paramsCapBytes < needBytes) {
      this.paramsBuf?.dispose?.();
      this.paramsBuf = new BABYLON.StorageBuffer(this.engine, needBytes, RW);
      this.paramsCapBytes = needBytes;
    }
    if ((this as any).owner._arena?.isDirty()) {
      this.paramsBuf.update(params);
      (this as any).owner._arena?.markClean();
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
  }
}
