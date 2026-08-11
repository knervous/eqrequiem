import { Matrix, type DeepImmutable } from "@babylonjs/core";

export function createHeldItemBindTransform(
  socketBindTransform: DeepImmutable<Matrix>,
  runtimeScale: number,
  geometryOrientation: DeepImmutable<Matrix> = Matrix.IdentityReadOnly,
): Matrix {
  if (!Number.isFinite(runtimeScale) || runtimeScale <= 0) {
    throw new Error(`Invalid held-item runtime scale: ${runtimeScale}`);
  }
  return geometryOrientation
    .multiply(
      Matrix.Scaling(
        1 / runtimeScale,
        1 / runtimeScale,
        1 / runtimeScale,
      ),
    )
    .multiply(socketBindTransform);
}

// EQ shield sources are Z-up. Turn the shield in its X/Y ground plane without
// inverting source Z; weapons use their authored +X tip direction unchanged.
const PROMOTED_HUMAN_SHIELD_SOURCE_CORRECTION = Matrix.RotationZ(Math.PI);

/**
 * Aligns EQ-source held items to the promoted human's canonical Y-up sockets.
 * Weapons point their authored +X tip upward and slightly player-forward;
 * shields receive their separate outward-facing correction.
 *
 * Legacy races do not call this helper and retain ItemCache's compatibility
 * transform unchanged.
 */
export function heldItemGeometryTransform(attachmentKey: string): Matrix {
  if (attachmentKey === "shield_point") {
    // EQ shields are centered around their mesh origin. Move that center
    // outward so the inner rim, rather than the shield face, meets the palm.
    return PROMOTED_HUMAN_SHIELD_SOURCE_CORRECTION.multiply(
      Matrix.Translation(-0.9, 0, 0).multiply(
        Matrix.RotationX(Math.PI / 2),
      ),
    );
  }
  if (attachmentKey === "r_point" || attachmentKey === "l_point") {
    // Pitch source +X toward the socket's player-forward -Z axis before the
    // upright quarter-turn. Both hands then produce the same forward/up axis.
    return Matrix.RotationZ(-Math.PI / 12).multiply(
      Matrix.RotationY(-Math.PI / 2),
    );
  }
  return Matrix.Identity();
}

export function heldItemLocalYOffset(
  hasBindTransform: boolean,
  spawnScale: number,
): number {
  return hasBindTransform ? 0 : spawnScale * 0.5;
}
