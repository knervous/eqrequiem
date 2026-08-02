import type {
  ShadoWorldFxCullProfile,
  ShadoWorldFxPattern,
  ShadoWorldSpatialPackage,
  WorldVec3,
} from './types';

const FX_PROFILES = new Set<ShadoWorldFxCullProfile>([
  'near-detail',
  'mid-atmosphere',
  'far-landmark',
  'always',
]);

export type ShadoWorldFxRegion = {
  region: number;
  id: string;
  name: string;
  center: WorldVec3;
  size: WorldVec3;
  radius: number;
  phaseMask: number;
  tags: string[];
  pattern: ShadoWorldFxPattern;
};

/**
 * Extracts cold effect metadata from authored `fx` regions. Positions and
 * conservative radii are returned as reducer-ready anchors; effect-specific
 * parameters remain outside Shado's hot visibility planes.
 */
export function extractShadoWorldFxRegions(
  world: ShadoWorldSpatialPackage
): ShadoWorldFxRegion[] {
  const output: ShadoWorldFxRegion[] = [];
  for (let region = 0; region < world.regions.id.length; region++) {
    if (world.regions.kind[region] !== 'fx' || !world.regions.enabled[region]) continue;
    const pattern = validatePattern(world.regions.id[region], world.regions.metadata[region]?.fx);
    const size: WorldVec3 = [
      world.regions.sizeX[region],
      world.regions.sizeY[region],
      world.regions.sizeZ[region],
    ];
    output.push({
      region,
      id: world.regions.id[region],
      name: world.regions.name[region],
      center: [
        world.regions.centerX[region],
        world.regions.centerY[region],
        world.regions.centerZ[region],
      ],
      size,
      radius: Math.hypot(size[0], size[1], size[2]) * 0.5,
      phaseMask: world.regions.phaseMask[region],
      tags: [...world.regions.tags[region]],
      pattern,
    });
  }
  return output;
}

function validatePattern(id: string, value: unknown): ShadoWorldFxPattern {
  const pattern = value as ShadoWorldFxPattern;
  if (
    !pattern ||
    pattern.version !== 1 ||
    typeof pattern.effect !== 'string' ||
    !pattern.effect.trim() ||
    !['point', 'volume', 'surface'].includes(pattern.placement) ||
    !pattern.culling ||
    !FX_PROFILES.has(pattern.culling.profile)
  ) {
    throw new Error(`FX region '${id}' has an invalid metadata.fx pattern`);
  }
  positiveOptional(pattern.culling.maxDistance, id, 'culling.maxDistance');
  positiveOptional(pattern.culling.fadeDistance, id, 'culling.fadeDistance');
  positiveOptional(pattern.culling.updateHz, id, 'culling.updateHz');
  positiveIntegerOptional(pattern.budget?.maximumInstances, id, 'budget.maximumInstances');
  positiveIntegerOptional(pattern.budget?.maximumDraws, id, 'budget.maximumDraws');
  return {
    ...pattern,
    culling: { ...pattern.culling },
    budget: pattern.budget ? { ...pattern.budget } : undefined,
    parameters: pattern.parameters ? { ...pattern.parameters } : undefined,
  };
}

function positiveOptional(value: number | undefined, id: string, field: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new Error(`FX region '${id}' ${field} must be positive`);
  }
}

function positiveIntegerOptional(
  value: number | undefined,
  id: string,
  field: string
): void {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new Error(`FX region '${id}' ${field} must be a positive integer`);
  }
}
