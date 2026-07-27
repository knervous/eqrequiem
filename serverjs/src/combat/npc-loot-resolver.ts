import { toItemInstance, type GameItemRow } from "../backend/item-instance.js";

export interface NpcLootGraphRow extends GameItemRow {
  readonly loot_group_id: number;
  readonly table_rolls: number;
  readonly table_chance_permille: number;
  readonly drop_limit: number;
  readonly minimum_drops: number;
  readonly group_chance_permille: number;
  readonly group_rolls: number;
  readonly minimum_quantity: number;
  readonly maximum_quantity: number;
  readonly npc_minimum_level: number;
  readonly npc_maximum_level: number;
}

export interface NpcLootSeed {
  readonly zoneId: number;
  readonly instanceId: number;
  readonly spawnId: number;
  readonly npcArchetypeId: number;
}

interface LootRule {
  readonly lootGroupId: number;
  readonly tableRolls: number;
  readonly tableChancePermille: number;
  readonly dropLimit: number;
  readonly minimumDrops: number;
  readonly candidates: readonly NpcLootGraphRow[];
}

/**
 * Deterministically resolves a configured loot graph while an NPC spawn is
 * hydrated. Runtime corpse code receives only private item instances.
 */
export function resolveNpcLoot(
  seed: NpcLootSeed,
  npcLevel: number,
  rows: readonly NpcLootGraphRow[],
  firstSlot = 0,
): Record<string, unknown>[] {
  const rules = groupRules(rows);
  const items: Record<string, unknown>[] = [];
  let slot = firstSlot;
  const add = (
    row: NpcLootGraphRow,
    tableRoll: number,
    dropRoll: number,
    itemRoll: number,
  ): void => {
    const minimum = Math.max(1, Math.trunc(Number(row.minimum_quantity)));
    const maximum = Math.max(
      minimum,
      Math.trunc(Number(row.maximum_quantity)),
    );
    const quantity = minimum + sample(seed, [
      row.loot_group_id,
      Number(row.id),
      tableRoll,
      dropRoll,
      itemRoll,
      0x51ed,
    ]) % (maximum - minimum + 1);
    items.push(toItemInstance(row, slot++, -1, quantity));
  };

  for (const rule of rules) {
    const candidates = rule.candidates.filter(
      (row) =>
        (Number(row.npc_minimum_level) <= 0
          || npcLevel >= Number(row.npc_minimum_level))
        && (Number(row.npc_maximum_level) <= 0
          || npcLevel <= Number(row.npc_maximum_level)),
    );
    if (candidates.length === 0) continue;
    for (let tableRoll = 0; tableRoll < rule.tableRolls; tableRoll++) {
      if (
        sample(seed, [rule.lootGroupId, tableRoll, 0x7a81]) % 1_000
          >= rule.tableChancePermille
      ) {
        continue;
      }
      if (rule.dropLimit === 0 && rule.minimumDrops === 0) {
        for (const row of candidates) {
          for (let itemRoll = 0; itemRoll < positiveRolls(row.group_rolls); itemRoll++) {
            if (
              sample(seed, [
                rule.lootGroupId,
                Number(row.id),
                tableRoll,
                itemRoll,
                0x1d3,
              ]) % 1_000 < permille(row.group_chance_permille)
            ) {
              add(row, tableRoll, 0, itemRoll);
            }
          }
        }
        continue;
      }

      const limit = Math.max(rule.dropLimit, rule.minimumDrops);
      const noLootPermille = candidates.reduce(
        (chance, row) =>
          Math.floor(chance * (1_000 - permille(row.group_chance_permille)) / 1_000),
        1_000,
      );
      const totalWeight = candidates.reduce(
        (total, row) => total + permille(row.group_chance_permille),
        0,
      );
      if (totalWeight <= 0) continue;
      for (let dropRoll = 0; dropRoll < limit; dropRoll++) {
        const mustDrop = dropRoll < rule.minimumDrops;
        if (
          !mustDrop
          && sample(seed, [
            rule.lootGroupId,
            tableRoll,
            dropRoll,
            0x91c7,
          ]) % 1_000 < noLootPermille
        ) {
          continue;
        }
        let weightedRoll = sample(seed, [
          rule.lootGroupId,
          tableRoll,
          dropRoll,
          0xb529,
        ]) % totalWeight;
        const selected = candidates.find((row) => {
          weightedRoll -= permille(row.group_chance_permille);
          return weightedRoll < 0;
        }) ?? candidates[candidates.length - 1]!;
        add(selected, tableRoll, dropRoll, 0);
        for (
          let itemRoll = 1;
          itemRoll < positiveRolls(selected.group_rolls);
          itemRoll++
        ) {
          if (
            sample(seed, [
              rule.lootGroupId,
              Number(selected.id),
              tableRoll,
              dropRoll,
              itemRoll,
              0xe35,
            ]) % 1_000 < permille(selected.group_chance_permille)
          ) {
            add(selected, tableRoll, dropRoll, itemRoll);
          }
        }
      }
    }
  }
  return items;
}

function groupRules(rows: readonly NpcLootGraphRow[]): LootRule[] {
  const byGroup = new Map<number, NpcLootGraphRow[]>();
  for (const row of rows) {
    const id = Number(row.loot_group_id);
    const entries = byGroup.get(id) ?? [];
    entries.push(row);
    byGroup.set(id, entries);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lootGroupId, candidates]) => {
      candidates.sort((a, b) => Number(a.id) - Number(b.id));
      const first = candidates[0]!;
      return {
        lootGroupId,
        tableRolls: Math.max(0, Math.trunc(Number(first.table_rolls))),
        tableChancePermille: permille(first.table_chance_permille),
        dropLimit: Math.max(0, Math.trunc(Number(first.drop_limit))),
        minimumDrops: Math.max(0, Math.trunc(Number(first.minimum_drops))),
        candidates,
      };
    });
}

function positiveRolls(value: unknown): number {
  return Math.max(1, Math.trunc(Number(value)));
}

function permille(value: unknown): number {
  return Math.max(0, Math.min(1_000, Math.round(Number(value))));
}

function sample(seed: NpcLootSeed, values: readonly number[]): number {
  let value = (
    Math.imul(seed.zoneId, 0x9e37_79b1)
    ^ Math.imul(seed.instanceId + 1, 0x85eb_ca6b)
    ^ Math.imul(seed.spawnId, 0xc2b2_ae35)
    ^ Math.imul(seed.npcArchetypeId, 0x27d4_eb2f)
  ) >>> 0;
  for (const part of values) {
    value ^= Math.imul(Math.trunc(part), 0x1656_67b1);
    value = Math.imul(value ^ (value >>> 16), 0x7feb_352d) >>> 0;
  }
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}
