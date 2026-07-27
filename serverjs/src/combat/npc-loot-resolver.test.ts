import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveNpcLoot,
  type NpcLootGraphRow,
} from "./npc-loot-resolver.js";

const ITEM: NpcLootGraphRow = {
  id: 100,
  name: "Rat Ear",
  idfile: "",
  icon: 0,
  material: 0,
  color: 0,
  itemtype: 10,
  slots: 0,
  ac: 0,
  bagslots: 0,
  classes: 65_535,
  races: 4_294_967_295,
  stackable: 0,
  stacksize: 1,
  maxcharges: 0,
  weight: 0,
  damage: 0,
  delay: 0,
  astr: 0,
  asta: 0,
  adex: 0,
  aagi: 0,
  aint: 0,
  awis: 0,
  acha: 0,
  hp: 0,
  mana: 0,
  dr: 0,
  mr: 0,
  cr: 0,
  fr: 0,
  pr: 0,
  haste: 0,
  magic: 0,
  nodrop: 0,
  loot_group_id: 50,
  table_rolls: 1,
  table_chance_permille: 1_000,
  drop_limit: 0,
  minimum_drops: 0,
  group_chance_permille: 1_000,
  group_rolls: 2,
  minimum_quantity: 1,
  maximum_quantity: 1,
  npc_minimum_level: 0,
  npc_maximum_level: 0,
};

describe("NPC loot resolver", () => {
  it("resolves independent group rolls deterministically during spawn hydration", () => {
    const seed = {
      zoneId: 1,
      instanceId: 0,
      spawnId: 20,
      npcArchetypeId: 30,
    };
    const first = resolveNpcLoot(seed, 5, [ITEM]);
    const second = resolveNpcLoot(seed, 5, [ITEM]);
    assert.deepEqual(first, second);
    assert.deepEqual(
      first.map((item) => ({ itemId: item.itemId, slot: item.slot })),
      [{ itemId: 100, slot: 0 }, { itemId: 100, slot: 1 }],
    );
  });

  it("honors NPC-level eligibility before a guaranteed minimum drop", () => {
    const items = resolveNpcLoot(
      { zoneId: 1, instanceId: 0, spawnId: 2, npcArchetypeId: 3 },
      5,
      [{
        ...ITEM,
        drop_limit: 1,
        minimum_drops: 1,
        npc_minimum_level: 10,
      }],
    );
    assert.deepEqual(items, []);
  });
});
