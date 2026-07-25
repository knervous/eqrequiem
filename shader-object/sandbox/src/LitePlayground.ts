import {
  addToScene,
  attachControl,
  attachVat,
  bakeVatMany,
  createDefaultCamera,
  createDirectionalLight,
  createEngine,
  createGpuPicker,
  createGround,
  createHemisphericLight,
  createSceneContext,
  createStandardMaterial,
  createTexture2DArray,
  createTorus,
  disposeEngine,
  disposePicker,
  disposeScene,
  enableMaterialPlugins,
  getContainerMeshes,
  getViewProjectionMatrix,
  isGpuTimingSupported,
  loadBabylon,
  loadGltf,
  mat4Compose,
  mat4Invert,
  mat4Multiply,
  onBeforeRender,
  pickAsync,
  registerScene,
  rebuildMaterial,
  resizeEngine,
  setGpuTimingEnabled,
  setThinInstanceCount,
  setThinInstanceColors,
  setThinInstances,
  startEngine,
  stopEngine,
  type ArcRotateCamera,
  type AssetContainer,
  type EngineContext,
  type Mat4,
  type MaterialPlugin,
  type Mesh,
  type SceneContext,
  type SceneNode,
  type Texture2DArray,
  type VatClip,
  type VatBakeResult,
  type VatHandle,
} from '@babylonjs/lite';
import {
  field,
  gpuStruct,
  shadoPublish,
  type ShadoPublishedProperty,
  type ShadoPublishedScalar,
} from '@knervous/shado/core';
import {
  ShadoActor,
  ShadoLiteInstanceContainer,
} from '@knervous/shado/lite';
import { fetchShadoBytes } from '@knervous/shado/preprocess/runtime';
import {
  BABYLON_SHOWCASE_MODELS,
  EQ_SHOWCASE_MODELS,
  SHOWCASE_WEAPONS,
  createShadoVatShowcaseUi,
  showcaseAnimationLabel,
  type EqShowcaseController,
  type EqShowcaseModel,
  type EqShowcaseSelection,
  type EqShowcaseStats,
  type EqShowcaseTransformPatch,
} from '@knervous/shado/showcase';

export interface LitePlaygroundHandle {
  dispose(): void;
}

const AMBIENT_CLIP = /idle|stand|walk|run|move|locom|breathe|pose|^p01$|^o01$|^l0[12]$/i;
const UNSAFE_CLIP = /death|dead|die|fall|swim|sit|kneel|attack|combat|hit|stun/i;
const MAX_BAKED_CLIPS = 8;
const ARMOR_VALUES = ['armorless', 'leather', 'chain', 'plate'] as const;

@gpuStruct({ name: 'EqLiteShowcaseActor' })
class EqLiteShowcaseActor extends ShadoActor {
  @field('vec4') declare skinTint: Float32Array;
  @field('vec4') declare chestTint: Float32Array;
  @field('vec4') declare legTint: Float32Array;
  @field('vec4') declare trimTint: Float32Array;

  @shadoPublish({
    name: 'armor',
    label: 'Armor',
    group: 'Appearance',
    description: 'The same renderer-neutral Shado appearance value used by the full renderer.',
    values: ['armorless', 'leather', 'chain', 'plate'],
  })
  @field('f32')
  declare armorClass: number;

  @shadoPublish({
    name: 'mainHand',
    label: 'Main hand',
    group: 'Equipment',
    socket: 'r_point',
    values: [
      { value: 'none', label: 'Unarmed' },
      ...SHOWCASE_WEAPONS.map((value, index) => ({
        value,
        label: `Weapon ${index + 1}`,
      })),
    ],
  })
  @field('f32')
  declare weaponClass: number;

  public override initialize(): void {
    super.initialize();
    this.skinTint = new Float32Array([1, 1, 1, 1]);
    this.chestTint = new Float32Array([1, 1, 1, 1]);
    this.legTint = new Float32Array([1, 1, 1, 1]);
    this.trimTint = new Float32Array([1, 1, 1, 1]);
    this.armorClass = 0;
    this.weaponClass = 0;
  }
}

type LiteActor = EqLiteShowcaseActor & { __showcaseName?: string };

function liteActorArmorClass(actor: LiteActor): number {
  const published = actor.published.$get('armor');
  const publishedIndex =
    typeof published === 'string'
      ? ARMOR_VALUES.indexOf(published as (typeof ARMOR_VALUES)[number])
      : -1;
  if (publishedIndex >= 0) return publishedIndex;
  const internal = Number(actor.armorClass);
  return Number.isFinite(internal) ? Math.max(0, Math.min(3, Math.round(internal))) : 0;
}

type HierarchyBinding = {
  mesh: Mesh;
  matrices: Float32Array;
  colors?: Float32Array;
  usesVat: boolean;
  meshWorldInverse: Mat4;
  rootWorldInverse: Mat4;
  rootRelativeMeshWorld: Mat4;
};

class LiteHierarchyInstances {
  private capacity = 0;
  private readonly bindings: HierarchyBinding[];

  public constructor(
    root: SceneNode,
    meshes: readonly Mesh[],
    private readonly publishAppearance = false
  ) {
    const rootInverse = mat4Invert(root.worldMatrix);
    if (!rootInverse) throw new Error(`Model hierarchy "${root.name}" has a singular root transform.`);
    this.bindings = meshes.map(mesh => {
      const meshInverse = mat4Invert(mesh.worldMatrix);
      if (!meshInverse) throw new Error(`Mesh "${mesh.name}" has a singular world transform.`);
      return {
        mesh,
        matrices: new Float32Array(0),
        usesVat: !!mesh.vat,
        meshWorldInverse: meshInverse,
        rootWorldInverse: rootInverse,
        rootRelativeMeshWorld: mat4Multiply(rootInverse, mesh.worldMatrix),
      };
    });
  }

  public sync(actors: readonly LiteActor[]): void {
    this.ensureCapacity(actors.length);
    for (const binding of this.bindings) {
      for (let index = 0; index < actors.length; index++) {
        const actor = actors[index];
        const root = mat4Compose(
          actor.translation[0],
          actor.translation[1],
          actor.translation[2],
          actor.rotation[0],
          actor.rotation[1],
          actor.rotation[2],
          actor.rotation[3],
          actor.translation[3],
          actor.translation[3],
          actor.translation[3]
        );
        // Babylon Lite's regular thin-instance path composes mesh * instance,
        // while its VAT path composes instance * mesh * skinning. Supply the
        // matrix expected by each shader rather than mirroring the root offset
        // through the mesh inverse on VAT actors.
        const instance = binding.usesVat
          ? mat4Multiply(root, binding.rootWorldInverse)
          : mat4Multiply(
              binding.meshWorldInverse,
              mat4Multiply(root, binding.rootRelativeMeshWorld)
            );
        binding.matrices.set(instance, index * 16);
        if (binding.colors) {
          const encodedArmorClass = 1 - liteActorArmorClass(actor) / 1024;
          binding.colors.set([encodedArmorClass, 1, 1, 1], index * 4);
        }
      }
      if (binding.colors) setThinInstanceColors(binding.mesh, binding.colors);
      setThinInstanceCount(binding.mesh, actors.length);
    }
  }

  private ensureCapacity(required: number): void {
    if (required <= this.capacity) return;
    let next = Math.max(4, this.capacity);
    while (next < required) next *= 2;
    this.capacity = next;
    for (const binding of this.bindings) {
      binding.matrices = new Float32Array(next * 16);
      setThinInstances(binding.mesh, binding.matrices, next);
      if (this.publishAppearance) {
        binding.colors = new Float32Array(next * 4);
        binding.colors.fill(1);
        setThinInstanceColors(binding.mesh, binding.colors);
      }
      setThinInstanceCount(binding.mesh, 0);
    }
  }
}

type LoadedAsset = {
  container: AssetContainer;
  instances: LiteHierarchyInstances;
  vatHandles: VatHandle[];
  vatInstanceCapacity: number;
  armorAtlas?: Texture2DArray;
  armorMaterialCount?: number;
  bakedVat: VatBakeResult[];
};

type LitePool = {
  model: EqShowcaseModel;
  actors: ShadoLiteInstanceContainer<EqLiteShowcaseActor>;
  assets: LoadedAsset[];
  clips: Record<string, VatClip>;
  nextInstanceNumber: number;
  visibleActors: LiteActor[];
  visibleSignature: string;
  revision: number;
  publishedRevision: number;
};

function cameraPosition(camera: ArcRotateCamera): [number, number, number] {
  const sinBeta = Math.sin(camera.beta);
  return [
    camera.target.x + camera.radius * Math.cos(camera.alpha) * sinBeta,
    camera.target.y + camera.radius * Math.cos(camera.beta),
    camera.target.z + camera.radius * Math.sin(camera.alpha) * sinBeta,
  ];
}

function actorMatrixPlacement(
  actor: LiteActor,
  model: EqShowcaseModel,
  serial: number,
  initial = false
): void {
  const scale = model.scale * 1.28;
  if (initial) {
    const columns = 3;
    actor.translation.set([
      (serial % columns - 1) * 8,
      -1,
      (Math.floor(serial / columns) - 0.5) * 8,
      scale,
    ]);
  } else {
    const angle = serial * 2.399963229728653;
    const radius = 10 + Math.sqrt(serial) * 5.2;
    actor.translation.set([
      Math.cos(angle) * radius + (Math.random() - 0.5) * 2.5,
      -1,
      Math.sin(angle) * radius + (Math.random() - 0.5) * 2.5,
      scale,
    ]);
  }
  const yaw = initial ? 0 : Math.random() * Math.PI * 2;
  actor.rotation.set([0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)]);
  actor.color.set([1, 1, 1, 1]);
  actor.emitHeaderDirty();
}

function chooseClips(groups: readonly NonNullable<AssetContainer['animationGroups']>[number][]) {
  const safe = groups.filter(group => AMBIENT_CLIP.test(group.name) && !UNSAFE_CLIP.test(group.name));
  return [...safe, ...groups.filter(group => !safe.includes(group))].slice(0, MAX_BAKED_CLIPS);
}

function setRandomAnimation(actor: LiteActor, clips: Record<string, VatClip>): void {
  const entries = Object.entries(clips);
  const safe = entries.filter(([name]) => AMBIENT_CLIP.test(name) && !UNSAFE_CLIP.test(name));
  const [name, clip] = (safe.length ? safe : entries)[Math.floor(Math.random() * (safe.length || entries.length))] ?? [];
  if (!name || !clip) {
    actor.animationBuffer.set([0, 0, 0, 1]);
  } else {
    actor.animationBuffer.set([
      clip.fromRow,
      clip.fromRow + clip.frameCount - 1,
      Math.random() * Math.max(1, clip.frameCount - 1),
      clip.fps * (0.88 + Math.random() * 0.24),
    ]);
  }
  actor.emitHeaderDirty();
}

async function loadLiteAsset(
  engine: EngineContext,
  scene: SceneContext,
  source: string | ArrayBuffer,
  publishAppearance = false,
  sharedVat?: VatBakeResult,
  reverseWinding = false
): Promise<LoadedAsset> {
  const container =
    typeof source === 'string' && /\.babylon(?:[?#]|$)/i.test(source)
      ? await loadBabylon(engine, source)
      : await loadGltf(engine, source);
  const meshes = getContainerMeshes(container);
  if (reverseWinding) {
    for (const mesh of meshes) {
      (mesh as Mesh & { _reverseWinding?: boolean })._reverseWinding = true;
    }
  }
  const groups = chooseClips(container.animationGroups ?? []);
  const skinned = meshes.filter(mesh => !!mesh.skeleton);
  const vatHandles: VatHandle[] = [];
  let bakedVat: VatBakeResult[] = [];

  if (skinned.length && sharedVat) {
    for (const mesh of skinned) {
      if (mesh.skeleton?.boneCount !== sharedVat.boneCount) {
        throw new Error(
          `Head mesh "${mesh.name}" has ${mesh.skeleton?.boneCount ?? 0} joints; ` +
          `the body VAT has ${sharedVat.boneCount}.`
        );
      }
      vatHandles.push(attachVat(engine, mesh, sharedVat));
    }
    bakedVat = [sharedVat];
  } else if (skinned.length && groups.length) {
    bakedVat = bakeVatMany(
      engine,
      skinned.map(mesh => ({ mesh })),
      groups
    );
    for (let index = 0; index < skinned.length; index++) {
      vatHandles.push(attachVat(engine, skinned[index], bakedVat[index]));
    }
  }

  // VAT owns playback now; do not retain Lite's CPU skeleton tick in the scene.
  container.animationGroups = [];
  addToScene(scene, container);
  const root = container.entities.find(
    (entity): entity is SceneNode => 'worldMatrix' in entity
  );
  if (!root || !meshes.length) throw new Error('Loaded model contains no renderable hierarchy.');
  return {
    container,
    instances: new LiteHierarchyInstances(root, meshes, publishAppearance),
    vatHandles,
    vatInstanceCapacity: 0,
    bakedVat,
  };
}

const BASIS_RGBA32 = 13;
const BASIS_TRANSCODER_ROOT = 'https://cdn.babylonjs.com/basisTranscoder/1';
let basisModulePromise: Promise<any> | undefined;

async function basisModule(): Promise<any> {
  if (basisModulePromise) return basisModulePromise;
  basisModulePromise = new Promise((resolve, reject) => {
    const initialize = () => {
      const factory = (globalThis as { BASIS?: (options: object) => Promise<any> }).BASIS;
      if (!factory) return reject(new Error('Basis transcoder did not expose BASIS.'));
      factory({
        locateFile: (file: string) => `${BASIS_TRANSCODER_ROOT}/${file}`,
      }).then((module: any) => {
        module.initializeBasis();
        resolve(module);
      }, reject);
    };
    if ((globalThis as { BASIS?: unknown }).BASIS) return initialize();
    const script = document.createElement('script');
    script.src = `${BASIS_TRANSCODER_ROOT}/basis_transcoder.js`;
    script.async = true;
    script.onload = initialize;
    script.onerror = () => reject(new Error(`Failed to load ${script.src}`));
    document.head.appendChild(script);
  });
  basisModulePromise.catch(() => {
    basisModulePromise = undefined;
  });
  return basisModulePromise;
}

async function loadLiteArmorAtlas(
  engine: EngineContext,
  modelCode: string
): Promise<{ texture: Texture2DArray; layers: string[] }> {
  const root = '/shado/eq-demo/armor/';
  const [module, basisBytes, manifestBytes] = await Promise.all([
    basisModule(),
    fetchShadoBytes(`${root}${modelCode}.basis`),
    fetchShadoBytes(`${root}${modelCode}.json`),
  ]);
  const layers = JSON.parse(new TextDecoder().decode(manifestBytes)) as string[];
  const file = new module.BasisFile(new Uint8Array(basisBytes));
  try {
    const imageCount = file.getNumImages();
    if (!imageCount || imageCount !== layers.length || file.startTranscoding() === 0) {
      throw new Error(`${modelCode.toUpperCase()} armor atlas is invalid.`);
    }
    const width = file.getImageWidth(0, 0);
    const height = file.getImageHeight(0, 0);
    const texture = createTexture2DArray(engine, width, height, imageCount, {
      mipMaps: false,
      srgb: true,
    });
    const device = (engine as EngineContext & { _device: GPUDevice })._device;
    for (let layer = 0; layer < imageCount; layer++) {
      if (file.getImageWidth(layer, 0) !== width || file.getImageHeight(layer, 0) !== height) {
        throw new Error(`${modelCode.toUpperCase()} armor layers have inconsistent dimensions.`);
      }
      const size = file.getImageTranscodedSizeInBytes(layer, 0, BASIS_RGBA32);
      const pixels = new Uint8Array(size);
      if (file.transcodeImage(pixels, layer, 0, BASIS_RGBA32, 0, 1) === 0) {
        throw new Error(`${modelCode.toUpperCase()} armor layer ${layer} failed to transcode.`);
      }
      device.queue.writeTexture(
        { texture: texture.texture, origin: [0, 0, layer] },
        pixels,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 }
      );
    }
    return { texture, layers };
  } finally {
    file.close();
    file.delete();
  }
}

function liteArmorLayers(
  materialName: string,
  atlas: readonly string[],
  modelCode: string
): [number, number, number, number] {
  const match = materialName.toLowerCase().match(
    /^([a-z]{3})(ch|ua|fa|lg|hn|ft)(\d{2})(\d{2})$/
  );
  if (!match) return [-1, -1, -1, -1];
  const [, , piece, , sourceTexture] = match;
  const model = modelCode.toLowerCase();
  return [0, 1, 2, 3].map(armorClass => {
    for (let texture = Number(sourceTexture); texture >= 0; texture--) {
      const name =
        `${model}${piece}${String(armorClass).padStart(2, '0')}` +
        String(texture).padStart(2, '0');
      const layer = atlas.indexOf(name);
      if (layer >= 0) return layer;
    }
    return -1;
  }) as [number, number, number, number];
}

function attachLiteArmorMaterials(
  asset: LoadedAsset,
  atlas: Texture2DArray,
  layers: readonly string[],
  modelCode: string
): number {
  let attached = 0;
  const materials = new Set(
    getContainerMeshes(asset.container)
      .map(mesh => mesh.material)
      .filter(Boolean)
  );
  for (const sourceMaterial of materials) {
    const material = sourceMaterial as typeof sourceMaterial & { plugins?: MaterialPlugin[] };
    const layerSet = liteArmorLayers(material.name ?? '', layers, modelCode);
    if (layerSet.every(layer => layer < 0)) continue;
    const plugin: MaterialPlugin = {
      name: `eq-armor-${material.name ?? 'material'}`,
      getUniforms: () => ({
        ubo: [{ name: 'eqArmorLayers', type: 'vec4<f32>' }],
      }),
      writeUbo(data, offsets) {
        data.set(layerSet, (offsets.get('eqArmorLayers') ?? 0) / 4);
      },
      getSamplers: () => [{
        texture: 'eqArmorAtlas',
        sampler: 'eqArmorSampler',
        textureType: 'texture_2d_array<f32>',
      } as any],
      bindTextures: out => out.push({ texture: atlas }),
      getActiveTextures: out => out.push(atlas),
      getCustomCode: shaderType => shaderType === 'fragment'
        ? {
            CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
let eqArmorClass = clamp(i32(round((1.0 - input.vInstanceColor.r) * 1024.0)), 0, 3);
let eqArmorLayer = i32(material.eqArmorLayers[eqArmorClass]);
if (eqArmorLayer >= 0) {
  let eqArmorSurface = textureSampleLevel(
    eqArmorAtlas,
    eqArmorSampler,
    fract(input.uv),
    eqArmorLayer,
    0.0
  );
  baseColor = eqArmorSurface.rgb;
  alpha = eqArmorSurface.a * material.materialAlpha;
}`,
          }
        : null,
    };
    material.plugins = [...(material.plugins ?? []), plugin];
    attached++;
  }
  asset.armorAtlas = atlas;
  asset.armorMaterialCount = attached;
  return attached;
}

function mergeClips(assets: readonly LoadedAsset[]): Record<string, VatClip> {
  for (const asset of assets) {
    const clips = asset.vatHandles[0]?.clips;
    if (clips && Object.keys(clips).length) return clips;
  }
  return {};
}

function actorClip(pool: LitePool, actor: LiteActor): [string, VatClip] | undefined {
  return Object.entries(pool.clips).find(([, clip]) =>
    Math.abs(clip.fromRow - actor.animationBuffer[0]) < 0.01 &&
    Math.abs(clip.fromRow + clip.frameCount - 1 - actor.animationBuffer[1]) < 0.01
  );
}

function vatParams(actors: readonly LiteActor[]): Float32Array {
  const params = new Float32Array(actors.length * 4);
  for (let index = 0; index < actors.length; index++) {
    params.set(actors[index].animationBuffer, index * 4);
  }
  return params;
}

interface LiteNameplateProjection {
  x: number;
  y: number;
  fontSize: number;
  name: string;
  color: string;
}

function projectLiteNameplate(
  pool: LitePool,
  actor: LiteActor,
  viewProjection: Mat4,
  width: number,
  height: number
): LiteNameplateProjection | undefined {
  const x = actor.translation[0];
  const scale = Number.isFinite(actor.translation[3]) ? actor.translation[3] : 1;
  const storedLift = Number(actor.nameLiftWorld);
  const nameLift = Number.isFinite(storedLift)
    ? storedLift
    : pool.model.kind === 'npc'
      ? 2.5
      : 3.4;
  const y =
    actor.translation[1] +
    Math.max(1.8, nameLift * scale);
  const z = actor.translation[2];
  const clipX =
    viewProjection[0] * x +
    viewProjection[4] * y +
    viewProjection[8] * z +
    viewProjection[12];
  const clipY =
    viewProjection[1] * x +
    viewProjection[5] * y +
    viewProjection[9] * z +
    viewProjection[13];
  const clipZ =
    viewProjection[2] * x +
    viewProjection[6] * y +
    viewProjection[10] * z +
    viewProjection[14];
  const clipW =
    viewProjection[3] * x +
    viewProjection[7] * y +
    viewProjection[11] * z +
    viewProjection[15];
  if (clipW <= 0) return undefined;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const ndcZ = clipZ / clipW;
  if (ndcZ < 0 || ndcZ > 1 || Math.abs(ndcX) > 1.15 || Math.abs(ndcY) > 1.15) {
    return undefined;
  }
  const screenX = (ndcX * 0.5 + 0.5) * width;
  const screenY = (0.5 - ndcY * 0.5) * height;
  const fontSize = Math.max(9, Math.min(15, 19 / Math.sqrt(Math.max(1, clipW))));
  if (![screenX, screenY, fontSize].every(Number.isFinite)) return undefined;
  const name = actor.__showcaseName ?? pool.model.label;
  const storedColor = actor.nameplateColor;
  const color = [0, 1, 2, 3].map(index => {
    const channel = Number(storedColor?.[index]);
    return Number.isFinite(channel) ? channel : 1;
  });
  return {
    x: screenX,
    y: screenY,
    fontSize,
    name,
    color: `rgba(${Math.round(color[0] * 255)},${Math.round(
      color[1] * 255
    )},${Math.round(color[2] * 255)},${color[3]})`,
  };
}

async function createLiteShowcase(
  engine: EngineContext,
  scene: SceneContext,
  camera: ArcRotateCamera,
  canvas: HTMLCanvasElement
): Promise<{ controller: EqShowcaseController; dispose(): void }> {
  await ShadoLiteInstanceContainer.initialize(engine, {
    extra: EqLiteShowcaseActor,
    backend: 'storage',
    wasm: false,
  });

  const models: EqShowcaseModel[] = [
    ...EQ_SHOWCASE_MODELS.map(model => ({ ...model })),
    ...BABYLON_SHOWCASE_MODELS.map(model => ({ ...model })),
  ];
  const pools = new Map<string, LitePool>();
  const pending = new Map<string, Promise<LitePool>>();
  const failed = new Set<string>();
  const dropped = new Map<string, ArrayBuffer>();
  const selectionListeners = new Set<(selection: EqShowcaseSelection | undefined) => void>();
  const meshOwners = new Map<Mesh, LitePool>();
  const picker = createGpuPicker(scene);
  let selected: { pool: LitePool; actor: LiteActor } | undefined;
  let placementSerial = 0;
  let cullingRange = 600;
  let reducerAverageMs = 0;
  let disposed = false;
  let namesEnabled = true;
  enableMaterialPlugins(scene);
  const maxVatTextureDimension =
    (engine as EngineContext & { _device: GPUDevice })._device.limits.maxTextureDimension2D;
  const vatActorsPerModel = Math.floor(
    (maxVatTextureDimension * maxVatTextureDimension) / 2
  );
  const nameplateLayer = document.createElement('div');
  nameplateLayer.dataset.role = 'shado-lite-nameplates';
  nameplateLayer.style.cssText =
    'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:20';
  canvas.parentElement?.appendChild(nameplateLayer);
  const nameplateElements: HTMLSpanElement[] = [];
  const nameplateElement = (index: number): HTMLSpanElement => {
    let element = nameplateElements[index];
    if (element) return element;
    element = document.createElement('span');
    element.style.cssText =
      'position:absolute;left:0;top:0;display:none;white-space:nowrap;font-family:Inter,system-ui,sans-serif;font-weight:600;line-height:1;text-shadow:-1px -1px 0 rgba(4,8,14,.95),1px -1px 0 rgba(4,8,14,.95),-1px 1px 0 rgba(4,8,14,.95),1px 1px 0 rgba(4,8,14,.95);will-change:transform';
    nameplateLayer.appendChild(element);
    nameplateElements[index] = element;
    return element;
  };
  const stats: EqShowcaseStats = {
    loaded: 0,
    total: models.length,
    failed: 0,
    instances: 0,
    visible: 0,
    cullingRange,
    cullingMode: 'cpu',
    reducerMs: 0,
    reducerAverageMs: 0,
    vatActorsPerModel,
    loadedCodes: [],
  };

  const selectionRing = createTorus(engine, {
    diameter: 3.8,
    thickness: 0.16,
    tessellation: 64,
  });
  selectionRing.name = 'shado-lite-selected-instance';
  const ringMaterial = createStandardMaterial();
  ringMaterial.diffuseColor = [1, 0.35, 0.03];
  ringMaterial.emissiveColor = [1, 0.18, 0.01];
  ringMaterial.specularColor = [0, 0, 0];
  selectionRing.material = ringMaterial;
  selectionRing.pickable = false;
  selectionRing.visible = false;
  addToScene(scene, selectionRing);

  const publish = (patch: Partial<EqShowcaseStats> = {}) => {
    Object.assign(stats, patch, {
      total: models.length,
      loaded: pools.size,
      failed: failed.size,
      instances: [...pools.values()].reduce((sum, pool) => sum + pool.actors.instanceCount, 0),
      visible: [...pools.values()].reduce((sum, pool) => sum + pool.actors.getVisibleCount(), 0),
      cullingRange,
      loadedCodes: [...pools.keys()],
    });
    ui?.update({ ...stats });
  };

  const snapshot = (): EqShowcaseSelection | undefined => {
    if (!selected) return undefined;
    const { pool, actor } = selected;
    const index = pool.actors.children.indexOf(actor);
    if (index < 0) return undefined;
    const current = actorClip(pool, actor);
    const yaw = Math.atan2(
      2 * (actor.rotation[3] * actor.rotation[1] + actor.rotation[0] * actor.rotation[2]),
      1 - 2 * (actor.rotation[1] ** 2 + actor.rotation[2] ** 2)
    );
    const catalog = pool.model.catalog ?? (pool.model.custom ? 'custom' : 'shado');
    const published =
      catalog === 'shado' && pool.model.kind === 'pc'
        ? actor.getPublishedProperties().map((descriptor: ShadoPublishedProperty) => ({
            ...descriptor,
            value: actor.published.$get(descriptor.name),
          }))
        : [];
    return {
      modelCode: pool.model.code,
      modelLabel: pool.model.label,
      catalog,
      kind: pool.model.kind,
      index,
      name: actor.__showcaseName ?? `${pool.model.label} ${index + 1}`,
      position: {
        x: actor.translation[0],
        y: actor.translation[1],
        z: actor.translation[2],
      },
      scale: actor.translation[3],
      rotationDegrees: (yaw * 180) / Math.PI,
      animation: current?.[0] ?? '',
      animations: Object.keys(pool.clips).map(name => ({
        name,
        label: showcaseAnimationLabel(name),
      })),
      animationSpeed: current?.[1].fps ? actor.animationBuffer[3] / current[1].fps : 1,
      published,
    };
  };

  const notifySelection = () => {
    const value = snapshot();
    for (const listener of selectionListeners) listener(value);
  };

  const addActor = (
    pool: LitePool,
    initial = false,
    deferPublish = false
  ): LiteActor => {
    const actor = pool.actors.addInstance(true) as LiteActor;
    actor.__showcaseName = `${pool.model.label} ${pool.nextInstanceNumber++}`;
    actorMatrixPlacement(actor, pool.model, placementSerial++, initial);
    setRandomAnimation(actor, pool.clips);
    pool.revision++;
    selected ??= { pool, actor };
    if (!deferPublish) {
      pool.actors.showAll();
      notifySelection();
    }
    return actor;
  };

  const modelSources = async (model: EqShowcaseModel): Promise<Array<string | ArrayBuffer>> => {
    const custom = dropped.get(model.code);
    if (custom) return [custom];
    if (model.sourceUrl) return [model.sourceUrl];
    const urls = [`/shado/eq-demo/models/${model.code}.glb.gz`];
    urls.push(`/shado/eq-demo/models/${model.code}-head.glb.gz`);
    return Promise.all(urls.map(url => fetchShadoBytes(url)));
  };

  const loadModel = async (model: EqShowcaseModel): Promise<LitePool> => {
    const existing = pools.get(model.code);
    if (existing) return existing;
    const active = pending.get(model.code);
    if (active) return active;
    const promise = (async () => {
      publish({ current: `Babylon Lite VAT-baking ${model.label}`, lastError: undefined });
      const sources = await modelSources(model);
      const assets: LoadedAsset[] = [];
      for (const [index, source] of sources.entries()) {
        assets.push(await loadLiteAsset(
          engine,
          scene,
          source,
          index === 0 && model.kind === 'pc',
          index > 0 ? assets[0]?.bakedVat[0] : undefined,
          !model.custom && !model.sourceUrl
        ));
      }
      if (model.kind === 'pc' && !model.custom && !model.sourceUrl) {
        const armor = await loadLiteArmorAtlas(engine, model.code);
        attachLiteArmorMaterials(assets[0], armor.texture, armor.layers, model.code);
      }
      const actors = new ShadoLiteInstanceContainer<EqLiteShowcaseActor>(engine);
      const pool: LitePool = {
        model,
        actors,
        assets,
        clips: mergeClips(assets),
        nextInstanceNumber: 1,
        visibleActors: [],
        visibleSignature: '',
        revision: 1,
        publishedRevision: -1,
      };
      for (const asset of assets) {
        for (const mesh of getContainerMeshes(asset.container)) meshOwners.set(mesh, pool);
      }
      pools.set(model.code, pool);
      addActor(pool, true);
      dropped.delete(model.code);
      failed.delete(model.code);
      publish({ current: undefined, lastError: undefined });
      return pool;
    })()
      .catch(error => {
        failed.add(model.code);
        const message = error instanceof Error ? error.message : String(error);
        publish({ current: undefined, lastError: `${model.label}: ${message}` });
        throw error;
      })
      .finally(() => pending.delete(model.code));
    pending.set(model.code, promise);
    return promise;
  };

  const loadList = async (list: readonly EqShowcaseModel[]) => {
    // Stagger VAT baking to keep the render loop responsive while loading all.
    for (const model of list) {
      if (disposed) return;
      try {
        await loadModel(model);
      } catch (error) {
        console.error('[Shado Lite Showcase] model failed', model, error);
      }
    }
  };

  const controller: EqShowcaseController = {
    stats,
    models,
    get selected() {
      return snapshot();
    },
    loadAll: () => loadList(models.filter(model => model.catalog !== 'babylon')),
    loadKind: kind => loadList(models.filter(model => model.kind === kind && model.catalog !== 'babylon')),
    async loadModel(code) {
      const model = models.find(candidate => candidate.code === code);
      if (!model) throw new Error(`Unknown showcase model: ${code}`);
      await loadModel(model);
    },
    async addGlb(bytes, filename = 'Dropped model.glb') {
      const header = bytes.byteLength >= 12 ? new DataView(bytes, 0, 12) : undefined;
      if (!header || header.getUint32(0, true) !== 0x46546c67) {
        throw new Error('Only binary glTF 2.0 (.glb) files are supported.');
      }
      const label = filename.replace(/\.glb$/i, '').trim() || 'Dropped model';
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
      let code = `drop-${slug}`;
      for (let suffix = 2; models.some(model => model.code === code); suffix++) {
        code = `drop-${slug}-${suffix}`;
      }
      const model: EqShowcaseModel = {
        code,
        label,
        kind: 'pc',
        nameRace: 'human',
        scale: 1,
        custom: true,
        catalog: 'custom',
      };
      models.push(model);
      dropped.set(code, bytes);
      publish({ current: `Queued ${label}` });
      await loadModel(model);
      return code;
    },
    async addRandom(count = 1) {
      if (!pools.size) await loadModel(models[0]);
      const available = [...pools.values()];
      const additions = new Map<LitePool, number>();
      for (let index = 0; index < count; index++) {
        const pool = available[Math.floor(Math.random() * available.length)];
        additions.set(pool, (additions.get(pool) ?? 0) + 1);
      }
      for (const [pool, amount] of additions) {
        pool.actors.reserveInstances(pool.actors.instanceCount + amount);
        for (let index = 0; index < amount; index++) addActor(pool, false, true);
        pool.actors.showAll();
      }
      notifySelection();
      publish();
    },
    removeRandom() {
      const available = [...pools.values()].filter(pool => pool.actors.instanceCount > 0);
      const pool = available[Math.floor(Math.random() * available.length)];
      if (!pool) return;
      const index = Math.floor(Math.random() * pool.actors.instanceCount);
      const actor = pool.actors.children[index] as LiteActor;
      pool.actors.removeInstance(index);
      pool.revision++;
      if (selected?.actor === actor) selected = undefined;
      notifySelection();
      publish();
    },
    shuffle() {
      for (const pool of pools.values()) {
        for (const actor of pool.actors.children as readonly LiteActor[]) {
          actorMatrixPlacement(actor, pool.model, placementSerial++);
          setRandomAnimation(actor, pool.clips);
        }
        pool.revision++;
      }
      notifySelection();
    },
    setCullingRange(distance) {
      cullingRange = Number.isFinite(distance) ? Math.max(0, distance) : 600;
      publish();
    },
    setNameplatesEnabled(enabled) {
      namesEnabled = enabled;
      nameplateLayer.style.display = enabled ? 'block' : 'none';
    },
    setSelectedName(name) {
      if (!selected) return;
      const clean = name.trim().slice(0, 48);
      if (!clean) return;
      selected.actor.__showcaseName = clean;
      notifySelection();
    },
    setSelectedAnimation(name) {
      if (!selected) return;
      const clip = selected.pool.clips[name];
      if (!clip) return;
      selected.actor.animationBuffer.set([
        clip.fromRow,
        clip.fromRow + clip.frameCount - 1,
        0,
        clip.fps,
      ]);
      selected.actor.emitHeaderDirty();
      selected.pool.revision++;
      notifySelection();
    },
    setSelectedAnimationSpeed(multiplier) {
      if (!selected || !Number.isFinite(multiplier)) return;
      const current = actorClip(selected.pool, selected.actor);
      selected.actor.animationBuffer[3] =
        (current?.[1].fps ?? 30) * Math.max(0.1, Math.min(3, multiplier));
      selected.actor.emitHeaderDirty();
      selected.pool.revision++;
      notifySelection();
    },
    setSelectedTransform(patch: EqShowcaseTransformPatch) {
      if (!selected) return;
      const actor = selected.actor;
      if (Number.isFinite(patch.x)) actor.translation[0] = patch.x!;
      if (Number.isFinite(patch.y)) actor.translation[1] = patch.y!;
      if (Number.isFinite(patch.z)) actor.translation[2] = patch.z!;
      if (Number.isFinite(patch.scale)) actor.translation[3] = Math.max(0.01, patch.scale!);
      if (Number.isFinite(patch.rotationDegrees)) {
        const yaw = (patch.rotationDegrees! * Math.PI) / 180;
        actor.rotation.set([0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)]);
      }
      actor.emitHeaderDirty();
      selected.pool.revision++;
      notifySelection();
    },
    setSelectedPublished(name, value: ShadoPublishedScalar) {
      if (!selected) return;
      selected.actor.published.$set(name, value);
      selected.actor.emitHeaderDirty();
      selected.pool.revision++;
      notifySelection();
    },
    moveSelectedFromScreen(x, y) {
      if (!selected) return;
      void pickAsync(picker, x, y, {
        filter: mesh => mesh === ground,
      }).then(result => {
        if (!selected || !result.hit || !result.pickedPoint) return;
        selected.actor.translation[0] = result.pickedPoint[0];
        selected.actor.translation[2] = result.pickedPoint[2];
        selected.actor.emitHeaderDirty();
        selected.pool.revision++;
        notifySelection();
      });
    },
    subscribeSelection(listener) {
      selectionListeners.add(listener);
      listener(snapshot());
      return () => selectionListeners.delete(listener);
    },
    dispose() {
      disposed = true;
      selectionListeners.clear();
      for (const pool of pools.values()) pool.actors.dispose();
      pools.clear();
      dropped.clear();
    },
  };

  const ground = createGround(engine, {
    width: 2400,
    height: 2400,
    subdivisions: 1,
    uvScale: [112, 112],
  });
  ground.name = 'shado-showcase-plane';
  ground.position.y = -1;
  const groundMaterial = createStandardMaterial();
  groundMaterial.diffuseColor = [0.17, 0.24, 0.14];
  groundMaterial.specularColor = [0, 0, 0];
  ground.material = groundMaterial;
  addToScene(scene, ground);

  const ui = createShadoVatShowcaseUi(canvas, controller, {
    renderBackend: 'WebGPU',
    storageBackend: 'StorageBuffer',
    sample: () => ({
      fps: lastDeltaMs > 0 ? 1000 / lastDeltaMs : 0,
      frameMs: lastDeltaMs,
      gpuMs: engine.gpuFrameTimeMs || undefined,
    }),
  });

  let lastDeltaMs = 16.67;
  onBeforeRender(scene, deltaMs => {
    if (disposed) return;
    lastDeltaMs += (deltaMs - lastDeltaMs) * 0.15;
    const started = performance.now();
    const [cameraX, cameraY, cameraZ] = cameraPosition(camera);
    let totalVisible = 0;

    for (const pool of pools.values()) {
      const visible: LiteActor[] = [];
      const visibleIndices: number[] = [];
      for (let index = 0; index < pool.actors.children.length; index++) {
        const actor = pool.actors.children[index] as LiteActor;
        const dx = actor.translation[0] - cameraX;
        const dy = actor.translation[1] - cameraY;
        const dz = actor.translation[2] - cameraZ;
        if (cullingRange <= 0 || dx * dx + dy * dy + dz * dz <= cullingRange * cullingRange) {
          visible.push(actor);
          visibleIndices.push(index);
        }
      }
      pool.actors.applyVisibilityReduction(visibleIndices);
      totalVisible += visible.length;
      const signature = visibleIndices.join(',');
      if (pool.publishedRevision !== pool.revision || signature !== pool.visibleSignature) {
        pool.visibleActors = visible;
        pool.visibleSignature = signature;
        pool.publishedRevision = pool.revision;
        const params = vatParams(visible);
        for (const asset of pool.assets) {
          asset.instances.sync(visible);
          for (const handle of asset.vatHandles) handle.setInstances(params);
          if (visible.length > asset.vatInstanceCapacity) {
            let nextCapacity = Math.max(1, asset.vatInstanceCapacity);
            while (nextCapacity < visible.length) nextCapacity *= 2;
            asset.vatInstanceCapacity = nextCapacity;
            const materials = new Set(
              getContainerMeshes(asset.container)
                .map(mesh => mesh.material)
                .filter(Boolean)
            );
            for (const material of materials) {
              rebuildMaterial(scene, material, { rebuildFrameGraph: false });
            }
          }
        }
      }
      pool.actors.commit();
      for (const asset of pool.assets) {
        for (const handle of asset.vatHandles) handle.update(deltaMs * 0.001);
      }
    }

    if (namesEnabled) {
      const rect = canvas.getBoundingClientRect();
      const viewProjection = getViewProjectionMatrix(
        camera,
        Math.max(1, rect.width) / Math.max(1, rect.height)
      );
      const projections: LiteNameplateProjection[] = [];
      let nameplateBudget =
        totalVisible <= 250 ? totalVisible : totalVisible <= 1000 ? 64 : 24;
      if (selected && selected.pool.visibleActors.includes(selected.actor)) {
        const projection = projectLiteNameplate(
          selected.pool,
          selected.actor,
          viewProjection,
          rect.width,
          rect.height
        );
        if (projection) projections.push(projection);
        nameplateBudget--;
      }
      for (const pool of pools.values()) {
        for (const actor of pool.visibleActors) {
          if (actor === selected?.actor) continue;
          if (nameplateBudget-- <= 0) break;
          const projection = projectLiteNameplate(
            pool,
            actor,
            viewProjection,
            rect.width,
            rect.height
          );
          if (projection) projections.push(projection);
        }
      }
      for (let index = 0; index < projections.length; index++) {
        const projection = projections[index];
        const element = nameplateElement(index);
        element.textContent = projection.name;
        element.style.display = 'block';
        element.style.color = projection.color;
        element.style.fontSize = `${projection.fontSize}px`;
        element.style.transform = `translate3d(${projection.x}px,${projection.y}px,0) translate(-50%,-100%)`;
      }
      for (let index = projections.length; index < nameplateElements.length; index++) {
        nameplateElements[index].style.display = 'none';
      }
    }

    if (selected) {
      const selectedArmorClass = String(
        liteActorArmorClass(selected.actor)
      );
      const selectedArmorMaterials = String(
        selected.pool.assets.reduce(
          (count, asset) => count + (asset.armorMaterialCount ?? 0),
          0
        )
      );
      if (nameplateLayer.dataset.selectedArmorClass !== selectedArmorClass) {
        nameplateLayer.dataset.selectedArmorClass = selectedArmorClass;
      }
      if (nameplateLayer.dataset.selectedArmorMaterials !== selectedArmorMaterials) {
        nameplateLayer.dataset.selectedArmorMaterials = selectedArmorMaterials;
      }
      selectionRing.visible = true;
      selectionRing.position.set(
        selected.actor.translation[0],
        -0.9,
        selected.actor.translation[2]
      );
      const ringScale = Math.max(0.35, selected.actor.translation[3]);
      selectionRing.scaling.set(ringScale, ringScale, ringScale);
    } else {
      selectionRing.visible = false;
    }

    const reducerMs = performance.now() - started;
    reducerAverageMs =
      reducerAverageMs === 0
        ? reducerMs
        : reducerAverageMs + (reducerMs - reducerAverageMs) * 0.08;
    if (
      stats.visible !== totalVisible ||
      Math.abs(stats.reducerMs - reducerMs) > 0.05
    ) {
      publish({
        visible: totalVisible,
        reducerMs,
        reducerAverageMs,
      });
    } else {
      stats.reducerMs = reducerMs;
      stats.reducerAverageMs = reducerAverageMs;
    }
  });

  const onPick = (event: PointerEvent) => {
    if (event.shiftKey || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    void pickAsync(picker, event.clientX - rect.left, event.clientY - rect.top, {
      filter: mesh => meshOwners.has(mesh),
    }).then(result => {
      if (!result.hit || !result.pickedMesh || result.thinInstanceIndex < 0) return;
      const pool = meshOwners.get(result.pickedMesh as Mesh);
      const actor = pool?.visibleActors[result.thinInstanceIndex];
      if (!pool || !actor) return;
      selected = { pool, actor };
      notifySelection();
    });
  };
  canvas.addEventListener('pointerup', onPick);

  // Match the original landing page: three varied EQ models are ready on load.
  const starters = [models[0], models[9], models[28]].filter(Boolean);
  void loadList(starters);

  return {
    controller,
    dispose() {
      canvas.removeEventListener('pointerup', onPick);
      nameplateLayer.remove();
      ui.dispose();
      controller.dispose();
      disposePicker(picker);
    },
  };
}

/**
 * The default sandbox experience, rendered by Babylon Lite. It intentionally
 * keeps the same EQ roster, VAT controls, add/remove/shuffle actions, culling
 * diagnostics, GLB drop target, selection editor, camera, and environment as
 * the full-Babylon baseline.
 */
export async function startLitePlayground(
  canvas: HTMLCanvasElement
): Promise<LitePlaygroundHandle> {
  if (!navigator.gpu) throw new Error('Babylon Lite requires WebGPU.');

  const engine = await createEngine(canvas, {
    msaaSamples: 4,
    maxDevicePixelRatio: 2,
  });
  const scene = createSceneContext(engine);
  scene.clearColor = { r: 0.05, g: 0.08, b: 0.13, a: 1 };

  const camera = createDefaultCamera(scene);
  camera.alpha = -Math.PI / 2;
  camera.beta = 0.78;
  camera.radius = 54;
  camera.target.x = 0;
  camera.target.y = 1.4;
  camera.target.z = 0;
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 130;
  camera.wheelPrecision = 40;
  camera.panningSensibility = 55;
  const detachControls = attachControl(camera, canvas, scene);

  addToScene(scene, createHemisphericLight([0.25, 1, 0.1], 1.05));
  addToScene(scene, createDirectionalLight([-0.45, -1, 0.35], 0.65));
  if (isGpuTimingSupported(engine)) setGpuTimingEnabled(engine, true);

  const showcase = await createLiteShowcase(engine, scene, camera, canvas);
  await registerScene(scene);
  await startEngine(engine);

  const resize = () => resizeEngine(engine);
  window.addEventListener('resize', resize);
  (globalThis as any).__shadoLite = {
    engine,
    scene,
    controller: showcase.controller,
    renderer: 'babylon-lite',
  };

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('resize', resize);
      delete (globalThis as any).__shadoLite;
      showcase.dispose();
      detachControls();
      stopEngine(engine);
      disposeScene(scene);
      disposeEngine(engine);
    },
  };
}
