import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import {
  applyCanonicalContentSchema,
  applyCanonicalRuntimeSchema,
} from "../db/canonical-schema.js";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import { GameDataRepository } from "../persist/game-data-repository.js";
import { QuestManager } from "../zone/quest-manager.js";
import { radiansToEqHeading } from "../zone/heading.js";
import type { QuestEffect } from "../zone/quest-types.js";
import { questRegistryForZone } from "../zone/quest-zone-registry.js";
import {
  EmbeddedZoneRuntime,
  type EmbeddedDeathEvent,
  type EmbeddedZoneRuntimeOptions,
  type ZoneKernelFactory,
} from "../zone/embedded-zone-runtime.js";
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
  BackendEventDelivery,
  BackendItemTemplate,
  BackendRequest,
  EmbeddedBackendContent,
  GameBackend,
} from "./contracts.js";
import { movementConfirmations, planInventorySwap } from "./inventory-rules.js";
import { toItemInstance } from "./item-instance.js";
import {
  MerchantRepository,
  MerchantTransactionError,
} from "../merchant/merchant-repository.js";
import { ZoneSnapshotRepository } from "../persist/zone-snapshot-repository.js";
import { corpseName } from "../combat/corpse-loot.js";
import { EntityKind } from "../zone/entity-store.js";

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
  appearance_schema_version: number | null;
  body_family_id: string | null;
  body_component_id: string | null;
  face_component_id: string | null;
  presentation_id: string | null;
  calling_id: string | null;
  origin_id: string | null;
}

interface CharacterOriginRow extends DatabaseRow {
  zone_id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  bind_zone_id: number;
  bind_x: number;
  bind_y: number;
  bind_z: number;
  bind_heading: number;
}

interface StartingItemRow extends DatabaseRow {
  item_id: number;
  quantity: number;
  inventory_slot: number | null;
  criteria_json: string;
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
  private readonly zoneRuntimes = new Map<
    string,
    Promise<EmbeddedZoneRuntime>
  >();
  private readonly sessionRuntimes = new Map<number, EmbeddedZoneRuntime>();
  private readonly listeners = new Set<
    (delivery: BackendEventDelivery) => void
  >();
  private readonly database: DrizzleDatabase;
  private readonly contentPrefix: string;
  private readonly merchantRepository: MerchantRepository;
  private readonly zoneSnapshotRepository: ZoneSnapshotRepository;
  private readonly createZoneKernel: ZoneKernelFactory | undefined;
  private readonly embeddedZoneOptions: Omit<
    EmbeddedZoneRuntimeOptions,
    "zoneId" | "instanceId" | "initialSnapshot" | "zoneKey" | "publishNpcDebug"
  >;
  private readonly devDiagnostics: boolean;

  constructor(
    private readonly driver: DatabaseBackend,
    private readonly content: EmbeddedBackendContent,
    options: {
      createZoneKernel?: ZoneKernelFactory;
      findPath?: EmbeddedZoneRuntimeOptions["findPath"];
      engagementRules?: EmbeddedZoneRuntimeOptions["engagementRules"];
      devDiagnostics?: boolean;
    } = {},
  ) {
    this.database = new DrizzleDatabase(driver);
    this.contentPrefix = content.contentDatabasePath ? "content_db." : "";
    this.merchantRepository = new MerchantRepository(
      driver,
      driver,
      this.contentPrefix,
    );
    this.zoneSnapshotRepository = new ZoneSnapshotRepository(driver);
    this.createZoneKernel = options.createZoneKernel;
    this.embeddedZoneOptions = {
      ...(options.findPath ? { findPath: options.findPath } : {}),
      ...(options.engagementRules
        ? { engagementRules: options.engagementRules }
        : {}),
    };
    this.devDiagnostics = options.devDiagnostics ?? false;
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
    this.sessionRuntimes.get(sessionId)?.leavePlayer(sessionId);
    this.sessionRuntimes.delete(sessionId);
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
        return this.changeZone(sessionId, request);
      case "gm_command":
        return this.gmCommand(sessionId, request.command, request.args);
      case "client_update":
        this.sessionRuntimes
          .get(sessionId)
          ?.applyClientUpdate(sessionId, request);
        await this.persistClientLocation(sessionId, request);
        return [];
      case "auto_attack":
        this.sessionRuntimes
          .get(sessionId)
          ?.setAutoAttack(sessionId, request.enabled, request.targetId);
        return [];
      case "loot_request":
        return this.lootRequest(sessionId, request.corpseId);
      case "loot_item":
        return this.lootItem(sessionId, request.corpseId, request.lootSlot);
      case "merchant_open":
        return this.merchantRequest(sessionId, request);
      case "merchant_buy":
        return this.merchantRequest(sessionId, request);
      case "merchant_sell":
        return this.merchantRequest(sessionId, request);
      case "channel_message":
        return this.channelMessage(sessionId, request);
      case "move_item":
        return this.moveItem(sessionId, request);
      case "delete_item":
        return this.deleteItem(sessionId, request.slot, request.bag);
    }
  }

  async close(): Promise<void> {
    this.sessionRuntimes.clear();
    const runtimes = [...this.zoneRuntimes.values()];
    this.zoneRuntimes.clear();
    this.listeners.clear();
    try {
      for (const runtime of await Promise.all(runtimes)) {
        runtime.stop();
        const snapshot = runtime.snapshotBlob();
        const identity = runtime.persistentIdentity();
        await this.zoneSnapshotRepository.save(
          identity.zoneId,
          identity.instanceId,
          snapshot,
        );
      }
    } finally {
      await this.database.close();
    }
  }

  subscribe(listener: (delivery: BackendEventDelivery) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async deleteCharacter(name: string): Promise<void> {
    await this.database.transaction(async (database) => {
      const row = (
        await database.query<{ id: number }>(
          "SELECT id FROM characters WHERE name = ? LIMIT 1",
          [name],
        )
      ).rows[0];
      if (!row) return;
      for (const table of [
        "character_quest_state",
        "player_inventory",
        "character_languages",
        "character_skills",
        "character_binds",
        "character_positions",
      ])
        await database.execute(`DELETE FROM ${table} WHERE character_id = ?`, [
          Number(row.id),
        ]);
      await database.execute("DELETE FROM characters WHERE id = ?", [
        Number(row.id),
      ]);
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
        if (!origin)
          throw new Error("No valid starting origin for this character");
        const accountId = await this.guestAccountId();
        const result = await this.database.execute(
          `INSERT INTO characters
            (account_id, name, class_id, race_id, gender, deity_id, face,
             str, sta, dex, agi, intelligence, wis, cha, unspent_stat_points,
             appearance_schema_version, body_family_id, body_component_id,
             face_component_id, presentation_id, calling_id, origin_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            accountId,
            name,
            character.charClass,
            character.race,
            character.gender,
            character.deity,
            character.face,
            stats.str,
            stats.sta,
            stats.dex,
            stats.agi,
            stats.intel,
            stats.wis,
            stats.cha,
            stats.points,
            character.appearanceSchemaVersion ?? null,
            character.bodyFamilyId ?? null,
            character.bodyComponentId ?? null,
            character.faceComponentId ?? null,
            character.presentationId ?? null,
            character.callingId ?? null,
            character.originId ?? null,
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
              [
                row.id,
                origin.zone_id,
                origin.x,
                origin.y,
                origin.z,
                origin.heading,
              ],
            );
            for (let slot = 0; slot < 5; slot++) {
              await this.database.execute(
                `INSERT INTO character_binds
                  (character_id, slot, zone_id, instance_id, x, y, z, heading)
                 VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
                [
                  row.id,
                  slot,
                  origin.bind_zone_id,
                  origin.bind_x,
                  origin.bind_y,
                  origin.bind_z,
                  origin.bind_heading,
                ],
              );
            }
            await this.seedCharacterSkillsAndLanguages(
              row.id,
              character.race,
              character.charClass,
            );
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

  private async resolveCharacterOrigin(
    character: Extract<
      BackendRequest,
      { type: "character_create" }
    >["character"],
  ): Promise<CharacterOriginRow | null> {
    const rows = (
      await this.database.query<CharacterOriginRow>(
        `SELECT zone_id, x, y, z, heading, bind_zone_id, bind_x, bind_y, bind_z, bind_heading
       FROM ${this.contentPrefix}character_origins
       WHERE race_id = ? AND class_id = ? AND deity_id = ?
         AND (start_zone_id = ? OR zone_id = ?)
       ORDER BY CASE WHEN start_zone_id = ? THEN 0 ELSE 1 END, priority DESC LIMIT 1`,
        [
          character.race,
          character.charClass,
          character.deity,
          character.startZone,
          character.startZone,
          character.startZone,
        ],
      )
    ).rows;
    if (rows[0]) return rows[0];
    const hasOrigins =
      Number(
        (
          await this.database.query<{ count: number }>(
            `SELECT COUNT(*) AS count FROM ${this.contentPrefix}character_origins`,
          )
        ).rows[0]?.count ?? 0,
      ) > 0;
    if (hasOrigins) return null;
    const zone = (
      await this.database.query<ZoneRow>(
        `SELECT id, short_name AS key, name, safe_x, safe_y, safe_z FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`,
        [character.startZone],
      )
    ).rows[0];
    return zone
      ? {
          zone_id: Number(zone.id),
          x: Number(zone.safe_x),
          y: Number(zone.safe_y),
          z: Number(zone.safe_z),
          heading: 0,
          bind_zone_id: Number(zone.id),
          bind_x: Number(zone.safe_x),
          bind_y: Number(zone.safe_y),
          bind_z: Number(zone.safe_z),
          bind_heading: 0,
        }
      : null;
  }

  private async grantStartingItems(
    characterId: number,
    character: Extract<
      BackendRequest,
      { type: "character_create" }
    >["character"],
    zoneId: number,
  ): Promise<void> {
    const rows = (
      await this.database.query<StartingItemRow>(
        `SELECT item_id, quantity, inventory_slot, criteria_json FROM ${this.contentPrefix}character_starting_items ORDER BY id`,
      )
    ).rows.filter((row) =>
      startingItemMatches(row.criteria_json, character, zoneId),
    );
    const occupied = new Set<number>();
    for (const row of rows) {
      let slot = row.inventory_slot === null ? -1 : Number(row.inventory_slot);
      if (slot < 0 || occupied.has(slot))
        slot =
          GENERAL_SLOTS.find((candidate) => !occupied.has(candidate)) ?? 30;
      occupied.add(slot);
      await this.database.execute(
        `INSERT INTO player_inventory (character_id, bag, slot, item_id, quantity)
         VALUES (?, -1, ?, ?, ?)`,
        [
          characterId,
          slot,
          Number(row.item_id),
          Math.max(1, Number(row.quantity)),
        ],
      );
    }
  }

  private async seedCharacterSkillsAndLanguages(
    characterId: number,
    race: number,
    charClass: number,
  ): Promise<void> {
    const skills = new Map(startingSkills(race));
    const classSkills = (
      await this.database.query<{ skill_id: number; cap: number }>(
        `SELECT skill_id, cap FROM ${this.contentPrefix}class_skill_caps
       WHERE class_id = ? AND level = 1 AND cap > 0`,
        [charClass],
      )
    ).rows;
    for (const row of classSkills) {
      const skillId = Number(row.skill_id);
      if (!skills.has(skillId) && isStartingClassSkill(skillId))
        skills.set(skillId, Number(row.cap));
    }
    for (const [skill, value] of skills)
      await this.database.execute(
        "INSERT INTO character_skills (character_id, skill_id, value) VALUES (?, ?, ?)",
        [characterId, skill, value],
      );
    for (const [language, value] of startingLanguages(race, charClass))
      await this.database.execute(
        "INSERT INTO character_languages (character_id, language_id, value) VALUES (?, ?, ?)",
        [characterId, language, value],
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
    request: Extract<BackendRequest, { type: "zone_change" }>,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    const { zoneId: requestedZone, instanceId } = request;
    if (requestedZone !== undefined) {
      const zoneId = await this.resolveZoneId(requestedZone);
      if (zoneId === null) {
        return [serverMessage(`Unknown or unavailable zone: ${requestedZone}`)];
      }
      session.pendingZone = { zoneId, instanceId };
      if (session.selectedCharacter) {
        const useSafeLocation = request.useSafeLocation === true;
        const hasExplicitDestination = [request.x, request.y, request.z].every(
          (value) => typeof value === "number" && Number.isFinite(value),
        );
        if (useSafeLocation || hasExplicitDestination) {
          const safeZone = useSafeLocation
            ? (
                await this.database.query<ZoneRow>(
                  `SELECT id, short_name AS key, name, safe_x, safe_y, safe_z
                   FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`,
                  [zoneId],
                )
              ).rows[0]
            : undefined;
          if (useSafeLocation && !safeZone) {
            throw new Error(`Unable to resolve safe location for zone ${zoneId}`);
          }
          const destinationX = useSafeLocation
            ? Number(safeZone!.safe_x)
            : Number(request.x);
          const destinationY = useSafeLocation
            ? Number(safeZone!.safe_y)
            : Number(request.y);
          const destinationZ = useSafeLocation
            ? Number(safeZone!.safe_z)
            : Number(request.z);
          const destinationHeading = useSafeLocation
            ? 0
            : request.heading === undefined
              ? null
              : radiansToEqHeading(request.heading);
          await this.database.execute(
            `UPDATE character_positions
             SET zone_id = ?, instance_id = ?, x = ?, y = ?, z = ?,
                 heading = COALESCE(?, heading), updated_at = CURRENT_TIMESTAMP
             WHERE character_id = (SELECT id FROM characters WHERE name = ?)`,
            [
              zoneId,
              instanceId,
              destinationX,
              destinationY,
              destinationZ,
              destinationHeading,
              session.selectedCharacter,
            ],
          );
        } else {
          await this.database.execute(
            `UPDATE character_positions SET zone_id = ?, instance_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE character_id = (SELECT id FROM characters WHERE name = ?)`,
            [zoneId, instanceId, session.selectedCharacter],
          );
        }
      }
    }
    if (!session.selectedCharacter || !session.pendingZone) {
      throw new Error("Unable to attach client session to zone instance");
    }
    session.activeZone = session.pendingZone;
    session.pendingZone = null;
    return this.zoneBootstrap(sessionId, session);
  }

  private async persistClientLocation(
    sessionId: number,
    location: Extract<BackendRequest, { type: "client_update" }>,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.selectedCharacter || !session.activeZone) return;
    await this.database.execute(
      `UPDATE character_positions
       SET zone_id = ?, instance_id = ?, x = ?, y = ?, z = ?, heading = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE character_id = (SELECT id FROM characters WHERE name = ?)`,
      [
        session.activeZone.zoneId,
        session.activeZone.instanceId,
        location.x,
        location.y,
        location.z,
        radiansToEqHeading(location.heading),
        session.selectedCharacter,
      ],
    );
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

  private lootRequest(sessionId: number, corpseId: number): BackendEvent[] {
    const window = this.sessionRuntimes
      .get(sessionId)
      ?.lootWindow(sessionId, corpseId);
    if (!window) {
      return [
        event(
          "loot_error",
          {
            corpseId,
            message: "That corpse cannot be looted from here.",
          },
          "control-stream",
        ),
      ];
    }
    return [
      event(
        "loot_window",
        {
          corpseId,
          corpseName: window.corpseName,
          items: window.items,
        },
        "control-stream",
      ),
    ];
  }

  private async lootItem(
    sessionId: number,
    corpseId: number,
    lootSlot: number,
  ): Promise<BackendEvent[]> {
    const runtime = this.sessionRuntimes.get(sessionId);
    const item = runtime?.takeLoot(sessionId, corpseId, lootSlot);
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!runtime || !item || !session.selectedCharacter) {
      return [
        event(
          "loot_error",
          {
            corpseId,
            message: "That item is no longer available.",
          },
          "control-stream",
        ),
      ];
    }
    const character = await this.character(session.selectedCharacter);
    if (!character) {
      runtime.restoreLoot(corpseId, item);
      return [];
    }
    const occupied = (
      await this.database.query<{ slot: number }>(
        `SELECT slot FROM player_inventory WHERE character_id = ?
       AND bag = -1 AND slot BETWEEN 22 AND 30`,
        [Number(character.id)],
      )
    ).rows;
    const used = new Set(occupied.map((row) => Number(row.slot)));
    const destination =
      GENERAL_SLOTS.find((slot) => !used.has(slot)) ??
      (!used.has(30) ? 30 : undefined);
    if (destination === undefined) {
      runtime.restoreLoot(corpseId, item);
      return [
        event(
          "loot_error",
          {
            corpseId,
            message: "Your inventory is full.",
          },
          "control-stream",
        ),
      ];
    }
    try {
      await this.database.execute(
        `INSERT INTO player_inventory
         (character_id, bag, slot, item_id, quantity, charges)
         VALUES (?, -1, ?, ?, ?, ?)`,
        [
          Number(character.id),
          destination,
          Number(item.itemId ?? item.id),
          Math.max(1, Number(item.quantity ?? 1)),
          Number(item.charges ?? 0),
        ],
      );
    } catch (error) {
      runtime.restoreLoot(corpseId, item);
      throw error;
    }
    return [
      event(
        "add_item",
        {
          ...item,
          slot: destination,
          bagSlot: -1,
        },
        "control-stream",
      ),
      ...this.lootRequest(sessionId, corpseId),
    ];
  }

  private async merchantRequest(
    sessionId: number,
    request: Extract<
      BackendRequest,
      { type: "merchant_open" | "merchant_buy" | "merchant_sell" }
    >,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    const route = session.activeZone;
    const runtime = this.sessionRuntimes.get(sessionId);
    const definition = runtime?.merchant(sessionId, request.npcId);
    const character = session.selectedCharacter
      ? await this.character(session.selectedCharacter)
      : null;
    if (!route || !definition || !character) {
      return [
        event(
          "merchant_error",
          {
            npcId: request.npcId,
            message: "That merchant cannot be used from here.",
          },
          "control-stream",
        ),
      ];
    }
    try {
      const events: BackendEvent[] = [];
      if (request.type === "merchant_buy") {
        const result = await this.merchantRepository.buy({
          characterId: Number(character.id),
          npcArchetypeId: definition.npcArchetypeId,
          zoneId: route.zoneId,
          instanceId: route.instanceId,
          merchantSlot: request.merchantSlot,
          quantity: request.quantity,
        });
        events.push(mutationEvent(result.mutation));
      } else if (request.type === "merchant_sell") {
        const result = await this.merchantRepository.sell({
          characterId: Number(character.id),
          npcArchetypeId: definition.npcArchetypeId,
          zoneId: route.zoneId,
          instanceId: route.instanceId,
          slot: request.slot,
          bag: request.bag,
          quantity: request.quantity,
        });
        events.push(mutationEvent(result.mutation));
      }
      const window = await this.merchantRepository.open(
        Number(character.id),
        definition.npcArchetypeId,
        request.npcId,
        definition.name,
        route.zoneId,
        route.instanceId,
      );
      events.push(event("merchant_window", { ...window }, "control-stream"));
      return events;
    } catch (error) {
      return [
        event(
          "merchant_error",
          {
            npcId: request.npcId,
            message:
              error instanceof MerchantTransactionError
                ? error.message
                : "Unable to complete that merchant transaction.",
          },
          "control-stream",
        ),
      ];
    }
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
    const definitions = await new GameDataRepository(
      this.driver,
      this.driver,
      this.contentPrefix,
    ).zoneNpcSpawns(route.zoneId, route.instanceId);
    const playerCombat = await new GameDataRepository(
      this.driver,
      this.driver,
      this.contentPrefix,
    ).characterCombat(Number(character.id));
    const bind = (
      await this.database.query<{
        zone_id: number;
        instance_id: number;
        x: number;
        y: number;
        z: number;
        heading: number;
      }>(
        `SELECT zone_id, instance_id, x, y, z, heading FROM character_binds
       WHERE character_id = ? AND slot = 0 LIMIT 1`,
        [Number(character.id)],
      )
    ).rows[0];
    const spawns = definitions.map((spawn) => ({
      id: spawn.npcArchetypeId,
      spawnId: spawn.spawnId,
      name: spawn.name,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      heading: spawn.heading,
      kind: Number(EntityKind.npc),
      race: spawn.race,
      gender: spawn.gender,
      level: spawn.level,
      isNpc: true,
      modelKey: spawn.modelKey,
      size: spawn.size,
      face: spawn.face,
      helm: spawn.helm,
      equipChest: spawn.equipChest,
      equipment: {
        head: spawn.helm,
        chest: spawn.equipChest,
        primary: spawn.primary,
        secondary: spawn.secondary,
      },
      charClass: spawn.charClass,
      bodytype: spawn.bodyType,
      currentHp: spawn.maximumHp,
      maximumHp: spawn.maximumHp,
    }));
    if (this.createZoneKernel) {
      const runtime = await this.zoneRuntime(
        key,
        route.zoneId,
        route.instanceId,
        zone.key,
        definitions,
        this.createZoneKernel,
      );
      const previousRuntime = this.sessionRuntimes.get(sessionId);
      if (previousRuntime && previousRuntime !== runtime) {
        previousRuntime.leavePlayer(sessionId);
      }
      for (const spawn of spawns) {
        const state = runtime.npcState(spawn.spawnId);
        if (!state) continue;
        spawn.kind = state.kind;
        spawn.x = state.x;
        spawn.y = state.y;
        spawn.z = state.z;
        spawn.heading = radiansToEqHeading(state.heading);
        spawn.currentHp = state.currentHp;
        spawn.maximumHp = state.maximumHp;
        if (state.kind === EntityKind.corpse)
          spawn.name = corpseName(spawn.name);
      }
      runtime.joinPlayer({
        sessionId,
        entityId: embeddedPlayerEntityId(Number(character.id)),
        x: Number(character.x),
        y: Number(character.y),
        z: Number(character.z),
        heading: Number(character.heading),
        level: Number(character.level),
        race: Number(character.race_id),
        gender: Number(character.gender),
        charClass: Number(character.class_id),
        face: Number(character.face),
        combat: playerCombat ?? {
          level: Number(character.level),
          strength: Number(character.str),
          stamina: Number(character.sta),
          dexterity: Number(character.dex),
          agility: Number(character.agi),
          offense: 0,
          defense: 0,
          armorClass: 0,
          maximumHp: 1,
          weaponDamage: 2,
          attackDelayMs: 2_500,
          haste: 0,
          meleeRange: 3,
        },
        bind: {
          zoneId: Number(bind?.zone_id ?? route.zoneId),
          instanceId: Number(bind?.instance_id ?? 0),
          x: Number(bind?.x ?? zone.safe_x),
          y: Number(bind?.y ?? zone.safe_y),
          z: Number(bind?.z ?? zone.safe_z),
          heading: Number(bind?.heading ?? 0),
        },
      });
      this.sessionRuntimes.set(sessionId, runtime);
    }
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
          curHp: playerCombat?.maximumHp ?? 1,
          maxHp: playerCombat?.maximumHp ?? 1,
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
        ...(row.appearance_schema_version === null
          ? {}
          : {
              appearanceSchemaVersion: Number(row.appearance_schema_version),
              bodyFamilyId: String(row.body_family_id),
              bodyComponentId: String(row.body_component_id),
              faceComponentId: String(row.face_component_id),
              presentationId: String(row.presentation_id),
              callingId: String(row.calling_id),
              originId: String(row.origin_id),
            }),
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

  private zoneRuntime(
    key: string,
    zoneId: number,
    instanceId: number,
    zoneKey: string,
    definitions: Parameters<typeof EmbeddedZoneRuntime.create>[0],
    createZoneKernel: ZoneKernelFactory,
  ): Promise<EmbeddedZoneRuntime> {
    const existing = this.zoneRuntimes.get(key);
    if (existing) return existing;
    const created = this.zoneSnapshotRepository
      .latest(zoneId, instanceId)
      .catch(() => null)
      .then((stored) =>
        EmbeddedZoneRuntime.create(
          definitions,
          createZoneKernel,
          (sessionIds, payload) => {
            const delivery: BackendEventDelivery = {
              sessionIds,
              event: event("render_snapshot", { payload }, "control-stream"),
            };
            for (const listener of this.listeners) listener(delivery);
          },
          (sessionIds, combat) => {
            const delivery: BackendEventDelivery = {
              sessionIds,
              event: event("combat_event", { ...combat }, "control-stream"),
            };
            for (const listener of this.listeners) listener(delivery);
          },
          (sessionId, death) => {
            const delivery: BackendEventDelivery = {
              sessionIds: [sessionId],
              event: event("death_event", { ...death }, "control-stream"),
            };
            for (const listener of this.listeners) listener(delivery);
            void this.handleEmbeddedDeath(sessionId, death);
          },
          10,
          {
            ...this.embeddedZoneOptions,
            zoneId,
            instanceId,
            zoneKey,
            ...(stored ? { initialSnapshot: stored.snapshot } : {}),
            ...(this.devDiagnostics
              ? {
                  publishNpcDebug: (sessionIds, diagnostic) => {
                    const delivery: BackendEventDelivery = {
                      sessionIds,
                      event: event(
                        "npc_debug_state",
                        { ...diagnostic },
                        "datagram",
                      ),
                    };
                    for (const listener of this.listeners) listener(delivery);
                  },
                }
              : {}),
          },
        ),
      );
    this.zoneRuntimes.set(key, created);
    void created.catch(() => {
      if (this.zoneRuntimes.get(key) === created) {
        this.zoneRuntimes.delete(key);
      }
    });
    return created;
  }

  private async handleEmbeddedDeath(
    sessionId: number,
    death: EmbeddedDeathEvent,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.selectedCharacter) return;
    await this.database.execute(
      `UPDATE character_positions SET zone_id = ?, instance_id = ?,
       x = ?, y = ?, z = ?, heading = ?, updated_at = CURRENT_TIMESTAMP
       WHERE character_id = (
         SELECT id FROM characters WHERE name = ?
       )`,
      [
        death.bindZoneId,
        0,
        death.x,
        death.y,
        death.z,
        death.heading,
        session.selectedCharacter,
      ],
    );
    session.pendingZone = { zoneId: death.bindZoneId, instanceId: 0 };
    session.activeZone = { zoneId: death.bindZoneId, instanceId: 0 };
    const events = await this.zoneBootstrap(sessionId, session);
    for (const outbound of events) {
      const delivery: BackendEventDelivery = {
        sessionIds: [sessionId],
        event: outbound,
      };
      for (const listener of this.listeners) listener(delivery);
    }
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
         haste, magic, nodrop, base_price, sell_rate_permille)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         magic = excluded.magic, nodrop = excluded.nodrop,
         base_price = excluded.base_price,
         sell_rate_permille = excluded.sell_rate_permille`,
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
        item.basePrice ?? 0,
        item.sellRatePermille ?? 1_000,
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
    } catch (error) {
      // Only absence of the canonical marker identifies a legacy/new database.
      // Corruption, I/O, and locking failures must retain their real meaning.
      if (!isMissingAppMetaTable(error)) throw error;
    }
    if (version === EMBEDDED_SCHEMA_VERSION) {
      return;
    }
    if (version === "5") {
      await this.database.execute(
        "UPDATE app_meta SET value = ? WHERE key = 'schema_version'",
        [EMBEDDED_SCHEMA_VERSION],
      );
      return;
    }
    if (version === "3") {
      await this.database.execute("PRAGMA foreign_keys = OFF");
      try {
        await this.database.transaction(async (transaction) => {
          for (const table of CONTENT_TABLES) {
            await transaction.execute(`DROP TABLE IF EXISTS ${table}`);
          }
          await transaction.execute(
            "UPDATE app_meta SET value = ? WHERE key = 'schema_version'",
            [EMBEDDED_SCHEMA_VERSION],
          );
        });
      } finally {
        await this.database.execute("PRAGMA foreign_keys = ON");
      }
      return;
    }
    await this.database.execute("PRAGMA foreign_keys = OFF");
    try {
      await this.database.transaction(async (transaction) => {
        for (const table of RESET_TABLES) {
          await transaction.execute(`DROP TABLE IF EXISTS ${table}`);
        }
        await transaction.execute(
          "CREATE TABLE app_meta (key VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL)",
        );
        await transaction.execute(
          "INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)",
          [EMBEDDED_SCHEMA_VERSION],
        );
      });
    } finally {
      await this.database.execute("PRAGMA foreign_keys = ON");
    }
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

function mutationEvent(mutation: {
  kind: "put" | "delete";
  slot: number;
  bag: number;
  item?: Record<string, unknown>;
}): BackendEvent {
  return mutation.kind === "delete"
    ? event(
        "delete_item",
        { slot: mutation.slot, bag: mutation.bag },
        "control-stream",
      )
    : event("add_item", mutation.item ?? {}, "control-stream");
}

function embeddedPlayerEntityId(characterId: number): number {
  return (0x8000_0000 + (characterId >>> 0)) >>> 0;
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

const EMBEDDED_SCHEMA_VERSION = "6";

function isMissingAppMetaTable(error: unknown): boolean {
  const message = String(
    (error as { message?: unknown })?.message ?? error,
  ).toLowerCase();
  return (
    message.includes("no such table: app_meta") ||
    (message.includes("relation") &&
      message.includes("app_meta") &&
      message.includes("does not exist")) ||
    (message.includes("table") &&
      message.includes("app_meta") &&
      message.includes("doesn't exist"))
  );
}

const CONTENT_TABLES = [
  "npc_merchant_assignments",
  "merchant_catalog_entries",
  "merchant_catalogs",
  "npc_loot_group_entries",
  "npc_loot_table_entries",
  "npc_loot_assignments",
  "npc_loot_tables",
  "npc_loot_items",
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
  "merchant_transactions",
  "merchant_dynamic_stock",
  "character_currency",
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
  "npc_loot_group_entries",
  "npc_merchant_assignments",
  "merchant_catalog_entries",
  "merchant_catalogs",
  "npc_loot_table_entries",
  "npc_loot_assignments",
  "npc_loot_tables",
  "npc_loot_items",
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
  character.appearance_schema_version, character.body_family_id,
  character.body_component_id, character.face_component_id,
  character.presentation_id, character.calling_id, character.origin_id,
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
