import type { AbilityActivation } from "./player-abilities.js";

/** Client-neutral activation result shared by both zone simulations. */
export function abilityResultProjection(
  abilityId: string,
  targetId: number,
  result: AbilityActivation,
): Record<string, unknown> {
  return {
    abilityId,
    targetId,
    ok: result.ok ? 1 : 0,
    ...(result.ok
      ? {
          actionId: result.actionId,
          cooldownEndsAtMs: result.cooldownEndsAtMs,
          recoveryEndsAtMs: result.recoveryEndsAtMs,
          effects: result.effects,
        }
      : {
          reason: result.reason,
          ...(result.readyAtMs === undefined ? {} : { readyAtMs: result.readyAtMs }),
        }),
  };
}
