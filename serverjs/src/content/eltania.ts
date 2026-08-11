/**
 * The canonical content vocabulary for Eltania.
 *
 * Every authored name, zone identity and spawn binding the game's own content depends
 * on is declared here once. Content modules import from this file and never write a
 * legacy key inline, so replacing the EverQuest-derived world beneath them is an edit
 * to this module rather than an archaeology pass across the content tree.
 *
 * Eltania is the living land. (An earlier draft used "Elrador" for the world and
 * "Eltania" for a lost civilization; that split is retired — see `docs/world.md`.)
 */

export const WORLD_NAME = "Eltania";
export const GAME_TITLE = "Shadows of Eltania";
/** The cataclysm five centuries ago that severed the land from magic. */
export const CATACLYSM_NAME = "The Severance";
/** The mage cult whose work caused it. */
export const ANCIENT_CULT_NAME = "The Hollow Star";

export interface EltaniaZone {
  /**
   * Canonical key. One identity, used everywhere.
   *
   * This is also the runtime short name and the asset base name: `zones.short_name` in
   * the content database, `worlds/<key>.glb.gz` on disk, and the nav mesh key. There used
   * to be a second `legacyShortName` field carrying EverQuest's identity ("qeynos2") so
   * the two could differ; the assets have been renamed and that field is gone. A zone has
   * one name now, and nothing has to translate between two.
   */
  readonly key: string;
  readonly id: number;
  readonly name: string;
}

export const ZONES = {
  crownward: {
    key: "talioscrownward",
    id: 2,
    name: "Talios Crownward",
  },
  lowharbor: {
    key: "talioslowharbor",
    id: 1,
    name: "Talios Lowharbor",
  },
  greymarch: {
    key: "greymarch",
    id: 4,
    name: "The Greymarch",
  },
  greenveil: {
    key: "greenveil",
    id: 3,
    name: "The Greenveil",
  },
  blackroot: {
    key: "blackrootwarrens",
    id: 17,
    name: "Blackroot Warrens",
  },
  mournvault: {
    key: "mournvault",
    id: 36,
    name: "Mournvault: The First Descent",
  },
} as const satisfies Record<string, EltaniaZone>;

export type EltaniaZoneKey = (typeof ZONES)[keyof typeof ZONES]["key"];

/**
 * Where a new character arrives.
 *
 * The demo has exactly one starting city, so this is canon rather than a per-race table:
 * every character opens their eyes inside Talios Crownward, a short walk from the gate
 * watch and the first thread of the story. Authored here rather than read from the
 * legacy zone's safe point so the arrival survives the zone's geometry being replaced.
 */
export const ARRIVAL = {
  zone: ZONES.crownward,
  x: -312,
  y: 3.15,
  z: 130,
  heading: 128,
} as const;

/** Places that exist in the fiction but do not have their own shard yet. */
export const PLACES = {
  greymarch: "The Greymarch",
  greenveil: "The Greenveil",
  alderhollow: "Alderhollow",
  blackrootWarrens: "Blackroot Warrens",
  mournvault: "The Mournvault",
  mournvaultFirstDescent: "Mournvault: The First Descent",
  solska: "Solska",
  paleCrown: "The Pale Crown",
  emberwall: "The Emberwall",
  gloamfen: "The Gloamfen",
  lethyrwood: "The Lethyrwood",
} as const;

/** Peoples, for dialogue and character copy. */
export const PEOPLES = {
  solskar: "Solskar",
  aethir: "Aethir",
  human: "Human",
  woodElf: "Wood Elf",
  dwarf: "Dwarf",
} as const;

/**
 * NPCs are **not** defined here.
 *
 * They live in the content database and nowhere else. This module used to carry a
 * canonical-identity table mapping invented display names onto spawn rows, which meant
 * two sources of truth that drifted the moment the database was renamed — a quest
 * addressed "Dockmaster Bran" while the world showed `Garis_Ashford_3`.
 *
 * Authored content names the NPC the database names. If that name changes, the content
 * changes with it, and `quest-manifest.test.ts` fails until it does.
 */

/**
 * Items the demo's own content authors, bound to their current template rows.
 *
 * `name` is the intended display name; the row the id points at still carries its
 * legacy one. The rename pipeline (`docs/shadows-of-eltania/06-content-renaming-pipeline.md`)
 * closes that gap by writing these names onto the bound rows — until then the player
 * sees the template's name, so treat the binding as a placeholder rather than a promise.
 */
export const ITEMS = {
  /** The evidence the missing patrol left behind. */
  brokenWatchSpear: {
    key: "broken-watch-spear",
    name: "Broken Watch Spear",
    itemId: 7009,
  },
  patrolInsigniaRing: {
    key: "patrol-insignia-ring",
    name: "Patrol Insignia Ring",
    itemId: 7010,
  },
  blackrootManifest: {
    key: "blackroot-manifest",
    name: "Blackroot Smuggler Manifest",
    itemId: 18013,
  },
  brokenStarSeal: {
    key: "broken-star-seal",
    name: "Broken-Star Obsidian Seal",
    itemId: 7012,
  },
  violetNightshadePetals: {
    key: "violet-nightshade-petals",
    name: "Violet Nightshade Petals",
    itemId: 7013,
  },
  mournvaultBrassKey: {
    key: "mournvault-brass-key",
    name: "Mournvault Fractured Brass Key",
    itemId: 7014,
  },
  solskarIronIngot: {
    key: "solskar-iron-ingot",
    name: "Solskar Cold Iron Ingot",
    itemId: 7015,
  },
} as const;

/** The zone with this key, or undefined. */
export function zoneByKey(key: string): EltaniaZone | undefined {
  return Object.values(ZONES).find((entry) => entry.key === key);
}

/** The zone with this id, or undefined. */
export function zoneById(id: number): EltaniaZone | undefined {
  return Object.values(ZONES).find((entry) => entry.id === id);
}
