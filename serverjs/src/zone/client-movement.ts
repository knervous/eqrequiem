import type { Entity } from "./entity-store.js";

export interface ClientMovementPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

/** Projects one client-authored update into the authoritative public SoA planes. */
export function applyClientMovement(
  entity: Entity,
  previous: ClientMovementPosition | undefined,
  next: ClientMovementPosition,
  elapsedMs: number,
): void {
  const elapsedSeconds = Math.max(0, elapsedMs) / 1000;
  const vx = previous && elapsedSeconds > 0 ? (next.x - previous.x) / elapsedSeconds : 0;
  const vy = previous && elapsedSeconds > 0 ? (next.y - previous.y) / elapsedSeconds : 0;
  const vz = previous && elapsedSeconds > 0 ? (next.z - previous.z) / elapsedSeconds : 0;
  entity.position.set(next.x, next.y, next.z);
  entity.velocity.set(vx, vy, vz);
  entity.heading = next.heading;
  entity.movementState = vx * vx + vy * vy + vz * vz > 0.0001 ? 1 : 0;
}
