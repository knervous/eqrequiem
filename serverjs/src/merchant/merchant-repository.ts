import { toItemInstance, type GameItemRow } from "../backend/item-instance.js";
import type {
  DatabaseBackend,
  DatabaseRow,
} from "../db/backend.js";
import {
  merchantBuyPrice,
  merchantSellPrice,
  type MerchantPricingPolicy,
} from "./merchant-pricing.js";

const GENERAL_SLOTS = [22, 23, 24, 25, 26, 27, 28, 29, 30] as const;
const DYNAMIC_SLOT_OFFSET = 1_000_000_000;

interface MerchantProfileRow extends DatabaseRow {
  catalog_id: number;
  keeps_sold_items: number;
  greed: number;
  sell_to_player_permille: number;
  buy_from_player_permille: number;
  interaction_range: number;
}

interface MerchantItemRow extends GameItemRow {
  merchant_slot: number;
  level_required: number;
  classes_required: number;
  probability_permille: number;
  base_price: number;
  sell_rate_permille: number;
}

interface InventoryRow extends DatabaseRow {
  bag: number;
  slot: number;
  item_id: number;
  quantity: number;
  charges: number;
}

interface CurrencyRow extends DatabaseRow {
  carried_copper: number;
}

interface DynamicStockRow extends DatabaseRow {
  item_id: number;
  quantity: number;
}

export interface MerchantWindowItem {
  readonly merchantSlot: number;
  readonly itemId: number;
  readonly name: string;
  readonly quantity: number | null;
  readonly unitPrice: number;
  readonly item: Record<string, unknown>;
}

export interface MerchantSellQuote {
  readonly slot: number;
  readonly bag: number;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly item: Record<string, unknown>;
}

export interface MerchantWindow {
  readonly npcId: number;
  readonly merchantName: string;
  readonly currencyCopper: number;
  readonly items: readonly MerchantWindowItem[];
  readonly sellItems: readonly MerchantSellQuote[];
}

export interface MerchantInventoryMutation {
  readonly kind: "put" | "delete";
  readonly slot: number;
  readonly bag: number;
  readonly item?: Record<string, unknown>;
}

export interface MerchantTransactionResult {
  readonly totalCopper: number;
  readonly mutation: MerchantInventoryMutation;
}

export class MerchantTransactionError extends Error {}

/**
 * Runtime transaction boundary for ordinary copper merchants.
 * Content is read-only; all mutable balances, inventory, retained stock, and
 * audit rows commit together in the runtime database.
 */
export class MerchantRepository {
  constructor(
    private readonly content: DatabaseBackend,
    private readonly runtime: DatabaseBackend,
    private readonly contentPrefix = "",
  ) {}

  async profile(npcArchetypeId: number): Promise<MerchantProfileRow | null> {
    return (
      await this.content.query<MerchantProfileRow>(
        `SELECT catalog_id, keeps_sold_items, greed,
          sell_to_player_permille, buy_from_player_permille, interaction_range
         FROM ${this.contentPrefix}npc_merchant_assignments
         WHERE npc_archetype_id = ? LIMIT 1`,
        [npcArchetypeId],
      )
    ).rows[0] ?? null;
  }

  async open(
    characterId: number,
    npcArchetypeId: number,
    npcId: number,
    merchantName: string,
    zoneId: number,
    instanceId: number,
  ): Promise<MerchantWindow> {
    const profile = await this.requireProfile(npcArchetypeId);
    const character = (
      await this.runtime.query<{ level: number; class_id: number }>(
        "SELECT level, class_id FROM characters WHERE id = ? LIMIT 1",
        [characterId],
      )
    ).rows[0];
    if (!character) throw new MerchantTransactionError("Character not found.");
    const items = await this.catalogItems(profile, character);
    const dynamic = (
      await this.runtime.query<DynamicStockRow>(
        `SELECT item_id, quantity FROM merchant_dynamic_stock
         WHERE npc_archetype_id = ? AND zone_id = ? AND instance_id = ?
           AND quantity > 0 ORDER BY item_id`,
        [npcArchetypeId, zoneId, instanceId],
      )
    ).rows;
    const staticIds = new Set(items.map((item) => Number(item.id)));
    const dynamicItems = await this.dynamicItems(
      dynamic.filter((row) => !staticIds.has(Number(row.item_id))),
    );
    await this.ensureCurrency(characterId);
    const currency = (
      await this.runtime.query<CurrencyRow>(
        "SELECT carried_copper FROM character_currency WHERE character_id = ? LIMIT 1",
        [characterId],
      )
    ).rows[0];
    const policy = pricingPolicy(profile);
    const sellItems = await this.sellItems(characterId, policy);
    return {
      npcId,
      merchantName,
      currencyCopper: Number(currency?.carried_copper ?? 0),
      items: [
        ...items.map((item) => windowItem(
          item,
          Number(item.merchant_slot),
          null,
          policy,
        )),
        ...dynamicItems.map(({ item, quantity }) => windowItem(
          item,
          DYNAMIC_SLOT_OFFSET + Number(item.id),
          quantity,
          policy,
        )),
      ],
      sellItems,
    };
  }

  async buy(input: {
    characterId: number;
    npcArchetypeId: number;
    zoneId: number;
    instanceId: number;
    merchantSlot: number;
    quantity: number;
  }): Promise<MerchantTransactionResult> {
    const quantity = positiveQuantity(input.quantity);
    const profile = await this.requireProfile(input.npcArchetypeId);
    const character = (
      await this.runtime.query<{ level: number; class_id: number }>(
        "SELECT level, class_id FROM characters WHERE id = ? LIMIT 1",
        [input.characterId],
      )
    ).rows[0];
    if (!character) throw new MerchantTransactionError("Character not found.");
    const dynamic = input.merchantSlot >= DYNAMIC_SLOT_OFFSET;
    const itemId = dynamic
      ? input.merchantSlot - DYNAMIC_SLOT_OFFSET
      : null;
    const item = dynamic
      ? await this.item(itemId!)
      : (await this.catalogItems(profile, character)).find(
        (candidate) => Number(candidate.merchant_slot) === input.merchantSlot,
      ) ?? null;
    if (!item) throw new MerchantTransactionError("That item is no longer for sale.");
    const count = Math.min(
      quantity,
      Number(item.stackable) !== 0
        ? Math.max(1, Number(item.stacksize))
        : 1,
    );
    const totalCopper = merchantSellPrice(itemPricing(item), count, pricingPolicy(profile));
    let mutation!: MerchantInventoryMutation;
    await this.runtime.transaction(async (database) => {
      await ensureCurrency(database, input.characterId);
      const destination = await inventoryDestination(
        database,
        input.characterId,
        item,
        count,
      );
      if (!destination) {
        throw new MerchantTransactionError("You do not have room for that item.");
      }
      if (dynamic) {
        const reduced = await database.execute(
          `UPDATE merchant_dynamic_stock SET quantity = quantity - ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE npc_archetype_id = ? AND zone_id = ? AND instance_id = ?
             AND item_id = ? AND quantity >= ?`,
          [
            count,
            input.npcArchetypeId,
            input.zoneId,
            input.instanceId,
            Number(item.id),
            count,
          ],
        );
        if (reduced.affectedRows !== 1) {
          throw new MerchantTransactionError("That item is no longer available.");
        }
      }
      const paid = await database.execute(
        `UPDATE character_currency SET carried_copper = carried_copper - ?
         WHERE character_id = ? AND carried_copper >= ?`,
        [totalCopper, input.characterId, totalCopper],
      );
      if (paid.affectedRows !== 1) {
        throw new MerchantTransactionError("You cannot afford that item.");
      }
      if (destination.existing) {
        await database.execute(
          `UPDATE player_inventory SET quantity = quantity + ?
           WHERE character_id = ? AND bag = ? AND slot = ?`,
          [count, input.characterId, destination.bag, destination.slot],
        );
      } else {
        await database.execute(
          `INSERT INTO player_inventory
           (character_id, bag, slot, item_id, quantity, charges)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            input.characterId,
            destination.bag,
            destination.slot,
            Number(item.id),
            count,
            Number(item.maxcharges) > 0 ? Number(item.maxcharges) : 0,
          ],
        );
      }
      const resultingQuantity = destination.quantity + count;
      mutation = {
        kind: "put",
        slot: destination.slot,
        bag: destination.bag,
        item: toItemInstance(item, destination.slot, destination.bag, resultingQuantity),
      };
      await audit(database, input, "buy", Number(item.id), count, totalCopper);
    });
    return { totalCopper, mutation };
  }

  async sell(input: {
    characterId: number;
    npcArchetypeId: number;
    zoneId: number;
    instanceId: number;
    slot: number;
    bag: number;
    quantity: number;
  }): Promise<MerchantTransactionResult> {
    const profile = await this.requireProfile(input.npcArchetypeId);
    const inventory = (
      await this.runtime.query<InventoryRow>(
        `SELECT bag, slot, item_id, quantity, charges FROM player_inventory
         WHERE character_id = ? AND bag = ? AND slot = ? LIMIT 1`,
        [input.characterId, input.bag, input.slot],
      )
    ).rows[0];
    if (!inventory) throw new MerchantTransactionError("You no longer have that item.");
    const item = await this.item(Number(inventory.item_id));
    if (!item) throw new MerchantTransactionError("That item cannot be sold.");
    // EQEmu's NoDrop field is inverse: zero denotes a NO DROP item.
    if (Number(item.nodrop) === 0) {
      throw new MerchantTransactionError("The merchant will not buy that item.");
    }
    const available = Math.max(1, Number(inventory.quantity));
    const count = Number(item.stackable) !== 0
      ? Math.min(positiveQuantity(input.quantity), available)
      : 1;
    const totalCopper = merchantBuyPrice(itemPricing(item), count, pricingPolicy(profile));
    const remaining = available - count;
    const retained = Number(profile.keeps_sold_items) !== 0
      && !await this.catalogHasItem(Number(profile.catalog_id), Number(item.id));
    let mutation!: MerchantInventoryMutation;
    await this.runtime.transaction(async (database) => {
      const removed = remaining > 0
        ? await database.execute(
          `UPDATE player_inventory SET quantity = ?
           WHERE character_id = ? AND bag = ? AND slot = ? AND item_id = ?
             AND quantity = ?`,
          [
            remaining,
            input.characterId,
            input.bag,
            input.slot,
            Number(item.id),
            available,
          ],
        )
        : await database.execute(
          `DELETE FROM player_inventory
           WHERE character_id = ? AND bag = ? AND slot = ? AND item_id = ?`,
          [input.characterId, input.bag, input.slot, Number(item.id)],
        );
      if (removed.affectedRows !== 1) {
        throw new MerchantTransactionError("You no longer have that item.");
      }
      await ensureCurrency(database, input.characterId);
      await database.execute(
        "UPDATE character_currency SET carried_copper = carried_copper + ? WHERE character_id = ?",
        [totalCopper, input.characterId],
      );
      if (retained) {
        const updated = await database.execute(
          `UPDATE merchant_dynamic_stock SET quantity = quantity + ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE npc_archetype_id = ? AND zone_id = ? AND instance_id = ?
             AND item_id = ?`,
          [
            count,
            input.npcArchetypeId,
            input.zoneId,
            input.instanceId,
            Number(item.id),
          ],
        );
        if (updated.affectedRows === 0) {
          await database.execute(
            `INSERT INTO merchant_dynamic_stock
             (npc_archetype_id, zone_id, instance_id, item_id, quantity)
             VALUES (?, ?, ?, ?, ?)`,
            [
              input.npcArchetypeId,
              input.zoneId,
              input.instanceId,
              Number(item.id),
              count,
            ],
          );
        }
      }
      mutation = remaining > 0
        ? {
          kind: "put",
          slot: input.slot,
          bag: input.bag,
          item: toItemInstance(item, input.slot, input.bag, remaining),
        }
        : { kind: "delete", slot: input.slot, bag: input.bag };
      await audit(database, input, "sell", Number(item.id), count, totalCopper);
    });
    return { totalCopper, mutation };
  }

  private async requireProfile(npcArchetypeId: number): Promise<MerchantProfileRow> {
    const profile = await this.profile(npcArchetypeId);
    if (!profile) throw new MerchantTransactionError("That NPC is not a merchant.");
    return profile;
  }

  private async catalogItems(
    profile: MerchantProfileRow,
    character: { level: number; class_id: number },
  ): Promise<MerchantItemRow[]> {
    const rows = (
      await this.content.query<MerchantItemRow>(
        `SELECT entry.merchant_slot, entry.level_required,
          entry.classes_required, entry.probability_permille, item.*
         FROM ${this.contentPrefix}merchant_catalog_entries entry
         JOIN ${this.contentPrefix}items item ON item.id = entry.item_id
         WHERE entry.catalog_id = ? ORDER BY entry.merchant_slot`,
        [Number(profile.catalog_id)],
      )
    ).rows;
    const classBit = 2 ** Math.max(0, Number(character.class_id) - 1);
    return rows.filter((row) =>
      Number(character.level) >= Number(row.level_required)
      && (
        Number(row.classes_required) === 0
        || (Number(row.classes_required) & classBit) !== 0
      )
      && Number(row.probability_permille) > 0
    );
  }

  private async item(itemId: number): Promise<MerchantItemRow | null> {
    return (
      await this.content.query<MerchantItemRow>(
        `SELECT 0 AS merchant_slot, 0 AS level_required,
          0 AS classes_required, 1000 AS probability_permille, item.*
         FROM ${this.contentPrefix}items item WHERE item.id = ? LIMIT 1`,
        [itemId],
      )
    ).rows[0] ?? null;
  }

  private async catalogHasItem(catalogId: number, itemId: number): Promise<boolean> {
    return Boolean((
      await this.content.query(
        `SELECT 1 FROM ${this.contentPrefix}merchant_catalog_entries
         WHERE catalog_id = ? AND item_id = ? LIMIT 1`,
        [catalogId, itemId],
      )
    ).rows[0]);
  }

  private async dynamicItems(
    rows: readonly DynamicStockRow[],
  ): Promise<Array<{ item: MerchantItemRow; quantity: number }>> {
    const result: Array<{ item: MerchantItemRow; quantity: number }> = [];
    for (const row of rows) {
      const item = await this.item(Number(row.item_id));
      if (item) result.push({ item, quantity: Number(row.quantity) });
    }
    return result;
  }

  private async sellItems(
    characterId: number,
    policy: MerchantPricingPolicy,
  ): Promise<MerchantSellQuote[]> {
    const inventory = (
      await this.runtime.query<InventoryRow>(
        `SELECT bag, slot, item_id, quantity, charges FROM player_inventory
         WHERE character_id = ? AND slot BETWEEN 22 AND 29
         ORDER BY slot, bag`,
        [characterId],
      )
    ).rows;
    const result: MerchantSellQuote[] = [];
    for (const row of inventory) {
      const item = await this.item(Number(row.item_id));
      // EQEmu's NoDrop field is inverse: zero denotes a NO DROP item.
      if (!item || Number(item.nodrop) === 0) continue;
      const quantity = Math.max(1, Number(row.quantity));
      result.push({
        slot: Number(row.slot),
        bag: Number(row.bag),
        quantity,
        unitPrice: merchantBuyPrice(itemPricing(item), 1, policy),
        item: toItemInstance(item, Number(row.slot), Number(row.bag), quantity),
      });
    }
    return result;
  }

  private ensureCurrency(characterId: number): Promise<void> {
    return ensureCurrency(this.runtime, characterId);
  }
}

const pricingPolicy = (row: MerchantProfileRow): MerchantPricingPolicy => ({
  sellToPlayerPermille: Math.max(0, Number(row.sell_to_player_permille)),
  buyFromPlayerPermille: Math.max(0, Number(row.buy_from_player_permille)),
  minimumTransactionCopper: 1,
});

const itemPricing = (item: MerchantItemRow) => ({
  basePrice: Number(item.base_price ?? 0),
  sellRatePermille: Number(item.sell_rate_permille ?? 1_000),
});

const windowItem = (
  item: MerchantItemRow,
  merchantSlot: number,
  quantity: number | null,
  policy: MerchantPricingPolicy,
): MerchantWindowItem => ({
  merchantSlot,
  itemId: Number(item.id),
  name: String(item.name),
  quantity,
  unitPrice: merchantSellPrice(itemPricing(item), 1, policy),
  item: toItemInstance(item, merchantSlot, 0, quantity ?? 1),
});

const positiveQuantity = (value: number): number => {
  const quantity = Math.trunc(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new MerchantTransactionError("Invalid merchant quantity.");
  }
  return quantity;
};

const ensureCurrency = async (
  database: DatabaseBackend,
  characterId: number,
): Promise<void> => {
  await database.execute(
    `INSERT INTO character_currency (character_id, carried_copper, banked_copper)
     SELECT ?, 0, 0 WHERE NOT EXISTS (
       SELECT 1 FROM character_currency WHERE character_id = ?
     )`,
    [characterId, characterId],
  );
};

const inventoryDestination = async (
  database: DatabaseBackend,
  characterId: number,
  item: MerchantItemRow,
  quantity: number,
): Promise<{
  slot: number;
  bag: number;
  existing: boolean;
  quantity: number;
} | null> => {
  const rows = (
    await database.query<InventoryRow>(
      `SELECT bag, slot, item_id, quantity, charges FROM player_inventory
       WHERE character_id = ? AND bag = -1 AND slot BETWEEN 22 AND 30
       ORDER BY slot`,
      [characterId],
    )
  ).rows;
  if (Number(item.stackable) !== 0) {
    const stack = rows.find((row) =>
      Number(row.item_id) === Number(item.id)
      && Number(row.quantity) + quantity <= Math.max(1, Number(item.stacksize))
    );
    if (stack) {
      return {
        slot: Number(stack.slot),
        bag: Number(stack.bag),
        existing: true,
        quantity: Number(stack.quantity),
      };
    }
  }
  const occupied = new Set(rows.map((row) => Number(row.slot)));
  const slot = GENERAL_SLOTS.find((candidate) => !occupied.has(candidate));
  return slot === undefined
    ? null
    : { slot, bag: -1, existing: false, quantity: 0 };
};

const audit = (
  database: DatabaseBackend,
  input: { characterId: number; npcArchetypeId: number },
  action: "buy" | "sell",
  itemId: number,
  quantity: number,
  copper: number,
): Promise<unknown> => database.execute(
  `INSERT INTO merchant_transactions
   (character_id, npc_archetype_id, action, item_id, quantity, copper)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [
    input.characterId,
    input.npcArchetypeId,
    action,
    itemId,
    quantity,
    copper,
  ],
);
