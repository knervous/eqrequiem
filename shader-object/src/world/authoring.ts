import {
  SHADO_WORLD_AUTHORING_EXTRAS_KEY,
  type ShadoWorldAuthoringDocument,
  type ShadoWorldObjectStamp,
  type ShadoWorldAuthoringRegion,
  type ShadoWorldRegionKind,
} from './types';

const REGION_KINDS = new Set([
  'visibility-cell', 'streaming', 'water', 'lava', 'safe',
  'zone-line', 'audio', 'trigger', 'semantic',
]);

export function createShadoWorldAuthoring(world: string): ShadoWorldAuthoringDocument {
  if (!world.trim()) throw new Error('World authoring requires a world name');
  return {
    kind: 'shado.world.authoring',
    version: 1,
    world,
    coordinateSystem: 'babylon-y-up',
    revision: 0,
    regions: [],
    objects: {
      prototypes: [],
      stamps: [],
    },
  };
}

export function validateShadoWorldAuthoring(
  value: unknown,
  expectedWorld?: string
): ShadoWorldAuthoringDocument {
  const document = value as ShadoWorldAuthoringDocument;
  if (
    !document || document.kind !== 'shado.world.authoring' || document.version !== 1 ||
    document.coordinateSystem !== 'babylon-y-up' || !Array.isArray(document.regions)
  ) {
    throw new Error('Unsupported Shado world authoring document');
  }
  if (!document.world || (expectedWorld && document.world !== expectedWorld)) {
    throw new Error(`World authoring target mismatch: expected '${expectedWorld}', got '${document.world}'`);
  }
  // Version 1 region-only documents remain loadable. The normalized object
  // planes are added in memory and included on the next editor save.
  document.objects ??= { prototypes: [], stamps: [] };
  if (!Array.isArray(document.objects.prototypes) || !Array.isArray(document.objects.stamps)) {
    throw new Error('World authoring objects require prototype and stamp arrays');
  }
  const ids = new Set<string>();
  document.regions.forEach((region, index) => validateRegion(region, index, ids));
  validateObjects(document);
  if (!Number.isInteger(document.revision) || document.revision < 0) {
    throw new Error('World authoring revision must be a non-negative integer');
  }
  return document;
}

export type LegacyZoneMetadataImportOptions = {
  objectSourcePrefix?: string;
  objectSourceExtension?: string;
  defaultObjectBoundsRadius?: number;
  /**
   * Requiem sidecars use Y-up axes, but their zone GLBs retain a root-X
   * reflection and ObjectCache consumed the opposite yaw convention. Shado
   * bakes both into final Babylon world space during preprocessing. Use
   * babylon-y-up only for metadata authored natively in final world space.
   */
  sourceCoordinateSystem?: 'requiem-y-up' | 'babylon-y-up';
};

export type LegacyZoneObjectTransform = {
  x?: number;
  y?: number;
  z?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
};

/**
 * Converts one legacy placement into Shado's durable Babylon-space contract.
 * Runtime consumers must use the returned values verbatim and must not repeat
 * the old ObjectCache yaw inversion.
 */
export function legacyZoneObjectTransformToBabylon(
  transform: LegacyZoneObjectTransform,
  sourceCoordinateSystem: 'requiem-y-up' | 'babylon-y-up' = 'requiem-y-up'
): Pick<ShadoWorldObjectStamp, 'position' | 'rotationDegrees' | 'scale'> {
  const uniformScale = finite(transform.scale, 1);
  return {
    // EQSage's Requiem export has already converted EQ Z-up positions to
    // Babylon Y-up before writing the JSON sidecar. Its zone GLB keeps the
    // historical X reflection on the root node, so bake that reflection into
    // promoted placements as well.
    position: [
      sourceCoordinateSystem === 'requiem-y-up'
        ? -finite(transform.x)
        : finite(transform.x),
      finite(transform.y),
      finite(transform.z),
    ],
    rotationDegrees: [
      finite(transform.rotateX),
      sourceCoordinateSystem === 'requiem-y-up'
        ? -finite(transform.rotateY)
        : finite(transform.rotateY),
      finite(transform.rotateZ),
    ],
    scale: [
      finite(transform.scaleX, uniformScale),
      finite(transform.scaleY, uniformScale),
      finite(transform.scaleZ, uniformScale),
    ],
  };
}

/**
 * Promotes the original Requiem zone JSON into durable authoring data. Render
 * models stay deduplicated as prototypes; each placement becomes a stable,
 * fully Babylon-space stamp. No coordinate conversion remains for the client.
 */
export function importLegacyZoneMetadata(
  value: unknown,
  world: string,
  options: LegacyZoneMetadataImportOptions = {}
): ShadoWorldAuthoringDocument {
  const legacy = value as {
    version?: number;
    objects?: Record<string, LegacyZoneObjectTransform[]>;
    regions?: Array<{
      minVertex?: number[];
      maxVertex?: number[];
      center?: number[];
      regionType?: number;
      zoneLineInfo?: unknown;
      [key: string]: unknown;
    }>;
    lights?: unknown[];
    sounds?: unknown[];
  };
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
    throw new Error('Legacy zone metadata must be a JSON object');
  }
  const document = createShadoWorldAuthoring(world);
  const prefix = (options.objectSourcePrefix ?? '/eqrequiem/objects').replace(/\/$/, '');
  const extension = options.objectSourceExtension ?? '/final.glb';
  const boundsRadius = positive(
    options.defaultObjectBoundsRadius ?? 32,
    'default object bounds radius'
  );
  const sourceCoordinateSystem = options.sourceCoordinateSystem ?? 'requiem-y-up';
  const objectEntries = Object.entries(legacy.objects ?? {})
    .filter(([, transforms]) => Array.isArray(transforms))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [model, transforms] of objectEntries) {
    const prototypeId = stableId(model, 'object');
    document.objects.prototypes.push({
      id: prototypeId,
      source: `${prefix}/${model}${extension}`,
      boundsRadius,
      metadata: {
        legacyModel: model,
        sourceCoordinateSystem,
        generatedAsset: 'final.glb',
      },
    });
    transforms.forEach((transform, index) => {
      const normalized = legacyZoneObjectTransformToBabylon(
        transform,
        sourceCoordinateSystem
      );
      document.objects.stamps.push({
        id: `${prototypeId}-${index}`,
        prototype: prototypeId,
        enabled: true,
        ...normalized,
        phaseMask: 0xffffffff,
        tags: [],
        metadata: {
          legacyIndex: index,
          sourceCoordinateSystem,
          transformNormalizedAtPreprocess: true,
          positionMirroredAtPreprocess: true,
        },
      });
    });
  }
  for (const [index, region] of (legacy.regions ?? []).entries()) {
    const min = vec3(region.minVertex);
    const max = vec3(region.maxVertex);
    const sourceCenter: [number, number, number] = region.center?.length === 3
      ? vec3(region.center)
      : [
          (min[0] + max[0]) * 0.5,
          (min[1] + max[1]) * 0.5,
          (min[2] + max[2]) * 0.5,
        ];
    const center: [number, number, number] = [
      sourceCoordinateSystem === 'requiem-y-up' ? -sourceCenter[0] : sourceCenter[0],
      sourceCenter[1],
      sourceCenter[2],
    ];
    const size: [number, number, number] = [
      Math.max(0.01, Math.abs(max[0] - min[0])),
      Math.max(0.01, Math.abs(max[1] - min[1])),
      Math.max(0.01, Math.abs(max[2] - min[2])),
    ];
    document.regions.push({
      id: `legacy-region-${index}`,
      name: `Legacy region ${index}`,
      kind: legacyRegionKind(Number(region.regionType)),
      enabled: true,
      center,
      size,
      phaseMask: 0xffffffff,
      tags: ['legacy'],
      metadata: {
        legacyRegionType: Number(region.regionType) || 0,
        zoneLineInfo: region.zoneLineInfo ?? null,
        sourceCoordinateSystem,
        positionMirroredAtPreprocess: true,
      },
    });
  }
  return validateShadoWorldAuthoring(document, world);
}

/**
 * One-time upgrade for editor documents saved before Requiem's GLB root-X
 * reflection was baked into object and region positions.
 */
export function upgradeShadoWorldAuthoring(
  value: unknown,
  expectedWorld?: string
): ShadoWorldAuthoringDocument {
  const document = cloneShadoWorldAuthoring(
    validateShadoWorldAuthoring(value, expectedWorld)
  );
  for (const prototype of document.objects.prototypes) {
    const legacyModel =
      typeof prototype.metadata.legacyModel === 'string'
        ? prototype.metadata.legacyModel
        : undefined;
    if (!legacyModel) continue;
    prototype.source = catalogSourceForLegacyPrototype(prototype.source, legacyModel);
    prototype.metadata.generatedAsset = 'final.glb';
    prototype.metadata.sourceCoordinateSystem = 'requiem-y-up';
  }
  for (const stamp of document.objects.stamps) {
    if (
      Number.isInteger(stamp.metadata.legacyIndex) &&
      stamp.metadata.positionMirroredAtPreprocess !== true
    ) {
      stamp.position[0] = -stamp.position[0];
      stamp.metadata.positionMirroredAtPreprocess = true;
      stamp.metadata.transformNormalizedAtPreprocess = true;
      stamp.metadata.sourceCoordinateSystem = 'requiem-y-up';
    }
  }
  for (const region of document.regions) {
    if (
      region.tags.includes('legacy') &&
      region.metadata.positionMirroredAtPreprocess !== true
    ) {
      region.center[0] = -region.center[0];
      region.metadata.positionMirroredAtPreprocess = true;
      region.metadata.sourceCoordinateSystem = 'requiem-y-up';
    }
  }
  return validateShadoWorldAuthoring(document, expectedWorld);
}

/**
 * Reconciles newly discovered legacy sidecar rows into an editable authoring
 * document. Existing stamps and regions win so editor changes are never
 * overwritten; newly added metadata rows are picked up on every conversion.
 */
export function mergeLegacyZoneMetadata(
  authoringValue: unknown,
  legacyValue: unknown,
  world: string,
  options: LegacyZoneMetadataImportOptions = {}
): ShadoWorldAuthoringDocument {
  const document = upgradeShadoWorldAuthoring(authoringValue, world);
  const promoted = importLegacyZoneMetadata(legacyValue, world, options);
  const prototypeIds = new Set(document.objects.prototypes.map(item => item.id));
  for (const prototype of promoted.objects.prototypes) {
    const existing = document.objects.prototypes.find(item => item.id === prototype.id);
    if (!existing) {
      document.objects.prototypes.push(prototype);
      prototypeIds.add(prototype.id);
      continue;
    }
    // Asset routing is generated state and should follow the latest catalog.
    existing.source = prototype.source;
    existing.metadata = { ...existing.metadata, ...prototype.metadata };
  }
  const stampIds = new Set(document.objects.stamps.map(item => item.id));
  for (const stamp of promoted.objects.stamps) {
    if (stampIds.has(stamp.id) || !prototypeIds.has(stamp.prototype)) continue;
    document.objects.stamps.push(stamp);
    stampIds.add(stamp.id);
  }
  const regionIds = new Set(document.regions.map(item => item.id));
  for (const region of promoted.regions) {
    if (regionIds.has(region.id)) continue;
    document.regions.push(region);
    regionIds.add(region.id);
  }
  return validateShadoWorldAuthoring(document, world);
}

function catalogSourceForLegacyPrototype(source: string, model: string): string {
  const match = source.match(/^(.*\/objects)(?:\/|$)/i);
  const prefix = match?.[1] ?? '/eqrequiem/objects';
  return `${prefix}/${model}/final.glb`;
}

export function cloneShadoWorldAuthoring(
  document: ShadoWorldAuthoringDocument
): ShadoWorldAuthoringDocument {
  return JSON.parse(JSON.stringify(document)) as ShadoWorldAuthoringDocument;
}

export function shadoWorldAuthoringExtras(
  document: ShadoWorldAuthoringDocument
): Record<string, ShadoWorldAuthoringDocument> {
  validateShadoWorldAuthoring(document);
  return { [SHADO_WORLD_AUTHORING_EXTRAS_KEY]: cloneShadoWorldAuthoring(document) };
}

export function authoringFromGltfExtras(
  extras: Record<string, unknown> | undefined,
  expectedWorld?: string
): ShadoWorldAuthoringDocument | undefined {
  const value = extras?.[SHADO_WORLD_AUTHORING_EXTRAS_KEY];
  return value === undefined ? undefined : validateShadoWorldAuthoring(value, expectedWorld);
}

function validateRegion(region: ShadoWorldAuthoringRegion, index: number, ids: Set<string>): void {
  if (!region?.id?.trim() || ids.has(region.id)) {
    throw new Error(`Region ${index} has a missing or duplicate stable ID '${region?.id ?? ''}'`);
  }
  ids.add(region.id);
  if (!REGION_KINDS.has(region.kind)) throw new Error(`Region '${region.id}' has invalid kind '${region.kind}'`);
  if (typeof region.name !== 'string') throw new Error(`Region '${region.id}' requires a name`);
  if (typeof region.enabled !== 'boolean') throw new Error(`Region '${region.id}' requires enabled state`);
  validateVec3(region.center, `Region '${region.id}' center`, false);
  validateVec3(region.size, `Region '${region.id}' size`, true);
  if (!Number.isInteger(region.phaseMask) || region.phaseMask < 0 || region.phaseMask > 0xffffffff) {
    throw new Error(`Region '${region.id}' has an invalid phase mask`);
  }
  if (!Array.isArray(region.tags) || region.tags.some(tag => typeof tag !== 'string')) {
    throw new Error(`Region '${region.id}' tags must be strings`);
  }
  if (!region.metadata || Array.isArray(region.metadata) || typeof region.metadata !== 'object') {
    throw new Error(`Region '${region.id}' metadata must be an object`);
  }
}

function validateObjects(document: ShadoWorldAuthoringDocument): void {
  const prototypeIds = new Set<string>();
  document.objects.prototypes.forEach((prototype, index) => {
    if (!prototype?.id?.trim() || prototypeIds.has(prototype.id)) {
      throw new Error(`Object prototype ${index} has a missing or duplicate stable ID`);
    }
    prototypeIds.add(prototype.id);
    if (!prototype.source?.trim()) {
      throw new Error(`Object prototype '${prototype.id}' requires a source`);
    }
    if (!Number.isFinite(prototype.boundsRadius) || prototype.boundsRadius <= 0) {
      throw new Error(`Object prototype '${prototype.id}' requires a positive bounds radius`);
    }
    validateMetadata(prototype.metadata, `Object prototype '${prototype.id}'`);
  });
  const stampIds = new Set<string>();
  document.objects.stamps.forEach((stamp: ShadoWorldObjectStamp, index) => {
    if (!stamp?.id?.trim() || stampIds.has(stamp.id)) {
      throw new Error(`Object stamp ${index} has a missing or duplicate stable ID`);
    }
    stampIds.add(stamp.id);
    if (!prototypeIds.has(stamp.prototype)) {
      throw new Error(`Object stamp '${stamp.id}' references unknown prototype '${stamp.prototype}'`);
    }
    if (typeof stamp.enabled !== 'boolean') {
      throw new Error(`Object stamp '${stamp.id}' requires enabled state`);
    }
    validateVec3(stamp.position, `Object stamp '${stamp.id}' position`, false);
    validateVec3(stamp.rotationDegrees, `Object stamp '${stamp.id}' rotation`, false);
    validateVec3(stamp.scale, `Object stamp '${stamp.id}' scale`, true);
    if (!Number.isInteger(stamp.phaseMask) || stamp.phaseMask < 0 || stamp.phaseMask > 0xffffffff) {
      throw new Error(`Object stamp '${stamp.id}' has an invalid phase mask`);
    }
    if (!Array.isArray(stamp.tags) || stamp.tags.some(tag => typeof tag !== 'string')) {
      throw new Error(`Object stamp '${stamp.id}' tags must be strings`);
    }
    validateMetadata(stamp.metadata, `Object stamp '${stamp.id}'`);
  });
}

function validateMetadata(value: unknown, label: string): void {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} metadata must be an object`);
  }
}

function stableId(value: string, fallback: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
  return value;
}

function vec3(value: ArrayLike<unknown> | undefined): [number, number, number] {
  return [finite(value?.[0]), finite(value?.[1]), finite(value?.[2])];
}

function legacyRegionKind(type: number): ShadoWorldRegionKind {
  if (type === 1 || type === 5 || type === 6) return 'water';
  if (type === 2) return 'lava';
  if (type === 4) return 'zone-line';
  return 'semantic';
}

function validateVec3(value: unknown, label: string, positive: boolean): void {
  if (
    !Array.isArray(value) || value.length !== 3 ||
    value.some(component => !Number.isFinite(component) || (positive && component <= 0))
  ) {
    throw new Error(`${label} must be a finite${positive ? ' positive' : ''} vec3`);
  }
}
