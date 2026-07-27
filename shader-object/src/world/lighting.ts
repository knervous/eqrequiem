import type { ShadoWorldPrimitive, ShadoWorldSpatialPackage } from './types';
import { validateShadoWorldPackage } from './validation';

export const DEFAULT_ZONE_LIGHTING_DAY_KEYFRAMES = [
  { phase: 0, name: 'night' },
  { phase: 0.25, name: 'dawn' },
  { phase: 0.5, name: 'noon' },
  { phase: 0.75, name: 'dusk' },
] as const;

export type ShadoWorldLightingDayKeyframe = {
  phase: number;
  name: string;
};

export type ShadoWorldLightingBuildOptions = {
  encoding?: 'rgbm';
  pageSize?: 512 | 1024 | 2048;
  texelsPerMeter?: number;
  dayKeyframes?: readonly ShadoWorldLightingDayKeyframe[];
};

export type ShadoWorldLightingBuildManifest = {
  kind: 'shado.world.lighting-build';
  version: 1;
  zone: string;
  coordinateSystem: 'babylon-y-up';
  status: 'ready-for-bake' | 'blocked-missing-uv2';
  encoding: 'rgbm';
  dayKeyframes: ShadoWorldLightingDayKeyframe[];
  dependencies: {
    worldLayoutHash: string;
    geometryHash: string;
    uv2Hash: string;
    materialHash: string;
    dayRigHash: string;
    plannerVersion: 'shado-zone-lighting-plan-v1';
  };
  chunks: Array<{
    id: string;
    renderChunk: number;
    primitive: number;
    primitiveName: string;
    material: string;
    vertexCount: number;
    uv2: {
      present: boolean;
      coordinateCount: number;
    };
    atlas: {
      pageSize: 512 | 1024 | 2048;
      texelsPerMeter: number;
    };
    outputs: {
      staticMap: string;
      dayMaps: string[];
      nightLightMap: string;
    };
  }>;
};

/**
 * Builds the deterministic hand-off between zone preprocessing and an
 * external GI/lightmap baker. It deliberately emits no baked-lighting runtime
 * manifest: that artifact is only valid after every referenced output exists.
 */
export function buildShadoWorldLightingManifest(
  world: ShadoWorldSpatialPackage,
  primitives: readonly ShadoWorldPrimitive[],
  options: ShadoWorldLightingBuildOptions = {}
): ShadoWorldLightingBuildManifest {
  validateShadoWorldPackage(world);
  if (primitives.length !== world.primitives.length) {
    throw new Error(
      `World lighting primitive mismatch: expected ${world.primitives.length}, got ${primitives.length}`
    );
  }

  const encoding = options.encoding ?? 'rgbm';
  const pageSize = options.pageSize ?? 1024;
  const texelsPerMeter = positive(options.texelsPerMeter ?? 8, 'texelsPerMeter');
  const dayKeyframes = normalizeDayKeyframes(
    options.dayKeyframes ?? DEFAULT_ZONE_LIGHTING_DAY_KEYFRAMES
  );
  const chunks = world.renderChunks.primitive.map((primitiveId, renderChunk) => {
    const primitive = primitives[primitiveId];
    if (!primitive) {
      throw new Error(
        `World lighting render chunk ${renderChunk} references primitive ${primitiveId}`
      );
    }
    const vertexCount = primitive.positions.length / 3;
    const lightmapUvs = primitive.lightmapUvs;
    if (lightmapUvs && lightmapUvs.length !== vertexCount * 2) {
      throw new Error(
        `World lighting primitive '${primitive.name}' UV2 requires ${vertexCount * 2} coordinates,` +
          ` got ${lightmapUvs.length}`
      );
    }
    if (lightmapUvs) {
      for (let index = 0; index < lightmapUvs.length; index++) {
        if (!Number.isFinite(Number(lightmapUvs[index]))) {
          throw new Error(
            `World lighting primitive '${primitive.name}' UV2 contains a non-finite value`
          );
        }
      }
    }
    const id = `chunk_${renderChunk.toString().padStart(3, '0')}`;
    return {
      id,
      renderChunk,
      primitive: primitiveId,
      primitiveName: primitive.name,
      material: world.materials[world.renderChunks.material[renderChunk]],
      vertexCount,
      uv2: {
        present: Boolean(lightmapUvs),
        coordinateCount: lightmapUvs?.length ?? 0,
      },
      atlas: { pageSize, texelsPerMeter },
      outputs: {
        staticMap: `lightmaps/${id}_static.ktx2`,
        dayMaps: dayKeyframes.map((_, keyframe) => `lightmaps/${id}_day_${keyframe}.ktx2`),
        nightLightMap: `lightmaps/${id}_night_lights.ktx2`,
      },
    };
  });

  const manifest: ShadoWorldLightingBuildManifest = {
    kind: 'shado.world.lighting-build',
    version: 1,
    zone: world.name,
    coordinateSystem: 'babylon-y-up',
    status: chunks.every(chunk => chunk.uv2.present) ? 'ready-for-bake' : 'blocked-missing-uv2',
    encoding,
    dayKeyframes,
    dependencies: {
      worldLayoutHash: world.integrity.layoutHash,
      geometryHash: hashArrays(
        primitives.flatMap(primitive => [primitive.positions, primitive.indices])
      ),
      uv2Hash: hashArrays(primitives.map(primitive => primitive.lightmapUvs ?? [])),
      materialHash: hashStrings(primitives.map(primitive => primitive.material || '__default')),
      dayRigHash: hashStrings(dayKeyframes.map(keyframe => `${keyframe.phase}:${keyframe.name}`)),
      plannerVersion: 'shado-zone-lighting-plan-v1',
    },
    chunks,
  };
  validateShadoWorldLightingManifest(manifest);
  return manifest;
}

export function validateShadoWorldLightingManifest(
  manifest: ShadoWorldLightingBuildManifest
): void {
  if (
    manifest.kind !== 'shado.world.lighting-build' ||
    manifest.version !== 1 ||
    manifest.coordinateSystem !== 'babylon-y-up' ||
    !manifest.zone ||
    manifest.encoding !== 'rgbm' ||
    !['ready-for-bake', 'blocked-missing-uv2'].includes(manifest.status)
  ) {
    throw new Error('Unsupported Shado world lighting build manifest');
  }
  normalizeDayKeyframes(manifest.dayKeyframes);
  const ids = new Set<string>();
  manifest.chunks.forEach((chunk, index) => {
    if (
      chunk.renderChunk !== index ||
      !Number.isInteger(chunk.primitive) ||
      chunk.primitive < 0 ||
      !chunk.primitiveName ||
      !chunk.material ||
      !Number.isInteger(chunk.vertexCount) ||
      chunk.vertexCount <= 0 ||
      chunk.uv2.coordinateCount !== (chunk.uv2.present ? chunk.vertexCount * 2 : 0) ||
      ![512, 1024, 2048].includes(chunk.atlas.pageSize) ||
      !Number.isFinite(chunk.atlas.texelsPerMeter) ||
      chunk.atlas.texelsPerMeter <= 0 ||
      chunk.outputs.dayMaps.length !== manifest.dayKeyframes.length
    ) {
      throw new Error(`Invalid Shado world lighting chunk ${index}`);
    }
    if (ids.has(chunk.id)) {
      throw new Error(`Duplicate Shado world lighting chunk ID '${chunk.id}'`);
    }
    ids.add(chunk.id);
  });
  const ready = manifest.chunks.every(chunk => chunk.uv2.present);
  if (ready !== (manifest.status === 'ready-for-bake')) {
    throw new Error('Shado world lighting readiness does not match UV2 inputs');
  }
  Object.entries(manifest.dependencies).forEach(([name, value]) => {
    if (name === 'plannerVersion') return;
    if (!/^[0-9a-f]{8}$/.test(value)) {
      throw new Error(`Invalid Shado world lighting dependency hash '${name}'`);
    }
  });
}

function normalizeDayKeyframes(
  keyframes: readonly ShadoWorldLightingDayKeyframe[]
): ShadoWorldLightingDayKeyframe[] {
  if (keyframes.length < 2) {
    throw new Error('World lighting requires at least two day keyframes');
  }
  const normalized = keyframes.map(keyframe => ({
    phase: Number(keyframe.phase),
    name: String(keyframe.name),
  }));
  normalized.forEach((keyframe, index) => {
    if (
      !Number.isFinite(keyframe.phase) ||
      keyframe.phase < 0 ||
      keyframe.phase >= 1 ||
      !keyframe.name ||
      (index > 0 && keyframe.phase <= normalized[index - 1].phase)
    ) {
      throw new Error(`Invalid world lighting day keyframe ${index}`);
    }
  });
  return normalized;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`World lighting ${label} must be positive`);
  }
  return value;
}

function hashArrays(arrays: readonly ArrayLike<number>[]): string {
  let hash = 0x811c9dc5;
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  arrays.forEach(values => {
    view.setUint32(0, values.length, true);
    hash = feedHash(hash, bytes.subarray(0, 4));
    for (let index = 0; index < values.length; index++) {
      view.setFloat64(0, Number(values[index]), true);
      hash = feedHash(hash, bytes);
    }
  });
  return hash.toString(16).padStart(8, '0');
}

function hashStrings(values: readonly string[]): string {
  let hash = 0x811c9dc5;
  const encoder = new TextEncoder();
  values.forEach(value => {
    hash = feedHash(hash, encoder.encode(value));
    hash = feedHash(hash, new Uint8Array([0]));
  });
  return hash.toString(16).padStart(8, '0');
}

function feedHash(hash: number, bytes: Uint8Array): number {
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
