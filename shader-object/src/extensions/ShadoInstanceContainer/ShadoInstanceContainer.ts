import { BABYLON } from '../../babylon';
import { ASCExtension, Shado } from '../../core/Shado';
import { ShadoInstanceSoA } from '../../core/ShadoInstanceSoA';
import { gpuStruct, field } from '../../decorators';
import { ShadoMaterial, type ShadoVatQualityTier } from '../../materials/ShadoMaterial';
import type { ShadoInstanceAsyncPickingOptions } from '../../render/ShadoAsyncPicking';
import { ShadoActor } from '../ShadoActor';
import { NameplateData } from '../NameplateData';
import type {
  Plane,
  Material,
  Scene,
  Mesh,
  Texture,
  Observer,
  Skeleton,
} from '../../babylon';
import {
  type DQBuildOpts,
  type PackedDQVAT,
  type SerializedDQVAT,
  VATBuilder,
} from '../VATBuilder/VATBuilder';
import { InitializeConfig } from '../../types';
import { collectSourcesFromMeshes, makeResolverForMesh } from './utils';
import { buildArrayAtlasFromSources } from '../AtlasBuilder/AtlasBuilder';
import {
  compactShadoVertexMetadata,
  mergeWithPreservedAtlasAttributes,
  normalizeSkinningIndexAttributesForWebGPU,
  stampSubmeshAtlasAttributes,
} from './mesh-data';
import { VisibleIndexTexture } from './VisibleIndexTexture';
import type { GPUUploadStats } from '../../types';

/**
 * Minimal cross-runtime camera contract used by instance culling.
 *
 * Consumers may load a compatible Babylon version from a different package
 * location. Depending on Babylon's nominal Camera class here would reject
 * those cameras even though culling only reads these values.
 */
export interface ShadoFrustumCamera {
  getScene(): {
    getTransformMatrix(): unknown;
  };
  readonly globalPosition?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export type ShadoInstanceContainerOptions = {
  vat?: 'auto' | 'bake' | 'none';
  /** Vertex-animation quality tier. `rigid` skips VAT generation and sampling. */
  vatQuality?: ShadoVatQualityTier;
  animationRanges?: Array<{ from: number; to: number }>;
  migrateTextures?: 'share' | 'move' | 'clone' | 'none';
  replaceMaterial?: boolean;
  disposeOriginalMaterial?: boolean;
  defines?: string[];
  logOnCompile?: boolean;
  merge?: boolean;
  vatOptions?: DQBuildOpts;
  prebakedVat?: SerializedDQVAT;
  /** Binary VAT returned by a Shado headless bake worker. */
  packedVat?: PackedDQVAT;
  picking?: boolean | ShadoInstanceAsyncPickingOptions<any>;
  /** Additional textures consumed by container-specific shader extensions. */
  materialTextures?: Record<string, Texture>;
};

/**
 * Named insertion points for extending the generated GLSL instance shader.
 * Each hook is emitted as a complete statement/declaration block; subclasses
 * never need to search and replace Shado's generated shader source.
 */
export type ShadoInstanceGLSLHooks = Readonly<{
  /** Varyings and helper declarations shared with the vertex stage. */
  vertexDeclarations?: string;
  /** Uniforms, varyings, and helpers shared with the fragment stage. */
  fragmentDeclarations?: string;
  /** Runs after `inst` and mutable `shadoColor` are available. */
  vertexInstance?: string;
  /** Runs after the standard instance position has been written. */
  vertexAfterPosition?: string;
  /** Runs after `surface = atlasColor * shadoColor` in the fragment stage. */
  fragmentSurface?: string;
}>;

/**
 * WGSL equivalents of the generated material insertion points.
 *
 * Hook bodies use Babylon's WGSL shader-processor names (`vertexInputs`,
 * `vertexOutputs`, `fragmentInputs`, `fragmentOutputs`, and `uniforms`).
 */
export type ShadoInstanceWGSLHooks = Readonly<{
  /** Varyings and helper declarations shared with the vertex stage. */
  vertexDeclarations?: string;
  /** Uniforms, varyings, and helpers shared with the fragment stage. */
  fragmentDeclarations?: string;
  /** Runs after `inst` and mutable `shadoColor` are available. */
  vertexInstance?: string;
  /** Runs after the standard instance position has been written. */
  vertexAfterPosition?: string;
  /** Runs after `surface = atlasColor * shadoColor` in the fragment stage. */
  fragmentSurface?: string;
}>;

export type InstanceNameSource = readonly string[] | ((index: number) => string);

export type AddInstancesOptions = {
  /** Skip the default random clip when the caller assigns animation state. */
  playRandomAnimation?: boolean;
  /** Defer nameplate publication until a larger mutation finishes. */
  rebuildNameplates?: boolean;
};

function installSolidColorTextures(scene: Scene, meshes: Mesh[]): Texture[] {
  const materials = new Set<any>();
  for (const mesh of meshes) {
    const material: any = mesh.material;
    if (!material) continue;
    if (Array.isArray(material.subMaterials)) {
      for (const subMaterial of material.subMaterials) if (subMaterial) materials.add(subMaterial);
    } else {
      materials.add(material);
    }
  }

  const generated: Texture[] = [];
  for (const material of materials) {
    // glTF permits a baseColorFactor without a texture. The showcase material
    // samples an atlas, so synthesize a one-pixel source instead of silently
    // rendering factor-only PBR materials black.
    if (material.albedoTexture || material.diffuseTexture) continue;
    const color = material.albedoColor ?? material.diffuseColor ?? BABYLON.Color3.White();
    const alpha = Number.isFinite(material.alpha) ? material.alpha : 1;
    const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
    const texture = new BABYLON.RawTexture(
      new Uint8Array([channel(color.r), channel(color.g), channel(color.b), channel(alpha)]),
      1,
      1,
      BABYLON.Engine.TEXTUREFORMAT_RGBA,
      scene,
      false,
      false,
      BABYLON.Texture.NEAREST_NEAREST,
      BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE
    );
    texture.name = `shado-solid-${material.uniqueId ?? generated.length}`;
    texture.gammaSpace = true;
    if ('albedoColor' in material) material.albedoTexture = texture;
    else material.diffuseTexture = texture;
    generated.push(texture);
  }
  return generated;
}

@gpuStruct({ name: 'ShadoInstanceContainer', useWasm: true })
export class ShadoInstanceContainer<T extends ShadoActor> extends Shado {
  // `declare` is significant here: emitting native class fields after super()
  // replaces Shado's packed-arena accessors with undefined data properties in
  // production bundles. Thin actor objects skip constructors, but this owning
  // container does not.
  @field('u32') declare visibleCount: number;
  @field('u32') declare instancesPtr: number;
  @field('u32') declare instancesCount: number;
  @field({ arrayOf: 'vec4' }) declare cameraFrustum: Float32Array;
  // We fill in the instances array struct dynamically

  private static _instanceName: string = ShadoActor.getSchema().name;

  declare instances: T[];
  private _clipRanges: Map<string, number> = new Map();
  private _clipIndexByName: Map<string, number> = new Map();
  private _clipDurations: number[] = [];
  private _bindings = new Map<
    Mesh,
    {
      material: ShadoMaterial<any>;
      oldMaterial?: Material | null;
      vatObserver?: Observer<Scene>;
      generatedTextures?: Texture[];
    }
  >();

  private _children: T[] = [];
  private readonly _instanceSoA: ShadoInstanceSoA;
  private readonly _visibleIndexTexture: VisibleIndexTexture;
  private _useVatMaterial = true;
  public vat: VATBuilder | undefined;
  public get children() {
    return this._children;
  }
  public get instanceCount() {
    return this._children.length;
  }
  public override getVisibleCount(): number {
    return this._instanceSoA.visibleCount;
  }

  public get visibleActorIndices(): Uint32Array {
    return this._instanceSoA.visibleActorIndices;
  }
  public get visibilityFlags(): Uint8Array {
    return this._instanceSoA.visibilityFlags;
  }
  public get visibilityVersion(): number {
    return this._instanceSoA.version;
  }
  public get activeCullingMode(): 'wasm-simd' | 'cpu' {
    return typeof this.ops?.frustumMarkSoA === 'function' ? 'wasm-simd' : 'cpu';
  }
  public get actorDirtyFlags(): Uint8Array {
    return this._instanceSoA.dirtyFlags;
  }
  public get actorCullingFlags(): Uint8Array {
    return this._instanceSoA.cullingFlags;
  }
  public getActorDirtyFlagsPtr(): number {
    return this._instanceSoA.dirtyPtr;
  }
  public getActorCullingFlagsPtr(): number {
    return this._instanceSoA.cullingPtr;
  }

  /** Accepts the compact output of a coordinated world/entity visibility reducer. */
  public applyVisibilityReduction(
    visibleIndices: ArrayLike<number>,
    cullingFlags?: ArrayLike<number>
  ): void {
    this._instanceSoA.ensureCapacity(this._children.length);
    this._instanceSoA.applyVisibilityPass(visibleIndices, cullingFlags);
    this._setLegacyVisibleCount(this._instanceSoA.visibleCount);
  }

  public set nameplates(nameplates: NameplateData | undefined) {
    this._nameplates = nameplates;
    if (nameplates && !nameplates.visibilityCompacted) {
      this._visibleIndexTexture.enableVisibilityFlags();
    }
  }
  private _nameplates?: NameplateData;

  /** Enable the compatibility visibility-flag texture for external shaders. */
  public requireVisibilityFlags(): void {
    this._visibleIndexTexture.enableVisibilityFlags();
  }

  /**
   * Use only the compatibility visibility texture. This avoids allocating and
   * uploading compact indices for an external material that cannot consume them.
   */
  public useVisibilityFlagsOnly(): void {
    this._visibleIndexTexture.enableVisibilityFlagsOnly();
  }

  /** Reserve both packed actor records and their WASM/CPU sidecar planes. */
  public reserveInstances(count: number): void {
    const required = Math.max(0, count | 0);
    this.reserveStructArray('instances', required);
    this._instanceSoA.reserve(required);
    this._refreshViewsIfGrown();
  }

  public static override async initialize(engine: any, config: InitializeConfig = {}) {
    const childCtor = ((config.extra as any) ?? ShadoActor) as any;
    if (!config.additionalFields?.some(f => f.name === 'instances')) {
      config.additionalFields = [{ name: 'instances', type: { arrayOf: { structOf: childCtor } } }];
      // generateGLSLPair is implemented on the base class and reads the base
      // static. Assigning through `this` creates a shadow property on a
      // subclass, leaving shaders stuck on ShadoActor and making Babylon fetch
      // the missing include as a URL. Keep the selected actor schema global to
      // this generated container family.
      ShadoInstanceContainer._instanceName = childCtor.getSchema?.().name ?? childCtor.name;
    }
    return super.initialize(engine, config);
  }

  constructor(engine: any) {
    super(engine);
    this._instanceSoA = new ShadoInstanceSoA();
    this._visibleIndexTexture = new VisibleIndexTexture(engine);
    if (this.wasmModule) {
      this._instanceSoA.attachWasm(this.wasmModule);
      // Sidecar allocation may grow WebAssembly.Memory and detach the arena.
      this._refreshViewsIfGrown();
    }
  }

  public getVisibilityFlag(index: number): number {
    return this._instanceSoA.visibilityFlags[index] ?? 0;
  }

  private _setLegacyVisibleCount(value: number): void {
    const field = this.getSchema().fields.find(candidate => candidate.name === 'visibleCount');
    if (!field) return;
    const byteOffset = (this._headerSeg.offF + (field.headerFloatOffset ?? 0)) * 4;
    this._arena.dataView().setUint32(byteOffset, value >>> 0, true);
  }

  public setVisibilityFlag(index: number, visible: boolean): void {
    if (index < 0 || index >= this.instanceCount) return;
    this._instanceSoA.setVisibility(index, visible);
  }

  public override getStructDirtyFlags(field: string): Uint8Array {
    return field === 'instances' ? this._instanceSoA.dirtyFlags : super.getStructDirtyFlags(field);
  }

  public override setStructDirtyFlag(field: string, index: number, dirty = true): void {
    if (field === 'instances') this._instanceSoA.setDirty(index, dirty);
    else super.setStructDirtyFlag(field, index, dirty);
  }

  public override clearStructDirtyFlags(field: string): void {
    if (field === 'instances') this._instanceSoA.clearDirty();
    else super.clearStructDirtyFlags(field);
  }

  /** Override to add application-specific material behavior at stable hooks. */
  protected getGLSLHooks(): ShadoInstanceGLSLHooks {
    return {};
  }

  /** Override to add application-specific behavior to storage-backed WGSL. */
  protected getWGSLHooks(): ShadoInstanceWGSLHooks {
    return {};
  }

  public override dispose() {
    for (const binding of this._bindings.values()) {
      for (const texture of binding.generatedTextures ?? []) texture.dispose();
    }
    this._visibleIndexTexture.dispose();
    super.dispose();
  }

  public override commit(): GPUUploadStats {
    this._applyActorDirtyPass();
    const actor = super.commit();
    if (actor.uploadCalls > 0) this._instanceSoA.clearDirty();
    const visible = this._visibleIndexTexture.commit(this._instanceSoA);
    if (!actor.uploadCalls) return visible;
    if (!visible.uploadCalls) return actor;
    return {
      uploadCalls: actor.uploadCalls + visible.uploadCalls,
      uploadedBytes: actor.uploadedBytes + visible.uploadedBytes,
      encodedBytes: actor.encodedBytes + visible.encodedBytes,
    };
  }

  /** Turns the one-byte WASM/CPU sidecar into coalesced actor AoS upload ranges. */
  private _applyActorDirtyPass(): void {
    const bounds = this._instanceSoA.dirtyActorBounds;
    if (!bounds) return;
    const flags = this._instanceSoA.dirtyFlags;
    const seg = this._structSeg.instances;
    const strideF = this.getSchema().structArrays.instances?.schema.headerFloatCount ?? 0;
    if (!seg || !strideF) return;
    let runStart = -1;
    for (let i = bounds.start; i <= bounds.end; i++) {
      if (i < bounds.end && flags[i]) {
        if (runStart < 0) runStart = i;
        continue;
      }
      if (runStart < 0) continue;
      this._arena.markDirtyFloats(seg.offF + runStart * strideF, (i - runStart) * strideF);
      runStart = -1;
    }
  }

  public override bind(effect: any): void {
    super.bind(effect);
    this._visibleIndexTexture.bind(effect);
  }

  public override bindMaterial(material: any): void {
    super.bindMaterial(material);
    this._visibleIndexTexture.bind(material);
  }

  public getClipId(name: string): number | undefined {
    return this._clipIndexByName.get(name.toLowerCase());
  }
  public getClipDurations(): number[] {
    return this._clipDurations;
  }

  public setInstanceClip(i: number, clipNameOrId: string | number, speed = 1, phase = 0) {
    const ch = this._children[i];
    if (!ch) return;
    const clipId =
      typeof clipNameOrId === 'number'
        ? clipNameOrId | 0
        : (this._clipIndexByName.get(clipNameOrId.toLowerCase()) ?? 0);
    const clip = this.vat?.clips[clipId];
    if (!clip) return;
    ch.animationBuffer.set([
      clip.from,
      clip.to,
      Math.max(0, Math.min(1, phase)) * Math.max(1, clip.frames - 1),
      (clip.fps || 60) * speed,
    ]);
    ch.emitHeaderDirty();
  }

  public async attachMeshes(
    scene: Scene,
    meshes: Mesh[],
    skeleton: Skeleton | null | undefined,
    opts: ShadoInstanceContainerOptions = {}
  ): Promise<ShadoMaterial<any>> {
    const vatQuality = opts.vatQuality ?? 'full';
    const useVat = opts.vat !== 'none' && vatQuality !== 'rigid';
    const generatedColorTextures = installSolidColorTextures(scene, meshes);
    const { sources, byId } = collectSourcesFromMeshes(meshes);
    let atlas;
    try {
      atlas = await buildArrayAtlasFromSources(scene, sources, {
        pageSize: 2048,
        padding: 2,
        bleed: 2,
        allowRotation: false,
        mipmaps: true,
        //debug: { export: true, name: 'atlas' },
      });
    } catch (error) {
      for (const texture of generatedColorTextures) texture.dispose();
      throw error;
    }

    meshes = meshes.filter(m => m.getTotalVertices() > 0);
    // MergeMeshes writes source vertices in world space. Preserve the skinned
    // source basis so an in-process VAT bake can express its palette in the
    // resulting merged mesh's coordinate system too.
    const paletteSource = meshes.find(m => !!m.skeleton) ?? meshes[0];
    const mergePaletteBasis =
      opts.merge && useVat && paletteSource
        ? paletteSource.computeWorldMatrix(true).clone()
        : undefined;
    const vatOptions =
      mergePaletteBasis && !opts.vatOptions?.paletteBasis
        ? { ...opts.vatOptions, paletteBasis: mergePaletteBasis }
        : opts.vatOptions;
    const texToId = new Map<Texture, string>();
    for (const [id, rec] of byId /* however you kept it */) {
      texToId.set(rec.tex, id);
    }
    const idForTexture = (t: Texture) => texToId.get(t);

    let mesh: Mesh | undefined | null;
    if (opts.merge) {
      // Mesh.MergeMeshes already extracts every source with its world matrix
      // and applies that transform while combining VertexData. Pre-baking the
      // same matrix here transformed non-identity GLBs twice (BrainStem's
      // COLLADA axis-conversion root is a 90-degree rotation), while the VAT
      // palette was sampled from the once-transformed rig. Identity-root EQ
      // assets hid this bug.
      for (const m of meshes) {
        const resolveId = makeResolverForMesh(m, idForTexture);
        stampSubmeshAtlasAttributes(m, atlas, resolveId);
      }
      mesh = BABYLON.Mesh.MergeMeshes(
        meshes,
        false, // disposeSource
        true, // allow32BitsIndices - CRITICAL: Must be true for meshes with >65k vertices
        undefined,
        false, // meshSubclass - IMPORTANT: false for proper merging
        false // multiMultiMaterial - IMPORTANT: false avoids submesh complexity
      );
      if (!mesh) throw new Error('Merge failed');

      mergeWithPreservedAtlasAttributes(meshes, mesh);
      meshes.forEach(m => m.dispose());
    } else {
      mesh = meshes[0];
    }

    if (!mesh) throw new Error('attachMeshes: failed to merge meshes');
    compactShadoVertexMetadata(mesh);
    if (scene.getEngine().isWebGPU) {
      normalizeSkinningIndexAttributesForWebGPU(mesh);
    }
    mesh.skeleton = skeleton ?? null;
    if (useVat && !skeleton) {
      throw new Error('attachMeshes: mesh has no Skeleton; VAT/DQ requires a skeleton.');
    }

    this.vat = useVat
      ? opts.packedVat
        ? VATBuilder.fromPacked(scene as any, opts.packedVat)
        : opts.prebakedVat
          ? VATBuilder.fromSerialized(scene as any, opts.prebakedVat)
          : vatOptions?.execution === 'worker'
            ? await VATBuilder.buildFromSceneAsync(
                scene as any,
                mesh as any,
                mesh.skeleton as any,
                vatOptions
              )
            : VATBuilder.buildFromScene(
                scene as any,
                mesh as any,
                mesh.skeleton as any,
                vatOptions ?? { useHalfDQ: true }
              )
      : undefined;
    this._useVatMaterial = useVat;
    this._clipRanges.clear();
    this._clipIndexByName.clear();
    this._clipDurations.length = 0;
    for (const [index, clip] of (this.vat?.clips ?? []).entries()) {
      this._clipIndexByName.set(clip.name.toLowerCase(), index);
      this._clipRanges.set(clip.name.toLowerCase(), clip.from);
      this._clipDurations.push(clip.frames / Math.max(1, clip.fps));
    }
    // 2) Build SOMaterial (this also installs controlled draw + hides default draw)
    const som = new ShadoMaterial(scene, mesh, atlas, this as unknown as Shado, {
      defines: opts.defines,
      logOnCompile: opts.logOnCompile,
      picking: opts.picking,
      useVat,
      vatQuality,
      textures: opts.materialTextures,
    });
    if (this.vat) som.vatDQ = this.vat;

    mesh.material = som;
    mesh.alwaysSelectAsActiveMesh = true;

    this._bindings.set(mesh, { material: som, generatedTextures: generatedColorTextures });
    return som;
  }

  detachMesh(mesh: Mesh) {
    const rec = this._bindings.get(mesh);
    if (!rec) return;
    rec.material.dispose(true, true);
    if (rec.oldMaterial && !mesh.isDisposed()) {
      mesh.material = rec.oldMaterial;
      mesh.isVisible = true;
    }
    if (rec.vatObserver) mesh.getScene().onBeforeRenderObservable.remove(rec.vatObserver);
    for (const texture of rec.generatedTextures ?? []) texture.dispose();
    this._bindings.delete(mesh);
  }

  static ascExtension: ASCExtension = {
    source: _schema => `
export function frustumMarkSoA(
  base: usize,
  planesPtr: usize,
  visibleIndicesPtr: usize,
  visibilityPtr: usize,
  baseRadius: f32,
  camX: f32,
  camY: f32,
  camZ: f32,
  maxDist: f32
): i32 {
  const h = changetype<ShadoInstanceContainerHeader>(base);
  const count = <i32>h.instancesCount;
  if (count <= 0) return 0;

  // Load planes once
  const p0 = v128.load(planesPtr +  0 * 16);
  const p1 = v128.load(planesPtr +  1 * 16);
  const p2 = v128.load(planesPtr +  2 * 16);
  const p3 = v128.load(planesPtr +  3 * 16);
  const p4 = v128.load(planesPtr +  4 * 16);
  const p5 = v128.load(planesPtr +  5 * 16);

  // Precompute n0 = normal with lane 3 = 0 for each plane
  const n0_0 = f32x4.replace_lane(p0, 3, 0.0);
  const n0_1 = f32x4.replace_lane(p1, 3, 0.0);
  const n0_2 = f32x4.replace_lane(p2, 3, 0.0);
  const n0_3 = f32x4.replace_lane(p3, 3, 0.0);
  const n0_4 = f32x4.replace_lane(p4, 3, 0.0);
  const n0_5 = f32x4.replace_lane(p5, 3, 0.0);

  const d0 = f32x4.extract_lane(p0, 3);
  const d1 = f32x4.extract_lane(p1, 3);
  const d2 = f32x4.extract_lane(p2, 3);
  const d3 = f32x4.extract_lane(p3, 3);
  const d4 = f32x4.extract_lane(p4, 3);
  const d5 = f32x4.extract_lane(p5, 3);

  let readPtr   = h.instancesPtr;
  let visCount = 0;
  const doRange = maxDist > 0.0;

  for (let i = 0; i < count; i++) {
    store<u8>(visibilityPtr + <usize>i, 0);

    const pos = v128.load(readPtr + <usize>OFFSET_${ShadoInstanceContainer._instanceName}_translation);

    if (doRange) {
      const dx = f32x4.extract_lane(pos, 0) - camX;
      const dy = f32x4.extract_lane(pos, 1) - camY;
      const dz = f32x4.extract_lane(pos, 2) - camZ;
      const s  = f32x4.extract_lane(pos, 3);
      const r  = baseRadius * s;
      const md = maxDist + r;
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 > md*md) {
        readPtr += <usize>SIZEOF_${ShadoInstanceContainer._instanceName}Header;
        continue;
      }
    }

    // 6 planes, no allocations
    let inside = 1;

    {
      const m = f32x4.mul(pos, n0_0);
      const dot = f32x4.extract_lane(m, 0) + f32x4.extract_lane(m, 1) + f32x4.extract_lane(m, 2);
      if (dot + d0 < -baseRadius * f32x4.extract_lane(pos, 3)) inside = 0;
    }
    if (inside) {
      const m = f32x4.mul(pos, n0_1);
      const dot = f32x4.extract_lane(m, 0) + f32x4.extract_lane(m, 1) + f32x4.extract_lane(m, 2);
      if (dot + d1 < -baseRadius * f32x4.extract_lane(pos, 3)) inside = 0;
    }
    if (inside) {
      const m = f32x4.mul(pos, n0_2);
      const dot = f32x4.extract_lane(m, 0) + f32x4.extract_lane(m, 1) + f32x4.extract_lane(m, 2);
      if (dot + d2 < -baseRadius * f32x4.extract_lane(pos, 3)) inside = 0;
    }
    if (inside) {
      const m = f32x4.mul(pos, n0_3);
      const dot = f32x4.extract_lane(m, 0) + f32x4.extract_lane(m, 1) + f32x4.extract_lane(m, 2);
      if (dot + d3 < -baseRadius * f32x4.extract_lane(pos, 3)) inside = 0;
    }
    if (inside) {
      const m = f32x4.mul(pos, n0_4);
      const dot = f32x4.extract_lane(m, 0) + f32x4.extract_lane(m, 1) + f32x4.extract_lane(m, 2);
      if (dot + d4 < -baseRadius * f32x4.extract_lane(pos, 3)) inside = 0;
    }
    if (inside) {
      const m = f32x4.mul(pos, n0_5);
      const dot = f32x4.extract_lane(m, 0) + f32x4.extract_lane(m, 1) + f32x4.extract_lane(m, 2);
      if (dot + d5 < -baseRadius * f32x4.extract_lane(pos, 3)) inside = 0;
    }

    if (inside) {
      store<u32>(visibleIndicesPtr + <usize>visCount * 4, <u32>i);
      store<u8>(visibilityPtr + <usize>i, 1);
      visCount++;
    }

    readPtr += <usize>SIZEOF_${ShadoInstanceContainer._instanceName}Header;
  }

  return visCount;
}



`,
  };

  // Call this each frame *only if* the frustum changed (or just call it; it's cheap).
  public updateFrustumFromCamera(camera: ShadoFrustumCamera) {
    const planes: Plane[] =
      (this as any)._bjsFrustumPlanes ??
      ((this as any)._bjsFrustumPlanes = Array.from(
        { length: 6 },
        () => new BABYLON.Plane(0, 0, 0, 0)
      ));

    const vp = camera.getScene().getTransformMatrix() as Parameters<
      typeof BABYLON.Frustum.GetPlanesToRef
    >[0];
    BABYLON.Frustum.GetPlanesToRef(vp, planes);

    const out = this._instanceSoA.frustumPlanes;
    let o = 0;
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      out[o++] = p.normal.x;
      out[o++] = p.normal.y;
      out[o++] = p.normal.z;
      out[o++] = p.d;
    }
  }

  public frustumCull(camera: ShadoFrustumCamera, baseRadius: number, maxDistance = 0) {
    if (!camera) {
      return;
    }
    this._refreshViewsIfGrown();
    this.updateFrustumFromCamera(camera);

    this._instanceSoA.ensureCapacity(this._children.length);
    const wasmOps = this.ops;
    if (!wasmOps) {
      this.frustumCullCPU(camera, baseRadius, maxDistance);
      return;
    }
    const frustumMarkSoA = wasmOps.frustumMarkSoA;
    if (typeof frustumMarkSoA !== 'function') {
      throw new Error(
        `${this.constructor.name} WASM module is missing required frustumMarkSoA export`
      );
    }

    const camPos = camera.globalPosition ?? camera.position;
    const planesPtr = this._instanceSoA.frustumPtr;

    const visibleCount = frustumMarkSoA(
      planesPtr,
      this._instanceSoA.visibleIndicesPtr,
      this._instanceSoA.visibilityPtr,
      baseRadius,
      camPos.x,
      camPos.y,
      camPos.z,
      maxDistance // 0 is sentinel to disable range check
    );
    this._instanceSoA.finishVisibilityPass(visibleCount);
    this._setLegacyVisibleCount(visibleCount);
  }

  public frustumCullCPU(camera: ShadoFrustumCamera, baseRadius: number, maxDistance = 0) {
    const planes: Plane[] =
      (this as any)._bjsFrustumPlanes ??
      ((this as any)._bjsFrustumPlanes = Array.from(
        { length: 6 },
        () => new BABYLON.Plane(0, 0, 0, 0)
      ));
    const camPos = camera.globalPosition ?? camera.position;
    const doRange = maxDistance > 0;
    let visibleCount = 0;
    this.updateFrustumFromCamera(camera);
    this._instanceSoA.beginVisibilityPass(this._children.length);

    for (let i = 0; i < this._children.length; i++) {
      const child: any = this._children[i];

      const translation = child.translation as Float32Array;
      const x = translation[0] ?? 0;
      const y = translation[1] ?? 0;
      const z = translation[2] ?? 0;
      const scale = translation[3] ?? 1;
      const radius = baseRadius * scale;

      if (doRange) {
        const dx = x - camPos.x;
        const dy = y - camPos.y;
        const dz = z - camPos.z;
        const max = maxDistance + radius;
        if (dx * dx + dy * dy + dz * dz > max * max) continue;
      }

      let inside = true;
      for (let p = 0; p < 6; p++) {
        const plane = planes[p];
        if (plane.normal.x * x + plane.normal.y * y + plane.normal.z * z + plane.d < -radius) {
          inside = false;
          break;
        }
      }

      if (!inside) continue;
      this._instanceSoA.appendVisible(i);
      visibleCount++;
    }

    this._instanceSoA.finishVisibilityPass(visibleCount);
    this._setLegacyVisibleCount(visibleCount);
  }

  public getClipRanges() {
    return this._clipRanges;
  }

  public setChildName(childIndex: number, name: string) {
    if (!this._nameplates) return;
    const idx = this._nameplates.addName(name);
    const ch = this._children[childIndex];
    if (!ch) return;
    ch.nameIndex = idx;
    ch.emitHeaderDirty();
    this._nameplates.rebuildStreams(this._children);
  }

  public addNamesToPool(names: string[]): number[] {
    if (!this._nameplates) return [];
    const idxs = this._nameplates.addNamesToPool(names);
    this._nameplates.rebuildStreams(this._children);
    return idxs;
  }

  public addInstance(
    suppressRebuild?: boolean,
    name?: string,
    playRandomAnimation = true
  ): T {
    const ch = this.addStructToArray<T>('instances');

    ch.initialize();

    // name index
    ch.nameIndex = this._nameplates
      ? name
        ? this._nameplates.addName(name)
        : Math.floor(this._nameplates.nameCount() * Math.random())
      : -1;

    if (playRandomAnimation) ch.playRandomAnimation(this.vat?.clips ?? []);

    this._children.push(ch);
    this._instanceSoA.ensureCapacity(this._children.length);
    this._refreshViewsIfGrown();
    this._instanceSoA.setDirty(this._children.length - 1, true);
    if (!suppressRebuild) this._nameplates?.rebuildStreams(this._children);
    return ch;
  }

  public addInstances(
    n: number,
    names?: InstanceNameSource,
    options: AddInstancesOptions = {}
  ) {
    const amount = Math.max(0, n | 0);
    if (!amount) return [];
    this.reserveInstances(this._children.length + amount);
    const created = this.appendStructsToArray<T>('instances', amount);
    for (let i = 0; i < amount; i++) {
      const ch = created[i];
      ch.initialize();
      const name = typeof names === 'function' ? names(i) : names?.[i];
      ch.nameIndex = this._nameplates
        ? name
          ? this._nameplates.addName(name)
          : Math.floor(this._nameplates.nameCount() * Math.random())
        : -1;
      if (options.playRandomAnimation !== false) {
        ch.playRandomAnimation(this.vat?.clips ?? []);
      }
      this._children.push(ch);
    }
    this._instanceSoA.ensureCapacity(this._children.length);
    this._refreshViewsIfGrown();
    if (options.rebuildNameplates !== false) {
      this._nameplates?.rebuildStreams(this._children);
    }
    return created;
  }

  public removeRandomInstance() {
    const n = this._children.length;
    if (!n) return;
    const randomIndex = Math.floor(Math.random() * n);
    this.removeInstance(randomIndex);
  }

  /**
   * Removes a specific actor from the packed AoS array. The last actor is moved
   * into the vacated slot, matching the arena's swap-removal semantics.
   */
  public removeInstance(instance: number | T): T | undefined {
    const index = typeof instance === 'number' ? instance | 0 : this._children.indexOf(instance);
    if (index < 0 || index >= this._children.length) return undefined;

    const lastIndex = this._children.length - 1;
    const removed = this._children[index];
    if (index !== lastIndex) this._children[index] = this._children[lastIndex];
    this._children.pop();
    this.removeStructFromArray('instances', index, 'swap');
    this._instanceSoA.removeSwap(index);
    this._setLegacyVisibleCount(Math.min(this.getVisibleCount(), this._children.length));
    this._nameplates?.rebuildStreams(this._children);
    return removed;
  }

  public override generateGLSLPair(): { vs: string; fs: string } {
    // Get the instance-specific include name
    const includeName = (this as any)._includeName ?? 'ShadoInstanceContainer';
    const hooks = this.getGLSLHooks();

    const fs = `
precision highp float;
precision highp int;

varying vec2 vUV;
varying vec4 vColor;
varying vec3 vShadoLighting;
flat varying int   vPage;
flat varying vec4  vRect;

uniform highp sampler2DArray uAtlasArray;

${hooks.fragmentDeclarations ?? ''}

vec4 sampleAtlas(vec2 uv, vec4 rect, float page) {
  vec2 tiled = fract(uv);                 // handle uvs like 3.2 or -0.3
  vec2 uvA = tiled * (rect.zw - rect.xy) + rect.xy;
  // Use an explicit LOD so the generated WGSL uses textureSampleLevel. Tint's
  // uniformity analysis permits that operation even if its optimizer later
  // moves this lookup beneath the per-instance atlas-rect selection.
  return textureLod(uAtlasArray, vec3(uvA, page), 0.0);
}
void main() {
  // Select white for actors without an atlas allocation.
  float hasAtlasRect = step(0.00000001, min(vRect.z - vRect.x, vRect.w - vRect.y));
  vec4 atlasColor = sampleAtlas(vUV, vRect, float(vPage));
  vec4 c = mix(vec4(1.0), atlasColor, hasAtlasRect);
  // if (c.a <= 0.001) discard;
  vec4 surface = c * vColor;
  ${hooks.fragmentSurface ?? ''}
  surface.rgb *= vShadoLighting;
  gl_FragColor = surface;
}
`;

    if (!this._useVatMaterial) {
      const vs = `
precision highp float;
precision highp int;

attribute vec3 position;
#ifdef SHADO_HAS_NORMAL
attribute vec3 normal;
#endif
attribute vec2 uv;
attribute vec4 aMeta;
attribute vec4  aRect;

uniform mat4 worldViewProjection;
uniform vec3 uShadoLightDirection;
uniform vec3 uShadoLightColor;
uniform vec3 uShadoAmbientColor;

#include<${ShadoInstanceContainer._instanceName}>
#include<${ShadoInstanceContainer._instanceName}Offsets>
#include<${includeName}Storage>

uniform highp sampler2D uShadoVisibleIndices;
uniform int uShadoVisibleIndexTexWidth;

int Shado_visibleActorIndex(int drawIndex) {
  int texelIndex = drawIndex / 4;
  vec4 packed = texelFetch(
    uShadoVisibleIndices,
    ivec2(texelIndex % uShadoVisibleIndexTexWidth, texelIndex / uShadoVisibleIndexTexWidth),
    0
  );
  int lane = drawIndex - texelIndex * 4;
  float value = lane == 0 ? packed.x : lane == 1 ? packed.y : lane == 2 ? packed.z : packed.w;
  return int(value + 0.5);
}

varying vec2 vUV;
varying vec4 vColor;
varying vec3 vShadoLighting;
flat varying int   vPage;
flat varying vec4  vRect;

${hooks.vertexDeclarations ?? ''}

void main(void) {
  vUV = uv;
  vPage = int(aMeta.x);
  vRect = aRect;

  int drawIdx = gl_InstanceID;
  int srcIdx = Shado_visibleActorIndex(drawIdx);

  ${ShadoInstanceContainer._instanceName}Header inst = ShadoInstanceContainer_instances_get(srcIdx);
  vec4 T = inst.translation;
  vec4 shadoColor = inst.color;
  ${hooks.vertexInstance ?? ''}
  vec3 qv = inst.rotation.xyz;
  vec3 scaled = position * T.w;
  vec3 p = scaled + 2.0 * cross(qv, cross(qv, scaled) + inst.rotation.w * scaled) + T.xyz;
  gl_Position = worldViewProjection * vec4(p, 1.0);
  vec3 localNormal = vec3(0.0, 1.0, 0.0);
#ifdef SHADO_HAS_NORMAL
  localNormal = normal;
#endif
  vec3 worldNormal = localNormal +
    2.0 * cross(qv, cross(qv, localNormal) + inst.rotation.w * localNormal);
  float lambert = max(dot(normalize(worldNormal), uShadoLightDirection), 0.0);
  vShadoLighting = inst.padding1 > 0.5
    ? uShadoAmbientColor + uShadoLightColor * lambert
    : vec3(1.0);
  ${hooks.vertexAfterPosition ?? ''}
  vColor = shadoColor;
}
`;
      return { vs, fs };
    }

    const vs = `
// Vertex shader — Dual Quaternion VAT with optional per-bone uniform scale
// Uses 2 texels per bone when uDQHasScale == false (r,d)
// Uses 3 texels per bone when uDQHasScale == true  (r,d,scale)

precision highp float;
precision highp int;

attribute vec3 position;
#ifdef SHADO_HAS_NORMAL
attribute vec3 normal;
#endif
attribute vec2 uv;

attribute vec4 matricesIndices;
attribute vec4 matricesWeights;
attribute vec4 aMeta;
attribute vec4  aRect;

#ifdef BONES8
attribute vec4 matricesIndicesExtra;
attribute vec4 matricesWeightsExtra;
#endif

uniform mat4 worldViewProjection;
uniform vec3 uShadoLightDirection;
uniform vec3 uShadoLightColor;
uniform vec3 uShadoAmbientColor;
uniform float bakedVertexAnimationTime;

uniform sampler2D uDQAtlas;
uniform int  uDQWidth;          // bones per row (NOT texels)
uniform int  uDQTilesX;         // rows per frame (ceil(bones / uDQWidth))
uniform int  uDQStrideTexels;   // 2 (no scale) or 3 (has scale)
uniform bool uDQHasScale;       // true when scale texel is present

// Instance data & storage indirection
#include<${ShadoInstanceContainer._instanceName}>
#include<${ShadoInstanceContainer._instanceName}Offsets>
#include<${includeName}Storage>

uniform highp sampler2D uShadoVisibleIndices;
uniform int uShadoVisibleIndexTexWidth;

int Shado_visibleActorIndex(int drawIndex) {
  int texelIndex = drawIndex / 4;
  vec4 packed = texelFetch(
    uShadoVisibleIndices,
    ivec2(texelIndex % uShadoVisibleIndexTexWidth, texelIndex / uShadoVisibleIndexTexWidth),
    0
  );
  int lane = drawIndex - texelIndex * 4;
  float value = lane == 0 ? packed.x : lane == 1 ? packed.y : lane == 2 ? packed.z : packed.w;
  return int(value + 0.5);
}

varying vec2 vUV;
varying vec4 vColor;
varying vec3 vShadoLighting;
flat varying int   vPage;
flat varying vec4  vRect;

${hooks.vertexDeclarations ?? ''}


// ---------------------------------------------------------------------------

vec4 fetchDQAtlas(ivec2 p) { return texelFetch(uDQAtlas, p, 0); }

ivec4 decodeIndices4(vec4 f) { return ivec4(floor(f + 0.5)); }

int clampBoneIndex(int idx) {
  // Capacity padded to uDQTilesX * uDQWidth bones
  int maxIdx = uDQTilesX * uDQWidth - 1;
  return clamp(idx, 0, maxIdx);
}

void dqHemisphereAlign(inout vec4 r, inout vec4 d, vec4 refR) {
  if (dot(r, refR) < 0.0) { r = -r; d = -d; }
}

void dqNormalizeConsistent(inout vec4 r, inout vec4 d) {
  float n2 = max(dot(r, r), 1e-20);
  float invn = inversesqrt(n2);
  r *= invn;
  d *= invn;
  // enforce unit dual quaternion property: qr · qd = 0
  d -= r * dot(r, d);
}

vec3 dqTransformPoint(vec4 qr, vec4 qd, vec3 p) {
  // Standard DQ transform matching dqMath.glsl.fx
  vec3 qv = qr.xyz;
  float qw = qr.w;
  
  // Translation: t = 2 * (qd.xyz * qr.w - qr.xyz * qd.w + cross(qr.xyz, qd.xyz))
  vec3 t = 2.0 * (qd.xyz * qw - qv * qd.w + cross(qv, qd.xyz));
  
  // Rotation: p' = p + 2w(q × p) + 2(q × (q × p))
  vec3 uv  = cross(qv, p);
  vec3 uuv = cross(qv, uv);
  vec3 pRot = p + (uv * (2.0 * qw) + uuv * 2.0);
  
  return pRot + t;
}

void fetchBoneDQScale(int boneIdx, int frameRow, out vec4 qr, out vec4 qd, out float s) {
  int stride = uDQStrideTexels;
  int x     = boneIdx % uDQWidth;
  int tile  = boneIdx / uDQWidth;
  int y     = frameRow * uDQTilesX + tile;
  int baseX = x * stride;

  qr = fetchDQAtlas(ivec2(baseX + 0, y));
  qd = fetchDQAtlas(ivec2(baseX + 1, y));
  
  if (uDQHasScale && stride >= 3) {
    vec4 sc = fetchDQAtlas(ivec2(baseX + 2, y));
    s = sc.x;
  } else {
    s = 1.0;
  }
}

void accumDQAligned(inout vec4 rSum, inout vec4 dSum, vec4 addR, vec4 addD, float w) {
  if (w <= 0.0) return;
  if (rSum.x!=0.0 || rSum.y!=0.0 || rSum.z!=0.0 || rSum.w!=0.0) {
    dqHemisphereAlign(addR, addD, rSum);
  }
  rSum += addR * w;
  dSum += addD * w;
}

// ---------------------------------------------------------------------------

void main(void) {
  vUV = uv;
  vPage = int(aMeta.x);
  vRect = aRect;
  // Instance indirection (draw order compaction)
  int drawIdx   = gl_InstanceID;
  int srcIdx    = Shado_visibleActorIndex(drawIdx);

  ${ShadoInstanceContainer._instanceName}Header inst = ShadoInstanceContainer_instances_get(srcIdx);
  vec4 T = inst.translation; // xyz + instance scale in w
  vec4 C = inst.color;
  vec4 shadoColor = C;
  vec4 anim = inst.animationBuffer;
  ${hooks.vertexInstance ?? ''}

  // Resolve absolute frame row in the atlas (wrap within [startF, endF])
  float startF = anim.x, endF = max(anim.y, startF);
  float total  = (endF - startF) + 1.0;
  float tF     = bakedVertexAnimationTime * anim.w + anim.z;
  float fAbs   = startF + (tF - total * floor(tF / total));
  int   frame0 = int(floor(fAbs));
  int   frame1 = min(frame0 + 1, int(endF));
  float lerpT  = fract(fAbs);

  // Indices/weights
  ivec4 bi0 = decodeIndices4(matricesIndices);
  vec4  bw0 = matricesWeights;
  #ifdef BONES8
    ivec4 bi1 = decodeIndices4(matricesIndicesExtra);
    vec4  bw1 = matricesWeightsExtra;
  #endif

  // Clamp indices to atlas capacity (defensive)
  bi0.x = clampBoneIndex(bi0.x);
  bi0.y = clampBoneIndex(bi0.y);
  bi0.z = clampBoneIndex(bi0.z);
  bi0.w = clampBoneIndex(bi0.w);
  #ifdef BONES8
    bi1.x = clampBoneIndex(bi1.x);
    bi1.y = clampBoneIndex(bi1.y);
    bi1.z = clampBoneIndex(bi1.z);
    bi1.w = clampBoneIndex(bi1.w);
  #endif

  // Many exporters leave garbage in unused lanes; renormalize
  #ifndef SHADO_VAT_DOMINANT_BONE
  float wsum = bw0.x + bw0.y + bw0.z + bw0.w;
  #ifdef BONES8
    wsum += bw1.x + bw1.y + bw1.z + bw1.w;
  #endif
  if (wsum < 1e-8) wsum = 1.0;
  bw0 /= wsum;
  #ifdef BONES8
    bw1 /= wsum;
  #endif
  #endif

  vec4 r0 = vec4(0.0), d0 = vec4(0.0); float s0 = 0.0;
  #ifndef SHADO_VAT_SINGLE_FRAME
  vec4 r1 = vec4(0.0), d1 = vec4(0.0); float s1 = 0.0;
  #endif

  #ifdef SHADO_VAT_DOMINANT_BONE
  int dominantIndex = bi0.x;
  float dominantWeight = bw0.x;
  if (bw0.y > dominantWeight) { dominantIndex = bi0.y; dominantWeight = bw0.y; }
  if (bw0.z > dominantWeight) { dominantIndex = bi0.z; dominantWeight = bw0.z; }
  if (bw0.w > dominantWeight) { dominantIndex = bi0.w; dominantWeight = bw0.w; }
  #ifdef BONES8
    if (bw1.x > dominantWeight) { dominantIndex = bi1.x; dominantWeight = bw1.x; }
    if (bw1.y > dominantWeight) { dominantIndex = bi1.y; dominantWeight = bw1.y; }
    if (bw1.z > dominantWeight) { dominantIndex = bi1.z; dominantWeight = bw1.z; }
    if (bw1.w > dominantWeight) { dominantIndex = bi1.w; }
  #endif
  fetchBoneDQScale(dominantIndex, frame0, r0, d0, s0);
  #ifndef SHADO_VAT_SINGLE_FRAME
    fetchBoneDQScale(dominantIndex, frame1, r1, d1, s1);
  #endif
  #else
  for (int k=0;k<4;++k) {
    int idx = (k==0)?bi0.x:(k==1)?bi0.y:(k==2)?bi0.z:bi0.w;
    float w = (k==0)?bw0.x:(k==1)?bw0.y:(k==2)?bw0.z:bw0.w;
    if (w <= 0.0) continue;
    vec4 ar, ad; float as;
    fetchBoneDQScale(idx, frame0, ar, ad, as); accumDQAligned(r0,d0,ar,ad,w); s0 += as*w;
    #ifndef SHADO_VAT_SINGLE_FRAME
    fetchBoneDQScale(idx, frame1, ar, ad, as); accumDQAligned(r1,d1,ar,ad,w); s1 += as*w;
    #endif
  }

  #ifdef BONES8
  for (int k=0;k<4;++k) {
    int idx = (k==0)?bi1.x:(k==1)?bi1.y:(k==2)?bi1.z:bi1.w;
    float w = (k==0)?bw1.x:(k==1)?bw1.y:(k==2)?bw1.z:bw1.w;
    if (w <= 0.0) continue;
    vec4 ar, ad; float as;
    fetchBoneDQScale(idx, frame0, ar, ad, as); accumDQAligned(r0,d0,ar,ad,w); s0 += as*w;
    #ifndef SHADO_VAT_SINGLE_FRAME
    fetchBoneDQScale(idx, frame1, ar, ad, as); accumDQAligned(r1,d1,ar,ad,w); s1 += as*w;
    #endif
  }
  #endif
  #endif

  // Normalize per-frame blends and enforce qr * qd = 0
  dqNormalizeConsistent(r0, d0);
  #ifdef SHADO_VAT_SINGLE_FRAME
  vec4 r = r0, d = d0;
  float boneScale = s0;
  #else
  dqNormalizeConsistent(r1, d1);

  // Time hemisphere align, then mix and renormalize
  vec4 r1a = r1, d1a = d1;
  dqHemisphereAlign(r1a, d1a, r0);

  vec4 r = mix(r0, r1a, lerpT);
  vec4 d = mix(d0, d1a, lerpT);
  dqNormalizeConsistent(r, d);

  float boneScale = mix(s0, s1, lerpT);
  #endif
  if (!uDQHasScale) boneScale = 1.0;

  vec3 skinned = dqTransformPoint(r, d, position * boneScale);
  
  // Apply instance transform
  vec3 qv = inst.rotation.xyz;
  vec3 scaled = skinned * T.w;
  vec3 p = scaled + 2.0 * cross(qv, cross(qv, scaled) + inst.rotation.w * scaled) + T.xyz;
  gl_Position = worldViewProjection * vec4(p, 1.0);
  vec3 localNormal = vec3(0.0, 1.0, 0.0);
  #ifdef SHADO_HAS_NORMAL
    localNormal = normal;
  #endif
  vec3 skinnedNormal = localNormal +
    2.0 * cross(r.xyz, cross(r.xyz, localNormal) + r.w * localNormal);
  vec3 worldNormal = skinnedNormal +
    2.0 * cross(qv, cross(qv, skinnedNormal) + inst.rotation.w * skinnedNormal);
  float lambert = max(dot(normalize(worldNormal), uShadoLightDirection), 0.0);
  vShadoLighting = inst.padding1 > 0.5
    ? uShadoAmbientColor + uShadoLightColor * lambert
    : vec3(1.0);
  ${hooks.vertexAfterPosition ?? ''}
  vColor = shadoColor;
}


`;

    return { vs, fs };
  }

  public override generateWGSLPair(): { vs: string; fs: string } {
    const includeName = (this as any)._includeName ?? 'ShadoInstanceContainer';
    const actorName = ShadoInstanceContainer._instanceName;
    const hooks = this.getWGSLHooks();

    const declarations = `
attribute position: vec3f;
#ifdef SHADO_HAS_NORMAL
attribute normal: vec3f;
#endif
attribute uv: vec2f;
attribute aMeta: vec4f;
attribute aRect: vec4f;

uniform worldViewProjection: mat4x4f;
uniform uShadoLightDirection: vec3f;
uniform uShadoLightColor: vec3f;
uniform uShadoAmbientColor: vec3f;

#include<${actorName}>
#include<${includeName}Storage>

var<storage, read> uShadoVisibleIndices: array<u32>;

varying vUV: vec2f;
varying vColor: vec4f;
varying vShadoLighting: vec3f;
flat varying vPage: i32;
flat varying vRect: vec4f;

${hooks.vertexDeclarations ?? ''}

fn Shado_visibleActorIndex(drawIndex: i32) -> i32 {
  return i32(uShadoVisibleIndices[drawIndex]);
}

fn Shado_rotatePoint(q: vec4f, point: vec3f) -> vec3f {
  return point + 2.0 * cross(q.xyz, cross(q.xyz, point) + q.w * point);
}
`;

    const fs = `
varying vUV: vec2f;
varying vColor: vec4f;
varying vShadoLighting: vec3f;
flat varying vPage: i32;
flat varying vRect: vec4f;

var uAtlasArraySampler: sampler;
var uAtlasArray: texture_2d_array<f32>;

${hooks.fragmentDeclarations ?? ''}

fn Shado_sampleAtlas(uv: vec2f, rect: vec4f, page: i32) -> vec4f {
  let tiled = fract(uv);
  let uvA = tiled * (rect.zw - rect.xy) + rect.xy;
  return textureSampleLevel(uAtlasArray, uAtlasArraySampler, uvA, page, 0.0);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let hasAtlasRect = step(
    0.00000001,
    min(fragmentInputs.vRect.z - fragmentInputs.vRect.x, fragmentInputs.vRect.w - fragmentInputs.vRect.y)
  );
  let atlasSample = Shado_sampleAtlas(
    fragmentInputs.vUV,
    fragmentInputs.vRect,
    fragmentInputs.vPage
  );
  let atlasColor = mix(vec4f(1.0), atlasSample, hasAtlasRect);
  var surface = atlasColor * fragmentInputs.vColor;
  ${hooks.fragmentSurface ?? ''}
  surface.rgb = surface.rgb * fragmentInputs.vShadoLighting;
  fragmentOutputs.color = surface;
}
`;

    if (!this._useVatMaterial) {
      const vs = `
${declarations}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vPage = i32(vertexInputs.aMeta.x);
  vertexOutputs.vRect = vertexInputs.aRect;

  let drawIndex = i32(vertexInputs.instanceIndex);
  let sourceIndex = Shado_visibleActorIndex(drawIndex);
  let inst = ${includeName}_instances_get(sourceIndex);
  let translation = inst.translation;
  var shadoColor = inst.color;
  ${hooks.vertexInstance ?? ''}

  let scaled = vertexInputs.position * translation.w;
  let worldPosition = Shado_rotatePoint(inst.rotation, scaled) + translation.xyz;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(worldPosition, 1.0);
  var localNormal = vec3f(0.0, 1.0, 0.0);
#ifdef SHADO_HAS_NORMAL
  localNormal = vertexInputs.normal;
#endif
  let worldNormal = Shado_rotatePoint(inst.rotation, localNormal);
  let lambert = max(dot(normalize(worldNormal), uniforms.uShadoLightDirection), 0.0);
  vertexOutputs.vShadoLighting = select(
    vec3f(1.0),
    uniforms.uShadoAmbientColor + uniforms.uShadoLightColor * lambert,
    inst.padding1 > 0.5
  );
  ${hooks.vertexAfterPosition ?? ''}
  vertexOutputs.vColor = shadoColor;
}
`;
      return { vs, fs };
    }

    const vs = `
${declarations}

attribute matricesIndices: vec4f;
attribute matricesWeights: vec4f;
#ifdef BONES8
attribute matricesIndicesExtra: vec4f;
attribute matricesWeightsExtra: vec4f;
#endif

uniform bakedVertexAnimationTime: f32;
uniform uDQWidth: i32;
uniform uDQTilesX: i32;
uniform uDQStrideTexels: i32;
uniform uDQHasScale: i32;

var uDQAtlas: texture_2d<f32>;

struct ShadoDQScale {
  real: vec4f,
  dual: vec4f,
  scale: f32,
};

fn Shado_fetchBoneDQScale(boneIndex: i32, frameRow: i32) -> ShadoDQScale {
  let x = boneIndex % uniforms.uDQWidth;
  let tile = boneIndex / uniforms.uDQWidth;
  let y = frameRow * uniforms.uDQTilesX + tile;
  let baseX = x * uniforms.uDQStrideTexels;
  let real = textureLoad(uDQAtlas, vec2i(baseX, y), 0);
  let dual = textureLoad(uDQAtlas, vec2i(baseX + 1, y), 0);
  var scale = 1.0;
  if (uniforms.uDQHasScale != 0 && uniforms.uDQStrideTexels >= 3) {
    scale = textureLoad(uDQAtlas, vec2i(baseX + 2, y), 0).x;
  }
  return ShadoDQScale(real, dual, scale);
}

fn Shado_accumulateDQ(
  sum: ShadoDQScale,
  value: ShadoDQScale,
  weight: f32
) -> ShadoDQScale {
  if (weight <= 0.0) {
    return sum;
  }
  var real = value.real;
  var dual = value.dual;
  if (any(sum.real != vec4f(0.0)) && dot(real, sum.real) < 0.0) {
    real = -real;
    dual = -dual;
  }
  return ShadoDQScale(
    sum.real + real * weight,
    sum.dual + dual * weight,
    sum.scale + value.scale * weight
  );
}

fn Shado_normalizeDQ(value: ShadoDQScale) -> ShadoDQScale {
  let inverseLength = inverseSqrt(max(dot(value.real, value.real), 1e-20));
  let real = value.real * inverseLength;
  var dual = value.dual * inverseLength;
  dual = dual - real * dot(real, dual);
  return ShadoDQScale(real, dual, value.scale);
}

fn Shado_alignDQ(value: ShadoDQScale, reference: vec4f) -> ShadoDQScale {
  if (dot(value.real, reference) < 0.0) {
    return ShadoDQScale(-value.real, -value.dual, value.scale);
  }
  return value;
}

fn Shado_transformDQ(real: vec4f, dual: vec4f, point: vec3f) -> vec3f {
  let translation = 2.0 * (
    dual.xyz * real.w -
    real.xyz * dual.w +
    cross(real.xyz, dual.xyz)
  );
  return Shado_rotatePoint(real, point) + translation;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vPage = i32(vertexInputs.aMeta.x);
  vertexOutputs.vRect = vertexInputs.aRect;

  let drawIndex = i32(vertexInputs.instanceIndex);
  let sourceIndex = Shado_visibleActorIndex(drawIndex);
  let inst = ${includeName}_instances_get(sourceIndex);
  let translation = inst.translation;
  var shadoColor = inst.color;
  let animation = inst.animationBuffer;
  ${hooks.vertexInstance ?? ''}

  let startFrame = animation.x;
  let endFrame = max(animation.y, startFrame);
  let frameCount = endFrame - startFrame + 1.0;
  let animationFrame =
    uniforms.bakedVertexAnimationTime * animation.w + animation.z;
  let absoluteFrame =
    startFrame + (animationFrame - frameCount * floor(animationFrame / frameCount));
  let frame0 = i32(floor(absoluteFrame));
  let frame1 = min(frame0 + 1, i32(endFrame));
  let frameLerp = fract(absoluteFrame);

  let maxBoneIndex = uniforms.uDQTilesX * uniforms.uDQWidth - 1;
  let boneIndices0 = clamp(
    vec4i(floor(vertexInputs.matricesIndices + vec4f(0.5))),
    vec4i(0),
    vec4i(maxBoneIndex)
  );
  var boneWeights0 = vertexInputs.matricesWeights;
#ifdef BONES8
  let boneIndices1 = clamp(
    vec4i(floor(vertexInputs.matricesIndicesExtra + vec4f(0.5))),
    vec4i(0),
    vec4i(maxBoneIndex)
  );
  var boneWeights1 = vertexInputs.matricesWeightsExtra;
#endif

  #ifndef SHADO_VAT_DOMINANT_BONE
  var weightSum =
    boneWeights0.x + boneWeights0.y + boneWeights0.z + boneWeights0.w;
#ifdef BONES8
  weightSum = weightSum +
    boneWeights1.x + boneWeights1.y + boneWeights1.z + boneWeights1.w;
#endif
  weightSum = max(weightSum, 1e-8);
  boneWeights0 = boneWeights0 / weightSum;
#ifdef BONES8
  boneWeights1 = boneWeights1 / weightSum;
#endif
  #endif

  var dq0 = ShadoDQScale(vec4f(0.0), vec4f(0.0), 0.0);
  #ifndef SHADO_VAT_SINGLE_FRAME
  var dq1 = ShadoDQScale(vec4f(0.0), vec4f(0.0), 0.0);
  #endif
  #ifdef SHADO_VAT_DOMINANT_BONE
  var dominantBoneIndex = boneIndices0.x;
  var dominantBoneWeight = boneWeights0.x;
  if (boneWeights0.y > dominantBoneWeight) {
    dominantBoneIndex = boneIndices0.y;
    dominantBoneWeight = boneWeights0.y;
  }
  if (boneWeights0.z > dominantBoneWeight) {
    dominantBoneIndex = boneIndices0.z;
    dominantBoneWeight = boneWeights0.z;
  }
  if (boneWeights0.w > dominantBoneWeight) {
    dominantBoneIndex = boneIndices0.w;
    dominantBoneWeight = boneWeights0.w;
  }
  #ifdef BONES8
  if (boneWeights1.x > dominantBoneWeight) {
    dominantBoneIndex = boneIndices1.x;
    dominantBoneWeight = boneWeights1.x;
  }
  if (boneWeights1.y > dominantBoneWeight) {
    dominantBoneIndex = boneIndices1.y;
    dominantBoneWeight = boneWeights1.y;
  }
  if (boneWeights1.z > dominantBoneWeight) {
    dominantBoneIndex = boneIndices1.z;
    dominantBoneWeight = boneWeights1.z;
  }
  if (boneWeights1.w > dominantBoneWeight) {
    dominantBoneIndex = boneIndices1.w;
  }
  #endif
  dq0 = Shado_fetchBoneDQScale(dominantBoneIndex, frame0);
  #ifndef SHADO_VAT_SINGLE_FRAME
  dq1 = Shado_fetchBoneDQScale(dominantBoneIndex, frame1);
  #endif
  #else
  for (var lane = 0; lane < 4; lane = lane + 1) {
    let weight = boneWeights0[lane];
    if (weight > 0.0) {
      let boneIndex = boneIndices0[lane];
      dq0 = Shado_accumulateDQ(
        dq0,
        Shado_fetchBoneDQScale(boneIndex, frame0),
        weight
      );
      #ifndef SHADO_VAT_SINGLE_FRAME
      dq1 = Shado_accumulateDQ(
        dq1,
        Shado_fetchBoneDQScale(boneIndex, frame1),
        weight
      );
      #endif
    }
  }
#ifdef BONES8
  for (var lane = 0; lane < 4; lane = lane + 1) {
    let weight = boneWeights1[lane];
    if (weight > 0.0) {
      let boneIndex = boneIndices1[lane];
      dq0 = Shado_accumulateDQ(
        dq0,
        Shado_fetchBoneDQScale(boneIndex, frame0),
        weight
      );
      #ifndef SHADO_VAT_SINGLE_FRAME
      dq1 = Shado_accumulateDQ(
        dq1,
        Shado_fetchBoneDQScale(boneIndex, frame1),
        weight
      );
      #endif
    }
  }
#endif
  #endif

  dq0 = Shado_normalizeDQ(dq0);
  #ifdef SHADO_VAT_SINGLE_FRAME
  var blendedDQ = dq0;
  #else
  dq1 = Shado_alignDQ(Shado_normalizeDQ(dq1), dq0.real);
  var blendedDQ = ShadoDQScale(
    mix(dq0.real, dq1.real, frameLerp),
    mix(dq0.dual, dq1.dual, frameLerp),
    mix(dq0.scale, dq1.scale, frameLerp)
  );
  blendedDQ = Shado_normalizeDQ(blendedDQ);
  #endif

  var boneScale = blendedDQ.scale;
  if (uniforms.uDQHasScale == 0) {
    boneScale = 1.0;
  }
  let skinned = Shado_transformDQ(
    blendedDQ.real,
    blendedDQ.dual,
    vertexInputs.position * boneScale
  );
  let scaled = skinned * translation.w;
  let worldPosition = Shado_rotatePoint(inst.rotation, scaled) + translation.xyz;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(worldPosition, 1.0);
  var localNormal = vec3f(0.0, 1.0, 0.0);
#ifdef SHADO_HAS_NORMAL
  localNormal = vertexInputs.normal;
#endif
  let skinnedNormal = Shado_rotatePoint(blendedDQ.real, localNormal);
  let worldNormal = Shado_rotatePoint(inst.rotation, skinnedNormal);
  let lambert = max(dot(normalize(worldNormal), uniforms.uShadoLightDirection), 0.0);
  vertexOutputs.vShadoLighting = select(
    vec3f(1.0),
    uniforms.uShadoAmbientColor + uniforms.uShadoLightColor * lambert,
    inst.padding1 > 0.5
  );
  ${hooks.vertexAfterPosition ?? ''}
  vertexOutputs.vColor = shadoColor;
}
`;

    return { vs, fs };
  }

  public shuffleInstances(animationRanges: any[], rerollNames = false) {
    for (let i = 0; i < this._children.length; i++) {
      const ch = this._children[i];
      // Motion changes must not reset transforms, appearance, nameplate lift,
      // or the name index. initialize() is only valid for newly allocated
      // actors; calling it here erased the visible nameplate configuration.
      if (rerollNames) {
        ch.nameIndex = this._nameplates
          ? Math.floor(this._nameplates.nameCount() * Math.random())
          : -1;
      }
      ch.playRandomAnimation(animationRanges);
      ch.emitHeaderDirty();
    }
    if (rerollNames) this._nameplates?.rebuildStreams(this._children);
  }
}
