/**
 * Shared ground contract for the Havok character capsule.
 *
 * Havok only keeps a body on a slope through contact friction, and the player
 * capsule is velocity-driven every frame, so the controller overwrites whatever
 * the solver decided. Standing still therefore has to be an explicit state the
 * controller enters, not something friction is trusted to produce. These values
 * and helpers are the single definition of that state; the module deliberately
 * imports nothing from Babylon so the headless physics test can drive the same
 * code the client runs.
 */

export type Vec3Like = { x: number; y: number; z: number };

/** Slopes up to this angle are stood on. Steeper ground is slid down. */
export const MAX_WALKABLE_SLOPE_DEGREES = 55;

export const MAX_WALKABLE_SLOPE_COS = Math.cos(
  (MAX_WALKABLE_SLOPE_DEGREES * Math.PI) / 180,
);

/**
 * Friction for the player capsule and for the static world it walks on.
 *
 * Assign it as a whole material — `shape.material.friction = x` mutates a
 * detached copy of the Havok material that the getter builds on demand, so the
 * write is silently discarded and the shape keeps Havok's 0.5 default, which
 * lets a resting capsule creep down anything steeper than about 26 degrees.
 */
export const GROUND_FRICTION = 1.5;

/**
 * Ceiling on the speed at which a capsule is pulled back down onto its ground.
 *
 * The pull only ever closes a measured gap, because a permanent downward bias
 * would feed the friction solver a normal impulse every step and quietly tax
 * walking speed.
 */
export const MAX_GROUND_STICK_SPEED = 8;

/** Clearance below the capsule that still counts as standing on the ground. */
export const GROUND_PROBE_EPSILON = 0.1;

/** Seconds after a jump during which ground contact cannot re-anchor. */
export const JUMP_GRACE_SECONDS = 0.25;

export const isWalkableSlope = (normalY: number): boolean =>
  normalY >= MAX_WALKABLE_SLOPE_COS;

/**
 * Vertical distance from the capsule centre that still counts as contact. A
 * capsule resting on a slope sits `radius / cos(theta)` above the surface
 * directly beneath it, so the flat-ground baseline has to grow the same way or
 * a downward probe reports a walkable slope as open air.
 */
export const groundContactDistance = (
  baseline: number,
  normalY: number,
): number => baseline / normalY;

/**
 * Probe distance a capsule reads when it is exactly at rest on a surface. The
 * bottom hemisphere touches the plane at a point offset from the vertical, so
 * only the radius part of the standing height grows with the slope.
 */
export const groundRestDistance = (
  halfHeight: number,
  radius: number,
  normalY: number,
): number => halfHeight - radius + radius / normalY;

/**
 * Downward speed that closes the remaining gap to the ground in one frame,
 * capped so a large gap cannot brake horizontal movement through friction.
 */
export const groundStickSpeed = (gap: number, delta: number): number => {
  if (!(gap > 0) || !(delta > 0)) {return 0;}
  return Math.min(gap / delta, MAX_GROUND_STICK_SPEED);
};

/**
 * Rewrites a desired horizontal velocity as motion along the ground plane at
 * the same speed, biased slightly into the surface.
 *
 * Driving the raw horizontal vector into a slope leaves the contact solver to
 * resolve it: uphill it scrubs off speed, downhill it launches the capsule and
 * then gravity converts the airtime into a slide. The stick bias keeps the
 * capsule on crests and ramps it would otherwise leave.
 */
export function projectVelocityOnGround(
  velocity: Vec3Like,
  normal: Vec3Like,
  stickSpeed: number,
  out: Vec3Like,
): Vec3Like {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const into = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  let x = velocity.x - normal.x * into;
  let y = velocity.y - normal.y * into;
  let z = velocity.z - normal.z * into;

  const projected = Math.hypot(x, y, z);
  if (projected > 1e-6) {
    const rescale = speed / projected;
    x *= rescale;
    y *= rescale;
    z *= rescale;
  }

  out.x = x - normal.x * stickSpeed;
  out.y = y - normal.y * stickSpeed;
  out.z = z - normal.z * stickSpeed;
  return out;
}
