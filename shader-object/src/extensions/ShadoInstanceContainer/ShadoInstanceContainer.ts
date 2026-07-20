import { BABYLON } from '../../babylon';
import { ASCExtension, Shado } from '../../core/Shado';
import { gpuStruct, field } from '../../decorators';
import { ShadoMaterial } from '../../materials/ShadoMaterial';
import type { ShadoInstanceAsyncPickingOptions } from '../../render/ShadoAsyncPicking';
import { ShadoActor } from '../ShadoActor';
import { NameplateData } from '../NameplateData';
import type {
  Camera,
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

export type ShadoInstanceContainerOptions = {
  vat?: 'auto' | 'bake' | 'none';
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

export type InstanceNameSource = readonly string[] | ((index: number) => string);

type ChildFieldRegistration<T extends ShadoActor> = {
  child: T;
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
  private _useVatMaterial = true;
  public vat: VATBuilder | undefined;
  public get children() {
    return this._children;
  }
  public get instanceCount() {
    return this._children.length;
  }
  public override getVisibleCount(): number {
    return this.visibleCount;
  }

  public set nameplates(nameplates: NameplateData | undefined) {
    this._nameplates = nameplates;
  }
  private _nameplates?: NameplateData;

  public static override async initialize(engine: any, config: InitializeConfig = {}) {
    const childCtor = ((config.extra as any) ?? ShadoActor) as any;
    if (!config.additionalFields?.some(f => f.name === 'instances')) {
      config.additionalFields = [
        { name: 'instances', type: { arrayOf: { structOf: childCtor } } },
      ];
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
  }

  public override dispose() {
    for (const binding of this._bindings.values()) {
      for (const texture of binding.generatedTextures ?? []) texture.dispose();
    }
    super.dispose();
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
    const useVat = opts.vat !== 'none';
    const generatedColorTextures = installSolidColorTextures(scene, meshes);
    const { sources, byId: byId } = collectSourcesFromMeshes(meshes);
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
    const mergePaletteBasis = opts.merge && useVat && paletteSource
      ? paletteSource.computeWorldMatrix(true).clone()
      : undefined;
    const vatOptions = mergePaletteBasis && !opts.vatOptions?.paletteBasis
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
export function frustumMarkAoS(
  base: usize,
  planesPtr: usize,
  baseRadius: f32,
  camX: f32,
  camY: f32,
  camZ: f32,
  maxDist: f32
): void {
  const h = changetype<ShadoInstanceContainerHeader>(base);
  const count = <i32>h.instancesCount;
  if (count <= 0) { h.visibleCount = 0; return; }

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
  let writeHead = h.instancesPtr + <usize>OFFSET_${ShadoInstanceContainer._instanceName}_visibleIndex;

  let visCount = 0;
  const doRange = maxDist > 0.0;

  // Hard bound to prevent OOB if stride constant is off
  const maxWrite = h.instancesPtr + <usize>SIZEOF_${ShadoInstanceContainer._instanceName}Header * <usize>count;

  for (let i = 0; i < count; i++) {
    store<i32>(readPtr + <usize>OFFSET_${ShadoInstanceContainer._instanceName}_visibleIndex, -1);
    store<i32>(readPtr + <usize>OFFSET_${ShadoInstanceContainer._instanceName}_visibleFlag, 0);

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
      if (writeHead >= maxWrite) break; // hard stop on mismatch
      store<i32>(writeHead, i);
      writeHead += <usize>SIZEOF_${ShadoInstanceContainer._instanceName}Header;
      visCount++;
      store<i32>(readPtr + <usize>OFFSET_${ShadoInstanceContainer._instanceName}_visibleFlag, 1);
    }

    readPtr += <usize>SIZEOF_${ShadoInstanceContainer._instanceName}Header;
  }

  h.visibleCount = visCount;
}



`,
  };

  // Call this each frame *only if* the frustum changed (or just call it; it's cheap).
  public updateFrustumFromCamera(camera: Camera) {
    const planes: Plane[] =
      (this as any)._bjsFrustumPlanes ??
      ((this as any)._bjsFrustumPlanes = new Array<Plane | number>(6)
        .fill(0)
        .map(() => new BABYLON.Plane(0, 0, 0, 0)));

    const vp = camera.getScene().getTransformMatrix();
    BABYLON.Frustum.GetPlanesToRef(vp, planes);

    const out = new Float32Array(6 * 4);
    let o = 0;
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      out[o++] = p.normal.x;
      out[o++] = p.normal.y;
      out[o++] = p.normal.z;
      out[o++] = p.d;
    }

    this.setVarArray('cameraFrustum', out);
  }

  public frustumCull(camera: Camera, baseRadius: number, maxDistance = 0) {
    if (!camera) {
      return;
    }
    this._refreshViewsIfGrown();
    this.updateFrustumFromCamera(camera);

    const frustumMarkAoS = this.ops?.frustumMarkAoS;
    if (!frustumMarkAoS) {
      this.frustumCullCPU(camera, baseRadius, maxDistance);
      return;
    }

    const camPos = camera.globalPosition ?? camera.position;
    const planesPtr = this.getVarArrayPtr('cameraFrustum'); // start of the vec4[6] array

    frustumMarkAoS(
      planesPtr,
      baseRadius,
      camPos.x,
      camPos.y,
      camPos.z,
      maxDistance // 0 is sentinel to disable range check
    );
    this._arena.markDirty?.();
  }

  public frustumCullCPU(camera: Camera, baseRadius: number, maxDistance = 0) {
    const planes: Plane[] =
      (this as any)._bjsFrustumPlanes ??
      ((this as any)._bjsFrustumPlanes = new Array<Plane | number>(6)
        .fill(0)
        .map(() => new BABYLON.Plane(0, 0, 0, 0)));
    const camPos = camera.globalPosition ?? camera.position;
    const doRange = maxDistance > 0;
    let visibleCount = 0;

    for (let i = 0; i < this._children.length; i++) {
      const child: any = this._children[i];
      child.visibleIndex = -1;
      child.visibleFlag = 0;

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
      const writeTarget: any = this._children[visibleCount];
      if (writeTarget) writeTarget.visibleIndex = i;
      child.visibleFlag = 1;
      visibleCount++;
    }

    this.visibleCount = visibleCount;
    this._arena.markDirty?.();
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

  public addInstance(suppressRebuild?: boolean, name?: string): T {
    const ch = this.addStructToArray<T>('instances');

    ch.initialize();

    // name index
    ch.nameIndex = this._nameplates
      ? name
        ? this._nameplates.addName(name)
        : Math.floor(this._nameplates.nameCount() * Math.random())
      : -1;

    ch.playRandomAnimation(this.vat?.clips ?? []);

    this._children.push(ch);
    if (!suppressRebuild) this._nameplates?.rebuildStreams(this._children);
    return ch;
  }

  public addInstances(n: number, names?: InstanceNameSource) {
    const created: T[] = [];
    for (let i = 0; i < n; i++) {
      const name = typeof names === 'function' ? names(i) : names?.[i];
      created.push(this.addInstance(true, name));
    }
    this._nameplates?.rebuildStreams(this._children);
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
    const index =
      typeof instance === 'number' ? instance | 0 : this._children.indexOf(instance);
    if (index < 0 || index >= this._children.length) return undefined;

    const lastIndex = this._children.length - 1;
    const removed = this._children[index];
    if (index !== lastIndex) this._children[index] = this._children[lastIndex];
    this._children.pop();
    this.removeStructFromArray('instances', index, 'swap');
    this.visibleCount = Math.min(this.visibleCount, this._children.length);
    this._nameplates?.rebuildStreams(this._children);
    return removed;
  }

  public override generateGLSLPair(): { vs: string; fs: string } {
    // Get the instance-specific include name
    const includeName = (this as any)._includeName ?? 'ShadoInstanceContainer';

    const fs = `
precision highp float;
precision highp int;

varying vec2 vUV;
varying vec4 vColor;
flat varying int   vPage;
flat varying vec4  vRect;

uniform highp sampler2DArray uAtlasArray;

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
  gl_FragColor = c * vColor;
}
`;

    if (!this._useVatMaterial) {
      const vs = `
precision highp float;
precision highp int;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 aMeta;
attribute vec4  aRect;

uniform mat4 worldViewProjection;

#include<${ShadoInstanceContainer._instanceName}>
#include<${ShadoInstanceContainer._instanceName}Offsets>
#include<${includeName}Storage>

varying vec2 vUV;
varying vec4 vColor;
flat varying int   vPage;
flat varying vec4  vRect;

void main(void) {
  vUV = uv;
  vPage = int(aMeta.x);
  vRect = aRect;

  int drawIdx = gl_InstanceID;
  int packedBase = uShadoInstanceContainer_instancesBase + drawIdx * uShadoInstanceContainer_instancesStride;
  int srcIdx = int(ShadoInstanceContainer_fetch(packedBase + ${ShadoInstanceContainer._instanceName}_visibleIndex_OFF));
  if (srcIdx < 0) { gl_Position = vec4(2.0); return; }

  ${ShadoInstanceContainer._instanceName}Header inst = ShadoInstanceContainer_instances_get(srcIdx);
  vec4 T = inst.translation;
  vec3 qv = inst.rotation.xyz;
  vec3 scaled = position * T.w;
  vec3 p = scaled + 2.0 * cross(qv, cross(qv, scaled) + inst.rotation.w * scaled) + T.xyz;
  gl_Position = worldViewProjection * vec4(p, 1.0);
  vColor = inst.color;
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

varying vec2 vUV;
varying vec4 vColor;
flat varying int   vPage;
flat varying vec4  vRect;


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
  int packedBase= uShadoInstanceContainer_instancesBase + drawIdx * uShadoInstanceContainer_instancesStride;
  int srcIdx    = int(ShadoInstanceContainer_fetch(packedBase + ${ShadoInstanceContainer._instanceName}_visibleIndex_OFF));
  if (srcIdx < 0) { gl_Position = vec4(2.0); return; }

  ${ShadoInstanceContainer._instanceName}Header inst = ShadoInstanceContainer_instances_get(srcIdx);
  vec4 T = inst.translation; // xyz + instance scale in w
  vec4 C = inst.color;
  vec4 anim = inst.animationBuffer;

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
  float wsum = bw0.x + bw0.y + bw0.z + bw0.w;
  #ifdef BONES8
    wsum += bw1.x + bw1.y + bw1.z + bw1.w;
  #endif
  if (wsum < 1e-8) wsum = 1.0;
  bw0 /= wsum;
  #ifdef BONES8
    bw1 /= wsum;
  #endif

  vec4 r0 = vec4(0.0), d0 = vec4(0.0); float s0 = 0.0;
  vec4 r1 = vec4(0.0), d1 = vec4(0.0); float s1 = 0.0;

  for (int k=0;k<4;++k) {
    int idx = (k==0)?bi0.x:(k==1)?bi0.y:(k==2)?bi0.z:bi0.w;
    float w = (k==0)?bw0.x:(k==1)?bw0.y:(k==2)?bw0.z:bw0.w;
    if (w <= 0.0) continue;
    vec4 ar, ad; float as;
    fetchBoneDQScale(idx, frame0, ar, ad, as); accumDQAligned(r0,d0,ar,ad,w); s0 += as*w;
    fetchBoneDQScale(idx, frame1, ar, ad, as); accumDQAligned(r1,d1,ar,ad,w); s1 += as*w;
  }

  #ifdef BONES8
  for (int k=0;k<4;++k) {
    int idx = (k==0)?bi1.x:(k==1)?bi1.y:(k==2)?bi1.z:bi1.w;
    float w = (k==0)?bw1.x:(k==1)?bw1.y:(k==2)?bw1.z:bw1.w;
    if (w <= 0.0) continue;
    vec4 ar, ad; float as;
    fetchBoneDQScale(idx, frame0, ar, ad, as); accumDQAligned(r0,d0,ar,ad,w); s0 += as*w;
    fetchBoneDQScale(idx, frame1, ar, ad, as); accumDQAligned(r1,d1,ar,ad,w); s1 += as*w;
  }
  #endif

  // Normalize per-frame blends and enforce qr * qd = 0
  dqNormalizeConsistent(r0, d0);
  dqNormalizeConsistent(r1, d1);

  // Time hemisphere align, then mix and renormalize
  vec4 r1a = r1, d1a = d1;
  dqHemisphereAlign(r1a, d1a, r0);

  vec4 r = mix(r0, r1a, lerpT);
  vec4 d = mix(d0, d1a, lerpT);
  dqNormalizeConsistent(r, d);

  float boneScale = mix(s0, s1, lerpT);
  if (!uDQHasScale) boneScale = 1.0;

  vec3 skinned = dqTransformPoint(r, d, position * boneScale);
  
  // Apply instance transform
  vec3 qv = inst.rotation.xyz;
  vec3 scaled = skinned * T.w;
  vec3 p = scaled + 2.0 * cross(qv, cross(qv, scaled) + inst.rotation.w * scaled) + T.xyz;
  gl_Position = worldViewProjection * vec4(p, 1.0);
  vColor = C;
}


`;

    return { vs, fs };
  }

  public override generateWGSLPair(): { vs: string; fs: string } {
    // Not implemented yet
    return { vs: 'moduleSource', fs: 'moduleSource' };
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
