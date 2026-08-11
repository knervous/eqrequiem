export type ModelBounds = {
  min?: readonly number[];
  max?: readonly number[];
  center?: readonly number[];
};

/** Places the lowest point of a model on a floor-authored world anchor. */
export function floorAnchoredModelOffset(
  bounds: ModelBounds | null | undefined,
  scale: number,
): number {
  const minimumY = Number(bounds?.min?.[1]);
  if (!Number.isFinite(minimumY) || !Number.isFinite(scale)) return 0;
  return -minimumY * scale;
}

/**
 * Returns the model-local translation that makes its bounds share the center
 * of a physics capsule. Gameplay keeps the capsule at its simulated world
 * position; only the rendered model moves within that frame.
 *
 * Legacy EQ models are already centered around their origin, so their result
 * is approximately zero. Foot-origin models have a positive bounds center and
 * are lowered by that amount instead of riding on top of the capsule center.
 */
export function physicsCenteredModelOffset(
  bounds: ModelBounds | null | undefined,
  scale: number,
): number {
  if (!bounds || !Number.isFinite(scale)) return 0;

  const authoredCenterY = Number(bounds.center?.[1]);
  if (Number.isFinite(authoredCenterY)) return -authoredCenterY * scale;

  const minimumY = Number(bounds.min?.[1]);
  const maximumY = Number(bounds.max?.[1]);
  if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY)) return 0;
  return -((minimumY + maximumY) * 0.5) * scale;
}
