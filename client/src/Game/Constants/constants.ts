
/* eslint-disable */

export const USE_SAGE = import.meta.env.VITE_USE_SAGE === 'true';

export const charFileRegex = /^([a-z]{3})([a-z]{2})(\d{2})(\d{2})$/;
export const clkRegex = /^clk(\d{2})(\d{2})$/;

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
    ENC: 14
}


// 0 = odus
// 1 = qeynos
// 2 = halas
// 3 = rivervale
// 4 = freeport
// 5 = neriak
// 6 = gukta/grobb
// 7 = ogguk
// 8 = kaladim
// 9 = gfay
// 10 = felwithe
// 11 = akanon
// 12 = cabalis
// 13 = shar vahl
export const StartingZones = {
    SouthQeynos: [1, 'South Qeynos'],
    NorthQeynos: [1, 'North Qeynos'],
    SurefallGlade: [1, 'Surefall Glade'],
    NorthFreeport: [4, 'North Freeport'],
    WestFreeport: [4, 'West Freeport'],
    EastFreeport: [4, 'East Freeport'],
    GreaterFaydark: [9, 'Greater Faydark'],
    Halas: [2, "Halas"],
    Oggok: [7, "Oggok"],
    Grobb: [6, "Grobb"],
    NorthKaladim: [8, "North Kaladim"],
    SouthKaladim: [8, "South Kaladim"],
    Paineel: [0, 'Paineel'],
    Erudin: [0, "Erudin"],
    ErudinPalace: [0, "Erudin Palace"],
    AkAnon: [11, 'Ak\'Anon'],
    Rivervale: [3, 'Rivervale'],
    NorthernFelwithe: [9, 'Northern Felwithe'],
    SouthernFelwithe: [9, 'Southern Felwithe'],
    QeynosAqueducts: [1, 'Qeynos Catacombs'],
    NeriakCommons: [5, 'Neriak Commons'],
    NeriakThirdGate: [5, 'Neriak Third Gate'],
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

  