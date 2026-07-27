import {
  EntityKind,
  type Entity,
  type EntityStore,
} from "../zone/entity-store.js";

export interface CorpseLootWindow {
  readonly corpseId: number;
  readonly corpseName: string;
  readonly items: readonly Record<string, unknown>[];
}

export interface CorpseLootRules {
  readonly interactionRange: number;
}

export const DEFAULT_CORPSE_LOOT_RULES: CorpseLootRules = Object.freeze({
  interactionRange: 25,
});

/**
 * Instance-local authoritative corpse inventory. Content has already resolved
 * chance and quantity before the zone begins ticking.
 */
export class CorpseLootSystem {
  private readonly spawnLoot = new Map<
    number,
    {
      readonly corpseName: string;
      readonly items: readonly Record<string, unknown>[];
    }
  >();
  private readonly corpses = new Map<number, Record<string, unknown>[]>();

  constructor(
    private readonly entities: EntityStore,
    private readonly rules: CorpseLootRules = DEFAULT_CORPSE_LOOT_RULES,
  ) {}

  registerSpawn(
    npcId: number,
    npcName: string,
    items: readonly Record<string, unknown>[],
  ): void {
    this.spawnLoot.set(npcId, {
      corpseName: corpseName(npcName),
      items: items.map((item) => ({ ...item })),
    });
  }

  createCorpse(npc: Entity): CorpseLootWindow {
    npc.becomeCorpse();
    const spawn = this.spawnLoot.get(npc.id);
    const items = (spawn?.items ?? []).map((item) => ({
      ...item,
    }));
    this.corpses.set(npc.id, items);
    return {
      corpseId: npc.id,
      corpseName: spawn?.corpseName ?? "Corpse",
      items,
    };
  }

  open(looterId: number, corpseId: number): CorpseLootWindow | null {
    const looter = this.entities.get(looterId);
    const corpse = this.entities.get(corpseId);
    if (
      !looter
      || looter.kind !== EntityKind.pc
      || !corpse
      || corpse.kind !== EntityKind.corpse
      || distanceSquared(looter, corpse)
        > interactionRangeSquared(this.rules)
    ) {
      return null;
    }
    return {
      corpseId,
      corpseName: this.spawnLoot.get(corpseId)?.corpseName ?? "Corpse",
      items: (this.corpses.get(corpseId) ?? []).map((item) => ({ ...item })),
    };
  }

  take(
    looterId: number,
    corpseId: number,
    lootSlot: number,
  ): Record<string, unknown> | null {
    if (!this.open(looterId, corpseId)) return null;
    const items = this.corpses.get(corpseId);
    const index = items?.findIndex(
      (item) => Number(item.slot) === lootSlot,
    ) ?? -1;
    if (!items || index < 0) return null;
    return items.splice(index, 1)[0] ?? null;
  }

  restore(corpseId: number, item: Record<string, unknown>): void {
    const items = this.corpses.get(corpseId);
    if (!items) return;
    items.push({ ...item });
    items.sort((left, right) => Number(left.slot) - Number(right.slot));
  }

  snapshotItems(corpseId: number): Record<string, unknown>[] {
    return (this.corpses.get(corpseId) ?? []).map((item) => ({ ...item }));
  }

  restoreCorpse(
    npc: Entity,
    items: readonly Record<string, unknown>[],
  ): CorpseLootWindow {
    if (npc.kind !== EntityKind.npc) {
      throw new Error("Only an NPC can be restored as a corpse");
    }
    npc.currentHp = 0;
    npc.becomeCorpse();
    const restored = items.map((item) => ({ ...item }));
    this.corpses.set(npc.id, restored);
    return {
      corpseId: npc.id,
      corpseName: this.spawnLoot.get(npc.id)?.corpseName ?? "Corpse",
      items: restored,
    };
  }
}

function interactionRangeSquared(rules: CorpseLootRules): number {
  const range = Math.max(0, rules.interactionRange);
  return range * range;
}

export function corpseName(npcName: string): string {
  const clean = npcName.trim().replace(/(?:_| )*'s(?:_| )+corpse$/iu, "");
  return clean.length > 0 ? `${clean}'s corpse` : "Corpse";
}

function distanceSquared(left: Entity, right: Entity): number {
  const dx = left.position.x - right.position.x;
  const dy = left.position.y - right.position.y;
  const dz = left.position.z - right.position.z;
  return dx * dx + dy * dy + dz * dz;
}
