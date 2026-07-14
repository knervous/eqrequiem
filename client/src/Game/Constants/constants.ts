
/* eslint-disable */

export const USE_SAGE = import.meta.env.VITE_USE_SAGE === 'true';

export const charFileRegex = /^([a-z]{3})([a-z]{2})(\d{2})(\d{2})$/;
export const clkRegex = /^clk(\d{2})(\d{2})$/;


export const pcModels = [
  'bam',
  'baf',
  'erm',
  'erf',
  'elf',
  'elm',
  'gnf',
  'gnm',
  'trf',
  'trm',
  'hum',
  'huf',
  'daf',
  'dam',
  'dwf',
  'dwm',
  'haf',
  'ikf',
  'ikm',
  'ham',
  'hif',
  'him',
  'hof',
  'hom',
  'ogm',
  'ogf',
  'kef',
  'kem',
];
export const isPlayerRace = (model: string): boolean =>
  pcModels.includes(model.toLowerCase());

// Classic city residents use distinct model ids (QCM, FPM, HHM, etc.) but
// share the playable-race face/skin texture convention. Treating them as
// non-humanoid applies their chest material to every body piece.
export const humanoidNpcRaces = new Set([
  44, // Freeport guard
  55, // Human beggar
  67, // Highpass citizen
  71, // Qeynos citizen
  77, // Neriak citizen
  78, // Erudite citizen
  81, // Rivervale citizen
  90, // Halas citizen
  92, // Grobb citizen
  93, // Oggok citizen
  94, // Kaladim citizen
  106, // Felwithe guard
  112, // Gnome guard
]);


export const MaterialPrefixes = {
  Face: 'he',
  Chest: 'ch',
  Arms: 'ua',
  Wrists: 'fa',
  Legs: 'lg',
  Hands: 'hn',
  Feet: 'ft',
  Helm: 'he',
};

export const VIEWS = {
    CHAR_SELECT: 1,
    CHAR_CREATE: 2,
}

export const Races = {
    HUMAN:     1,
    BARBARIAN: 2,
    ERUDITE:   3,
    WOODELF:   4,
    HIGHELF:   5,
    DARKELF:   6,
    HALFELF:   7,
    DWARF:     8,
    TROLL:     9,
    OGRE:     10,
    HALFLING: 11,
    GNOME:    12,
    AVIAK:    13,
    WEREWOLF: 14,
}

export const AbbreviatedRaces ={
    HUM: 1,
    BAR: 2,
    ERU: 3,
    ELF: 4,
    HIE: 5,
    DEF: 6,
    HEF: 7,
    DWF: 8,
    TRL: 9,
    OGR: 10,
    HLF: 11,
    GNM: 12,
}

export const Classes = {
    WAR: 1,
    CLR: 2,
    PAL: 3,
    RNG: 4,
    SHD: 5,
    DRU: 6,
    MNK: 7,
    BRD: 8,
    ROG: 9,
    SHM: 10,
    NEC: 11,
    WIZ: 12,
    MAG: 13,
    ENC: 14,
    BST: 15,
    BER: 16
}


// Canonical zone ids from content.character_origins. These are sent over the
// wire, so they must not use the old client-facing city-choice indices.
export const StartingZones = {
    SouthQeynos: [1, 'South Qeynos'],
    NorthQeynos: [2, 'North Qeynos'],
    SurefallGlade: [3, 'Surefall Glade'],
    NorthFreeport: [8, 'North Freeport'],
    WestFreeport: [9, 'West Freeport'],
    EastFreeport: [10, 'East Freeport'],
    GreaterFaydark: [54, 'Greater Faydark'],
    Halas: [29, 'Halas'],
    Oggok: [49, 'Oggok'],
    Grobb: [52, 'Grobb'],
    NorthKaladim: [67, 'North Kaladim'],
    SouthKaladim: [60, 'South Kaladim'],
    Paineel: [75, 'Paineel'],
    Erudin: [24, 'Erudin'],
    ErudinPalace: [23, 'Erudin Palace'],
    AkAnon: [55, 'Ak\'Anon'],
    Rivervale: [19, 'Rivervale'],
    NorthernFelwithe: [61, 'Northern Felwithe'],
    SouthernFelwithe: [62, 'Southern Felwithe'],
    QeynosAqueducts: [45, 'Qeynos Catacombs'],
    NeriakCommons: [41, 'Neriak Commons'],
    NeriakThirdGate: [42, 'Neriak Third Gate'],
}

export const CharRaceStrings = {
    [Races.HUMAN]:     3246,
    [Races.BARBARIAN]: 3239,
    [Races.ERUDITE]:   3242,
    [Races.WOODELF]:   3274,
    [Races.HIGHELF]:   3245,
    [Races.DARKELF]:   3240,
    [Races.HALFELF]:   3243,
    [Races.DWARF]:     3241,
    [Races.TROLL]:     3249,
    [Races.OGRE]:     3248,
    [Races.HALFLING]: 3244,
    [Races.GNOME]:    3339,
    [Races.AVIAK]:    3339,
    [Races.WEREWOLF]:    3339,
}

export const CharClassStrings = {
    [Classes.WAR]: 3330,
    [Classes.CLR]: 3319,
    [Classes.PAL]: 3325,
    [Classes.RNG]: 3326,
    [Classes.SHD]: 3328,
    [Classes.DRU]: 3320,
    [Classes.MNK]: 3323,
    [Classes.BRD]: 3317,
    [Classes.ROG]: 3327,
    [Classes.SHM]: 3329,
    [Classes.NEC]: 3324,
    [Classes.WIZ]: 3331,
    [Classes.MAG]: 3322,
    [Classes.ENC]: 3321
}

export const Deity = {
    Unknown:  [0, 'Unknown'],
    Agnostic_LB : [140, 'Agnostic'],
    Bertoxxulous : [201, 'Bertoxxulous'],
    BrellSerilis: [202, 'Brell Serilis'],
    CazicThule: [203, 'Cazic Thule'],
    ErollisiMarr: [204, 'Erollisi Marr'],
    Bristlebane: [205, 'Bristlebane'],
    Innoruuk: [206, 'Innoruuk'],
    Karana: [207, 'Karana'],
    MithanielMarr: [208, 'Mithaniel Marr'],
    Prexus: [209, 'Prexus'],
    Quellious: [210, 'Quellious'],
    RallosZek: [211, 'Rallos Zek'],
    RodcetNife: [212, 'Rodcet Nife'],
    SolusekRo: [213, 'Solusek Ro'],
    TheTribunal: [214, 'The Tribunal'],
    Tunare: [215, 'Tunare'],
    Veeshan: [216, 'Veeshan'],
    Agnostic: [396, 'Agnostic']
}

export const preferredStats = {
    1: ['str', 'sta', 'agi'],
    2: ['str', 'sta', 'wis'],
    3: ['str', 'sta', 'wis', 'cha'],
    4: ['str', 'sta', 'wis', 'agi'],
    5: ['str', 'sta', 'intel'],
    6: ['sta', 'wis'],
    7: ['str', 'sta', 'agi', 'dex'],
    8: ['str', 'dex', 'cha'],
    9: ['agi', 'dex'],
    10: ['sta', 'wis', 'cha'],
    11: ['dex', 'intel'],
    12: ['sta', 'intel'],
    13: ['sta', 'intel'],
    14: ['cha', 'intel'],

}

export const baseStats =
	[            /* STR  STA  AGI  DEX  WIS  INT  CHR */
	[ /*Human*/      75,  75,  75,  75,  75,  75,  75],
	[ /*Barbarian*/ 103,  95,  82,  70,  70,  60,  55],
	[ /*Erudite*/    60,  70,  70,  70,  83, 107,  70],
	[ /*Wood Elf*/   65,  65,  95,  80,  80,  75,  75],
	[ /*High Elf*/   55,  65,  85,  70,  95,  92,  80],
	[ /*Dark Elf*/   60,  65,  90,  75,  83,  99,  60],
	[ /*Half Elf*/   70,  70,  90,  85,  60,  75,  75],
	[ /*Dwarf*/      90,  90,  70,  90,  83,  60,  45],
	[ /*Troll*/     108, 109,  83,  75,  60,  52,  40],
	[ /*Ogre*/      130, 122,  70,  70,  67,  60,  37],
	[ /*Halfling*/   70,  75,  95,  90,  80,  67,  50],
	[ /*Gnome*/      60,  70,  85,  85,  67,  98,  60],
	[ /*Aviak*/ 103,  95,  82,  70,  70,  60,  55],
	[ /*Werewolf*/ 103,  95,  82,  70,  70,  60,  55],

];

export const baseClassStats =
	[              /* STR  STA  AGI  DEX  WIS  INT  CHR  ADD*/
	[ /*Warrior*/      10,  10,   5,   0,   0,   0,   0,  25],
	[ /*Cleric*/        5,   5,   0,   0,  10,   0,   0,  30],
	[ /*Paladin*/      10,   5,   0,   0,   5,   0,  10,  20],
	[ /*Ranger*/        5,  10,  10,   0,   5,   0,   0,  20],
	[ /*ShadowKnight*/ 10,   5,   0,   0,   0,   10,  5,  20],
	[ /*Druid*/         0,  10,   0,   0,  10,   0,   0,  30],
	[ /*Monk*/          5,   5,  10,  10,   0,   0,   0,  20],
	[ /*Bard*/          5,   0,   0,  10,   0,   0,  10,  25],
	[ /*Rouge*/         0,   0,  10,  10,   0,   0,   0,  30],
	[ /*Shaman*/        0,   5,   0,   0,  10,   0,   5,  30],
	[ /*Necromancer*/   0,   0,   0,  10,   0,  10,   0,  30],
	[ /*Wizard*/        0,  10,   0,   0,   0,  10,   0,  30],
	[ /*Magician*/      0,  10,   0,   0,   0,  10,   0,  30],
	[ /*Enchanter*/     0,   0,   0,   0,   0,  10,  10,  30],
	];

	export const classLookupTable =
	[                   /*Human  Barbarian Erudite Woodelf Highelf Darkelf Halfelf Dwarf  Troll  Ogre   Halfling Gnome  Aviak  Werewolf */
	[ /*Warrior*/         true,  true,     false,  true,   false,  true,   true,   true,  true,  true,  true,    true,  true,  true,  ],
	[ /*Cleric*/          true,  false,    true,   false,  true,   true,   false,  true,  false, false, true,    true,  false, false, ],
	[ /*Paladin*/         true,  false,    true,   false,  true,   false,  true,   true,  false, false, true,    true,  false, false, ],
	[ /*Ranger*/          true,  false,    false,  true,   false,  false,  true,   false, false, false, true,    false, false, false, ],
	[ /*ShadowKnight*/    true,  false,    true,   false,  false,  true,   false,  false, true,  true,  false,   true,  false, false, ],
	[ /*Druid*/           true,  false,    false,  true,   false,  false,  true,   false, false, false, true,    false, false, false, ],
	[ /*Monk*/            true,  false,    false,  false,  false,  false,  false,  false, false, false, false,   false, false, false, ],
	[ /*Bard*/            true,  false,    false,  true,   false,  false,  true,   false, false, false, false,   false, false, false, ],
	[ /*Rogue*/           true,  true,     false,  true,   false,  true,   true,   true,  false, false, true,    true,  true,  true,  ],
	[ /*Shaman*/          false, true,     false,  false,  false,  false,  false,  false, true,  true,  false,   false, true,  true,  ],
	[ /*Necromancer*/     true,  false,    true,   false,  false,  true,   false,  false, false, false, false,   true,  false, false, ],
	[ /*Wizard*/          true,  false,    true,   false,  true,   true,   false,  false, false, false, false,   true,  false, false, ],
	[ /*Magician*/        true,  false,    true,   false,  true,   true,   false,  false, false, false, false,   true,  false, false, ],
	[ /*Enchanter*/       true,  false,    true,   false,  true,   true,   false,  false, false, false, false,   true,  false, false, ],
	];
