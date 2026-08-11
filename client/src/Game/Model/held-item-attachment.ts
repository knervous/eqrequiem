import { Matrix, Vector3, type DeepImmutable } from "@babylonjs/core";

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

// Keep the authored +X blade tip on the upward quarter-turn, then roll each
// mirrored hand around its grip axis so the blade leans across the front of
// the idle pose rather than behind it. These axes are the promoted rig's
// canonical idle hand-up axes expressed in each socket's local space.
const PROMOTED_HUMAN_WEAPON_UPRIGHT = Matrix.RotationZ(
  Math.PI / 12,
).multiply(Matrix.RotationY(-Math.PI / 2));
const PROMOTED_HUMAN_WEAPON_FACING_AXIS = {
  l_point: new Vector3(0.420287959, 0.058386742, 0.90551037),
  r_point: new Vector3(-0.420287721, 0.058386354, 0.905510494),
} as const;

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
    return PROMOTED_HUMAN_WEAPON_UPRIGHT.multiply(
      Matrix.RotationAxis(
        PROMOTED_HUMAN_WEAPON_FACING_AXIS[attachmentKey],
        Math.PI,
      ),
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
