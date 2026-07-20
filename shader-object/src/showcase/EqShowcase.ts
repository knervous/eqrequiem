import * as fantasyNames from 'fantasy-name-generator';

import { BABYLON as MODULE_BABYLON } from '../babylon';
import { NameplateData } from '../extensions/NameplateData';
import { fetchShadoBytes } from '../preprocess/runtime';
import { bakeVatWithHeadlessWorker } from '../extensions/VATBuilder/VATHeadlessBake';
import { EqShowcaseActor, EqShowcaseContainer } from './EqShowcaseActors';
import {
  BABYLON_SHOWCASE_MODELS,
  EQ_SHOWCASE_MODELS,
  SHOWCASE_WEAPONS,
  showcaseAnimationLabel,
} from './EqShowcaseCatalog';
import type {
  EqShowcaseController,
  EqShowcaseModel,
  EqShowcaseOptions,
  EqShowcaseSelection,
  EqShowcaseStats,
} from './EqShowcaseTypes';
import { SHOWCASE_CULLING_WASM_BASE64 } from './showcase-culling-wasm.generated';

export * from './EqShowcaseActors';
export * from './EqShowcaseCatalog';
export * from './EqShowcaseTypes';

type LoadedPool = {
  model: EqShowcaseModel;
  container: EqShowcaseContainer;
  nameplates?: NameplateData;
  nameplateLayer?: any;
  sources: any[];
  groundOffset: number;
  /** Monotonic display number; removals must not cause duplicate BJS names. */
  nextInstanceNumber: number;
};

type EqArmorAtlas = {
  texture: any;
  layers: readonly string[];
};

// A forum demo needs representative motion without baking every one of the 72
// legacy EQ emotes for every race. These codes come from Requiem's canonical
// AnimationDefinitions map: pose, two idles, walk, run, cheer, wave and attack.
const SHOWCASE_CLIPS = new Set([
  'pos', 'p01', 'o01',
  'l01', 'l02', 'l03', 'l04', 'l05', 'l06', 'l08', 'l09',
  'p02', 'p03', 'p04', 'p05', 'p06',
  'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c11',
  'd01', 'd02',
  's01', 's02', 's03', 's04', 's06', 's07', 's08', 's09', 's10', 's11',
  's12', 's13', 's14', 's15', 's16', 's17', 's18', 's19', 's20', 's21',
  's22', 's23', 's24', 's25', 's26', 's27', 's28',
]);

// Bake a broad library, but only choose standing/locomotion clips for ambient
// crowd playback. Death, falling, swimming, sitting, kneeling and combat clips
// are valid on demand; looping them at random made an otherwise healthy crowd
// look anatomically broken. NPC rigs get the smallest cross-race-safe subset.
const AMBIENT_PC_CLIPS = new Set([
  'p01', 'o01', 'l01', 'l02', 's01', 's03', 's06', 's09', 's21', 's23', 's25',
]);
const AMBIENT_NPC_CLIPS = new Set(['p01', 'o01', 'l01', 'l02']);

function normalizeRoot(root: string): string {
  return root.endsWith('/') ? root : `${root}/`;
}

function decodeBase64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob
    ? globalThis.atob(value)
    : (globalThis as any).Buffer.from(value, 'base64').toString('binary');
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function syncShaderStores(hostBabylon: any): void {
  if (hostBabylon === MODULE_BABYLON) return;
  const hostEffect = hostBabylon.Effect as Record<string, Record<string, string>>;
  const moduleEffect = MODULE_BABYLON.Effect as unknown as Record<string, Record<string, string>>;
  for (const key of ['ShadersStore', 'IncludesShadersStore']) {
    if (hostEffect?.[key] && moduleEffect?.[key]) Object.assign(hostEffect[key], moduleEffect[key]);
  }
  const hostStore = hostBabylon.ShaderStore as Record<string, Record<string, string>>;
  const moduleStore = (MODULE_BABYLON as any).ShaderStore as Record<string, Record<string, string>>;
  for (const key of ['ShadersStore', 'IncludesShadersStore', 'ShadersStoreWGSL', 'IncludesShadersStoreWGSL']) {
    if (hostStore?.[key] && moduleStore?.[key]) Object.assign(hostStore[key], moduleStore[key]);
  }
}

function nameFor(model: EqShowcaseModel, instanceNumber = 1): string {
  if (model.catalog === 'babylon') return `${model.label} ${instanceNumber}`;
  const value = fantasyNames.nameByRace(model.nameRace, {
    gender: model.gender,
    allowMultipleNames: true,
  });
  return typeof value === 'string' ? value : `${model.label} ${Math.floor(Math.random() * 9999)}`;
}

function setActorTransform(
  actor: any,
  model: EqShowcaseModel,
  index: number,
  total: number,
  groundOffset = 0
): void {
  const columns = Math.ceil(Math.sqrt(total * 1.6));
  const row = Math.floor(index / columns);
  const col = index % columns;
  const spacing = 5.5;
  const rows = Math.ceil(total / columns);
  const displayScale = model.scale * 1.28;
  actor.translation.set([
    (col - (columns - 1) / 2) * spacing,
    groundOffset * displayScale,
    (row - (rows - 1) / 2) * spacing,
    displayScale,
  ]);
  actor.rotation.set([0, 0, 0, 1]);
  const armorClass = Math.floor(Math.random() * 4);
  // Requiem resolves one material number across the whole equipped body. The
  // four showcase states deliberately start untinted so the original EQ art,
  // rather than a procedural approximation, defines the material.
  actor.color.set([1, 1, 1, 1]);
  actor.skinTint.set([1, 1, 1, 1]);
  actor.chestTint.set([1, 1, 1, 1]);
  actor.legTint.set([1, 1, 1, 1]);
  actor.trimTint.set([1, 1, 1, 1]);
  actor.armorClass = armorClass;
  actor.weaponClass = Math.random() < 0.18
    ? 0
    : 1 + Math.floor(Math.random() * SHOWCASE_WEAPONS.length);
  actor.__eqEquipment = (['armorless', 'leather', 'chain', 'plate'] as const)[armorClass];
  actor.nameLiftWorld = model.kind === 'npc' ? 2.5 : 3.4;
  actor.nameWorldPerEM = 0.42;
  actor.nameplateColor.set([1, 0.94, 0.7, 1]);
  actor.emitHeaderDirty();
}

function equipmentPartForMaterial(name: string): number {
  const lower = name.toLowerCase();
  if (/(?:ch|ua)\d/.test(lower)) return 1; // chest and upper arms
  if (/(?:lg)\d/.test(lower)) return 2; // leggings
  if (/(?:fa|hn|ft)\d/.test(lower) || /helm|chain|plate|leather/.test(lower)) return 3;
  return 0; // face/hair/skin and unknown NPC materials remain untinted
}

function materialForSubMesh(mesh: any, subMesh: any): any {
  const material = mesh.material;
  return material?.subMaterials
    ? material.subMaterials[subMesh.materialIndex] ?? null
    : material;
}

function stampEquipmentParts(meshes: any[]): void {
  for (const mesh of meshes) {
    const count = mesh.getTotalVertices?.() ?? 0;
    if (!count) continue;
    const data = new Float32Array(count);
    for (const subMesh of mesh.subMeshes ?? []) {
      const part = equipmentPartForMaterial(materialForSubMesh(mesh, subMesh)?.name ?? '');
      data.fill(part, subMesh.verticesStart, subMesh.verticesStart + subMesh.verticesCount);
    }
    mesh.setVerticesData('aPart', data, false, 1);
  }
}

function eqArmorLayerSet(materialName: string, atlas: readonly string[]): [number, number, number, number] {
  const match = materialName.toLowerCase().match(/^([a-z]{3})(ch|ua|fa|lg|hn|ft)(\d{2})(\d{2})$/);
  if (!match) return [-1, -1, -1, -1];
  const [, model, piece, , textureNumberText] = match;
  const layers = [0, 1, 2, 3].map(material => {
    let textureNumber = Number(textureNumberText);
    while (textureNumber >= 0) {
      const candidate = `${model}${piece}${String(material).padStart(2, '0')}${String(textureNumber).padStart(2, '0')}`;
      const index = atlas.indexOf(candidate);
      if (index >= 0) return index;
      textureNumber--;
    }
    return -1;
  });
  return layers as [number, number, number, number];
}

function stampEqArmorLayers(meshes: any[], atlas: readonly string[]): void {
  for (const mesh of meshes) {
    const count = mesh.getTotalVertices?.() ?? 0;
    if (!count) continue;
    const data = new Float32Array(count * 4);
    data.fill(-1);
    for (const subMesh of mesh.subMeshes ?? []) {
      const layers = eqArmorLayerSet(materialForSubMesh(mesh, subMesh)?.name ?? '', atlas);
      const end = subMesh.verticesStart + subMesh.verticesCount;
      for (let vertex = subMesh.verticesStart; vertex < end; vertex++) data.set(layers, vertex * 4);
    }
    mesh.setVerticesData('aEqLayers', data, false, 4);
  }
}

function meshMatchesModel(mesh: any, modelCode: string): boolean {
  if (String(mesh.name ?? '').toLowerCase().startsWith(modelCode)) return true;
  const materials = mesh.material?.subMaterials ?? [mesh.material];
  return materials.some((material: any) =>
    String(material?.name ?? '').toLowerCase().startsWith(modelCode)
  );
}

function stampWeaponVariant(meshes: any[], variant: number): void {
  for (const mesh of meshes) {
    const count = mesh.getTotalVertices?.() ?? 0;
    if (!count) continue;
    const data = new Float32Array(count);
    data.fill(variant);
    mesh.setVerticesData('aWeapon', data, false, 1);
  }
}

function normalizeWeaponMeshes(meshes: any[], targetLength = 1.6): void {
  let extent = 0;
  for (const mesh of meshes) {
    const positions = mesh.getVerticesData?.('position') as ArrayLike<number> | null;
    if (!positions?.length) continue;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index], y = positions[index + 1], z = positions[index + 2];
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    }
    extent = Math.max(extent, maxX - minX, maxY - minY, maxZ - minZ);
  }
  if (!Number.isFinite(extent) || extent <= targetLength) return;
  const scale = targetLength / extent;
  for (const mesh of meshes) {
    const source = mesh.getVerticesData?.('position') as ArrayLike<number> | null;
    if (!source?.length) continue;
    const positions = Float32Array.from(source, value => value * scale);
    mesh.setVerticesData('position', positions, false, 3);
    mesh.refreshBoundingInfo?.();
  }
}

function orientWeaponMeshes(B: any, meshes: any[]): void {
  // Decoded EQ item geometry is authored handle-first in the opposite local
  // up direction from the r_point attachment bone. A proper 180° local-space
  // rotation (rather than a reflected axis) keeps winding and normals intact.
  const correction = B.Matrix.RotationZ(Math.PI);
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices?.()) continue;
    mesh.bakeTransformIntoVertices(correction);
    mesh.refreshBoundingInfo?.();
  }
}

function bindWeaponMeshesToSkeleton(B: any, meshes: any[], skeleton: any): boolean {
  const hand = skeleton.bones.find((bone: any) => bone.name.toLowerCase() === 'r_point')
    ?? skeleton.bones.find((bone: any) => /right.*hand|r[_-]?hand/i.test(bone.name));
  // Quadrupeds and other non-humanoid NPCs intentionally remain unarmed.
  if (!hand) return false;
  const boneIndex = hand._index ?? skeleton.bones.indexOf(hand);
  for (const mesh of meshes) {
    const count = mesh.getTotalVertices?.() ?? 0;
    if (!count) continue;
    const indices = new Float32Array(count * 4);
    const weights = new Float32Array(count * 4);
    for (let index = 0; index < count; index++) {
      indices[index * 4] = boneIndex;
      weights[index * 4] = 1;
    }
    mesh.setVerticesData(B.VertexBuffer.MatricesIndicesKind, indices, false, 4);
    mesh.setVerticesData(B.VertexBuffer.MatricesWeightsKind, weights, false, 4);
    mesh.numBoneInfluencers = 4;
    mesh.skeleton = skeleton;
  }
  return true;
}

function bindHeadMeshesToSkeleton(B: any, meshes: any[], targetSkeleton: any): void {
  const targetByName = new Map(targetSkeleton.bones.map((bone: any, index: number) => [
    bone.name,
    bone._index ?? index,
  ]));
  for (const mesh of meshes) {
    const sourceSkeleton = mesh.skeleton;
    if (!sourceSkeleton) continue;
    const remap: number[] = [];
    for (let index = 0; index < sourceSkeleton.bones.length; index++) {
      const sourceBone = sourceSkeleton.bones[index];
      let candidate: any = sourceBone;
      let target: number | undefined;
      while (candidate && target === undefined) {
        target = targetByName.get(candidate.name) as number | undefined;
        candidate = candidate.getParent?.();
      }
      remap[sourceBone._index ?? index] = target ?? 0;
    }
    for (const kind of [
      B.VertexBuffer.MatricesIndicesKind,
      B.VertexBuffer.MatricesIndicesExtraKind,
    ]) {
      const source = mesh.getVerticesData(kind);
      if (!source) continue;
      const mapped = Float32Array.from(source as ArrayLike<number>, value => remap[Math.round(value)] ?? 0);
      mesh.setVerticesData(kind, mapped, false, 4);
    }
    mesh.skeleton = targetSkeleton;
  }
}

function setRandomAnimation(
  container: EqShowcaseContainer,
  actor: EqShowcaseActor,
  model: EqShowcaseModel,
): void {
  const frameLimit = container.vat?.framesTotal ?? 0;
  const ambient = model.ambientClips?.length
    ? new Set(model.ambientClips.map(name => name.toLowerCase()))
    : model.kind === 'pc' ? AMBIENT_PC_CLIPS : AMBIENT_NPC_CLIPS;
  const clips = (container.vat?.clips ?? []).filter(clip =>
    Number.isFinite(clip.from)
    && Number.isFinite(clip.to)
    && Number.isFinite(clip.frames)
    && Number.isFinite(clip.fps)
    && clip.from >= 0
    && clip.to >= clip.from
    && clip.to < frameLimit
    && clip.frames === clip.to - clip.from + 1
    && clip.fps > 0
    && ambient.has(clip.name.toLowerCase())
  );
  const clip = clips[Math.floor(Math.random() * clips.length)];
  if (!clip) {
    // A corrupt timing vector makes every skinned vertex non-finite while the
    // independently rendered nameplate remains visible. Keep a valid bind-pose
    // row on screen if an imported asset has no trustworthy clip metadata.
    actor.animationBuffer.set([0, 0, 0, 1]);
    actor.emitHeaderDirty();
    return;
  }
  actor.animationBuffer.set([
    clip.from,
    clip.to,
    Math.random() * Math.max(1, clip.frames - 1),
    (clip.fps || 30) * (0.88 + Math.random() * 0.24),
  ]);
  actor.emitHeaderDirty();
}

async function importGlbBytes(B: any, scene: any, bytes: ArrayBuffer): Promise<any> {
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  try {
    if (typeof B.LoadAssetContainerAsync === 'function') {
      return await B.LoadAssetContainerAsync(objectUrl, scene, { pluginExtension: '.glb' });
    }
    return await B.SceneLoader.LoadAssetContainerAsync('', objectUrl, scene, undefined, '.glb');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadEqArmorAtlas(
  B: any,
  scene: any,
  root: string,
  modelCode: string,
): Promise<EqArmorAtlas> {
  const [basisBytes, manifestBytes] = await Promise.all([
    fetchShadoBytes(`${root}${modelCode}.basis`),
    fetchShadoBytes(`${root}${modelCode}.json`),
  ]);
  const layers = JSON.parse(new TextDecoder().decode(manifestBytes)) as string[];
  const result = await B.BasisTools.TranscodeAsync(new Uint8Array(basisBytes), {
    supportedCompressionFormats: {},
    loadMipmapLevels: false,
    loadSingleImage: undefined,
  });
  const images = result?.fileInfo?.images ?? [];
  if (!result?.success || !images.length || images.length !== layers.length) {
    throw new Error(`${modelCode.toUpperCase()} armor atlas failed to transcode`);
  }
  const width = images[0].levels[0].width;
  const height = images[0].levels[0].height;
  const pixelsPerLayer = width * height;
  const rgba = new Uint8Array(images.length * pixelsPerLayer * 4);
  for (let layer = 0; layer < images.length; layer++) {
    const level = images[layer].levels[0];
    if (level.width !== width || level.height !== height) {
      throw new Error(`${modelCode.toUpperCase()} armor atlas has inconsistent layer dimensions`);
    }
    const source = new Uint16Array(
      level.transcodedPixels.buffer,
      level.transcodedPixels.byteOffset,
      level.transcodedPixels.byteLength / 2,
    );
    for (let pixel = 0; pixel < pixelsPerLayer; pixel++) {
      const rgb565 = source[pixel];
      const offset = (layer * pixelsPerLayer + pixel) * 4;
      rgba[offset] = (((rgb565 >> 11) & 0x1f) * 255 / 31) | 0;
      rgba[offset + 1] = (((rgb565 >> 5) & 0x3f) * 255 / 63) | 0;
      rgba[offset + 2] = ((rgb565 & 0x1f) * 255 / 31) | 0;
      rgba[offset + 3] = 255;
    }
  }
  const texture = new B.RawTexture2DArray(
    rgba,
    width,
    height,
    images.length,
    B.Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    B.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
    B.Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  texture.name = `${modelCode}-requiem-armor-atlas`;
  texture.wrapU = B.Texture.WRAP_ADDRESSMODE;
  texture.wrapV = B.Texture.WRAP_ADDRESSMODE;
  return { texture, layers };
}

export function createEqShowcase(
  scene: any,
  camera: any,
  options: EqShowcaseOptions = {}
): EqShowcaseController {
  const B = options.babylon ?? MODULE_BABYLON;
  const models: EqShowcaseModel[] = [
    ...(options.models ?? [...EQ_SHOWCASE_MODELS, ...BABYLON_SHOWCASE_MODELS]),
  ];
  const assetRoot = normalizeRoot(options.assetRoot ?? '/shado/eq-demo/models/');
  const weaponRoot = normalizeRoot(options.weaponRoot ?? '/shado/eq-demo/weapons/');
  const armorRoot = normalizeRoot(options.armorRoot ?? '/shado/eq-demo/armor/');
  const pools = new Map<string, LoadedPool>();
  const pending = new Map<string, Promise<LoadedPool>>();
  const customBytes = new Map<string, ArrayBuffer>();
  const failed = new Set<string>();
  const selectionListeners = new Set<(selection: EqShowcaseSelection | undefined) => void>();
  const pickCandidates = new WeakMap<PointerEvent, number>();
  let selectedRef: { pool: LoadedPool; actor: EqShowcaseActor } | undefined;
  const selectionRing = B.MeshBuilder.CreateTorus(
    'shado-selected-instance',
    { diameter: 3.8, thickness: 0.16, tessellation: 64 },
    scene,
  );
  const selectionMaterial = new B.StandardMaterial('shado-selected-instance-material', scene);
  selectionMaterial.diffuseColor = new B.Color3(1, 0.58, 0.08);
  selectionMaterial.emissiveColor = new B.Color3(1, 0.32, 0.025);
  selectionMaterial.specularColor = B.Color3.Black();
  selectionMaterial.disableLighting = true;
  selectionMaterial.alpha = 0.88;
  selectionRing.material = selectionMaterial;
  selectionRing.isPickable = false;
  selectionRing.renderingGroupId = 2;
  selectionRing.setEnabled(false);
  let disposed = false;
  let nameplatesEnabled = true;
  let cullingRange = 180;
  const cullingModule = decodeBase64Bytes(SHOWCASE_CULLING_WASM_BASE64);
  const cullingMode: EqShowcaseStats['cullingMode'] = WebAssembly.validate(cullingModule.buffer)
    ? 'wasm-simd'
    : 'cpu';
  let placementSerial = models.length;
  let init: Promise<void> | undefined;
  const stats: EqShowcaseStats = {
    loaded: 0,
    total: models.length,
    failed: 0,
    instances: 0,
    visible: 0,
    cullingRange,
    cullingMode,
    loadedCodes: [],
  };

  const selectedSnapshot = (): EqShowcaseSelection | undefined => {
    if (!selectedRef) return undefined;
    const { pool, actor } = selectedRef;
    const index = pool.container.children.indexOf(actor);
    if (index < 0) return undefined;
    const catalog = pool.model.catalog ?? (pool.model.custom ? 'custom' : 'shado');
    const published = catalog === 'shado' && pool.model.kind === 'pc'
      ? actor.getPublishedProperties().map(descriptor => ({
          ...descriptor,
          value: actor.published.$get(descriptor.name),
        }))
      : [];
    const clips = pool.container.vat?.clips ?? [];
    const currentClip = clips.find(clip =>
      Math.abs(clip.from - actor.animationBuffer[0]) < 0.01
      && Math.abs(clip.to - actor.animationBuffer[1]) < 0.01
    );
    const rotation = actor.rotation;
    const yaw = Math.atan2(
      2 * ((rotation[3] ?? 1) * (rotation[1] ?? 0) + (rotation[0] ?? 0) * (rotation[2] ?? 0)),
      1 - 2 * ((rotation[1] ?? 0) ** 2 + (rotation[2] ?? 0) ** 2),
    );
    return {
      modelCode: pool.model.code,
      modelLabel: pool.model.label,
      catalog,
      kind: pool.model.kind,
      index,
      name: (actor as any).__showcaseName ?? `${pool.model.label} ${index + 1}`,
      position: {
        x: actor.translation[0],
        y: actor.translation[1],
        z: actor.translation[2],
      },
      scale: actor.translation[3],
      rotationDegrees: yaw * 180 / Math.PI,
      animation: currentClip?.name ?? '',
      animations: clips.map(clip => ({ name: clip.name, label: showcaseAnimationLabel(clip.name) })),
      animationSpeed: currentClip?.fps
        ? actor.animationBuffer[3] / currentClip.fps
        : 1,
      published,
    };
  };
  const notifySelection = () => {
    const selection = selectedSnapshot();
    for (const listener of selectionListeners) listener(selection);
  };
  const selectActor = (
    pool: LoadedPool,
    actor: EqShowcaseActor,
    result?: { distance: number },
    event?: PointerEvent,
  ) => {
    if (event && result) {
      const best = pickCandidates.get(event);
      if (best !== undefined && best <= result.distance) return;
      pickCandidates.set(event, result.distance);
    }
    selectedRef = { pool, actor };
    selectionRing.setEnabled(true);
    notifySelection();
  };
  const pickingFor = (getPool: () => LoadedPool | undefined) => ({
    radius: 1.35,
    camera,
    onPick: (result: any, event: PointerEvent) => {
      const pool = getPool();
      if (pool) selectActor(pool, result.instance, result, event);
    },
  });

  const publish = (patch: Partial<EqShowcaseStats> = {}) => {
    Object.assign(stats, patch, {
      total: models.length,
      loaded: pools.size,
      failed: failed.size,
      instances: [...pools.values()].reduce((sum, p) => sum + p.container.instanceCount, 0),
      visible: [...pools.values()].reduce((sum, p) => sum + p.container.visibleCount, 0),
      cullingRange,
      cullingMode,
      loadedCodes: [...pools.keys()],
    });
    options.onStats?.({ ...stats });
  };

  const ensureInitialized = async () => {
    init ??= (async () => {
      await EqShowcaseContainer.initialize(scene.getEngine(), {
        backend: 'datatex',
        wasm: cullingMode === 'wasm-simd'
          ? { mode: 'precompiled', module: cullingModule.buffer }
          : false,
        extra: EqShowcaseActor,
        logShaderCode: false,
        logAscCode: false,
      });
      if (options.fontAsset) {
        await NameplateData.initialize(scene.getEngine(), { wasm: false, logShaderCode: false, logAscCode: false });
      }
      syncShaderStores(B);
    })();
    return init;
  };

  const load = async (model: EqShowcaseModel): Promise<LoadedPool> => {
    const existing = pools.get(model.code);
    if (existing) return existing;
    const active = pending.get(model.code);
    if (active) return active;
    const promise = (async () => {
      publish({ current: `Baking ${model.label}` });
      await ensureInitialized();
      const [bytes, headBytes, weaponBytes, armorAtlas] = await Promise.all([
        fetchShadoBytes(`${assetRoot}${model.code}.glb.gz`),
        fetchShadoBytes(`${assetRoot}${model.code}-head.glb.gz`),
        Promise.all(SHOWCASE_WEAPONS.map(code => fetchShadoBytes(`${weaponRoot}${code}.glb.gz`))),
        model.kind === 'pc' ? loadEqArmorAtlas(B, scene, armorRoot, model.code) : undefined,
      ]);
      const packedVatPromise = options.bakeWorkerUrl
        ? bakeVatWithHeadlessWorker(options.bakeWorkerUrl, bytes.slice(0), {
            clipNames: [...SHOWCASE_CLIPS],
            useHalf: true,
            detectScale: true,
            mergeWorldSpace: true,
            meshNamePrefix: model.code,
          })
        : undefined;
      const [source, headSource, weaponSources] = await Promise.all([
        importGlbBytes(B, scene, bytes),
        importGlbBytes(B, scene, headBytes),
        Promise.all(weaponBytes.map(item => importGlbBytes(B, scene, item))),
      ]);
      source.addAllToScene();
      headSource.addAllToScene();
      for (const weaponSource of weaponSources) weaponSource.addAllToScene();
      const bodyCandidates = source.meshes.filter((mesh: any) => mesh.getTotalVertices?.() > 0 && mesh.skeleton);
      const headMeshes = headSource.meshes.filter((mesh: any) => mesh.getTotalVertices?.() > 0 && mesh.skeleton);
      // Some decoded EQ assets retain an unused base-race skin before the skin
      // actually referenced by the visible mesh (HOM contains a dwarf base
      // skeleton at slot 0 and its halfling skeleton at slot 1). Always follow
      // the mesh binding; array order is not an ownership relationship.
      const preferredBody = bodyCandidates.find((mesh: any) => meshMatchesModel(mesh, model.code));
      const skeleton = preferredBody?.skeleton ?? bodyCandidates[0]?.skeleton ?? source.skeletons[0];
      const bodyMeshes = bodyCandidates.filter((mesh: any) => mesh.skeleton === skeleton);
      if (!bodyMeshes.length || !skeleton) throw new Error(`${model.label} has no skinned mesh/skeleton`);
      // EQ heads are separate skinned GLBs. Their joint indices use the same
      // race skeleton ordering, so bind them to the body's animated skeleton
      // before atlas stamping and merge. This makes the head part of the same
      // single VAT draw instead of leaving it behind as a source mesh.
      bindHeadMeshesToSkeleton(B, headMeshes, skeleton);
      const minimumY = Math.min(...[...bodyMeshes, ...headMeshes].map((mesh: any) => {
        mesh.computeWorldMatrix(true);
        return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
      }));
      const groundOffset = Number.isFinite(minimumY) ? -minimumY : 0;
      const weaponMeshes: any[][] = [];
      for (const [index, weaponSource] of weaponSources.entries()) {
        const itemMeshes = weaponSource.meshes.filter((mesh: any) => mesh.getTotalVertices?.() > 0);
        normalizeWeaponMeshes(itemMeshes);
        orientWeaponMeshes(B, itemMeshes);
        if (!bindWeaponMeshesToSkeleton(B, itemMeshes, skeleton)) {
          for (const mesh of itemMeshes) mesh.dispose();
          continue;
        }
        stampWeaponVariant(itemMeshes, index + 1);
        weaponMeshes.push(itemMeshes);
      }
      stampWeaponVariant([...bodyMeshes, ...headMeshes], 0);
      const meshes = [...bodyMeshes, ...headMeshes, ...weaponMeshes.flat()];
      stampEquipmentParts(meshes);
      if (armorAtlas) stampEqArmorLayers(bodyMeshes, armorAtlas.layers);
      const showcaseGroups = source.animationGroups.filter((group: any) =>
        SHOWCASE_CLIPS.has(group.name.toLowerCase())
      );
      const ownedGroups = showcaseGroups.length ? showcaseGroups : source.animationGroups.slice(0, 8);
      const packedVat = await packedVatPromise;

      const container = new EqShowcaseContainer(scene.getEngine());
      let nameplates: NameplateData | undefined;
      let nameplateLayer: any;
      if (options.fontAsset) {
        nameplates = new NameplateData(scene.getEngine(), options.fontAsset);
        container.nameplates = nameplates;
      }
      let pool: LoadedPool | undefined;
      await container.attachMeshes(scene, meshes, skeleton, {
        vat: 'bake', merge: true, replaceMaterial: true, disposeOriginalMaterial: false,
        packedVat,
        picking: pickingFor(() => pool),
        defines: armorAtlas ? ['EQ_ARMOR_VARIANTS'] : undefined,
        materialTextures: armorAtlas ? { uEqArmorAtlas: armorAtlas.texture } : undefined,
        vatOptions: {
          useHalfDQ: true,
          animationGroups: ownedGroups,
          execution: 'worker',
          yieldEveryFrames: 6,
          detectScale: true,
        },
      });
      // The baked DQ atlas is self-contained. Keeping glTF AnimationGroups in
      // the scene wastes memory and can contaminate later model audits.
      for (const imported of [source, headSource, ...weaponSources]) {
        for (const group of imported.animationGroups.slice()) group.dispose();
      }
      if (nameplates && options.createNameplateLayer) {
        nameplateLayer = options.createNameplateLayer(scene, container, nameplates, options.fontAsset);
        nameplateLayer?.setEnabled(nameplatesEnabled);
      }
      const actorName = nameFor(model, 1);
      const actor = container.addInstance(false, actorName);
      (actor as any).__showcaseName = actorName;
      const index = models.indexOf(model);
      setActorTransform(actor, model, index, models.length, groundOffset);
      setRandomAnimation(container, actor, model);
      pool = {
        model,
        container,
        nameplates,
        nameplateLayer,
        sources: [source, headSource, ...weaponSources, ...(armorAtlas ? [armorAtlas.texture] : [])],
        groundOffset,
        nextInstanceNumber: 2,
      };
      pools.set(model.code, pool);
      if (!selectedRef) selectActor(pool, actor);
      failed.delete(model.code);
      publish({ current: undefined, lastError: undefined });
      return pool;
    })().catch(error => {
      failed.add(model.code);
      const message = error instanceof Error ? error.message : String(error);
      publish({ current: undefined, lastError: `${model.label}: ${message}` });
      throw error;
    }).finally(() => pending.delete(model.code));
    pending.set(model.code, promise);
    return promise;
  };

  const loadDropped = async (model: EqShowcaseModel, bytes: ArrayBuffer): Promise<LoadedPool> => {
    const existing = pools.get(model.code);
    if (existing) return existing;
    const active = pending.get(model.code);
    if (active) return active;
    const promise = (async () => {
      publish({ current: `Inspecting ${model.label}`, lastError: undefined });
      await ensureInitialized();
      let source: any;
      let container: EqShowcaseContainer | undefined;
      try {
        source = await importGlbBytes(B, scene, bytes);
        source.addAllToScene();
        const meshes = source.meshes.filter((mesh: any) => mesh.getTotalVertices?.() > 0 && mesh.skeleton);
        const skeleton = source.skeletons[0] ?? meshes[0]?.skeleton;
        if (!meshes.length || !skeleton) {
          throw new Error('GLB needs at least one skinned mesh and skeleton');
        }

        const validGroups = source.animationGroups.filter((group: any) =>
          Number.isFinite(group.from) && Number.isFinite(group.to) && group.to >= group.from
        );
        if (!validGroups.length) throw new Error('GLB skeleton has no animation groups to VAT-bake');
        // Keep a dropped model responsive even if it contains a large motion
        // library. Ambient-looking clips are preferred, then the first valid
        // clips fill the remaining slots up to a forum-demo-safe maximum.
        const ambientPattern = /idle|stand|walk|run|move|locom|breathe|pose/i;
        const unsafePattern = /death|dead|die|fall|swim|sit|kneel|attack|combat|hit|stun/i;
        const preferred = validGroups.filter((group: any) => {
          const normalized = group.name.toLowerCase();
          return AMBIENT_PC_CLIPS.has(normalized)
            || (ambientPattern.test(group.name) && !unsafePattern.test(group.name));
        });
        const selectedGroups = [...preferred, ...validGroups.filter((group: any) => !preferred.includes(group))]
          .slice(0, 12);
        model.ambientClips = (preferred.length ? preferred : selectedGroups)
          .slice(0, 8)
          .map((group: any) => group.name);

        const minimumY = Math.min(...meshes.map((mesh: any) => {
          mesh.computeWorldMatrix(true);
          return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
        }));
        const maximumY = Math.max(...meshes.map((mesh: any) =>
          mesh.getBoundingInfo().boundingBox.maximumWorld.y
        ));
        const sourceHeight = maximumY - minimumY;
        if (Number.isFinite(sourceHeight) && sourceHeight > 0.001) {
          // setActorTransform applies the showcase's 1.28 presentation scale;
          // compensate here so the final visible model is about 5.8 units tall.
          model.scale = Math.min(100, Math.max(0.01, 5.8 / (sourceHeight * 1.28)));
        }
        const groundOffset = Number.isFinite(minimumY) ? -minimumY : 0;
        stampWeaponVariant(meshes, 0);
        stampEquipmentParts(meshes);

        publish({ current: `VAT-baking ${model.label} · ${selectedGroups.length} clips` });
        const packedVat = options.bakeWorkerUrl
          ? await bakeVatWithHeadlessWorker(options.bakeWorkerUrl, bytes.slice(0), {
              clipNames: selectedGroups.map((group: any) => group.name),
              useHalf: true,
              detectScale: true,
              mergeWorldSpace: true,
            })
          : undefined;

        container = new EqShowcaseContainer(scene.getEngine());
        let nameplates: NameplateData | undefined;
        let nameplateLayer: any;
        if (options.fontAsset) {
          nameplates = new NameplateData(scene.getEngine(), options.fontAsset);
          container.nameplates = nameplates;
        }
        let pool: LoadedPool | undefined;
        await container.attachMeshes(scene, meshes, skeleton, {
          vat: 'bake', merge: true, replaceMaterial: true, disposeOriginalMaterial: false,
          packedVat,
          picking: pickingFor(() => pool),
          vatOptions: {
            useHalfDQ: true,
            animationGroups: selectedGroups,
            execution: 'worker',
            yieldEveryFrames: 6,
            detectScale: true,
          },
        });
        for (const group of source.animationGroups.slice()) group.dispose();
        if (nameplates && options.createNameplateLayer) {
          nameplateLayer = options.createNameplateLayer(scene, container, nameplates, options.fontAsset);
          nameplateLayer?.setEnabled(nameplatesEnabled);
        }
        const actorName = nameFor(model, 1);
        const actor = container.addInstance(false, actorName);
        (actor as any).__showcaseName = actorName;
        setActorTransform(actor, model, models.indexOf(model), models.length, groundOffset);
        setRandomAnimation(container, actor, model);
        pool = {
          model,
          container,
          nameplates,
          nameplateLayer,
          sources: [source],
          groundOffset,
          nextInstanceNumber: 2,
        };
        pools.set(model.code, pool);
        if (!selectedRef) selectActor(pool, actor);
        failed.delete(model.code);
        publish({ current: undefined, lastError: undefined });
        return pool;
      } catch (error) {
        container?.dispose();
        source?.dispose();
        throw error;
      }
    })().catch(error => {
      failed.add(model.code);
      const message = error instanceof Error ? error.message : String(error);
      publish({ current: undefined, lastError: `${model.label}: ${message}` });
      throw error;
    }).finally(() => pending.delete(model.code));
    pending.set(model.code, promise);
    return promise;
  };

  const loadCanonical = async (model: EqShowcaseModel): Promise<LoadedPool> => {
    const existing = pools.get(model.code);
    if (existing) return existing;
    const active = pending.get(model.code);
    if (active) return active;
    if (!model.sourceUrl) throw new Error(`${model.label} has no canonical source URL`);
    const promise = (async () => {
      publish({ current: `Loading Babylon asset · ${model.label}`, lastError: undefined });
      await ensureInitialized();
      let source: any;
      let container: EqShowcaseContainer | undefined;
      try {
        const slash = model.sourceUrl!.lastIndexOf('/') + 1;
        source = await B.SceneLoader.LoadAssetContainerAsync(
          model.sourceUrl!.slice(0, slash),
          model.sourceUrl!.slice(slash),
          scene,
        );
        source.addAllToScene();
        const meshes = source.meshes.filter((mesh: any) => mesh.getTotalVertices?.() > 0 && mesh.skeleton);
        const skeleton = meshes[0]?.skeleton ?? source.skeletons[0];
        if (!meshes.length || !skeleton) {
          throw new Error('Canonical asset needs at least one skinned mesh and skeleton');
        }
        const validGroups = source.animationGroups.filter((group: any) =>
          Number.isFinite(group.from) && Number.isFinite(group.to) && group.to >= group.from
        );
        const ambientPattern = /idle|stand|walk|run|move|locom|breathe|pose/i;
        const unsafePattern = /death|dead|die|fall|swim|sit|kneel|attack|combat|hit|stun/i;
        const preferred = validGroups.filter((group: any) =>
          ambientPattern.test(group.name) && !unsafePattern.test(group.name)
        );
        const selectedGroups = [...preferred, ...validGroups.filter((group: any) => !preferred.includes(group))]
          .slice(0, 12);

        const minimumY = Math.min(...meshes.map((mesh: any) => {
          mesh.computeWorldMatrix(true);
          return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
        }));
        const maximumY = Math.max(...meshes.map((mesh: any) =>
          mesh.getBoundingInfo().boundingBox.maximumWorld.y
        ));
        const sourceHeight = maximumY - minimumY;
        if (Number.isFinite(sourceHeight) && sourceHeight > 0.001) {
          model.scale = Math.min(100, Math.max(0.01, 5.8 / (sourceHeight * 1.28)));
        }
        const groundOffset = Number.isFinite(minimumY) ? -minimumY : 0;
        stampWeaponVariant(meshes, 0);
        stampEquipmentParts(meshes);

        publish({ current: `VAT-baking Babylon asset · ${model.label}` });
        container = new EqShowcaseContainer(scene.getEngine());
        let nameplates: NameplateData | undefined;
        let nameplateLayer: any;
        if (options.fontAsset) {
          nameplates = new NameplateData(scene.getEngine(), options.fontAsset);
          container.nameplates = nameplates;
        }
        let pool: LoadedPool | undefined;
        await container.attachMeshes(scene, meshes, skeleton, {
          vat: 'bake', merge: true, replaceMaterial: true, disposeOriginalMaterial: false,
          picking: pickingFor(() => pool),
          vatOptions: {
            useHalfDQ: true,
            animationGroups: selectedGroups.length ? selectedGroups : undefined,
            execution: 'worker',
            yieldEveryFrames: 6,
            detectScale: true,
          },
        });
        model.ambientClips = (preferred.length ? preferred : selectedGroups)
          .slice(0, 8)
          .map((group: any) => group.name);
        for (const group of source.animationGroups.slice()) group.dispose();
        if (nameplates && options.createNameplateLayer) {
          nameplateLayer = options.createNameplateLayer(scene, container, nameplates, options.fontAsset);
          nameplateLayer?.setEnabled(nameplatesEnabled);
        }
        const actorName = nameFor(model, 1);
        const actor = container.addInstance(false, actorName);
        (actor as any).__showcaseName = actorName;
        setActorTransform(actor, model, models.indexOf(model), models.length, groundOffset);
        setRandomAnimation(container, actor, model);
        pool = {
          model,
          container,
          nameplates,
          nameplateLayer,
          sources: [source],
          groundOffset,
          nextInstanceNumber: 2,
        };
        pools.set(model.code, pool);
        failed.delete(model.code);
        if (!selectedRef) selectActor(pool, actor);
        publish({ current: undefined, lastError: undefined });
        return pool;
      } catch (error) {
        container?.dispose();
        source?.dispose();
        throw error;
      }
    })().catch(error => {
      failed.add(model.code);
      const message = error instanceof Error ? error.message : String(error);
      publish({ current: undefined, lastError: `${model.label}: ${message}` });
      throw error;
    }).finally(() => pending.delete(model.code));
    pending.set(model.code, promise);
    return promise;
  };

  const loadAny = (model: EqShowcaseModel): Promise<LoadedPool> => {
    const bytes = customBytes.get(model.code);
    if (bytes) return loadDropped(model, bytes);
    if (model.sourceUrl) return loadCanonical(model);
    return load(model);
  };

  const loadList = async (list: readonly EqShowcaseModel[]) => {
    const requested = list.filter(model => !pools.has(model.code));
    const hardware = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 4;
    const concurrency = options.bakeWorkerUrl
      ? Math.max(1, Math.min(options.bakeConcurrency ?? Math.max(2, hardware - 1), 4, requested.length))
      : 1;
    let cursor = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (!disposed) {
        const index = cursor++;
        if (index >= requested.length) return;
        const model = requested[index];
        try { await loadAny(model); }
        catch (error) { console.error('[Shado Showcase] model failed', model, error); }
      }
    }));
  };

  const controller: EqShowcaseController = {
    stats,
    models,
    get selected() { return selectedSnapshot(); },
    loadAll: () => loadList(models.filter(model =>
      (model.catalog ?? (model.custom ? 'custom' : 'shado')) === 'shado'
    )),
    loadKind: kind => loadList(models.filter(model => model.kind === kind && model.catalog !== 'babylon')),
    async loadModel(code) {
      const model = models.find(candidate => candidate.code === code);
      if (!model) throw new Error(`Unknown Shado showcase model: ${code}`);
      await loadAny(model);
    },
    async addGlb(bytes, filename = 'Dropped model.glb') {
      if (bytes.byteLength < 20) throw new Error('File is too small to be a GLB');
      const header = new DataView(bytes, 0, 12);
      if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2) {
        throw new Error('Only binary glTF 2.0 (.glb) files are supported');
      }
      const cleanLabel = filename.replace(/\.glb$/i, '').trim() || 'Dropped model';
      const slug = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
      let code = `drop-${slug}`;
      let suffix = 2;
      while (models.some(model => model.code === code)) code = `drop-${slug}-${suffix++}`;
      const model: EqShowcaseModel = {
        code,
        label: cleanLabel,
        kind: 'pc',
        nameRace: 'human',
        scale: 1,
        custom: true,
        catalog: 'custom',
      };
      models.push(model);
      customBytes.set(code, bytes);
      publish({ current: `Queued ${cleanLabel}` });
      await loadDropped(model, bytes);
      // The source container and packed VAT own everything needed at runtime.
      // Release the original upload so repeated drops do not retain every GLB.
      customBytes.delete(code);
      return code;
    },
    async addRandom(count = 1) {
      if (!pools.size) await loadAny(models[0]);
      const touched = new Set<LoadedPool>();
      for (let i = 0; i < count; i++) {
        const pool = [...pools.values()][Math.floor(Math.random() * pools.size)];
        const actorName = nameFor(pool.model, pool.nextInstanceNumber++);
        const actor = pool.container.addInstance(true, actorName);
        (actor as any).__showcaseName = actorName;
        const serial = placementSerial++;
        const angle = serial * 2.399963229728653;
        const radius = 10 + Math.sqrt(serial) * 5.2;
        setActorTransform(actor, pool.model, 0, 1, pool.groundOffset);
        actor.translation[0] = Math.cos(angle) * radius + (Math.random() - 0.5) * 2.5;
        actor.translation[2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 2.5;
        actor.emitHeaderDirty();
        setRandomAnimation(pool.container, actor, pool.model);
        touched.add(pool);
        if (!selectedRef) selectActor(pool, actor);
      }
      for (const pool of touched) pool.nameplates?.rebuildStreams(pool.container.children);
      publish();
    },
    removeRandom() {
      const candidates = [...pools.values()].filter(pool => pool.container.instanceCount > 0);
      const pool = candidates[Math.floor(Math.random() * candidates.length)];
      if (pool) {
        const index = Math.floor(Math.random() * pool.container.instanceCount);
        const actor = pool.container.children[index];
        pool.container.removeInstance(index);
        if (selectedRef?.actor === actor) {
          selectedRef = undefined;
          notifySelection();
        }
        pool.nameplates?.rebuildStreams(pool.container.children);
      }
      publish();
    },
    shuffle() {
      let moved = 0;
      const spread = Math.min(260, 48 + Math.sqrt(Math.max(1, stats.instances)) * 6.5);
      for (const pool of pools.values()) {
        for (const actor of pool.container.children) {
          setRandomAnimation(pool.container, actor, pool.model);
          // Shuffle is a full crowd permutation: redistribute actors over the
          // wider terrain as well as changing clip, phase, speed, and facing.
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.sqrt(Math.random()) * spread;
          actor.translation[0] = Math.cos(angle) * radius;
          actor.translation[2] = Math.sin(angle) * radius;
          const yaw = Math.random() * Math.PI * 2;
          actor.rotation.set([0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)]);
          actor.emitHeaderDirty();
          moved++;
        }
      }
      placementSerial += moved;
      notifySelection();
      publish();
    },
    setCullingRange(distance) {
      cullingRange = Number.isFinite(distance) ? Math.max(0, distance) : 180;
      publish();
    },
    setNameplatesEnabled(enabled) {
      nameplatesEnabled = enabled;
      for (const pool of pools.values()) pool.nameplateLayer?.setEnabled(enabled);
    },
    setSelectedName(name) {
      if (!selectedRef) return;
      const clean = name.trim().slice(0, 48);
      if (!clean) return;
      const { pool, actor } = selectedRef;
      const index = pool.container.children.indexOf(actor);
      if (index < 0) return;
      (actor as any).__showcaseName = clean;
      pool.container.setChildName(index, clean);
      notifySelection();
    },
    setSelectedAnimation(name) {
      if (!selectedRef) return;
      const { pool, actor } = selectedRef;
      const clip = pool.container.vat?.clips.find(candidate => candidate.name === name);
      if (!clip) return;
      const currentSpeed = Number.isFinite(actor.animationBuffer[3]) && actor.animationBuffer[3] > 0
        ? actor.animationBuffer[3]
        : clip.fps;
      const currentClip = pool.container.vat?.clips.find(candidate =>
        Math.abs(candidate.from - actor.animationBuffer[0]) < 0.01
        && Math.abs(candidate.to - actor.animationBuffer[1]) < 0.01
      );
      const speedMultiplier = currentClip?.fps ? currentSpeed / currentClip.fps : 1;
      actor.animationBuffer.set([clip.from, clip.to, 0, clip.fps * speedMultiplier]);
      actor.emitHeaderDirty();
      notifySelection();
    },
    setSelectedAnimationSpeed(multiplier) {
      if (!selectedRef || !Number.isFinite(multiplier)) return;
      const { pool, actor } = selectedRef;
      const clip = pool.container.vat?.clips.find(candidate =>
        Math.abs(candidate.from - actor.animationBuffer[0]) < 0.01
        && Math.abs(candidate.to - actor.animationBuffer[1]) < 0.01
      );
      actor.animationBuffer[3] = (clip?.fps ?? 30) * Math.max(0.1, Math.min(3, multiplier));
      actor.emitHeaderDirty();
      notifySelection();
    },
    setSelectedTransform(patch) {
      if (!selectedRef) return;
      const actor = selectedRef.actor;
      if (Number.isFinite(patch.x)) actor.translation[0] = patch.x!;
      if (Number.isFinite(patch.y)) actor.translation[1] = patch.y!;
      if (Number.isFinite(patch.z)) actor.translation[2] = patch.z!;
      if (Number.isFinite(patch.scale)) actor.translation[3] = Math.max(0.01, patch.scale!);
      if (Number.isFinite(patch.rotationDegrees)) {
        const yaw = patch.rotationDegrees! * Math.PI / 180;
        actor.rotation.set([0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)]);
      }
      actor.emitHeaderDirty();
      notifySelection();
    },
    setSelectedPublished(name, value) {
      if (!selectedRef) return;
      selectedRef.actor.published.$set(name, value);
      // Armorless means the source art with no dye applied. Resetting these
      // channels also makes switching back to base deterministic after a tint edit.
      if (name === 'armor' && value === 'armorless') {
        for (const tint of ['skinTint', 'chestTint', 'legTint', 'trimTint'] as const) {
          selectedRef.actor[tint].set([1, 1, 1, 1]);
        }
      }
      selectedRef.actor.emitHeaderDirty();
      notifySelection();
    },
    moveSelectedFromScreen(x, y) {
      if (!selectedRef) return;
      const canvas = scene.getEngine().getRenderingCanvas?.() as HTMLCanvasElement | null;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = x * scene.getEngine().getRenderWidth() / Math.max(1, rect.width);
      const py = y * scene.getEngine().getRenderHeight() / Math.max(1, rect.height);
      const ray = scene.createPickingRay(px, py, B.Matrix.Identity(), camera);
      const groundY = selectedRef.actor.translation[1];
      if (Math.abs(ray.direction.y) < 1e-6) return;
      const distance = (groundY - ray.origin.y) / ray.direction.y;
      if (!Number.isFinite(distance) || distance <= 0) return;
      selectedRef.actor.translation[0] = ray.origin.x + ray.direction.x * distance;
      selectedRef.actor.translation[2] = ray.origin.z + ray.direction.z * distance;
      selectedRef.actor.emitHeaderDirty();
      notifySelection();
    },
    subscribeSelection(listener) {
      selectionListeners.add(listener);
      listener(selectedSnapshot());
      return () => selectionListeners.delete(listener);
    },
    dispose() {
      disposed = true;
      selectedRef = undefined;
      selectionListeners.clear();
      selectionRing.dispose(false, true);
      for (const pool of pools.values()) {
        pool.nameplateLayer?.dispose?.();
        pool.container.dispose();
        for (const source of pool.sources) source.dispose();
      }
      pools.clear();
      customBytes.clear();
    },
  };

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (disposed) return;
    if (selectedRef) {
      const actor = selectedRef.actor;
      const scale = Math.max(0.35, actor.translation[3]);
      const groundY = scene.getMeshByName?.('shado-showcase-plane')?.position?.y;
      selectionRing.position.set(
        actor.translation[0],
        Number.isFinite(groundY) ? groundY + 0.08 : actor.translation[1] + 0.08,
        actor.translation[2],
      );
      selectionRing.scaling.setAll(scale);
      selectionRing.visibility = 0.72 + Math.sin(performance.now() * 0.004) * 0.18;
    } else {
      selectionRing.setEnabled(false);
    }
    let visible = 0;
    for (const pool of pools.values()) {
      pool.container.frustumCull(camera, 3.5, cullingRange);
      visible += pool.container.visibleCount;
    }
    if (visible !== stats.visible) publish({ visible });
  });
  scene.onDisposeObservable.add(() => {
    scene.onBeforeRenderObservable.remove(observer);
    controller.dispose();
  });

  publish();
  if (options.autoLoad !== false) {
    // Pick one random model for each equipment family so the initial three
    // types always demonstrate leather, chain, and plate instead of merely
    // three different color tints.
    const shadoModels = models.filter(model => model.catalog !== 'babylon');
    const starters = [0, 1, 2]
      .map(family => shadoModels.filter((_, index) => index % 3 === family))
      .filter(bucket => bucket.length)
      .map(bucket => bucket[Math.floor(Math.random() * bucket.length)]);
    void loadList(starters);
  }
  return controller;
}
