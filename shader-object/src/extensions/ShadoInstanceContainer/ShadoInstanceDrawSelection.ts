import { EMPTY_UPLOAD_STATS, type GPUUploadStats } from '../../types';
import { VisibleIndexTexture } from './VisibleIndexTexture';

/**
 * A compact actor-index list owned by one controlled instanced draw.
 *
 * Module buckets use this to select only actors that actually contain a mesh
 * part while retaining one shared packed actor arena.
 */
export class ShadoInstanceDrawSelection {
  private readonly gpuMirror: VisibleIndexTexture;
  private indices = new Uint32Array(0);
  private version = 0;
  private committedVersion = -1;

  constructor(engine: any) {
    this.gpuMirror = new VisibleIndexTexture(engine);
  }

  public get visibleCount(): number {
    return this.indices.length;
  }

  public get actorIndices(): Uint32Array {
    return this.indices;
  }

  public setActorIndices(indices: ArrayLike<number>): void {
    const next = indices instanceof Uint32Array ? indices.slice() : Uint32Array.from(indices);
    if (next.length === this.indices.length) {
      let unchanged = true;
      for (let index = 0; index < next.length; index++) {
        if (next[index] !== this.indices[index]) {
          unchanged = false;
          break;
        }
      }
      if (unchanged) return;
    }
    this.indices = next;
    this.version++;
  }

  public commit(): GPUUploadStats {
    if (this.committedVersion === this.version) return EMPTY_UPLOAD_STATS;
    const stats = this.gpuMirror.commitIndices(this.indices, this.version);
    this.committedVersion = this.version;
    return stats;
  }

  public bind(target: any): void {
    this.gpuMirror.bind(target);
  }

  public dispose(): void {
    this.gpuMirror.dispose();
    this.indices = new Uint32Array(0);
  }
}
