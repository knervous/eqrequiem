import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const GENERIC_PREFIX = /^(?:small|large|fabled|summoned:\s*|issued|test\s*)/i;
const TEST_NAME = /\((?:test|gm)\)|\btest\b/i;
const ANACHRONISTIC_NAME =
  /\b(?:assault|battery|camera|circuit|computer|cyber|diesel|electronic|engine|firearm|grenade|gun|laser|machine|motor|phone|pistol|plastic|radio|revolver|rifle|robot|rocket|rubber|shotgun|sneaker|steam(?:punk)?|television|vehicle|zipper)\b/i;
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
          .filter(
            (name) =>
              name &&
              !TEST_NAME.test(name) &&
              !ANACHRONISTIC_NAME.test(name),
          )
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
    const dominantSlot = equipmentSlots[0]?.name ?? null;
    return {
      iconId,
      recordCount: records.length,
      itemNames: usefulNames,
      imageNames,
      equipmentSlots,
      dominantSlot,
      dominantConcept: dominantConcept(usefulNames, dominantSlot, records.length),
      records: records.slice(0, 24),
    };
  }

  close() {
    this.database.close();
  }
}

export function promptFromContext(
  context,
  {
    retryReason = null,
    backgroundStrategy =
      process.env.ICON_AI_BACKGROUND_STRATEGY ?? 'local-model',
  } = {},
) {
  const concept =
    context.dominantConcept ??
    dominantConcept(context.itemNames, context.dominantSlot, context.recordCount);
  const chromaKey = chromaKeyForContext(context, concept);
  const pairedConcept = concept.startsWith('pair of ');
  const namingCues = positiveNameCues(context.itemNames, concept);
  const usesChroma = backgroundStrategy === 'chroma';
  if (!usesChroma && backgroundStrategy !== 'local-model') {
    throw new Error(`Unknown icon background strategy: ${backgroundStrategy}`);
  }
  const retryInstruction =
    retryReason === 'chroma'
      ? usesChroma
        ? `correction: flat solid ${chromaKey.name} only, no backdrop or gradient`
        : 'correction: plain uniform neutral field only, no card or gradient'
      : retryReason === 'subjects'
        ? pairedConcept
          ? `correction: one matched pair only, exactly two pieces`
          : `correction: exactly one object, no duplicate or alternate`
        : retryReason === 'edge'
          ? 'correction: smaller complete object, wide empty margin on every side'
          : null;
  return [
    retryInstruction,
    `original pre-industrial medieval high-fantasy ${concept} from Elrador`,
    usesChroma
      ? `isolated on flat solid chroma ${chromaKey.name} ${chromaKey.hex}; field reaches every edge and opening`
      : 'isolated cutout on a featureless bright light-gray field; field reaches every edge and opening',
    'no floor, frame, card, backdrop, gradient, or cast shadow',
    namingCues.length > 0
      ? `one unified design inspired by: ${namingCues.join('; ')}`
      : 'one unified design',
    pairedConcept
      ? compositionForPair(concept)
      : 'exactly one complete object',
    context.dominantSlot ? `${context.dominantSlot} equipment slot` : null,
    `weathered ${materialsForConcept(concept)}`,
    concept === 'finger ring'
      ? 'intact solid gemstone and metal, no transparent damage or missing facets'
      : null,
    'wholly new textured painterly classic dark-fantasy object art, subdued medieval palette',
    'crisp readable silhouette, centered with wide empty margin, never worn or held',
    usesChroma
      ? `no chroma ${chromaKey.name} on object`
      : null,
  ]
    .filter(Boolean)
    .join(', ');
}

function compositionForPair(concept) {
  if (concept === 'pair of gauntlets') {
    return [
      'exactly two separate five-fingered armored gloves',
      'each glove has one cuff, one palm, and five visible articulated metal fingers',
      'parallel side by side, never crossed or overlapping',
      'no limbs, weapons, tools, handles, shields, chest armor, or props',
    ].join('; ');
  }
  if (concept === 'pair of boots') {
    return [
      'exactly two complete separate medieval boots',
      'both boots fully visible from cuff to toe',
      'clear empty gap between their silhouettes, never overlapping',
      'no feet, legs, wearer, weapons, tools, or props',
    ].join('; ');
  }
  return (
    `one complete matched pair, exactly two separate empty ${concept.replace('pair of ', '')}, ` +
    'side by side, no limbs, weapons, tools, handles, or props'
  );
}

function materialsForConcept(concept) {
  if (concept === 'finger ring') return 'aged precious metal and cut gemstone';
  if (concept.includes('gauntlet')) return 'forged metal plates and weathered leather';
  if (concept.includes('boots')) return 'weathered leather and forged metal fittings';
  if (concept === 'face mask') return 'carved bone, dark wood, or tarnished metal';
  if (concept === 'necklace') return 'aged metal, leather, beads, bone, and gemstone';
  if (concept === 'magical orb') {
    return 'rough faceted dark crystal, carved stone, and restrained dim inner magic';
  }
  return 'wood, leather, cloth, bone, stone, glass, crystal, and forged metal';
}

export function chromaKeyForContext(
  context,
  concept = dominantConcept(
    context.itemNames,
    context.dominantSlot,
    context.recordCount,
  ),
) {
  const description = positiveNameCues(context.itemNames, concept).join(' ');
  const conflictsWithGreen =
    /\b(?:acid|bile|emerald|forest|green|jade|moss|nature|poison|slime|swamp|venom|verdant)\b/i.test(
      description,
    );
  return conflictsWithGreen
    ? { name: 'magenta', hex: '#ff00ff' }
    : { name: 'green', hex: '#00ff00' };
}

const CONCEPTS = [
  ['face mask', /\b(mask|visage)\b/i],
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
  ['magical orb', /\b(orb|globe|sphere)\b/i],
  ['gemstone', /\b(gem|diamond|ruby|emerald|sapphire|crystal)\b/i],
  ['key', /\bkey\b/i],
];

function positiveNameCues(names, concept) {
  const matcher = CONCEPTS.find(([name]) => name === concept)?.[1];
  const matchingNames = matcher
    ? names.filter((name) => matcher.test(name))
    : names;
  return (matchingNames.length > 0 ? matchingNames : names).slice(0, 3);
}

function dominantConcept(names, dominantSlot = null, recordCount = 0) {
  let selected = ['medieval fantasy artifact', null];
  let highest = 0;
  for (const candidate of CONCEPTS) {
    const score = names.filter((name) => candidate[1].test(name)).length;
    if (score > highest) {
      selected = candidate;
      highest = score;
    }
  }
  const minimumEvidence = names.length >= 6 ? 2 : 1;
  if (recordCount > 500 && highest < 3) return 'medieval magical artifact';
  if (highest < minimumEvidence) {
    return dominantSlot && SLOT_CONCEPTS[dominantSlot]
      ? SLOT_CONCEPTS[dominantSlot]
      : 'medieval fantasy artifact';
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
