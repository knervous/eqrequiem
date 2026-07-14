import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import {
  applyCanonicalContentSchema,
  applyCanonicalRuntimeSchema,
} from "../db/canonical-schema.js";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import { QuestManager } from "../zone/quest-manager.js";
import type { QuestEffect } from "../zone/quest-types.js";
import { questRegistryForZone } from "../zone/quest-zone-registry.js";
import {
  normalizeCharacterName,
  resolveCharacterStats,
  isStartingClassSkill,
  startingItemMatches,
  startingLanguages,
  startingSkills,
} from "./character-rules.js";
import type {
  BackendEvent,
  BackendItemTemplate,
  BackendRequest,
  EmbeddedBackendContent,
  GameBackend,
} from "./contracts.js";
import { movementConfirmations, planInventorySwap } from "./inventory-rules.js";
import { toItemInstance } from "./item-instance.js";

interface EmbeddedSession {
  selectedCharacter: string | null;
  pendingZone: { zoneId: number; instanceId: number } | null;
  activeZone: { zoneId: number; instanceId: number } | null;
}

interface CharacterRow extends DatabaseRow {
  id: number;
  name: string;
  level: number;
  class_id: number;
  race_id: number;
  gender: number;
  deity_id: number;
  zone_id: number;
  zone_instance: number;
  face: number;
  last_login: string | number | null;
  x: number;
  y: number;
  z: number;
  heading: number;
  str: number;
  sta: number;
  dex: number;
  agi: number;
  intelligence: number;
  wis: number;
  cha: number;
}

interface CharacterOriginRow extends DatabaseRow {
  zone_id: number; x: number; y: number; z: number; heading: number;
  bind_zone_id: number; bind_x: number; bind_y: number; bind_z: number; bind_heading: number;
}

interface StartingItemRow extends DatabaseRow {
  item_id: number; quantity: number; inventory_slot: number | null; criteria_json: string;
}

interface ItemRow extends DatabaseRow, BackendItemTemplate {
  item_id?: number;
  slot?: number;
  bag_slot?: number;
}

interface ZoneRow extends DatabaseRow {
  id: number;
  key: string;
  name: string;
  safe_x: number;
  safe_y: number;
  safe_z: number;
}

interface SpawnRow extends DatabaseRow {
  id: number;
  npc_id: number;
  name: string;
  level: number;
  race: number;
  gender: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}

const GENERAL_SLOTS = [22, 23, 24, 25, 26, 27, 28, 29] as const;

/**
 * Transport-neutral backend used by offline Worker transport and available to
 * Node transports. All gameplay mutations live here, never in a transport.
 */
export class EmbeddedGameBackend implements GameBackend {
  private readonly sessions = new Map<number, EmbeddedSession>();
  private readonly zoneSessions = new Map<string, Set<number>>();
  private readonly questManagers = new Map<string, QuestManager>();
  private readonly database: DrizzleDatabase;
  private readonly contentPrefix: string;

  constructor(
    private readonly driver: DatabaseBackend,
    private readonly content: EmbeddedBackendContent,
  ) {
    this.database = new DrizzleDatabase(driver);
    this.contentPrefix = content.contentDatabasePath ? "content_db." : "";
  }

  async initialize(): Promise<void> {
    await this.prepareCanonicalDatabase();
    await applyCanonicalRuntimeSchema(this.driver);
    if (this.content.contentDatabasePath) {
      await this.database.execute("ATTACH DATABASE ? AS content_db", [
        this.content.contentDatabasePath,
      ]);
    } else {
      await applyCanonicalContentSchema(this.driver);
    }
    if (this.content.contentDatabasePath) {
      return;
    }
    for (const zone of this.content.zones) {
      await this.database.execute(
        `INSERT INTO zones (id, short_name, name, safe_x, safe_y, safe_z, enabled)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT DO NOTHING`,
        [
          zone.id,
          zone.shortName,
          zone.longName,
          zone.safeX ?? 0,
          zone.safeY ?? 0,
          zone.safeZ ?? 0,
        ],
      );
    }
    for (const item of this.content.items) {
      await this.upsertItem(item);
    }
  }

  connect(sessionId: number): Promise<BackendEvent[]> {
    this.session(sessionId);
    return Promise.resolve([]);
  }

  disconnect(sessionId: number): Promise<void> {
    this.sessions.delete(sessionId);
    for (const members of this.zoneSessions.values()) {
      members.delete(sessionId);
    }
    return Promise.resolve();
  }

  async handle(
    sessionId: number,
    request: BackendRequest,
  ): Promise<BackendEvent[]> {
    switch (request.type) {
      case "login":
        return [
          event("jwt_response", { status: 1 }),
          await this.characterListEvent(),
        ];
      case "character_create":
        return this.createCharacter(request.character);
      case "character_delete":
        await this.deleteCharacter(request.name.trim());
        return [await this.characterListEvent()];
      case "enter_world":
        return this.enterWorld(sessionId, request.name);
      case "zone_session":
        return this.validateZoneSession(
          sessionId,
          request.zoneId,
          request.instanceId,
        );
      case "zone_change":
        return this.changeZone(sessionId, request.zoneId, request.instanceId);
      case "gm_command":
        return this.gmCommand(sessionId, request.command, request.args);
      case "channel_message":
        return this.channelMessage(sessionId, request);
      case "move_item":
        return this.moveItem(sessionId, request);
      case "delete_item":
        return this.deleteItem(sessionId, request.slot, request.bag);
    }
  }

  close(): Promise<void> {
    return this.database.close();
  }

  private async deleteCharacter(name: string): Promise<void> {
    await this.database.transaction(async (database) => {
      const row = (await database.query<{ id: number }>(
        "SELECT id FROM characters WHERE name = ? LIMIT 1", [name],
      )).rows[0];
      if (!row) return;
      for (const table of [
        "character_quest_state", "player_inventory", "character_languages",
        "character_skills", "character_binds", "character_positions",
      ]) await database.execute(`DELETE FROM ${table} WHERE character_id = ?`, [Number(row.id)]);
      await database.execute("DELETE FROM characters WHERE id = ?", [Number(row.id)]);
    });
  }

  private async createCharacter(
    character: Extract<
      BackendRequest,
      { type: "character_create" }
    >["character"],
  ): Promise<BackendEvent[]> {
    const name = normalizeCharacterName(character.name);
    const stats = resolveCharacterStats(character);
    let created = false;
    if (name && stats) {
      try {
        const origin = await this.resolveCharacterOrigin(character);
        if (!origin) throw new Error("No valid starting origin for this character");
        const accountId = await this.guestAccountId();
        const result = await this.database.execute(
          `INSERT INTO characters
            (account_id, name, class_id, race_id, gender, deity_id, face,
             str, sta, dex, agi, intelligence, wis, cha, unspent_stat_points)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            accountId,
            name,
            character.charClass,
            character.race,
            character.gender,
            character.deity,
            character.face,
            stats.str, stats.sta, stats.dex, stats.agi, stats.intel,
            stats.wis, stats.cha, stats.points,
          ],
        );
        created = result.affectedRows > 0;
        if (created) {
          const row = await this.character(name);
          if (row) {
            await this.database.execute(
              `INSERT INTO character_positions
                (character_id, zone_id, instance_id, x, y, z, heading)
               VALUES (?, ?, 0, ?, ?, ?, ?)`,
              [row.id, origin.zone_id, origin.x, origin.y, origin.z, origin.heading],
            );
            for (let slot = 0; slot < 5; slot++) {
              await this.database.execute(
                `INSERT INTO character_binds
                  (character_id, slot, zone_id, instance_id, x, y, z, heading)
                 VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
                [row.id, slot, origin.bind_zone_id, origin.bind_x, origin.bind_y, origin.bind_z, origin.bind_heading],
              );
            }
            await this.seedCharacterSkillsAndLanguages(row.id, character.race, character.charClass);
            await this.grantStartingItems(row.id, character, origin.zone_id);
          }
        }
      } catch {
        created = false;
      }
    }
    return [
      event("approve_name", { value: created ? 1 : 0 }),
      await this.characterListEvent(),
    ];
  }

  private async resolveCharacterOrigin(character: Extract<BackendRequest, { type: "character_create" }>["character"]): Promise<CharacterOriginRow | null> {
    const rows = (await this.database.query<CharacterOriginRow>(
      `SELECT zone_id, x, y, z, heading, bind_zone_id, bind_x, bind_y, bind_z, bind_heading
       FROM ${this.contentPrefix}character_origins
       WHERE race_id = ? AND class_id = ? AND deity_id = ?
         AND (start_zone_id = ? OR zone_id = ?)
       ORDER BY CASE WHEN start_zone_id = ? THEN 0 ELSE 1 END, priority DESC LIMIT 1`,
      [character.race, character.charClass, character.deity, character.startZone, character.startZone, character.startZone],
    )).rows;
    if (rows[0]) return rows[0];
    const hasOrigins = Number((await this.database.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${this.contentPrefix}character_origins`,
    )).rows[0]?.count ?? 0) > 0;
    if (hasOrigins) return null;
    const zone = (await this.database.query<ZoneRow>(
      `SELECT id, short_name AS key, name, safe_x, safe_y, safe_z FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`,
      [character.startZone],
    )).rows[0];
    return zone ? {
      zone_id: Number(zone.id), x: Number(zone.safe_x), y: Number(zone.safe_y), z: Number(zone.safe_z), heading: 0,
      bind_zone_id: Number(zone.id), bind_x: Number(zone.safe_x), bind_y: Number(zone.safe_y), bind_z: Number(zone.safe_z), bind_heading: 0,
    } : null;
  }

  private async grantStartingItems(characterId: number, character: Extract<BackendRequest, { type: "character_create" }>["character"], zoneId: number): Promise<void> {
    const rows = (await this.database.query<StartingItemRow>(
      `SELECT item_id, quantity, inventory_slot, criteria_json FROM ${this.contentPrefix}character_starting_items ORDER BY id`,
    )).rows.filter(row => startingItemMatches(row.criteria_json, character, zoneId));
    const occupied = new Set<number>();
    for (const row of rows) {
      let slot = row.inventory_slot === null ? -1 : Number(row.inventory_slot);
      if (slot < 0 || occupied.has(slot)) slot = GENERAL_SLOTS.find(candidate => !occupied.has(candidate)) ?? 30;
      occupied.add(slot);
      await this.database.execute(
        `INSERT INTO player_inventory (character_id, bag, slot, item_id, quantity)
         VALUES (?, -1, ?, ?, ?)`,
        [characterId, slot, Number(row.item_id), Math.max(1, Number(row.quantity))],
      );
    }
  }

  private async seedCharacterSkillsAndLanguages(characterId: number, race: number, charClass: number): Promise<void> {
    const skills = new Map(startingSkills(race));
    const classSkills = (await this.database.query<{ skill_id: number; cap: number }>(
      `SELECT skill_id, cap FROM ${this.contentPrefix}class_skill_caps
       WHERE class_id = ? AND level = 1 AND cap > 0`, [charClass],
    )).rows;
    for (const row of classSkills) {
      const skillId = Number(row.skill_id);
      if (!skills.has(skillId) && isStartingClassSkill(skillId)) skills.set(skillId, Number(row.cap));
    }
    for (const [skill, value] of skills) await this.database.execute(
      "INSERT INTO character_skills (character_id, skill_id, value) VALUES (?, ?, ?)", [characterId, skill, value],
    );
    for (const [language, value] of startingLanguages(race, charClass)) await this.database.execute(
      "INSERT INTO character_languages (character_id, language_id, value) VALUES (?, ?, ?)", [characterId, language, value],
    );
  }

  private async enterWorld(
    sessionId: number,
    rawName: string,
  ): Promise<BackendEvent[]> {
    const name = rawName.trim();
    const character = await this.character(name);
    if (character) {
      this.session(sessionId).selectedCharacter = character.name;
      await this.database.execute(
        "UPDATE characters SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
        [character.id],
      );
    }
    return [event("post_enter_world", { value: character ? 1 : 0 })];
  }

  private async validateZoneSession(
    sessionId: number,
    zone: number | string,
    instanceId: number,
  ): Promise<BackendEvent[]> {
    const zoneId = await this.resolveZoneId(zone);
    if (zoneId !== null) {
      this.session(sessionId).pendingZone = { zoneId, instanceId };
    }
    return [event("zone_session_valid", { value: zoneId === null ? 0 : 1 })];
  }

  private async changeZone(
    sessionId: number,
    requestedZone: number | string | undefined,
    instanceId: number,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (requestedZone !== undefined) {
      const zoneId = await this.resolveZoneId(requestedZone);
      if (zoneId === null) {
        return [serverMessage(`Unknown or unavailable zone: ${requestedZone}`)];
      }
      session.pendingZone = { zoneId, instanceId };
      if (session.selectedCharacter) {
        await this.database.execute(
          `UPDATE character_positions SET zone_id = ?, instance_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE character_id = (SELECT id FROM characters WHERE name = ?)`,
          [zoneId, instanceId, session.selectedCharacter],
        );
      }
    }
    if (!session.selectedCharacter || !session.pendingZone) {
      throw new Error("Unable to attach client session to zone instance");
    }
    session.activeZone = session.pendingZone;
    session.pendingZone = null;
    return this.zoneBootstrap(sessionId, session);
  }

  private async gmCommand(
    sessionId: number,
    rawCommand: string,
    args: string[],
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    const name = session.selectedCharacter;
    if (!name) {
      return [
        serverMessage("A character must be active before using GM commands."),
      ];
    }
    const command = rawCommand.trim().toLowerCase();
    if (command === "level") {
      const level = Number(args[0]);
      if (!Number.isInteger(level) || level < 1 || level > 50) {
        return [serverMessage("Level must be between 1 and 50.")];
      }
      await this.database.execute(
        "UPDATE characters SET level = ? WHERE name = ?",
        [level, name],
      );
      return [event("level_update", { level, exp: 0 })];
    }
    if (command === "searchitem") {
      const search = args.join(" ").trim();
      if (!search) {
        return [serverMessage("Usage: #searchitem {name}")];
      }
      const rows = (
        await this.database.query<{ id: number; name: string }>(
          `SELECT id, name FROM ${this.contentPrefix}items WHERE name LIKE ? ORDER BY name LIMIT 20`,
          [`%${search}%`],
        )
      ).rows;
      return [
        serverMessage(
          rows.length
            ? rows.map((row) => `${row.id}: ${row.name}`).join(" | ")
            : `No items matched '${search}'.`,
        ),
      ];
    }
    if (command === "summonitem") {
      return this.summonItem(name, Number(args[0]), args[0]);
    }
    if (command === "purgeitems") {
      return this.purgeItems(name);
    }
    if (command === "gearup") {
      return this.gearUp(name);
    }
    return [serverMessage(`Unsupported GM command: #${command}`)];
  }

  private async channelMessage(
    sessionId: number,
    request: Extract<BackendRequest, { type: "channel_message" }>,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (
      !session.activeZone ||
      !session.selectedCharacter ||
      request.channel !== 0
    ) {
      return [];
    }
    const target = (
      await this.database.query<SpawnRow>(
        `${spawnSelect(this.contentPrefix)}
       WHERE sp.zone_id = ? AND lower(replace(npc.name, '_', ' ')) = lower(replace(?, '_', ' '))
       LIMIT 1`,
        [session.activeZone.zoneId, request.targetName],
      )
    ).rows[0];
    if (!target) {
      return [];
    }
    const player = await this.character(session.selectedCharacter);
    const effects = this.questManager(
      session.activeZone.zoneId,
      session.activeZone.instanceId,
    ).dispatch({
      type: "say",
      tick: 0,
      sessionId,
      actorName: session.selectedCharacter,
      npcName: target.name,
      message: request.message,
      actor: {
        kind: "player",
        sessionId,
        name: session.selectedCharacter,
        ...(player === undefined
          ? {}
          : {
              id: player.id,
              level: player.level,
              classId: player.class_id,
              raceId: player.race_id,
              gender: player.gender,
            }),
      },
      receiver: {
        kind: "npc",
        id: target.id,
        npcId: target.npc_id,
        name: target.name,
        level: target.level,
        raceId: target.race,
        gender: target.gender,
        position: {
          x: target.x,
          y: target.y,
          z: target.z,
          heading: target.heading,
        },
      },
    });
    return this.questEvents(effects, session.selectedCharacter);
  }

  private questManager(zoneId: number, instanceId: number): QuestManager {
    const key = `${zoneId}:${instanceId}`;
    const current = this.questManagers.get(key);
    if (current) {
      return current;
    }
    const created = new QuestManager(
      zoneId,
      instanceId,
      questRegistryForZone(zoneId)?.zone.shortName ?? null,
    );
    created.replace(this.content.quests ?? [], 1);
    this.questManagers.set(key, created);
    return created;
  }

  private questEvents(
    effects: readonly QuestEffect[],
    actorName: string,
  ): BackendEvent[] {
    return effects.flatMap((effect): BackendEvent[] => {
      if (effect.type !== "npc_say" && effect.type !== "entity_say") {
        return [];
      }
      return [
        event(
          "channel_message",
          {
            sender:
              effect.type === "npc_say" ? effect.npcName : effect.entityName,
            target: actorName,
            message: effect.message,
            chanNum: 0,
          },
          "control-stream",
        ),
      ];
    });
  }

  private async summonItem(
    characterName: string,
    itemId: number,
    rawId: string | undefined,
  ): Promise<BackendEvent[]> {
    const item = await this.getItem(itemId);
    if (!item) {
      return [
        serverMessage(
          `Item ${rawId ?? ""} was not found in the offline catalog.`,
        ),
      ];
    }
    const occupiedRows = (
      await this.database.query<{ slot: number }>(
        `SELECT slot FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?)
         AND bag = 0 AND slot BETWEEN 22 AND 29`,
        [characterName],
      )
    ).rows;
    const occupied = new Set(occupiedRows.map((row) => Number(row.slot)));
    const slot =
      GENERAL_SLOTS.find((candidate) => !occupied.has(candidate)) ?? 30;
    if (slot === 30) {
      const cursor = await this.inventoryAt(characterName, 30, 0);
      if (cursor) {
        return [serverMessage("Your general inventory and cursor are full.")];
      }
    }
    await this.database.execute(
      `INSERT INTO player_inventory (character_id, slot, bag, item_id)
       SELECT id, ?, 0, ? FROM characters WHERE name = ?`,
      [slot, itemId, characterName],
    );
    return [event("add_item", this.itemInstance(item, slot, 0))];
  }

  private async purgeItems(characterName: string): Promise<BackendEvent[]> {
    const rows = (
      await this.database.query<{ slot: number; bag: number }>(
        `SELECT slot, bag FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?)`,
        [characterName],
      )
    ).rows;
    await this.database.execute(
      "DELETE FROM player_inventory WHERE character_id = (SELECT id FROM characters WHERE name = ?)",
      [characterName],
    );
    return [
      event("bulk_delete_items", {
        items: rows.map((row) => ({
          slot: Number(row.slot),
          bag: Number(row.bag),
        })),
      }),
    ];
  }

  private async gearUp(characterName: string): Promise<BackendEvent[]> {
    const character = await this.character(characterName);
    const gear = character
      ? this.content.gearSets[
          `${Number(character.class_id)}:${Number(character.level)}`
        ]
      : undefined;
    if (!character || !gear?.length) {
      return [
        serverMessage("No offline gear set exists for this class and level."),
      ];
    }
    const old = (
      await this.database.query<{ slot: number; bag: number }>(
        `SELECT slot, bag FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?) AND bag = -1`,
        [characterName],
      )
    ).rows;
    await this.database.transaction(async (database) => {
      await database.execute(
        `DELETE FROM player_inventory
         WHERE character_id = (SELECT id FROM characters WHERE name = ?) AND bag = -1`,
        [characterName],
      );
      for (const [slot, itemId] of gear) {
        await database.execute(
          `INSERT INTO player_inventory (character_id, slot, bag, item_id)
           SELECT character.id, ?, -1, item.id FROM characters character, ${this.contentPrefix}items item
           WHERE character.name = ? AND item.id = ?`,
          [slot, characterName, itemId],
        );
      }
    });
    const events: BackendEvent[] = [];
    if (old.length) {
      events.push(
        event("bulk_delete_items", {
          items: old.map((row) => ({
            slot: Number(row.slot),
            bag: Number(row.bag),
          })),
        }),
      );
    }
    events.push(
      event("bulk_items", { items: await this.inventoryItems(characterName) }),
    );
    events.push(
      serverMessage(
        `Loaded the level ${character.level} class ${character.class_id} gear set.`,
      ),
    );
    return events;
  }

  private async moveItem(
    sessionId: number,
    request: Extract<BackendRequest, { type: "move_item" }>,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    const name = session.selectedCharacter;
    if (!name) {
      return [];
    }
    const values = [
      request.fromSlot,
      request.toSlot,
      request.fromBag,
      request.toBag,
    ];
    if (!values.every(Number.isInteger)) {
      return [];
    }
    const rows = await this.inventoryRows(name);
    const source = rows.find(
      (row) => row.slot === request.fromSlot && row.bag === request.fromBag,
    );
    const destination = rows.find(
      (row) => row.slot === request.toSlot && row.bag === request.toBag,
    );
    if (!source && !destination) {
      return [];
    }
    if (
      !this.itemAllowed(source?.item, request.toSlot) ||
      !this.itemAllowed(destination?.item, request.fromSlot)
    ) {
      return [serverMessage("That item cannot be equipped in that slot.")];
    }
    const character = await this.character(name);
    if (
      !character ||
      !this.characterCanEquip(character, source?.item, request.toSlot) ||
      !this.characterCanEquip(character, destination?.item, request.fromSlot)
    ) {
      return [serverMessage("Your class or race cannot equip that item.")];
    }
    let moves;
    try {
      moves = planInventorySwap(
        rows.map((row) => ({
          slot: row.slot,
          bag: row.bag,
          itemKey: row.item.id,
          containerSlots: row.item.bagslots,
        })),
        { slot: request.fromSlot, bag: request.fromBag },
        { slot: request.toSlot, bag: request.toBag },
      );
    } catch (error) {
      return [
        serverMessage(error instanceof Error ? error.message : String(error)),
      ];
    }
    await this.database.transaction(async (database) => {
      for (const move of moves) {
        await database.execute(
          `DELETE FROM player_inventory
           WHERE character_id = (SELECT id FROM characters WHERE name = ?)
             AND slot = ? AND bag = ?`,
          [name, move.fromSlot, move.fromBag],
        );
      }
      for (const move of moves) {
        await database.execute(
          `INSERT INTO player_inventory (character_id, slot, bag, item_id)
           SELECT id, ?, ?, ? FROM characters WHERE name = ?`,
          [move.slot, move.bag, Number(move.itemKey), name],
        );
      }
    });
    return movementConfirmations(
      moves,
      { slot: request.fromSlot, bag: request.fromBag },
      { slot: request.toSlot, bag: request.toBag },
    ).map((move) =>
      event(
        "move_item",
        {
          ...move,
          fromBagSlot: move.fromBag,
          toBagSlot: move.toBag,
          numberInStack: 1,
        },
        "control-stream",
      ),
    );
  }

  private async deleteItem(
    sessionId: number,
    slot: number,
    bag: number,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!session.selectedCharacter || slot !== 30) {
      return [];
    }
    await this.database.execute(
      `DELETE FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?) AND slot = 30 AND bag = ?`,
      [session.selectedCharacter, bag],
    );
    return [event("delete_item", { slot, bag })];
  }

  private async zoneBootstrap(
    sessionId: number,
    session: EmbeddedSession,
  ): Promise<BackendEvent[]> {
    const route = session.activeZone;
    if (!route || !session.selectedCharacter) {
      throw new Error("No active zone route");
    }
    const zone = (
      await this.database.query<ZoneRow>(
        `SELECT id, short_name AS key, name, safe_x, safe_y, safe_z
       FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`,
        [route.zoneId],
      )
    ).rows[0];
    const character = await this.character(session.selectedCharacter);
    if (!zone || !character) {
      throw new Error("Unable to load zone bootstrap data");
    }
    for (const members of this.zoneSessions.values()) {
      members.delete(sessionId);
    }
    const key = `${route.zoneId}:${route.instanceId}`;
    const members = this.zoneSessions.get(key) ?? new Set<number>();
    members.add(sessionId);
    this.zoneSessions.set(key, members);
    const spawns = (
      await this.database.query<DatabaseRow>(
        `${spawnSelect(this.contentPrefix)} WHERE sp.zone_id = ? ORDER BY sp.id`,
        [route.zoneId],
      )
    ).rows.map((spawn) => {
      const properties = jsonObject(spawn.properties_json);
      return {
        id: Number(spawn.npc_id),
        spawnId: Number(spawn.id),
        name: String(spawn.name),
        x: Number(spawn.x),
        y: Number(spawn.y),
        z: Number(spawn.z),
        heading: Number(spawn.heading),
        race: Number(spawn.race ?? 1),
        gender: Number(spawn.gender ?? 0),
        level: Number(spawn.level ?? 1),
        isNpc: true,
        size: finiteNumber(properties.size, 6),
        face: finiteNumber(properties.face, 0),
        helm: finiteNumber(properties.helm, 0),
        equipChest: finiteNumber(properties.texture, 0),
        equipment: {
          head: finiteNumber(properties.helm, 0),
          chest: finiteNumber(properties.texture, 0),
          primary: finiteNumber(properties.primary, 0),
          secondary: finiteNumber(properties.secondary, 0),
        },
        charClass: finiteNumber(properties.classId, 1),
        bodytype: finiteNumber(properties.bodyType, 1),
      };
    });
    this.questManager(route.zoneId, route.instanceId).hydrate({
      players: [
        {
          kind: "player",
          sessionId,
          id: Number(character.id),
          name: character.name,
          level: Number(character.level),
          classId: Number(character.class_id),
          raceId: Number(character.race_id),
          gender: Number(character.gender),
          position: {
            x: Number(character.x),
            y: Number(character.y),
            z: Number(character.z),
            heading: Number(character.heading),
          },
        },
      ],
      npcs: spawns.map((spawn, npcIndex) => ({
        kind: "npc",
        id: spawn.spawnId,
        npcId: spawn.id,
        npcIndex,
        name: spawn.name,
        level: spawn.level,
        raceId: spawn.race,
        gender: spawn.gender,
        position: {
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          heading: spawn.heading,
        },
      })),
    });
    return [
      event(
        "new_zone",
        {
          zoneId: route.zoneId,
          zoneIdNumber: route.zoneId,
          instanceId: route.instanceId,
          shortName: zone.key,
          longName: zone.name,
          zonePoints: [],
        },
        "control-stream",
      ),
      event(
        "player_profile",
        {
          name: character.name,
          level: Number(character.level),
          charClass: Number(character.class_id),
          race: Number(character.race_id),
          gender: Number(character.gender),
          deity: Number(character.deity_id),
          face: Number(character.face),
          zoneId: route.zoneId,
          zoneInstance: route.instanceId,
          x: Number(character.x),
          y: Number(character.y),
          z: Number(character.z),
          heading: Number(character.heading),
          str: Number(character.str),
          sta: Number(character.sta),
          dex: Number(character.dex),
          agi: Number(character.agi),
          intel: Number(character.intelligence),
          wis: Number(character.wis),
          cha: Number(character.cha),
          inventoryItems: await this.inventoryItems(character.name),
        },
        "control-stream",
      ),
      event("zone_spawns", { spawns }, "control-stream"),
    ];
  }

  private async characterListEvent(): Promise<BackendEvent> {
    const rows = (
      await this.database.query<CharacterRow>(
        `${CHARACTER_SELECT} ORDER BY character.name LIMIT 8`,
      )
    ).rows;
    const characters = await Promise.all(
      rows.map(async (row) => ({
        name: row.name,
        level: Number(row.level),
        charClass: Number(row.class_id),
        race: Number(row.race_id),
        gender: Number(row.gender),
        deity: Number(row.deity_id),
        zone: Number(row.zone_id),
        instance: Number(row.zone_instance),
        face: Number(row.face),
        lastLogin: timestamp(row.last_login),
        enabled: 1,
        items: await this.inventoryItems(row.name),
      })),
    );
    return event(
      "character_select",
      {
        characterCount: characters.length,
        characters,
      },
      "control-stream",
    );
  }

  private async ensureSelectedCharacter(
    sessionId: number,
  ): Promise<EmbeddedSession> {
    const session = this.session(sessionId);
    if (session.selectedCharacter) {
      return session;
    }
    const row = (
      await this.database.query<{ name: string }>(
        "SELECT name FROM characters ORDER BY last_login_at DESC, id LIMIT 1",
      )
    ).rows[0];
    if (row) {
      session.selectedCharacter = row.name;
    }
    return session;
  }

  private session(sessionId: number): EmbeddedSession {
    const current = this.sessions.get(sessionId);
    if (current) {
      return current;
    }
    const created: EmbeddedSession = {
      selectedCharacter: null,
      pendingZone: null,
      activeZone: null,
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  private async resolveZoneId(value: number | string): Promise<number | null> {
    const numeric =
      typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : value;
    const row = (
      await this.database.query<{ id: number }>(
        typeof numeric === "number"
          ? `SELECT id FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`
          : `SELECT id FROM ${this.contentPrefix}zones WHERE lower(short_name) = lower(?) LIMIT 1`,
        [numeric],
      )
    ).rows[0];
    return row ? Number(row.id) : null;
  }

  private async inventoryRows(characterName: string): Promise<
    Array<{
      slot: number;
      bag: number;
      item: ItemRow;
    }>
  > {
    const rows = (
      await this.database.query<ItemRow>(
        `SELECT inventory.item_id, inventory.slot, inventory.bag AS bag_slot, item.*
       FROM player_inventory inventory JOIN ${this.contentPrefix}items item ON item.id = inventory.item_id
       JOIN characters character ON character.id = inventory.character_id
       WHERE character.name = ? ORDER BY inventory.slot, inventory.bag`,
        [characterName],
      )
    ).rows;
    return rows.map((row) => ({
      slot: Number(row.slot),
      bag: Number(row.bag_slot),
      item: row,
    }));
  }

  private async inventoryItems(
    characterName: string,
  ): Promise<Record<string, unknown>[]> {
    return (await this.inventoryRows(characterName)).map((row) =>
      this.itemInstance(row.item, row.slot, row.bag),
    );
  }

  private async inventoryAt(
    characterName: string,
    slot: number,
    bag: number,
  ): Promise<ItemRow | null> {
    const row = (
      await this.database.query<ItemRow>(
        `SELECT inventory.item_id, inventory.slot, inventory.bag AS bag_slot, item.*
       FROM player_inventory inventory JOIN ${this.contentPrefix}items item ON item.id = inventory.item_id
       JOIN characters character ON character.id = inventory.character_id
       WHERE character.name = ? AND inventory.slot = ? AND inventory.bag = ? LIMIT 1`,
        [characterName, slot, bag],
      )
    ).rows[0];
    return row ?? null;
  }

  private async getItem(itemId: number): Promise<ItemRow | null> {
    if (!Number.isInteger(itemId)) {
      return null;
    }
    return (
      (
        await this.database.query<ItemRow>(
          `SELECT * FROM ${this.contentPrefix}items WHERE id = ? LIMIT 1`,
          [itemId],
        )
      ).rows[0] ?? null
    );
  }

  private itemInstance(
    item: ItemRow,
    slot: number,
    bagSlot: number,
  ): Record<string, unknown> {
    return toItemInstance(item, slot, bagSlot);
  }

  private itemAllowed(item: ItemRow | undefined, slot: number): boolean {
    return (
      !item ||
      slot === 30 ||
      slot < 0 ||
      slot > 21 ||
      (Number(item.slots) & (1 << slot)) !== 0
    );
  }

  private characterCanEquip(
    character: CharacterRow,
    item: ItemRow | undefined,
    slot: number,
  ): boolean {
    if (!item || slot < 0 || slot > 21) {
      return true;
    }
    return (
      (Number(item.classes) & (1 << (Number(character.class_id) - 1))) !== 0 &&
      (Number(item.races) & (1 << (Number(character.race_id) - 1))) !== 0
    );
  }

  private async upsertItem(item: BackendItemTemplate): Promise<void> {
    await this.database.execute(
      `INSERT INTO items
        (id, name, idfile, icon, material, color, itemtype, slots, ac, bagslots,
         classes, races, stackable, stacksize, maxcharges, weight, damage, delay,
         astr, asta, adex, aagi, aint, awis, acha, hp, mana, dr, mr, cr, fr, pr,
         haste, magic, nodrop)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, idfile = excluded.idfile,
         icon = excluded.icon, material = excluded.material, color = excluded.color,
         itemtype = excluded.itemtype, slots = excluded.slots, ac = excluded.ac,
         bagslots = excluded.bagslots, classes = excluded.classes, races = excluded.races,
         stackable = excluded.stackable, stacksize = excluded.stacksize,
         maxcharges = excluded.maxcharges, weight = excluded.weight,
         damage = excluded.damage, delay = excluded.delay, astr = excluded.astr,
         asta = excluded.asta, adex = excluded.adex, aagi = excluded.aagi,
         aint = excluded.aint, awis = excluded.awis, acha = excluded.acha,
         hp = excluded.hp, mana = excluded.mana, dr = excluded.dr, mr = excluded.mr,
         cr = excluded.cr, fr = excluded.fr, pr = excluded.pr, haste = excluded.haste,
         magic = excluded.magic, nodrop = excluded.nodrop`,
      [
        item.id,
        item.name,
        item.idfile,
        item.icon,
        item.material,
        item.color,
        item.itemtype,
        item.slots,
        item.ac,
        item.bagslots,
        item.classes,
        item.races,
        item.stackable,
        item.stacksize,
        item.maxcharges,
        item.weight ?? 0,
        item.damage ?? 0,
        item.delay ?? 0,
        item.astr ?? 0,
        item.asta ?? 0,
        item.adex ?? 0,
        item.aagi ?? 0,
        item.aint ?? 0,
        item.awis ?? 0,
        item.acha ?? 0,
        item.hp ?? 0,
        item.mana ?? 0,
        item.dr ?? 0,
        item.mr ?? 0,
        item.cr ?? 0,
        item.fr ?? 0,
        item.pr ?? 0,
        item.haste ?? 0,
        item.magic ?? 0,
        item.nodrop ?? 0,
      ],
    );
  }

  private async prepareCanonicalDatabase(): Promise<void> {
    let version: string | undefined;
    try {
      version = (
        await this.database.query<{ value: string }>(
          "SELECT value FROM app_meta WHERE key = 'schema_version' LIMIT 1",
        )
      ).rows[0]?.value;
    } catch {
      // A pre-canonical offline database is intentionally replaced below.
    }
    if (version === EMBEDDED_SCHEMA_VERSION) {
      return;
    }
    if (version === "3") {
      await this.database.execute("PRAGMA foreign_keys = OFF");
      for (const table of CONTENT_TABLES) {
        await this.database.execute(`DROP TABLE IF EXISTS ${table}`);
      }
      await this.database.execute("PRAGMA foreign_keys = ON");
      await this.database.execute(
        "UPDATE app_meta SET value = ? WHERE key = 'schema_version'",
        [EMBEDDED_SCHEMA_VERSION],
      );
      return;
    }
    await this.database.execute("PRAGMA foreign_keys = OFF");
    for (const table of RESET_TABLES) {
      await this.database.execute(`DROP TABLE IF EXISTS ${table}`);
    }
    await this.database.execute("PRAGMA foreign_keys = ON");
    await this.database.execute(
      "CREATE TABLE app_meta (key VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL)",
    );
    await this.database.execute(
      "INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)",
      [EMBEDDED_SCHEMA_VERSION],
    );
  }

  private async guestAccountId(): Promise<number> {
    await this.database.execute(
      "INSERT INTO accounts (identity) SELECT 'offline' WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE identity = 'offline')",
    );
    const row = (
      await this.database.query<{ id: number }>(
        "SELECT id FROM accounts WHERE identity = 'offline' LIMIT 1",
      )
    ).rows[0];
    if (!row) {
      throw new Error("Unable to create offline account");
    }
    return Number(row.id);
  }

  private async character(name: string): Promise<CharacterRow | undefined> {
    return (
      await this.database.query<CharacterRow>(
        `${CHARACTER_SELECT} WHERE character.name = ? LIMIT 1`,
        [name],
      )
    ).rows[0];
  }

}

function event(
  type: BackendEvent["type"],
  value: Record<string, unknown>,
  transport: BackendEvent["transport"] = "datagram",
): BackendEvent {
  return { type, value, transport };
}

function serverMessage(message: string): BackendEvent {
  return event("channel_message", {
    sender: "Server",
    target: "",
    message,
    chanNum: -1,
  });
}

function timestamp(value: string | number | null): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

const EMBEDDED_SCHEMA_VERSION = "5";

const CONTENT_TABLES = [
  "class_skill_caps",
  "character_starting_items",
  "character_origins",
  "spawn_points",
  "spawn_group_members",
  "spawn_groups",
  "npc_archetypes",
  "quest_definitions",
  "zones",
  "items",
  "content_releases",
] as const;

const RESET_TABLES = [
  "local_inventory",
  "local_items",
  "local_spawns",
  "offline_hydration",
  "character_quest_state",
  "player_inventory",
  "character_positions",
  "characters",
  "accounts",
  "character_languages",
  "character_skills",
  "character_binds",
  "spawn_points",
  "spawn_group_members",
  "spawn_groups",
  "npc_archetypes",
  "quest_definitions",
  "zones",
  "items",
  "content_releases",
  "character_starting_items",
  "character_origins",
  "class_skill_caps",
  "schema_migrations",
  "app_meta",
] as const;

const CHARACTER_SELECT = `SELECT character.id, character.name, character.level,
  character.class_id, character.race_id, character.gender, character.deity_id,
  character.face, character.last_login_at AS last_login,
  character.str, character.sta, character.dex, character.agi,
  character.intelligence, character.wis, character.cha,
  position.zone_id, position.instance_id AS zone_instance,
  position.x, position.y, position.z, position.heading
  FROM characters character
  LEFT JOIN character_positions position ON position.character_id = character.id`;

function spawnSelect(prefix: string): string {
  return `SELECT sp.id, npc.id AS npc_id, npc.name, npc.level,
  npc.race_id AS race, npc.gender, npc.properties_json, sp.x, sp.y, sp.z, sp.heading
  FROM ${prefix}spawn_points sp
  JOIN ${prefix}npc_archetypes npc ON npc.id = (
    SELECT member.npc_archetype_id FROM ${prefix}spawn_group_members member
    WHERE member.spawn_group_id = sp.spawn_group_id
    ORDER BY member.weight DESC, member.npc_archetype_id LIMIT 1)
  AND sp.enabled = 1`;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
