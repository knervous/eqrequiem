import { BABYLON } from '../../babylon';
import { EMPTY_UPLOAD_STATS, type GPUUploadStats } from '../../types';
import type { ShadoInstanceSoA } from '../../core/ShadoInstanceSoA';

const TEX_WIDTH = 2048;

/** GPU mirror for only the compact visible actor indices (four per texel). */
export class VisibleIndexTexture {
  private readonly useStorage: boolean;
  private indexBuffer?: any;
  private indexBufferCapacity = 0;
  private texture?: any;
  private visibilityTexture?: any;
  private staging = new Float32Array(0);
  private visibilityStaging = new Uint8Array(0);
  private visibilityFlagsEnabled = false;
  private visibilityFlagsOnly = false;
  private height = 0;
  private uploadedVersion = -1;
  private lastStats: GPUUploadStats = EMPTY_UPLOAD_STATS;

  constructor(private readonly engine: any) {
    this.useStorage =
      engine?._isWebGPU ?? engine?.isWebGPU ?? engine?.getClassName?.() === 'WebGPUEngine';
  }

  public enableVisibilityFlags(): void {
    if (this.visibilityFlagsEnabled) return;
    this.visibilityFlagsEnabled = true;
    this.uploadedVersion = -1;
  }

  public enableVisibilityFlagsOnly(): void {
    this.enableVisibilityFlags();
    this.visibilityFlagsOnly = true;
    this.uploadedVersion = -1;
  }

  public commit(soa: ShadoInstanceSoA): GPUUploadStats {
    if (soa.version === this.uploadedVersion) return (this.lastStats = EMPTY_UPLOAD_STATS);
    if (this.visibilityFlagsOnly) {
      const uploadedBytes = this.updateVisibilityTexture(soa);
      this.uploadedVersion = soa.version;
      return (this.lastStats = {
        uploadCalls: 1,
        uploadedBytes,
        encodedBytes: soa.visibilityFlags.byteLength,
      });
    }
    const indices = soa.visibleActorIndices;
    return this.commitIndices(indices, soa.version, soa);
  }

  /** Upload an application-defined compact draw list instead of the global visibility list. */
  public commitIndices(
    indices: Uint32Array,
    version: number,
    soa?: ShadoInstanceSoA
  ): GPUUploadStats {
    if (version === this.uploadedVersion) return (this.lastStats = EMPTY_UPLOAD_STATS);
    if (this.useStorage) return this.commitStorage(indices, version, soa);

    const texels = Math.max(1, Math.ceil(indices.length / 4));
    const height = Math.max(1, Math.ceil(texels / TEX_WIDTH));
    const floats = TEX_WIDTH * height * 4;
    let structural = false;
    if (!this.texture || height !== this.height) {
      this.texture?.dispose?.();
      this.height = height;
      this.staging = new Float32Array(floats);
      this.texture = new BABYLON.RawTexture(
        this.staging,
        TEX_WIDTH,
        height,
        BABYLON.Engine.TEXTUREFORMAT_RGBA,
        this.engine,
        false,
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
        BABYLON.Engine.TEXTURETYPE_FLOAT
      );
      this.texture.wrapU = this.texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      structural = true;
    }
    this.staging.fill(0);
    for (let i = 0; i < indices.length; i++) this.staging[i] = indices[i];
    if (!structural) this.texture.update(this.staging);

    const visibilityBytes = this.visibilityFlagsEnabled && soa ? this.updateVisibilityTexture(soa) : 0;
    this.uploadedVersion = version;
    // Four indices share one RGBA texel, so the upload is ~4 bytes/visible actor.
    const uploadedBytes = this.staging.byteLength + visibilityBytes;
    return (this.lastStats = {
      uploadCalls: 1 + (this.visibilityFlagsEnabled && soa ? 1 : 0),
      uploadedBytes,
      encodedBytes:
        indices.byteLength + (this.visibilityFlagsEnabled && soa ? soa.visibilityFlags.byteLength : 0),
    });
  }

  private commitStorage(
    indices: Uint32Array,
    version: number,
    soa?: ShadoInstanceSoA
  ): GPUUploadStats {
    const needBytes = Math.max(16, indices.byteLength);
    let structural = false;
    if (!this.indexBuffer || this.indexBufferCapacity < needBytes) {
      this.indexBuffer?.dispose?.();
      let capacity = Math.max(16, this.indexBufferCapacity || 16);
      while (capacity < needBytes) capacity *= 2;
      this.indexBuffer = new BABYLON.StorageBuffer(
        this.engine,
        capacity,
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE
      );
      this.indexBufferCapacity = capacity;
      structural = true;
    }

    let uploadedBytes = 0;
    let uploadCalls = 0;
    if (indices.byteLength > 0) {
      this.indexBuffer.update(indices, 0, indices.byteLength);
      uploadedBytes += indices.byteLength;
      uploadCalls++;
    } else if (structural) {
      this.indexBuffer.update(new Uint32Array(4));
      uploadedBytes += 16;
      uploadCalls++;
    }
    if (this.visibilityFlagsEnabled && soa) {
      uploadedBytes += this.updateVisibilityTexture(soa);
      uploadCalls++;
    }
    this.uploadedVersion = version;
    return (this.lastStats = {
      uploadCalls,
      uploadedBytes,
      encodedBytes:
        indices.byteLength + (this.visibilityFlagsEnabled && soa ? soa.visibilityFlags.byteLength : 0),
    });
  }

  private updateVisibilityTexture(soa: ShadoInstanceSoA): number {
    const visibilityHeight = Math.max(1, Math.ceil(Math.max(1, soa.count) / TEX_WIDTH));
    const visibilityBytes = TEX_WIDTH * visibilityHeight;
    let structural = false;
    if (!this.visibilityTexture || this.visibilityStaging.length !== visibilityBytes) {
      this.visibilityTexture?.dispose?.();
      this.visibilityStaging = new Uint8Array(visibilityBytes);
      this.visibilityTexture = new BABYLON.RawTexture(
        this.visibilityStaging,
        TEX_WIDTH,
        visibilityHeight,
        BABYLON.Engine.TEXTUREFORMAT_R,
        this.engine,
        false,
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
        BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE
      );
      this.visibilityTexture.wrapU = this.visibilityTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      structural = true;
    }
    this.visibilityStaging.fill(0);
    for (let index = 0; index < soa.visibilityFlags.length; index++) {
      this.visibilityStaging[index] = soa.visibilityFlags[index] ? 255 : 0;
    }
    if (!structural) this.visibilityTexture.update(this.visibilityStaging);
    return this.visibilityStaging.byteLength;
  }

  public bind(target: any): void {
    if (this.visibilityFlagsOnly) {
      // Compatibility shaders bind only the per-actor flag texture below.
    } else if (this.useStorage) {
      if (!this.indexBuffer) return;
      if (typeof target.setStorageBuffer === 'function') {
        target.setStorageBuffer('uShadoVisibleIndices', this.indexBuffer);
      } else {
        this.engine.setStorageBuffer('uShadoVisibleIndices', this.indexBuffer);
      }
    } else {
      if (!this.texture) return;
      target.setTexture('uShadoVisibleIndices', this.texture);
      target.setInt('uShadoVisibleIndexTexWidth', TEX_WIDTH);
    }
    if (this.visibilityFlagsEnabled && this.visibilityTexture) {
      target.setTexture('uShadoVisibilityFlags', this.visibilityTexture);
    }
  }

  public dispose(): void {
    this.indexBuffer?.dispose?.();
    this.indexBuffer = undefined;
    this.indexBufferCapacity = 0;
    this.texture?.dispose?.();
    this.visibilityTexture?.dispose?.();
    this.texture = undefined;
    this.staging = new Float32Array(0);
    this.visibilityStaging = new Uint8Array(0);
  }
}
