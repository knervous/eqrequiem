const MOTION_EPSILON_SQUARED = 1e-8;
const EQ_HEADING_UNITS_PER_TURN = 512;

export const REMOTE_MOTION_DEFAULTS = {
  ignoreDistance: 0.01,
  hardSnapDistance: 10,
  smoothDurationMs: 120,
  maxExtrapolationMs: 300,
} as const;

export interface HorizontalMotion {
  readonly x: number;
  readonly z: number;
}

export interface RemoteMotionSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly velocityZ: number;
  readonly receivedAtMs: number;
}

export interface RemotePresentationPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RemoteCorrectionStep {
  readonly position: RemotePresentationPosition;
  readonly changed: boolean;
  readonly settled: boolean;
  readonly snapped: boolean;
}

export interface RemoteCorrectionThresholds {
  readonly ignoreDistance: number;
  readonly hardSnapDistance: number;
  readonly smoothDurationMs: number;
  readonly maxExtrapolationMs: number;
}

/** Runtime actor meshes face -X; Babylon positive yaw turns -X toward +Z. */
export function yawFromHorizontalMotion(
  motion: HorizontalMotion,
): number | null {
  const lengthSquared = motion.x * motion.x + motion.z * motion.z;
  if (
    !Number.isFinite(lengthSquared) ||
    lengthSquared <= MOTION_EPSILON_SQUARED
  ) {
    return null;
  }
  // The half-turn is the model-space correction that keeps an actor's visual
  // forward axis aligned with the world-space direction used for prediction.
  const yaw = Math.atan2(motion.z, -motion.x);
  return Object.is(yaw, -0) ? 0 : yaw;
}

/**
 * Uses observed authoritative displacement before packet velocity. This keeps
 * facing tied to actual motion even while the render body is extrapolating.
 */
export function resolveDeadReckonedYaw(
  observedDisplacement: HorizontalMotion,
  packetVelocity: HorizontalMotion,
  fallbackHeading: number,
): number | null {
  return (
    yawFromHorizontalMotion(observedDisplacement) ??
    yawFromHorizontalMotion(packetVelocity) ??
    (Number.isFinite(fallbackHeading) ? fallbackHeading : null)
  );
}

export function eqHeadingToRadians(heading: number): number {
  return Number.isFinite(heading)
    ? heading * ((Math.PI * 2) / EQ_HEADING_UNITS_PER_TURN)
    : 0;
}

/** Constant-velocity prediction with a hard age bound. */
export function predictRemotePosition(
  snapshot: RemoteMotionSnapshot,
  nowMs: number,
  maxExtrapolationMs = REMOTE_MOTION_DEFAULTS.maxExtrapolationMs,
): RemotePresentationPosition {
  const ageMs = Math.max(
    0,
    Math.min(maxExtrapolationMs, nowMs - snapshot.receivedAtMs),
  );
  const seconds = ageMs / 1000;
  return {
    x: snapshot.x + snapshot.velocityX * seconds,
    y: snapshot.y + snapshot.velocityY * seconds,
    z: snapshot.z + snapshot.velocityZ * seconds,
  };
}

/** Thresholded, frame-rate-independent correction toward a presentation target. */
export function correctRemotePosition(
  current: RemotePresentationPosition,
  target: RemotePresentationPosition,
  deltaMs: number,
  thresholds: RemoteCorrectionThresholds = REMOTE_MOTION_DEFAULTS,
): RemoteCorrectionStep {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.z - current.z;
  const errorSquared = dx * dx + dy * dy + dz * dz;
  const ignoreSquared = thresholds.ignoreDistance * thresholds.ignoreDistance;
  if (errorSquared <= ignoreSquared) {
    return {
      position: current,
      changed: false,
      settled: true,
      snapped: false,
    };
  }
  if (
    errorSquared >=
    thresholds.hardSnapDistance * thresholds.hardSnapDistance
  ) {
    return {
      position: target,
      changed: true,
      settled: true,
      snapped: true,
    };
  }
  const alpha =
    1 -
    Math.exp(-Math.max(0, deltaMs) / Math.max(1, thresholds.smoothDurationMs));
  const position = {
    x: current.x + dx * alpha,
    y: current.y + dy * alpha,
    z: current.z + dz * alpha,
  };
  const remaining = 1 - alpha;
  return {
    position,
    changed: alpha > 0,
    settled: errorSquared * remaining * remaining <= ignoreSquared,
    snapped: false,
  };
}

export function shortestYawDelta(current: number, next: number): number {
  return Math.atan2(Math.sin(next - current), Math.cos(next - current));
}
