import { BABYLON, type AbstractEngine, type Mesh, type Scene } from '../babylon';
import { Shado } from '../core/Shado';
import { field, gpuStruct, type PendingField } from '../decorators';
import { NameplateData, createMSDFNameplateLayer, type MSDFNameplateFontAsset } from '../msdf';
import type { InitializeConfig } from '../types';

export type ShadoDynamicEntityNameplateInput = {
  id: string;
  text: string;
  x: number;
  y: number;
  z?: number;
  visible?: boolean;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  billboard?: boolean;
};

export type ShadoDynamicEntityNameplateLayerOptions = {
  enabled?: boolean;
  fontAsset?: MSDFNameplateFontAsset;
  fontJsonUrl?: string;
  fontTextureUrl?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  padding?: number;
  worldScale?: number;
  zOffset?: number;
  nameLiftWorld?: number;
  renderingGroupId?: number;
  depthTest?: boolean;
  thickness?: number;
  debug?: boolean;
};

type DynamicNameplateRecord = {
  id: string;
  text: string;
  actor: ShadoDynamicNameplateActor;
};

const DEFAULT_FONT_JSON_URL = 'https://assets.babylonjs.com/fonts/roboto-regular.json';
const DEFAULT_FONT_TEXTURE_URL = 'https://assets.babylonjs.com/fonts/roboto-regular.png';
const DEFAULT_FONT_SIZE = 13;
const DEFAULT_COLOR = '#eef6ff';
const DEFAULT_WORLD_SCALE = 1 / 36;
const DEFAULT_Z_OFFSET = 0.35;
const DEFAULT_NAME_LIFT_WORLD = -0.65;

@gpuStruct({ name: 'ShadoDynamicNameplateActor', useWasm: false })
class ShadoDynamicNameplateActor extends Shado {
  @field('vec4') translation!: Float32Array;
  @field('u32') nameIndex!: number;
  @field('f32') nameWorldPerEM!: number;
  @field('f32') nameLiftWorld!: number;
  @field('vec4') nameplateColor!: Float32Array;
  @field('i32') visibleFlag!: number;
  @field('f32') billboardFlag!: number;
  @field('f32') padding1!: number;
  @field('f32') padding2!: number;

  public constructor(engine: AbstractEngine) {
    super(engine, true);
  }

  public initialize(): void {
    this.translation = new Float32Array([0, 0, 0, 1]);
    this.nameIndex = 0;
    this.nameWorldPerEM = DEFAULT_FONT_SIZE * DEFAULT_WORLD_SCALE;
    this.nameLiftWorld = DEFAULT_NAME_LIFT_WORLD;
    this.nameplateColor = new Float32Array([1, 1, 1, 1]);
    this.visibleFlag = 1;
    this.billboardFlag = 1;
    this.padding1 = 0;
    this.padding2 = 0;
  }
}

@gpuStruct({ name: 'ShadoDynamicNameplateContainer', useWasm: false })
class ShadoDynamicNameplateContainer extends Shado {
  @field('u32') visibleCount!: number;
  @field('u32') instancesCount!: number;

  private readonly records: DynamicNameplateRecord[] = [];

  public static override async initialize(
    engine: unknown,
    config: InitializeConfig = {}
  ): Promise<boolean> {
    const additionalFields: PendingField[] = [
      ...(config.additionalFields ?? []),
      { name: 'instances', type: { arrayOf: { structOf: ShadoDynamicNameplateActor } } },
    ];
    delete (this as any).__cachedSchema;
    return super.initialize(engine, {
      backend: 'datatex',
      wasm: false,
      ...config,
      additionalFields,
    });
  }

  public constructor(engine: AbstractEngine) {
    super(engine);
    this.visibleCount = 0;
    this.instancesCount = 0;
  }

  public get children(): ShadoDynamicNameplateActor[] {
    return this.records.map(record => record.actor);
  }

  public get instanceCount(): number {
    return this.records.length;
  }

  public addNameplate(
    id: string,
    text: string,
    nameplates: NameplateData
  ): ShadoDynamicNameplateActor {
    const actor = this.addStructToArray<ShadoDynamicNameplateActor>('instances');
    actor.initialize();
    actor.nameIndex = nameplates.addName(text);
    actor.emitHeaderDirty();
    this.records.push({ id, text, actor });
    this.instancesCount = this.records.length;
    this.visibleCount = this.records.length;
    return actor;
  }
}

const initByEngine = new WeakMap<AbstractEngine, Promise<void>>();

const ensureDynamicNameplateShado = (engine: AbstractEngine): Promise<void> => {
  let pending = initByEngine.get(engine);
  if (!pending) {
    pending = (async () => {
      await ShadoDynamicNameplateActor.initialize(engine, { wasm: false });
      await ShadoDynamicNameplateContainer.initialize(engine, { wasm: false });
      await NameplateData.initialize(engine, { wasm: false });
    })();
    initByEngine.set(engine, pending);
  }
  return pending;
};

const loadDefaultFontAsset = async (
  scene: Scene,
  fontJsonUrl: string,
  fontTextureUrl: string
): Promise<MSDFNameplateFontAsset> => {
  const response = await fetch(fontJsonUrl);
  if (!response.ok) {
    throw new Error(`Failed to load MSDF font json: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  const font = JSON.parse(text);
  const texture = new BABYLON.Texture(
    fontTextureUrl,
    scene,
    true,
    false,
    BABYLON.Texture.TRILINEAR_SAMPLINGMODE
  );
  const chars = new Map<number, { xadvance?: number }>();
  for (const char of Array.isArray(font.chars) ? font.chars : []) {
    if (typeof char?.id === 'number') {
      chars.set(char.id, char);
    }
  }
  const kerning = new Map<string, number>();
  for (const item of Array.isArray(font.kernings) ? font.kernings : []) {
    if (
      typeof item?.first === 'number' &&
      typeof item?.second === 'number' &&
      typeof item?.amount === 'number'
    ) {
      kerning.set(`${item.first}:${item.second}`, item.amount);
    }
  }
  return {
    textures: [texture],
    _font: font,
    _getChar: (code: number) => chars.get(code),
    _getKerning: (left: number, right: number) => kerning.get(`${left}:${right}`) ?? 0,
  } as MSDFNameplateFontAsset;
};

const rgbaFromColor = (value: string | undefined): [number, number, number, number] => {
  const fallback: [number, number, number, number] = [0.933, 0.965, 1, 1];
  if (!value) {
    return fallback;
  }
  const hex = value.trim();
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!match) {
    return fallback;
  }
  const rgb = match[1];
  const alpha = match[2] ?? 'ff';
  return [
    Number.parseInt(rgb.slice(0, 2), 16) / 255,
    Number.parseInt(rgb.slice(2, 4), 16) / 255,
    Number.parseInt(rgb.slice(4, 6), 16) / 255,
    Number.parseInt(alpha, 16) / 255,
  ];
};

const syncSignature = (inputs: readonly ShadoDynamicEntityNameplateInput[]): string =>
  inputs
    // Visibility is hot reducer output. Keep it out of the structural
    // signature so culling never rebuilds glyph buffers or GPU resources.
    .filter(input => input.text.trim())
    .map(input => `${input.id}\u0000${input.text.trim()}`)
    .sort()
    .join('\u0001');

export class ShadoDynamicEntityNameplateLayer {
  private readonly scene: Scene;
  private readonly engine: AbstractEngine;
  private enabled: boolean;
  private readyPromise: Promise<void> | null = null;
  private fontAsset: MSDFNameplateFontAsset | null = null;
  private ownsFontAsset = false;
  private container: ShadoDynamicNameplateContainer | null = null;
  private nameplates: NameplateData | null = null;
  private mesh: Mesh | null = null;
  private records = new Map<string, DynamicNameplateRecord>();
  private signature = '';
  private latestInputs: readonly ShadoDynamicEntityNameplateInput[] = [];
  private disposed = false;

  public constructor(
    scene: Scene,
    private options: ShadoDynamicEntityNameplateLayerOptions = {}
  ) {
    this.scene = scene;
    this.engine = scene.getEngine();
    this.enabled = options.enabled !== false;
  }

  public setOptions(options: ShadoDynamicEntityNameplateLayerOptions): void {
    const previousFontAsset = this.options.fontAsset;
    this.options = { ...this.options, ...options };
    this.enabled = this.options.enabled !== false;
    if (options.fontAsset && options.fontAsset !== previousFontAsset) {
      this.fontAsset = options.fontAsset;
      this.ownsFontAsset = false;
      this.rebuild(this.latestInputs);
    }
    this.mesh?.setEnabled(this.enabled);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.mesh?.setEnabled(enabled);
  }

  public sync(inputs: readonly ShadoDynamicEntityNameplateInput[]): void {
    this.latestInputs = inputs;
    if (this.disposed) {
      return;
    }
    void this.ensureReady()
      .then(() => {
        if (!this.disposed) {
          this.applySync(this.latestInputs);
        }
      })
      .catch(error => {
        if (this.options.debug) {
          // eslint-disable-next-line no-console
          console.warn('[shado/render] MSDF nameplates unavailable', error);
        }
      });
  }

  public dispose(): void {
    this.disposed = true;
    this.mesh?.dispose(false, false);
    this.container?.dispose();
    this.nameplates?.dispose();
    if (this.ownsFontAsset) {
      for (const texture of this.fontAsset?.textures ?? []) {
        texture.dispose();
      }
    }
    this.mesh = null;
    this.container = null;
    this.nameplates = null;
    this.fontAsset = null;
    this.records.clear();
  }

  private async ensureReady(): Promise<void> {
    this.readyPromise ??= (async () => {
      await ensureDynamicNameplateShado(this.engine);
      if (this.options.fontAsset) {
        this.fontAsset = this.options.fontAsset;
        this.ownsFontAsset = false;
      } else if (!this.fontAsset) {
        this.fontAsset = await loadDefaultFontAsset(
          this.scene,
          this.options.fontJsonUrl ?? DEFAULT_FONT_JSON_URL,
          this.options.fontTextureUrl ?? DEFAULT_FONT_TEXTURE_URL
        );
        this.ownsFontAsset = true;
      }
    })();
    await this.readyPromise;
  }

  private applySync(inputs: readonly ShadoDynamicEntityNameplateInput[]): void {
    const nextSignature = syncSignature(inputs);
    if (nextSignature !== this.signature) {
      this.rebuild(inputs);
      this.signature = nextSignature;
    }
    this.updateActors(inputs);
    this.mesh?.setEnabled(this.enabled && this.records.size > 0);
  }

  private rebuild(inputs: readonly ShadoDynamicEntityNameplateInput[]): void {
    if (!this.fontAsset || this.disposed) {
      return;
    }
    this.mesh?.dispose(false, false);
    this.container?.dispose();
    this.nameplates?.dispose();

    const filtered = inputs
      .filter(input => input.text.trim())
      .sort((a, b) => a.id.localeCompare(b.id));

    const nameplates = new NameplateData(this.engine, this.fontAsset);
    const container = new ShadoDynamicNameplateContainer(this.engine);
    const records = new Map<string, DynamicNameplateRecord>();
    for (const input of filtered) {
      const text = input.text.trim();
      const actor = container.addNameplate(input.id, text, nameplates);
      records.set(input.id, { id: input.id, text, actor });
    }
    nameplates.rebuildStreams(container.children);
    const mesh = createMSDFNameplateLayer(
      this.scene,
      container as any,
      nameplates as any,
      this.fontAsset,
      {
        renderingGroupId: this.options.renderingGroupId ?? 1,
        depthTest: this.options.depthTest ?? true,
        thickness: this.options.thickness,
        debug: this.options.debug,
      }
    );
    mesh.setEnabled(this.enabled && records.size > 0);

    this.container = container;
    this.nameplates = nameplates;
    this.mesh = mesh;
    this.records = records;
  }

  private updateActors(inputs: readonly ShadoDynamicEntityNameplateInput[]): void {
    const byId = new Map(inputs.map(input => [input.id, input]));
    for (const [id, record] of this.records) {
      const input = byId.get(id);
      const visible = Boolean(input && input.visible !== false && input.text.trim());
      const fontSize = Math.max(
        8,
        Number(input?.fontSize ?? this.options.fontSize ?? DEFAULT_FONT_SIZE)
      );
      const worldScale = Math.max(0.001, Number(this.options.worldScale ?? DEFAULT_WORLD_SCALE));
      const actor = record.actor;
      actor.visibleFlag = visible ? 1 : 0;
      if (input) {
        actor.translation.set([
          input.x,
          input.z ?? this.options.zOffset ?? DEFAULT_Z_OFFSET,
          input.y,
          1,
        ]);
        actor.nameWorldPerEM = fontSize * worldScale;
        actor.nameLiftWorld = Number(this.options.nameLiftWorld ?? DEFAULT_NAME_LIFT_WORLD);
        actor.nameplateColor.set(rgbaFromColor(input.color ?? this.options.color ?? DEFAULT_COLOR));
        actor.billboardFlag = input.billboard === false ? 0 : 1;
      }
      actor.emitHeaderDirty();
    }
    this.container?.arena.markDirty?.();
  }
}
