import { toItemInstance } from "../backend/item-instance.js";
import type { GameDatabase } from "../persist/game-database.js";
import type { CharacterApplicationService } from "./character-application-service.js";
import type { CharacterCombatProjection } from "../persist/game-data-repository.js";

export type GearSetCatalog = Readonly<
  Record<string, readonly (readonly [slot: number, itemId: number])[]>
>;

export type GmCommandEffect =
  | { readonly type: "message"; readonly message: string }
  | {
      readonly type: "level";
      readonly level: number;
      readonly experience: number;
      readonly combat: CharacterCombatProjection;
    }
  | { readonly type: "inventory_put"; readonly item: Record<string, unknown> }
  | {
      readonly type: "inventory_delete_many";
      readonly items: readonly { readonly slot: number; readonly bag: number }[];
    }
  | {
      readonly type: "inventory_replace";
      readonly removed: readonly { readonly slot: number; readonly bag: number }[];
      readonly items: readonly Record<string, unknown>[];
      readonly level: number;
      readonly combat: CharacterCombatProjection;
    };

/** One command parser and application path for live and embedded zones. */
export class GmCommandService {
  constructor(
    private readonly database: GameDatabase,
    private readonly characters: CharacterApplicationService,
    private readonly gearSets: GearSetCatalog,
  ) {}

  async execute(
    characterId: number,
    rawCommand: string,
    args: readonly string[],
  ): Promise<readonly GmCommandEffect[]> {
    const command = rawCommand.trim().toLowerCase();
    switch (command) {
      case "level":
        return this.level(characterId, args[0]);
      case "searchitem":
        return this.searchItems(args);
      case "summonitem":
        return this.summonItem(characterId, args[0]);
      case "purgeitems":
        return this.purgeItems(characterId);
      case "gearup":
        return this.gearUp(characterId);
      default:
        return [{ type: "message", message: `Unsupported GM command: #${command}` }];
    }
  }

  private async level(
    characterId: number,
    rawLevel: string | undefined,
  ): Promise<readonly GmCommandEffect[]> {
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level < 1 || level > 50) {
      return [{ type: "message", message: "Level must be between 1 and 50." }];
    }
    await this.characters.setLevel(characterId, level);
    const combat = await this.database.data.characterCombat(characterId);
    if (!combat) throw new Error(`Character ${characterId} does not exist.`);
    return [{ type: "level", level, experience: 0, combat }];
  }

  private async searchItems(
    args: readonly string[],
  ): Promise<readonly GmCommandEffect[]> {
    const search = args.join(" ").trim();
    if (!search) {
      return [{ type: "message", message: "Usage: #searchitem {name}" }];
    }
    const rows = await this.database.data.searchItems(search);
    return [{
      type: "message",
      message: rows.length
        ? rows.map((row) => `${row.id}: ${row.name}`).join(" | ")
        : `No items matched '${search}'.`,
    }];
  }

  private async summonItem(
    characterId: number,
    rawItemId: string | undefined,
  ): Promise<readonly GmCommandEffect[]> {
    const stored = await this.characters.summonItem(
      characterId,
      Number(rawItemId),
    );
    return stored
      ? [{
          type: "inventory_put",
          item: toItemInstance(stored.item, stored.slot, stored.bag),
        }]
      : [{
          type: "message",
          message: `Item ${rawItemId ?? ""} was not found, or inventory is full.`,
        }];
  }

  private async purgeItems(
    characterId: number,
  ): Promise<readonly GmCommandEffect[]> {
    const rows = await this.characters.purgeInventory(characterId);
    return [{
      type: "inventory_delete_many",
      items: rows.map((row) => ({
        slot: Number(row.slot),
        bag: Number(row.bag),
      })),
    }];
  }

  private async gearUp(
    characterId: number,
  ): Promise<readonly GmCommandEffect[]> {
    const character = await this.database.data.characterById(characterId);
    const gear = character
      ? this.gearSets[`${Number(character.class_id)}:${Number(character.level)}`]
      : undefined;
    if (!character || !gear?.length) {
      return [{
        type: "message",
        message: "No gear set exists for this class and level.",
      }];
    }
    const removed = await this.characters.replaceEquipment(characterId, gear);
    const combat = await this.database.data.characterCombat(characterId);
    if (!combat) throw new Error(`Character ${characterId} does not exist.`);
    return [
      {
        type: "inventory_replace",
        removed: removed.map((row) => ({
          slot: Number(row.slot),
          bag: Number(row.bag),
        })),
        items: await this.database.data.inventoryItems(characterId),
        level: Number(character.level),
        combat,
      },
      {
        type: "message",
        message:
          `Loaded the level ${character.level} class ${character.class_id} gear set.`,
      },
    ];
  }
}
