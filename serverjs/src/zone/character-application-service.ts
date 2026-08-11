import type {
  MerchantInventoryMutation,
  MerchantWindow,
} from "../merchant/merchant-repository.js";
import { MerchantTransactionError } from "../merchant/merchant-repository.js";
import type { CharacterJournalNote } from "../progression/character-progress-repository.js";
import {
  applyProgressionRequestInTransaction,
  progressionState,
  type ProgressionRequest,
  type ProgressionState,
} from "../progression/progression-requests.js";
import {
  abilityLoadoutProjection,
  combatAbilityLoadout,
  type AbilityLoadout,
  type CombatAbilityLoadout,
} from "../progression/ability-loadout.js";
import type { GameDatabase } from "../persist/game-database.js";
import type { GrantedInventoryItem, InventoryDestination } from "../persist/repository.js";
import type { PersistSlotMove } from "../persist/types.js";
import type { ZoneWriteScheduler } from "../persist/zone-write-scheduler.js";
import type {
  ZoneCoalesceKey,
  ZoneDeferredWrite,
  ZonePositionWrite,
} from "../persist/zone-write-intents.js";
import {
  applyJournalNote,
  type JournalNoteIntent,
} from "./quest-runtime.js";
import { journalFromState, type QuestJournalEntry } from "./quest-state.js";

export type CharacterWriteScheduler = ZoneWriteScheduler<
  ZoneDeferredWrite,
  ZonePositionWrite,
  ZoneCoalesceKey
>;

export interface JournalMutationResult {
  readonly notes: readonly CharacterJournalNote[];
  readonly entries: readonly QuestJournalEntry[];
}

export interface ProgressionMutationResult {
  readonly state: ProgressionState;
  readonly refusal: string | null;
  readonly abilityLoadout: AbilityLoadout;
  readonly combatLoadout: CombatAbilityLoadout;
}

export interface MerchantContext {
  readonly characterId: number;
  readonly npcArchetypeId: number;
  readonly npcId: number;
  readonly merchantName: string;
  readonly zoneId: number;
  readonly instanceId: number;
}

export type MerchantOperation =
  | (MerchantContext & { readonly action: "open" })
  | (MerchantContext & {
      readonly action: "buy";
      readonly merchantSlot: number;
      readonly quantity: number;
    })
  | (MerchantContext & {
      readonly action: "sell";
      readonly slot: number;
      readonly bag: number;
      readonly quantity: number;
    });

export interface MerchantOperationSuccess {
  readonly ok: true;
  readonly mutation: MerchantInventoryMutation | null;
  readonly window: MerchantWindow;
}

export interface MerchantOperationFailure {
  readonly ok: false;
  readonly message: string;
}

export type MerchantOperationResult =
  | MerchantOperationSuccess
  | MerchantOperationFailure;

/**
 * Transport-neutral character use cases shared by the live zone and browser harness.
 *
 * The scheduler and repository graph are injected once. Runtime adapters resolve a
 * session to a character, call one method, then encode the returned domain result.
 */
export class CharacterApplicationService {
  constructor(
    private readonly database: GameDatabase,
    private readonly writes: CharacterWriteScheduler,
  ) {}

  updateJournal(
    characterId: number,
    intent: JournalNoteIntent,
  ): Promise<JournalMutationResult> {
    return this.writes.critical(characterId, "journal_note", async (transaction) => {
      const repository = this.database.inTransaction(transaction).progress;
      await applyJournalNote(repository, characterId, intent);
      const snapshot = await repository.load(characterId);
      return {
        entries: snapshot ? journalFromState(snapshot) : [],
        notes: await repository.notes(characterId),
      };
    });
  }

  progression(
    characterId: number,
    request: ProgressionRequest,
    inCombat = false,
  ): Promise<ProgressionMutationResult | null> {
    return this.writes.critical(
      characterId,
      "progression_request",
      async (transaction) => {
        const database = this.database.inTransaction(transaction);
        const current = await database.data.characterProgression(characterId);
        if (!current) return null;
        const identity = { characterId, ...current, inCombat };
        const result = await applyProgressionRequestInTransaction(
          database.techniques,
          identity,
          request,
        );
        const state = await database.techniques.load(
          characterId,
          identity,
          identity.knowledge,
        );
        return {
          state: await progressionState(database.techniques, identity),
          refusal: result.refusal ?? null,
          abilityLoadout: abilityLoadoutProjection(state),
          combatLoadout: combatAbilityLoadout(state),
        };
      },
    );
  }

  moveItem(
    characterId: number,
    input: Omit<Parameters<GameDatabase["game"]["moveItemInTransaction"]>[0], "characterId">,
  ): Promise<PersistSlotMove[]> {
    if (!Object.values(input).every(Number.isInteger)) {
      return Promise.reject(new Error("Invalid inventory position."));
    }
    return this.writes.critical(characterId, "item_move", (transaction) =>
      this.database.inTransaction(transaction).game.moveItemInTransaction({
        characterId,
        ...input,
      })
    );
  }

  async deleteItem(characterId: number, slot: number, bag: number): Promise<boolean> {
    if (!Number.isInteger(slot) || !Number.isInteger(bag) || slot !== 30) {
      return false;
    }
    await this.writes.critical(characterId, "item_delete", (transaction) =>
      this.database.inTransaction(transaction).game.deleteItemInTransaction({
        characterId,
        slot,
        bag,
      })
    );
    return true;
  }

  setLevel(characterId: number, level: number): Promise<void> {
    return this.writes.critical(characterId, "set_level", (transaction) =>
      this.database.inTransaction(transaction).game
        .setCharacterLevel(characterId, level)
    );
  }

  rememberPosition(characterId: number, position: ZonePositionWrite): void {
    this.writes.coalesce(characterId, "position", position);
  }

  async checkpointPosition(
    characterId: number,
    position: ZonePositionWrite,
  ): Promise<void> {
    this.rememberPosition(characterId, position);
    await this.writes.flush(characterId);
  }

  flush(characterId: number): Promise<void> {
    return this.writes.flush(characterId);
  }

  defer(characterId: number, intent: ZoneDeferredWrite): void {
    this.writes.defer(characterId, intent);
  }

  grantQuestItem(
    characterId: number,
    itemId: number,
    quantity: number,
  ) {
    return this.writes.critical(characterId, "quest_item_grant", (transaction) =>
      this.database.inTransaction(transaction).progress
        .grantItem(characterId, itemId, quantity)
    );
  }

  grantLoot(
    characterId: number,
    itemId: number,
    quantity: number,
    charges: number,
  ): Promise<InventoryDestination | null> {
    return this.writes.critical(characterId, "loot_award", (transaction) =>
      this.database.inTransaction(transaction).game.grantItemInTransaction(
        characterId,
        itemId,
        quantity,
        charges,
      )
    );
  }

  async merchant(operation: MerchantOperation): Promise<MerchantOperationResult> {
    try {
      return await this.writes.critical(
        operation.characterId,
        `merchant_${operation.action}`,
        async (transaction) => {
          const merchant = this.database.inTransaction(transaction).merchants;
          let mutation: MerchantInventoryMutation | null = null;
          if (operation.action === "buy") {
            mutation = (await merchant.buyInTransaction(operation)).mutation;
          } else if (operation.action === "sell") {
            mutation = (await merchant.sellInTransaction(operation)).mutation;
          }
          const window = await merchant.open(
            operation.characterId,
            operation.npcArchetypeId,
            operation.npcId,
            operation.merchantName,
            operation.zoneId,
            operation.instanceId,
          );
          return { ok: true as const, mutation, window };
        },
      );
    } catch (error) {
      return {
        ok: false,
        message: error instanceof MerchantTransactionError
          ? error.message
          : "Unable to complete that merchant transaction.",
      };
    }
  }

  summonItem(characterId: number, itemId: number): Promise<GrantedInventoryItem | null> {
    return this.writes.critical(characterId, "gm_summon_item", (transaction) =>
      this.database.inTransaction(transaction).game
        .summonItemInTransaction(characterId, itemId)
    );
  }

  purgeInventory(characterId: number) {
    return this.writes.critical(characterId, "gm_purge_items", (transaction) =>
      this.database.inTransaction(transaction).game
        .purgeInventoryInTransaction(characterId)
    );
  }

  replaceEquipment(
    characterId: number,
    gear: readonly (readonly [slot: number, itemId: number])[],
  ) {
    return this.writes.critical(characterId, "gm_gear_up", (transaction) =>
      this.database.inTransaction(transaction).game
        .replaceEquipmentInTransaction(characterId, gear)
    );
  }

  async progressionState(characterId: number, inCombat = false) {
    const current = await this.database.data.characterProgression(characterId);
    return current
      ? progressionState(this.database.techniques, {
          characterId,
          ...current,
          inCombat,
        })
      : null;
  }
}
