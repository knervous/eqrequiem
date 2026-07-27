import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EntityKind } from "../zone/entity-store.js";
import { loadZoneSimulationKernel } from "../zone/zone-kernel-node.js";
import { CorpseLootSystem } from "./corpse-loot.js";

describe("authoritative corpse loot", () => {
  it("keeps hydrated loot private until a nearby PC opens and takes it", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const player = kernel.entities.spawnPC({ id: 1, x: 0, y: 0, z: 0 });
    const npc = kernel.entities.spawnNPC({
      id: 2,
      x: 2,
      y: 0,
      z: 0,
      speed: 1,
    });
    const loot = new CorpseLootSystem(kernel.entities);
    loot.registerSpawn(2, "a_rat", [{
      id: 100,
      itemId: 100,
      name: "Token",
      slot: 0,
      quantity: 1,
    }]);

    const corpse = loot.createCorpse(npc);
    assert.equal(npc.kind, EntityKind.corpse);
    assert.equal(npc.moveSpeed, 0);
    assert.equal(corpse.items.length, 1);
    assert.equal(corpse.corpseName, "a_rat's corpse");
    assert.equal(loot.open(player.id, npc.id)?.items.length, 1);

    const item = loot.take(player.id, npc.id, 0);
    assert.equal(item?.itemId, 100);
    assert.deepEqual(loot.open(player.id, npc.id)?.items, []);
    loot.restore(npc.id, item!);
    assert.equal(loot.open(player.id, npc.id)?.items.length, 1);

    player.position.x = 20;
    assert.equal(loot.open(player.id, npc.id)?.items.length, 1);

    player.position.x = 30;
    assert.equal(loot.open(player.id, npc.id), null);
  });
});
