/**
 * The authored replacement for every EverQuest item name the demo can reach that the
 * rename pass turned into a person.
 *
 * ## The defect
 *
 * `propose.ts` applied one generator — a person-name generator — to `items.name` exactly
 * as it did to `npc_types.name`. 459 item rows came out called `Maren_Oakcrest_6`,
 * `Aelence_Valseeker_4`, `Tarence_Ashford_3`. A cloth cap was a man. Every one of the 459
 * is reachable from the six demo zones as loot or merchant stock, so all of them are on
 * screen. This is the same defect repaired for NPCs in
 * `docs/shadows-of-eltania/08-npc-naming-repair.md`, and it wants the same treatment.
 *
 * ## Keyed by original name, not by row
 *
 * As with the NPC map, the key is the row's *original* EverQuest name, recovered by
 * joining `game_content.sqlite`. Keying this way is what repairs the collisions: the
 * numeric suffixes exist because the generator hashed a string and patched clashes
 * afterwards, and two rows that shared an original get one name back without any
 * collision detection at all. Only `Part of Tasarin's Grimoire Pg. 23` is genuinely two
 * rows of one name, and it stays that way — EverQuest shipped it twice too.
 *
 * ## Kind before name
 *
 * The missing step in the original pass was deciding *what kind of thing a row is*
 * before naming it. `itemtype` and `slots` say precisely that, so the classification is
 * derived from the data rather than guessed, and the kind then decides the naming rule:
 *
 * - a `weapon` keeps a weapon noun and its tier qualifier, because tier is what the
 *   player is comparing;
 * - `armour` keeps material, slot and the Small/Large sizing, because sizing is a race
 *   restriction the player has to be able to read off the name;
 * - a `component` keeps its grade word, because the ore tiers are an ordered ladder
 *   (Crude, Fair, Malleable, Ductile, Ossified, Refractory) and reordering them would
 *   silently break tradeskill progression;
 * - a `scroll` keeps its `Spell: ` / `Song: ` prefix, which is form the client and the
 *   player both read, exactly as `#` is form for an NPC;
 * - a `trophy` is named after whatever it was cut from, so it has to agree with the NPC
 *   map — `Grennet Stormhand's Head` follows `Grennet_Stormhand` to Gwenda Kingsley, and
 *   `Gnoll Finger Bones` follows the warrens to Blackroot.
 *
 * ## Vocabulary
 *
 * Every token was checked with `content-ai:tokens` before being written here. The gate is
 * blunt in a way that matters much more for items than it did for NPCs: it holds base
 * forms only, so `gloves`, `sleeves`, `leggings`, `chainmail` and `ringmail` are all
 * rejected as coined even though they are ordinary English. That is why the armour below
 * reads `Chain Mail Gauntlet` and not `Chainmail Gloves` — the singular slot noun and the
 * split compound are what pass, and they turn out to read better anyway.
 *
 * Where the original names something EverQuest owns, the replacement reuses the
 * equivalent already shipped in `content-db.sqlite` rather than inventing a second one:
 * Gnoll/Blackburrow to Blackroot, Antonican to Eltanian, Qeynos to Talios, Velious to
 * Frostreach, Solusek to Sunforge, Cazic to the Fear Warden, Rallos Zek to the Iron
 * Hearth, Barbarian to Marauder, Klicnik to Chikreet, the myotis bats to the grotto bats.
 */

export type ItemKind =
  /** Swung, thrown or fist-held. Damage and delay are set. */
  | "weapon"
  /** Worn, or held for its armour class. Sizing and slot must survive the rename. */
  | "armour"
  /** Eaten, drunk or expended: food, drink, potions, bandages. */
  | "consumable"
  /** An implement that persists: containers, kits, molds, recipe books, light sources. */
  | "tool"
  /** Consumed by a recipe. Grade and size words are load-bearing. */
  | "component"
  /** A spell or song scroll. The `Spell: ` / `Song: ` prefix is form. */
  | "scroll"
  /** Carried for a quest: keys, notes, orders, writs, ledgers. */
  | "token"
  /** Cut from something that was killed. Must agree with the NPC name map. */
  | "trophy";

export interface ItemNameEntry {
  readonly kind: ItemKind;
  readonly name: string;
  /** Why this replacement, where the reason is not obvious from the pair. */
  readonly note?: string;
}

const entry = (kind: ItemKind, name: string, note?: string): ItemNameEntry =>
  note === undefined ? { kind, name } : { kind, name, note };

const weapon = (name: string, note?: string): ItemNameEntry => entry("weapon", name, note);
const armour = (name: string, note?: string): ItemNameEntry => entry("armour", name, note);
const consumable = (name: string, note?: string): ItemNameEntry =>
  entry("consumable", name, note);
const tool = (name: string, note?: string): ItemNameEntry => entry("tool", name, note);
const component = (name: string, note?: string): ItemNameEntry =>
  entry("component", name, note);
const scroll = (name: string, note?: string): ItemNameEntry => entry("scroll", name, note);
const token = (name: string, note?: string): ItemNameEntry => entry("token", name, note);
const trophy = (name: string, note?: string): ItemNameEntry => entry("trophy", name, note);

export const ITEM_NAME_MAP: Readonly<Record<string, ItemNameEntry>> = {
  // ── Weapons ────────────────────────────────────────────────────────────────────
  // EverQuest's tier words survive where they are ordinary English (Rusty, Bronze, Fine
  // Steel); `Tarnished` is coined and becomes `Worn`, which keeps the ladder legible.
  "Tarnished Bastard Sword": weapon("Worn Bastard Sword"),
  "Tarnished Scythe": weapon("Worn Scythe"),
  "Tarnished Two Handed Sword": weapon("Worn Two Handed Sword"),
  "Tarnished Dagger": weapon("Worn Dagger"),
  "Tarnished Mace": weapon("Worn Mace"),
  "Bronze Shortened Spear": weapon("Bronze Hunting Spear", "`shortened` is coined"),
  "Rusty Shortened Spear": weapon("Rusty Hunting Spear"),
  "Dagger of Marnek": weapon("Dagger of the Quiet", "named for the Long Quiet, not a person"),
  "Fine Steel Warhammer": weapon("Fine Steel War Hammer", "`warhammer` is coined; split it"),
  "Rusty Warhammer": weapon("Rusty War Hammer"),
  Warhammer: weapon("War Hammer"),
  "Splintering Club": weapon("Cracked Cudgel"),
  Shuriken: weapon("Throwing Star"),
  "Bronze Knuckles": weapon("Bronze Cestus", "`knuckles` is coined"),
  "Rusty Knuckles": weapon("Rusty Cestus"),
  "Steel Knuckles": weapon("Steel Cestus"),
  "Weighted Gloves": weapon("Weighted Gauntlet"),
  "Worn Weighted Gloves": weapon("Worn Weighted Gauntlet"),
  "Rusty Ulak": weapon("Rusty Claw Blade", "an ulak is a paired claw weapon"),

  // ── Armour: shields and off-hand ───────────────────────────────────────────────
  // `Targ` is EverQuest's spelling of targe, which is a real word and passes the gate.
  "Targ Shield": armour("Rimmed Targe"),
  "Large Targ Shield": armour("Large Rimmed Targe"),
  "Small Targ Shield": armour("Small Rimmed Targe"),
  "Parrying Dagger": armour("Warding Dirk", "held for AC, not damage"),

  // ── Armour: cloth ──────────────────────────────────────────────────────────────
  // Cloth is the poor material, so it takes the poor word. Sizing survives: the Small
  // and Large rows carry different race restrictions.
  "Cloth Gloves": armour("Homespun Mitten"),
  "Cloth Sandals": armour("Homespun Slipper"),
  "Cloth Sleeves": armour("Homespun Sleeve"),
  "Small Cloth Gloves": armour("Small Homespun Mitten"),
  "Small Cloth Sandals": armour("Small Homespun Slipper"),
  "Small Cloth Sleeves": armour("Small Homespun Sleeve"),
  "Fur Lined Shoes": armour("Fleece Lined Boots"),
  "Damask Gloves": armour("Brocade Mitten"),
  "Damask Leggings": armour("Brocade Hose"),
  "Damask Sleeves": armour("Brocade Sleeve"),
  "Damask Wristbands": armour("Brocade Wristband"),

  // ── Armour: leather and hide ───────────────────────────────────────────────────
  // Leather and Raw-hide are parallel families at the same AC, so they need words that
  // read as siblings rather than as tiers.
  "Leather Gloves": armour("Tanned Leather Glove"),
  "Leather Leggings": armour("Tanned Leather Legguard"),
  "Leather Shoulderpads": armour("Tanned Leather Mantle"),
  "Leather Sleeves": armour("Tanned Leather Sleeve"),
  "Leather Wristbands": armour("Tanned Leather Wristband"),
  "Large Leather Gloves": armour("Large Tanned Leather Glove"),
  "Large Leather Leggings": armour("Large Tanned Leather Legguard"),
  "Large Leather Shoulderpads": armour("Large Tanned Leather Mantle"),
  "Large Leather Sleeves": armour("Large Tanned Leather Sleeve"),
  "Large Leather Wristbands": armour("Large Tanned Leather Wristband"),
  "Small Leather Gloves": armour("Small Tanned Leather Glove"),
  "Small Leather Leggings": armour("Small Tanned Leather Legguard"),
  "Small Leather Shoulderpads": armour("Small Tanned Leather Mantle"),
  "Small Leather Sleeves": armour("Small Tanned Leather Sleeve"),
  "Small Leather Wristbands": armour("Small Tanned Leather Wristband"),
  "Raw-hide Gloves": armour("Rough Hide Glove"),
  "Raw-hide Leggings": armour("Rough Hide Legguard"),
  "Raw-hide Shoulderpads": armour("Rough Hide Pauldron"),
  "Raw-hide Sleeves": armour("Rough Hide Sleeve"),
  "Raw-hide Wristbands": armour("Rough Hide Wristband"),
  "Large Raw-hide Gloves": armour("Large Rough Hide Glove"),
  "Large Raw-hide Leggings": armour("Large Rough Hide Legguard"),
  "Large Raw-hide Shoulderpads": armour("Large Rough Hide Pauldron"),
  "Large Raw-hide Sleeves": armour("Large Rough Hide Sleeve"),
  "Large Raw-hide Wristbands": armour("Large Rough Hide Wristband"),
  "Small Raw-hide Gloves": armour("Small Rough Hide Glove"),
  "Small Raw-hide Leggings": armour("Small Rough Hide Legguard"),
  "Small Raw-hide Shoulderpads": armour("Small Rough Hide Pauldron"),
  "Small Raw-hide Sleeves": armour("Small Rough Hide Sleeve"),
  "Small Raw-hide Wristbands": armour("Small Rough Hide Wristband"),
  "Studded Leather Collar": armour("Bossed Leather Collar"),
  "Rusty Spiked Shoulderpads": armour("Rusty Spiked Mantle"),

  // ── Armour: mail and plate ─────────────────────────────────────────────────────
  // `chainmail` and `ringmail` are both coined; split into two ordinary words.
  "Chainmail Bracelet": armour("Chain Mail Wristband"),
  "Chainmail Cape": armour("Chain Mail Cape"),
  "Chainmail Coat": armour("Chain Mail Hauberk"),
  "Chainmail Gloves": armour("Chain Mail Gauntlet"),
  "Chainmail Mantle": armour("Chain Mail Mantle"),
  "Chainmail Neckguard": armour("Chain Mail Gorget"),
  "Chainmail Skirt": armour("Chain Mail Girdle"),
  "Ringmail Boots": armour("Ring Mail Boots"),
  "Ringmail Bracelet": armour("Ring Mail Wristband"),
  "Ringmail Cape": armour("Ring Mail Cape"),
  "Large Ringmail Belt": armour("Large Ring Mail Girdle"),
  "Large Ringmail Boots": armour("Large Ring Mail Boots"),
  "Large Ringmail Bracelet": armour("Large Ring Mail Wristband"),
  "Large Ringmail Coif": armour("Large Ring Mail Coif"),
  "Large Ringmail Pants": armour("Large Ring Mail Chausses"),
  "Large Ringmail Sleeves": armour("Large Ring Mail Sleeve"),
  "Small Ringmail Belt": armour("Small Ring Mail Girdle"),
  "Small Ringmail Boots": armour("Small Ring Mail Boots"),
  "Small Ringmail Bracelet": armour("Small Ring Mail Wristband"),
  "Small Ringmail Coat": armour("Small Ring Mail Hauberk"),
  "Small Ringmail Coif": armour("Small Ring Mail Coif"),
  "Small Ringmail Gloves": armour("Small Ring Mail Gauntlet"),
  "Small Ringmail Pants": armour("Small Ring Mail Chausses"),
  "Small Ringmail Sleeves": armour("Small Ring Mail Sleeve"),
  "Banded Sleeves": armour("Banded Sleeve"),
  "Barbed Armplates": armour("Barbed Arm Plate"),
  "Barbed Legplates": armour("Barbed Leg Plate"),
  "Iron Armplates": armour("Iron Arm Plate"),
  "Iron Legplates": armour("Iron Leg Plate"),
  "Plate Gauntlets": armour("Plate Gauntlet"),
  "Platemail Helm": armour("Plate Helm"),
  "Splinted Cloak": armour("Splint Cloak"),
  "Steel Bracers": armour("Steel Bracer"),
  "Steel Vambraces": armour("Steel Vambrace"),

  // ── Armour: gnoll salvage ──────────────────────────────────────────────────────
  // Follows the warrens: the NPC map sent every gnoll to Blackroot.
  "Ruined Gnoll Chain Gloves": armour("Ruined Blackroot Chain Gauntlet"),
  "Ruined Gnoll Chain Sleeves": armour("Ruined Blackroot Chain Sleeve"),
  "Ruined Gnoll Leather Gloves": armour("Ruined Blackroot Hide Glove"),
  "Ruined Gnoll Leather Leggings": armour("Ruined Blackroot Hide Legguard"),
  "Ruined Gnoll Leather Sleeves": armour("Ruined Blackroot Hide Sleeve"),
  "Ruined Gnoll Leather Wristbands": armour("Ruined Blackroot Hide Wristband"),

  // ── Armour: jewellery, robes and the one summoned piece ────────────────────────
  "Antiqued Silver Band": armour("Antique Silver Band"),
  "Elven Charm Necklace": armour("Silvan Charm Necklace", "elves are the Silvan; see the shipped Tunarean -> Silvan"),
  "Mithril Amulet": armour("Wardsilver Amulet"),
  "Rehim's Robe": armour("Quillane's Robe", "named for Nessa Quillane, the clothspinner"),
  "Rineval Talyas' Robe": armour("Roland Thornbury's Robe", "follows Rineval_Talyas -> Roland_Thornbury"),
  "Thaumaturgist's Robe": armour("Thaumaturge's Robe"),
  "Summoned: Muzzle of Mowcha": armour("Bound Hound Muzzle", "`Summoned` is itself EverQuest vocabulary, so the prefix cannot be kept"),

  // ── Consumables: food ──────────────────────────────────────────────────────────
  "Coldain Pickles": consumable("Frostreach Pickle Jar", "Coldain are Velious dwarves; Velious is Frostreach"),
  Fishcakes: consumable("Fish Cake"),
  Grapes: consumable("Grape Cluster"),
  "Grilled Rat Ears": consumable("Grilled Rat Ear"),
  "Wyvern Flesh Pie": consumable("Drake Flesh Pie"),

  // ── Consumables: drink ─────────────────────────────────────────────────────────
  "Bottle of Kalish": consumable("Bottle of Dockside Gin"),
  "Capt. Orlin's Spiced Ale": consumable("Captain Orlaith's Spiced Ale"),
  "Coldain Bone Brew": consumable("Frostreach Bone Brew"),
  "Crow's Special Brew": consumable("Crowe's Special Brew", "follows Crow -> Crowe in the NPC map"),
  "Dragons Blood Braggot": consumable("Drake Blood Mead"),
  "Flaming Coldain": consumable("Flaming Frostreach Dram"),
  "Kael Drakkel Ale": consumable("Frostreach Hall Ale"),
  "King Tormax's Private Reserve": consumable("King Torvane's Private Reserve"),
  "Keg of Vox Tail Ale": consumable("Keg of Drake Tail Ale"),

  // ── Consumables: potions and field kit ─────────────────────────────────────────
  // Roman numerals above two characters tokenise as coined words, so the ladder is
  // renumbered in digits, which the tokeniser strips entirely.
  "Consigned Bite of the Shissar I": consumable("Bound Bite of the Serpent 1"),
  "Consigned Bite of the Shissar XI": consumable("Bound Bite of the Serpent 11"),
  "Consigned Bite of the Shissar XII": consumable("Bound Bite of the Serpent 12"),
  "Consigned Bite of the Shissar XIII": consumable("Bound Bite of the Serpent 13"),
  "Consigned Bite of the Shissar XIV": consumable("Bound Bite of the Serpent 14"),
  "Vial of Swirling Smoke": consumable("Vial of Curling Smoke"),
  Bandages: consumable("Linen Bandage"),

  // ── Tools: containers and kits ─────────────────────────────────────────────────
  Backpack: tool("Rucksack"),
  "Large Box": tool("Large Crate"),
  "Small Box": tool("Small Crate"),
  "Elemental Grimoire": tool("Elemental Codex"),
  "Fletching Kit": tool("Bowmaker's Kit"),
  "Jeweler's Kit": tool("Lapidary Kit"),
  "Mixing Bowl": tool("Baking Bowl"),
  Lockpicks: tool("Picklock Set"),
  "Planing Tool": tool("Wood Plane"),
  "Blackened Wand": tool("Sooted Wand"),
  "Stormraven's Quill": tool("Raven Feather Quill"),
  "Fine Lute Tuners": tool("Fine Lute Peg"),
  "Trumpet Valves": tool("Trumpet Valve"),

  // ── Tools: light ───────────────────────────────────────────────────────────────
  Lightstone: tool("Lesser Glimmer Stone"),
  "Greater Lightstone": tool("Greater Glimmer Stone"),
  "Burned Out Lightstone": tool("Burnt Out Glimmer Stone"),

  // ── Tools: molds ───────────────────────────────────────────────────────────────
  "Animal Cookie Mold": tool("Animal Biscuit Mold"),
  "Barbarian Cookie Mold": tool("Marauder Biscuit Mold", "Barbarian -> Marauder, as already shipped"),
  "Gnome Cookie Mold": tool("Gnome Biscuit Mold"),
  "Troll Cookie Mold": tool("Troll Biscuit Mold"),
  "Field Splinted Cloak Mold": tool("Field Splint Cloak Mold"),
  "Full Splinted Cloak Mold": tool("Full Splint Cloak Mold"),
  "Leggings Sectional Mold": tool("Legguard Sectional Mold"),
  "Sleeves Sectional Mold": tool("Sleeve Sectional Mold"),
  "Standing Legs Mold": tool("Standing Leg Mold"),
  "Shuriken Mold": tool("Throwing Star Mold"),
  "Targ Shield Mold": tool("Rimmed Targe Mold"),

  // ── Tools: the trade books ─────────────────────────────────────────────────────
  "Armor and Weapons Guide": tool("Guide to Arms and Armor"),
  "Bowyers Guide": tool("Guide to Arrow Craft"),
  Fletching: tool("The Bowmaker's Art"),
  "Tailoring Quivers": tool("Tailoring the Quiver"),
  "Natures Beverages": tool("The Forager's Brewbook"),
  "On Languages": tool("On Speech"),
  "The Basics of Jewelcrafting": tool("A Lapidary Primer"),
  "Ikthars Fine Steel Skin": tool("Emberhold Fine Steel Primer", "the Ironforge smiths became the Emberholds"),
  "Malagil's Compendium Vol. 1": tool("Marchbank's Compendium Vol. 1"),
  "Malagil's Compendium Vol. 2": tool("Marchbank's Compendium Vol. 2"),
  "Blank Scroll Sheets": tool("Blank Vellum Leaf"),

  // ── Tokens: keys, orders, correspondence ───────────────────────────────────────
  "Charred Bone Key": token("Scorched Bone Key"),
  "Splintered Wooden Key": token("Cracked Wooden Key"),
  "Area Maps of Qeynos Hills": token("Survey Chart of Outer Talios"),
  "Blackburrow Battle Plans": token("Blackroot Battle Plan"),
  "Invasion Plans": token("Invasion Order"),
  "Gnoll Scoutsman Documents": token("Blackroot Scout Ledger"),
  "Note from Eichvul": token("Note from Ellsworth"),
  "Bayle List II": token("Uppercross List II", "follows Kane_Bayle -> Kellan_Uppercross"),
  "Telryd's Writ": token("Netherby's Writ"),
  "Telryd's Expansive Writ": token("Netherby's Expansive Writ"),
  "The Antonican Times Vol. 8 No. 1": token("The Eltanian Times Vol. 8 No. 1"),
  "The Antonican Times Vol. 8 No. 3": token("The Eltanian Times Vol. 8 No. 3"),
  "The Antonican Times Vol. 8 No. 6": token("The Eltanian Times Vol. 8 No. 6"),
  "Studded Coin Purse": token("Bossed Coin Purse"),
  "Tovaxs Necklace": token("Tobin Longmoor's Necklace", "follows Tovax_Vmar -> Tobin_Longmoor"),

  // ── Trophies: heads, and who they came off ─────────────────────────────────────
  // Each of these has to agree with the NPC map or the quest that asks for it stops
  // making sense.
  "Grennet Stormhand's Head": trophy("Gwenda Kingsley's Head"),
  "Rolon Banari's Head": trophy("Roland Uppercross's Head"),
  "Sironans Head": trophy("Outrider Selwyn's Head", "follows Guard_Sironan -> Outrider_Selwyn"),
  "Yalroens Head": trophy("Outrider Yalren's Head", "follows Guard_Yalroen -> Outrider_Yalren"),
  "Yollis Jenkins Head": trophy("Yorick Netherby's Head"),
  "Bloodsaber Defilers Head": trophy("Hollow Star Defiler Head", "the Bloodsabers became the Hollow Star"),
  "Courier's Head": trophy("Solskar Wayfarer Head", "dropped by a_wayfarer_of_Solskar"),
  "Poacher's Head": trophy("Greenveil Poacher Head"),

  // ── Trophies: bones and parts ──────────────────────────────────────────────────
  "Decaying Finger Bones": trophy("Mouldering Finger Bone"),
  "Decaying Foot Bones": trophy("Mouldering Foot Bone"),
  "Decaying Humerus": trophy("Mouldering Humerus"),
  "Decaying Ribcage": trophy("Mouldering Rib Cage"),
  "Decaying Skull": trophy("Mouldering Skull"),
  "Decaying Sternum": trophy("Mouldering Sternum"),
  "Decaying Tibia": trophy("Mouldering Tibia"),
  "Decaying Ulna": trophy("Mouldering Ulna"),
  "Gnoll Finger Bones": trophy("Blackroot Finger Bone"),
  "Gnoll Foot Bones": trophy("Blackroot Foot Bone"),
  "Gnoll Ribcage": trophy("Blackroot Rib Cage"),
  "Severed Gnoll Foot": trophy("Blackroot Hind Paw"),
  "Flawless Gnoll Hides": trophy("Flawless Blackroot Hide"),
  "Bear Parts": trophy("Bear Remains"),
  "Dark Elf Parts": trophy("Shadow Elf Remains"),
  "Human Parts": trophy("Human Remains"),
  "Troll Parts": trophy("Troll Remains"),
  "Skeleton Parts": trophy("Skeleton Remains"),
  "Field Rat Ribcage": trophy("Field Rat Rib Cage"),
  "Preserved Rat Pelt": trophy("Salted Rat Pelt"),
  "Rat Ears": trophy("Rat Ear"),
  "Rat Whiskers": trophy("Rat Whisker"),
  "Giant Rat Whiskers": trophy("Giant Rat Whisker"),
  "Giant Field Rat Whiskers": trophy("Giant Field Rat Whisker"),
  "Giant Myotis Bat Fur": trophy("Giant Grotto Bat Fur"),
  "Large Myotis Bat Ear": trophy("Large Grotto Bat Ear"),
  "Large Myotis Bat Fur": trophy("Large Grotto Bat Fur"),
  "Large Myotis Bat Wing": trophy("Large Grotto Bat Wing"),
  "Klicnik Drone Bile": trophy("Chikreet Drone Bile"),
  "Klicnik Noble Bile": trophy("Chikreet Noble Bile"),
  "Klicnik Warrior Bile": trophy("Chikreet Warrior Bile"),

  // ── Components: ore and metal ──────────────────────────────────────────────────
  // The grade word is the ladder. Crude < Fair < Malleable < Ductile < Ossified <
  // Refractory, and every one of them is kept.
  "Crude Antonican Ore": component("Crude Eltanian Ore"),
  "Fair Antonican Ore": component("Fair Eltanian Ore"),
  "Malleable Antonican Ore": component("Malleable Eltanian Ore"),
  "Ductile Antonican Ore": component("Ductile Eltanian Ore"),
  "Ossified Antonican Ore": component("Ossified Eltanian Ore"),
  "Refractory Antonican Ore": component("Refractory Eltanian Ore"),
  "Crude Rilsteel": component("Crude Ridgesteel"),
  "Fair Rilsteel": component("Fair Ridgesteel"),
  "Malleable Rilsteel": component("Malleable Ridgesteel"),
  "Ductile Rilsteel": component("Ductile Ridgesteel"),
  "Ossified Rilsteel": component("Ossified Ridgesteel"),
  "Refractory Rilsteel": component("Refractory Ridgesteel"),
  "Block of Rilsteel": component("Block of Ridgesteel"),
  "Large Brick of Rilsteel": component("Large Brick of Ridgesteel"),
  "Small Brick of Rilsteel": component("Small Brick of Ridgesteel"),
  "Large Spool of Rilsteel Thread": component("Large Spool of Ridgesteel Thread"),
  "Small Spool of Rilsteel Thread": component("Small Spool of Ridgesteel Thread"),
  "Reel of Rilsteel Thread": component("Reel of Ridgesteel Thread"),
  "Silvril Ore": component("Palesilver Ore"),

  // ── Components: gems, stones and dusts ─────────────────────────────────────────
  "Cat's Eye Agate": component("Cat Eye Agate"),
  "Wolf's Eye Agate": component("Wolf Eye Agate"),
  "Lapis Lazuli": component("Azure Lazuli"),
  "Extruded Underfoot Diamond": component("Cut Deeproot Diamond"),
  "Raw Amber Nihilite": component("Raw Amber Voidstone"),
  "Raw Indigo Nihilite": component("Raw Indigo Voidstone"),
  "Sunshard Dust": component("Dawnshard Dust"),
  "Sunshard Pebble": component("Dawnshard Pebble"),
  "Sunshard Powder": component("Dawnshard Powder"),
  "Crystallized Sulfur": component("Crystallized Brimstone"),
  "Embalming Dust": component("Grave Dust"),
  "Desiccated Marrow": component("Dried Marrow"),
  Curzon: component("Emberroot"),
  Lucidem: component("Clearstone"),
  "Versluierd Fungus": component("Gloamfen Fungus"),
  "Aderirse Bur": component("Fenwort Bur"),

  // ── Components: runes ──────────────────────────────────────────────────────────
  // Etched -> Scored and Embossed -> Raised keep the two cutting styles distinct;
  // Velium is Frostreach's ice-glass.
  "Simple Etched Rune": component("Simple Scored Rune"),
  "Complex Etched Rune": component("Complex Scored Rune"),
  "Exquisite Etched Rune": component("Exquisite Scored Rune"),
  "Exquisite Platinum Etched Rune": component("Exquisite Platinum Scored Rune"),
  "Simple Embossed Rune": component("Simple Raised Rune"),
  "Gold Embossed Rune": component("Gold Raised Rune"),
  "Exquisite Gold Embossed Rune": component("Exquisite Gold Raised Rune"),
  "Exquisite Platinum Embossed Rune": component("Exquisite Platinum Raised Rune"),
  "Velium Embossed Rune": component("Frostglass Raised Rune"),
  "Complex Velium Embossed Rune": component("Complex Frostglass Raised Rune"),
  "Complex Velium Gem Dusted Rune": component("Complex Frostglass Gem Set Rune"),
  "Velium Silvered Rune": component("Frostglass Silvered Rune"),
  "Rune of Falhalem": component("Rune of the Emberwall"),
  "Rune of Nagafen": component("Rune of the Emberdrake"),

  // ── Components: arrow parts ────────────────────────────────────────────────────
  "Bundled Bone Arrow Shafts": component("Bone Shaft Bundle"),
  "Bundled Ceramic Arrow Shafts": component("Ceramic Shaft Bundle"),
  "Bundled Steel Arrow Shafts": component("Steel Shaft Bundle"),
  "Bundled Wooden Arrow Shafts": component("Wooden Shaft Bundle"),
  "Set of Bone Arrow Vanes": component("Bone Vane Set"),
  "Set of Ceramic Arrow Vanes": component("Ceramic Vane Set"),
  "Set of Wooden Arrow Vanes": component("Wooden Vane Set"),
  "Several Parabolic Cut Fletchings": component("Parabolic Cut Feather Bundle"),
  "Several Round Cut Fletchings": component("Round Cut Feather Bundle"),
  "Several Shield Cut Fletchings": component("Shield Cut Feather Bundle"),
  "Small Groove Nocks": component("Small Groove Nock"),
  "Medium Groove Nocks": component("Medium Groove Nock"),
  "Large Groove Nocks": component("Large Groove Nock"),
  "Field Point Arrowheads": component("Field Point Arrowhead"),
  "Hooked Arrowheads": component("Hooked Arrowhead"),
  "Silver Tipped Arrowheads": component("Silver Tipped Arrowhead"),
  "Ashwood Bow Staff": component("Ash Bow Stave"),
  "Darkwood Bow Staff": component("Blackwood Bow Stave"),
  "Shadewood Bow Staff": component("Gloamwood Bow Stave"),

  // ── Components: patterns and templates ─────────────────────────────────────────
  "Chainmail Boot Pattern": component("Chain Mail Boot Pattern"),
  "Chainmail Bracelet Pattern": component("Chain Mail Wristband Pattern"),
  "Chainmail Cloak Pattern": component("Chain Mail Cloak Pattern"),
  "Chainmail Coif Pattern": component("Chain Mail Coif Pattern"),
  "Chainmail Glove Pattern": component("Chain Mail Gauntlet Pattern"),
  "Chainmail Mantle Pattern": component("Chain Mail Mantle Pattern"),
  "Chainmail Neckguard Pattern": component("Chain Mail Gorget Pattern"),
  "Chainmail Pant Pattern": component("Chain Mail Chausses Pattern"),
  "Chainmail Skirt Pattern": component("Chain Mail Girdle Pattern"),
  "Chainmail Sleeve Pattern": component("Chain Mail Sleeve Pattern"),
  "Chainmail Tunic Pattern": component("Chain Mail Hauberk Pattern"),
  "Chainmail Veil Pattern": component("Chain Mail Visor Pattern"),
  "Chainmail Arms Template Pattern": component("Chain Mail Sleeve Template"),
  "Chainmail Belt Template Pattern": component("Chain Mail Girdle Template"),
  "Chainmail Boots Template Pattern": component("Chain Mail Boots Template"),
  "Chainmail Bracer Template Pattern": component("Chain Mail Bracer Template"),
  "Chainmail Chestguard Template Pattern": component("Chain Mail Hauberk Template"),
  "Chainmail Cloak Template Pattern": component("Chain Mail Cloak Template"),
  "Chainmail Coif Template Pattern": component("Chain Mail Coif Template"),
  "Chainmail Collar Template Pattern": component("Chain Mail Collar Template"),
  "Chainmail Faceguard Template Pattern": component("Chain Mail Visor Template"),
  "Chainmail Gloves Template Pattern": component("Chain Mail Gauntlet Template"),
  "Chainmail Legplates Template Pattern": component("Chain Mail Chausses Template"),
  "Chainmail Spaulders Template Pattern": component("Chain Mail Pauldron Template"),
  "Leather Gloves Template Pattern": component("Tanned Leather Glove Template"),
  "Leather Leggings Template Pattern": component("Tanned Leather Legguard Template"),
  "Leather Shoulderpads Template Pattern": component("Tanned Leather Mantle Template"),
  "Leather Sleeves Template Pattern": component("Tanned Leather Sleeve Template"),
  "Leather Wristbands Template Pattern": component("Tanned Leather Wristband Template"),
  "Silk Shoulderpad Template Pattern": component("Silk Mantle Template"),
  "Backpack Pattern": component("Rucksack Pattern"),

  // ── Components: reagents and preparations ──────────────────────────────────────
  "Metal Tempering Chemicals": component("Metal Hardening Salt"),
  "Silk Curing Chemicals": component("Silk Curing Salt"),
  "Tanning Chemicals": component("Tanning Salt"),
  "Baking Spirits": component("Baking Spirit"),
  Hops: component("Hop Flower"),
  Shotglass: component("Dram Glass"),
  "Mammoth's Hide": component("Mammoth Hide"),
  "Koalindl Fish": component("Shorewalker Crab", "follows Koalindl -> a_great_shorewalker_crab"),
  "Sullied Spinneret Fluid": component("Soured Spinneret Fluid"),
  "Enchanted Wisp Globe": component("Bound Wisp Globe"),
  "Elven Blood": component("Silvan Blood"),
  "Packet of Kiola Sap": component("Packet of Reedwood Sap"),
  "Water of Povar": component("Water of the Deepwell"),
  "Blood of Velious": component("Blood of Frostreach"),
  "Breath of Solusek": component("Breath of Sunforge"),
  "The Scent of Marr": component("The Scent of Harmony"),
  "Glove of Rallos Zek": component("Gauntlet of the Iron Hearth"),

  // ── Components: research pages ─────────────────────────────────────────────────
  // `Words of X` is a family and stays one; `words` is coined, so it becomes `Litany`.
  "Words of Anthology": component("Litany of Anthology"),
  "Words of Cazic-Thule": component("Litany of the Fear Warden"),
  "Words of Derivation": component("Litany of Derivation"),
  "Words of Dissolution": component("Litany of Dissolution"),
  "Words of Eradication": component("Litany of Eradication"),
  "Words of Imitation": component("Litany of Imitation"),
  "Words of Materials": component("Litany of Matter"),
  "Words of Possession": component("Litany of Possession"),
  "Words of Projection": component("Litany of Projection"),
  "Words of Reviviscence": component("Litany of Reviviscence"),
  "Words of Tyranny": component("Litany of Tyranny"),
  "Words of the Element": component("Litany of the Element"),
  "Words of the Incorporeal": component("Litany of the Incorporeal"),
  "Words of the Quickening": component("Litany of Haste"),
  "Words of the Sentient (Azia)": component("Litany of the Sentient (First Part)"),
  "Part of Tasarin's Grimoire Pg. 23": component("Part of the Ashen Codex Pg. 23"),
  "Part of Tasarin's Grimoire Pg. 24": component("Part of the Ashen Codex Pg. 24"),
  "Part of Tasarin's Grimoire Pg. 26": component("Part of the Ashen Codex Pg. 26"),
  "Velishoul's Tome Pg.43": component("Whitlock's Tome Pg.43"),
  "Velishoul's Tome Pg.44": component("Whitlock's Tome Pg.44"),

  // ── Scrolls: songs ─────────────────────────────────────────────────────────────
  // EverQuest's bards keep their compositions; the composers become Eltanian. One source
  // composer maps to one replacement, so Denon's three songs stay Denholm's three.
  "Song: Alenia's Disenchanting Melody": scroll("Song: Aleine's Unbinding Melody"),
  "Song: Brusco's Boastful Bellow": scroll("Song: Brannoc's Boastful Bellow"),
  "Song: Cassindra's Chorus of Clarity": scroll("Song: Cassinde's Chorus of Clarity"),
  "Song: Chords of Dissonance": scroll("Song: Cadence of Dissonance"),
  "Song: Denon's Desperate Dirge": scroll("Song: Denholm's Desperate Dirge"),
  "Song: Denon's Disruptive Discord": scroll("Song: Denholm's Disruptive Discord"),
  "Song: Denon's Dissension": scroll("Song: Denholm's Dissension"),
  "Song: Elemental Rhythms": scroll("Song: Elemental Cadence"),
  "Song: Fufil's Curtailing Chant": scroll("Song: Fenwick's Curbing Chant"),
  "Song: Guardian Rhythms": scroll("Song: Guardian Cadence"),
  "Song: Jaxan's Jig o' Vigor": scroll("Song: Jaxen's Jig of Vigor"),
  "Song: Jonthan's Provocation": scroll("Song: Jonwyn's Provocation"),
  "Song: Jonthan's Whistling Warsong": scroll("Song: Jonwyn's Whistling War Chant"),
  "Song: Largo's Melodic Binding": scroll("Song: Lorcan's Melodic Binding"),
  "Song: Lyssa's Locating Lyric": scroll("Song: Lysenne's Seeking Lyric"),
  "Song: McVaxius Berserker Crescendo": scroll("Song: Marcaxis Berserker Crescendo"),
  "Song: Niv's Melody of Preservation": scroll("Song: Nivelle's Melody of Preservation"),
  "Song: Purifying Rhythms": scroll("Song: Cleansing Cadence"),
  "Song: Selo's Accelerando": scroll("Song: Selorne's Accelerando"),
  "Song: Tuyen's Chant of Flame": scroll("Song: Tuvane's Chant of Flame"),
  "Song: Tuyen's Chant of Frost": scroll("Song: Tuvane's Chant of Frost"),
  "Song: Verses of Victory": scroll("Song: Verse of Victory"),
  "Song: Vilia's Verses of Celerity": scroll("Song: Vellara's Verse of Celerity"),

  // ── Scrolls: spells ────────────────────────────────────────────────────────────
  // `Summoned` and `Summoning` are both coined, so the conjuration lines become `the
  // Bound` and `Calling`, and the four Symbol spells take Eltanian places instead of
  // EverQuest cities.
  "Spell: Adorning Grace": scroll("Spell: Grace of Adornment"),
  "Spell: Banish Summoned": scroll("Spell: Banish the Bound"),
  "Spell: Dismiss Summoned": scroll("Spell: Dismiss the Bound"),
  "Spell: Expel Summoned": scroll("Spell: Expel the Bound"),
  "Spell: Expulse Summoned": scroll("Spell: Expulse the Bound"),
  "Spell: Sense Summoned": scroll("Spell: Sense the Bound"),
  "Spell: Ward Summoned": scroll("Spell: Ward the Bound"),
  "Spell: Barbcoat": scroll("Spell: Coat of Thorn"),
  "Spell: Thistlecoat": scroll("Spell: Coat of Thistle"),
  "Spell: Beguile Animals": scroll("Spell: Beguile Beast"),
  "Spell: Charm Animals": scroll("Spell: Charm Beast"),
  "Spell: Sense Animals": scroll("Spell: Sense Beast"),
  "Spell: Invisibility vs Animals": scroll("Spell: Invisibility to Beast"),
  "Spell: Bonds of Force": scroll("Spell: Bond of Force"),
  "Spell: Burnout III": scroll("Spell: Greater Burnout"),
  "Spell: Rune III": scroll("Spell: Greater Rune"),
  "Spell: Cajoling Whispers": scroll("Spell: Cajoling Whisper"),
  "Spell: Dance of the Fireflies": scroll("Spell: Dance of the Firefly"),
  "Spell: Dyn`s Dizzying Draught": scroll("Spell: Dunwyn's Reeling Draught"),
  "Spell: Ebbing Strength": scroll("Spell: Waning Strength"),
  "Spell: Elementalkin: Air": scroll("Spell: Elemental Sprite: Air"),
  "Spell: Elementalkin: Earth": scroll("Spell: Elemental Sprite: Earth"),
  "Spell: Elementalkin: Fire": scroll("Spell: Elemental Sprite: Fire"),
  "Spell: Elementalkin: Water": scroll("Spell: Elemental Sprite: Water"),
  "Spell: Elementaling: Air": scroll("Spell: Elemental Servant: Air"),
  "Spell: Elementaling: Earth": scroll("Spell: Elemental Servant: Earth"),
  "Spell: Elementaling: Fire": scroll("Spell: Elemental Servant: Fire"),
  "Spell: Elementaling: Water": scroll("Spell: Elemental Servant: Water"),
  "Spell: Minor Summoning: Water": scroll("Spell: Minor Calling: Water"),
  "Spell: Lesser Summoning: Air": scroll("Spell: Lesser Calling: Air"),
  "Spell: Summoning: Earth": scroll("Spell: Calling: Earth"),
  "Spell: Greater Summoning: Air": scroll("Spell: Greater Calling: Air"),
  "Spell: Greater Summoning: Fire": scroll("Spell: Greater Calling: Fire"),
  "Spell: Renew Summoning": scroll("Spell: Renew Calling"),
  "Spell: Renew Elements": scroll("Spell: Renew Element"),
  "Spell: Eye of Zomm": scroll("Spell: Eye of the Watcher"),
  "Spell: Eyes of the Cat": scroll("Spell: Eye of the Cat"),
  "Spell: Feet like Cat": scroll("Spell: Tread of the Cat"),
  "Spell: Fingers of Fire": scroll("Spell: Finger of Fire"),
  "Spell: Firefist": scroll("Spell: Fist of Fire"),
  "Spell: Firestorm": scroll("Spell: Storm of Fire"),
  "Spell: Frost Spiral of Al'Kabor": scroll("Spell: Frost Spiral of the Collegium"),
  "Spell: Grasping Roots": scroll("Spell: Grasping Root"),
  "Spell: Icestrike": scroll("Spell: Strike of Ice"),
  "Spell: Juli`s Animation": scroll("Spell: Jorunn's Animation"),
  "Spell: Pendril's Animation": scroll("Spell: Pertwee's Animation"),
  "Spell: Leatherskin": scroll("Spell: Skin of Leather"),
  "Spell: Steelskin": scroll("Spell: Skin of Steel"),
  "Spell: Shieldskin": scroll("Spell: Shielding Skin"),
  "Spell: Malaisement": scroll("Spell: Deepening Malaise"),
  "Spell: O`Keil's Radiation": scroll("Spell: Ollery's Radiance"),
  "Spell: Rain of Blades": scroll("Spell: Bladefall"),
  "Spell: Rain of Spikes": scroll("Spell: Spikefall"),
  "Spell: Rain of Swords": scroll("Spell: Swordfall"),
  "Spell: Shock of Blades": scroll("Spell: Shock of the Blade"),
  "Spell: Shock of Spikes": scroll("Spell: Shock of the Spike"),
  "Spell: Shock of Swords": scroll("Spell: Shock of the Sword"),
  "Spell: Reoccurring Amnesia": scroll("Spell: Recurring Amnesia"),
  "Spell: Shield of Thistles": scroll("Spell: Shield of Thistle"),
  "Spell: Shield of Words": scroll("Spell: Shield of the Word"),
  "Spell: Summon Bandages": scroll("Spell: Summon Bandage"),
  "Spell: Symbol of Naltron": scroll("Spell: Symbol of Alderhollow"),
  "Spell: Symbol of Pinzarn": scroll("Spell: Symbol of Lowharbor"),
  "Spell: Symbol of Ryltan": scroll("Spell: Symbol of Crownward"),
  "Spell: Symbol of Transal": scroll("Spell: Symbol of Greymarch"),
  "Spell: Tashan": scroll("Spell: Sunder Ward"),
  "Spell: Tashani": scroll("Spell: Greater Sunder Ward"),
  "Spell: Tishan's Clash": scroll("Spell: Tessarin's Clash"),
  "Spell: Treeform": scroll("Spell: Form of the Tree"),
  "Spell: Word of Souls": scroll("Spell: Word of the Soul"),
  "Spell: Yaulp": scroll("Spell: War Cry"),
  "Spell: Yaulp II": scroll("Spell: Greater War Cry"),
  "Spell: Yaulp III": scroll("Spell: Grand War Cry"),
};
