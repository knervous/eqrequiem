import { createNodeDatabase } from "../../src/db/node/factory.js";
import { ZONES } from "../../src/content/eltania.js";
import { questManifest } from "../../src/zone/quest-zone-registry.js";
import { contentDatabaseUrl } from "./paths.js";
import { loadGazetteer, type Gazetteer } from "./gazetteer.js";

/**
 * Collects the names the demo can actually reach, with the context a replacement needs
 * to be any good.
 *
 * Scope matters more than technique here. The content database holds ~64,000 distinct
 * names; the six demo zones reach about two thousand. Renaming what ships is a different
 * size of problem from renaming the database, and the release build should not carry the
 * rest anyway.
 */

export type NameClass = "pinned" | "structural" | "legacy" | "clean";

export interface ExtractedName {
  readonly table: "npc_archetypes" | "items" | "zones";
  /** Opaque identity. Every write is keyed by this, never by the name. */
  readonly id: string;
  readonly name: string;
  readonly nameClass: NameClass;
  /** Cohort key: names generated together should read as belonging together. */
  readonly cohort: string;
  readonly context: Record<string, unknown>;
}

const DEMO_ZONE_IDS = Object.values(ZONES).map((zone) => zone.id);

/**
 * The names authored quest content matches on, taken from the generated manifest.
 *
 * There is no hand-kept NPC table to read this from — `eltania.ts` used to export one and
 * it was removed because it drifted from the database. The manifest is derived from the
 * quest code itself, so it cannot go stale the way the old list did. `eltania.test.ts`
 * reads the same source.
 */
const PINNED_SPAWNS = new Set(
  questManifest()
    .flatMap((entry) => entry.bindings)
    .filter((binding) => binding.kind === "npc")
    .map((binding) => binding.key.replaceAll(" ", "_").toLowerCase()),
);

/** `#`-prefixed spawns and `a_`/`an_` generics carry form that must survive a rename. */
export function isStructural(name: string): boolean {
  return /^#/.test(name) || /^an?[ _]/i.test(name);
}

/**
 * A trailing `_2`/`_3` is disambiguation, not part of the name.
 *
 * Stripping it before the membership test closes a hole in the release gate: appending a
 * suffix to a legacy name produces a string the gazetteer does not contain, so the name
 * passes the audit while still displaying EverQuest's text. Eight shipped names were
 * laundered this way, including `ice_boned_skeleton_2` and `Barbarian Head_2`.
 */
export function baseName(name: string): string {
  return name.replace(/_[0-9]+$/, "");
}

export function classify(name: string, gazetteer: Gazetteer): NameClass {
  // Gazetteer membership decides first. A name bound in `eltania.ts` that is *already*
  // original is simply clean; calling it `pinned` reported canonical names like
  // `Serjeant_Halvane` as outstanding work and inflated the audit's failure count.
  // `pinned` means the narrower, dangerous thing: legacy text that authored content
  // matches on, so it cannot be renamed without editing the vocabulary in the same step.
  if (!gazetteer.hasName(name) && !gazetteer.hasName(baseName(name))) return "clean";
  if (PINNED_SPAWNS.has(name.toLowerCase())) return "pinned";
  return isStructural(name) ? "structural" : "legacy";
}

interface NpcRow {
  npc_key: string;
  name: string;
  level: number;
  race_id: number;
  zone_id: number;
  properties_json: string;
  merchant: number;
}

interface ItemRow {
  id: number;
  name: string;
  itemtype: number;
  slots: number;
  zone_id: number;
  via: string;
}

export async function extract(
  options: { readonly zoneIds?: readonly number[] } = {},
): Promise<ExtractedName[]> {
  const zoneIds = options.zoneIds ?? DEMO_ZONE_IDS;
  const placeholders = zoneIds.map(() => "?").join(", ");
  const database = createNodeDatabase(contentDatabaseUrl());
  const gazetteer = await loadGazetteer();
  const results: ExtractedName[] = [];

  const zoneName = new Map(
    Object.values(ZONES).map((zone) => [zone.id, zone.key]),
  );

  const npcs = (
    await database.query<NpcRow>(
      `SELECT DISTINCT a.npc_key, a.name, a.level, a.race_id, p.zone_id, a.properties_json,
              CASE WHEN ma.npc_archetype_id IS NULL THEN 0 ELSE 1 END AS merchant
         FROM spawn_points p
         JOIN spawn_group_members m ON m.spawn_group_id = p.spawn_group_id
         JOIN npc_archetypes a ON a.id = m.npc_archetype_id
    LEFT JOIN npc_merchant_assignments ma ON ma.npc_archetype_id = a.id
        WHERE p.zone_id IN (${placeholders})
        ORDER BY p.zone_id, a.level, a.name`,
      [...zoneIds],
    )
  ).rows;

  for (const row of npcs) {
    const properties = safeJson(row.properties_json);
    const zone = zoneName.get(Number(row.zone_id)) ?? `zone-${row.zone_id}`;
    results.push({
      table: "npc_archetypes",
      id: row.npc_key,
      name: row.name,
      nameClass: classify(row.name, gazetteer),
      // Level band keeps a cohort's names at one social register: the guards of a city
      // should not be named alongside its archmages.
      cohort: `npc:${zone}:${levelBand(Number(row.level))}:${
        row.merchant ? "merchant" : roleOf(properties)
      }`,
      context: {
        zone,
        level: Number(row.level),
        raceId: Number(row.race_id),
        merchant: row.merchant === 1,
        factionId: properties.factionId ?? null,
        classId: properties.classId ?? null,
      },
    });
  }

  const items = (
    await database.query<ItemRow>(
      `SELECT DISTINCT i.id, i.name, i.itemtype, i.slots, p.zone_id, 'loot' AS via
         FROM spawn_points p
         JOIN spawn_group_members m ON m.spawn_group_id = p.spawn_group_id
         JOIN npc_loot_assignments na ON na.npc_archetype_id = m.npc_archetype_id
         JOIN npc_loot_table_entries te ON te.loot_table_id = na.loot_table_id
         JOIN npc_loot_group_entries ge ON ge.loot_group_id = te.loot_group_id
         JOIN items i ON i.id = ge.item_id
        WHERE p.zone_id IN (${placeholders})
        UNION
       SELECT DISTINCT i.id, i.name, i.itemtype, i.slots, p.zone_id, 'merchant' AS via
         FROM spawn_points p
         JOIN spawn_group_members m ON m.spawn_group_id = p.spawn_group_id
         JOIN npc_merchant_assignments ma ON ma.npc_archetype_id = m.npc_archetype_id
         JOIN merchant_catalog_entries ce ON ce.catalog_id = ma.catalog_id
         JOIN items i ON i.id = ce.item_id
        WHERE p.zone_id IN (${placeholders})`,
      [...zoneIds, ...zoneIds],
    )
  ).rows;

  const seenItems = new Set<number>();
  for (const row of items) {
    const id = Number(row.id);
    if (seenItems.has(id)) continue;
    seenItems.add(id);
    results.push({
      table: "items",
      id: String(id),
      name: row.name,
      nameClass: classify(row.name, gazetteer),
      cohort: `item:${itemFamily(Number(row.itemtype))}`,
      context: {
        itemType: Number(row.itemtype),
        slots: Number(row.slots),
        via: row.via,
      },
    });
  }

  for (const zone of Object.values(ZONES)) {
    const row = (
      await database.query<{ name: string }>("SELECT name FROM zones WHERE id = ?", [
        zone.id,
      ])
    ).rows[0];
    if (!row) continue;
    results.push({
      table: "zones",
      id: String(zone.id),
      name: row.name,
      nameClass: classify(row.name, gazetteer),
      cohort: "zone",
      // A zone already has its canonical replacement authored; the generator does not
      // need to invent one, and must not be given the chance to disagree with canon.
      context: { canonical: zone.name, key: zone.key },
    });
  }

  await database.close();
  return results;
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function levelBand(level: number): string {
  if (level <= 10) return "1-10";
  if (level <= 25) return "11-25";
  if (level <= 45) return "26-45";
  return "46+";
}

function roleOf(properties: Record<string, unknown>): string {
  const classId = Number(properties.classId ?? 1);
  if (classId === 41) return "merchant";
  if (classId === 40) return "banker";
  if ([2, 3, 6].includes(classId)) return "devout";
  if ([12, 13, 14].includes(classId)) return "arcane";
  if (classId === 7) return "monastic";
  return "common";
}

function itemFamily(itemType: number): string {
  if ([0, 1, 2, 3, 4, 5, 35, 45].includes(itemType)) return "weapon";
  if ([10].includes(itemType)) return "armor";
  if ([14, 15, 21, 38].includes(itemType)) return "consumable";
  if ([11, 12, 13, 20].includes(itemType)) return "tool";
  return "goods";
}
