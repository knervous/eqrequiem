import type { NameplateData } from '../extensions/NameplateData';
import type { ShadoPublishedProperty, ShadoPublishedScalar } from '../publish';
import type { EqShowcaseContainer } from './EqShowcaseActors';

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
  fontAsset?: any;
  createNameplateLayer?: (
    scene: any,
    actors: EqShowcaseContainer,
    names: NameplateData,
    fontAsset: any
  ) => any;
  onStats?: (stats: EqShowcaseStats) => void;
  /** URL of the bundled Shado NullEngine worker. Enables fully off-thread VAT baking. */
  bakeWorkerUrl?: string;
  /** Maximum GLBs baked in parallel. Defaults to available CPU capacity, capped at four. */
  bakeConcurrency?: number;
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
