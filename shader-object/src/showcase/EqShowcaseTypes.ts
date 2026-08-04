import type { NameplateData } from '../extensions/NameplateData';
import type { ShadoActor } from '../extensions/ShadoActor';
import type { ShadoInstanceContainer } from '../extensions/ShadoInstanceContainer/ShadoInstanceContainer';
import type { ShadoPublishedProperty, ShadoPublishedScalar } from '../publish';

export type ShadoVatActorClass = typeof ShadoActor;
export type ShadoVatContainerClass = {
  new(engine: any): ShadoInstanceContainer<any>;
  initialize(engine: any, config?: any): Promise<any>;
};

export type EqShowcaseKind = 'pc' | 'npc';
export type EqShowcaseCatalog = 'shado' | 'babylon' | 'custom';
export type EqArmorClass = 'armorless' | 'leather' | 'chain' | 'plate';

export type EqShowcaseModel = {
  code: string;
  label: string;
  kind: EqShowcaseKind;
  nameRace: string;
  gender?: 'male' | 'female';
  scale: number;
  /** Runtime-selected safe clips for user-supplied GLBs. */
  ambientClips?: readonly string[];
  /** True when the model came from the shared UI drop zone. */
  custom?: boolean;
  /** Catalog grouping used by the compact showcase picker. */
  catalog?: EqShowcaseCatalog;
  /** Canonical Babylon Playground asset URL, in its native source format. */
  sourceUrl?: string;
};

export type EqShowcaseStats = {
  loaded: number;
  total: number;
  failed: number;
  instances: number;
  visible: number;
  cullingRange: number;
  cullingMode: 'wasm-simd' | 'cpu';
  /** Most recent complete visibility-reducer pass, in milliseconds. */
  reducerMs: number;
  /** Smoothed visibility-reducer time, in milliseconds. */
  reducerAverageMs: number;
  /** Theoretical per-model VAT actor ceiling exposed by the active device/layout. */
  vatActorsPerModel?: number;
  /**
   * Phase 3 pose palette, when one is active. `overflowed` above zero means
   * more actors were visible than the palette has slots, and the excess drew
   * the wrong pose — raise `vatPosePaletteCapacity` to the peak visible count.
   */
  posePalette?: {
    capacity: number;
    resolved: number;
    overflowed: number;
    peakOverflowed: number;
    megabytes: number;
  };
  loadedCodes: string[];
  current?: string;
  lastError?: string;
};

export type EqShowcaseOptions = {
  /** Babylon namespace used by the host. Pass global BABYLON in the online Playground. */
  babylon?: any;
  assetRoot?: string;
  weaponRoot?: string;
  /** Requiem Basis texture arrays and layer manifests for complete armor sets. */
  armorRoot?: string;
  autoLoad?: boolean;
  models?: readonly EqShowcaseModel[];
  /** Decorated actor schema used for every generated instance. */
  actorClass?: ShadoVatActorClass;
  /** Container class that selects the generated shader extension strategy. */
  containerClass?: ShadoVatContainerClass;
  fontAsset?: any;
  createNameplateLayer?: (
    scene: any,
    actors: ShadoInstanceContainer<any>,
    names: NameplateData,
    fontAsset: any
  ) => any;
  onStats?: (stats: EqShowcaseStats) => void;
  /** URL of the bundled Shado NullEngine worker. Enables fully off-thread VAT baking. */
  bakeWorkerUrl?: string;
  /**
   * Resolve each visible actor's pose into a bone palette once per frame, so
   * the vertex shader reads one pre-interpolated DQ per influence instead of
   * sampling the DQ atlas twice (phase 3). Per-actor clip and phase are
   * unaffected. WebGPU only; ignored elsewhere. Off by default.
   */
  vatPosePalette?: boolean;
  /** Palette slot capacity per pool. Actors past it pin to slot 0. Defaults to 4096. */
  vatPosePaletteCapacity?: number;
  /** Maximum GLBs baked in parallel. Defaults to available CPU capacity, capped at four. */
  bakeConcurrency?: number;
  /** Resident actor capacity reserved across loaded pools for scale runs. Defaults to one million. */
  instanceCapacityHint?: number;
  /** Main-thread mutation budget before a large addition yields to rendering. Defaults to 8 ms. */
  additionFrameBudgetMs?: number;
  /** Visibility reducer cadence while the camera moves. Defaults to 15 Hz. */
  cullingHz?: number;
  /** Maximum actor labels scattered into visible glyph streams. Defaults to 8192. */
  maxVisibleNameplates?: number;
  /** Optional world-aware reducer which replaces the default actor-only frustum pass. */
  reduceVisibility?: (
    container: ShadoInstanceContainer<any>,
    camera: any,
    baseRadius: number,
    maxDistance: number
  ) => void;
};

export type EqShowcaseAnimation = {
  name: string;
  label: string;
};

/** Friendly editor snapshot. Packed vectors and VAT frame bounds stay internal. */
export type EqShowcaseSelection = {
  modelCode: string;
  modelLabel: string;
  catalog: EqShowcaseCatalog;
  kind: EqShowcaseKind;
  index: number;
  name: string;
  position: { x: number; y: number; z: number };
  scale: number;
  rotationDegrees: number;
  animation: string;
  animations: readonly EqShowcaseAnimation[];
  animationSpeed: number;
  published: readonly (ShadoPublishedProperty & { value: ShadoPublishedScalar })[];
};

export type EqShowcaseTransformPatch = Partial<{
  x: number;
  y: number;
  z: number;
  scale: number;
  rotationDegrees: number;
}>;

export type EqShowcaseController = {
  readonly stats: EqShowcaseStats;
  readonly models: readonly EqShowcaseModel[];
  readonly selected: EqShowcaseSelection | undefined;
  loadAll(): Promise<void>;
  loadKind(kind: EqShowcaseKind): Promise<void>;
  loadModel(code: string): Promise<void>;
  /** Inspect, VAT-bake, and add a user-supplied animated binary glTF. */
  addGlb(bytes: ArrayBuffer, filename?: string): Promise<string>;
  addRandom(count?: number): Promise<void>;
  removeRandom(): void;
  shuffle(): void;
  setCullingRange(distance: number): void;
  setNameplatesEnabled(enabled: boolean): void;
  setSelectedName(name: string): void;
  setSelectedAnimation(name: string): void;
  setSelectedAnimationSpeed(multiplier: number): void;
  setSelectedTransform(patch: EqShowcaseTransformPatch): void;
  setSelectedPublished(name: string, value: ShadoPublishedScalar): void;
  moveSelectedFromScreen(x: number, y: number): void;
  subscribeSelection(listener: (selection: EqShowcaseSelection | undefined) => void): () => void;
  dispose(): void;
};

// Public, product-neutral aliases for examples and applications. The Eq names
// remain available for compatibility with the asset-specific implementation.
export type ShadoVatShowcaseModel = EqShowcaseModel;
export type ShadoVatShowcaseStats = EqShowcaseStats;
export type ShadoVatShowcaseSelection = EqShowcaseSelection;
export type ShadoVatShowcaseController = EqShowcaseController;
export type ShadoVatShowcaseOptions = EqShowcaseOptions;
