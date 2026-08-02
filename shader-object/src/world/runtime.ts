import { fetchShadoJson } from '../preprocess/runtime';
import type { ShadoWorldSpatialPackage } from './types';
import { validateShadoWorldPackage } from './validation';
import { validateShadoWorldAuthoring } from './authoring';
import type { ShadoWorldAuthoringDocument } from './types';

export async function deserializeShadoWorld(
  url: string,
  options: { fetch?: typeof fetch } = {}
): Promise<ShadoWorldSpatialPackage> {
  const world = await fetchShadoJson<ShadoWorldSpatialPackage>(url, options);
  try {
    validateShadoWorldPackage(world);
  } catch (error) {
    throw new Error(
      `Invalid Shado world spatial artifact at '${url}': ${(error as Error).message}`
    );
  }
  return world;
}

export async function deserializeShadoWorldAuthoring(
  url: string,
  expectedWorld?: string,
  options: { fetch?: typeof fetch } = {}
): Promise<ShadoWorldAuthoringDocument> {
  const document = await fetchShadoJson<ShadoWorldAuthoringDocument>(url, options);
  try {
    return validateShadoWorldAuthoring(document, expectedWorld);
  } catch (error) {
    throw new Error(
      `Invalid Shado world authoring document at '${url}': ${(error as Error).message}`
    );
  }
}

export type ShadoWorldObjectRenderBatch = {
  prototype: number;
  id: string;
  source: string;
  stampIndices: Uint32Array;
  /** Babylon-compatible column-major thin-instance matrices. */
  matrices: Float32Array;
  /** Per-stamp baked irradiance uploaded as Babylon thin-instance colors. */
  colors: Float32Array;
};

/**
 * Converts visible per-prototype stamp rows into upload-ready matrix buffers.
 * These are final Babylon-space matrices: consumers upload them verbatim and
 * must not apply legacy EQ/Requiem axis swaps or yaw inversion. Asset loading
 * remains a client policy; the package supplies the stable URL.
 */
export function buildShadoWorldObjectRenderBatches(
  world: ShadoWorldSpatialPackage,
  visibleByPrototype?: readonly ArrayLike<number>[]
): ShadoWorldObjectRenderBatch[] {
  const objects = world.objects;
  if (!objects) return [];
  return objects.prototypes.id.map((id, prototype) => {
    const first = objects.prototypes.firstStampRef[prototype];
    const count = objects.prototypes.stampRefCount[prototype];
    const sourceRows =
      visibleByPrototype?.[prototype] ??
      objects.prototypeStampRefs
        .slice(first, first + count)
        .filter(stamp => objects.stamps.enabled[stamp]);
    const stampIndices = Uint32Array.from(sourceRows);
    const matrices = new Float32Array(stampIndices.length * 16);
    const colors = new Float32Array(stampIndices.length * 4);
    stampIndices.forEach((stamp, index) => {
      writeStampMatrix(objects.stamps, stamp, matrices, index * 16);
      colors.set(
        [
          objects.stamps.irradianceR?.[stamp] ?? 1,
          objects.stamps.irradianceG?.[stamp] ?? 1,
          objects.stamps.irradianceB?.[stamp] ?? 1,
          objects.stamps.irradianceA?.[stamp] ?? 1,
        ],
        index * 4
      );
    });
    return {
      prototype,
      id,
      source: objects.prototypes.source[prototype],
      stampIndices,
      matrices,
      colors,
    };
  });
}

function writeStampMatrix(
  stamps: NonNullable<ShadoWorldSpatialPackage['objects']>['stamps'],
  stamp: number,
  target: Float32Array,
  offset: number
): void {
  const radians = Math.PI / 180;
  const halfRoll = stamps.rotationZ[stamp] * radians * 0.5;
  const halfPitch = stamps.rotationX[stamp] * radians * 0.5;
  const halfYaw = stamps.rotationY[stamp] * radians * 0.5;
  const sinRoll = Math.sin(halfRoll),
    cosRoll = Math.cos(halfRoll);
  const sinPitch = Math.sin(halfPitch),
    cosPitch = Math.cos(halfPitch);
  const sinYaw = Math.sin(halfYaw),
    cosYaw = Math.cos(halfYaw);
  const x = cosYaw * sinPitch * cosRoll + sinYaw * cosPitch * sinRoll;
  const y = sinYaw * cosPitch * cosRoll - cosYaw * sinPitch * sinRoll;
  const z = cosYaw * cosPitch * sinRoll - sinYaw * sinPitch * cosRoll;
  const w = cosYaw * cosPitch * cosRoll + sinYaw * sinPitch * sinRoll;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  const sx = stamps.scaleX[stamp],
    sy = stamps.scaleY[stamp],
    sz = stamps.scaleZ[stamp];
  target.set(
    [
      (1 - (yy + zz)) * sx,
      (xy + wz) * sx,
      (xz - wy) * sx,
      0,
      (xy - wz) * sy,
      (1 - (xx + zz)) * sy,
      (yz + wx) * sy,
      0,
      (xz + wy) * sz,
      (yz - wx) * sz,
      (1 - (xx + yy)) * sz,
      0,
      stamps.positionX[stamp],
      stamps.positionY[stamp],
      stamps.positionZ[stamp],
      1,
    ],
    offset
  );
}
