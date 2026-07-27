import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCanonicalContentSchema,
  applyCanonicalRuntimeSchema,
} from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { MerchantRepository } from "./merchant-repository.js";

describe("merchant repository", () => {
  it("atomically buys, sells, quotes currency, and retains finite sold stock", async () => {
    const content = createNodeDatabase("sqlite::memory:");
    const runtime = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(content);
    await applyCanonicalRuntimeSchema(runtime);
    await content.execute(
      `INSERT INTO npc_archetypes
       (id, npc_key, name, properties_json) VALUES (10, 'merchant:10', 'Kane', '{}')`,
    );
    await content.execute(
      "INSERT INTO merchant_catalogs (id, merchant_key, label) VALUES (20, 'general', 'General Goods')",
    );
    await content.execute(
      `INSERT INTO npc_merchant_assignments
       (npc_archetype_id, catalog_id, keeps_sold_items,
        sell_to_player_permille, buy_from_player_permille)
       VALUES (10, 20, 1, 1000, 500)`,
    );
    await content.execute(
      `INSERT INTO items
       (id, name, stackable, stacksize, nodrop, base_price, sell_rate_permille)
       VALUES (100, 'Ration', 1, 20, 1, 100, 1200),
              (101, 'Old Sword', 0, 1, 1, 40, 1000)`,
    );
    await content.execute(
      `INSERT INTO merchant_catalog_entries
       (catalog_id, merchant_slot, item_id) VALUES (20, 1, 100)`,
    );
    await runtime.execute("INSERT INTO accounts (identity) VALUES ('guest')");
    await runtime.execute(
      "INSERT INTO characters (account_id, name, level, class_id) VALUES (1, 'Sol', 5, 1)",
    );
    await runtime.execute(
      "INSERT INTO character_currency (character_id, carried_copper) VALUES (1, 1000)",
    );
    await runtime.execute(
      `INSERT INTO player_inventory
       (character_id, bag, slot, item_id, quantity) VALUES (1, -1, 22, 101, 1)`,
    );
    const merchant = new MerchantRepository(content, runtime);

    const initial = await merchant.open(1, 10, 30, "Kane", 1, 0);
    assert.equal(initial.currencyCopper, 1000);
    assert.deepEqual(
      initial.items.map((item) => [item.merchantSlot, item.itemId, item.unitPrice]),
      [[1, 100, 120]],
    );
    assert.deepEqual(
      initial.sellItems.map((quote) => [
        quote.slot,
        quote.bag,
        quote.item.name,
        quote.unitPrice,
      ]),
      [[22, -1, "Old Sword", 20]],
    );

    const purchase = await merchant.buy({
      characterId: 1,
      npcArchetypeId: 10,
      zoneId: 1,
      instanceId: 0,
      merchantSlot: 1,
      quantity: 2,
    });
    assert.equal(purchase.totalCopper, 240);
    assert.equal(purchase.mutation.kind, "put");
    assert.deepEqual(
      (await runtime.query(
        "SELECT slot, item_id, quantity FROM player_inventory ORDER BY slot",
      )).rows,
      [
        { slot: 22, item_id: 101, quantity: 1 },
        { slot: 23, item_id: 100, quantity: 2 },
      ],
    );

    const sale = await merchant.sell({
      characterId: 1,
      npcArchetypeId: 10,
      zoneId: 1,
      instanceId: 0,
      slot: 22,
      bag: -1,
      quantity: 1,
    });
    assert.equal(sale.totalCopper, 20);
    assert.equal(sale.mutation.kind, "delete");
    const afterSale = await merchant.open(1, 10, 30, "Kane", 1, 0);
    assert.equal(afterSale.currencyCopper, 780);
    assert.deepEqual(
      afterSale.items.map((item) => [item.itemId, item.quantity]),
      [[100, null], [101, 1]],
    );
    assert.deepEqual(
      afterSale.sellItems.map((quote) => quote.item.name),
      ["Ration"],
    );
    assert.equal(
      (await runtime.query("SELECT COUNT(*) AS count FROM merchant_transactions"))
        .rows[0]?.count,
      2,
    );
    await assert.rejects(
      merchant.buy({
        characterId: 1,
        npcArchetypeId: 10,
        zoneId: 1,
        instanceId: 0,
        merchantSlot: 1,
        quantity: 20,
      }),
      /cannot afford/,
    );
    assert.equal(
      (
        await runtime.query<{ carried_copper: number }>(
          "SELECT carried_copper FROM character_currency WHERE character_id = 1",
        )
      ).rows[0]?.carried_copper,
      780,
    );

    await Promise.all([content.close(), runtime.close()]);
  });
});
