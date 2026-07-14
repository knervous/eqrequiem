import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import BetterSqlite3 from "better-sqlite3";

interface GearRow {
  class: number;
  level: number;
  slot: number;
  item_id: number;
}

interface ItemRow {
  id: number;
  Name: string;
  idfile: string;
  icon: number;
  material: number;
  color: number;
  itemtype: number;
  slots: number;
  ac: number;
  bagslots: number;
  classes: number;
  races: number;
  stackable: number;
  stacksize: number;
  maxcharges: number;
  weight: number; damage: number; delay: number;
  astr: number; asta: number; adex: number; aagi: number;
  aint: number; awis: number; acha: number; hp: number; mana: number;
  dr: number; mr: number; cr: number; fr: number; pr: number;
  haste: number; magic: number; nodrop: number;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const database = new BetterSqlite3(resolve(repoRoot, "serverjs/data/game_content.sqlite"), {
  readonly: true,
});
const rows = database.prepare(`
  SELECT class, level, slot, item_id
  FROM tool_gearup_armor_sets
  WHERE class BETWEEN 1 AND 16 AND level BETWEEN 1 AND 50 AND slot BETWEEN 0 AND 23
  ORDER BY class, level, libra_id
`).all() as GearRow[];

const sets: Record<string, Array<[number, number]>> = {};
const filled = new Map<string, Set<number>>();
const itemIds = new Set<number>();
for (const row of rows) {
  const key = `${row.class}:${row.level}`;
  const occupied = filled.get(key) ?? new Set<number>();
  let slot = row.slot;
  if (slot === 9 && occupied.has(9)) slot = 10;
  if (slot === 1 && occupied.has(1)) slot = 4;
  if (slot === 15 && occupied.has(15)) slot = 16;
  if (occupied.has(slot)) continue;
  occupied.add(slot);
  filled.set(key, occupied);
  (sets[key] ??= []).push([slot, row.item_id]);
  itemIds.add(row.item_id);
}

const placeholders = [...itemIds].map(() => "?").join(",");
const items = database.prepare(`
  SELECT id, Name, idfile, icon, material, color, itemtype, slots, ac, bagslots,
    classes, races, stackable, stacksize, maxcharges, weight, damage, delay,
    astr, asta, adex, aagi, aint, awis, acha, hp, mana, dr, mr, cr, fr, pr,
    haste, magic, nodrop
  FROM items WHERE id IN (${placeholders}) ORDER BY id
`).all(...itemIds) as ItemRow[];
database.close();

const target = resolve(
  repoRoot,
  "serverjs/src/backend/generated/offline-gear-catalog.ts",
);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  `// Generated from serverjs/data/game_content.sqlite. Do not edit by hand.\n` +
    `export interface OfflineItemTemplate { id: number; name: string; idfile: string; icon: number; material: number; color: number; itemtype: number; slots: number; ac: number; bagslots: number; classes: number; races: number; stackable: number; stacksize: number; maxcharges: number; weight: number; damage: number; delay: number; astr: number; asta: number; adex: number; aagi: number; aint: number; awis: number; acha: number; hp: number; mana: number; dr: number; mr: number; cr: number; fr: number; pr: number; haste: number; magic: number; nodrop: number; }\n` +
    `export const OFFLINE_GEAR_SETS: Readonly<Record<string, readonly (readonly [number, number])[]>> = ${JSON.stringify(sets)};\n` +
    `export const OFFLINE_ITEM_TEMPLATES: readonly OfflineItemTemplate[] = ${JSON.stringify(items.map((item) => ({
      id: item.id,
      name: item.Name,
      idfile: item.idfile,
      icon: item.icon,
      material: item.material,
      color: item.color,
      itemtype: item.itemtype,
      slots: item.slots,
      ac: item.ac,
      bagslots: item.bagslots,
      classes: item.classes,
      races: item.races,
      stackable: item.stackable,
      stacksize: item.stacksize,
      maxcharges: item.maxcharges,
      weight: item.weight,
      damage: item.damage,
      delay: item.delay,
      astr: item.astr,
      asta: item.asta,
      adex: item.adex,
      aagi: item.aagi,
      aint: item.aint,
      awis: item.awis,
      acha: item.acha,
      hp: item.hp,
      mana: item.mana,
      dr: item.dr,
      mr: item.mr,
      cr: item.cr,
      fr: item.fr,
      pr: item.pr,
      haste: item.haste,
      magic: item.magic,
      nodrop: item.nodrop,
    })))};\n`,
);

console.log(`Wrote ${Object.keys(sets).length} gear sets and ${items.length} item templates to ${target}`);
