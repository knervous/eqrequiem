import type {
  ComputeShader,
  Mesh,
  Observer,
  Scene,
  Skeleton,
  StorageBuffer,
  WebGPUEngine,
} from '../../babylon';
import { BABYLON } from '../../babylon';
import type { ShadoVatQualityTier } from '../../materials/ShadoMaterial';
import { makePoseKey, type ShadoPoseSlot } from '../../render/ShadoVatPoseCache';
import { ShadoVatPosePalette } from '../../render/ShadoVatPosePalette';
import type { VATBuilder } from '../VATBuilder/VATBuilder';
import {
  emitShadoPreSkinComputeWGSL,
  OUTPUT_VEC4S_PER_VERTEX,
  SOURCE_VEC4S_PER_VERTEX,
  WORKGROUP_SIZE,
} from './preskin-wgsl';

// Re-exported so existing importers of this module keep working.
export {
  emitShadoPreSkinComputeWGSL,
  type ShadoPreSkinComputeOptions,
} from './preskin-wgsl';

export type ShadoPreSkinCacheStats = {
  readonly sourceBytes: number;
  readonly outputBytes: number;
  readonly parameterBytes: number;
  readonly totalBytes: number;
  readonly verticesPerPose: number;
  readonly moduleDispatchesPerPose: number;
  readonly lastGpuTimeMs: number;
};

type PreSkinModule = {
  readonly vertexCount: number;
  active: boolean;
};

export type ShadoPreSkinCacheOptions = {
  /**
   * Resolved pose-palette source. Defaults to one created and owned by the
   * cache — bone transforms are resolved once per pose instead of sampled twice
   * per influence for every vertex.
   *
   * Pass an existing palette to share one across several caches (the caller then
   * owns its lifetime), or `false` to fall back to sampling the DQ atlas
   * directly, which is the pre-palette behaviour.
   */
  posePalette?: ShadoVatPosePalette | false;
  /** Slot capacity when the cache creates its own palette. Defaults to 64. */
  maxPoses?: number;
};

function appendInfluence(
  target: Float32Array,
  targetOffset: number,
  values: ArrayLike<number> | null,
  vertex: number,
) {
  const sourceOffset = vertex * 4;
  for (let lane = 0; lane < 4; lane++) {
    target[targetOffset + lane] = values?.[sourceOffset + lane] ?? 0;
  }
}

function readRequired(mesh: Mesh, kind: string): ArrayLike<number> {
  const data = mesh.getVerticesData(kind);
  if (!data) throw new Error(`WebGPU pre-skin cache: ${mesh.name} has no ${kind} data.`);
  return data;
}

function packSourceVertices(mesh: Mesh): Float32Array {
  const positions = readRequired(mesh, BABYLON.VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
  const indices = readRequired(mesh, BABYLON.VertexBuffer.MatricesIndicesKind);
  const weights = readRequired(mesh, BABYLON.VertexBuffer.MatricesWeightsKind);
  const extraIndices = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesExtraKind);
  const extraWeights = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsExtraKind);
  const count = mesh.getTotalVertices();
  const packed = new Float32Array(count * SOURCE_VEC4S_PER_VERTEX * 4);

  for (let vertex = 0; vertex < count; vertex++) {
    const source3 = vertex * 3;
    const target = vertex * SOURCE_VEC4S_PER_VERTEX * 4;
    packed[target] = positions[source3];
    packed[target + 1] = positions[source3 + 1];
    packed[target + 2] = positions[source3 + 2];
    packed[target + 3] = 1;
    packed[target + 4] = normals?.[source3] ?? 0;
    packed[target + 5] = normals?.[source3 + 1] ?? 1;
    packed[target + 6] = normals?.[source3 + 2] ?? 0;
    appendInfluence(packed, target + 8, indices, vertex);
    appendInfluence(packed, target + 12, weights, vertex);
    appendInfluence(packed, target + 16, extraIndices, vertex);
    appendInfluence(packed, target + 20, extraWeights, vertex);
  }
  return packed;
}

/**
 * One GPU-deformed vertex cache per module. The resulting buffers are consumed
 * as ordinary position/normal vertex streams by every rigid actor instance.
 */
export class ShadoHybridPreSkinCache {
  private readonly modules = new Map<string, PreSkinModule>();
  // 0..7 atlas/frame params, 8 = active pose slot (palette path only).
  private readonly params = new Uint32Array(12);
  private readonly paramsFloats = new Float32Array(this.params.buffer);
  private readonly paramsBuffer: StorageBuffer;
  private readonly shader: ComputeShader;
  private readonly observer: Observer<Scene>;
  private readonly source: StorageBuffer;
  private readonly output: StorageBuffer;
  private sourceBytes = 0;
  private outputBytes = 0;
  private totalVertices = 0;
  private lastPoseKey = '';
  private poseHandle?: ShadoPoseSlot;
  private readonly posePalette?: ShadoVatPosePalette;
  private ownsPosePalette = false;
  /** Alpha buckets for pose dedup. 64 keeps error under half a percent of a frame. */
  private readonly poseAlphaBuckets = 64;

  public static async Create(
    scene: Scene,
    meshes: ReadonlyMap<string, Mesh>,
    skeleton: Skeleton,
    vat: VATBuilder,
    quality: ShadoVatQualityTier,
    sharedAnimation: ArrayLike<number>,
    timeSource: () => number,
    options: ShadoPreSkinCacheOptions = {},
  ): Promise<ShadoHybridPreSkinCache> {
    const cache = new ShadoHybridPreSkinCache(
      scene,
      meshes,
      skeleton,
      vat,
      quality,
      sharedAnimation,
      timeSource,
      options,
    );
    await cache.warmUp();
    return cache;
  }

  private constructor(
    private readonly scene: Scene,
    meshes: ReadonlyMap<string, Mesh>,
    _skeleton: Skeleton,
    private readonly vat: VATBuilder,
    quality: ShadoVatQualityTier,
    private readonly sharedAnimation: ArrayLike<number>,
    private readonly timeSource: () => number,
    options: ShadoPreSkinCacheOptions = {},
  ) {
    const engine = scene.getEngine() as WebGPUEngine;
    if (!engine.isWebGPU || !vat.dqTex) {
      throw new Error('WebGPU pre-skin cache requires a WebGPU engine and a populated DQ atlas.');
    }

    // Default to the resolved pose palette; `false` restores direct atlas sampling.
    if (options.posePalette === false) {
      this.posePalette = undefined;
    } else if (options.posePalette) {
      this.posePalette = options.posePalette;
    } else {
      this.posePalette = new ShadoVatPosePalette(scene, vat, { maxPoses: options.maxPoses });
      this.ownsPosePalette = true;
    }
    const posePalette = this.posePalette;
    this.paramsBuffer = new BABYLON.StorageBuffer(
      engine,
      this.params.byteLength,
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      'Shado pre-skin pose parameters',
    );
    const usePalette = !!posePalette;
    this.shader = new BABYLON.ComputeShader(
      usePalette
        ? 'Shado synchronized module pre-skin cache (pose palette)'
        : 'Shado synchronized module pre-skin cache',
      engine,
      { computeSource: emitShadoPreSkinComputeWGSL(quality, { posePalette: usePalette }) },
      {
        bindingsMapping: usePalette
          ? {
              sourceVertices: { group: 0, binding: 0 },
              outputVertices: { group: 0, binding: 1 },
              params: { group: 0, binding: 2 },
              posePalette: { group: 0, binding: 3 },
              poseScales: { group: 0, binding: 4 },
            }
          : {
              sourceVertices: { group: 0, binding: 0 },
              outputVertices: { group: 0, binding: 1 },
              params: { group: 0, binding: 2 },
              dqAtlas: { group: 0, binding: 3 },
            },
      },
    );
    this.shader.setStorageBuffer('params', this.paramsBuffer);
    if (posePalette) {
      this.shader.setStorageBuffer('posePalette', posePalette.palette);
      this.shader.setStorageBuffer('poseScales', posePalette.scales);
    } else {
      this.shader.setTexture('dqAtlas', vat.dqTex, false);
    }

    const packedModules = [...meshes].map(([id, mesh]) => ({
      id,
      mesh,
      data: packSourceVertices(mesh),
    }));
    this.totalVertices = packedModules.reduce(
      (sum, module) => sum + module.mesh.getTotalVertices(),
      0,
    );
    const aggregate = new Float32Array(
      this.totalVertices * SOURCE_VEC4S_PER_VERTEX * 4,
    );
    let sourceFloatOffset = 0;
    for (const module of packedModules) {
      aggregate.set(module.data, sourceFloatOffset);
      sourceFloatOffset += module.data.length;
    }
    this.sourceBytes = aggregate.byteLength;
    this.outputBytes = this.totalVertices * OUTPUT_VEC4S_PER_VERTEX * 4 *
      Float32Array.BYTES_PER_ELEMENT;
    this.source = new BABYLON.StorageBuffer(
      engine,
      this.sourceBytes,
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      'Shado aggregate pre-skin source',
    );
    this.source.update(aggregate);
    this.output = new BABYLON.StorageBuffer(
      engine,
      this.outputBytes,
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE | BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX,
      'Shado aggregate pre-skin output',
    );
    this.shader.setStorageBuffer('sourceVertices', this.source);
    this.shader.setStorageBuffer('outputVertices', this.output);

    let vertexOffset = 0;
    for (const module of packedModules) {
      this.installModule(module.id, module.mesh, vertexOffset);
      vertexOffset += module.mesh.getTotalVertices();
    }
    this.observer = scene.onBeforeRenderObservable.add(() => this.dispatchChangedPose());
  }

  public setModuleActive(id: string, active: boolean): void {
    const module = this.modules.get(id);
    if (module) module.active = active;
  }

  public getStats(): ShadoPreSkinCacheStats {
    return {
      sourceBytes: this.sourceBytes,
      outputBytes: this.outputBytes,
      parameterBytes: this.params.byteLength,
      totalBytes: this.sourceBytes + this.outputBytes + this.params.byteLength,
      verticesPerPose: [...this.modules.values()].some(module => module.active)
        ? this.totalVertices : 0,
      moduleDispatchesPerPose: [...this.modules.values()].some(module => module.active) ? 1 : 0,
      lastGpuTimeMs: (this.shader.gpuTimeInFrame?.counter.current ?? 0) / 1_000_000,
    };
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.modules.clear();
    this.source.dispose();
    this.output.dispose();
    this.paramsBuffer.dispose();
    // Only dispose a palette this cache created; shared ones are caller-owned.
    if (this.ownsPosePalette) this.posePalette?.dispose();
  }

  /** Pose-cache occupancy and hit rate, or undefined on the direct atlas path. */
  public getPoseStats() {
    return this.posePalette?.getStats();
  }

  private installModule(id: string, mesh: Mesh, vertexOffset: number): void {
    const engine = this.scene.getEngine() as WebGPUEngine;
    const vertexCount = mesh.getTotalVertices();
    const outputBuffer = this.output.getBuffer();
    const byteOffset = vertexOffset * OUTPUT_VEC4S_PER_VERTEX * 4 *
      Float32Array.BYTES_PER_ELEMENT;
    const position = new BABYLON.VertexBuffer(engine, outputBuffer, BABYLON.VertexBuffer.PositionKind, {
      stride: 32,
      offset: byteOffset,
      size: 3,
      type: BABYLON.VertexBuffer.FLOAT,
      useBytes: true,
      takeBufferOwnership: false,
      label: `Shado cached position ${id}`,
    });
    const normal = new BABYLON.VertexBuffer(engine, outputBuffer, BABYLON.VertexBuffer.NormalKind, {
      stride: 32,
      offset: byteOffset + 16,
      size: 3,
      type: BABYLON.VertexBuffer.FLOAT,
      useBytes: true,
      takeBufferOwnership: false,
      label: `Shado cached normal ${id}`,
    });
    mesh.setVerticesBuffer(position, true, vertexCount);
    mesh.setVerticesBuffer(normal, true);
    for (const kind of [
      BABYLON.VertexBuffer.MatricesIndicesKind,
      BABYLON.VertexBuffer.MatricesWeightsKind,
      BABYLON.VertexBuffer.MatricesIndicesExtraKind,
      BABYLON.VertexBuffer.MatricesWeightsExtraKind,
    ]) {
      if (mesh.isVerticesDataPresent(kind)) mesh.removeVerticesData(kind);
    }
    this.modules.set(id, {
      vertexCount,
      active: true,
    });
  }

  private updatePose(): string {
    const start = Number(this.sharedAnimation[0]) || 0;
    const end = Math.max(start, Number(this.sharedAnimation[1]) || start);
    const phase = Number(this.sharedAnimation[2]) || 0;
    const rate = Number(this.sharedAnimation[3]) || 0;
    const frameCount = end - start + 1;
    const animationFrame = this.timeSource() * rate + phase;
    const absolute = start + animationFrame - frameCount * Math.floor(animationFrame / frameCount);
    this.params[0] = Math.floor(absolute);
    this.params[1] = Math.min(this.params[0] + 1, Math.floor(end));
    this.paramsFloats[2] = absolute - Math.floor(absolute);
    this.params[3] = this.vat.dqWidthBones;
    this.params[4] = this.vat.dqTilesX;
    this.params[5] = this.vat.dqFramesX;
    this.params[6] = this.vat.dqStrideTexels;
    this.params[7] = this.vat.dqHasScale ? 1 : 0;

    if (this.posePalette) {
      // Release last frame's reservation before acquiring this frame's, so a
      // steady-state cohort holds exactly one slot rather than leaking one per
      // frame until the table reports itself exhausted.
      if (this.poseHandle) this.posePalette.release(this.poseHandle.slot);
      this.posePalette.beginFrame();
      this.poseHandle = this.posePalette.acquire(
        makePoseKey({
          bankId: 0,
          clipId: Math.floor(start),
          frame0: this.params[0],
          frame1: this.params[1],
          alpha: this.paramsFloats[2],
          alphaBuckets: this.poseAlphaBuckets,
          singleFrame: this.params[0] === this.params[1],
        }),
      );
      this.params[8] = this.poseHandle.slot;
    }

    this.paramsBuffer.update(this.params);
    return this.posePalette
      ? `${this.params[8]}:${this.poseHandle?.generation ?? 0}`
      : `${this.params[0]}:${this.params[1]}:${this.params[2]}`;
  }

  private async warmUp(): Promise<void> {
    const poseKey = this.updatePose();
    // The palette must be resolved before the skin pass samples it. WebGPU
    // executes submitted commands in order, so encoding it first is sufficient.
    if (this.posePalette) await this.posePalette.warmUp();
    await this.shader.dispatchWhenReady(Math.ceil(this.totalVertices / WORKGROUP_SIZE));
    this.lastPoseKey = poseKey;
  }

  private dispatchChangedPose(): void {
    const poseKey = this.updatePose();
    if (poseKey === this.lastPoseKey) return;
    if (![...this.modules.values()].some(module => module.active)) return;
    if (this.posePalette) this.posePalette.dispatchResolve();
    if (this.shader.dispatch(Math.ceil(this.totalVertices / WORKGROUP_SIZE))) {
      this.lastPoseKey = poseKey;
    }
  }
}
