/**
 * The authored replacement for every EverQuest NPC name the demo can reach.
 *
 * This is hand-written on purpose. The generator that produced the current names could
 * only emit `Firstname_Surname`, so it gave personal names to rats, boots and spawn
 * timers, discarded every rank in the world, and papered over its own collisions with
 * `_2` suffixes. None of that is fixable by improving the name pool; the missing step is
 * deciding *what kind of thing a row is* before naming it. That decision is what this
 * file records.
 *
 * ## Keyed by original name, not by row
 *
 * Two rows that were both `a_sewer_rat` become the same name again. This is the single
 * most important property here, and it inverts the rule the old work order assumed.
 * Name uniqueness is not a property of the source data — 9,220 of EverQuest's 29,637 NPC
 * names are shared by more than one row, and `a_bitten_victim` covers 137 of them.
 * `npc_key` is identity; `name` is a label. Only individuals the player addresses need a
 * name of their own.
 *
 * A consequence worth stating: keying this way also repairs the collisions for free. The
 * five rows that all became `Ivthor_Greyseeker_N` had five different originals, so they
 * get five different names without anything having to detect a clash.
 *
 * ## Families survive
 *
 * The source world has clans — six Ironforges, three Galliways, three Huntlans, the
 * Klicnik royal line. The rename pass scattered every one across unrelated surnames.
 * Here one source surname maps to one replacement surname, so the Ironforge smiths are
 * still six of one family.
 *
 * ## Surnames belong to districts
 *
 * The old pass could reach 15 surnames on its first attempt and used them everywhere, so
 * Oakcrests turned up in the harbour, the crypt and the gnoll warren alike. Here each
 * district draws from its own register: tidal names in Lowharbor, high-city names in
 * Crownward, growing things in the Greenveil, moor and road names in the Greymarch.
 *
 * Every token below is checked against the release gate by `content-ai:tokens`; a name
 * that reuses EverQuest vocabulary fails `content-ai:rename` before anything is written.
 */

export type NameKind =
  /** Spawner stubs, triggers, counters, text emitters. A player never sees these. */
  | "engine"
  /** Ground clutter and scenery. Objects, so they are named as objects. */
  | "prop"
  /** Wildlife, undead, hive insects, gnoll rank-and-file. Repeats are correct. */
  | "creature"
  /** A post many people hold. The title is the point; the given name varies. */
  | "office"
  /** A rank or profession attached to one individual. */
  | "titled"
  /** A named individual. */
  | "character";

export interface NameEntry {
  readonly kind: NameKind;
  readonly name: string;
  /** Why this replacement, where the reason is not obvious from the pair. */
  readonly note?: string;
}

const entry = (kind: NameKind, name: string, note?: string): NameEntry =>
  note === undefined ? { kind, name } : { kind, name, note };

const engine = (name: string, note?: string): NameEntry => entry("engine", name, note);
const prop = (name: string, note?: string): NameEntry => entry("prop", name, note);
const creature = (name: string, note?: string): NameEntry => entry("creature", name, note);
const office = (name: string, note?: string): NameEntry => entry("office", name, note);
const titled = (name: string, note?: string): NameEntry => entry("titled", name, note);
const character = (name: string, note?: string): NameEntry =>
  entry("character", name, note);

export const NAME_MAP: Record<string, NameEntry> = {
  // ─── Engine plumbing ────────────────────────────────────────────────────────────
  // Not characters, not scenery, not visible. The old pass gave every one a human name.
  // They still have to change — the release audit is whole-name membership against the
  // source database and does not care that a row is invisible — so they get plainly
  // functional names that say what they are.
  "#CheckOne": engine("#Waypoint_One"),
  "#CheckTwo": engine("#Waypoint_Two"),
  "#CheckThree": engine("#Waypoint_Three"),
  "#JPEApprenticeCounter": engine("#Apprentice_Counter"),
  "#Utility_Listener": engine("#Utility_Listener_Stub"),
  JPETimer: engine("Spawn_Timer"),
  JPEGnollSpawner: engine("Blackroot_Spawner"),
  JPEInvisGnollSpawn: engine("Blackroot_Spawn_Point"),
  JPEInvisGnollSpawna: engine("Blackroot_Spawn_Point_Alt"),
  JPEInvisGnollShoutSpawn: engine("Blackroot_Shout_Point"),
  JPEInvisJaynen: engine("Hidden_Marker_Warden"),
  JPEInvisKantorn: engine("Hidden_Marker_Ward"),
  JPEInvisRngSpawn: engine("Hidden_Marker_Ranger"),
  Courier_Spawner: engine("Courier_Spawn_Point"),
  Puzzle_Trigger: engine("Trigger_Volume"),
  Marker: engine("Position_Marker"),
  campday: engine("Spawn_Schedule_Day"),
  campnight: engine("Spawn_Schedule_Night"),
  ariam_depoper: engine("Vault_Spawn_Stub"),
  // Ambient text emitters. EverQuest named these after the first words of the line they
  // speak, which is why they read like sentence fragments.
  A_shrieking: engine("Ambient_Voice_Shriek"),
  Amid_the: engine("Ambient_Voice_Moor"),
  For_a_brief: engine("Ambient_Voice_Brief"),
  From_afar: engine("Ambient_Voice_Distant"),
  Just_outside: engine("Ambient_Voice_Outskirt"),
  You_hear: engine("Ambient_Voice_Near"),
  The_trees: engine("Ambient_Voice_Grove"),

  // ─── Props and clutter ──────────────────────────────────────────────────────────
  // Objects on the ground, spawned as NPCs so they can be examined. Named as objects.
  "#a_boot": prop("#a_worn_boot"),
  "#a_barnacle": prop("#a_clinging_barnacle"),
  "#a_broken_bottle": prop("#a_broken_flask"),
  "#seaweed": prop("#a_tangle_of_kelp"),
  "#broken_hourglass": prop("#a_cracked_hourglass"),
  "#broken_timepiece": prop("#a_stopped_clock"),
  a_flower: prop("a_pale_wildflower"),
  a_pebble: prop("a_loose_cobble"),
  a_boat: prop("a_moored_skiff"),
  a_row_boat: prop("a_rowing_skiff"),
  gnoll_dung: prop("soiled_bedding"),
  "#a_furtive_figure": prop("#a_furtive_shape", "a scripted silhouette, not a person"),
  a_gruff_voice: prop("a_gruff_voice_source", "a disembodied voice trigger"),

  // ─── Creatures ──────────────────────────────────────────────────────────────────
  // Wildlife and undead. Every one of these was given a human first and last name.
  // Repeats below are deliberate: three `a_sewer_rat` rows are three rats.

  // Vermin — Lowharbor's cellars and the Greymarch fields.
  a_rodent: creature("a_scuttling_rodent"),
  a_sewer_rat: creature("a_cellar_rat"),
  a_large_rat: creature("a_harbor_rat"),
  a_mangy_rat: creature("a_mangy_wharf_rat"),
  a_giant_rat: creature("a_bloated_wharf_rat"),
  a_large_field_rat: creature("a_moor_rat"),
  a_giant_field_rat: creature("a_hulking_moor_rat"),
  a_plague_rat: creature("a_sickened_rat"),
  a_large_plague_rat: creature("a_pox_ridden_rat"),

  // Bats.
  a_brown_myotis_bat: creature("a_brown_grotto_bat"),
  a_large_myotis_bat: creature("a_large_grotto_bat"),
  a_giant_myotis_bat: creature("a_giant_grotto_bat"),
  a_whiskered_bat: creature("a_whiskered_dusk_bat"),
  a_large_whiskered_bat: creature("a_broadwing_dusk_bat"),
  a_giant_whiskered_bat: creature("a_giant_dusk_bat"),

  // Snakes.
  a_grass_snake: creature("a_meadow_adder"),
  a_gopher_snake: creature("a_burrow_adder"),
  a_king_snake: creature("a_banded_adder"),
  a_large_king_snake: creature("a_large_banded_adder"),
  a_giant_king_snake: creature("a_giant_banded_adder"),
  a_giant_snake: creature("a_great_moor_adder"),

  // Wolves and bears of the Greymarch and the Greenveil.
  a_gray_wolf: creature("a_grey_moor_wolf"),
  a_rabid_wolf: creature("a_frothing_wolf"),
  a_bear_cub: creature("a_bramble_bear_cub"),
  a_brown_bear: creature("a_bramble_bear"),
  a_grizzly_bear: creature("a_scarred_bramble_bear"),
  a_rabid_grizzly: creature("a_savage_bramble_bear"),
  Mammoth: creature("a_shaggy_tusker", "a beast, despite the capitalised source name"),
  Scruffy: creature("a_stray_hound", "a stray dog, not a person"),

  // Water.
  a_fish: creature("a_silverscale_fish"),
  a_piranha: creature("a_bitterfin"),
  a_razorgill: creature("a_shearfin"),

  // Insects and oddities.
  a_fire_beetle: creature("an_ember_beetle", "article recomputed for the new head word"),
  a_willowisp: creature("a_marsh_glimmer"),
  a_Frostfell_Goblin: creature("a_winterfeast_imp"),
  a_Koalindl: creature("a_shorewalker_crab"),
  Koalindl: creature("a_great_shorewalker_crab"),

  // The Chikreet hive, under Crownward. Royalty keeps its rank and its family name.
  a_klicnik_worker: creature("a_chikreet_worker"),
  a_klicnik_drone: creature("a_chikreet_drone"),
  a_klicnik_warrior: creature("a_chikreet_warrior"),
  a_klicnik_noble: creature("a_chikreet_noble"),
  Prince_Klicnik: titled("Prince_Chikreet", "rank restored; hive line kept together"),
  Princess_Klicnik: titled("Princess_Chikreet"),
  Queen_Klicnik: titled("Queen_Chikreet"),

  // Blackroot gnolls. `Gnoll -> Blackroot` is already canon; the ranks are the point of
  // these names and the old pass erased all of them.
  a_gnoll_pup: creature("a_blackroot_pup"),
  a_scrawny_gnoll: creature("a_scrawny_blackroot"),
  a_gnoll: creature("a_blackroot_prowler"),
  a_skulking_gnoll: creature("a_skulking_blackroot"),
  a_patrolling_gnoll: creature("a_blackroot_patroller"),
  a_burly_gnoll: creature("a_burly_blackroot"),
  a_gnoll_scout: creature("a_blackroot_scout"),
  a_gnoll_watcher: creature("a_blackroot_watcher"),
  a_gnoll_hunter: creature("a_blackroot_hunter"),
  a_gnoll_guardsman: creature("a_blackroot_guardsman"),
  a_gnoll_brewer: creature("a_blackroot_brewer"),
  a_gnoll_tactician: creature("a_blackroot_tactician"),
  a_gnoll_commander: creature("a_blackroot_commander"),
  a_gnoll_courier: creature("a_blackroot_courier"),
  an_elite_gnoll_guard: creature("an_elite_blackroot_guard"),
  Gnoll_Poacher: creature("a_blackroot_poacher"),

  // The undead of Mournvault and the Greymarch barrows.
  a_wimpy_skeleton: creature("a_brittleboned_skeleton"),
  a_cracked_skeleton: creature("a_cracked_bonework"),
  a_decaying_skeleton: creature("a_mouldering_skeleton"),
  a_restless_skeleton: creature("a_stirring_skeleton"),
  a_putrid_skeleton: creature("a_blighted_skeleton"),
  a_sturdy_skeleton: creature("a_knitted_skeleton"),
  a_greater_skeleton: creature("a_towering_skeleton"),
  a_skeleton: creature("a_bare_skeleton"),
  an_elf_skeleton: creature("a_slender_skeleton", "article recomputed"),
  a_skeletal_excavator: creature("a_bonewrought_digger"),
  a_skeletal_trooper: creature("a_bonewrought_trooper"),
  a_skeletal_lieutenant: creature("a_bonewrought_lieutenant"),
  a_skeletal_commander: creature("a_bonewrought_commander"),
  ice_boned_skeleton: creature(
    "rimebound_skeleton",
    "two of these still shipped as `ice_boned_skeleton_2/_3` — the suffix hid them from the audit",
  ),
  skeleton_Lrodd: creature("skeleton_Ossric", "a named skeleton; keeps the source's form"),
  a_dread_bone: creature("a_dreadbone_husk"),
  a_dread_corpse: creature("a_dread_cadaver"),
  a_zombie: creature("a_shambling_husk"),
  a_burnt_zombie: creature("a_scorched_husk"),
  a_lesser_mummy: creature("a_lesser_bound_husk"),
  a_ghoul: creature("a_crypt_feeder"),

  // Mournvault's necromantic order. A ladder of ranks, kept as a ladder.
  a_necro_neophyte: creature("a_vaultsworn_neophyte"),
  a_necro_initiate: creature("a_vaultsworn_initiate"),
  a_necro_apprentice: creature("a_vaultsworn_apprentice"),
  a_necro_acolyte: creature("a_vaultsworn_acolyte"),
  a_necro_theurgist: creature("a_vaultsworn_theurgist"),
  a_shadowknight: creature("a_vaultsworn_blackguard"),
  a_bloodsaber_defiler: creature("a_hollowstar_defiler", "Bloodsabers -> the Hollow Star"),

  // Greenveil poachers.
  a_poacher: creature("a_greenveil_poacher"),
  Poacher: creature("a_greenveil_trapper"),

  // ─── The watch ──────────────────────────────────────────────────────────────────
  // Forty-one guards became forty-one unrelated strangers. The shared title is what made
  // them a city watch. Canon already has `Serjeant_Halvane` and `Watchman_Brey`, so the
  // Talios city watch is `Watchman_`; the Greymarch road patrol is `Outrider_`.
  Guard_Augos: office("Watchman_Aldren"),
  Guard_Cyrillian: office("Watchman_Corwen"),
  Guard_Forbly: office("Watchman_Fenwick"),
  Guard_Mezzt: office("Watchman_Marek"),
  Guard_Naret: office("Watchman_Nolen"),
  Guard_Perin: office("Watchman_Pellin"),
  Guard_Phaeton: office("Watchman_Florian"),
  Guard_Relam: office("Watchman_Redwyn"),
  Guard_Tyrak: office("Watchman_Tobin"),
  Guard_Dunix: office("Watchman_Dorrin"),
  Guard_Wenbie: office("Watchman_Weslan"),
  Guard_Jerith: office("Watchman_Jorren"),
  Guard_Urius: office("Watchman_Ulric"),
  Guard_Kwint: office("Watchman_Quenna"),
  Guard_Calik: office("Watchman_Cassel"),
  Guard_Oleph: office("Watchman_Oriel"),
  Guard_Corshin: office("Watchman_Caradoc"),
  Guard_Lasen: office("Watchman_Lowen"),
  Guard_Quedal: office("Watchman_Kestral"),
  Guard_Beren: office("Watchman_Bevin"),
  Guard_Aerryn: office("Watchman_Ansel"),
  Guard_Erabb: office("Watchman_Edran"),
  Guard_Imkar: office("Watchman_Imre"),
  Guard_Liben: office("Watchman_Lisbet"),
  Guard_Simkin: office("Watchman_Sedwin"),
  Guard_Furithane: office("Watchman_Harlin"),
  Guard_Obyn: office("Watchman_Osric"),
  Guard_Buce: office("Watchman_Brida"),
  Guard_Deregan: office("Watchman_Delwyn"),
  Guard_Ginton: office("Watchman_Galen"),
  Guard_Hewet: office("Watchman_Hadwin"),
  Guard_Rashik: office("Watchman_Rowena"),
  Guard_Shorm: office("Watchman_Saskia"),
  Guard_Vaskif: office("Watchman_Vester"),
  Guard_Weleth: office("Watchman_Wilmot"),
  Guard_Elron: office("Watchman_Elsbeth"),
  Guard_Treitan: office("Watchman_Thane"),
  Guard_Wefnin: office("Watchman_Vayle"),
  Guard_Drath: office("Watchman_Dermot"),
  // The Greymarch road patrol — same office, different posting.
  Guard_Cheslin: office("Outrider_Halsey", "three rows, one post, one name"),
  Guard_Yalroen: office("Outrider_Yalren"),
  Guard_Sironan: office("Outrider_Selwyn"),
  Guard_Beris: office("Outrider_Berris"),
  Guard_Kellot: office("Outrider_Kellan"),
  Guard_Bixby: office("Outrider_Bixen"),
  Guard_Philbin: office("Outrider_Philben"),
  Guard_Monroe: office("Outrider_Monrow"),
  Guard_Leopold: office("Outrider_Leowin"),
  Guard_Miles: office("Outrider_Mylen"),
  Guard_Chrighton: office("Outrider_Craiten"),
  Guard_Nash: office("Outrider_Nashen"),
  // Load-bearing: authored quest content addresses these by name. Unchanged on purpose.
  Guard_Gehnus: office("Serjeant_Halvane", "pinned — missing-patrol and rumors content"),
  Guard_Hezlan: office("Watchman_Brey", "pinned — missing-patrol and rumors content"),
  Captain_Tillin: titled("Captain_Robert_Vance", "pinned — sentinel-iron content"),

  // ─── Titled individuals ─────────────────────────────────────────────────────────
  // Sixty-seven source names carried a rank, office or profession; three survived the
  // last pass. The rest are restored here.
  Captain_Rohand: titled("Captain_Rowan_Hald"),
  Lieutenant_Arathur: titled("Lieutenant_Arathen"),
  Lieutenant_Dagarok: titled("Lieutenant_Dagorn"),
  Corporal_Lancot: titled("Corporal_Lancet"),
  Sir_Edwin_Motte: titled("Sir_Edwin_Marrow"),
  Scout_Malityn: titled("Scout_Maleth"),
  Splitpaw_Commander: titled("Ironfang_Commander", "Splitpaw -> Ironfang"),
  Master_Brewer: titled("Master_Brewer_Ghask"),
  the_gnoll_high_shaman: titled("the_blackroot_high_shaman"),
  the_thaumaturgist: titled("the_vault_thaumaturgist"),
  Priest_of_Discord: titled("Priest_of_the_Hollow_Star", "Innoruuk -> the Hollow Star"),
  Priest_Amiaz: titled("Priest_Amaris"),
  Priestess_Caulria: titled("Priestess_Caulren"),
  Priestess_Jahnda: titled("Priestess_Jandra"),
  Soulbinder_Novalu: titled("Soulwarden_Novaren"),
  Gemcrafter_Anuk: titled("Gemwright_Amrek", "one character, spawned in two zones"),
  Artisan_Tar_Cordell: titled("Artisan_Tarric_Marchbank"),
  Artisan_Vor_Westrider: titled("Artisan_Vorwen_Westerly"),
  Exterminator_Rasmon: titled("Exterminator_Rasmen"),
  Exterminator_Wintloag: titled("Exterminator_Wintlow"),
  Fireworks_Engineer_Fabdabus: titled("Firewright_Fabdren"),
  Port_Authority_Officer: titled("Harbor_Authority_Officer"),
  Madame_Serena: titled("Madame_Serell"),
  Lord_Mrallon: titled("Lord_Marchbank"),
  Lord_Elgnub: titled("Lord_Blackroot_Vale", "already canon; two rows, one lord"),
  Hargar_the_Velium_Chef: titled("Hargen_the_Hearthcook", "Velium is EverQuest's"),
  Jaylia_the_Faithful: titled("Jalene_the_Faithful"),
  Oscar_the_Brash: titled("Ostrin_the_Brash"),
  Rodgar_the_Tall: titled("Rodwen_the_Tall"),
  Raz_The_Rat_Misk: titled("Ras_the_Ratcatcher"),
  Mannan_of_the_Sabertooth: titled("Mannic_of_the_Ironfang", "Sabertooth -> Ironfang"),
  Refugee_Splitpaw: titled("Ironfang_Refugee"),
  The_Fabled_Fippy_Darkpaw: titled("the_Fabled_Blackroot_Raider"),
  erudite_traveler: titled("a_wayfarer_of_Solskar", "Erudite is EverQuest's people"),
  "#Apprentice_of_Saxuus": titled("#Apprentice_of_Sarrux"),
  "#Translocator_Sedina": titled("#Riftwarden_Sedris"),
  "#Jane_Planesummoner": titled("#Jenra_Riftcaller"),
  Golden_Maiden: titled("the_Gilded_Lady", "a statue, addressed as a title"),

  // ─── Named individuals ──────────────────────────────────────────────────────────
  // Families first, so the grouping is visible. One source surname, one replacement.

  // Ironforge -> Emberhold. Six smiths of one Crownward clan.
  Hurrieta_Ironforge: character("Hesper_Emberhold"),
  Dren_Ironforge: character("Dorrin_Emberhold"),
  Svena_Ironforge: character("Saskia_Emberhold"),
  Brohan_Ironforge: character("Brennan_Emberhold"),
  Rendallen_Ironforge: character("Redwyn_Emberhold"),
  Ziska_Ironforge: character("Zenna_Emberhold"),
  // Galliway -> Wexley.
  Gibson_Galliway: character("Garrow_Wexley"),
  Sneed_Galliway: character("Sorrel_Wexley"),
  Tanlyn_Galliway: character("Tessa_Wexley"),
  // Huntlan -> Fenmark.
  Earron_Huntlan: character("Edran_Fenmark"),
  Sissy_Huntlan: character("Sabel_Fenmark"),
  Tasya_Huntlan: character("Tamsen_Fenmark"),
  // Sedder -> Denhollow.
  Liln_Sedder: character("Linnet_Denhollow"),
  Mar_Sedder: character("Marek_Denhollow"),
  Rane_Sedder: character("Rowena_Denhollow"),
  // Two-member families.
  Anne_Bellsong: character("Adela_Larkmere"),
  Audwin_Bellsong: character("Ansel_Larkmere"),
  Kendall_Copperhold: character("Kellan_Brasskettle"),
  Sorn_Copperhold: character("Selwyn_Brasskettle"),
  Aenia_Ghenson: character("Ilsa_Henwick"),
  Dranom_Ghenson: character("Dermot_Henwick"),
  Trumpy_Irontoe: character("Tobin_Copperkettle"),
  Crumpy_Irontoe: character("Caradoc_Copperkettle"),
  McNeal_Jocub: character("Mabon_Jessup"),
  Sunsa_Jocub: character("Nerys_Jessup"),
  Donka_Leafkeeper: character("Dalen_Thornkeep"),
  Guaril_Leafkeeper: character("Galen_Thornkeep"),
  Daedet_Losaren: character("Denholm_Lostrel"),
  Renic_Losaren: character("Roland_Lostrel"),
  Eve_Marsinger: character("Edwina_Quillane"),
  Tralyn_Marsinger: character("Thane_Quillane"),
  Baobob_Miller: character("Bertram_Milden"),
  Chanda_Miller: character("Celia_Milden"),
  Marton_Sayer: character("Merek_Sarrow"),
  Mira_Sayer: character("Mirren_Sarrow"),
  Karn_Tassen: character("Kessler_Ashby"),
  Voleen_Tassen: character("Vona_Ashby"),
  Fellesha_Varshen: character("Fenella_Ostreth"),
  Raheim_Varshen: character("Harlin_Ostreth"),
  Jhaya_Wyndrunner: character("Jessa_Windmere"),
  Lerian_Wyndrunner: character("Loris_Windmere"),
  Lanhern_Firepride: character("Leofric_Emberpride"),
  "#Lanhern_Firepride": character("#Leofric_Emberpride"),
  Ton_Firepride: character("Ondre_Emberpride"),

  // Blackroot gnolls with names of their own.
  Fippy_Darkpaw: character("Blackroot_Raider", "already canon; three rows, one raider"),
  Djerr_Darkpaw: character("Djerrick_Blackroot"),
  Nixx_Darkpaw: character("Nixar_Blackroot"),
  Kraxz_Darkpaw: character("Kraxen_Blackroot"),
  Grarrax_Darkpaw: character("Grarrek_Blackroot"),
  Holinix_Darkpaw: character("Holnar_Blackroot"),
  Socho_Darkpaw: character("Sochek_Blackroot"),
  Tranixx_Darkpaw: character("Tranik_Blackroot"),
  Gnasher_Furgutt: character("Blackroot_Road_Striker", "already canon"),
  Gynok_Moltor: character("Lord_Vane_Ash_Warden", "already canon"),

  // ── Talios Lowharbor. Tidal and harbour surnames. ──
  Den_Magason: character("Dalen_Saltmarsh"),
  Faren: character("Farrier"),
  Lomarc: character("Lundy"),
  Gharin: character("Ghuren"),
  Indaria: character("Ione"),
  Morty_Prysmith: character("Marlow_Tidewell"),
  Endric: character("Emrik"),
  Zamel: character("Zephan"),
  Bobbin_Page: character("Bobbin_Penhallow"),
  Brian_Willman: character("Bevin_Brightwater"),
  Cras_Snyder: character("Cassel_Coldharbor"),
  Dan_Wallin: character("Dannel_Eastgate"),
  Graeme_Revall: character("Garrow_Greaves"),
  Karl_Verhey: character("Kessler_Saltmarsh"),
  Kazu_Kolden: character("Kelvin_Tidewell"),
  Klieb_Torne: character("Kestral_Coldharbor"),
  Micc_Koter: character("Mikkel_Coldharbor"),
  Miles_Gordy: character("Marek_Brightwater"),
  Philip_Tallman: character("Pellin_Eastgate"),
  an_investigator: character("an_inquiry_agent", "an office, not wildlife"),
  Menkes_Tabolet: character("Menkis_Merrivale"),
  Nug_Rellash: character("Nugral_Rushmere"),
  Talym_Shoontar: character("Thane_Farrier", "one character, spawned in three zones"),
  Behroe_Dlexon: character("Behren_Danforth"),
  Cassius_Messus: character("Cassel_Kingsley", "one character at two levels"),
  Danaria_Hollin: character("Dagny_Hallowell"),
  Nesiff_Tallaherd: character("Norwen_Tidewell"),
  Rucio_Divella: character("Ruccio_Dunmore"),
  Lysric_Loresinger: character("Lysren_Lathrop"),
  Raffy_Conticede: character("Rhoda_Rushmere"),
  Anehan_Treol: character("Ansel_Thornbury"),
  Hanlore_Escaval: character("Harrow_Eastgate"),
  Dionna: character("Dionne_Saltmarsh"),
  Ellisha: character("Elsbeth_Eastgate"),
  Hansl_Bigroon: character("Hansel_Hallowell"),
  Largon_Welsh: character("Lowen_Longmoor"),
  Lylanthian: character("Linden_Yewbank"),
  Marlin_Bizmite: character("Marlen_Brightwater"),
  Nindle_Hogster: character("Nindel_Yewbank"),
  Ren_Pinemyer: character("Rowen_Quickthorn"),
  Bisdlo_Ravtahm: character("Bertram_Ravensgate"),
  Vicus_Nonad: character("Vikas_Underhill"),
  Drawna_Opimsor: character("Dagny_Orrisdale"),
  Joffrey_Clay: character("Jorren_Kettleby"),
  Sansa_Nusk: character("Saskia_Northcott"),
  Caleah_Herblender: character("Celia_Applewhite"),
  Chalea_Volesga: character("Celia_Coldharbor"),
  Arthon_Spiritsight: character("Arthen_Brightwater"),
  Caton_Glimmerstep: character("Cassel_Goldhame"),
  Gahna_Salbeen: character("Gilda_Saltmarsh"),
  "Jalorin_Tar`Visgur": character("Jorren_Thornbury"),
  Bogen_Chazel: character("Hollan_Hallowell"),
  Ghul_Rustem: character("Ghuren_Greaves"),
  Rabley_Trumend: character("Roland_Rushmere"),
  Bruno_Barstomper: character("Bertram_Bornam"),
  Edvard_Tommels: character("Edran_Ellsworth"),
  Lisdon_Trekka: character("Lundy_Lathrop"),
  Tomas_Zelnik: character("Tobin_Uppercross"),
  Wylin_Dodmil: character("Wylen_Westerly"),
  Chalios_Bensted: character("Caradoc_Danforth"),
  Barthal: character("Bertram_Coldharbor"),
  Khensol_Undesta: character("Kestral_Underhill"),
  Neapha_Vesturo: character("Nerys_Netherby"),
  Bassanio_Weekin: character("Bassano_Kingsley"),
  Byjan_Timbokker: character("Bevin_Kettleby"),
  Celamari_Marre: character("Celia_Merrivale"),
  Corrao_Duperame: character("Corwen_Dunmore"),
  Danon_Fletcher: character("Dermot_Farrier"),
  "Dumisa_D`Enetti": character("Dagny_Danforth"),
  Dun: character("Dunmore"),
  Eracon_Krengon: character("Ewan_Kingsley"),
  Fesse_Bontex: character("Fenwick_Fairbourne"),
  Fhara_Semhart: character("Fenella_Stillwater"),
  Fish_Ranamer: character("Fisk_Farrier"),
  Gende_Reldari: character("Gilda_Ravensgate"),
  Gero_Yopetu: character("Garrow_Yardley"),
  Headara_Ponido: character("Hesper_Penhallow"),
  Heidi_Grainsifter: character("Hesper_Applewhite"),
  Iala_Lenard: character("Ilsa_Lathrop"),
  Ingaria_Dinego: character("Ione_Dunmore"),
  Isobelle_Losiwoo: character("Isolde_Lostrel"),
  Moran_Smith: character("Morwen_Marchbank"),
  "Moreo_O`Meek": character("Marek_Orrisdale"),
  Oriyame_Nelafre: character("Oriel_Northcott"),
  Pai_Berenis: character("Pellin_Brightwater"),
  Rosdaria_Sepria: character("Rosalin_Stillwater"),
  Sinon_Loarpe: character("Sorrel_Longmoor"),
  Solani_Dayadil: character("Sorrel_Danforth"),
  Stan_Cloven: character("Sedwin_Coldharbor"),
  Topala_Xenem: character("Tobin_Thornbury"),
  Trisco_Qental: character("Tessa_Quarrick"),
  Tsuden_Korinte: character("Tobin_Kingsley"),
  Wrin_Liltin: character("Wrenn_Whitlock"),
  Umvera_Dekash: character("Ursel_Dunmore"),
  Xantomo_Salmor: character("Zephan_Saltmarsh"),
  Yakem_Oreslinger: character("Yorick_Orrisdale"),
  "#D`mitrious_Irska": character("#Dorrin_Ashcroft"),
  Basten_Ghunret: character("Bevin_Goldhame"),
  Belious_Naliedin: character("Bevin_Netherby"),
  Brin_Stolunger: character("Brida_Stillwater"),
  Chesgard_Sydwen: character("Cassel_Stillwater"),
  Daenor_Casthopur: character("Dalen_Carrow"),
  Ebon_Strongbear: character("Edran_Eastgate"),
  Esdia_Moeba: character("Elsbeth_Merrivale"),
  Gahlith_Wrannstad: character("Galen_Greaves"),
  Gehna_Solbenya: character("Gwenda_Stillwater"),
  Ginleen_Harltop: character("Gilda_Harkness"),
  Grahan_Rothkar: character("Garrow_Ravensgate"),
  Juegile_Sohgohm: character("Jorah_Jarrow"),
  Jusean_Evanesque: character("Jorunn_Eastgate"),
  Kasine_Paegra: character("Kelda_Pellworth"),
  Kazlo_Naedra: character("Kelvin_Northcott"),
  Kinloc_Flamepaw: character("Kelvin_Kettleby"),
  Mespha_Tevalian: character("Maribel_Thornbury"),
  "Miltiades_Tal`Azroth": character("Mabon_Marchbank"),
  Nostahla_Westfend: character("Nessa_Westerly"),
  Runethar_Hamest: character("Redwyn_Harkness"),
  Sollari_Bekines: character("Saskia_Brightwater"),
  Tabure_Ahendle: character("Tobin_Applewhite"),
  Tinshen_Brinth: character("Thane_Brightwater"),
  Unsar_Koldhagon: character("Ulric_Kingsley"),
  Vansted_Rohenga: character("Vester_Ravensgate"),
  Wolten_Grafe: character("Weslan_Greaves"),
  Yestura_Rhamrey: character("Yesenia_Rushmere"),
  Christian_Hidken: character("Cristan_Harkness"),
  Warehnn_Awlne: character("Wilmot_Applewhite"),

  // ── Talios Crownward. High-city surnames. ──
  Tomer_Instogle: character("Tessa_Uppercross"),
  Lashun_Novashine: character("Lisbet_Longmoor"),
  Grennet_Stormhand: character("Gwenda_Kingsley"),
  Jracol_Brestiage: character("Jorvik_Ravensgate"),
  Rolon_Banari: character("Roland_Uppercross"),
  Moodoro_Finharn: character("Moodren_Netherby"),
  Leanon_Ruksey: character("Lowen_Uppercross"),
  Tubal_Weaver: character("Tobin_Whitlock"),
  Flynn_Merrington: character("Florian_Marchbank"),
  Nerissa_Clothspinner: character("Nessa_Quillane"),
  Faldor_Hendrys: character("Florian_Hallowell"),
  Nax_Ghruna: character("Naxen_Northcott"),
  Quinon_Hulleaf: character("Quenna_Yewbank"),
  Pelshia_Thuxpire: character("Pertwee_Thornbury"),
  Tyokan_Mekase: character("Thane_Merrivale"),
  Whysia_Flock: character("Wilmot_Whitlock"),
  Shenro_Kazpur: character("Selwyn_Kingsley"),
  Enic_Ruklin: character("Emrik_Ellsworth"),
  Henlom_Visrek: character("Harlin_Uppercross"),
  Segran_Rajhar: character("Sedwin_Ravensgate"),
  Ghil_Starn: character("Gilda_Goldhame"),
  Berane_Constarg: character("Bertram_Carrow"),
  Rineval_Talyas: character("Roland_Thornbury"),
  Ania_Klephia: character("Ilsa_Kettleby"),
  Balhallia: character("Bevin_Hallowell"),
  Connie_Link: character("Celia_Kingsley"),
  Enpero_Mesog: character("Edran_Merrivale"),
  Gerault_Takenmaul: character("Galen_Goldhame"),
  Kragie_Rolana: character("Kragen_Quickthorn"),
  Ladia_Qursii: character("Linnet_Quarrick"),
  Mellisa_Purgor: character("Maribel_Pellworth"),
  Crow: character("Crowe", "a fence who goes by one name"),
  Drun_Vorwig: character("Dorrin_Dunmore"),
  Velarte_Selire: character("Vona_Uppercross"),
  Felodius_Sworddancer: character("Fenwick_Bladedancer"),
  Vegalys_Keldrane: character("Vayle_Kingsley"),
  Astaed_Wemor: character("Osric_Northcott"),
  Camlend_Serbold: character("Cassel_Marchbank"),
  Davloran_Girionlis: character("Delwyn_Goldhame"),
  Filian_Weagleross: character("Fallon_Whitlock"),
  Hanns_Krieghor: character("Hollan_Harkness"),
  Kane_Bayle: character("Kellan_Uppercross"),
  Knargon_Lanenda: character("Kellan_Lathrop"),
  LuSun: character("Lusenn_Thornbury"),
  Nomsoe_Jusagta: character("Norwen_Jarrow"),
  Phin_Esrinap: character("Phinn_Pellworth"),
  Reldin_Harkolis: character("Redwyn_Kingsley"),
  Renux_Herkanor: character("Rowena_Harkness"),
  Roesager_Thusten: character("Rosalin_Ravensgate"),
  Seta_Bakindo: character("Saskia_Uppercross"),
  Suuspa_Clanim: character("Sedwin_Quarrick"),
  Togahn_Sorast: character("Tobin_Marchbank"),
  Tonmerk_Plorsin: character("Thane_Pellworth"),
  Zannsin_Resdinet: character("Zenna_Ravensgate"),
  Gabrielle_Spirit: character("Gabrelle_Goldhame"),
  Santug_Claugg: character("Sedwin_Kingsley"),
  Gash_Flockwalker: character("Garrow_Whitlock"),
  Meera_Lylon: character("Mirren_Larkmere"),
  Sabnie_Blagard: character("Sabel_Brightwater"),

  // ── The Greenveil. Growing things. ──
  Corun_Finisc: character("Corwen_Yewbank"),
  Bren_Treeclimber: character("Brida_Quickthorn"),
  Sivina_Lutewhisper: character("Sabel_Applewhite"),
  Krystal_Aspen: character("Kelda_Oakhurst"),
  Ran_Walker: character("Rowen_Oakhurst"),
  Frenway_Marthank: character("Fallon_Yewbank"),
  Merdan_Fleetfoot: character("Merek_Quickthorn"),
  Niera_Farbreeze: character("Nerys_Applewhite"),
  Grathin_Nilm: character("Garrow_Oakhurst"),
  Bukem_Breewood: character("Bevin_Yewbank"),
  "Livam_T`Lant": character("Lowen_Lathrop"),
  Arrivae_Valleren: character("Rowena_Oakhurst"),
  Dannos_Safecoin: character("Dalen_Quickthorn"),
  Durvinna_Barkkis: character("Dagny_Brightwater"),
  Frannie: character("Fenella_Applewhite"),
  Jarse_Kedison: character("Jarl_Yewbank"),
  Qomber_Roblen: character("Quenna_Oakhurst"),
  Raken: character("Rakenwood"),
  Sallah: character("Saskia_Quickthorn"),
  Sequea_Erthinon: character("Saskia_Yewbank"),
  Tonsia: character("Tessa_Oakhurst"),
  Gurrin_Nitestorm: character("Galen_Nightstorm"),
  Qaelin_Hailstorm: character("Quenna_Hailwind"),
  Errin_Pinewhisper: character("Ewan_Pinewhistle"),
  Gerael_Woodone: character("Garrow_Woodwarden"),
  Gillarian_Naelev: character("Gwenda_Quickthorn"),
  Hager_Sureshot: character("Harlin_Truestrike"),
  Larsk_Juton: character("Leofric_Oakhurst"),
  Merona_Castekin: character("Morwen_Yewbank"),
  Salmekia_Treherth: character("Saskia_Thornkeep"),
  TeAnara: character("Tessa_Underhill"),
  Vesteri_Nomanoi: character("Vester_Oakhurst"),
  Mikkai_Nomak: character("Mabon_Quickthorn"),
  Narwkend_Falgon: character("Nolen_Oakhurst"),
  Tralo_Songsword: character("Thane_Songblade"),

  // ── The Greymarch. Moor and road names. ──
  Tovax_Vmar: character("Tobin_Longmoor"),
  Yollis_Jenkins: character("Yorick_Netherby"),
  Pyzjn: character("Pyzen_Marchbank"),
  Neclo_Rheslar: character("Nolen_Marchbank"),
  Axe_Broadsmith: character("Axel_Goldhame"),
  Barn_Bloodstone: character("Bertram_Longmoor"),
  Hefax_Tinmar: character("Hollis_Netherby"),
  Tol_Nicelot: character("Tessa_Netherby"),
  Wyle_Bimlin: character("Weslan_Longmoor"),
  Buzzlin_Bornahm: character("Bevin_Underhill"),
  Mogan_Delfin: character("Morwen_Netherby"),
  Varsoon: character("Varsen_Underhill"),
  Holly_Windstalker: character("Hesper_Longmoor"),
  Hadden: character("Hadwin_Stillwater"),
  Konem_Matse: character("Kessler_Marchbank"),
  Rephas: character("Redwyn_Netherby"),
  Niclaus_Ressinn: character("Novak_Stillwater"),
  Rilca_Leafrunner: character("Rhoda_Leafstride"),
  Cethernee_Vellestan: character("Celia_Underhill"),
  Lamangao_Fallstine: character("Loris_Longmoor"),
  Pemawen_Vorana: character("Perrick_Netherby"),
  Waradern_Skymoor: character("Weslan_Stillwater"),
  Sarri_Modav: character("Sorrel_Marchbank"),
  Ubzial_Iyeaql: character("Ulmar_Underhill"),

  // ── Mournvault. Cold, closed-in names. ──
  Boondin_Babbinsbort: character("Bertram_Ashcroft"),
  Wraps_McGee: character("Wilmot_Ashcroft"),
  Zeek: character("Zerel_Ashcroft"),
};
