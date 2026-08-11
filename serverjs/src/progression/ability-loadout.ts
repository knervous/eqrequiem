import { abilityById } from "../combat/abilities/index.js";
import type { CharacterTechniqueState } from "./technique-progression.js";

export interface AbilityDescription {
  readonly abilityId: string;
  readonly name: string;
  readonly kind: string;
  readonly minLevel: number;
  readonly cooldownMs: number;
  readonly recoveryMs: number;
  readonly resource: string | null;
  readonly resourceAmount: number;
  readonly targetKind: string;
  readonly rangeMetres: number;
}

export interface AbilityLoadout {
  readonly learned: readonly AbilityDescription[];
  readonly prepared: readonly (AbilityDescription & { readonly slot: number })[];
}

export interface CombatAbilityLoadout {
  readonly learned: readonly string[];
  readonly prepared: readonly string[];
}

export function abilityLoadoutProjection(
  state: CharacterTechniqueState,
): AbilityLoadout {
  return {
    learned: [...state.learned].map(describeAbility),
    prepared: [...state.prepared.entries()].map(([slot, abilityId]) => ({
      slot,
      ...describeAbility(abilityId),
    })),
  };
}

export function combatAbilityLoadout(
  state: CharacterTechniqueState,
): CombatAbilityLoadout {
  return {
    learned: [...state.learned],
    prepared: [...state.prepared.values()],
  };
}

function describeAbility(abilityId: string): AbilityDescription {
  const ability = abilityById(abilityId);
  return {
    abilityId,
    name: ability?.name ?? abilityId,
    kind: ability?.kind ?? "martial",
    minLevel: ability?.minLevel ?? 1,
    cooldownMs: ability?.cooldownMs ?? 0,
    recoveryMs: ability?.recoveryMs ?? 0,
    resource: ability?.resource?.type ?? null,
    resourceAmount: ability?.resource?.amount ?? 0,
    targetKind: ability?.target.kind ?? "self",
    rangeMetres: ability?.target.rangeMetres ?? 0,
  };
}
