import { applyCanonicalContentSchema, applyCanonicalRuntimeSchema, } from "../db/canonical-schema.js";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import { QuestManager } from "../zone/quest-manager.js";
import { questRegistryForZone } from "../zone/quest-zone-registry.js";
import { normalizeCharacterName, resolveCharacterStats, isStartingClassSkill, startingItemMatches, startingLanguages, startingSkills, } from "./character-rules.js";
import { movementConfirmations, planInventorySwap } from "./inventory-rules.js";
import { toItemInstance } from "./item-instance.js";
const GENERAL_SLOTS = [22, 23, 24, 25, 26, 27, 28, 29];
/**
 * Transport-neutral backend used by offline Worker transport and available to
 * Node transports. All gameplay mutations live here, never in a transport.
 */
export class EmbeddedGameBackend {
    driver;
    content;
    sessions = new Map();
    zoneSessions = new Map();
    questManagers = new Map();
    database;
    contentPrefix;
    constructor(driver, content) {
        this.driver = driver;
        this.content = content;
        this.database = new DrizzleDatabase(driver);
        this.contentPrefix = content.contentDatabasePath ? "content_db." : "";
    }
    async initialize() {
        await this.prepareCanonicalDatabase();
        await applyCanonicalRuntimeSchema(this.driver);
        if (this.content.contentDatabasePath) {
            await this.database.execute("ATTACH DATABASE ? AS content_db", [
                this.content.contentDatabasePath,
            ]);
        }
        else {
            await applyCanonicalContentSchema(this.driver);
        }
        if (this.content.contentDatabasePath) {
            return;
        }
        for (const zone of this.content.zones) {
            await this.database.execute(`INSERT INTO zones (id, short_name, name, safe_x, safe_y, safe_z, enabled)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT DO NOTHING`, [
                zone.id,
                zone.shortName,
                zone.longName,
                zone.safeX ?? 0,
                zone.safeY ?? 0,
                zone.safeZ ?? 0,
            ]);
        }
        for (const item of this.content.items) {
            await this.upsertItem(item);
        }
    }
    connect(sessionId) {
        this.session(sessionId);
        return Promise.resolve([]);
    }
    disconnect(sessionId) {
        this.sessions.delete(sessionId);
        for (const members of this.zoneSessions.values()) {
            members.delete(sessionId);
        }
        return Promise.resolve();
    }
    async handle(sessionId, request) {
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
                return this.validateZoneSession(sessionId, request.zoneId, request.instanceId);
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
    close() {
        return this.database.close();
    }
    async deleteCharacter(name) {
        await this.database.transaction(async (database) => {
            const row = (await database.query("SELECT id FROM characters WHERE name = ? LIMIT 1", [name])).rows[0];
            if (!row)
                return;
            for (const table of [
                "character_quest_state", "player_inventory", "character_languages",
                "character_skills", "character_binds", "character_positions",
            ])
                await database.execute(`DELETE FROM ${table} WHERE character_id = ?`, [Number(row.id)]);
            await database.execute("DELETE FROM characters WHERE id = ?", [Number(row.id)]);
        });
    }
    async createCharacter(character) {
        const name = normalizeCharacterName(character.name);
        const stats = resolveCharacterStats(character);
        let created = false;
        if (name && stats) {
            try {
                const origin = await this.resolveCharacterOrigin(character);
                if (!origin)
                    throw new Error("No valid starting origin for this character");
                const accountId = await this.guestAccountId();
                const result = await this.database.execute(`INSERT INTO characters
            (account_id, name, class_id, race_id, gender, deity_id, face,
             str, sta, dex, agi, intelligence, wis, cha, unspent_stat_points)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    accountId,
                    name,
                    character.charClass,
                    character.race,
                    character.gender,
                    character.deity,
                    character.face,
                    stats.str, stats.sta, stats.dex, stats.agi, stats.intel,
                    stats.wis, stats.cha, stats.points,
                ]);
                created = result.affectedRows > 0;
                if (created) {
                    const row = await this.character(name);
                    if (row) {
                        await this.database.execute(`INSERT INTO character_positions
                (character_id, zone_id, instance_id, x, y, z, heading)
               VALUES (?, ?, 0, ?, ?, ?, ?)`, [row.id, origin.zone_id, origin.x, origin.y, origin.z, origin.heading]);
                        for (let slot = 0; slot < 5; slot++) {
                            await this.database.execute(`INSERT INTO character_binds
                  (character_id, slot, zone_id, instance_id, x, y, z, heading)
                 VALUES (?, ?, ?, 0, ?, ?, ?, ?)`, [row.id, slot, origin.bind_zone_id, origin.bind_x, origin.bind_y, origin.bind_z, origin.bind_heading]);
                        }
                        await this.seedCharacterSkillsAndLanguages(row.id, character.race, character.charClass);
                        await this.grantStartingItems(row.id, character, origin.zone_id);
                    }
                }
            }
            catch {
                created = false;
            }
        }
        return [
            event("approve_name", { value: created ? 1 : 0 }),
            await this.characterListEvent(),
        ];
    }
    async resolveCharacterOrigin(character) {
        const rows = (await this.database.query(`SELECT zone_id, x, y, z, heading, bind_zone_id, bind_x, bind_y, bind_z, bind_heading
       FROM ${this.contentPrefix}character_origins
       WHERE race_id = ? AND class_id = ? AND deity_id = ?
         AND (start_zone_id = ? OR zone_id = ?)
       ORDER BY CASE WHEN start_zone_id = ? THEN 0 ELSE 1 END, priority DESC LIMIT 1`, [character.race, character.charClass, character.deity, character.startZone, character.startZone, character.startZone])).rows;
        if (rows[0])
            return rows[0];
        const hasOrigins = Number((await this.database.query(`SELECT COUNT(*) AS count FROM ${this.contentPrefix}character_origins`)).rows[0]?.count ?? 0) > 0;
        if (hasOrigins)
            return null;
        const zone = (await this.database.query(`SELECT id, short_name AS key, name, safe_x, safe_y, safe_z FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`, [character.startZone])).rows[0];
        return zone ? {
            zone_id: Number(zone.id), x: Number(zone.safe_x), y: Number(zone.safe_y), z: Number(zone.safe_z), heading: 0,
            bind_zone_id: Number(zone.id), bind_x: Number(zone.safe_x), bind_y: Number(zone.safe_y), bind_z: Number(zone.safe_z), bind_heading: 0,
        } : null;
    }
    async grantStartingItems(characterId, character, zoneId) {
        const rows = (await this.database.query(`SELECT item_id, quantity, inventory_slot, criteria_json FROM ${this.contentPrefix}character_starting_items ORDER BY id`)).rows.filter(row => startingItemMatches(row.criteria_json, character, zoneId));
        const occupied = new Set();
        for (const row of rows) {
            let slot = row.inventory_slot === null ? -1 : Number(row.inventory_slot);
            if (slot < 0 || occupied.has(slot))
                slot = GENERAL_SLOTS.find(candidate => !occupied.has(candidate)) ?? 30;
            occupied.add(slot);
            await this.database.execute(`INSERT INTO player_inventory (character_id, bag, slot, item_id, quantity)
         VALUES (?, -1, ?, ?, ?)`, [characterId, slot, Number(row.item_id), Math.max(1, Number(row.quantity))]);
        }
    }
    async seedCharacterSkillsAndLanguages(characterId, race, charClass) {
        const skills = new Map(startingSkills(race));
        const classSkills = (await this.database.query(`SELECT skill_id, cap FROM ${this.contentPrefix}class_skill_caps
       WHERE class_id = ? AND level = 1 AND cap > 0`, [charClass])).rows;
        for (const row of classSkills) {
            const skillId = Number(row.skill_id);
            if (!skills.has(skillId) && isStartingClassSkill(skillId))
                skills.set(skillId, Number(row.cap));
        }
        for (const [skill, value] of skills)
            await this.database.execute("INSERT INTO character_skills (character_id, skill_id, value) VALUES (?, ?, ?)", [characterId, skill, value]);
        for (const [language, value] of startingLanguages(race, charClass))
            await this.database.execute("INSERT INTO character_languages (character_id, language_id, value) VALUES (?, ?, ?)", [characterId, language, value]);
    }
    async enterWorld(sessionId, rawName) {
        const name = rawName.trim();
        const character = await this.character(name);
        if (character) {
            this.session(sessionId).selectedCharacter = character.name;
            await this.database.execute("UPDATE characters SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [character.id]);
        }
        return [event("post_enter_world", { value: character ? 1 : 0 })];
    }
    async validateZoneSession(sessionId, zone, instanceId) {
        const zoneId = await this.resolveZoneId(zone);
        if (zoneId !== null) {
            this.session(sessionId).pendingZone = { zoneId, instanceId };
        }
        return [event("zone_session_valid", { value: zoneId === null ? 0 : 1 })];
    }
    async changeZone(sessionId, requestedZone, instanceId) {
        const session = await this.ensureSelectedCharacter(sessionId);
        if (requestedZone !== undefined) {
            const zoneId = await this.resolveZoneId(requestedZone);
            if (zoneId === null) {
                return [serverMessage(`Unknown or unavailable zone: ${requestedZone}`)];
            }
            session.pendingZone = { zoneId, instanceId };
            if (session.selectedCharacter) {
                await this.database.execute(`UPDATE character_positions SET zone_id = ?, instance_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE character_id = (SELECT id FROM characters WHERE name = ?)`, [zoneId, instanceId, session.selectedCharacter]);
            }
        }
        if (!session.selectedCharacter || !session.pendingZone) {
            throw new Error("Unable to attach client session to zone instance");
        }
        session.activeZone = session.pendingZone;
        session.pendingZone = null;
        return this.zoneBootstrap(sessionId, session);
    }
    async gmCommand(sessionId, rawCommand, args) {
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
            await this.database.execute("UPDATE characters SET level = ? WHERE name = ?", [level, name]);
            return [event("level_update", { level, exp: 0 })];
        }
        if (command === "searchitem") {
            const search = args.join(" ").trim();
            if (!search) {
                return [serverMessage("Usage: #searchitem {name}")];
            }
            const rows = (await this.database.query(`SELECT id, name FROM ${this.contentPrefix}items WHERE name LIKE ? ORDER BY name LIMIT 20`, [`%${search}%`])).rows;
            return [
                serverMessage(rows.length
                    ? rows.map((row) => `${row.id}: ${row.name}`).join(" | ")
                    : `No items matched '${search}'.`),
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
    async channelMessage(sessionId, request) {
        const session = await this.ensureSelectedCharacter(sessionId);
        if (!session.activeZone ||
            !session.selectedCharacter ||
            request.channel !== 0) {
            return [];
        }
        const target = (await this.database.query(`${spawnSelect(this.contentPrefix)}
       WHERE sp.zone_id = ? AND lower(replace(npc.name, '_', ' ')) = lower(replace(?, '_', ' '))
       LIMIT 1`, [session.activeZone.zoneId, request.targetName])).rows[0];
        if (!target) {
            return [];
        }
        const player = await this.character(session.selectedCharacter);
        const effects = this.questManager(session.activeZone.zoneId, session.activeZone.instanceId).dispatch({
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
    questManager(zoneId, instanceId) {
        const key = `${zoneId}:${instanceId}`;
        const current = this.questManagers.get(key);
        if (current) {
            return current;
        }
        const created = new QuestManager(zoneId, instanceId, questRegistryForZone(zoneId)?.zone.shortName ?? null);
        created.replace(this.content.quests ?? [], 1);
        this.questManagers.set(key, created);
        return created;
    }
    questEvents(effects, actorName) {
        return effects.flatMap((effect) => {
            if (effect.type !== "npc_say" && effect.type !== "entity_say") {
                return [];
            }
            return [
                event("channel_message", {
                    sender: effect.type === "npc_say" ? effect.npcName : effect.entityName,
                    target: actorName,
                    message: effect.message,
                    chanNum: 0,
                }, "control-stream"),
            ];
        });
    }
    async summonItem(characterName, itemId, rawId) {
        const item = await this.getItem(itemId);
        if (!item) {
            return [
                serverMessage(`Item ${rawId ?? ""} was not found in the offline catalog.`),
            ];
        }
        const occupiedRows = (await this.database.query(`SELECT slot FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?)
         AND bag = 0 AND slot BETWEEN 22 AND 29`, [characterName])).rows;
        const occupied = new Set(occupiedRows.map((row) => Number(row.slot)));
        const slot = GENERAL_SLOTS.find((candidate) => !occupied.has(candidate)) ?? 30;
        if (slot === 30) {
            const cursor = await this.inventoryAt(characterName, 30, 0);
            if (cursor) {
                return [serverMessage("Your general inventory and cursor are full.")];
            }
        }
        await this.database.execute(`INSERT INTO player_inventory (character_id, slot, bag, item_id)
       SELECT id, ?, 0, ? FROM characters WHERE name = ?`, [slot, itemId, characterName]);
        return [event("add_item", this.itemInstance(item, slot, 0))];
    }
    async purgeItems(characterName) {
        const rows = (await this.database.query(`SELECT slot, bag FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?)`, [characterName])).rows;
        await this.database.execute("DELETE FROM player_inventory WHERE character_id = (SELECT id FROM characters WHERE name = ?)", [characterName]);
        return [
            event("bulk_delete_items", {
                items: rows.map((row) => ({
                    slot: Number(row.slot),
                    bag: Number(row.bag),
                })),
            }),
        ];
    }
    async gearUp(characterName) {
        const character = await this.character(characterName);
        const gear = character
            ? this.content.gearSets[`${Number(character.class_id)}:${Number(character.level)}`]
            : undefined;
        if (!character || !gear?.length) {
            return [
                serverMessage("No offline gear set exists for this class and level."),
            ];
        }
        const old = (await this.database.query(`SELECT slot, bag FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?) AND bag = -1`, [characterName])).rows;
        await this.database.transaction(async (database) => {
            await database.execute(`DELETE FROM player_inventory
         WHERE character_id = (SELECT id FROM characters WHERE name = ?) AND bag = -1`, [characterName]);
            for (const [slot, itemId] of gear) {
                await database.execute(`INSERT INTO player_inventory (character_id, slot, bag, item_id)
           SELECT character.id, ?, -1, item.id FROM characters character, ${this.contentPrefix}items item
           WHERE character.name = ? AND item.id = ?`, [slot, characterName, itemId]);
            }
        });
        const events = [];
        if (old.length) {
            events.push(event("bulk_delete_items", {
                items: old.map((row) => ({
                    slot: Number(row.slot),
                    bag: Number(row.bag),
                })),
            }));
        }
        events.push(event("bulk_items", { items: await this.inventoryItems(characterName) }));
        events.push(serverMessage(`Loaded the level ${character.level} class ${character.class_id} gear set.`));
        return events;
    }
    async moveItem(sessionId, request) {
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
        const source = rows.find((row) => row.slot === request.fromSlot && row.bag === request.fromBag);
        const destination = rows.find((row) => row.slot === request.toSlot && row.bag === request.toBag);
        if (!source && !destination) {
            return [];
        }
        if (!this.itemAllowed(source?.item, request.toSlot) ||
            !this.itemAllowed(destination?.item, request.fromSlot)) {
            return [serverMessage("That item cannot be equipped in that slot.")];
        }
        const character = await this.character(name);
        if (!character ||
            !this.characterCanEquip(character, source?.item, request.toSlot) ||
            !this.characterCanEquip(character, destination?.item, request.fromSlot)) {
            return [serverMessage("Your class or race cannot equip that item.")];
        }
        let moves;
        try {
            moves = planInventorySwap(rows.map((row) => ({
                slot: row.slot,
                bag: row.bag,
                itemKey: row.item.id,
                containerSlots: row.item.bagslots,
            })), { slot: request.fromSlot, bag: request.fromBag }, { slot: request.toSlot, bag: request.toBag });
        }
        catch (error) {
            return [
                serverMessage(error instanceof Error ? error.message : String(error)),
            ];
        }
        await this.database.transaction(async (database) => {
            for (const move of moves) {
                await database.execute(`DELETE FROM player_inventory
           WHERE character_id = (SELECT id FROM characters WHERE name = ?)
             AND slot = ? AND bag = ?`, [name, move.fromSlot, move.fromBag]);
            }
            for (const move of moves) {
                await database.execute(`INSERT INTO player_inventory (character_id, slot, bag, item_id)
           SELECT id, ?, ?, ? FROM characters WHERE name = ?`, [move.slot, move.bag, Number(move.itemKey), name]);
            }
        });
        return movementConfirmations(moves, { slot: request.fromSlot, bag: request.fromBag }, { slot: request.toSlot, bag: request.toBag }).map((move) => event("move_item", {
            ...move,
            fromBagSlot: move.fromBag,
            toBagSlot: move.toBag,
            numberInStack: 1,
        }, "control-stream"));
    }
    async deleteItem(sessionId, slot, bag) {
        const session = await this.ensureSelectedCharacter(sessionId);
        if (!session.selectedCharacter || slot !== 30) {
            return [];
        }
        await this.database.execute(`DELETE FROM player_inventory
       WHERE character_id = (SELECT id FROM characters WHERE name = ?) AND slot = 30 AND bag = ?`, [session.selectedCharacter, bag]);
        return [event("delete_item", { slot, bag })];
    }
    async zoneBootstrap(sessionId, session) {
        const route = session.activeZone;
        if (!route || !session.selectedCharacter) {
            throw new Error("No active zone route");
        }
        const zone = (await this.database.query(`SELECT id, short_name AS key, name, safe_x, safe_y, safe_z
       FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`, [route.zoneId])).rows[0];
        const character = await this.character(session.selectedCharacter);
        if (!zone || !character) {
            throw new Error("Unable to load zone bootstrap data");
        }
        for (const members of this.zoneSessions.values()) {
            members.delete(sessionId);
        }
        const key = `${route.zoneId}:${route.instanceId}`;
        const members = this.zoneSessions.get(key) ?? new Set();
        members.add(sessionId);
        this.zoneSessions.set(key, members);
        const spawns = (await this.database.query(`${spawnSelect(this.contentPrefix)} WHERE sp.zone_id = ? ORDER BY sp.id`, [route.zoneId])).rows.map((spawn) => {
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
            event("new_zone", {
                zoneId: route.zoneId,
                zoneIdNumber: route.zoneId,
                instanceId: route.instanceId,
                shortName: zone.key,
                longName: zone.name,
                zonePoints: [],
            }, "control-stream"),
            event("player_profile", {
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
            }, "control-stream"),
            event("zone_spawns", { spawns }, "control-stream"),
        ];
    }
    async characterListEvent() {
        const rows = (await this.database.query(`${CHARACTER_SELECT} ORDER BY character.name LIMIT 8`)).rows;
        const characters = await Promise.all(rows.map(async (row) => ({
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
        })));
        return event("character_select", {
            characterCount: characters.length,
            characters,
        }, "control-stream");
    }
    async ensureSelectedCharacter(sessionId) {
        const session = this.session(sessionId);
        if (session.selectedCharacter) {
            return session;
        }
        const row = (await this.database.query("SELECT name FROM characters ORDER BY last_login_at DESC, id LIMIT 1")).rows[0];
        if (row) {
            session.selectedCharacter = row.name;
        }
        return session;
    }
    session(sessionId) {
        const current = this.sessions.get(sessionId);
        if (current) {
            return current;
        }
        const created = {
            selectedCharacter: null,
            pendingZone: null,
            activeZone: null,
        };
        this.sessions.set(sessionId, created);
        return created;
    }
    async resolveZoneId(value) {
        const numeric = typeof value === "string" && /^\d+$/.test(value.trim())
            ? Number(value)
            : value;
        const row = (await this.database.query(typeof numeric === "number"
            ? `SELECT id FROM ${this.contentPrefix}zones WHERE id = ? LIMIT 1`
            : `SELECT id FROM ${this.contentPrefix}zones WHERE lower(short_name) = lower(?) LIMIT 1`, [numeric])).rows[0];
        return row ? Number(row.id) : null;
    }
    async inventoryRows(characterName) {
        const rows = (await this.database.query(`SELECT inventory.item_id, inventory.slot, inventory.bag AS bag_slot, item.*
       FROM player_inventory inventory JOIN ${this.contentPrefix}items item ON item.id = inventory.item_id
       JOIN characters character ON character.id = inventory.character_id
       WHERE character.name = ? ORDER BY inventory.slot, inventory.bag`, [characterName])).rows;
        return rows.map((row) => ({
            slot: Number(row.slot),
            bag: Number(row.bag_slot),
            item: row,
        }));
    }
    async inventoryItems(characterName) {
        return (await this.inventoryRows(characterName)).map((row) => this.itemInstance(row.item, row.slot, row.bag));
    }
    async inventoryAt(characterName, slot, bag) {
        const row = (await this.database.query(`SELECT inventory.item_id, inventory.slot, inventory.bag AS bag_slot, item.*
       FROM player_inventory inventory JOIN ${this.contentPrefix}items item ON item.id = inventory.item_id
       JOIN characters character ON character.id = inventory.character_id
       WHERE character.name = ? AND inventory.slot = ? AND inventory.bag = ? LIMIT 1`, [characterName, slot, bag])).rows[0];
        return row ?? null;
    }
    async getItem(itemId) {
        if (!Number.isInteger(itemId)) {
            return null;
        }
        return ((await this.database.query(`SELECT * FROM ${this.contentPrefix}items WHERE id = ? LIMIT 1`, [itemId])).rows[0] ?? null);
    }
    itemInstance(item, slot, bagSlot) {
        return toItemInstance(item, slot, bagSlot);
    }
    itemAllowed(item, slot) {
        return (!item ||
            slot === 30 ||
            slot < 0 ||
            slot > 21 ||
            (Number(item.slots) & (1 << slot)) !== 0);
    }
    characterCanEquip(character, item, slot) {
        if (!item || slot < 0 || slot > 21) {
            return true;
        }
        return ((Number(item.classes) & (1 << (Number(character.class_id) - 1))) !== 0 &&
            (Number(item.races) & (1 << (Number(character.race_id) - 1))) !== 0);
    }
    async upsertItem(item) {
        await this.database.execute(`INSERT INTO items
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
         magic = excluded.magic, nodrop = excluded.nodrop`, [
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
        ]);
    }
    async prepareCanonicalDatabase() {
        let version;
        try {
            version = (await this.database.query("SELECT value FROM app_meta WHERE key = 'schema_version' LIMIT 1")).rows[0]?.value;
        }
        catch {
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
            await this.database.execute("UPDATE app_meta SET value = ? WHERE key = 'schema_version'", [EMBEDDED_SCHEMA_VERSION]);
            return;
        }
        await this.database.execute("PRAGMA foreign_keys = OFF");
        for (const table of RESET_TABLES) {
            await this.database.execute(`DROP TABLE IF EXISTS ${table}`);
        }
        await this.database.execute("PRAGMA foreign_keys = ON");
        await this.database.execute("CREATE TABLE app_meta (key VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL)");
        await this.database.execute("INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)", [EMBEDDED_SCHEMA_VERSION]);
    }
    async guestAccountId() {
        await this.database.execute("INSERT INTO accounts (identity) SELECT 'offline' WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE identity = 'offline')");
        const row = (await this.database.query("SELECT id FROM accounts WHERE identity = 'offline' LIMIT 1")).rows[0];
        if (!row) {
            throw new Error("Unable to create offline account");
        }
        return Number(row.id);
    }
    async character(name) {
        return (await this.database.query(`${CHARACTER_SELECT} WHERE character.name = ? LIMIT 1`, [name])).rows[0];
    }
}
function event(type, value, transport = "datagram") {
    return { type, value, transport };
}
function serverMessage(message) {
    return event("channel_message", {
        sender: "Server",
        target: "",
        message,
        chanNum: -1,
    });
}
function timestamp(value) {
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
];
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
];
const CHARACTER_SELECT = `SELECT character.id, character.name, character.level,
  character.class_id, character.race_id, character.gender, character.deity_id,
  character.face, character.last_login_at AS last_login,
  character.str, character.sta, character.dex, character.agi,
  character.intelligence, character.wis, character.cha,
  position.zone_id, position.instance_id AS zone_instance,
  position.x, position.y, position.z, position.heading
  FROM characters character
  LEFT JOIN character_positions position ON position.character_id = character.id`;
function spawnSelect(prefix) {
    return `SELECT sp.id, npc.id AS npc_id, npc.name, npc.level,
  npc.race_id AS race, npc.gender, npc.properties_json, sp.x, sp.y, sp.z, sp.heading
  FROM ${prefix}spawn_points sp
  JOIN ${prefix}npc_archetypes npc ON npc.id = (
    SELECT member.npc_archetype_id FROM ${prefix}spawn_group_members member
    WHERE member.spawn_group_id = sp.spawn_group_id
    ORDER BY member.weight DESC, member.npc_archetype_id LIMIT 1)
  AND sp.enabled = 1`;
}
function jsonObject(value) {
    if (typeof value !== "string")
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1iZWRkZWQtZ2FtZS1iYWNrZW5kLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW1iZWRkZWQtZ2FtZS1iYWNrZW5kLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFDTCwyQkFBMkIsRUFDM0IsMkJBQTJCLEdBQzVCLE1BQU0sMkJBQTJCLENBQUM7QUFDbkMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUV4RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN0RSxPQUFPLEVBQ0wsc0JBQXNCLEVBQ3RCLHFCQUFxQixFQUNyQixvQkFBb0IsRUFDcEIsbUJBQW1CLEVBQ25CLGlCQUFpQixFQUNqQixjQUFjLEdBQ2YsTUFBTSxzQkFBc0IsQ0FBQztBQVE5QixPQUFPLEVBQUUscUJBQXFCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNoRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFzRXBELE1BQU0sYUFBYSxHQUFHLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBVSxDQUFDO0FBRWhFOzs7R0FHRztBQUNILE1BQU0sT0FBTyxtQkFBbUI7SUFRWCxNQUFNO0lBQ04sT0FBTztJQVJULFFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBMkIsQ0FBQztJQUM5QyxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQXVCLENBQUM7SUFDOUMsYUFBYSxHQUFHLElBQUksR0FBRyxFQUF3QixDQUFDO0lBQ2hELFFBQVEsQ0FBa0I7SUFDMUIsYUFBYSxDQUFTO0lBRXZDLFlBQ21CLE1BQXVCLEVBQ3ZCLE9BQStCO3NCQUQvQixNQUFNO3VCQUNOLE9BQU87UUFFeEIsSUFBSSxDQUFD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QjtJQUNuQixVQUFVO0NBQ0YsQ0FBQztBQUVYLE1BQU0sZ0JBQWdCLEdBQUc7Ozs7Ozs7O2lGQVF3RCxDQUFDO0FBRWxGLFNBQVMsV0FBVyxDQUFDLE1BQWM7SUFDakMsT0FBTzs7U0FFQSxNQUFNO1NBQ04sTUFBTTswQ0FDMkIsTUFBTTs7O3FCQUczQixDQUFDO0FBQ3RCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxLQUFjO0lBQ2hDLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUTtRQUFFLE9BQU8sRUFBRSxDQUFDO0lBQ3pDLElBQUksQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFZLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsT0FBTyxNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7WUFDbkUsQ0FBQyxDQUFFLE1BQWtDO1lBQ3JDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDVCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLEtBQWMsRUFBRSxRQUFnQjtJQUNwRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0IsT0FBTyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUNyRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEYXRhYmFzZUJhY2tlbmQsIERhdGFiYXNlUm93IH0gZnJvbSBcIi4uL2RiL2JhY2tlbmQuanNcIjtcbmltcG9ydCB7XG4gIGFwcGx5Q2Fub25pY2FsQ29udGVudFNjaGVtYSxcbiAgYXBwbHlDYW5vbmljYWxSdW50aW1lU2NoZW1hLFxufSBmcm9tIFwiLi4vZGIvY2Fub25pY2FsLXNjaGVtYS5qc1wiO1xuaW1wb3J0IHsgRHJpenpsZURhdGFiYXNlIH0gZnJvbSBcIi4uL2RiL2RyaXp6bGUtZGF0YWJhc2UuanNcIjtcbmltcG9ydCB7IFF1ZXN0TWFuYWdlciB9IGZyb20gXCIuLi96b25lL3F1ZXN0LW1hbmFnZXIuanNcIjtcbmltcG9ydCB0eXBlIHsgUXVlc3RFZmZlY3QgfSBmcm9tIFwiLi4vem9uZS9xdWVzdC10eXBlcy5qc1wiO1xuaW1wb3J0IHsgcXVlc3RSZWdpc3RyeUZvclpvbmUgfSBmcm9tIFwiLi4vem9uZS9xdWVzdC16b25lLXJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQge1xuICBub3JtYWxpemVDaGFyYWN0ZXJOYW1lLFxuICByZXNvbHZlQ2hhcmFjdGVyU3RhdHMsXG4gIGlzU3RhcnRpbmdDbGFzc1NraWxsLFxuICBzdGFydGluZ0l0ZW1NYXRjaGVzLFxuICBzdGFydGluZ0xhbmd1YWdlcyxcbiAgc3RhcnRpbmdTa2lsbHMsXG59IGZyb20gXCIuL2NoYXJhY3Rlci1ydWxlcy5qc1wiO1xuaW1wb3J0IHR5cGUge1xuICBCYWNrZW5kRXZlbnQsXG4gIEJhY2tlbmRJdGVtVGVtcGxhdGUsXG4gIEJhY2tlbmRSZXF1ZXN0LFxuICBFbWJlZGRlZEJhY2tlbmRDb250ZW50LFxuICBHYW1lQmFja2VuZCxcbn0gZnJvbSBcIi4vY29udHJhY3RzLmpzXCI7XG5pbXBvcnQgeyBtb3ZlbWVudENvbmZpcm1hdGlvbnMsIHBsYW5JbnZlbnRvcnlTd2FwIH0gZnJvbSBcIi4vaW52ZW50b3J5LXJ1bGVzLmpzXCI7XG5pbXBvcnQgeyB0b0l0ZW1JbnN0YW5jZSB9IGZyb20gXCIuL2l0ZW0taW5zdGFuY2UuanNcIjtcblxuaW50ZXJmYWNlIEVtYmVkZGVkU2Vzc2lvbiB7XG4gIHNlbGVjdGVkQ2hhcmFjdGVyOiBzdHJpbmcgfCBudWxsO1xuICBwZW5kaW5nWm9uZTogeyB6b25lSWQ6IG51bWJlcjsgaW5zdGFuY2VJZDogbnVtYmVyIH0gfCBudWxsO1xuICBhY3RpdmVab25lOiB7IHpvbmVJZDogbnVtYmVyOyBpbnN0YW5jZUlkOiBudW1iZXIgfSB8IG51bGw7XG59XG5cbmludGVyZmFjZSBDaGFyYWN0ZXJSb3cgZXh0ZW5kcyBEYXRhYmFzZVJvdyB7XG4gIGlkOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbiAgbGV2ZWw6IG51bWJlcjtcbiAgY2xhc3NfaWQ6IG51bWJlcjtcbiAgcmFjZV9pZDogbnVtYmVyO1xuICBnZW5kZXI6IG51bWJlcjtcbiAgZGVpdHlfaWQ6IG51bWJlcjtcbiAgem9uZV9pZDogbnVtYmVyO1xuICB6b25lX2luc3RhbmNlOiBudW1iZXI7XG4gIGZhY2U6IG51bWJlcjtcbiAgbGFzdF9sb2dpbjogc3RyaW5nIHwgbnVtYmVyIHwgbnVsbDtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHo6IG51bWJlcjtcbiAgaGVhZGluZzogbnVtYmVyO1xuICBzdHI6IG51bWJlcjtcbiAgc3RhOiBudW1iZXI7XG4gIGRleDogbnVtYmVyO1xuICBhZ2k6IG51bWJlcjtcbiAgaW50ZWxsaWdlbmNlOiBudW1iZXI7XG4gIHdpczogbnVtYmVyO1xuICBjaGE6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENoYXJhY3Rlck9yaWdpblJvdyBleHRlbmRzIERhdGFiYXNlUm93IHtcbiAgem9uZV9pZDogbnVtYmVyOyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyBoZWFkaW5nOiBudW1iZXI7XG4gIGJpbmRfem9uZV9pZDogbnVtYmVyOyBiaW5kX3g6IG51bWJlcjsgYmluZF95OiBudW1iZXI7IGJpbmRfejogbnVtYmVyOyBiaW5kX2hlYWRpbmc6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFN0YXJ0aW5nSXRlbVJvdyBleHRlbmRzIERhdGFiYXNlUm93IHtcbiAgaXRlbV9pZDogbnVtYmVyOyBxdWFudGl0eTogbnVtYmVyOyBpbnZlbnRvcnlfc2xvdDogbnVtYmVyIHwgbnVsbDsgY3JpdGVyaWFfanNvbjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSXRlbVJvdyBleHRlbmRzIERhdGFiYXNlUm93LCBCYWNrZW5kSXRlbVRlbXBsYXRlIHtcbiAgaXRlbV9pZD86IG51bWJlcjtcbiAgc2xvdD86IG51bWJlcjtcbiAgYmFnX3Nsb3Q/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBab25lUm93IGV4dGVuZHMgRGF0YWJhc2VSb3cge1xuICBpZDogbnVtYmVyO1xuICBrZXk6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBzYWZlX3g6IG51bWJlcjtcbiAgc2FmZV95OiBudW1iZXI7XG4gIHNhZmVfejogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU3Bhd25Sb3cgZXh0ZW5kcyBEYXRhYmFzZVJvdyB7XG4gIGlkOiBudW1iZXI7XG4gIG5wY19pZDogbnVtYmVyO1xuICBuYW1lOiBzdHJpbmc7XG4gIGxldmVsOiBudW1iZXI7XG4gIHJhY2U6IG51bWJlcjtcbiAgZ2VuZGVyOiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB6OiBudW1iZXI7XG4gIGhlYWRpbmc6IG51bWJlcjtcbn1cblxuY29uc3QgR0VORVJBTF9TTE9UUyA9IFsyMiwgMjMsIDI0LCAyNSwgMjYsIDI3LCAyOCwgMjldIGFzIGNvbnN0O1xuXG4vKipcbiAqIFRyYW5zcG9ydC1uZXV0cmFsIGJhY2tlbmQgdXNlZCBieSBvZmZsaW5lIFdvcmtlciB0cmFuc3BvcnQgYW5kIGF2YWlsYWJsZSB0b1xuICogTm9kZSB0cmFuc3BvcnRzLiBBbGwgZ2FtZXBsYXkgbXV0YXRpb25zIGxpdmUgaGVyZSwgbmV2ZXIgaW4gYSB0cmFuc3BvcnQuXG4gKi9cbmV4cG9ydCBjbGFzcyBFbWJlZGRlZEdhbWVCYWNrZW5kIGltcGxlbWVudHMgR2FtZUJhY2tlbmQge1xuICBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zID0gbmV3IE1hcDxudW1iZXIsIEVtYmVkZGVkU2Vzc2lvbj4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSB6b25lU2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PG51bWJlcj4+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgcXVlc3RNYW5hZ2VycyA9IG5ldyBNYXA8c3RyaW5nLCBRdWVzdE1hbmFnZXI+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgZGF0YWJhc2U6IERyaXp6bGVEYXRhYmFzZTtcbiAgcHJpdmF0ZSByZWFkb25seSBjb250ZW50UHJlZml4OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByZWFkb25seSBkcml2ZXI6IERhdGFiYXNlQmFja2VuZCxcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnQ6IEVtYmVkZGVkQmFja2VuZENvbnRlbnQsXG4gICkge1xuICAgIHRoaXMuZGF0YWJhc2UgPSBuZXcgRHJpenpsZURhdGFiYXNlKGRyaXZlcik7XG4gICAgdGhpcy5jb250ZW50UHJlZml4ID0gY29udGVudC5jb250ZW50RGF0YWJhc2VQYXRoID8gXCJjb250ZW50X2RiLlwiIDogXCJcIjtcbiAgfVxuXG4gIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5wcmVwYXJlQ2Fub25pY2FsRGF0YWJhc2UoKTtcbiAgICBhd2FpdCBhcHBseUNhbm9uaWNhbFJ1bnRpbWVTY2hlbWEodGhpcy5kcml2ZXIpO1xuICAgIGlmICh0aGlzLmNvbnRlbnQuY29udGVudERhdGFiYXNlUGF0aCkge1xuICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFwiQVRUQUNIIERBVEFCQVNFID8gQVMgY29udGVudF9kYlwiLCBbXG4gICAgICAgIHRoaXMuY29udGVudC5jb250ZW50RGF0YWJhc2VQYXRoLFxuICAgICAgXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IGFwcGx5Q2Fub25pY2FsQ29udGVudFNjaGVtYSh0aGlzLmRyaXZlcik7XG4gICAgfVxuICAgIGlmICh0aGlzLmNvbnRlbnQuY29udGVudERhdGFiYXNlUGF0aCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHpvbmUgb2YgdGhpcy5jb250ZW50LnpvbmVzKSB7XG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLmV4ZWN1dGUoXG4gICAgICAgIGBJTlNFUlQgSU5UTyB6b25lcyAoaWQsIHNob3J0X25hbWUsIG5hbWUsIHNhZmVfeCwgc2FmZV95LCBzYWZlX3osIGVuYWJsZWQpXG4gICAgICAgICBWQUxVRVMgKD8sID8sID8sID8sID8sID8sIDEpXG4gICAgICAgICBPTiBDT05GTElDVCBETyBOT1RISU5HYCxcbiAgICAgICAgW1xuICAgICAgICAgIHpvbmUuaWQsXG4gICAgICAgICAgem9uZS5zaG9ydE5hbWUsXG4gICAgICAgICAgem9uZS5sb25nTmFtZSxcbiAgICAgICAgICB6b25lLnNhZmVYID8/IDAsXG4gICAgICAgICAgem9uZS5zYWZlWSA/PyAwLFxuICAgICAgICAgIHpvbmUuc2FmZVogPz8gMCxcbiAgICAgICAgXSxcbiAgICAgICk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLmNvbnRlbnQuaXRlbXMpIHtcbiAgICAgIGF3YWl0IHRoaXMudXBzZXJ0SXRlbShpdGVtKTtcbiAgICB9XG4gIH1cblxuICBjb25uZWN0KHNlc3Npb25JZDogbnVtYmVyKTogUHJvbWlzZTxCYWNrZW5kRXZlbnRbXT4ge1xuICAgIHRoaXMuc2Vzc2lvbihzZXNzaW9uSWQpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuICB9XG5cbiAgZGlzY29ubmVjdChzZXNzaW9uSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgZm9yIChjb25zdCBtZW1iZXJzIG9mIHRoaXMuem9uZVNlc3Npb25zLnZhbHVlcygpKSB7XG4gICAgICBtZW1iZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBhc3luYyBoYW5kbGUoXG4gICAgc2Vzc2lvbklkOiBudW1iZXIsXG4gICAgcmVxdWVzdDogQmFja2VuZFJlcXVlc3QsXG4gICk6IFByb21pc2U8QmFja2VuZEV2ZW50W10+IHtcbiAgICBzd2l0Y2ggKHJlcXVlc3QudHlwZSkge1xuICAgICAgY2FzZSBcImxvZ2luXCI6XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgZXZlbnQoXCJqd3RfcmVzcG9uc2VcIiwgeyBzdGF0dXM6IDEgfSksXG4gICAgICAgICAgYXdhaXQgdGhpcy5jaGFyYWN0ZXJMaXN0RXZlbnQoKSxcbiAgICAgICAgXTtcbiAgICAgIGNhc2UgXCJjaGFyYWN0ZXJfY3JlYXRlXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZUNoYXJhY3RlcihyZXF1ZXN0LmNoYXJhY3Rlcik7XG4gICAgICBjYXNlIFwiY2hhcmFjdGVyX2RlbGV0ZVwiOlxuICAgICAgICBhd2FpdCB0aGlzLmRlbGV0ZUNoYXJhY3RlcihyZXF1ZXN0Lm5hbWUudHJpbSgpKTtcbiAgICAgICAgcmV0dXJuIFthd2FpdCB0aGlzLmNoYXJhY3Rlckxpc3RFdmVudCgpXTtcbiAgICAgIGNhc2UgXCJlbnRlcl93b3JsZFwiOlxuICAgICAgICByZXR1cm4gdGhpcy5lbnRlcldvcmxkKHNlc3Npb25JZCwgcmVxdWVzdC5uYW1lKTtcbiAgICAgIGNhc2UgXCJ6b25lX3Nlc3Npb25cIjpcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVab25lU2Vzc2lvbihcbiAgICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgICAgcmVxdWVzdC56b25lSWQsXG4gICAgICAgICAgcmVxdWVzdC5pbnN0YW5jZUlkLFxuICAgICAgICApO1xuICAgICAgY2FzZSBcInpvbmVfY2hhbmdlXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNoYW5nZVpvbmUoc2Vzc2lvbklkLCByZXF1ZXN0LnpvbmVJZCwgcmVxdWVzdC5pbnN0YW5jZUlkKTtcbiAgICAgIGNhc2UgXCJnbV9jb21tYW5kXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmdtQ29tbWFuZChzZXNzaW9uSWQsIHJlcXVlc3QuY29tbWFuZCwgcmVxdWVzdC5hcmdzKTtcbiAgICAgIGNhc2UgXCJjaGFubmVsX21lc3NhZ2VcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hhbm5lbE1lc3NhZ2Uoc2Vzc2lvbklkLCByZXF1ZXN0KTtcbiAgICAgIGNhc2UgXCJtb3ZlX2l0ZW1cIjpcbiAgICAgICAgcmV0dXJuIHRoaXMubW92ZUl0ZW0oc2Vzc2lvbklkLCByZXF1ZXN0KTtcbiAgICAgIGNhc2UgXCJkZWxldGVfaXRlbVwiOlxuICAgICAgICByZXR1cm4gdGhpcy5kZWxldGVJdGVtKHNlc3Npb25JZCwgcmVxdWVzdC5zbG90LCByZXF1ZXN0LmJhZyk7XG4gICAgfVxuICB9XG5cbiAgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YWJhc2UuY2xvc2UoKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZGVsZXRlQ2hhcmFjdGVyKG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UudHJhbnNhY3Rpb24oYXN5bmMgKGRhdGFiYXNlKSA9PiB7XG4gICAgICBjb25zdCByb3cgPSAoYXdhaXQgZGF0YWJhc2UucXVlcnk8eyBpZDogbnVtYmVyIH0+KFxuICAgICAgICBcIlNFTEVDVCBpZCBGUk9NIGNoYXJhY3RlcnMgV0hFUkUgbmFtZSA9ID8gTElNSVQgMVwiLCBbbmFtZV0sXG4gICAgICApKS5yb3dzWzBdO1xuICAgICAgaWYgKCFyb3cpIHJldHVybjtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgW1xuICAgICAgICBcImNoYXJhY3Rlcl9xdWVzdF9zdGF0ZVwiLCBcInBsYXllcl9pbnZlbnRvcnlcIiwgXCJjaGFyYWN0ZXJfbGFuZ3VhZ2VzXCIsXG4gICAgICAgIFwiY2hhcmFjdGVyX3NraWxsc1wiLCBcImNoYXJhY3Rlcl9iaW5kc1wiLCBcImNoYXJhY3Rlcl9wb3NpdGlvbnNcIixcbiAgICAgIF0pIGF3YWl0IGRhdGFiYXNlLmV4ZWN1dGUoYERFTEVURSBGUk9NICR7dGFibGV9IFdIRVJFIGNoYXJhY3Rlcl9pZCA9ID9gLCBbTnVtYmVyKHJvdy5pZCldKTtcbiAgICAgIGF3YWl0IGRhdGFiYXNlLmV4ZWN1dGUoXCJERUxFVEUgRlJPTSBjaGFyYWN0ZXJzIFdIRVJFIGlkID0gP1wiLCBbTnVtYmVyKHJvdy5pZCldKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlQ2hhcmFjdGVyKFxuICAgIGNoYXJhY3RlcjogRXh0cmFjdDxcbiAgICAgIEJhY2tlbmRSZXF1ZXN0LFxuICAgICAgeyB0eXBlOiBcImNoYXJhY3Rlcl9jcmVhdGVcIiB9XG4gICAgPltcImNoYXJhY3RlclwiXSxcbiAgKTogUHJvbWlzZTxCYWNrZW5kRXZlbnRbXT4ge1xuICAgIGNvbnN0IG5hbWUgPSBub3JtYWxpemVDaGFyYWN0ZXJOYW1lKGNoYXJhY3Rlci5uYW1lKTtcbiAgICBjb25zdCBzdGF0cyA9IHJlc29sdmVDaGFyYWN0ZXJTdGF0cyhjaGFyYWN0ZXIpO1xuICAgIGxldCBjcmVhdGVkID0gZmFsc2U7XG4gICAgaWYgKG5hbWUgJiYgc3RhdHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG9yaWdpbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUNoYXJhY3Rlck9yaWdpbihjaGFyYWN0ZXIpO1xuICAgICAgICBpZiAoIW9yaWdpbikgdGhyb3cgbmV3IEVycm9yKFwiTm8gdmFsaWQgc3RhcnRpbmcgb3JpZ2luIGZvciB0aGlzIGNoYXJhY3RlclwiKTtcbiAgICAgICAgY29uc3QgYWNjb3VudElkID0gYXdhaXQgdGhpcy5ndWVzdEFjY291bnRJZCgpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRhdGFiYXNlLmV4ZWN1dGUoXG4gICAgICAgICAgYElOU0VSVCBJTlRPIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIChhY2NvdW50X2lkLCBuYW1lLCBjbGFzc19pZCwgcmFjZV9pZCwgZ2VuZGVyLCBkZWl0eV9pZCwgZmFjZSxcbiAgICAgICAgICAgICBzdHIsIHN0YSwgZGV4LCBhZ2ksIGludGVsbGlnZW5jZSwgd2lzLCBjaGEsIHVuc3BlbnRfc3RhdF9wb2ludHMpXG4gICAgICAgICAgIFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPylgLFxuICAgICAgICAgIFtcbiAgICAgICAgICAgIGFjY291bnRJZCxcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBjaGFyYWN0ZXIuY2hhckNsYXNzLFxuICAgICAgICAgICAgY2hhcmFjdGVyLnJhY2UsXG4gICAgICAgICAgICBjaGFyYWN0ZXIuZ2VuZGVyLFxuICAgICAgICAgICAgY2hhcmFjdGVyLmRlaXR5LFxuICAgICAgICAgICAgY2hhcmFjdGVyLmZhY2UsXG4gICAgICAgICAgICBzdGF0cy5zdHIsIHN0YXRzLnN0YSwgc3RhdHMuZGV4LCBzdGF0cy5hZ2ksIHN0YXRzLmludGVsLFxuICAgICAgICAgICAgc3RhdHMud2lzLCBzdGF0cy5jaGEsIHN0YXRzLnBvaW50cyxcbiAgICAgICAgICBdLFxuICAgICAgICApO1xuICAgICAgICBjcmVhdGVkID0gcmVzdWx0LmFmZmVjdGVkUm93cyA+IDA7XG4gICAgICAgIGlmIChjcmVhdGVkKSB7XG4gICAgICAgICAgY29uc3Qgcm93ID0gYXdhaXQgdGhpcy5jaGFyYWN0ZXIobmFtZSk7XG4gICAgICAgICAgaWYgKHJvdykge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFxuICAgICAgICAgICAgICBgSU5TRVJUIElOVE8gY2hhcmFjdGVyX3Bvc2l0aW9uc1xuICAgICAgICAgICAgICAgIChjaGFyYWN0ZXJfaWQsIHpvbmVfaWQsIGluc3RhbmNlX2lkLCB4LCB5LCB6LCBoZWFkaW5nKVxuICAgICAgICAgICAgICAgVkFMVUVTICg/LCA/LCAwLCA/LCA/LCA/LCA/KWAsXG4gICAgICAgICAgICAgIFtyb3cuaWQsIG9yaWdpbi56b25lX2lkLCBvcmlnaW4ueCwgb3JpZ2luLnksIG9yaWdpbi56LCBvcmlnaW4uaGVhZGluZ10sXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgZm9yIChsZXQgc2xvdCA9IDA7IHNsb3QgPCA1OyBzbG90KyspIHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFxuICAgICAgICAgICAgICAgIGBJTlNFUlQgSU5UTyBjaGFyYWN0ZXJfYmluZHNcbiAgICAgICAgICAgICAgICAgIChjaGFyYWN0ZXJfaWQsIHNsb3QsIHpvbmVfaWQsIGluc3RhbmNlX2lkLCB4LCB5LCB6LCBoZWFkaW5nKVxuICAgICAgICAgICAgICAgICBWQUxVRVMgKD8sID8sID8sIDAsID8sID8sID8sID8pYCxcbiAgICAgICAgICAgICAgICBbcm93LmlkLCBzbG90LCBvcmlnaW4uYmluZF96b25lX2lkLCBvcmlnaW4uYmluZF94LCBvcmlnaW4uYmluZF95LCBvcmlnaW4uYmluZF96LCBvcmlnaW4uYmluZF9oZWFkaW5nXSxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2VlZENoYXJhY3RlclNraWxsc0FuZExhbmd1YWdlcyhyb3cuaWQsIGNoYXJhY3Rlci5yYWNlLCBjaGFyYWN0ZXIuY2hhckNsYXNzKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZ3JhbnRTdGFydGluZ0l0ZW1zKHJvdy5pZCwgY2hhcmFjdGVyLCBvcmlnaW4uem9uZV9pZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgY3JlYXRlZCA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gW1xuICAgICAgZXZlbnQoXCJhcHByb3ZlX25hbWVcIiwgeyB2YWx1ZTogY3JlYXRlZCA/IDEgOiAwIH0pLFxuICAgICAgYXdhaXQgdGhpcy5jaGFyYWN0ZXJMaXN0RXZlbnQoKSxcbiAgICBdO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZXNvbHZlQ2hhcmFjdGVyT3JpZ2luKGNoYXJhY3RlcjogRXh0cmFjdDxCYWNrZW5kUmVxdWVzdCwgeyB0eXBlOiBcImNoYXJhY3Rlcl9jcmVhdGVcIiB9PltcImNoYXJhY3RlclwiXSk6IFByb21pc2U8Q2hhcmFjdGVyT3JpZ2luUm93IHwgbnVsbD4ge1xuICAgIGNvbnN0IHJvd3MgPSAoYXdhaXQgdGhpcy5kYXRhYmFzZS5xdWVyeTxDaGFyYWN0ZXJPcmlnaW5Sb3c+KFxuICAgICAgYFNFTEVDVCB6b25lX2lkLCB4LCB5LCB6LCBoZWFkaW5nLCBiaW5kX3pvbmVfaWQsIGJpbmRfeCwgYmluZF95LCBiaW5kX3osIGJpbmRfaGVhZGluZ1xuICAgICAgIEZST00gJHt0aGlzLmNvbnRlbnRQcmVmaXh9Y2hhcmFjdGVyX29yaWdpbnNcbiAgICAgICBXSEVSRSByYWNlX2lkID0gPyBBTkQgY2xhc3NfaWQgPSA/IEFORCBkZWl0eV9pZCA9ID9cbiAgICAgICAgIEFORCAoc3RhcnRfem9uZV9pZCA9ID8gT1Igem9uZV9pZCA9ID8pXG4gICAgICAgT1JERVIgQlkgQ0FTRSBXSEVOIHN0YXJ0X3pvbmVfaWQgPSA/IFRIRU4gMCBFTFNFIDEgRU5ELCBwcmlvcml0eSBERVNDIExJTUlUIDFgLFxuICAgICAgW2NoYXJhY3Rlci5yYWNlLCBjaGFyYWN0ZXIuY2hhckNsYXNzLCBjaGFyYWN0ZXIuZGVpdHksIGNoYXJhY3Rlci5zdGFydFpvbmUsIGNoYXJhY3Rlci5zdGFydFpvbmUsIGNoYXJhY3Rlci5zdGFydFpvbmVdLFxuICAgICkpLnJvd3M7XG4gICAgaWYgKHJvd3NbMF0pIHJldHVybiByb3dzWzBdO1xuICAgIGNvbnN0IGhhc09yaWdpbnMgPSBOdW1iZXIoKGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8eyBjb3VudDogbnVtYmVyIH0+KFxuICAgICAgYFNFTEVDVCBDT1VOVCgqKSBBUyBjb3VudCBGUk9NICR7dGhpcy5jb250ZW50UHJlZml4fWNoYXJhY3Rlcl9vcmlnaW5zYCxcbiAgICApKS5yb3dzWzBdPy5jb3VudCA/PyAwKSA+IDA7XG4gICAgaWYgKGhhc09yaWdpbnMpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHpvbmUgPSAoYXdhaXQgdGhpcy5kYXRhYmFzZS5xdWVyeTxab25lUm93PihcbiAgICAgIGBTRUxFQ1QgaWQsIHNob3J0X25hbWUgQVMga2V5LCBuYW1lLCBzYWZlX3gsIHNhZmVfeSwgc2FmZV96IEZST00gJHt0aGlzLmNvbnRlbnRQcmVmaXh9em9uZXMgV0hFUkUgaWQgPSA/IExJTUlUIDFgLFxuICAgICAgW2NoYXJhY3Rlci5zdGFydFpvbmVdLFxuICAgICkpLnJvd3NbMF07XG4gICAgcmV0dXJuIHpvbmUgPyB7XG4gICAgICB6b25lX2lkOiBOdW1iZXIoem9uZS5pZCksIHg6IE51bWJlcih6b25lLnNhZmVfeCksIHk6IE51bWJlcih6b25lLnNhZmVfeSksIHo6IE51bWJlcih6b25lLnNhZmVfeiksIGhlYWRpbmc6IDAsXG4gICAgICBiaW5kX3pvbmVfaWQ6IE51bWJlcih6b25lLmlkKSwgYmluZF94OiBOdW1iZXIoem9uZS5zYWZlX3gpLCBiaW5kX3k6IE51bWJlcih6b25lLnNhZmVfeSksIGJpbmRfejogTnVtYmVyKHpvbmUuc2FmZV96KSwgYmluZF9oZWFkaW5nOiAwLFxuICAgIH0gOiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBncmFudFN0YXJ0aW5nSXRlbXMoY2hhcmFjdGVySWQ6IG51bWJlciwgY2hhcmFjdGVyOiBFeHRyYWN0PEJhY2tlbmRSZXF1ZXN0LCB7IHR5cGU6IFwiY2hhcmFjdGVyX2NyZWF0ZVwiIH0+W1wiY2hhcmFjdGVyXCJdLCB6b25lSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJvd3MgPSAoYXdhaXQgdGhpcy5kYXRhYmFzZS5xdWVyeTxTdGFydGluZ0l0ZW1Sb3c+KFxuICAgICAgYFNFTEVDVCBpdGVtX2lkLCBxdWFudGl0eSwgaW52ZW50b3J5X3Nsb3QsIGNyaXRlcmlhX2pzb24gRlJPTSAke3RoaXMuY29udGVudFByZWZpeH1jaGFyYWN0ZXJfc3RhcnRpbmdfaXRlbXMgT1JERVIgQlkgaWRgLFxuICAgICkpLnJvd3MuZmlsdGVyKHJvdyA9PiBzdGFydGluZ0l0ZW1NYXRjaGVzKHJvdy5jcml0ZXJpYV9qc29uLCBjaGFyYWN0ZXIsIHpvbmVJZCkpO1xuICAgIGNvbnN0IG9jY3VwaWVkID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuICAgICAgbGV0IHNsb3QgPSByb3cuaW52ZW50b3J5X3Nsb3QgPT09IG51bGwgPyAtMSA6IE51bWJlcihyb3cuaW52ZW50b3J5X3Nsb3QpO1xuICAgICAgaWYgKHNsb3QgPCAwIHx8IG9jY3VwaWVkLmhhcyhzbG90KSkgc2xvdCA9IEdFTkVSQUxfU0xPVFMuZmluZChjYW5kaWRhdGUgPT4gIW9jY3VwaWVkLmhhcyhjYW5kaWRhdGUpKSA/PyAzMDtcbiAgICAgIG9jY3VwaWVkLmFkZChzbG90KTtcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShcbiAgICAgICAgYElOU0VSVCBJTlRPIHBsYXllcl9pbnZlbnRvcnkgKGNoYXJhY3Rlcl9pZCwgYmFnLCBzbG90LCBpdGVtX2lkLCBxdWFudGl0eSlcbiAgICAgICAgIFZBTFVFUyAoPywgLTEsID8sID8sID8pYCxcbiAgICAgICAgW2NoYXJhY3RlcklkLCBzbG90LCBOdW1iZXIocm93Lml0ZW1faWQpLCBNYXRoLm1heCgxLCBOdW1iZXIocm93LnF1YW50aXR5KSldLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHNlZWRDaGFyYWN0ZXJTa2lsbHNBbmRMYW5ndWFnZXMoY2hhcmFjdGVySWQ6IG51bWJlciwgcmFjZTogbnVtYmVyLCBjaGFyQ2xhc3M6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNraWxscyA9IG5ldyBNYXAoc3RhcnRpbmdTa2lsbHMocmFjZSkpO1xuICAgIGNvbnN0IGNsYXNzU2tpbGxzID0gKGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8eyBza2lsbF9pZDogbnVtYmVyOyBjYXA6IG51bWJlciB9PihcbiAgICAgIGBTRUxFQ1Qgc2tpbGxfaWQsIGNhcCBGUk9NICR7dGhpcy5jb250ZW50UHJlZml4fWNsYXNzX3NraWxsX2NhcHNcbiAgICAgICBXSEVSRSBjbGFzc19pZCA9ID8gQU5EIGxldmVsID0gMSBBTkQgY2FwID4gMGAsIFtjaGFyQ2xhc3NdLFxuICAgICkpLnJvd3M7XG4gICAgZm9yIChjb25zdCByb3cgb2YgY2xhc3NTa2lsbHMpIHtcbiAgICAgIGNvbnN0IHNraWxsSWQgPSBOdW1iZXIocm93LnNraWxsX2lkKTtcbiAgICAgIGlmICghc2tpbGxzLmhhcyhza2lsbElkKSAmJiBpc1N0YXJ0aW5nQ2xhc3NTa2lsbChza2lsbElkKSkgc2tpbGxzLnNldChza2lsbElkLCBOdW1iZXIocm93LmNhcCkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtza2lsbCwgdmFsdWVdIG9mIHNraWxscykgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFxuICAgICAgXCJJTlNFUlQgSU5UTyBjaGFyYWN0ZXJfc2tpbGxzIChjaGFyYWN0ZXJfaWQsIHNraWxsX2lkLCB2YWx1ZSkgVkFMVUVTICg/LCA/LCA/KVwiLCBbY2hhcmFjdGVySWQsIHNraWxsLCB2YWx1ZV0sXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IFtsYW5ndWFnZSwgdmFsdWVdIG9mIHN0YXJ0aW5nTGFuZ3VhZ2VzKHJhY2UsIGNoYXJDbGFzcykpIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShcbiAgICAgIFwiSU5TRVJUIElOVE8gY2hhcmFjdGVyX2xhbmd1YWdlcyAoY2hhcmFjdGVyX2lkLCBsYW5ndWFnZV9pZCwgdmFsdWUpIFZBTFVFUyAoPywgPywgPylcIiwgW2NoYXJhY3RlcklkLCBsYW5ndWFnZSwgdmFsdWVdLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVudGVyV29ybGQoXG4gICAgc2Vzc2lvbklkOiBudW1iZXIsXG4gICAgcmF3TmFtZTogc3RyaW5nLFxuICApOiBQcm9taXNlPEJhY2tlbmRFdmVudFtdPiB7XG4gICAgY29uc3QgbmFtZSA9IHJhd05hbWUudHJpbSgpO1xuICAgIGNvbnN0IGNoYXJhY3RlciA9IGF3YWl0IHRoaXMuY2hhcmFjdGVyKG5hbWUpO1xuICAgIGlmIChjaGFyYWN0ZXIpIHtcbiAgICAgIHRoaXMuc2Vzc2lvbihzZXNzaW9uSWQpLnNlbGVjdGVkQ2hhcmFjdGVyID0gY2hhcmFjdGVyLm5hbWU7XG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLmV4ZWN1dGUoXG4gICAgICAgIFwiVVBEQVRFIGNoYXJhY3RlcnMgU0VUIGxhc3RfbG9naW5fYXQgPSBDVVJSRU5UX1RJTUVTVEFNUCBXSEVSRSBpZCA9ID9cIixcbiAgICAgICAgW2NoYXJhY3Rlci5pZF0sXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gW2V2ZW50KFwicG9zdF9lbnRlcl93b3JsZFwiLCB7IHZhbHVlOiBjaGFyYWN0ZXIgPyAxIDogMCB9KV07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlWm9uZVNlc3Npb24oXG4gICAgc2Vzc2lvbklkOiBudW1iZXIsXG4gICAgem9uZTogbnVtYmVyIHwgc3RyaW5nLFxuICAgIGluc3RhbmNlSWQ6IG51bWJlcixcbiAgKTogUHJvbWlzZTxCYWNrZW5kRXZlbnRbXT4ge1xuICAgIGNvbnN0IHpvbmVJZCA9IGF3YWl0IHRoaXMucmVzb2x2ZVpvbmVJZCh6b25lKTtcbiAgICBpZiAoem9uZUlkICE9PSBudWxsKSB7XG4gICAgICB0aGlzLnNlc3Npb24oc2Vzc2lvbklkKS5wZW5kaW5nWm9uZSA9IHsgem9uZUlkLCBpbnN0YW5jZUlkIH07XG4gICAgfVxuICAgIHJldHVybiBbZXZlbnQoXCJ6b25lX3Nlc3Npb25fdmFsaWRcIiwgeyB2YWx1ZTogem9uZUlkID09PSBudWxsID8gMCA6IDEgfSldO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGFuZ2Vab25lKFxuICAgIHNlc3Npb25JZDogbnVtYmVyLFxuICAgIHJlcXVlc3RlZFpvbmU6IG51bWJlciB8IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBpbnN0YW5jZUlkOiBudW1iZXIsXG4gICk6IFByb21pc2U8QmFja2VuZEV2ZW50W10+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5lbnN1cmVTZWxlY3RlZENoYXJhY3RlcihzZXNzaW9uSWQpO1xuICAgIGlmIChyZXF1ZXN0ZWRab25lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHpvbmVJZCA9IGF3YWl0IHRoaXMucmVzb2x2ZVpvbmVJZChyZXF1ZXN0ZWRab25lKTtcbiAgICAgIGlmICh6b25lSWQgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIFtzZXJ2ZXJNZXNzYWdlKGBVbmtub3duIG9yIHVuYXZhaWxhYmxlIHpvbmU6ICR7cmVxdWVzdGVkWm9uZX1gKV07XG4gICAgICB9XG4gICAgICBzZXNzaW9uLnBlbmRpbmdab25lID0geyB6b25lSWQsIGluc3RhbmNlSWQgfTtcbiAgICAgIGlmIChzZXNzaW9uLnNlbGVjdGVkQ2hhcmFjdGVyKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShcbiAgICAgICAgICBgVVBEQVRFIGNoYXJhY3Rlcl9wb3NpdGlvbnMgU0VUIHpvbmVfaWQgPSA/LCBpbnN0YW5jZV9pZCA9ID8sIHVwZGF0ZWRfYXQgPSBDVVJSRU5UX1RJTUVTVEFNUFxuICAgICAgICAgICBXSEVSRSBjaGFyYWN0ZXJfaWQgPSAoU0VMRUNUIGlkIEZST00gY2hhcmFjdGVycyBXSEVSRSBuYW1lID0gPylgLFxuICAgICAgICAgIFt6b25lSWQsIGluc3RhbmNlSWQsIHNlc3Npb24uc2VsZWN0ZWRDaGFyYWN0ZXJdLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXNlc3Npb24uc2VsZWN0ZWRDaGFyYWN0ZXIgfHwgIXNlc3Npb24ucGVuZGluZ1pvbmUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBhdHRhY2ggY2xpZW50IHNlc3Npb24gdG8gem9uZSBpbnN0YW5jZVwiKTtcbiAgICB9XG4gICAgc2Vzc2lvbi5hY3RpdmVab25lID0gc2Vzc2lvbi5wZW5kaW5nWm9uZTtcbiAgICBzZXNzaW9uLnBlbmRpbmdab25lID0gbnVsbDtcbiAgICByZXR1cm4gdGhpcy56b25lQm9vdHN0cmFwKHNlc3Npb25JZCwgc2Vzc2lvbik7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdtQ29tbWFuZChcbiAgICBzZXNzaW9uSWQ6IG51bWJlcixcbiAgICByYXdDb21tYW5kOiBzdHJpbmcsXG4gICAgYXJnczogc3RyaW5nW10sXG4gICk6IFByb21pc2U8QmFja2VuZEV2ZW50W10+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5lbnN1cmVTZWxlY3RlZENoYXJhY3RlcihzZXNzaW9uSWQpO1xuICAgIGNvbnN0IG5hbWUgPSBzZXNzaW9uLnNlbGVjdGVkQ2hhcmFjdGVyO1xuICAgIGlmICghbmFtZSkge1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgc2VydmVyTWVzc2FnZShcIkEgY2hhcmFjdGVyIG11c3QgYmUgYWN0aXZlIGJlZm9yZSB1c2luZyBHTSBjb21tYW5kcy5cIiksXG4gICAgICBdO1xuICAgIH1cbiAgICBjb25zdCBjb21tYW5kID0gcmF3Q29tbWFuZC50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoY29tbWFuZCA9PT0gXCJsZXZlbFwiKSB7XG4gICAgICBjb25zdCBsZXZlbCA9IE51bWJlcihhcmdzWzBdKTtcbiAgICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihsZXZlbCkgfHwgbGV2ZWwgPCAxIHx8IGxldmVsID4gNTApIHtcbiAgICAgICAgcmV0dXJuIFtzZXJ2ZXJNZXNzYWdlKFwiTGV2ZWwgbXVzdCBiZSBiZXR3ZWVuIDEgYW5kIDUwLlwiKV07XG4gICAgICB9XG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLmV4ZWN1dGUoXG4gICAgICAgIFwiVVBEQVRFIGNoYXJhY3RlcnMgU0VUIGxldmVsID0gPyBXSEVSRSBuYW1lID0gP1wiLFxuICAgICAgICBbbGV2ZWwsIG5hbWVdLFxuICAgICAgKTtcbiAgICAgIHJldHVybiBbZXZlbnQoXCJsZXZlbF91cGRhdGVcIiwgeyBsZXZlbCwgZXhwOiAwIH0pXTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQgPT09IFwic2VhcmNoaXRlbVwiKSB7XG4gICAgICBjb25zdCBzZWFyY2ggPSBhcmdzLmpvaW4oXCIgXCIpLnRyaW0oKTtcbiAgICAgIGlmICghc2VhcmNoKSB7XG4gICAgICAgIHJldHVybiBbc2VydmVyTWVzc2FnZShcIlVzYWdlOiAjc2VhcmNoaXRlbSB7bmFtZX1cIildO1xuICAgICAgfVxuICAgICAgY29uc3Qgcm93cyA9IChcbiAgICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5xdWVyeTx7IGlkOiBudW1iZXI7IG5hbWU6IHN0cmluZyB9PihcbiAgICAgICAgICBgU0VMRUNUIGlkLCBuYW1lIEZST00gJHt0aGlzLmNvbnRlbnRQcmVmaXh9aXRlbXMgV0hFUkUgbmFtZSBMSUtFID8gT1JERVIgQlkgbmFtZSBMSU1JVCAyMGAsXG4gICAgICAgICAgW2AlJHtzZWFyY2h9JWBdLFxuICAgICAgICApXG4gICAgICApLnJvd3M7XG4gICAgICByZXR1cm4gW1xuICAgICAgICBzZXJ2ZXJNZXNzYWdlKFxuICAgICAgICAgIHJvd3MubGVuZ3RoXG4gICAgICAgICAgICA/IHJvd3MubWFwKChyb3cpID0+IGAke3Jvdy5pZH06ICR7cm93Lm5hbWV9YCkuam9pbihcIiB8IFwiKVxuICAgICAgICAgICAgOiBgTm8gaXRlbXMgbWF0Y2hlZCAnJHtzZWFyY2h9Jy5gLFxuICAgICAgICApLFxuICAgICAgXTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQgPT09IFwic3VtbW9uaXRlbVwiKSB7XG4gICAgICByZXR1cm4gdGhpcy5zdW1tb25JdGVtKG5hbWUsIE51bWJlcihhcmdzWzBdKSwgYXJnc1swXSk7XG4gICAgfVxuICAgIGlmIChjb21tYW5kID09PSBcInB1cmdlaXRlbXNcIikge1xuICAgICAgcmV0dXJuIHRoaXMucHVyZ2VJdGVtcyhuYW1lKTtcbiAgICB9XG4gICAgaWYgKGNvbW1hbmQgPT09IFwiZ2VhcnVwXCIpIHtcbiAgICAgIHJldHVybiB0aGlzLmdlYXJVcChuYW1lKTtcbiAgICB9XG4gICAgcmV0dXJuIFtzZXJ2ZXJNZXNzYWdlKGBVbnN1cHBvcnRlZCBHTSBjb21tYW5kOiAjJHtjb21tYW5kfWApXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hhbm5lbE1lc3NhZ2UoXG4gICAgc2Vzc2lvbklkOiBudW1iZXIsXG4gICAgcmVxdWVzdDogRXh0cmFjdDxCYWNrZW5kUmVxdWVzdCwgeyB0eXBlOiBcImNoYW5uZWxfbWVzc2FnZVwiIH0+LFxuICApOiBQcm9taXNlPEJhY2tlbmRFdmVudFtdPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZW5zdXJlU2VsZWN0ZWRDaGFyYWN0ZXIoc2Vzc2lvbklkKTtcbiAgICBpZiAoXG4gICAgICAhc2Vzc2lvbi5hY3RpdmVab25lIHx8XG4gICAgICAhc2Vzc2lvbi5zZWxlY3RlZENoYXJhY3RlciB8fFxuICAgICAgcmVxdWVzdC5jaGFubmVsICE9PSAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIGNvbnN0IHRhcmdldCA9IChcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8U3Bhd25Sb3c+KFxuICAgICAgICBgJHtzcGF3blNlbGVjdCh0aGlzLmNvbnRlbnRQcmVmaXgpfVxuICAgICAgIFdIRVJFIHNwLnpvbmVfaWQgPSA/IEFORCBsb3dlcihyZXBsYWNlKG5wYy5uYW1lLCAnXycsICcgJykpID0gbG93ZXIocmVwbGFjZSg/LCAnXycsICcgJykpXG4gICAgICAgTElNSVQgMWAsXG4gICAgICAgIFtzZXNzaW9uLmFjdGl2ZVpvbmUuem9uZUlkLCByZXF1ZXN0LnRhcmdldE5hbWVdLFxuICAgICAgKVxuICAgICkucm93c1swXTtcbiAgICBpZiAoIXRhcmdldCkge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICBjb25zdCBwbGF5ZXIgPSBhd2FpdCB0aGlzLmNoYXJhY3RlcihzZXNzaW9uLnNlbGVjdGVkQ2hhcmFjdGVyKTtcbiAgICBjb25zdCBlZmZlY3RzID0gdGhpcy5xdWVzdE1hbmFnZXIoXG4gICAgICBzZXNzaW9uLmFjdGl2ZVpvbmUuem9uZUlkLFxuICAgICAgc2Vzc2lvbi5hY3RpdmVab25lLmluc3RhbmNlSWQsXG4gICAgKS5kaXNwYXRjaCh7XG4gICAgICB0eXBlOiBcInNheVwiLFxuICAgICAgdGljazogMCxcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIGFjdG9yTmFtZTogc2Vzc2lvbi5zZWxlY3RlZENoYXJhY3RlcixcbiAgICAgIG5wY05hbWU6IHRhcmdldC5uYW1lLFxuICAgICAgbWVzc2FnZTogcmVxdWVzdC5tZXNzYWdlLFxuICAgICAgYWN0b3I6IHtcbiAgICAgICAga2luZDogXCJwbGF5ZXJcIixcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICBuYW1lOiBzZXNzaW9uLnNlbGVjdGVkQ2hhcmFjdGVyLFxuICAgICAgICAuLi4ocGxheWVyID09PSB1bmRlZmluZWRcbiAgICAgICAgICA/IHt9XG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIGlkOiBwbGF5ZXIuaWQsXG4gICAgICAgICAgICAgIGxldmVsOiBwbGF5ZXIubGV2ZWwsXG4gICAgICAgICAgICAgIGNsYXNzSWQ6IHBsYXllci5jbGFzc19pZCxcbiAgICAgICAgICAgICAgcmFjZUlkOiBwbGF5ZXIucmFjZV9pZCxcbiAgICAgICAgICAgICAgZ2VuZGVyOiBwbGF5ZXIuZ2VuZGVyLFxuICAgICAgICAgICAgfSksXG4gICAgICB9LFxuICAgICAgcmVjZWl2ZXI6IHtcbiAgICAgICAga2luZDogXCJucGNcIixcbiAgICAgICAgaWQ6IHRhcmdldC5pZCxcbiAgICAgICAgbnBjSWQ6IHRhcmdldC5ucGNfaWQsXG4gICAgICAgIG5hbWU6IHRhcmdldC5uYW1lLFxuICAgICAgICBsZXZlbDogdGFyZ2V0LmxldmVsLFxuICAgICAgICByYWNlSWQ6IHRhcmdldC5yYWNlLFxuICAgICAgICBnZW5kZXI6IHRhcmdldC5nZW5kZXIsXG4gICAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgICAgeDogdGFyZ2V0LngsXG4gICAgICAgICAgeTogdGFyZ2V0LnksXG4gICAgICAgICAgejogdGFyZ2V0LnosXG4gICAgICAgICAgaGVhZGluZzogdGFyZ2V0LmhlYWRpbmcsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLnF1ZXN0RXZlbnRzKGVmZmVjdHMsIHNlc3Npb24uc2VsZWN0ZWRDaGFyYWN0ZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBxdWVzdE1hbmFnZXIoem9uZUlkOiBudW1iZXIsIGluc3RhbmNlSWQ6IG51bWJlcik6IFF1ZXN0TWFuYWdlciB7XG4gICAgY29uc3Qga2V5ID0gYCR7em9uZUlkfToke2luc3RhbmNlSWR9YDtcbiAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5xdWVzdE1hbmFnZXJzLmdldChrZXkpO1xuICAgIGlmIChjdXJyZW50KSB7XG4gICAgICByZXR1cm4gY3VycmVudDtcbiAgICB9XG4gICAgY29uc3QgY3JlYXRlZCA9IG5ldyBRdWVzdE1hbmFnZXIoXG4gICAgICB6b25lSWQsXG4gICAgICBpbnN0YW5jZUlkLFxuICAgICAgcXVlc3RSZWdpc3RyeUZvclpvbmUoem9uZUlkKT8uem9uZS5zaG9ydE5hbWUgPz8gbnVsbCxcbiAgICApO1xuICAgIGNyZWF0ZWQucmVwbGFjZSh0aGlzLmNvbnRlbnQucXVlc3RzID8/IFtdLCAxKTtcbiAgICB0aGlzLnF1ZXN0TWFuYWdlcnMuc2V0KGtleSwgY3JlYXRlZCk7XG4gICAgcmV0dXJuIGNyZWF0ZWQ7XG4gIH1cblxuICBwcml2YXRlIHF1ZXN0RXZlbnRzKFxuICAgIGVmZmVjdHM6IHJlYWRvbmx5IFF1ZXN0RWZmZWN0W10sXG4gICAgYWN0b3JOYW1lOiBzdHJpbmcsXG4gICk6IEJhY2tlbmRFdmVudFtdIHtcbiAgICByZXR1cm4gZWZmZWN0cy5mbGF0TWFwKChlZmZlY3QpOiBCYWNrZW5kRXZlbnRbXSA9PiB7XG4gICAgICBpZiAoZWZmZWN0LnR5cGUgIT09IFwibnBjX3NheVwiICYmIGVmZmVjdC50eXBlICE9PSBcImVudGl0eV9zYXlcIikge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICByZXR1cm4gW1xuICAgICAgICBldmVudChcbiAgICAgICAgICBcImNoYW5uZWxfbWVzc2FnZVwiLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNlbmRlcjpcbiAgICAgICAgICAgICAgZWZmZWN0LnR5cGUgPT09IFwibnBjX3NheVwiID8gZWZmZWN0Lm5wY05hbWUgOiBlZmZlY3QuZW50aXR5TmFtZSxcbiAgICAgICAgICAgIHRhcmdldDogYWN0b3JOYW1lLFxuICAgICAgICAgICAgbWVzc2FnZTogZWZmZWN0Lm1lc3NhZ2UsXG4gICAgICAgICAgICBjaGFuTnVtOiAwLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjb250cm9sLXN0cmVhbVwiLFxuICAgICAgICApLFxuICAgICAgXTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgc3VtbW9uSXRlbShcbiAgICBjaGFyYWN0ZXJOYW1lOiBzdHJpbmcsXG4gICAgaXRlbUlkOiBudW1iZXIsXG4gICAgcmF3SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgKTogUHJvbWlzZTxCYWNrZW5kRXZlbnRbXT4ge1xuICAgIGNvbnN0IGl0ZW0gPSBhd2FpdCB0aGlzLmdldEl0ZW0oaXRlbUlkKTtcbiAgICBpZiAoIWl0ZW0pIHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgIHNlcnZlck1lc3NhZ2UoXG4gICAgICAgICAgYEl0ZW0gJHtyYXdJZCA/PyBcIlwifSB3YXMgbm90IGZvdW5kIGluIHRoZSBvZmZsaW5lIGNhdGFsb2cuYCxcbiAgICAgICAgKSxcbiAgICAgIF07XG4gICAgfVxuICAgIGNvbnN0IG9jY3VwaWVkUm93cyA9IChcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8eyBzbG90OiBudW1iZXIgfT4oXG4gICAgICAgIGBTRUxFQ1Qgc2xvdCBGUk9NIHBsYXllcl9pbnZlbnRvcnlcbiAgICAgICBXSEVSRSBjaGFyYWN0ZXJfaWQgPSAoU0VMRUNUIGlkIEZST00gY2hhcmFjdGVycyBXSEVSRSBuYW1lID0gPylcbiAgICAgICAgIEFORCBiYWcgPSAwIEFORCBzbG90IEJFVFdFRU4gMjIgQU5EIDI5YCxcbiAgICAgICAgW2NoYXJhY3Rlck5hbWVdLFxuICAgICAgKVxuICAgICkucm93cztcbiAgICBjb25zdCBvY2N1cGllZCA9IG5ldyBTZXQob2NjdXBpZWRSb3dzLm1hcCgocm93KSA9PiBOdW1iZXIocm93LnNsb3QpKSk7XG4gICAgY29uc3Qgc2xvdCA9XG4gICAgICBHRU5FUkFMX1NMT1RTLmZpbmQoKGNhbmRpZGF0ZSkgPT4gIW9jY3VwaWVkLmhhcyhjYW5kaWRhdGUpKSA/PyAzMDtcbiAgICBpZiAoc2xvdCA9PT0gMzApIHtcbiAgICAgIGNvbnN0IGN1cnNvciA9IGF3YWl0IHRoaXMuaW52ZW50b3J5QXQoY2hhcmFjdGVyTmFtZSwgMzAsIDApO1xuICAgICAgaWYgKGN1cnNvcikge1xuICAgICAgICByZXR1cm4gW3NlcnZlck1lc3NhZ2UoXCJZb3VyIGdlbmVyYWwgaW52ZW50b3J5IGFuZCBjdXJzb3IgYXJlIGZ1bGwuXCIpXTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFxuICAgICAgYElOU0VSVCBJTlRPIHBsYXllcl9pbnZlbnRvcnkgKGNoYXJhY3Rlcl9pZCwgc2xvdCwgYmFnLCBpdGVtX2lkKVxuICAgICAgIFNFTEVDVCBpZCwgPywgMCwgPyBGUk9NIGNoYXJhY3RlcnMgV0hFUkUgbmFtZSA9ID9gLFxuICAgICAgW3Nsb3QsIGl0ZW1JZCwgY2hhcmFjdGVyTmFtZV0sXG4gICAgKTtcbiAgICByZXR1cm4gW2V2ZW50KFwiYWRkX2l0ZW1cIiwgdGhpcy5pdGVtSW5zdGFuY2UoaXRlbSwgc2xvdCwgMCkpXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcHVyZ2VJdGVtcyhjaGFyYWN0ZXJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPEJhY2tlbmRFdmVudFtdPiB7XG4gICAgY29uc3Qgcm93cyA9IChcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8eyBzbG90OiBudW1iZXI7IGJhZzogbnVtYmVyIH0+KFxuICAgICAgICBgU0VMRUNUIHNsb3QsIGJhZyBGUk9NIHBsYXllcl9pbnZlbnRvcnlcbiAgICAgICBXSEVSRSBjaGFyYWN0ZXJfaWQgPSAoU0VMRUNUIGlkIEZST00gY2hhcmFjdGVycyBXSEVSRSBuYW1lID0gPylgLFxuICAgICAgICBbY2hhcmFjdGVyTmFtZV0sXG4gICAgICApXG4gICAgKS5yb3dzO1xuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShcbiAgICAgIFwiREVMRVRFIEZST00gcGxheWVyX2ludmVudG9yeSBXSEVSRSBjaGFyYWN0ZXJfaWQgPSAoU0VMRUNUIGlkIEZST00gY2hhcmFjdGVycyBXSEVSRSBuYW1lID0gPylcIixcbiAgICAgIFtjaGFyYWN0ZXJOYW1lXSxcbiAgICApO1xuICAgIHJldHVybiBbXG4gICAgICBldmVudChcImJ1bGtfZGVsZXRlX2l0ZW1zXCIsIHtcbiAgICAgICAgaXRlbXM6IHJvd3MubWFwKChyb3cpID0+ICh7XG4gICAgICAgICAgc2xvdDogTnVtYmVyKHJvdy5zbG90KSxcbiAgICAgICAgICBiYWc6IE51bWJlcihyb3cuYmFnKSxcbiAgICAgICAgfSkpLFxuICAgICAgfSksXG4gICAgXTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2VhclVwKGNoYXJhY3Rlck5hbWU6IHN0cmluZyk6IFByb21pc2U8QmFja2VuZEV2ZW50W10+IHtcbiAgICBjb25zdCBjaGFyYWN0ZXIgPSBhd2FpdCB0aGlzLmNoYXJhY3RlcihjaGFyYWN0ZXJOYW1lKTtcbiAgICBjb25zdCBnZWFyID0gY2hhcmFjdGVyXG4gICAgICA/IHRoaXMuY29udGVudC5nZWFyU2V0c1tcbiAgICAgICAgICBgJHtOdW1iZXIoY2hhcmFjdGVyLmNsYXNzX2lkKX06JHtOdW1iZXIoY2hhcmFjdGVyLmxldmVsKX1gXG4gICAgICAgIF1cbiAgICAgIDogdW5kZWZpbmVkO1xuICAgIGlmICghY2hhcmFjdGVyIHx8ICFnZWFyPy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBbXG4gICAgICAgIHNlcnZlck1lc3NhZ2UoXCJObyBvZmZsaW5lIGdlYXIgc2V0IGV4aXN0cyBmb3IgdGhpcyBjbGFzcyBhbmQgbGV2ZWwuXCIpLFxuICAgICAgXTtcbiAgICB9XG4gICAgY29uc3Qgb2xkID0gKFxuICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5xdWVyeTx7IHNsb3Q6IG51bWJlcjsgYmFnOiBudW1iZXIgfT4oXG4gICAgICAgIGBTRUxFQ1Qgc2xvdCwgYmFnIEZST00gcGxheWVyX2ludmVudG9yeVxuICAgICAgIFdIRVJFIGNoYXJhY3Rlcl9pZCA9IChTRUxFQ1QgaWQgRlJPTSBjaGFyYWN0ZXJzIFdIRVJFIG5hbWUgPSA/KSBBTkQgYmFnID0gLTFgLFxuICAgICAgICBbY2hhcmFjdGVyTmFtZV0sXG4gICAgICApXG4gICAgKS5yb3dzO1xuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UudHJhbnNhY3Rpb24oYXN5bmMgKGRhdGFiYXNlKSA9PiB7XG4gICAgICBhd2FpdCBkYXRhYmFzZS5leGVjdXRlKFxuICAgICAgICBgREVMRVRFIEZST00gcGxheWVyX2ludmVudG9yeVxuICAgICAgICAgV0hFUkUgY2hhcmFjdGVyX2lkID0gKFNFTEVDVCBpZCBGUk9NIGNoYXJhY3RlcnMgV0hFUkUgbmFtZSA9ID8pIEFORCBiYWcgPSAtMWAsXG4gICAgICAgIFtjaGFyYWN0ZXJOYW1lXSxcbiAgICAgICk7XG4gICAgICBmb3IgKGNvbnN0IFtzbG90LCBpdGVtSWRdIG9mIGdlYXIpIHtcbiAgICAgICAgYXdhaXQgZGF0YWJhc2UuZXhlY3V0ZShcbiAgICAgICAgICBgSU5TRVJUIElOVE8gcGxheWVyX2ludmVudG9yeSAoY2hhcmFjdGVyX2lkLCBzbG90LCBiYWcsIGl0ZW1faWQpXG4gICAgICAgICAgIFNFTEVDVCBjaGFyYWN0ZXIuaWQsID8sIC0xLCBpdGVtLmlkIEZST00gY2hhcmFjdGVycyBjaGFyYWN0ZXIsICR7dGhpcy5jb250ZW50UHJlZml4fWl0ZW1zIGl0ZW1cbiAgICAgICAgICAgV0hFUkUgY2hhcmFjdGVyLm5hbWUgPSA/IEFORCBpdGVtLmlkID0gP2AsXG4gICAgICAgICAgW3Nsb3QsIGNoYXJhY3Rlck5hbWUsIGl0ZW1JZF0sXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgZXZlbnRzOiBCYWNrZW5kRXZlbnRbXSA9IFtdO1xuICAgIGlmIChvbGQubGVuZ3RoKSB7XG4gICAgICBldmVudHMucHVzaChcbiAgICAgICAgZXZlbnQoXCJidWxrX2RlbGV0ZV9pdGVtc1wiLCB7XG4gICAgICAgICAgaXRlbXM6IG9sZC5tYXAoKHJvdykgPT4gKHtcbiAgICAgICAgICAgIHNsb3Q6IE51bWJlcihyb3cuc2xvdCksXG4gICAgICAgICAgICBiYWc6IE51bWJlcihyb3cuYmFnKSxcbiAgICAgICAgICB9KSksXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9XG4gICAgZXZlbnRzLnB1c2goXG4gICAgICBldmVudChcImJ1bGtfaXRlbXNcIiwgeyBpdGVtczogYXdhaXQgdGhpcy5pbnZlbnRvcnlJdGVtcyhjaGFyYWN0ZXJOYW1lKSB9KSxcbiAgICApO1xuICAgIGV2ZW50cy5wdXNoKFxuICAgICAgc2VydmVyTWVzc2FnZShcbiAgICAgICAgYExvYWRlZCB0aGUgbGV2ZWwgJHtjaGFyYWN0ZXIubGV2ZWx9IGNsYXNzICR7Y2hhcmFjdGVyLmNsYXNzX2lkfSBnZWFyIHNldC5gLFxuICAgICAgKSxcbiAgICApO1xuICAgIHJldHVybiBldmVudHM7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIG1vdmVJdGVtKFxuICAgIHNlc3Npb25JZDogbnVtYmVyLFxuICAgIHJlcXVlc3Q6IEV4dHJhY3Q8QmFja2VuZFJlcXVlc3QsIHsgdHlwZTogXCJtb3ZlX2l0ZW1cIiB9PixcbiAgKTogUHJvbWlzZTxCYWNrZW5kRXZlbnRbXT4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmVuc3VyZVNlbGVjdGVkQ2hhcmFjdGVyKHNlc3Npb25JZCk7XG4gICAgY29uc3QgbmFtZSA9IHNlc3Npb24uc2VsZWN0ZWRDaGFyYWN0ZXI7XG4gICAgaWYgKCFuYW1lKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlcyA9IFtcbiAgICAgIHJlcXVlc3QuZnJvbVNsb3QsXG4gICAgICByZXF1ZXN0LnRvU2xvdCxcbiAgICAgIHJlcXVlc3QuZnJvbUJhZyxcbiAgICAgIHJlcXVlc3QudG9CYWcsXG4gICAgXTtcbiAgICBpZiAoIXZhbHVlcy5ldmVyeShOdW1iZXIuaXNJbnRlZ2VyKSkge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICBjb25zdCByb3dzID0gYXdhaXQgdGhpcy5pbnZlbnRvcnlSb3dzKG5hbWUpO1xuICAgIGNvbnN0IHNvdXJjZSA9IHJvd3MuZmluZChcbiAgICAgIChyb3cpID0+IHJvdy5zbG90ID09PSByZXF1ZXN0LmZyb21TbG90ICYmIHJvdy5iYWcgPT09IHJlcXVlc3QuZnJvbUJhZyxcbiAgICApO1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uID0gcm93cy5maW5kKFxuICAgICAgKHJvdykgPT4gcm93LnNsb3QgPT09IHJlcXVlc3QudG9TbG90ICYmIHJvdy5iYWcgPT09IHJlcXVlc3QudG9CYWcsXG4gICAgKTtcbiAgICBpZiAoIXNvdXJjZSAmJiAhZGVzdGluYXRpb24pIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgIXRoaXMuaXRlbUFsbG93ZWQoc291cmNlPy5pdGVtLCByZXF1ZXN0LnRvU2xvdCkgfHxcbiAgICAgICF0aGlzLml0ZW1BbGxvd2VkKGRlc3RpbmF0aW9uPy5pdGVtLCByZXF1ZXN0LmZyb21TbG90KVxuICAgICkge1xuICAgICAgcmV0dXJuIFtzZXJ2ZXJNZXNzYWdlKFwiVGhhdCBpdGVtIGNhbm5vdCBiZSBlcXVpcHBlZCBpbiB0aGF0IHNsb3QuXCIpXTtcbiAgICB9XG4gICAgY29uc3QgY2hhcmFjdGVyID0gYXdhaXQgdGhpcy5jaGFyYWN0ZXIobmFtZSk7XG4gICAgaWYgKFxuICAgICAgIWNoYXJhY3RlciB8fFxuICAgICAgIXRoaXMuY2hhcmFjdGVyQ2FuRXF1aXAoY2hhcmFjdGVyLCBzb3VyY2U/Lml0ZW0sIHJlcXVlc3QudG9TbG90KSB8fFxuICAgICAgIXRoaXMuY2hhcmFjdGVyQ2FuRXF1aXAoY2hhcmFjdGVyLCBkZXN0aW5hdGlvbj8uaXRlbSwgcmVxdWVzdC5mcm9tU2xvdClcbiAgICApIHtcbiAgICAgIHJldHVybiBbc2VydmVyTWVzc2FnZShcIllvdXIgY2xhc3Mgb3IgcmFjZSBjYW5ub3QgZXF1aXAgdGhhdCBpdGVtLlwiKV07XG4gICAgfVxuICAgIGxldCBtb3ZlcztcbiAgICB0cnkge1xuICAgICAgbW92ZXMgPSBwbGFuSW52ZW50b3J5U3dhcChcbiAgICAgICAgcm93cy5tYXAoKHJvdykgPT4gKHtcbiAgICAgICAgICBzbG90OiByb3cuc2xvdCxcbiAgICAgICAgICBiYWc6IHJvdy5iYWcsXG4gICAgICAgICAgaXRlbUtleTogcm93Lml0ZW0uaWQsXG4gICAgICAgICAgY29udGFpbmVyU2xvdHM6IHJvdy5pdGVtLmJhZ3Nsb3RzLFxuICAgICAgICB9KSksXG4gICAgICAgIHsgc2xvdDogcmVxdWVzdC5mcm9tU2xvdCwgYmFnOiByZXF1ZXN0LmZyb21CYWcgfSxcbiAgICAgICAgeyBzbG90OiByZXF1ZXN0LnRvU2xvdCwgYmFnOiByZXF1ZXN0LnRvQmFnIH0sXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gW1xuICAgICAgICBzZXJ2ZXJNZXNzYWdlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSksXG4gICAgICBdO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnRyYW5zYWN0aW9uKGFzeW5jIChkYXRhYmFzZSkgPT4ge1xuICAgICAgZm9yIChjb25zdCBtb3ZlIG9mIG1vdmVzKSB7XG4gICAgICAgIGF3YWl0IGRhdGFiYXNlLmV4ZWN1dGUoXG4gICAgICAgICAgYERFTEVURSBGUk9NIHBsYXllcl9pbnZlbnRvcnlcbiAgICAgICAgICAgV0hFUkUgY2hhcmFjdGVyX2lkID0gKFNFTEVDVCBpZCBGUk9NIGNoYXJhY3RlcnMgV0hFUkUgbmFtZSA9ID8pXG4gICAgICAgICAgICAgQU5EIHNsb3QgPSA/IEFORCBiYWcgPSA/YCxcbiAgICAgICAgICBbbmFtZSwgbW92ZS5mcm9tU2xvdCwgbW92ZS5mcm9tQmFnXSxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3QgbW92ZSBvZiBtb3Zlcykge1xuICAgICAgICBhd2FpdCBkYXRhYmFzZS5leGVjdXRlKFxuICAgICAgICAgIGBJTlNFUlQgSU5UTyBwbGF5ZXJfaW52ZW50b3J5IChjaGFyYWN0ZXJfaWQsIHNsb3QsIGJhZywgaXRlbV9pZClcbiAgICAgICAgICAgU0VMRUNUIGlkLCA/LCA/LCA/IEZST00gY2hhcmFjdGVycyBXSEVSRSBuYW1lID0gP2AsXG4gICAgICAgICAgW21vdmUuc2xvdCwgbW92ZS5iYWcsIE51bWJlcihtb3ZlLml0ZW1LZXkpLCBuYW1lXSxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gbW92ZW1lbnRDb25maXJtYXRpb25zKFxuICAgICAgbW92ZXMsXG4gICAgICB7IHNsb3Q6IHJlcXVlc3QuZnJvbVNsb3QsIGJhZzogcmVxdWVzdC5mcm9tQmFnIH0sXG4gICAgICB7IHNsb3Q6IHJlcXVlc3QudG9TbG90LCBiYWc6IHJlcXVlc3QudG9CYWcgfSxcbiAgICApLm1hcCgobW92ZSkgPT5cbiAgICAgIGV2ZW50KFxuICAgICAgICBcIm1vdmVfaXRlbVwiLFxuICAgICAgICB7XG4gICAgICAgICAgLi4ubW92ZSxcbiAgICAgICAgICBmcm9tQmFnU2xvdDogbW92ZS5mcm9tQmFnLFxuICAgICAgICAgIHRvQmFnU2xvdDogbW92ZS50b0JhZyxcbiAgICAgICAgICBudW1iZXJJblN0YWNrOiAxLFxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRyb2wtc3RyZWFtXCIsXG4gICAgICApLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRlbGV0ZUl0ZW0oXG4gICAgc2Vzc2lvbklkOiBudW1iZXIsXG4gICAgc2xvdDogbnVtYmVyLFxuICAgIGJhZzogbnVtYmVyLFxuICApOiBQcm9taXNlPEJhY2tlbmRFdmVudFtdPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZW5zdXJlU2VsZWN0ZWRDaGFyYWN0ZXIoc2Vzc2lvbklkKTtcbiAgICBpZiAoIXNlc3Npb24uc2VsZWN0ZWRDaGFyYWN0ZXIgfHwgc2xvdCAhPT0gMzApIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFxuICAgICAgYERFTEVURSBGUk9NIHBsYXllcl9pbnZlbnRvcnlcbiAgICAgICBXSEVSRSBjaGFyYWN0ZXJfaWQgPSAoU0VMRUNUIGlkIEZST00gY2hhcmFjdGVycyBXSEVSRSBuYW1lID0gPykgQU5EIHNsb3QgPSAzMCBBTkQgYmFnID0gP2AsXG4gICAgICBbc2Vzc2lvbi5zZWxlY3RlZENoYXJhY3RlciwgYmFnXSxcbiAgICApO1xuICAgIHJldHVybiBbZXZlbnQoXCJkZWxldGVfaXRlbVwiLCB7IHNsb3QsIGJhZyB9KV07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHpvbmVCb290c3RyYXAoXG4gICAgc2Vzc2lvbklkOiBudW1iZXIsXG4gICAgc2Vzc2lvbjogRW1iZWRkZWRTZXNzaW9uLFxuICApOiBQcm9taXNlPEJhY2tlbmRFdmVudFtdPiB7XG4gICAgY29uc3Qgcm91dGUgPSBzZXNzaW9uLmFjdGl2ZVpvbmU7XG4gICAgaWYgKCFyb3V0ZSB8fCAhc2Vzc2lvbi5zZWxlY3RlZENoYXJhY3Rlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gYWN0aXZlIHpvbmUgcm91dGVcIik7XG4gICAgfVxuICAgIGNvbnN0IHpvbmUgPSAoXG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PFpvbmVSb3c+KFxuICAgICAgICBgU0VMRUNUIGlkLCBzaG9ydF9uYW1lIEFTIGtleSwgbmFtZSwgc2FmZV94LCBzYWZlX3ksIHNhZmVfelxuICAgICAgIEZST00gJHt0aGlzLmNvbnRlbnRQcmVmaXh9em9uZXMgV0hFUkUgaWQgPSA/IExJTUlUIDFgLFxuICAgICAgICBbcm91dGUuem9uZUlkXSxcbiAgICAgIClcbiAgICApLnJvd3NbMF07XG4gICAgY29uc3QgY2hhcmFjdGVyID0gYXdhaXQgdGhpcy5jaGFyYWN0ZXIoc2Vzc2lvbi5zZWxlY3RlZENoYXJhY3Rlcik7XG4gICAgaWYgKCF6b25lIHx8ICFjaGFyYWN0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBsb2FkIHpvbmUgYm9vdHN0cmFwIGRhdGFcIik7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbWVtYmVycyBvZiB0aGlzLnpvbmVTZXNzaW9ucy52YWx1ZXMoKSkge1xuICAgICAgbWVtYmVycy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICB9XG4gICAgY29uc3Qga2V5ID0gYCR7cm91dGUuem9uZUlkfToke3JvdXRlLmluc3RhbmNlSWR9YDtcbiAgICBjb25zdCBtZW1iZXJzID0gdGhpcy56b25lU2Vzc2lvbnMuZ2V0KGtleSkgPz8gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgbWVtYmVycy5hZGQoc2Vzc2lvbklkKTtcbiAgICB0aGlzLnpvbmVTZXNzaW9ucy5zZXQoa2V5LCBtZW1iZXJzKTtcbiAgICBjb25zdCBzcGF3bnMgPSAoXG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PERhdGFiYXNlUm93PihcbiAgICAgICAgYCR7c3Bhd25TZWxlY3QodGhpcy5jb250ZW50UHJlZml4KX0gV0hFUkUgc3Auem9uZV9pZCA9ID8gT1JERVIgQlkgc3AuaWRgLFxuICAgICAgICBbcm91dGUuem9uZUlkXSxcbiAgICAgIClcbiAgICApLnJvd3MubWFwKChzcGF3bikgPT4ge1xuICAgICAgY29uc3QgcHJvcGVydGllcyA9IGpzb25PYmplY3Qoc3Bhd24ucHJvcGVydGllc19qc29uKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiBOdW1iZXIoc3Bhd24ubnBjX2lkKSxcbiAgICAgICAgc3Bhd25JZDogTnVtYmVyKHNwYXduLmlkKSxcbiAgICAgICAgbmFtZTogU3RyaW5nKHNwYXduLm5hbWUpLFxuICAgICAgICB4OiBOdW1iZXIoc3Bhd24ueCksXG4gICAgICAgIHk6IE51bWJlcihzcGF3bi55KSxcbiAgICAgICAgejogTnVtYmVyKHNwYXduLnopLFxuICAgICAgICBoZWFkaW5nOiBOdW1iZXIoc3Bhd24uaGVhZGluZyksXG4gICAgICAgIHJhY2U6IE51bWJlcihzcGF3bi5yYWNlID8/IDEpLFxuICAgICAgICBnZW5kZXI6IE51bWJlcihzcGF3bi5nZW5kZXIgPz8gMCksXG4gICAgICAgIGxldmVsOiBOdW1iZXIoc3Bhd24ubGV2ZWwgPz8gMSksXG4gICAgICAgIGlzTnBjOiB0cnVlLFxuICAgICAgICBzaXplOiBmaW5pdGVOdW1iZXIocHJvcGVydGllcy5zaXplLCA2KSxcbiAgICAgICAgZmFjZTogZmluaXRlTnVtYmVyKHByb3BlcnRpZXMuZmFjZSwgMCksXG4gICAgICAgIGhlbG06IGZpbml0ZU51bWJlcihwcm9wZXJ0aWVzLmhlbG0sIDApLFxuICAgICAgICBlcXVpcENoZXN0OiBmaW5pdGVOdW1iZXIocHJvcGVydGllcy50ZXh0dXJlLCAwKSxcbiAgICAgICAgZXF1aXBtZW50OiB7XG4gICAgICAgICAgaGVhZDogZmluaXRlTnVtYmVyKHByb3BlcnRpZXMuaGVsbSwgMCksXG4gICAgICAgICAgY2hlc3Q6IGZpbml0ZU51bWJlcihwcm9wZXJ0aWVzLnRleHR1cmUsIDApLFxuICAgICAgICAgIHByaW1hcnk6IGZpbml0ZU51bWJlcihwcm9wZXJ0aWVzLnByaW1hcnksIDApLFxuICAgICAgICAgIHNlY29uZGFyeTogZmluaXRlTnVtYmVyKHByb3BlcnRpZXMuc2Vjb25kYXJ5LCAwKSxcbiAgICAgICAgfSxcbiAgICAgICAgY2hhckNsYXNzOiBmaW5pdGVOdW1iZXIocHJvcGVydGllcy5jbGFzc0lkLCAxKSxcbiAgICAgICAgYm9keXR5cGU6IGZpbml0ZU51bWJlcihwcm9wZXJ0aWVzLmJvZHlUeXBlLCAxKSxcbiAgICAgIH07XG4gICAgfSk7XG4gICAgdGhpcy5xdWVzdE1hbmFnZXIocm91dGUuem9uZUlkLCByb3V0ZS5pbnN0YW5jZUlkKS5oeWRyYXRlKHtcbiAgICAgIHBsYXllcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGtpbmQ6IFwicGxheWVyXCIsXG4gICAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICAgIGlkOiBOdW1iZXIoY2hhcmFjdGVyLmlkKSxcbiAgICAgICAgICBuYW1lOiBjaGFyYWN0ZXIubmFtZSxcbiAgICAgICAgICBsZXZlbDogTnVtYmVyKGNoYXJhY3Rlci5sZXZlbCksXG4gICAgICAgICAgY2xhc3NJZDogTnVtYmVyKGNoYXJhY3Rlci5jbGFzc19pZCksXG4gICAgICAgICAgcmFjZUlkOiBOdW1iZXIoY2hhcmFjdGVyLnJhY2VfaWQpLFxuICAgICAgICAgIGdlbmRlcjogTnVtYmVyKGNoYXJhY3Rlci5nZW5kZXIpLFxuICAgICAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgICAgICB4OiBOdW1iZXIoY2hhcmFjdGVyLngpLFxuICAgICAgICAgICAgeTogTnVtYmVyKGNoYXJhY3Rlci55KSxcbiAgICAgICAgICAgIHo6IE51bWJlcihjaGFyYWN0ZXIueiksXG4gICAgICAgICAgICBoZWFkaW5nOiBOdW1iZXIoY2hhcmFjdGVyLmhlYWRpbmcpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgbnBjczogc3Bhd25zLm1hcCgoc3Bhd24sIG5wY0luZGV4KSA9PiAoe1xuICAgICAgICBraW5kOiBcIm5wY1wiLFxuICAgICAgICBpZDogc3Bhd24uc3Bhd25JZCxcbiAgICAgICAgbnBjSWQ6IHNwYXduLmlkLFxuICAgICAgICBucGNJbmRleCxcbiAgICAgICAgbmFtZTogc3Bhd24ubmFtZSxcbiAgICAgICAgbGV2ZWw6IHNwYXduLmxldmVsLFxuICAgICAgICByYWNlSWQ6IHNwYXduLnJhY2UsXG4gICAgICAgIGdlbmRlcjogc3Bhd24uZ2VuZGVyLFxuICAgICAgICBwb3NpdGlvbjoge1xuICAgICAgICAgIHg6IHNwYXduLngsXG4gICAgICAgICAgeTogc3Bhd24ueSxcbiAgICAgICAgICB6OiBzcGF3bi56LFxuICAgICAgICAgIGhlYWRpbmc6IHNwYXduLmhlYWRpbmcsXG4gICAgICAgIH0sXG4gICAgICB9KSksXG4gICAgfSk7XG4gICAgcmV0dXJuIFtcbiAgICAgIGV2ZW50KFxuICAgICAgICBcIm5ld196b25lXCIsXG4gICAgICAgIHtcbiAgICAgICAgICB6b25lSWQ6IHJvdXRlLnpvbmVJZCxcbiAgICAgICAgICB6b25lSWROdW1iZXI6IHJvdXRlLnpvbmVJZCxcbiAgICAgICAgICBpbnN0YW5jZUlkOiByb3V0ZS5pbnN0YW5jZUlkLFxuICAgICAgICAgIHNob3J0TmFtZTogem9uZS5rZXksXG4gICAgICAgICAgbG9uZ05hbWU6IHpvbmUubmFtZSxcbiAgICAgICAgICB6b25lUG9pbnRzOiBbXSxcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb250cm9sLXN0cmVhbVwiLFxuICAgICAgKSxcbiAgICAgIGV2ZW50KFxuICAgICAgICBcInBsYXllcl9wcm9maWxlXCIsXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiBjaGFyYWN0ZXIubmFtZSxcbiAgICAgICAgICBsZXZlbDogTnVtYmVyKGNoYXJhY3Rlci5sZXZlbCksXG4gICAgICAgICAgY2hhckNsYXNzOiBOdW1iZXIoY2hhcmFjdGVyLmNsYXNzX2lkKSxcbiAgICAgICAgICByYWNlOiBOdW1iZXIoY2hhcmFjdGVyLnJhY2VfaWQpLFxuICAgICAgICAgIGdlbmRlcjogTnVtYmVyKGNoYXJhY3Rlci5nZW5kZXIpLFxuICAgICAgICAgIGRlaXR5OiBOdW1iZXIoY2hhcmFjdGVyLmRlaXR5X2lkKSxcbiAgICAgICAgICBmYWNlOiBOdW1iZXIoY2hhcmFjdGVyLmZhY2UpLFxuICAgICAgICAgIHpvbmVJZDogcm91dGUuem9uZUlkLFxuICAgICAgICAgIHpvbmVJbnN0YW5jZTogcm91dGUuaW5zdGFuY2VJZCxcbiAgICAgICAgICB4OiBOdW1iZXIoY2hhcmFjdGVyLngpLFxuICAgICAgICAgIHk6IE51bWJlcihjaGFyYWN0ZXIueSksXG4gICAgICAgICAgejogTnVtYmVyKGNoYXJhY3Rlci56KSxcbiAgICAgICAgICBoZWFkaW5nOiBOdW1iZXIoY2hhcmFjdGVyLmhlYWRpbmcpLFxuICAgICAgICAgIHN0cjogTnVtYmVyKGNoYXJhY3Rlci5zdHIpLFxuICAgICAgICAgIHN0YTogTnVtYmVyKGNoYXJhY3Rlci5zdGEpLFxuICAgICAgICAgIGRleDogTnVtYmVyKGNoYXJhY3Rlci5kZXgpLFxuICAgICAgICAgIGFnaTogTnVtYmVyKGNoYXJhY3Rlci5hZ2kpLFxuICAgICAgICAgIGludGVsOiBOdW1iZXIoY2hhcmFjdGVyLmludGVsbGlnZW5jZSksXG4gICAgICAgICAgd2lzOiBOdW1iZXIoY2hhcmFjdGVyLndpcyksXG4gICAgICAgICAgY2hhOiBOdW1iZXIoY2hhcmFjdGVyLmNoYSksXG4gICAgICAgICAgaW52ZW50b3J5SXRlbXM6IGF3YWl0IHRoaXMuaW52ZW50b3J5SXRlbXMoY2hhcmFjdGVyLm5hbWUpLFxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRyb2wtc3RyZWFtXCIsXG4gICAgICApLFxuICAgICAgZXZlbnQoXCJ6b25lX3NwYXduc1wiLCB7IHNwYXducyB9LCBcImNvbnRyb2wtc3RyZWFtXCIpLFxuICAgIF07XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoYXJhY3Rlckxpc3RFdmVudCgpOiBQcm9taXNlPEJhY2tlbmRFdmVudD4ge1xuICAgIGNvbnN0IHJvd3MgPSAoXG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PENoYXJhY3RlclJvdz4oXG4gICAgICAgIGAke0NIQVJBQ1RFUl9TRUxFQ1R9IE9SREVSIEJZIGNoYXJhY3Rlci5uYW1lIExJTUlUIDhgLFxuICAgICAgKVxuICAgICkucm93cztcbiAgICBjb25zdCBjaGFyYWN0ZXJzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICByb3dzLm1hcChhc3luYyAocm93KSA9PiAoe1xuICAgICAgICBuYW1lOiByb3cubmFtZSxcbiAgICAgICAgbGV2ZWw6IE51bWJlcihyb3cubGV2ZWwpLFxuICAgICAgICBjaGFyQ2xhc3M6IE51bWJlcihyb3cuY2xhc3NfaWQpLFxuICAgICAgICByYWNlOiBOdW1iZXIocm93LnJhY2VfaWQpLFxuICAgICAgICBnZW5kZXI6IE51bWJlcihyb3cuZ2VuZGVyKSxcbiAgICAgICAgZGVpdHk6IE51bWJlcihyb3cuZGVpdHlfaWQpLFxuICAgICAgICB6b25lOiBOdW1iZXIocm93LnpvbmVfaWQpLFxuICAgICAgICBpbnN0YW5jZTogTnVtYmVyKHJvdy56b25lX2luc3RhbmNlKSxcbiAgICAgICAgZmFjZTogTnVtYmVyKHJvdy5mYWNlKSxcbiAgICAgICAgbGFzdExvZ2luOiB0aW1lc3RhbXAocm93Lmxhc3RfbG9naW4pLFxuICAgICAgICBlbmFibGVkOiAxLFxuICAgICAgICBpdGVtczogYXdhaXQgdGhpcy5pbnZlbnRvcnlJdGVtcyhyb3cubmFtZSksXG4gICAgICB9KSksXG4gICAgKTtcbiAgICByZXR1cm4gZXZlbnQoXG4gICAgICBcImNoYXJhY3Rlcl9zZWxlY3RcIixcbiAgICAgIHtcbiAgICAgICAgY2hhcmFjdGVyQ291bnQ6IGNoYXJhY3RlcnMubGVuZ3RoLFxuICAgICAgICBjaGFyYWN0ZXJzLFxuICAgICAgfSxcbiAgICAgIFwiY29udHJvbC1zdHJlYW1cIixcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVTZWxlY3RlZENoYXJhY3RlcihcbiAgICBzZXNzaW9uSWQ6IG51bWJlcixcbiAgKTogUHJvbWlzZTxFbWJlZGRlZFNlc3Npb24+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uKHNlc3Npb25JZCk7XG4gICAgaWYgKHNlc3Npb24uc2VsZWN0ZWRDaGFyYWN0ZXIpIHtcbiAgICAgIHJldHVybiBzZXNzaW9uO1xuICAgIH1cbiAgICBjb25zdCByb3cgPSAoXG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PHsgbmFtZTogc3RyaW5nIH0+KFxuICAgICAgICBcIlNFTEVDVCBuYW1lIEZST00gY2hhcmFjdGVycyBPUkRFUiBCWSBsYXN0X2xvZ2luX2F0IERFU0MsIGlkIExJTUlUIDFcIixcbiAgICAgIClcbiAgICApLnJvd3NbMF07XG4gICAgaWYgKHJvdykge1xuICAgICAgc2Vzc2lvbi5zZWxlY3RlZENoYXJhY3RlciA9IHJvdy5uYW1lO1xuICAgIH1cbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIHByaXZhdGUgc2Vzc2lvbihzZXNzaW9uSWQ6IG51bWJlcik6IEVtYmVkZGVkU2Vzc2lvbiB7XG4gICAgY29uc3QgY3VycmVudCA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKGN1cnJlbnQpIHtcbiAgICAgIHJldHVybiBjdXJyZW50O1xuICAgIH1cbiAgICBjb25zdCBjcmVhdGVkOiBFbWJlZGRlZFNlc3Npb24gPSB7XG4gICAgICBzZWxlY3RlZENoYXJhY3RlcjogbnVsbCxcbiAgICAgIHBlbmRpbmdab25lOiBudWxsLFxuICAgICAgYWN0aXZlWm9uZTogbnVsbCxcbiAgICB9O1xuICAgIHRoaXMuc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgY3JlYXRlZCk7XG4gICAgcmV0dXJuIGNyZWF0ZWQ7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlc29sdmVab25lSWQodmFsdWU6IG51bWJlciB8IHN0cmluZyk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgIGNvbnN0IG51bWVyaWMgPVxuICAgICAgdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiICYmIC9eXFxkKyQvLnRlc3QodmFsdWUudHJpbSgpKVxuICAgICAgICA/IE51bWJlcih2YWx1ZSlcbiAgICAgICAgOiB2YWx1ZTtcbiAgICBjb25zdCByb3cgPSAoXG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PHsgaWQ6IG51bWJlciB9PihcbiAgICAgICAgdHlwZW9mIG51bWVyaWMgPT09IFwibnVtYmVyXCJcbiAgICAgICAgICA/IGBTRUxFQ1QgaWQgRlJPTSAke3RoaXMuY29udGVudFByZWZpeH16b25lcyBXSEVSRSBpZCA9ID8gTElNSVQgMWBcbiAgICAgICAgICA6IGBTRUxFQ1QgaWQgRlJPTSAke3RoaXMuY29udGVudFByZWZpeH16b25lcyBXSEVSRSBsb3dlcihzaG9ydF9uYW1lKSA9IGxvd2VyKD8pIExJTUlUIDFgLFxuICAgICAgICBbbnVtZXJpY10sXG4gICAgICApXG4gICAgKS5yb3dzWzBdO1xuICAgIHJldHVybiByb3cgPyBOdW1iZXIocm93LmlkKSA6IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGludmVudG9yeVJvd3MoY2hhcmFjdGVyTmFtZTogc3RyaW5nKTogUHJvbWlzZTxcbiAgICBBcnJheTx7XG4gICAgICBzbG90OiBudW1iZXI7XG4gICAgICBiYWc6IG51bWJlcjtcbiAgICAgIGl0ZW06IEl0ZW1Sb3c7XG4gICAgfT5cbiAgPiB7XG4gICAgY29uc3Qgcm93cyA9IChcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8SXRlbVJvdz4oXG4gICAgICAgIGBTRUxFQ1QgaW52ZW50b3J5Lml0ZW1faWQsIGludmVudG9yeS5zbG90LCBpbnZlbnRvcnkuYmFnIEFTIGJhZ19zbG90LCBpdGVtLipcbiAgICAgICBGUk9NIHBsYXllcl9pbnZlbnRvcnkgaW52ZW50b3J5IEpPSU4gJHt0aGlzLmNvbnRlbnRQcmVmaXh9aXRlbXMgaXRlbSBPTiBpdGVtLmlkID0gaW52ZW50b3J5Lml0ZW1faWRcbiAgICAgICBKT0lOIGNoYXJhY3RlcnMgY2hhcmFjdGVyIE9OIGNoYXJhY3Rlci5pZCA9IGludmVudG9yeS5jaGFyYWN0ZXJfaWRcbiAgICAgICBXSEVSRSBjaGFyYWN0ZXIubmFtZSA9ID8gT1JERVIgQlkgaW52ZW50b3J5LnNsb3QsIGludmVudG9yeS5iYWdgLFxuICAgICAgICBbY2hhcmFjdGVyTmFtZV0sXG4gICAgICApXG4gICAgKS5yb3dzO1xuICAgIHJldHVybiByb3dzLm1hcCgocm93KSA9PiAoe1xuICAgICAgc2xvdDogTnVtYmVyKHJvdy5zbG90KSxcbiAgICAgIGJhZzogTnVtYmVyKHJvdy5iYWdfc2xvdCksXG4gICAgICBpdGVtOiByb3csXG4gICAgfSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbnZlbnRvcnlJdGVtcyhcbiAgICBjaGFyYWN0ZXJOYW1lOiBzdHJpbmcsXG4gICk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj5bXT4ge1xuICAgIHJldHVybiAoYXdhaXQgdGhpcy5pbnZlbnRvcnlSb3dzKGNoYXJhY3Rlck5hbWUpKS5tYXAoKHJvdykgPT5cbiAgICAgIHRoaXMuaXRlbUluc3RhbmNlKHJvdy5pdGVtLCByb3cuc2xvdCwgcm93LmJhZyksXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaW52ZW50b3J5QXQoXG4gICAgY2hhcmFjdGVyTmFtZTogc3RyaW5nLFxuICAgIHNsb3Q6IG51bWJlcixcbiAgICBiYWc6IG51bWJlcixcbiAgKTogUHJvbWlzZTxJdGVtUm93IHwgbnVsbD4ge1xuICAgIGNvbnN0IHJvdyA9IChcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8SXRlbVJvdz4oXG4gICAgICAgIGBTRUxFQ1QgaW52ZW50b3J5Lml0ZW1faWQsIGludmVudG9yeS5zbG90LCBpbnZlbnRvcnkuYmFnIEFTIGJhZ19zbG90LCBpdGVtLipcbiAgICAgICBGUk9NIHBsYXllcl9pbnZlbnRvcnkgaW52ZW50b3J5IEpPSU4gJHt0aGlzLmNvbnRlbnRQcmVmaXh9aXRlbXMgaXRlbSBPTiBpdGVtLmlkID0gaW52ZW50b3J5Lml0ZW1faWRcbiAgICAgICBKT0lOIGNoYXJhY3RlcnMgY2hhcmFjdGVyIE9OIGNoYXJhY3Rlci5pZCA9IGludmVudG9yeS5jaGFyYWN0ZXJfaWRcbiAgICAgICBXSEVSRSBjaGFyYWN0ZXIubmFtZSA9ID8gQU5EIGludmVudG9yeS5zbG90ID0gPyBBTkQgaW52ZW50b3J5LmJhZyA9ID8gTElNSVQgMWAsXG4gICAgICAgIFtjaGFyYWN0ZXJOYW1lLCBzbG90LCBiYWddLFxuICAgICAgKVxuICAgICkucm93c1swXTtcbiAgICByZXR1cm4gcm93ID8/IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldEl0ZW0oaXRlbUlkOiBudW1iZXIpOiBQcm9taXNlPEl0ZW1Sb3cgfCBudWxsPiB7XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGl0ZW1JZCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gKFxuICAgICAgKFxuICAgICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PEl0ZW1Sb3c+KFxuICAgICAgICAgIGBTRUxFQ1QgKiBGUk9NICR7dGhpcy5jb250ZW50UHJlZml4fWl0ZW1zIFdIRVJFIGlkID0gPyBMSU1JVCAxYCxcbiAgICAgICAgICBbaXRlbUlkXSxcbiAgICAgICAgKVxuICAgICAgKS5yb3dzWzBdID8/IG51bGxcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBpdGVtSW5zdGFuY2UoXG4gICAgaXRlbTogSXRlbVJvdyxcbiAgICBzbG90OiBudW1iZXIsXG4gICAgYmFnU2xvdDogbnVtYmVyLFxuICApOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gICAgcmV0dXJuIHRvSXRlbUluc3RhbmNlKGl0ZW0sIHNsb3QsIGJhZ1Nsb3QpO1xuICB9XG5cbiAgcHJpdmF0ZSBpdGVtQWxsb3dlZChpdGVtOiBJdGVtUm93IHwgdW5kZWZpbmVkLCBzbG90OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICByZXR1cm4gKFxuICAgICAgIWl0ZW0gfHxcbiAgICAgIHNsb3QgPT09IDMwIHx8XG4gICAgICBzbG90IDwgMCB8fFxuICAgICAgc2xvdCA+IDIxIHx8XG4gICAgICAoTnVtYmVyKGl0ZW0uc2xvdHMpICYgKDEgPDwgc2xvdCkpICE9PSAwXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgY2hhcmFjdGVyQ2FuRXF1aXAoXG4gICAgY2hhcmFjdGVyOiBDaGFyYWN0ZXJSb3csXG4gICAgaXRlbTogSXRlbVJvdyB8IHVuZGVmaW5lZCxcbiAgICBzbG90OiBudW1iZXIsXG4gICk6IGJvb2xlYW4ge1xuICAgIGlmICghaXRlbSB8fCBzbG90IDwgMCB8fCBzbG90ID4gMjEpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gKFxuICAgICAgKE51bWJlcihpdGVtLmNsYXNzZXMpICYgKDEgPDwgKE51bWJlcihjaGFyYWN0ZXIuY2xhc3NfaWQpIC0gMSkpKSAhPT0gMCAmJlxuICAgICAgKE51bWJlcihpdGVtLnJhY2VzKSAmICgxIDw8IChOdW1iZXIoY2hhcmFjdGVyLnJhY2VfaWQpIC0gMSkpKSAhPT0gMFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwc2VydEl0ZW0oaXRlbTogQmFja2VuZEl0ZW1UZW1wbGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShcbiAgICAgIGBJTlNFUlQgSU5UTyBpdGVtc1xuICAgICAgICAoaWQsIG5hbWUsIGlkZmlsZSwgaWNvbiwgbWF0ZXJpYWwsIGNvbG9yLCBpdGVtdHlwZSwgc2xvdHMsIGFjLCBiYWdzbG90cyxcbiAgICAgICAgIGNsYXNzZXMsIHJhY2VzLCBzdGFja2FibGUsIHN0YWNrc2l6ZSwgbWF4Y2hhcmdlcywgd2VpZ2h0LCBkYW1hZ2UsIGRlbGF5LFxuICAgICAgICAgYXN0ciwgYXN0YSwgYWRleCwgYWFnaSwgYWludCwgYXdpcywgYWNoYSwgaHAsIG1hbmEsIGRyLCBtciwgY3IsIGZyLCBwcixcbiAgICAgICAgIGhhc3RlLCBtYWdpYywgbm9kcm9wKVxuICAgICAgIFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPyxcbiAgICAgICAgID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8pXG4gICAgICAgT04gQ09ORkxJQ1QoaWQpIERPIFVQREFURSBTRVQgbmFtZSA9IGV4Y2x1ZGVkLm5hbWUsIGlkZmlsZSA9IGV4Y2x1ZGVkLmlkZmlsZSxcbiAgICAgICAgIGljb24gPSBleGNsdWRlZC5pY29uLCBtYXRlcmlhbCA9IGV4Y2x1ZGVkLm1hdGVyaWFsLCBjb2xvciA9IGV4Y2x1ZGVkLmNvbG9yLFxuICAgICAgICAgaXRlbXR5cGUgPSBleGNsdWRlZC5pdGVtdHlwZSwgc2xvdHMgPSBleGNsdWRlZC5zbG90cywgYWMgPSBleGNsdWRlZC5hYyxcbiAgICAgICAgIGJhZ3Nsb3RzID0gZXhjbHVkZWQuYmFnc2xvdHMsIGNsYXNzZXMgPSBleGNsdWRlZC5jbGFzc2VzLCByYWNlcyA9IGV4Y2x1ZGVkLnJhY2VzLFxuICAgICAgICAgc3RhY2thYmxlID0gZXhjbHVkZWQuc3RhY2thYmxlLCBzdGFja3NpemUgPSBleGNsdWRlZC5zdGFja3NpemUsXG4gICAgICAgICBtYXhjaGFyZ2VzID0gZXhjbHVkZWQubWF4Y2hhcmdlcywgd2VpZ2h0ID0gZXhjbHVkZWQud2VpZ2h0LFxuICAgICAgICAgZGFtYWdlID0gZXhjbHVkZWQuZGFtYWdlLCBkZWxheSA9IGV4Y2x1ZGVkLmRlbGF5LCBhc3RyID0gZXhjbHVkZWQuYXN0cixcbiAgICAgICAgIGFzdGEgPSBleGNsdWRlZC5hc3RhLCBhZGV4ID0gZXhjbHVkZWQuYWRleCwgYWFnaSA9IGV4Y2x1ZGVkLmFhZ2ksXG4gICAgICAgICBhaW50ID0gZXhjbHVkZWQuYWludCwgYXdpcyA9IGV4Y2x1ZGVkLmF3aXMsIGFjaGEgPSBleGNsdWRlZC5hY2hhLFxuICAgICAgICAgaHAgPSBleGNsdWRlZC5ocCwgbWFuYSA9IGV4Y2x1ZGVkLm1hbmEsIGRyID0gZXhjbHVkZWQuZHIsIG1yID0gZXhjbHVkZWQubXIsXG4gICAgICAgICBjciA9IGV4Y2x1ZGVkLmNyLCBmciA9IGV4Y2x1ZGVkLmZyLCBwciA9IGV4Y2x1ZGVkLnByLCBoYXN0ZSA9IGV4Y2x1ZGVkLmhhc3RlLFxuICAgICAgICAgbWFnaWMgPSBleGNsdWRlZC5tYWdpYywgbm9kcm9wID0gZXhjbHVkZWQubm9kcm9wYCxcbiAgICAgIFtcbiAgICAgICAgaXRlbS5pZCxcbiAgICAgICAgaXRlbS5uYW1lLFxuICAgICAgICBpdGVtLmlkZmlsZSxcbiAgICAgICAgaXRlbS5pY29uLFxuICAgICAgICBpdGVtLm1hdGVyaWFsLFxuICAgICAgICBpdGVtLmNvbG9yLFxuICAgICAgICBpdGVtLml0ZW10eXBlLFxuICAgICAgICBpdGVtLnNsb3RzLFxuICAgICAgICBpdGVtLmFjLFxuICAgICAgICBpdGVtLmJhZ3Nsb3RzLFxuICAgICAgICBpdGVtLmNsYXNzZXMsXG4gICAgICAgIGl0ZW0ucmFjZXMsXG4gICAgICAgIGl0ZW0uc3RhY2thYmxlLFxuICAgICAgICBpdGVtLnN0YWNrc2l6ZSxcbiAgICAgICAgaXRlbS5tYXhjaGFyZ2VzLFxuICAgICAgICBpdGVtLndlaWdodCA/PyAwLFxuICAgICAgICBpdGVtLmRhbWFnZSA/PyAwLFxuICAgICAgICBpdGVtLmRlbGF5ID8/IDAsXG4gICAgICAgIGl0ZW0uYXN0ciA/PyAwLFxuICAgICAgICBpdGVtLmFzdGEgPz8gMCxcbiAgICAgICAgaXRlbS5hZGV4ID8/IDAsXG4gICAgICAgIGl0ZW0uYWFnaSA/PyAwLFxuICAgICAgICBpdGVtLmFpbnQgPz8gMCxcbiAgICAgICAgaXRlbS5hd2lzID8/IDAsXG4gICAgICAgIGl0ZW0uYWNoYSA/PyAwLFxuICAgICAgICBpdGVtLmhwID8/IDAsXG4gICAgICAgIGl0ZW0ubWFuYSA/PyAwLFxuICAgICAgICBpdGVtLmRyID8/IDAsXG4gICAgICAgIGl0ZW0ubXIgPz8gMCxcbiAgICAgICAgaXRlbS5jciA/PyAwLFxuICAgICAgICBpdGVtLmZyID8/IDAsXG4gICAgICAgIGl0ZW0ucHIgPz8gMCxcbiAgICAgICAgaXRlbS5oYXN0ZSA/PyAwLFxuICAgICAgICBpdGVtLm1hZ2ljID8/IDAsXG4gICAgICAgIGl0ZW0ubm9kcm9wID8/IDAsXG4gICAgICBdLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHByZXBhcmVDYW5vbmljYWxEYXRhYmFzZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgdmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIHRyeSB7XG4gICAgICB2ZXJzaW9uID0gKFxuICAgICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PHsgdmFsdWU6IHN0cmluZyB9PihcbiAgICAgICAgICBcIlNFTEVDVCB2YWx1ZSBGUk9NIGFwcF9tZXRhIFdIRVJFIGtleSA9ICdzY2hlbWFfdmVyc2lvbicgTElNSVQgMVwiLFxuICAgICAgICApXG4gICAgICApLnJvd3NbMF0/LnZhbHVlO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gQSBwcmUtY2Fub25pY2FsIG9mZmxpbmUgZGF0YWJhc2UgaXMgaW50ZW50aW9uYWxseSByZXBsYWNlZCBiZWxvdy5cbiAgICB9XG4gICAgaWYgKHZlcnNpb24gPT09IEVNQkVEREVEX1NDSEVNQV9WRVJTSU9OKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh2ZXJzaW9uID09PSBcIjNcIikge1xuICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFwiUFJBR01BIGZvcmVpZ25fa2V5cyA9IE9GRlwiKTtcbiAgICAgIGZvciAoY29uc3QgdGFibGUgb2YgQ09OVEVOVF9UQUJMRVMpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKGBEUk9QIFRBQkxFIElGIEVYSVNUUyAke3RhYmxlfWApO1xuICAgICAgfVxuICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFwiUFJBR01BIGZvcmVpZ25fa2V5cyA9IE9OXCIpO1xuICAgICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFxuICAgICAgICBcIlVQREFURSBhcHBfbWV0YSBTRVQgdmFsdWUgPSA/IFdIRVJFIGtleSA9ICdzY2hlbWFfdmVyc2lvbidcIixcbiAgICAgICAgW0VNQkVEREVEX1NDSEVNQV9WRVJTSU9OXSxcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShcIlBSQUdNQSBmb3JlaWduX2tleXMgPSBPRkZcIik7XG4gICAgZm9yIChjb25zdCB0YWJsZSBvZiBSRVNFVF9UQUJMRVMpIHtcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShgRFJPUCBUQUJMRSBJRiBFWElTVFMgJHt0YWJsZX1gKTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFwiUFJBR01BIGZvcmVpZ25fa2V5cyA9IE9OXCIpO1xuICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UuZXhlY3V0ZShcbiAgICAgIFwiQ1JFQVRFIFRBQkxFIGFwcF9tZXRhIChrZXkgVkFSQ0hBUig2NCkgUFJJTUFSWSBLRVksIHZhbHVlIFRFWFQgTk9UIE5VTEwpXCIsXG4gICAgKTtcbiAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLmV4ZWN1dGUoXG4gICAgICBcIklOU0VSVCBJTlRPIGFwcF9tZXRhIChrZXksIHZhbHVlKSBWQUxVRVMgKCdzY2hlbWFfdmVyc2lvbicsID8pXCIsXG4gICAgICBbRU1CRURERURfU0NIRU1BX1ZFUlNJT05dLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGd1ZXN0QWNjb3VudElkKCk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgYXdhaXQgdGhpcy5kYXRhYmFzZS5leGVjdXRlKFxuICAgICAgXCJJTlNFUlQgSU5UTyBhY2NvdW50cyAoaWRlbnRpdHkpIFNFTEVDVCAnb2ZmbGluZScgV0hFUkUgTk9UIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBhY2NvdW50cyBXSEVSRSBpZGVudGl0eSA9ICdvZmZsaW5lJylcIixcbiAgICApO1xuICAgIGNvbnN0IHJvdyA9IChcbiAgICAgIGF3YWl0IHRoaXMuZGF0YWJhc2UucXVlcnk8eyBpZDogbnVtYmVyIH0+KFxuICAgICAgICBcIlNFTEVDVCBpZCBGUk9NIGFjY291bnRzIFdIRVJFIGlkZW50aXR5ID0gJ29mZmxpbmUnIExJTUlUIDFcIixcbiAgICAgIClcbiAgICApLnJvd3NbMF07XG4gICAgaWYgKCFyb3cpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBjcmVhdGUgb2ZmbGluZSBhY2NvdW50XCIpO1xuICAgIH1cbiAgICByZXR1cm4gTnVtYmVyKHJvdy5pZCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNoYXJhY3RlcihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPENoYXJhY3RlclJvdyB8IHVuZGVmaW5lZD4ge1xuICAgIHJldHVybiAoXG4gICAgICBhd2FpdCB0aGlzLmRhdGFiYXNlLnF1ZXJ5PENoYXJhY3RlclJvdz4oXG4gICAgICAgIGAke0NIQVJBQ1RFUl9TRUxFQ1R9IFdIRVJFIGNoYXJhY3Rlci5uYW1lID0gPyBMSU1JVCAxYCxcbiAgICAgICAgW25hbWVdLFxuICAgICAgKVxuICAgICkucm93c1swXTtcbiAgfVxuXG59XG5cbmZ1bmN0aW9uIGV2ZW50KFxuICB0eXBlOiBCYWNrZW5kRXZlbnRbXCJ0eXBlXCJdLFxuICB2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gIHRyYW5zcG9ydDogQmFja2VuZEV2ZW50W1widHJhbnNwb3J0XCJdID0gXCJkYXRhZ3JhbVwiLFxuKTogQmFja2VuZEV2ZW50IHtcbiAgcmV0dXJuIHsgdHlwZSwgdmFsdWUsIHRyYW5zcG9ydCB9O1xufVxuXG5mdW5jdGlvbiBzZXJ2ZXJNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IEJhY2tlbmRFdmVudCB7XG4gIHJldHVybiBldmVudChcImNoYW5uZWxfbWVzc2FnZVwiLCB7XG4gICAgc2VuZGVyOiBcIlNlcnZlclwiLFxuICAgIHRhcmdldDogXCJcIixcbiAgICBtZXNzYWdlLFxuICAgIGNoYW5OdW06IC0xLFxuICB9KTtcbn1cblxuZnVuY3Rpb24gdGltZXN0YW1wKHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBudWxsKTogbnVtYmVyIHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIikge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBjb25zdCBwYXJzZWQgPSB2YWx1ZSA/IERhdGUucGFyc2UodmFsdWUpIDogMDtcbiAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShwYXJzZWQpID8gcGFyc2VkIDogMDtcbn1cblxuY29uc3QgRU1CRURERURfU0NIRU1BX1ZFUlNJT04gPSBcIjVcIjtcblxuY29uc3QgQ09OVEVOVF9UQUJMRVMgPSBbXG4gIFwiY2xhc3Nfc2tpbGxfY2Fwc1wiLFxuICBcImNoYXJhY3Rlcl9zdGFydGluZ19pdGVtc1wiLFxuICBcImNoYXJhY3Rlcl9vcmlnaW5zXCIsXG4gIFwic3Bhd25fcG9pbnRzXCIsXG4gIFwic3Bhd25fZ3JvdXBfbWVtYmVyc1wiLFxuICBcInNwYXduX2dyb3Vwc1wiLFxuICBcIm5wY19hcmNoZXR5cGVzXCIsXG4gIFwicXVlc3RfZGVmaW5pdGlvbnNcIixcbiAgXCJ6b25lc1wiLFxuICBcIml0ZW1zXCIsXG4gIFwiY29udGVudF9yZWxlYXNlc1wiLFxuXSBhcyBjb25zdDtcblxuY29uc3QgUkVTRVRfVEFCTEVTID0gW1xuICBcImxvY2FsX2ludmVudG9yeVwiLFxuICBcImxvY2FsX2l0ZW1zXCIsXG4gIFwibG9jYWxfc3Bhd25zXCIsXG4gIFwib2ZmbGluZV9oeWRyYXRpb25cIixcbiAgXCJjaGFyYWN0ZXJfcXVlc3Rfc3RhdGVcIixcbiAgXCJwbGF5ZXJfaW52ZW50b3J5XCIsXG4gIFwiY2hhcmFjdGVyX3Bvc2l0aW9uc1wiLFxuICBcImNoYXJhY3RlcnNcIixcbiAgXCJhY2NvdW50c1wiLFxuICBcImNoYXJhY3Rlcl9sYW5ndWFnZXNcIixcbiAgXCJjaGFyYWN0ZXJfc2tpbGxzXCIsXG4gIFwiY2hhcmFjdGVyX2JpbmRzXCIsXG4gIFwic3Bhd25fcG9pbnRzXCIsXG4gIFwic3Bhd25fZ3JvdXBfbWVtYmVyc1wiLFxuICBcInNwYXduX2dyb3Vwc1wiLFxuICBcIm5wY19hcmNoZXR5cGVzXCIsXG4gIFwicXVlc3RfZGVmaW5pdGlvbnNcIixcbiAgXCJ6b25lc1wiLFxuICBcIml0ZW1zXCIsXG4gIFwiY29udGVudF9yZWxlYXNlc1wiLFxuICBcImNoYXJhY3Rlcl9zdGFydGluZ19pdGVtc1wiLFxuICBcImNoYXJhY3Rlcl9vcmlnaW5zXCIsXG4gIFwiY2xhc3Nfc2tpbGxfY2Fwc1wiLFxuICBcInNjaGVtYV9taWdyYXRpb25zXCIsXG4gIFwiYXBwX21ldGFcIixcbl0gYXMgY29uc3Q7XG5cbmNvbnN0IENIQVJBQ1RFUl9TRUxFQ1QgPSBgU0VMRUNUIGNoYXJhY3Rlci5pZCwgY2hhcmFjdGVyLm5hbWUsIGNoYXJhY3Rlci5sZXZlbCxcbiAgY2hhcmFjdGVyLmNsYXNzX2lkLCBjaGFyYWN0ZXIucmFjZV9pZCwgY2hhcmFjdGVyLmdlbmRlciwgY2hhcmFjdGVyLmRlaXR5X2lkLFxuICBjaGFyYWN0ZXIuZmFjZSwgY2hhcmFjdGVyLmxhc3RfbG9naW5fYXQgQVMgbGFzdF9sb2dpbixcbiAgY2hhcmFjdGVyLnN0ciwgY2hhcmFjdGVyLnN0YSwgY2hhcmFjdGVyLmRleCwgY2hhcmFjdGVyLmFnaSxcbiAgY2hhcmFjdGVyLmludGVsbGlnZW5jZSwgY2hhcmFjdGVyLndpcywgY2hhcmFjdGVyLmNoYSxcbiAgcG9zaXRpb24uem9uZV9pZCwgcG9zaXRpb24uaW5zdGFuY2VfaWQgQVMgem9uZV9pbnN0YW5jZSxcbiAgcG9zaXRpb24ueCwgcG9zaXRpb24ueSwgcG9zaXRpb24ueiwgcG9zaXRpb24uaGVhZGluZ1xuICBGUk9NIGNoYXJhY3RlcnMgY2hhcmFjdGVyXG4gIExFRlQgSk9JTiBjaGFyYWN0ZXJfcG9zaXRpb25zIHBvc2l0aW9uIE9OIHBvc2l0aW9uLmNoYXJhY3Rlcl9pZCA9IGNoYXJhY3Rlci5pZGA7XG5cbmZ1bmN0aW9uIHNwYXduU2VsZWN0KHByZWZpeDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBTRUxFQ1Qgc3AuaWQsIG5wYy5pZCBBUyBucGNfaWQsIG5wYy5uYW1lLCBucGMubGV2ZWwsXG4gIG5wYy5yYWNlX2lkIEFTIHJhY2UsIG5wYy5nZW5kZXIsIG5wYy5wcm9wZXJ0aWVzX2pzb24sIHNwLngsIHNwLnksIHNwLnosIHNwLmhlYWRpbmdcbiAgRlJPTSAke3ByZWZpeH1zcGF3bl9wb2ludHMgc3BcbiAgSk9JTiAke3ByZWZpeH1ucGNfYXJjaGV0eXBlcyBucGMgT04gbnBjLmlkID0gKFxuICAgIFNFTEVDVCBtZW1iZXIubnBjX2FyY2hldHlwZV9pZCBGUk9NICR7cHJlZml4fXNwYXduX2dyb3VwX21lbWJlcnMgbWVtYmVyXG4gICAgV0hFUkUgbWVtYmVyLnNwYXduX2dyb3VwX2lkID0gc3Auc3Bhd25fZ3JvdXBfaWRcbiAgICBPUkRFUiBCWSBtZW1iZXIud2VpZ2h0IERFU0MsIG1lbWJlci5ucGNfYXJjaGV0eXBlX2lkIExJTUlUIDEpXG4gIEFORCBzcC5lbmFibGVkID0gMWA7XG59XG5cbmZ1bmN0aW9uIGpzb25PYmplY3QodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHZhbHVlKTtcbiAgICByZXR1cm4gcGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkocGFyc2VkKVxuICAgICAgPyAocGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVxuICAgICAgOiB7fTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGZpbml0ZU51bWJlcih2YWx1ZTogdW5rbm93biwgZmFsbGJhY2s6IG51bWJlcik6IG51bWJlciB7XG4gIGNvbnN0IG51bWJlciA9IE51bWJlcih2YWx1ZSk7XG4gIHJldHVybiBOdW1iZXIuaXNGaW5pdGUobnVtYmVyKSA/IG51bWJlciA6IGZhbGxiYWNrO1xufVxuIl19