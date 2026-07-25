import { AbbreviatedRaces, Classes, Deity, Races, StartingZones } from './constants';
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const { HUMAN, BARBARIAN, ERUDITE, WOODELF, HIGHELF, DARKELF, HALFELF, DWARF, TROLL, OGRE, HALFLING, GNOME, } = Races;
const { WAR, CLR, PAL, RNG, SHD, DRU, MNK, BRD, ROG, SHM, NEC, WIZ, MAG, ENC } = Classes;
const { Agnostic, Bertoxxulous, BrellSerilis, CazicThule, ErollisiMarr, Bristlebane, Innoruuk, Karana, MithanielMarr, Prexus, Quellious, RallosZek, RodcetNife, SolusekRo, TheTribunal, Tunare, Veeshan, } = Deity;
export const getDeityName = (deity) => {
    return Object.values(Deity).find((d) => d[0] === deity)?.[1] || 'Unknown';
};
const { SouthQeynos, NorthQeynos, SurefallGlade, NorthFreeport, WestFreeport, EastFreeport, GreaterFaydark, Halas, Oggok, Grobb, NorthKaladim, SouthKaladim, Paineel, Erudin, ErudinPalace, AkAnon, Rivervale, NorthernFelwithe, SouthernFelwithe, QeynosAqueducts, NeriakCommons, NeriakThirdGate, } = StartingZones;
// playerClassBitmasks maps uint8 to its bitmask
const playerClassBitmasks = {
    [Classes.WAR]: 1,
    [Classes.CLR]: 2,
    [Classes.PAL]: 4,
    [Classes.RNG]: 8,
    [Classes.SHD]: 16,
    [Classes.DRU]: 32,
    [Classes.MNK]: 64,
    [Classes.BRD]: 128,
    [Classes.ROG]: 256,
    [Classes.SHM]: 512,
    [Classes.NEC]: 1024,
    [Classes.WIZ]: 2048,
    [Classes.MAG]: 4096,
    [Classes.ENC]: 8192,
    [Classes.BST]: 16384,
    [Classes.BER]: 32768,
};
const PlayerRaceUnknownBit = 0;
const PlayerRaceHumanBit = 1;
const PlayerRaceBarbarianBit = 2;
const PlayerRaceEruditeBit = 4;
const PlayerRaceWoodElfBit = 8;
const PlayerRaceHighElfBit = 16;
const PlayerRaceDarkElfBit = 32;
const PlayerRaceHalfElfBit = 64;
const PlayerRaceDwarfBit = 128;
const PlayerRaceTrollBit = 256;
const PlayerRaceOgreBit = 512;
const PlayerRaceHalflingBit = 1024;
const PlayerRaceGnomeBit = 2048;
const PlayerRaceIksarBit = 4096;
const PlayerRaceVahshirBit = 8192;
const PlayerRaceFroglokBit = 16384;
const PlayerRaceDrakkinBit = 32768;
const PlayerRaceAllMask = 65535;
// GetPlayerRaceBit returns the bitmask for a given RaceID.
const getPlayerRaceBit = (race) => {
    switch (race) {
        case Races.HUMAN:
            return PlayerRaceHumanBit;
        case Races.BARBARIAN:
            return PlayerRaceBarbarianBit;
        case Races.ERUDITE:
            return PlayerRaceEruditeBit;
        case Races.WOODELF:
            return PlayerRaceWoodElfBit;
        case Races.HIGHELF:
            return PlayerRaceHighElfBit;
        case Races.DARKELF:
            return PlayerRaceDarkElfBit;
        case Races.HALFELF:
            return PlayerRaceHalfElfBit;
        case Races.DWARF:
            return PlayerRaceDwarfBit;
        case Races.TROLL:
            return PlayerRaceTrollBit;
        case Races.OGRE:
            return PlayerRaceOgreBit;
        case Races.HALFLING:
            return PlayerRaceHalflingBit;
        case Races.GNOME:
            return PlayerRaceGnomeBit;
        // case Races.IKSAR:
        //   return PlayerRaceIksarBit;
        // case Races.VAHSHIR:
        //   return PlayerRaceVahshirBit;
        // case Races.FROGLOK:
        //   return PlayerRaceFroglokBit;
        default:
            return PlayerRaceUnknownBit;
    }
};
export const getRaceStringListFromRaceBitmask = (raceBitmask) => {
    return raceBitmask === 65535 ? 'ALL' : Object.entries(AbbreviatedRaces)
        .filter(([_, raceId]) => (raceBitmask & getPlayerRaceBit(raceId)) !== 0)
        .map(([raceName]) => raceName).join(' ');
};
export const getClassStringListFromClassBitmask = (classBitmask) => {
    return classBitmask === 65535 ? 'ALL' : Object.entries(Classes)
        .filter(([_, classId]) => (classBitmask & (playerClassBitmasks[classId])) !== 0)
        .map(([className]) => className).join(' ');
};
export const getClassListFromClassBitmask = (classBitmask) => {
    return Object.values(Classes).filter((classId) => (classBitmask & (playerClassBitmasks[classId])) !== 0);
};
export const startingCityMap = {
    [BRD]: {
        [HALFELF]: {
            [Agnostic]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [BrellSerilis]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [Bristlebane]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [ErollisiMarr]: [NorthFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [NorthFreeport],
            [Prexus]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [Quellious]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [RallosZek]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [RodcetNife]: [SouthQeynos],
            [SolusekRo]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [TheTribunal]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [Tunare]: [SouthQeynos, NorthFreeport, GreaterFaydark],
            [Veeshan]: [SouthQeynos, NorthFreeport, GreaterFaydark],
        },
        [HUMAN]: {
            [Agnostic]: [SouthQeynos, NorthFreeport],
            [BrellSerilis]: [SouthQeynos, NorthFreeport],
            [Bristlebane]: [SouthQeynos, NorthFreeport],
            [ErollisiMarr]: [NorthFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [NorthFreeport],
            [Prexus]: [SouthQeynos, NorthFreeport],
            [Quellious]: [SouthQeynos, NorthFreeport],
            [RallosZek]: [SouthQeynos, NorthFreeport],
            [RodcetNife]: [SouthQeynos],
            [SolusekRo]: [SouthQeynos, NorthFreeport],
            [TheTribunal]: [SouthQeynos, NorthFreeport],
            [Tunare]: [SouthQeynos, NorthFreeport],
            [Veeshan]: [SouthQeynos, NorthFreeport],
        },
        [WOODELF]: {
            [Agnostic]: [GreaterFaydark],
            [BrellSerilis]: [GreaterFaydark],
            [Bristlebane]: [GreaterFaydark],
            [ErollisiMarr]: [GreaterFaydark],
            [Karana]: [GreaterFaydark],
            [MithanielMarr]: [GreaterFaydark],
            [Prexus]: [GreaterFaydark],
            [Quellious]: [GreaterFaydark],
            [RallosZek]: [GreaterFaydark],
            [RodcetNife]: [GreaterFaydark],
            [SolusekRo]: [GreaterFaydark],
            [TheTribunal]: [GreaterFaydark],
            [Tunare]: [GreaterFaydark],
            [Veeshan]: [GreaterFaydark],
        },
    },
    [CLR]: {
        [DARKELF]: {
            [Innoruuk]: [NeriakThirdGate],
        },
        [DWARF]: {
            [BrellSerilis]: [NorthKaladim],
        },
        [ERUDITE]: {
            [CazicThule]: [Paineel],
            [Prexus]: [Erudin],
            [Quellious]: [Erudin],
        },
        [GNOME]: {
            [Bertoxxulous]: [AkAnon],
            [BrellSerilis]: [AkAnon],
            [Bristlebane]: [AkAnon],
        },
        [HALFLING]: {
            [Bristlebane]: [Rivervale],
        },
        [HIGHELF]: {
            [Tunare]: [NorthernFelwithe],
        },
        [HUMAN]: {
            [Bertoxxulous]: [QeynosAqueducts],
            [ErollisiMarr]: [NorthFreeport],
            [Innoruuk]: [EastFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [NorthFreeport],
            [RodcetNife]: [NorthQeynos],
        },
    },
    [ENC]: {
        [DARKELF]: {
            [Agnostic]: [NeriakCommons],
            [Innoruuk]: [NeriakCommons],
        },
        [ERUDITE]: {
            [Agnostic]: [ErudinPalace],
            [Prexus]: [ErudinPalace],
            [Quellious]: [ErudinPalace],
        },
        [GNOME]: {
            [Agnostic]: [AkAnon],
            [Bertoxxulous]: [AkAnon],
            [BrellSerilis]: [AkAnon],
        },
        [HIGHELF]: {
            [Agnostic]: [SouthernFelwithe],
            [ErollisiMarr]: [SouthernFelwithe],
            [Karana]: [SouthernFelwithe],
            [MithanielMarr]: [SouthernFelwithe],
            [Tunare]: [SouthernFelwithe],
        },
        [HUMAN]: {
            [Agnostic]: [SouthQeynos, WestFreeport],
            [Bertoxxulous]: [QeynosAqueducts],
            [ErollisiMarr]: [WestFreeport],
            [Innoruuk]: [EastFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [WestFreeport],
            [RodcetNife]: [SouthQeynos],
        },
    },
    [MAG]: {
        [DARKELF]: {
            [Agnostic]: [NeriakCommons],
            [Innoruuk]: [NeriakCommons],
        },
        [ERUDITE]: {
            [Agnostic]: [ErudinPalace],
            [Prexus]: [ErudinPalace],
            [Quellious]: [ErudinPalace],
        },
        [GNOME]: {
            [Agnostic]: [AkAnon],
            [Bertoxxulous]: [AkAnon],
            [BrellSerilis]: [AkAnon],
        },
        [HIGHELF]: {
            [Agnostic]: [SouthernFelwithe],
            [ErollisiMarr]: [SouthernFelwithe],
            [Karana]: [SouthernFelwithe],
            [MithanielMarr]: [SouthernFelwithe],
            [Tunare]: [SouthernFelwithe],
        },
        [HUMAN]: {
            [Agnostic]: [SouthQeynos, WestFreeport],
            [Bertoxxulous]: [QeynosAqueducts],
            [ErollisiMarr]: [WestFreeport],
            [Innoruuk]: [EastFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [WestFreeport],
            [RodcetNife]: [SouthQeynos],
        },
    },
    [MNK]: {
        [HUMAN]: {
            [Agnostic]: [NorthQeynos],
            [Quellious]: [WestFreeport],
        },
    },
    [NEC]: {
        [DARKELF]: {
            [Innoruuk]: [NeriakThirdGate],
        },
        [ERUDITE]: {
            [CazicThule]: [Paineel],
        },
        [GNOME]: {
            [Bertoxxulous]: [AkAnon],
        },
        [HUMAN]: {
            [Bertoxxulous]: [QeynosAqueducts],
            [Innoruuk]: [EastFreeport],
        },
    },
    [PAL]: {
        [DWARF]: {
            [BrellSerilis]: [NorthKaladim],
        },
        [ERUDITE]: {
            [Prexus]: [Erudin],
            [Quellious]: [Erudin],
        },
        [GNOME]: {
            [BrellSerilis]: [AkAnon],
        },
        [HALFELF]: {
            [ErollisiMarr]: [NorthFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [NorthFreeport],
            [RodcetNife]: [SouthQeynos],
            [Tunare]: [NorthernFelwithe],
        },
        [HALFLING]: {
            [Karana]: [Rivervale],
        },
        [HIGHELF]: {
            [Tunare]: [NorthernFelwithe],
        },
        [HUMAN]: {
            [ErollisiMarr]: [NorthFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [NorthFreeport],
            [RodcetNife]: [NorthQeynos],
        },
    },
    [RNG]: {
        [HALFELF]: {
            [Karana]: [SurefallGlade],
            [Tunare]: [SurefallGlade, GreaterFaydark],
        },
        [HALFLING]: {
            [Karana]: [Rivervale],
        },
        [HUMAN]: {
            [Karana]: [SurefallGlade],
            [Tunare]: [SurefallGlade],
        },
        [WOODELF]: {
            [Tunare]: [GreaterFaydark],
        },
    },
    [ROG]: {
        [BARBARIAN]: {
            [Agnostic]: [Halas],
            [Bristlebane]: [Halas],
            [TheTribunal]: [Halas],
        },
        [DARKELF]: {
            [Agnostic]: [NeriakThirdGate],
            [Bristlebane]: [NeriakThirdGate],
            [Innoruuk]: [NeriakThirdGate],
        },
        [DWARF]: {
            [Agnostic]: [NorthKaladim],
            [BrellSerilis]: [NorthKaladim],
            [Bristlebane]: [NorthKaladim],
        },
        [GNOME]: {
            [Agnostic]: [AkAnon],
            [Bertoxxulous]: [AkAnon],
            [BrellSerilis]: [AkAnon],
            [Bristlebane]: [AkAnon],
        },
        [HALFELF]: {
            [Agnostic]: [NorthQeynos, EastFreeport, GreaterFaydark],
            [Bertoxxulous]: [NorthQeynos],
            [Bristlebane]: [NorthQeynos, EastFreeport, GreaterFaydark],
            [ErollisiMarr]: [EastFreeport],
            [Karana]: [NorthQeynos],
            [RodcetNife]: [NorthQeynos],
            [Tunare]: [GreaterFaydark],
        },
        [HALFLING]: {
            [Agnostic]: [Rivervale],
            [BrellSerilis]: [Rivervale],
            [Bristlebane]: [Rivervale],
        },
        [HUMAN]: {
            [Agnostic]: [NorthQeynos, EastFreeport],
            [Bertoxxulous]: [NorthQeynos],
            [Bristlebane]: [NorthQeynos, EastFreeport],
            [ErollisiMarr]: [EastFreeport],
            [Innoruuk]: [EastFreeport],
            [Karana]: [NorthQeynos],
            [RodcetNife]: [NorthQeynos],
        },
        [WOODELF]: {
            [Agnostic]: [GreaterFaydark],
            [Bristlebane]: [GreaterFaydark],
            [Karana]: [GreaterFaydark],
            [Tunare]: [GreaterFaydark],
        },
    },
    [SHD]: {
        [DARKELF]: {
            [Innoruuk]: [NeriakThirdGate],
        },
        [ERUDITE]: {
            [CazicThule]: [Paineel],
        },
        [GNOME]: {
            [Bertoxxulous]: [AkAnon],
        },
        [HUMAN]: {
            [Bertoxxulous]: [QeynosAqueducts],
            [Innoruuk]: [EastFreeport],
        },
        [OGRE]: {
            [CazicThule]: [Oggok],
            [RallosZek]: [Oggok],
        },
        [TROLL]: {
            [CazicThule]: [Grobb],
            [Innoruuk]: [Grobb],
        },
    },
    [SHM]: {
        [BARBARIAN]: {
            [TheTribunal]: [Halas],
        },
        [OGRE]: {
            [RallosZek]: [Oggok],
        },
        [TROLL]: {
            [CazicThule]: [Grobb],
            [Innoruuk]: [Grobb],
        },
    },
    [WAR]: {
        [BARBARIAN]: {
            [Agnostic]: [Halas],
            [RallosZek]: [Halas],
            [TheTribunal]: [Halas],
        },
        [DARKELF]: {
            [Agnostic]: [NeriakCommons],
            [Innoruuk]: [NeriakCommons],
            [RallosZek]: [NeriakCommons],
        },
        [DWARF]: {
            [Agnostic]: [SouthKaladim],
            [BrellSerilis]: [SouthKaladim],
        },
        [GNOME]: {
            [Agnostic]: [AkAnon],
            [Bertoxxulous]: [AkAnon],
            [BrellSerilis]: [AkAnon],
            [RallosZek]: [AkAnon],
        },
        [HALFELF]: {
            [Agnostic]: [SouthQeynos, WestFreeport, GreaterFaydark],
            [Bertoxxulous]: [SouthQeynos],
            [ErollisiMarr]: [WestFreeport],
            [Innoruuk]: [WestFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [WestFreeport],
            [Prexus]: [SouthQeynos, WestFreeport, GreaterFaydark],
            [RallosZek]: [SouthQeynos, WestFreeport, GreaterFaydark],
            [RodcetNife]: [SouthQeynos],
            [TheTribunal]: [SouthQeynos, WestFreeport, GreaterFaydark],
            [Tunare]: [GreaterFaydark],
        },
        [HALFLING]: {
            [Agnostic]: [Rivervale],
            [BrellSerilis]: [Rivervale],
            [RallosZek]: [Rivervale],
        },
        [HUMAN]: {
            [Agnostic]: [SouthQeynos, WestFreeport],
            [Bertoxxulous]: [SouthQeynos],
            [ErollisiMarr]: [WestFreeport],
            [Innoruuk]: [WestFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [WestFreeport],
            [RallosZek]: [SouthQeynos, WestFreeport],
            [RodcetNife]: [SouthQeynos],
        },
        [OGRE]: {
            [Agnostic]: [Oggok],
            [CazicThule]: [Oggok],
            [RallosZek]: [Oggok],
        },
        [TROLL]: {
            [Agnostic]: [Grobb],
            [CazicThule]: [Grobb],
            [Innoruuk]: [Grobb],
            [RallosZek]: [Grobb],
        },
        [WOODELF]: {
            [Agnostic]: [GreaterFaydark],
            [Karana]: [GreaterFaydark],
            [RallosZek]: [GreaterFaydark],
            [Tunare]: [GreaterFaydark],
        },
    },
    [WIZ]: {
        [DARKELF]: {
            [Agnostic]: [NeriakCommons],
            [Innoruuk]: [NeriakCommons],
            [SolusekRo]: [NeriakCommons],
        },
        [ERUDITE]: {
            [Agnostic]: [ErudinPalace],
            [Prexus]: [ErudinPalace],
            [Quellious]: [ErudinPalace],
            [SolusekRo]: [ErudinPalace],
        },
        [GNOME]: {
            [Agnostic]: [AkAnon],
            [Bertoxxulous]: [AkAnon],
            [BrellSerilis]: [AkAnon],
            [SolusekRo]: [AkAnon],
        },
        [HIGHELF]: {
            [Agnostic]: [SouthernFelwithe],
            [ErollisiMarr]: [SouthernFelwithe],
            [Karana]: [SouthernFelwithe],
            [MithanielMarr]: [SouthernFelwithe],
            [SolusekRo]: [SouthernFelwithe],
            [Tunare]: [SouthernFelwithe],
        },
        [HUMAN]: {
            [Agnostic]: [SouthQeynos, WestFreeport],
            [Bertoxxulous]: [QeynosAqueducts],
            [ErollisiMarr]: [WestFreeport],
            [Innoruuk]: [EastFreeport],
            [Karana]: [SouthQeynos],
            [MithanielMarr]: [WestFreeport],
            [RodcetNife]: [SouthQeynos],
            [SolusekRo]: [SouthQeynos, WestFreeport],
        },
    },
};
export const getAvailableDeities = (race, classId) => {
    switch (classId) {
        case BRD:
            return [
                Agnostic,
                BrellSerilis,
                Bristlebane,
                ErollisiMarr,
                Karana,
                MithanielMarr,
                Prexus,
                Quellious,
                RallosZek,
                SolusekRo,
                TheTribunal,
                Tunare,
                Veeshan,
            ];
        case CLR: {
            switch (race) {
                case DARKELF:
                    return [Innoruuk];
                case DWARF:
                    return [BrellSerilis];
                case ERUDITE:
                    return [Prexus, Quellious];
                case GNOME:
                    return [BrellSerilis, Bertoxxulous, Bristlebane];
                case HALFLING:
                    return [Bristlebane];
                case HIGHELF:
                    return [Tunare];
                default:
                    return [];
            }
        }
        case DRU: {
            switch (race) {
                case HALFELF:
                case HUMAN:
                    return [Karana, Tunare];
                case HALFLING:
                    return [Karana];
                case WOODELF:
                    return [Tunare];
                default:
                    return [];
            }
        }
        case MAG:
        case ENC: {
            switch (race) {
                case DARKELF:
                    return [Agnostic, Innoruuk];
                case ERUDITE:
                    return [Agnostic, Prexus, Quellious];
                case GNOME:
                    return [Agnostic, Bertoxxulous, BrellSerilis];
                case HIGHELF:
                    return [Agnostic, ErollisiMarr, Karana, MithanielMarr, Tunare];
                case HUMAN:
                    return [
                        Agnostic,
                        Bertoxxulous,
                        ErollisiMarr,
                        Innoruuk,
                        Karana,
                        MithanielMarr,
                        RodcetNife,
                        Tunare,
                    ];
                default:
                    return [];
            }
        }
        case MNK:
            return [Agnostic, Quellious];
        case NEC: {
            switch (race) {
                case DARKELF:
                    return [Innoruuk];
                case ERUDITE:
                    return [CazicThule];
                case GNOME:
                    return [Bertoxxulous];
                case HUMAN:
                    return [Bertoxxulous, Innoruuk];
                default:
                    return [];
            }
        }
        case PAL: {
            switch (race) {
                case DWARF:
                    return [BrellSerilis];
                case ERUDITE:
                    return [Prexus, Quellious];
                case HALFELF:
                    return [ErollisiMarr, Karana, MithanielMarr, RodcetNife, Tunare];
                case HIGHELF:
                    return [Tunare];
                case HUMAN:
                    return [ErollisiMarr, Karana, MithanielMarr, RodcetNife];
                default:
                    return [];
            }
        }
        case RNG: {
            switch (race) {
                case HALFELF:
                case HUMAN:
                    return [Karana, Tunare];
                case WOODELF:
                    return [Tunare];
                default:
                    return [];
            }
        }
        case ROG: {
            switch (race) {
                case BARBARIAN:
                    return [Agnostic, Bristlebane, TheTribunal];
                case DARKELF:
                    return [Agnostic, Bristlebane, Innoruuk];
                case DWARF:
                    return [Agnostic, BrellSerilis, Bristlebane];
                case GNOME:
                    return [Agnostic, Bertoxxulous, BrellSerilis, Bristlebane];
                case HALFELF:
                    return [
                        Agnostic,
                        Bertoxxulous,
                        Bristlebane,
                        ErollisiMarr,
                        Karana,
                        RodcetNife,
                        Tunare,
                    ];
                case HALFLING:
                    return [
                        Agnostic,
                        BrellSerilis,
                        Bristlebane,
                        ErollisiMarr,
                        Innoruuk,
                        Karana,
                    ];
                case HUMAN:
                    return [
                        Agnostic,
                        Bertoxxulous,
                        Bristlebane,
                        ErollisiMarr,
                        Innoruuk,
                        Karana,
                        RodcetNife,
                    ];
                case WOODELF:
                    return [Agnostic, Bristlebane, Karana, Tunare];
                default:
                    return [];
            }
        }
        case SHD: {
            switch (race) {
                case DARKELF:
                    return [Innoruuk];
                case ERUDITE:
                    return [CazicThule];
                case HUMAN:
                    return [Bertoxxulous, Innoruuk];
                case OGRE:
                    return [CazicThule, RallosZek];
                case TROLL:
                    return [CazicThule, Innoruuk];
                default:
                    return [];
            }
        }
        case SHM: {
            switch (race) {
                case BARBARIAN:
                    return [TheTribunal];
                case OGRE:
                    return [RallosZek];
                case TROLL:
                    return [CazicThule, Innoruuk];
                default:
                    return [];
            }
        }
        case WAR: {
            switch (race) {
                case BARBARIAN:
                    return [Agnostic, RallosZek, TheTribunal];
                case DARKELF:
                    return [Agnostic, Innoruuk, RallosZek];
                case DWARF:
                    return [Agnostic, BrellSerilis];
                case GNOME:
                    return [Agnostic, Bertoxxulous, BrellSerilis, RallosZek];
                case HALFELF:
                    return [
                        Agnostic,
                        Bertoxxulous,
                        ErollisiMarr,
                        Innoruuk,
                        Karana,
                        MithanielMarr,
                        Prexus,
                        RallosZek,
                        RodcetNife,
                        TheTribunal,
                        Tunare,
                    ];
                case HALFLING:
                    return [Agnostic, BrellSerilis, RallosZek];
                case HUMAN:
                    return [
                        Agnostic,
                        Bertoxxulous,
                        ErollisiMarr,
                        Innoruuk,
                        Karana,
                        MithanielMarr,
                        RallosZek,
                        RodcetNife,
                    ];
                case OGRE:
                    return [Agnostic, CazicThule, RallosZek];
                case TROLL:
                    return [Agnostic, CazicThule, Innoruuk, RallosZek];
                case WOODELF:
                    return [Agnostic, Karana, RallosZek, Tunare];
                default:
                    return [];
            }
        }
        case WIZ: {
            switch (race) {
                case DARKELF:
                    return [Agnostic, Innoruuk, SolusekRo];
                case ERUDITE:
                    return [Agnostic, Prexus, Quellious, SolusekRo];
                case GNOME:
                    return [Agnostic, Bertoxxulous, BrellSerilis, SolusekRo];
                case HIGHELF:
                    return [
                        Agnostic,
                        ErollisiMarr,
                        Karana,
                        MithanielMarr,
                        Tunare,
                        SolusekRo,
                    ];
                case HUMAN:
                    return [
                        Agnostic,
                        Bertoxxulous,
                        ErollisiMarr,
                        Innoruuk,
                        Karana,
                        MithanielMarr,
                        RodcetNife,
                        Tunare,
                        SolusekRo,
                    ];
                default:
                    return [];
            }
        }
        default:
            return [];
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInV0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUVyRixNQUFNLENBQUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFFdkUsTUFBTSxFQUNKLEtBQUssRUFDTCxTQUFTLEVBQ1QsT0FBTyxFQUNQLE9BQU8sRUFDUCxPQUFPLEVBQ1AsT0FBTyxFQUNQLE9BQU8sRUFDUCxLQUFLLEVBQ0wsS0FBSyxFQUNMLElBQUksRUFDSixRQUFRLEVBQ1IsS0FBSyxHQUNOLEdBQUcsS0FBSyxDQUFDO0FBQ1YsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FDNUUsT0FBTyxDQUFDO0FBRVYsTUFBTSxFQUNKLFFBQVEsRUFDUixZQUFZLEVBQ1osWUFBWSxFQUNaLFVBQVUsRUFDVixZQUFZLEVBQ1osV0FBVyxFQUNYLFFBQVEsRUFDUixNQUFNLEVBQ04sYUFBYSxFQUNiLE1BQU0sRUFDTixTQUFTLEVBQ1QsU0FBUyxFQUNULFVBQVUsRUFDVixTQUFTLEVBQ1QsV0FBVyxFQUNYLE1BQU0sRUFDTixPQUFPLEdBQ1IsR0FBUyxLQUFLLENBQUM7QUFFaEIsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFHLENBQUMsS0FBYSxFQUFFLEVBQUU7SUFDNUMsT0FBTyxNQUFNLENB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WUFBWTt3QkFDWixNQUFNO3dCQUNOLGFBQWE7d0JBQ2IsTUFBTTt3QkFDTixTQUFTO3FCQUNWLENBQUM7Z0JBQ0osS0FBSyxLQUFLO29CQUNSLE9BQU87d0JBQ0wsUUFBUTt3QkFDUixZQUFZO3dCQUNaLFlBQVk7d0JBQ1osUUFBUTt3QkFDUixNQUFNO3dCQUNOLGFBQWE7d0JBQ2IsVUFBVTt3QkFDVixNQUFNO3dCQUNOLFNBQVM7cUJBQ1YsQ0FBQztnQkFDSjtvQkFDRSxPQUFPLEVBQUUsQ0FBQztZQUNkLENBQUM7UUFDSCxDQUFDO1FBQ0Q7WUFDRSxPQUFPLEVBQUUsQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIgXG5cbmltcG9ydCB7IEFiYnJldmlhdGVkUmFjZXMsIENsYXNzZXMsIERlaXR5LCBSYWNlcywgU3RhcnRpbmdab25lcyB9IGZyb20gJy4vY29uc3RhbnRzJztcblxuZXhwb3J0IGNvbnN0IHNsZWVwID0gKG1zKSA9PiBuZXcgUHJvbWlzZSgocmVzKSA9PiBzZXRUaW1lb3V0KHJlcywgbXMpKTtcblxuY29uc3Qge1xuICBIVU1BTixcbiAgQkFSQkFSSUFOLFxuICBFUlVESVRFLFxuICBXT09ERUxGLFxuICBISUdIRUxGLFxuICBEQVJLRUxGLFxuICBIQUxGRUxGLFxuICBEV0FSRixcbiAgVFJPTEwsXG4gIE9HUkUsXG4gIEhBTEZMSU5HLFxuICBHTk9NRSxcbn0gPSBSYWNlcztcbmNvbnN0IHsgV0FSLCBDTFIsIFBBTCwgUk5HLCBTSEQsIERSVSwgTU5LLCBCUkQsIFJPRywgU0hNLCBORUMsIFdJWiwgTUFHLCBFTkMgfSA9XG4gIENsYXNzZXM7XG5cbmNvbnN0IHtcbiAgQWdub3N0aWMsXG4gIEJlcnRveHh1bG91cyxcbiAgQnJlbGxTZXJpbGlzLFxuICBDYXppY1RodWxlLFxuICBFcm9sbGlzaU1hcnIsXG4gIEJyaXN0bGViYW5lLFxuICBJbm5vcnV1ayxcbiAgS2FyYW5hLFxuICBNaXRoYW5pZWxNYXJyLFxuICBQcmV4dXMsXG4gIFF1ZWxsaW91cyxcbiAgUmFsbG9zWmVrLFxuICBSb2RjZXROaWZlLFxuICBTb2x1c2VrUm8sXG4gIFRoZVRyaWJ1bmFsLFxuICBUdW5hcmUsXG4gIFZlZXNoYW4sXG59IDogYW55ID0gRGVpdHk7XG5cbmV4cG9ydCBjb25zdCBnZXREZWl0eU5hbWUgPSAoZGVpdHk6IG51bWJlcikgPT4ge1xuICByZXR1cm4gT2JqZWN0LnZhbHVlcyhEZWl0eSkuZmluZCgoZCkgPT4gZFswXSA9PT0gZGVpdHkpPy5bMV0gfHwgJ1Vua25vd24nO1xufTtcblxuXG5jb25zdCB7XG4gIFNvdXRoUWV5bm9zLFxuICBOb3J0aFFleW5vcyxcbiAgU3VyZWZhbGxHbGFkZSxcbiAgTm9ydGhGcmVlcG9ydCxcbiAgV2VzdEZyZWVwb3J0LFxuICBFYXN0RnJlZXBvcnQsXG4gIEdyZWF0ZXJGYXlkYXJrLFxuICBIYWxhcyxcbiAgT2dnb2ssXG4gIEdyb2JiLFxuICBOb3J0aEthbGFkaW0sXG4gIFNvdXRoS2FsYWRpbSxcbiAgUGFpbmVlbCxcbiAgRXJ1ZGluLFxuICBFcnVkaW5QYWxhY2UsXG4gIEFrQW5vbixcbiAgUml2ZXJ2YWxlLFxuICBOb3J0aGVybkZlbHdpdGhlLFxuICBTb3V0aGVybkZlbHdpdGhlLFxuICBRZXlub3NBcXVlZHVjdHMsXG4gIE5lcmlha0NvbW1vbnMsXG4gIE5lcmlha1RoaXJkR2F0ZSxcbn0gPSBTdGFydGluZ1pvbmVzO1xuXG4vLyBwbGF5ZXJDbGFzc0JpdG1hc2tzIG1hcHMgdWludDggdG8gaXRzIGJpdG1hc2tcbmNvbnN0IHBsYXllckNsYXNzQml0bWFza3MgPSB7XG4gIFtDbGFzc2VzLldBUl06IDEsXG4gIFtDbGFzc2VzLkNMUl06IDIsXG4gIFtDbGFzc2VzLlBBTF06IDQsXG4gIFtDbGFzc2VzLlJOR106IDgsXG4gIFtDbGFzc2VzLlNIRF06IDE2LFxuICBbQ2xhc3Nlcy5EUlVdOiAzMixcbiAgW0NsYXNzZXMuTU5LXTogNjQsXG4gIFtDbGFzc2VzLkJSRF06IDEyOCxcbiAgW0NsYXNzZXMuUk9HXTogMjU2LFxuICBbQ2xhc3Nlcy5TSE1dOiA1MTIsXG4gIFtDbGFzc2VzLk5FQ106IDEwMjQsXG4gIFtDbGFzc2VzLldJWl06IDIwNDgsXG4gIFtDbGFzc2VzLk1BR106IDQwOTYsXG4gIFtDbGFzc2VzLkVOQ106IDgxOTIsXG4gIFtDbGFzc2VzLkJTVF06IDE2Mzg0LFxuICBbQ2xhc3Nlcy5CRVJdOiAzMjc2OCxcbn07XG5cblxuY29uc3QgUGxheWVyUmFjZVVua25vd25CaXQgPSAwO1xuY29uc3QgUGxheWVyUmFjZUh1bWFuQml0ID0gMTtcbmNvbnN0IFBsYXllclJhY2VCYXJiYXJpYW5CaXQgPSAyO1xuY29uc3QgUGxheWVyUmFjZUVydWRpdGVCaXQgPSA0O1xuY29uc3QgUGxheWVyUmFjZVdvb2RFbGZCaXQgPSA4O1xuY29uc3QgUGxheWVyUmFjZUhpZ2hFbGZCaXQgPSAxNjtcbmNvbnN0IFBsYXllclJhY2VEYXJrRWxmQml0ID0gMzI7XG5jb25zdCBQbGF5ZXJSYWNlSGFsZkVsZkJpdCA9IDY0O1xuY29uc3QgUGxheWVyUmFjZUR3YXJmQml0ID0gMTI4O1xuY29uc3QgUGxheWVyUmFjZVRyb2xsQml0ID0gMjU2O1xuY29uc3QgUGxheWVyUmFjZU9ncmVCaXQgPSA1MTI7XG5jb25zdCBQbGF5ZXJSYWNlSGFsZmxpbmdCaXQgPSAxMDI0O1xuY29uc3QgUGxheWVyUmFjZUdub21lQml0ID0gMjA0ODtcbmNvbnN0IFBsYXllclJhY2VJa3NhckJpdCA9IDQwOTY7XG5jb25zdCBQbGF5ZXJSYWNlVmFoc2hpckJpdCA9IDgxOTI7XG5jb25zdCBQbGF5ZXJSYWNlRnJvZ2xva0JpdCA9IDE2Mzg0O1xuY29uc3QgUGxheWVyUmFjZURyYWtraW5CaXQgPSAzMjc2ODtcbmNvbnN0IFBsYXllclJhY2VBbGxNYXNrID0gNjU1MzU7XG5cblxuXG4vLyBHZXRQbGF5ZXJSYWNlQml0IHJldHVybnMgdGhlIGJpdG1hc2sgZm9yIGEgZ2l2ZW4gUmFjZUlELlxuY29uc3QgZ2V0UGxheWVyUmFjZUJpdCA9IChyYWNlOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuICBzd2l0Y2ggKHJhY2UpIHtcbiAgICBjYXNlIFJhY2VzLkhVTUFOOlxuICAgICAgcmV0dXJuIFBsYXllclJhY2VIdW1hbkJpdDtcbiAgICBjYXNlIFJhY2VzLkJBUkJBUklBTjpcbiAgICAgIHJldHVybiBQbGF5ZXJSYWNlQmFyYmFyaWFuQml0O1xuICAgIGNhc2UgUmFjZXMuRVJVRElURTpcbiAgICAgIHJldHVybiBQbGF5ZXJSYWNlRXJ1ZGl0ZUJpdDtcbiAgICBjYXNlIFJhY2VzLldPT0RFTEY6XG4gICAgICByZXR1cm4gUGxheWVyUmFjZVdvb2RFbGZCaXQ7XG4gICAgY2FzZSBSYWNlcy5ISUdIRUxGOlxuICAgICAgcmV0dXJuIFBsYXllclJhY2VIaWdoRWxmQml0O1xuICAgIGNhc2UgUmFjZXMuREFSS0VMRjpcbiAgICAgIHJldHVybiBQbGF5ZXJSYWNlRGFya0VsZkJpdDtcbiAgICBjYXNlIFJhY2VzLkhBTEZFTEY6XG4gICAgICByZXR1cm4gUGxheWVyUmFjZUhhbGZFbGZCaXQ7XG4gICAgY2FzZSBSYWNlcy5EV0FSRjpcbiAgICAgIHJldHVybiBQbGF5ZXJSYWNlRHdhcmZCaXQ7XG4gICAgY2FzZSBSYWNlcy5UUk9MTDpcbiAgICAgIHJldHVybiBQbGF5ZXJSYWNlVHJvbGxCaXQ7XG4gICAgY2FzZSBSYWNlcy5PR1JFOlxuICAgICAgcmV0dXJuIFBsYXllclJhY2VPZ3JlQml0O1xuICAgIGNhc2UgUmFjZXMuSEFMRkxJTkc6XG4gICAgICByZXR1cm4gUGxheWVyUmFjZUhhbGZsaW5nQml0O1xuICAgIGNhc2UgUmFjZXMuR05PTUU6XG4gICAgICByZXR1cm4gUGxheWVyUmFjZUdub21lQml0O1xuICAgIC8vIGNhc2UgUmFjZXMuSUtTQVI6XG4gICAgLy8gICByZXR1cm4gUGxheWVyUmFjZUlrc2FyQml0O1xuICAgIC8vIGNhc2UgUmFjZXMuVkFIU0hJUjpcbiAgICAvLyAgIHJldHVybiBQbGF5ZXJSYWNlVmFoc2hpckJpdDtcbiAgICAvLyBjYXNlIFJhY2VzLkZST0dMT0s6XG4gICAgLy8gICByZXR1cm4gUGxheWVyUmFjZUZyb2dsb2tCaXQ7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBQbGF5ZXJSYWNlVW5rbm93bkJpdDtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldFJhY2VTdHJpbmdMaXN0RnJvbVJhY2VCaXRtYXNrID0gKHJhY2VCaXRtYXNrOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gcmFjZUJpdG1hc2sgPT09IDY1NTM1ID8gJ0FMTCcgOiBPYmplY3QuZW50cmllcyhBYmJyZXZpYXRlZFJhY2VzKVxuICAgIC5maWx0ZXIoKFtfLCByYWNlSWRdKSA9PiAocmFjZUJpdG1hc2sgJiBnZXRQbGF5ZXJSYWNlQml0KHJhY2VJZCkpICE9PSAwKVxuICAgIC5tYXAoKFtyYWNlTmFtZV0pID0+IHJhY2VOYW1lKS5qb2luKCcgJyk7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q2xhc3NTdHJpbmdMaXN0RnJvbUNsYXNzQml0bWFzayA9IChjbGFzc0JpdG1hc2s6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIHJldHVybiBjbGFzc0JpdG1hc2sgPT09IDY1NTM1ID8gJ0FMTCcgOiBPYmplY3QuZW50cmllcyhDbGFzc2VzKVxuICAgIC5maWx0ZXIoKFtfLCBjbGFzc0lkXSkgPT4gKGNsYXNzQml0bWFzayAmIChwbGF5ZXJDbGFzc0JpdG1hc2tzW2NsYXNzSWRdKSkgIT09IDApXG4gICAgLm1hcCgoW2NsYXNzTmFtZV0pID0+IGNsYXNzTmFtZSkuam9pbignICcpO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldENsYXNzTGlzdEZyb21DbGFzc0JpdG1hc2sgPSAoY2xhc3NCaXRtYXNrOiBudW1iZXIpOiBudW1iZXJbXSA9PiB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKENsYXNzZXMpLmZpbHRlcigoY2xhc3NJZCkgPT4gKGNsYXNzQml0bWFzayAmIChwbGF5ZXJDbGFzc0JpdG1hc2tzW2NsYXNzSWRdKSkgIT09IDApO1xufTtcblxuZXhwb3J0IGNvbnN0IHN0YXJ0aW5nQ2l0eU1hcCA9IHtcbiAgW0JSRF06IHtcbiAgICBbSEFMRkVMRl06IHtcbiAgICAgIFtBZ25vc3RpY10gICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbQnJlbGxTZXJpbGlzXSA6IFtTb3V0aFFleW5vcywgTm9ydGhGcmVlcG9ydCwgR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0JyaXN0bGViYW5lXSAgOiBbU291dGhRZXlub3MsIE5vcnRoRnJlZXBvcnQsIEdyZWF0ZXJGYXlkYXJrXSxcbiAgICAgIFtFcm9sbGlzaU1hcnJdIDogW05vcnRoRnJlZXBvcnRdLFxuICAgICAgW0thcmFuYV0gICAgICAgOiBbU291dGhRZXlub3NdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbTm9ydGhGcmVlcG9ydF0sXG4gICAgICBbUHJleHVzXSAgICAgICA6IFtTb3V0aFFleW5vcywgTm9ydGhGcmVlcG9ydCwgR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1F1ZWxsaW91c10gICAgOiBbU291dGhRZXlub3MsIE5vcnRoRnJlZXBvcnQsIEdyZWF0ZXJGYXlkYXJrXSxcbiAgICAgIFtSYWxsb3NaZWtdICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbUm9kY2V0TmlmZV0gICA6IFtTb3V0aFFleW5vc10sXG4gICAgICBbU29sdXNla1JvXSAgICA6IFtTb3V0aFFleW5vcywgTm9ydGhGcmVlcG9ydCwgR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1RoZVRyaWJ1bmFsXSAgOiBbU291dGhRZXlub3MsIE5vcnRoRnJlZXBvcnQsIEdyZWF0ZXJGYXlkYXJrXSxcbiAgICAgIFtUdW5hcmVdICAgICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbVmVlc2hhbl0gICAgICA6IFtTb3V0aFFleW5vcywgTm9ydGhGcmVlcG9ydCwgR3JlYXRlckZheWRhcmtdLFxuICAgIH0sXG4gICAgW0hVTUFOXToge1xuICAgICAgW0Fnbm9zdGljXSAgICAgOiBbU291dGhRZXlub3MsIE5vcnRoRnJlZXBvcnRdLFxuICAgICAgW0JyZWxsU2VyaWxpc10gOiBbU291dGhRZXlub3MsIE5vcnRoRnJlZXBvcnRdLFxuICAgICAgW0JyaXN0bGViYW5lXSAgOiBbU291dGhRZXlub3MsIE5vcnRoRnJlZXBvcnRdLFxuICAgICAgW0Vyb2xsaXNpTWFycl0gOiBbTm9ydGhGcmVlcG9ydF0sXG4gICAgICBbS2FyYW5hXSAgICAgICA6IFtTb3V0aFFleW5vc10sXG4gICAgICBbTWl0aGFuaWVsTWFycl06IFtOb3J0aEZyZWVwb3J0XSxcbiAgICAgIFtQcmV4dXNdICAgICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0XSxcbiAgICAgIFtRdWVsbGlvdXNdICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0XSxcbiAgICAgIFtSYWxsb3NaZWtdICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0XSxcbiAgICAgIFtSb2RjZXROaWZlXSAgIDogW1NvdXRoUWV5bm9zXSxcbiAgICAgIFtTb2x1c2VrUm9dICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0XSxcbiAgICAgIFtUaGVUcmlidW5hbF0gIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0XSxcbiAgICAgIFtUdW5hcmVdICAgICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0XSxcbiAgICAgIFtWZWVzaGFuXSAgICAgIDogW1NvdXRoUWV5bm9zLCBOb3J0aEZyZWVwb3J0XSxcbiAgICB9LFxuICAgIFtXT09ERUxGXToge1xuICAgICAgW0Fnbm9zdGljXSAgICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0JyZWxsU2VyaWxpc10gOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0JyaXN0bGViYW5lXSAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0Vyb2xsaXNpTWFycl0gOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0thcmFuYV0gICAgICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1ByZXh1c10gICAgICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1F1ZWxsaW91c10gICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1JhbGxvc1pla10gICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1JvZGNldE5pZmVdICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1NvbHVzZWtSb10gICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1RoZVRyaWJ1bmFsXSAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1R1bmFyZV0gICAgICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW1ZlZXNoYW5dICAgICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgIH0sXG4gIH0sXG4gIFtDTFJdOiB7XG4gICAgW0RBUktFTEZdOiB7XG4gICAgICBbSW5ub3J1dWtdOiBbTmVyaWFrVGhpcmRHYXRlXSxcbiAgICB9LFxuICAgIFtEV0FSRl06IHtcbiAgICAgIFtCcmVsbFNlcmlsaXNdOiBbTm9ydGhLYWxhZGltXSxcbiAgICB9LFxuICAgIFtFUlVESVRFXToge1xuICAgICAgW0NhemljVGh1bGVdOiBbUGFpbmVlbF0sXG4gICAgICBbUHJleHVzXSAgICA6IFtFcnVkaW5dLFxuICAgICAgW1F1ZWxsaW91c10gOiBbRXJ1ZGluXSxcbiAgICB9LFxuICAgIFtHTk9NRV06IHtcbiAgICAgIFtCZXJ0b3h4dWxvdXNdOiBbQWtBbm9uXSxcbiAgICAgIFtCcmVsbFNlcmlsaXNdOiBbQWtBbm9uXSxcbiAgICAgIFtCcmlzdGxlYmFuZV0gOiBbQWtBbm9uXSxcbiAgICB9LFxuICAgIFtIQUxGTElOR106IHtcbiAgICAgIFtCcmlzdGxlYmFuZV06IFtSaXZlcnZhbGVdLFxuICAgIH0sXG4gICAgW0hJR0hFTEZdOiB7XG4gICAgICBbVHVuYXJlXTogW05vcnRoZXJuRmVsd2l0aGVdLFxuICAgIH0sXG4gICAgW0hVTUFOXToge1xuICAgICAgW0JlcnRveHh1bG91c10gOiBbUWV5bm9zQXF1ZWR1Y3RzXSxcbiAgICAgIFtFcm9sbGlzaU1hcnJdIDogW05vcnRoRnJlZXBvcnRdLFxuICAgICAgW0lubm9ydXVrXSAgICAgOiBbRWFzdEZyZWVwb3J0XSxcbiAgICAgIFtLYXJhbmFdICAgICAgIDogW1NvdXRoUWV5bm9zXSxcbiAgICAgIFtNaXRoYW5pZWxNYXJyXTogW05vcnRoRnJlZXBvcnRdLFxuICAgICAgW1JvZGNldE5pZmVdICAgOiBbTm9ydGhRZXlub3NdLFxuICAgIH0sXG4gIH0sXG4gIFtFTkNdOiB7XG4gICAgW0RBUktFTEZdOiB7XG4gICAgICBbQWdub3N0aWNdOiBbTmVyaWFrQ29tbW9uc10sXG4gICAgICBbSW5ub3J1dWtdOiBbTmVyaWFrQ29tbW9uc10sXG4gICAgfSxcbiAgICBbRVJVRElURV06IHtcbiAgICAgIFtBZ25vc3RpY10gOiBbRXJ1ZGluUGFsYWNlXSxcbiAgICAgIFtQcmV4dXNdICAgOiBbRXJ1ZGluUGFsYWNlXSxcbiAgICAgIFtRdWVsbGlvdXNdOiBbRXJ1ZGluUGFsYWNlXSxcbiAgICB9LFxuICAgIFtHTk9NRV06IHtcbiAgICAgIFtBZ25vc3RpY10gICAgOiBbQWtBbm9uXSxcbiAgICAgIFtCZXJ0b3h4dWxvdXNdOiBbQWtBbm9uXSxcbiAgICAgIFtCcmVsbFNlcmlsaXNdOiBbQWtBbm9uXSxcbiAgICB9LFxuICAgIFtISUdIRUxGXToge1xuICAgICAgW0Fnbm9zdGljXSAgICAgOiBbU291dGhlcm5GZWx3aXRoZV0sXG4gICAgICBbRXJvbGxpc2lNYXJyXSA6IFtTb3V0aGVybkZlbHdpdGhlXSxcbiAgICAgIFtLYXJhbmFdICAgICAgIDogW1NvdXRoZXJuRmVsd2l0aGVdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbU291dGhlcm5GZWx3aXRoZV0sXG4gICAgICBbVHVuYXJlXSAgICAgICA6IFtTb3V0aGVybkZlbHdpdGhlXSxcbiAgICB9LFxuICAgIFtIVU1BTl06IHtcbiAgICAgIFtBZ25vc3RpY10gICAgIDogW1NvdXRoUWV5bm9zLCBXZXN0RnJlZXBvcnRdLFxuICAgICAgW0JlcnRveHh1bG91c10gOiBbUWV5bm9zQXF1ZWR1Y3RzXSxcbiAgICAgIFtFcm9sbGlzaU1hcnJdIDogW1dlc3RGcmVlcG9ydF0sXG4gICAgICBbSW5ub3J1dWtdICAgICA6IFtFYXN0RnJlZXBvcnRdLFxuICAgICAgW0thcmFuYV0gICAgICAgOiBbU291dGhRZXlub3NdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbV2VzdEZyZWVwb3J0XSxcbiAgICAgIFtSb2RjZXROaWZlXSAgIDogW1NvdXRoUWV5bm9zXSxcbiAgICB9LFxuICB9LFxuICBbTUFHXToge1xuICAgIFtEQVJLRUxGXToge1xuICAgICAgW0Fnbm9zdGljXTogW05lcmlha0NvbW1vbnNdLFxuICAgICAgW0lubm9ydXVrXTogW05lcmlha0NvbW1vbnNdLFxuICAgIH0sXG4gICAgW0VSVURJVEVdOiB7XG4gICAgICBbQWdub3N0aWNdIDogW0VydWRpblBhbGFjZV0sXG4gICAgICBbUHJleHVzXSAgIDogW0VydWRpblBhbGFjZV0sXG4gICAgICBbUXVlbGxpb3VzXTogW0VydWRpblBhbGFjZV0sXG4gICAgfSxcbiAgICBbR05PTUVdOiB7XG4gICAgICBbQWdub3N0aWNdICAgIDogW0FrQW5vbl0sXG4gICAgICBbQmVydG94eHVsb3VzXTogW0FrQW5vbl0sXG4gICAgICBbQnJlbGxTZXJpbGlzXTogW0FrQW5vbl0sXG4gICAgfSxcbiAgICBbSElHSEVMRl06IHtcbiAgICAgIFtBZ25vc3RpY10gICAgIDogW1NvdXRoZXJuRmVsd2l0aGVdLFxuICAgICAgW0Vyb2xsaXNpTWFycl0gOiBbU291dGhlcm5GZWx3aXRoZV0sXG4gICAgICBbS2FyYW5hXSAgICAgICA6IFtTb3V0aGVybkZlbHdpdGhlXSxcbiAgICAgIFtNaXRoYW5pZWxNYXJyXTogW1NvdXRoZXJuRmVsd2l0aGVdLFxuICAgICAgW1R1bmFyZV0gICAgICAgOiBbU291dGhlcm5GZWx3aXRoZV0sXG4gICAgfSxcbiAgICBbSFVNQU5dOiB7XG4gICAgICBbQWdub3N0aWNdICAgICA6IFtTb3V0aFFleW5vcywgV2VzdEZyZWVwb3J0XSxcbiAgICAgIFtCZXJ0b3h4dWxvdXNdIDogW1FleW5vc0FxdWVkdWN0c10sXG4gICAgICBbRXJvbGxpc2lNYXJyXSA6IFtXZXN0RnJlZXBvcnRdLFxuICAgICAgW0lubm9ydXVrXSAgICAgOiBbRWFzdEZyZWVwb3J0XSxcbiAgICAgIFtLYXJhbmFdICAgICAgIDogW1NvdXRoUWV5bm9zXSxcbiAgICAgIFtNaXRoYW5pZWxNYXJyXTogW1dlc3RGcmVlcG9ydF0sXG4gICAgICBbUm9kY2V0TmlmZV0gICA6IFtTb3V0aFFleW5vc10sXG4gICAgfSxcbiAgfSxcbiAgW01OS106IHtcbiAgICBbSFVNQU5dOiB7XG4gICAgICBbQWdub3N0aWNdIDogW05vcnRoUWV5bm9zXSxcbiAgICAgIFtRdWVsbGlvdXNdOiBbV2VzdEZyZWVwb3J0XSxcbiAgICB9LFxuICB9LFxuICBbTkVDXToge1xuICAgIFtEQVJLRUxGXToge1xuICAgICAgW0lubm9ydXVrXTogW05lcmlha1RoaXJkR2F0ZV0sXG4gICAgfSxcbiAgICBbRVJVRElURV06IHtcbiAgICAgIFtDYXppY1RodWxlXTogW1BhaW5lZWxdLFxuICAgIH0sXG4gICAgW0dOT01FXToge1xuICAgICAgW0JlcnRveHh1bG91c106IFtBa0Fub25dLFxuICAgIH0sXG4gICAgW0hVTUFOXToge1xuICAgICAgW0JlcnRveHh1bG91c106IFtRZXlub3NBcXVlZHVjdHNdLFxuICAgICAgW0lubm9ydXVrXSAgICA6IFtFYXN0RnJlZXBvcnRdLFxuICAgIH0sXG4gIH0sXG4gIFtQQUxdOiB7XG4gICAgW0RXQVJGXToge1xuICAgICAgW0JyZWxsU2VyaWxpc106IFtOb3J0aEthbGFkaW1dLFxuICAgIH0sXG4gICAgW0VSVURJVEVdOiB7XG4gICAgICBbUHJleHVzXSAgIDogW0VydWRpbl0sXG4gICAgICBbUXVlbGxpb3VzXTogW0VydWRpbl0sXG4gICAgfSxcbiAgICBbR05PTUVdOiB7XG4gICAgICBbQnJlbGxTZXJpbGlzXTogW0FrQW5vbl0sXG4gICAgfSxcbiAgICBbSEFMRkVMRl06IHtcbiAgICAgIFtFcm9sbGlzaU1hcnJdIDogW05vcnRoRnJlZXBvcnRdLFxuICAgICAgW0thcmFuYV0gICAgICAgOiBbU291dGhRZXlub3NdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbTm9ydGhGcmVlcG9ydF0sXG4gICAgICBbUm9kY2V0TmlmZV0gICA6IFtTb3V0aFFleW5vc10sXG4gICAgICBbVHVuYXJlXSAgICAgICA6IFtOb3J0aGVybkZlbHdpdGhlXSxcbiAgICB9LFxuICAgIFtIQUxGTElOR106IHtcbiAgICAgIFtLYXJhbmFdOiBbUml2ZXJ2YWxlXSxcbiAgICB9LFxuICAgIFtISUdIRUxGXToge1xuICAgICAgW1R1bmFyZV06IFtOb3J0aGVybkZlbHdpdGhlXSxcbiAgICB9LFxuICAgIFtIVU1BTl06IHtcbiAgICAgIFtFcm9sbGlzaU1hcnJdIDogW05vcnRoRnJlZXBvcnRdLFxuICAgICAgW0thcmFuYV0gICAgICAgOiBbU291dGhRZXlub3NdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbTm9ydGhGcmVlcG9ydF0sXG4gICAgICBbUm9kY2V0TmlmZV0gICA6IFtOb3J0aFFleW5vc10sXG4gICAgfSxcbiAgfSxcbiAgW1JOR106IHtcbiAgICBbSEFMRkVMRl06IHtcbiAgICAgIFtLYXJhbmFdOiBbU3VyZWZhbGxHbGFkZV0sXG4gICAgICBbVHVuYXJlXTogW1N1cmVmYWxsR2xhZGUsIEdyZWF0ZXJGYXlkYXJrXSxcbiAgICB9LFxuICAgIFtIQUxGTElOR106IHtcbiAgICAgIFtLYXJhbmFdOiBbUml2ZXJ2YWxlXSxcbiAgICB9LFxuICAgIFtIVU1BTl06IHtcbiAgICAgIFtLYXJhbmFdOiBbU3VyZWZhbGxHbGFkZV0sXG4gICAgICBbVHVuYXJlXTogW1N1cmVmYWxsR2xhZGVdLFxuICAgIH0sXG4gICAgW1dPT0RFTEZdOiB7XG4gICAgICBbVHVuYXJlXTogW0dyZWF0ZXJGYXlkYXJrXSxcbiAgICB9LFxuICB9LFxuICBbUk9HXToge1xuICAgIFtCQVJCQVJJQU5dOiB7XG4gICAgICBbQWdub3N0aWNdICAgOiBbSGFsYXNdLFxuICAgICAgW0JyaXN0bGViYW5lXTogW0hhbGFzXSxcbiAgICAgIFtUaGVUcmlidW5hbF06IFtIYWxhc10sXG4gICAgfSxcbiAgICBbREFSS0VMRl06IHtcbiAgICAgIFtBZ25vc3RpY10gICA6IFtOZXJpYWtUaGlyZEdhdGVdLFxuICAgICAgW0JyaXN0bGViYW5lXTogW05lcmlha1RoaXJkR2F0ZV0sXG4gICAgICBbSW5ub3J1dWtdICAgOiBbTmVyaWFrVGhpcmRHYXRlXSxcbiAgICB9LFxuICAgIFtEV0FSRl06IHtcbiAgICAgIFtBZ25vc3RpY10gICAgOiBbTm9ydGhLYWxhZGltXSxcbiAgICAgIFtCcmVsbFNlcmlsaXNdOiBbTm9ydGhLYWxhZGltXSxcbiAgICAgIFtCcmlzdGxlYmFuZV0gOiBbTm9ydGhLYWxhZGltXSxcbiAgICB9LFxuICAgIFtHTk9NRV06IHtcbiAgICAgIFtBZ25vc3RpY10gICAgOiBbQWtBbm9uXSxcbiAgICAgIFtCZXJ0b3h4dWxvdXNdOiBbQWtBbm9uXSxcbiAgICAgIFtCcmVsbFNlcmlsaXNdOiBbQWtBbm9uXSxcbiAgICAgIFtCcmlzdGxlYmFuZV0gOiBbQWtBbm9uXSxcbiAgICB9LFxuICAgIFtIQUxGRUxGXToge1xuICAgICAgW0Fnbm9zdGljXSAgICA6IFtOb3J0aFFleW5vcywgRWFzdEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbQmVydG94eHVsb3VzXTogW05vcnRoUWV5bm9zXSxcbiAgICAgIFtCcmlzdGxlYmFuZV0gOiBbTm9ydGhRZXlub3MsIEVhc3RGcmVlcG9ydCwgR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0Vyb2xsaXNpTWFycl06IFtFYXN0RnJlZXBvcnRdLFxuICAgICAgW0thcmFuYV0gICAgICA6IFtOb3J0aFFleW5vc10sXG4gICAgICBbUm9kY2V0TmlmZV0gIDogW05vcnRoUWV5bm9zXSxcbiAgICAgIFtUdW5hcmVdICAgICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgIH0sXG4gICAgW0hBTEZMSU5HXToge1xuICAgICAgW0Fnbm9zdGljXSAgICA6IFtSaXZlcnZhbGVdLFxuICAgICAgW0JyZWxsU2VyaWxpc106IFtSaXZlcnZhbGVdLFxuICAgICAgW0JyaXN0bGViYW5lXSA6IFtSaXZlcnZhbGVdLFxuICAgIH0sXG4gICAgW0hVTUFOXToge1xuICAgICAgW0Fnbm9zdGljXSAgICA6IFtOb3J0aFFleW5vcywgRWFzdEZyZWVwb3J0XSxcbiAgICAgIFtCZXJ0b3h4dWxvdXNdOiBbTm9ydGhRZXlub3NdLFxuICAgICAgW0JyaXN0bGViYW5lXSA6IFtOb3J0aFFleW5vcywgRWFzdEZyZWVwb3J0XSxcbiAgICAgIFtFcm9sbGlzaU1hcnJdOiBbRWFzdEZyZWVwb3J0XSxcbiAgICAgIFtJbm5vcnV1a10gICAgOiBbRWFzdEZyZWVwb3J0XSxcbiAgICAgIFtLYXJhbmFdICAgICAgOiBbTm9ydGhRZXlub3NdLFxuICAgICAgW1JvZGNldE5pZmVdICA6IFtOb3J0aFFleW5vc10sXG4gICAgfSxcbiAgICBbV09PREVMRl06IHtcbiAgICAgIFtBZ25vc3RpY10gICA6IFtHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbQnJpc3RsZWJhbmVdOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0thcmFuYV0gICAgIDogW0dyZWF0ZXJGYXlkYXJrXSxcbiAgICAgIFtUdW5hcmVdICAgICA6IFtHcmVhdGVyRmF5ZGFya10sXG4gICAgfSxcbiAgfSxcbiAgW1NIRF06IHtcbiAgICBbREFSS0VMRl06IHtcbiAgICAgIFtJbm5vcnV1a106IFtOZXJpYWtUaGlyZEdhdGVdLFxuICAgIH0sXG4gICAgW0VSVURJVEVdOiB7XG4gICAgICBbQ2F6aWNUaHVsZV06IFtQYWluZWVsXSxcbiAgICB9LFxuICAgIFtHTk9NRV06IHtcbiAgICAgIFtCZXJ0b3h4dWxvdXNdOiBbQWtBbm9uXSxcbiAgICB9LFxuICAgIFtIVU1BTl06IHtcbiAgICAgIFtCZXJ0b3h4dWxvdXNdOiBbUWV5bm9zQXF1ZWR1Y3RzXSxcbiAgICAgIFtJbm5vcnV1a10gICAgOiBbRWFzdEZyZWVwb3J0XSxcbiAgICB9LFxuICAgIFtPR1JFXToge1xuICAgICAgW0NhemljVGh1bGVdOiBbT2dnb2tdLFxuICAgICAgW1JhbGxvc1pla10gOiBbT2dnb2tdLFxuICAgIH0sXG4gICAgW1RST0xMXToge1xuICAgICAgW0NhemljVGh1bGVdOiBbR3JvYmJdLFxuICAgICAgW0lubm9ydXVrXSAgOiBbR3JvYmJdLFxuICAgIH0sXG4gIH0sXG4gIFtTSE1dOiB7XG4gICAgW0JBUkJBUklBTl06IHtcbiAgICAgIFtUaGVUcmlidW5hbF06IFtIYWxhc10sXG4gICAgfSxcbiAgICBbT0dSRV06IHtcbiAgICAgIFtSYWxsb3NaZWtdOiBbT2dnb2tdLFxuICAgIH0sXG4gICAgW1RST0xMXToge1xuICAgICAgW0NhemljVGh1bGVdOiBbR3JvYmJdLFxuICAgICAgW0lubm9ydXVrXSAgOiBbR3JvYmJdLFxuICAgIH0sXG4gIH0sXG4gIFtXQVJdOiB7XG4gICAgW0JBUkJBUklBTl06IHtcbiAgICAgIFtBZ25vc3RpY10gICA6IFtIYWxhc10sXG4gICAgICBbUmFsbG9zWmVrXSAgOiBbSGFsYXNdLFxuICAgICAgW1RoZVRyaWJ1bmFsXTogW0hhbGFzXSxcbiAgICB9LFxuICAgIFtEQVJLRUxGXToge1xuICAgICAgW0Fnbm9zdGljXSA6IFtOZXJpYWtDb21tb25zXSxcbiAgICAgIFtJbm5vcnV1a10gOiBbTmVyaWFrQ29tbW9uc10sXG4gICAgICBbUmFsbG9zWmVrXTogW05lcmlha0NvbW1vbnNdLFxuICAgIH0sXG4gICAgW0RXQVJGXToge1xuICAgICAgW0Fnbm9zdGljXSAgICA6IFtTb3V0aEthbGFkaW1dLFxuICAgICAgW0JyZWxsU2VyaWxpc106IFtTb3V0aEthbGFkaW1dLFxuICAgIH0sXG4gICAgW0dOT01FXToge1xuICAgICAgW0Fnbm9zdGljXSAgICA6IFtBa0Fub25dLFxuICAgICAgW0JlcnRveHh1bG91c106IFtBa0Fub25dLFxuICAgICAgW0JyZWxsU2VyaWxpc106IFtBa0Fub25dLFxuICAgICAgW1JhbGxvc1pla10gICA6IFtBa0Fub25dLFxuICAgIH0sXG4gICAgW0hBTEZFTEZdOiB7XG4gICAgICBbQWdub3N0aWNdICAgICA6IFtTb3V0aFFleW5vcywgV2VzdEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbQmVydG94eHVsb3VzXSA6IFtTb3V0aFFleW5vc10sXG4gICAgICBbRXJvbGxpc2lNYXJyXSA6IFtXZXN0RnJlZXBvcnRdLFxuICAgICAgW0lubm9ydXVrXSAgICAgOiBbV2VzdEZyZWVwb3J0XSxcbiAgICAgIFtLYXJhbmFdICAgICAgIDogW1NvdXRoUWV5bm9zXSxcbiAgICAgIFtNaXRoYW5pZWxNYXJyXTogW1dlc3RGcmVlcG9ydF0sXG4gICAgICBbUHJleHVzXSAgICAgICA6IFtTb3V0aFFleW5vcywgV2VzdEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbUmFsbG9zWmVrXSAgICA6IFtTb3V0aFFleW5vcywgV2VzdEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbUm9kY2V0TmlmZV0gICA6IFtTb3V0aFFleW5vc10sXG4gICAgICBbVGhlVHJpYnVuYWxdICA6IFtTb3V0aFFleW5vcywgV2VzdEZyZWVwb3J0LCBHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbVHVuYXJlXSAgICAgICA6IFtHcmVhdGVyRmF5ZGFya10sXG4gICAgfSxcbiAgICBbSEFMRkxJTkddOiB7XG4gICAgICBbQWdub3N0aWNdICAgIDogW1JpdmVydmFsZV0sXG4gICAgICBbQnJlbGxTZXJpbGlzXTogW1JpdmVydmFsZV0sXG4gICAgICBbUmFsbG9zWmVrXSAgIDogW1JpdmVydmFsZV0sXG4gICAgfSxcbiAgICBbSFVNQU5dOiB7XG4gICAgICBbQWdub3N0aWNdICAgICA6IFtTb3V0aFFleW5vcywgV2VzdEZyZWVwb3J0XSxcbiAgICAgIFtCZXJ0b3h4dWxvdXNdIDogW1NvdXRoUWV5bm9zXSxcbiAgICAgIFtFcm9sbGlzaU1hcnJdIDogW1dlc3RGcmVlcG9ydF0sXG4gICAgICBbSW5ub3J1dWtdICAgICA6IFtXZXN0RnJlZXBvcnRdLFxuICAgICAgW0thcmFuYV0gICAgICAgOiBbU291dGhRZXlub3NdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbV2VzdEZyZWVwb3J0XSxcbiAgICAgIFtSYWxsb3NaZWtdICAgIDogW1NvdXRoUWV5bm9zLCBXZXN0RnJlZXBvcnRdLFxuICAgICAgW1JvZGNldE5pZmVdICAgOiBbU291dGhRZXlub3NdLFxuICAgIH0sXG4gICAgW09HUkVdOiB7XG4gICAgICBbQWdub3N0aWNdICA6IFtPZ2dva10sXG4gICAgICBbQ2F6aWNUaHVsZV06IFtPZ2dva10sXG4gICAgICBbUmFsbG9zWmVrXSA6IFtPZ2dva10sXG4gICAgfSxcbiAgICBbVFJPTExdOiB7XG4gICAgICBbQWdub3N0aWNdICA6IFtHcm9iYl0sXG4gICAgICBbQ2F6aWNUaHVsZV06IFtHcm9iYl0sXG4gICAgICBbSW5ub3J1dWtdICA6IFtHcm9iYl0sXG4gICAgICBbUmFsbG9zWmVrXSA6IFtHcm9iYl0sXG4gICAgfSxcbiAgICBbV09PREVMRl06IHtcbiAgICAgIFtBZ25vc3RpY10gOiBbR3JlYXRlckZheWRhcmtdLFxuICAgICAgW0thcmFuYV0gICA6IFtHcmVhdGVyRmF5ZGFya10sXG4gICAgICBbUmFsbG9zWmVrXTogW0dyZWF0ZXJGYXlkYXJrXSxcbiAgICAgIFtUdW5hcmVdICAgOiBbR3JlYXRlckZheWRhcmtdLFxuICAgIH0sXG4gIH0sXG4gIFtXSVpdOiB7XG4gICAgW0RBUktFTEZdOiB7XG4gICAgICBbQWdub3N0aWNdIDogW05lcmlha0NvbW1vbnNdLFxuICAgICAgW0lubm9ydXVrXSA6IFtOZXJpYWtDb21tb25zXSxcbiAgICAgIFtTb2x1c2VrUm9dOiBbTmVyaWFrQ29tbW9uc10sXG4gICAgfSxcbiAgICBbRVJVRElURV06IHtcbiAgICAgIFtBZ25vc3RpY10gOiBbRXJ1ZGluUGFsYWNlXSxcbiAgICAgIFtQcmV4dXNdICAgOiBbRXJ1ZGluUGFsYWNlXSxcbiAgICAgIFtRdWVsbGlvdXNdOiBbRXJ1ZGluUGFsYWNlXSxcbiAgICAgIFtTb2x1c2VrUm9dOiBbRXJ1ZGluUGFsYWNlXSxcbiAgICB9LFxuICAgIFtHTk9NRV06IHtcbiAgICAgIFtBZ25vc3RpY10gICAgOiBbQWtBbm9uXSxcbiAgICAgIFtCZXJ0b3h4dWxvdXNdOiBbQWtBbm9uXSxcbiAgICAgIFtCcmVsbFNlcmlsaXNdOiBbQWtBbm9uXSxcbiAgICAgIFtTb2x1c2VrUm9dICAgOiBbQWtBbm9uXSxcbiAgICB9LFxuICAgIFtISUdIRUxGXToge1xuICAgICAgW0Fnbm9zdGljXSAgICAgOiBbU291dGhlcm5GZWx3aXRoZV0sXG4gICAgICBbRXJvbGxpc2lNYXJyXSA6IFtTb3V0aGVybkZlbHdpdGhlXSxcbiAgICAgIFtLYXJhbmFdICAgICAgIDogW1NvdXRoZXJuRmVsd2l0aGVdLFxuICAgICAgW01pdGhhbmllbE1hcnJdOiBbU291dGhlcm5GZWx3aXRoZV0sXG4gICAgICBbU29sdXNla1JvXSAgICA6IFtTb3V0aGVybkZlbHdpdGhlXSxcbiAgICAgIFtUdW5hcmVdICAgICAgIDogW1NvdXRoZXJuRmVsd2l0aGVdLFxuICAgIH0sXG4gICAgW0hVTUFOXToge1xuICAgICAgW0Fnbm9zdGljXSAgICAgOiBbU291dGhRZXlub3MsIFdlc3RGcmVlcG9ydF0sXG4gICAgICBbQmVydG94eHVsb3VzXSA6IFtRZXlub3NBcXVlZHVjdHNdLFxuICAgICAgW0Vyb2xsaXNpTWFycl0gOiBbV2VzdEZyZWVwb3J0XSxcbiAgICAgIFtJbm5vcnV1a10gICAgIDogW0Vhc3RGcmVlcG9ydF0sXG4gICAgICBbS2FyYW5hXSAgICAgICA6IFtTb3V0aFFleW5vc10sXG4gICAgICBbTWl0aGFuaWVsTWFycl06IFtXZXN0RnJlZXBvcnRdLFxuICAgICAgW1JvZGNldE5pZmVdICAgOiBbU291dGhRZXlub3NdLFxuICAgICAgW1NvbHVzZWtSb10gICAgOiBbU291dGhRZXlub3MsIFdlc3RGcmVlcG9ydF0sXG4gICAgfSxcbiAgfSxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCBjb25zdCBnZXRBdmFpbGFibGVEZWl0aWVzID0gKHJhY2UsIGNsYXNzSWQpID0+IHtcbiAgc3dpdGNoIChjbGFzc0lkKSB7XG4gICAgY2FzZSBCUkQ6XG4gICAgICByZXR1cm4gW1xuICAgICAgICBBZ25vc3RpYyxcbiAgICAgICAgQnJlbGxTZXJpbGlzLFxuICAgICAgICBCcmlzdGxlYmFuZSxcbiAgICAgICAgRXJvbGxpc2lNYXJyLFxuICAgICAgICBLYXJhbmEsXG4gICAgICAgIE1pdGhhbmllbE1hcnIsXG4gICAgICAgIFByZXh1cyxcbiAgICAgICAgUXVlbGxpb3VzLFxuICAgICAgICBSYWxsb3NaZWssXG4gICAgICAgIFNvbHVzZWtSbyxcbiAgICAgICAgVGhlVHJpYnVuYWwsXG4gICAgICAgIFR1bmFyZSxcbiAgICAgICAgVmVlc2hhbixcbiAgICAgIF07XG4gICAgY2FzZSBDTFI6IHtcbiAgICAgIHN3aXRjaCAocmFjZSkge1xuICAgICAgICBjYXNlIERBUktFTEY6XG4gICAgICAgICAgcmV0dXJuIFtJbm5vcnV1a107XG4gICAgICAgIGNhc2UgRFdBUkY6XG4gICAgICAgICAgcmV0dXJuIFtCcmVsbFNlcmlsaXNdO1xuICAgICAgICBjYXNlIEVSVURJVEU6XG4gICAgICAgICAgcmV0dXJuIFtQcmV4dXMsIFF1ZWxsaW91c107XG4gICAgICAgIGNhc2UgR05PTUU6XG4gICAgICAgICAgcmV0dXJuIFtCcmVsbFNlcmlsaXMsIEJlcnRveHh1bG91cywgQnJpc3RsZWJhbmVdO1xuICAgICAgICBjYXNlIEhBTEZMSU5HOlxuICAgICAgICAgIHJldHVybiBbQnJpc3RsZWJhbmVdO1xuICAgICAgICBjYXNlIEhJR0hFTEY6XG4gICAgICAgICAgcmV0dXJuIFtUdW5hcmVdO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICB9XG4gICAgY2FzZSBEUlU6IHtcbiAgICAgIHN3aXRjaCAocmFjZSkge1xuICAgICAgICBjYXNlIEhBTEZFTEY6XG4gICAgICAgIGNhc2UgSFVNQU46XG4gICAgICAgICAgcmV0dXJuIFtLYXJhbmEsIFR1bmFyZV07XG4gICAgICAgIGNhc2UgSEFMRkxJTkc6XG4gICAgICAgICAgcmV0dXJuIFtLYXJhbmFdO1xuICAgICAgICBjYXNlIFdPT0RFTEY6XG4gICAgICAgICAgcmV0dXJuIFtUdW5hcmVdO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICB9XG4gICAgY2FzZSBNQUc6XG4gICAgY2FzZSBFTkM6IHtcbiAgICAgIHN3aXRjaCAocmFjZSkge1xuICAgICAgICBjYXNlIERBUktFTEY6XG4gICAgICAgICAgcmV0dXJuIFtBZ25vc3RpYywgSW5ub3J1dWtdO1xuICAgICAgICBjYXNlIEVSVURJVEU6XG4gICAgICAgICAgcmV0dXJuIFtBZ25vc3RpYywgUHJleHVzLCBRdWVsbGlvdXNdO1xuICAgICAgICBjYXNlIEdOT01FOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEJlcnRveHh1bG91cywgQnJlbGxTZXJpbGlzXTtcbiAgICAgICAgY2FzZSBISUdIRUxGOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEVyb2xsaXNpTWFyciwgS2FyYW5hLCBNaXRoYW5pZWxNYXJyLCBUdW5hcmVdO1xuICAgICAgICBjYXNlIEhVTUFOOlxuICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBBZ25vc3RpYyxcbiAgICAgICAgICAgIEJlcnRveHh1bG91cyxcbiAgICAgICAgICAgIEVyb2xsaXNpTWFycixcbiAgICAgICAgICAgIElubm9ydXVrLFxuICAgICAgICAgICAgS2FyYW5hLFxuICAgICAgICAgICAgTWl0aGFuaWVsTWFycixcbiAgICAgICAgICAgIFJvZGNldE5pZmUsXG4gICAgICAgICAgICBUdW5hcmUsXG4gICAgICAgICAgXTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgfVxuICAgIGNhc2UgTU5LOlxuICAgICAgcmV0dXJuIFtBZ25vc3RpYywgUXVlbGxpb3VzXTtcbiAgICBjYXNlIE5FQzoge1xuICAgICAgc3dpdGNoIChyYWNlKSB7XG4gICAgICAgIGNhc2UgREFSS0VMRjpcbiAgICAgICAgICByZXR1cm4gW0lubm9ydXVrXTtcbiAgICAgICAgY2FzZSBFUlVESVRFOlxuICAgICAgICAgIHJldHVybiBbQ2F6aWNUaHVsZV07XG4gICAgICAgIGNhc2UgR05PTUU6XG4gICAgICAgICAgcmV0dXJuIFtCZXJ0b3h4dWxvdXNdO1xuICAgICAgICBjYXNlIEhVTUFOOlxuICAgICAgICAgIHJldHVybiBbQmVydG94eHVsb3VzLCBJbm5vcnV1a107XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXNlIFBBTDoge1xuICAgICAgc3dpdGNoIChyYWNlKSB7XG4gICAgICAgIGNhc2UgRFdBUkY6XG4gICAgICAgICAgcmV0dXJuIFtCcmVsbFNlcmlsaXNdO1xuICAgICAgICBjYXNlIEVSVURJVEU6XG4gICAgICAgICAgcmV0dXJuIFtQcmV4dXMsIFF1ZWxsaW91c107XG4gICAgICAgIGNhc2UgSEFMRkVMRjpcbiAgICAgICAgICByZXR1cm4gW0Vyb2xsaXNpTWFyciwgS2FyYW5hLCBNaXRoYW5pZWxNYXJyLCBSb2RjZXROaWZlLCBUdW5hcmVdO1xuICAgICAgICBjYXNlIEhJR0hFTEY6XG4gICAgICAgICAgcmV0dXJuIFtUdW5hcmVdO1xuICAgICAgICBjYXNlIEhVTUFOOlxuICAgICAgICAgIHJldHVybiBbRXJvbGxpc2lNYXJyLCBLYXJhbmEsIE1pdGhhbmllbE1hcnIsIFJvZGNldE5pZmVdO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICB9XG4gICAgY2FzZSBSTkc6IHtcbiAgICAgIHN3aXRjaCAocmFjZSkge1xuICAgICAgICBjYXNlIEhBTEZFTEY6XG4gICAgICAgIGNhc2UgSFVNQU46XG4gICAgICAgICAgcmV0dXJuIFtLYXJhbmEsIFR1bmFyZV07XG4gICAgICAgIGNhc2UgV09PREVMRjpcbiAgICAgICAgICByZXR1cm4gW1R1bmFyZV07XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXNlIFJPRzoge1xuICAgICAgc3dpdGNoIChyYWNlKSB7XG4gICAgICAgIGNhc2UgQkFSQkFSSUFOOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEJyaXN0bGViYW5lLCBUaGVUcmlidW5hbF07XG4gICAgICAgIGNhc2UgREFSS0VMRjpcbiAgICAgICAgICByZXR1cm4gW0Fnbm9zdGljLCBCcmlzdGxlYmFuZSwgSW5ub3J1dWtdO1xuICAgICAgICBjYXNlIERXQVJGOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEJyZWxsU2VyaWxpcywgQnJpc3RsZWJhbmVdO1xuICAgICAgICBjYXNlIEdOT01FOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEJlcnRveHh1bG91cywgQnJlbGxTZXJpbGlzLCBCcmlzdGxlYmFuZV07XG4gICAgICAgIGNhc2UgSEFMRkVMRjpcbiAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgQWdub3N0aWMsXG4gICAgICAgICAgICBCZXJ0b3h4dWxvdXMsXG4gICAgICAgICAgICBCcmlzdGxlYmFuZSxcbiAgICAgICAgICAgIEVyb2xsaXNpTWFycixcbiAgICAgICAgICAgIEthcmFuYSxcbiAgICAgICAgICAgIFJvZGNldE5pZmUsXG4gICAgICAgICAgICBUdW5hcmUsXG4gICAgICAgICAgXTtcbiAgICAgICAgY2FzZSBIQUxGTElORzpcbiAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgQWdub3N0aWMsXG4gICAgICAgICAgICBCcmVsbFNlcmlsaXMsXG4gICAgICAgICAgICBCcmlzdGxlYmFuZSxcbiAgICAgICAgICAgIEVyb2xsaXNpTWFycixcbiAgICAgICAgICAgIElubm9ydXVrLFxuICAgICAgICAgICAgS2FyYW5hLFxuICAgICAgICAgIF07XG4gICAgICAgIGNhc2UgSFVNQU46XG4gICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIEFnbm9zdGljLFxuICAgICAgICAgICAgQmVydG94eHVsb3VzLFxuICAgICAgICAgICAgQnJpc3RsZWJhbmUsXG4gICAgICAgICAgICBFcm9sbGlzaU1hcnIsXG4gICAgICAgICAgICBJbm5vcnV1ayxcbiAgICAgICAgICAgIEthcmFuYSxcbiAgICAgICAgICAgIFJvZGNldE5pZmUsXG4gICAgICAgICAgXTtcbiAgICAgICAgY2FzZSBXT09ERUxGOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEJyaXN0bGViYW5lLCBLYXJhbmEsIFR1bmFyZV07XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXNlIFNIRDoge1xuICAgICAgc3dpdGNoIChyYWNlKSB7XG4gICAgICAgIGNhc2UgREFSS0VMRjpcbiAgICAgICAgICByZXR1cm4gW0lubm9ydXVrXTtcbiAgICAgICAgY2FzZSBFUlVESVRFOlxuICAgICAgICAgIHJldHVybiBbQ2F6aWNUaHVsZV07XG4gICAgICAgIGNhc2UgSFVNQU46XG4gICAgICAgICAgcmV0dXJuIFtCZXJ0b3h4dWxvdXMsIElubm9ydXVrXTtcbiAgICAgICAgY2FzZSBPR1JFOlxuICAgICAgICAgIHJldHVybiBbQ2F6aWNUaHVsZSwgUmFsbG9zWmVrXTtcbiAgICAgICAgY2FzZSBUUk9MTDpcbiAgICAgICAgICByZXR1cm4gW0NhemljVGh1bGUsIElubm9ydXVrXTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgfVxuICAgIGNhc2UgU0hNOiB7XG4gICAgICBzd2l0Y2ggKHJhY2UpIHtcbiAgICAgICAgY2FzZSBCQVJCQVJJQU46XG4gICAgICAgICAgcmV0dXJuIFtUaGVUcmlidW5hbF07XG4gICAgICAgIGNhc2UgT0dSRTpcbiAgICAgICAgICByZXR1cm4gW1JhbGxvc1pla107XG4gICAgICAgIGNhc2UgVFJPTEw6XG4gICAgICAgICAgcmV0dXJuIFtDYXppY1RodWxlLCBJbm5vcnV1a107XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXNlIFdBUjoge1xuICAgICAgc3dpdGNoIChyYWNlKSB7XG4gICAgICAgIGNhc2UgQkFSQkFSSUFOOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIFJhbGxvc1playwgVGhlVHJpYnVuYWxdO1xuICAgICAgICBjYXNlIERBUktFTEY6XG4gICAgICAgICAgcmV0dXJuIFtBZ25vc3RpYywgSW5ub3J1dWssIFJhbGxvc1pla107XG4gICAgICAgIGNhc2UgRFdBUkY6XG4gICAgICAgICAgcmV0dXJuIFtBZ25vc3RpYywgQnJlbGxTZXJpbGlzXTtcbiAgICAgICAgY2FzZSBHTk9NRTpcbiAgICAgICAgICByZXR1cm4gW0Fnbm9zdGljLCBCZXJ0b3h4dWxvdXMsIEJyZWxsU2VyaWxpcywgUmFsbG9zWmVrXTtcbiAgICAgICAgY2FzZSBIQUxGRUxGOlxuICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBBZ25vc3RpYyxcbiAgICAgICAgICAgIEJlcnRveHh1bG91cyxcbiAgICAgICAgICAgIEVyb2xsaXNpTWFycixcbiAgICAgICAgICAgIElubm9ydXVrLFxuICAgICAgICAgICAgS2FyYW5hLFxuICAgICAgICAgICAgTWl0aGFuaWVsTWFycixcbiAgICAgICAgICAgIFByZXh1cyxcbiAgICAgICAgICAgIFJhbGxvc1playxcbiAgICAgICAgICAgIFJvZGNldE5pZmUsXG4gICAgICAgICAgICBUaGVUcmlidW5hbCxcbiAgICAgICAgICAgIFR1bmFyZSxcbiAgICAgICAgICBdO1xuICAgICAgICBjYXNlIEhBTEZMSU5HOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEJyZWxsU2VyaWxpcywgUmFsbG9zWmVrXTtcbiAgICAgICAgY2FzZSBIVU1BTjpcbiAgICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgQWdub3N0aWMsXG4gICAgICAgICAgICBCZXJ0b3h4dWxvdXMsXG4gICAgICAgICAgICBFcm9sbGlzaU1hcnIsXG4gICAgICAgICAgICBJbm5vcnV1ayxcbiAgICAgICAgICAgIEthcmFuYSxcbiAgICAgICAgICAgIE1pdGhhbmllbE1hcnIsXG4gICAgICAgICAgICBSYWxsb3NaZWssXG4gICAgICAgICAgICBSb2RjZXROaWZlLFxuICAgICAgICAgIF07XG4gICAgICAgIGNhc2UgT0dSRTpcbiAgICAgICAgICByZXR1cm4gW0Fnbm9zdGljLCBDYXppY1RodWxlLCBSYWxsb3NaZWtdO1xuICAgICAgICBjYXNlIFRST0xMOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIENhemljVGh1bGUsIElubm9ydXVrLCBSYWxsb3NaZWtdO1xuICAgICAgICBjYXNlIFdPT0RFTEY6XG4gICAgICAgICAgcmV0dXJuIFtBZ25vc3RpYywgS2FyYW5hLCBSYWxsb3NaZWssIFR1bmFyZV07XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXNlIFdJWjoge1xuICAgICAgc3dpdGNoIChyYWNlKSB7XG4gICAgICAgIGNhc2UgREFSS0VMRjpcbiAgICAgICAgICByZXR1cm4gW0Fnbm9zdGljLCBJbm5vcnV1aywgU29sdXNla1JvXTtcbiAgICAgICAgY2FzZSBFUlVESVRFOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIFByZXh1cywgUXVlbGxpb3VzLCBTb2x1c2VrUm9dO1xuICAgICAgICBjYXNlIEdOT01FOlxuICAgICAgICAgIHJldHVybiBbQWdub3N0aWMsIEJlcnRveHh1bG91cywgQnJlbGxTZXJpbGlzLCBTb2x1c2VrUm9dO1xuICAgICAgICBjYXNlIEhJR0hFTEY6XG4gICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIEFnbm9zdGljLFxuICAgICAgICAgICAgRXJvbGxpc2lNYXJyLFxuICAgICAgICAgICAgS2FyYW5hLFxuICAgICAgICAgICAgTWl0aGFuaWVsTWFycixcbiAgICAgICAgICAgIFR1bmFyZSxcbiAgICAgICAgICAgIFNvbHVzZWtSbyxcbiAgICAgICAgICBdO1xuICAgICAgICBjYXNlIEhVTUFOOlxuICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBBZ25vc3RpYyxcbiAgICAgICAgICAgIEJlcnRveHh1bG91cyxcbiAgICAgICAgICAgIEVyb2xsaXNpTWFycixcbiAgICAgICAgICAgIElubm9ydXVrLFxuICAgICAgICAgICAgS2FyYW5hLFxuICAgICAgICAgICAgTWl0aGFuaWVsTWFycixcbiAgICAgICAgICAgIFJvZGNldE5pZmUsXG4gICAgICAgICAgICBUdW5hcmUsXG4gICAgICAgICAgICBTb2x1c2VrUm8sXG4gICAgICAgICAgXTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gW107XG4gIH1cbn07XG4iXX0=