import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const GENERIC_PREFIX = /^(?:small|large|fabled|summoned:\s*|issued|test\s*)/i;
const TEST_NAME = /\((?:test|gm)\)|\btest\b/i;
const EQUIPMENT_SLOTS = [
  'charm',
  'ear',
  'head',
  'face',
  'ear',
  'neck',
  'shoulders',
  'arms',
  'back',
  'wrist',
  'wrist',
  'range',
  'hands',
  'primary hand',
  'secondary hand',
  'finger',
  'finger',
  'chest',
  'legs',
  'feet',
  'waist',
  'ammo',
];

const SLOT_CONCEPTS = {
  charm: 'wearable charm',
  ear: 'earring',
  head: 'helmet or circlet',
  face: 'face mask',
  neck: 'necklace or amulet',
  shoulders: 'pair of shoulder guards',
  arms: 'pair of arm guards',
  back: 'cloak',
  wrist: 'wrist bracer',
  range: 'ranged weapon',
  hands: 'pair of gauntlets',
  'primary hand': 'one-handed weapon',
  'secondary hand': 'off-hand weapon or shield',
  finger: 'finger ring',
  chest: 'chest armor',
  legs: 'pair of leg guards',
  feet: 'pair of boots',
  waist: 'belt',
  ammo: 'ammunition',
};

export class IconContextDatabase {
  constructor(databasePath) {
    this.databasePath = path.resolve(databasePath);
    this.database = new DatabaseSync(this.databasePath, { readOnly: true });
    this.statement = this.database.prepare(`
      SELECT id, Name AS name, idfile, lore, itemtype, slots, material, color,
        magic, damage, delay
      FROM items
      WHERE icon = ?
      ORDER BY
        CASE WHEN Name LIKE '%(Test)%' OR Name LIKE '% Test' THEN 1 ELSE 0 END,
        magic DESC, id
    `);
  }

  contextFor(entry) {
    const iconId = entry.atlasIconId;
    const records = this.statement.all(iconId).map((record) => ({
      ...record,
      id: Number(record.id),
      itemtype: Number(record.itemtype),
      slots: Number(record.slots),
      material: Number(record.material),
      color: Number(record.color),
      magic: Number(record.magic),
      damage: Number(record.damage),
      delay: Number(record.delay),
    }));
    const usefulNames = [
      ...new Set(
        records
          .map((record) => String(record.name).trim())
          .filter((name) => name && !TEST_NAME.test(name))
          .map((name) => name.replace(GENERIC_PREFIX, '').trim()),
      ),
    ].slice(0, 12);
    const imageNames = [
      ...new Set(records.map((record) => String(record.idfile).trim()).filter(Boolean)),
    ].slice(0, 12);
    const slotCounts = new Map();
    for (const record of records) {
      for (const slotName of slotNames(record.slots)) {
        slotCounts.set(slotName, (slotCounts.get(slotName) ?? 0) + 1);
      }
    }
    const equipmentSlots = [...slotCounts.entries()]
      .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
      .map(([name, count]) => ({ name, count }));
    return {
      iconId,
      recordCount: records.length,
      itemNames: usefulNames,
      imageNames,
      equipmentSlots,
      dominantSlot: equipmentSlots[0]?.name ?? null,
      records: records.slice(0, 24),
    };
  }

  close() {
    this.database.close();
  }
}

export function promptFromContext(context) {
  const concept = dominantConcept(context.itemNames, context.dominantSlot);
  const namingCue = context.itemNames[0];
  return [
    `exactly one original high fantasy medieval ${concept}`,
    'isolated on a perfectly flat solid vivid chroma green background, RGB 0 255 0',
    'the same empty green background touches all four image edges',
    'green remains visible through every opening and negative space in the object',
    `one complete ${concept}, one design, no duplicate variants`,
    'object centered with generous empty green margin',
    'isolated inventory object only, never worn or held by a person, body, hand, or mannequin',
    context.dominantSlot ? `equipment placement: ${context.dominantSlot} slot` : null,
    namingCue ? `positive naming cue from item metadata: ${namingCue}` : null,
    'create one wholly new object rather than copying an existing icon',
    'three-quarter product view',
    'hand-painted dark fantasy game art',
    'crisp silhouette and controlled highlights',
    'no text, no presentation tile, no card, no frame, no floor, no cast shadow, no scenery',
  ]
    .filter(Boolean)
    .join(', ');
}

const CONCEPTS = [
  ['face mask', /\b(mask|visage|goggles)\b/i],
  ['necklace', /\b(necklace|choker|gorget|beads|pendant|amulet|torque)\b/i],
  ['finger ring', /\b(ring|band|seal)\b/i],
  ['pair of gauntlets', /\b(gauntlets?|gloves?|fists?|talons?)\b/i],
  ['belt', /\b(belt|girdle|sash|waist)\b/i],
  ['pair of boots', /\b(boots?|shoes?|slippers?|sandals?)\b/i],
  ['wrist bracelet', /\b(bracer|bracelet|wristguard|bangle)\b/i],
  ['helmet', /\b(helm|helmet|crown|circlet|coronet|tiara)\b/i],
  ['sword', /\b(sword|blade|saber|scimitar|katana)\b/i],
  ['dagger', /\b(dagger|knife|stiletto)\b/i],
  ['axe', /\b(axe|hatchet)\b/i],
  ['hammer', /\b(hammer|mace|maul)\b/i],
  ['spear', /\b(spear|lance|pike|trident)\b/i],
  ['bow', /\b(bow|crossbow)\b/i],
  ['shield', /\b(shield|aegis|buckler)\b/i],
  ['cloak', /\b(cloak|cape|mantle|drape)\b/i],
  ['book', /\b(book|tome|grimoire|codex)\b/i],
  ['scroll', /\b(scroll|parchment)\b/i],
  ['potion bottle', /\b(potion|elixir|tonic|vial|flask)\b/i],
  ['gemstone', /\b(gem|diamond|ruby|emerald|sapphire|crystal)\b/i],
  ['key', /\bkey\b/i],
];

function dominantConcept(names, dominantSlot = null) {
  let selected = ['medieval fantasy artifact', null];
  let highest = 0;
  for (const candidate of CONCEPTS) {
    const score = names.filter((name) => candidate[1].test(name)).length;
    if (score > highest) {
      selected = candidate;
      highest = score;
    }
  }
  if (highest === 0 && dominantSlot && SLOT_CONCEPTS[dominantSlot]) {
    return SLOT_CONCEPTS[dominantSlot];
  }
  return selected[0];
}

function slotNames(bitmask) {
  return [
    ...new Set(
      EQUIPMENT_SLOTS.filter((_, slot) => (bitmask & 2 ** slot) !== 0),
    ),
  ];
}
