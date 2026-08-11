 

import { AbbreviatedRaces, Classes, Deity, Races, StartingZones } from './constants';

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const {
  HUMAN,
  BARBARIAN,
  ERUDITE,
  WOODELF,
  HIGHELF,
  DARKELF,
  HALFELF,
  DWARF,
  TROLL,
  OGRE,
  HALFLING,
  GNOME,
} = Races;
const { WAR, CLR, PAL, RNG, SHD, DRU, MNK, BRD, ROG, SHM, NEC, WIZ, MAG, ENC } =
  Classes;

const {
  Unbound,
  Moros,
  IronHearth,
  Kharos,
  Lyra,
  Olav,
  Voradun,
  Aethelgard,
  Aethira,
  Vaelen,
  SereneAstra,
  Maelstrom,
  Eryon,
  Solus,
  Concordia,
  Silvanus,
  Skywyrm,
} : any = Deity;

const Agnostic = Unbound;
const Bertoxxulous = Moros;
const BrellSerilis = IronHearth;
const CazicThule = Kharos;
const ErollisiMarr = Lyra;
const Bristlebane = Olav;
const Innoruuk = Voradun;
const Karana = Aethelgard;
const MithanielMarr = Aethira;
const Prexus = Vaelen;
const Quellious = SereneAstra;
const RallosZek = Maelstrom;
const RodcetNife = Eryon;
const SolusekRo = Solus;
const TheTribunal = Concordia;
const Tunare = Silvanus;
const Veeshan = Skywyrm;

export const getDeityName = (deity: number) => {
  return Object.values(Deity).find((d) => d[0] === deity)?.[1] || 'Unknown';
};


const {
  TaliosLowharbor,
  TaliosCrownward,
  Greenveil,
  NorthFreeport,
  WestFreeport,
  EastFreeport,
  GreaterFaydark,
  Halas,
  Oggok,
  Grobb,
  NorthKaladim,
  SouthKaladim,
  Paineel,
  Erudin,
  ErudinPalace,
  AkAnon,
  Rivervale,
  NorthernFelwithe,
  SouthernFelwithe,
  TaliosUndervault,
  NeriakCommons,
  NeriakThirdGate,
} = StartingZones;

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
const PlayerRaceAllMask = 65535;



// GetPlayerRaceBit returns the bitmask for a given RaceID.
const getPlayerRaceBit = (race: number): number => {
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

export const getRaceStringListFromRaceBitmask = (raceBitmask: number): string => {
  return raceBitmask === PlayerRaceAllMask ? 'ALL' : Object.entries(AbbreviatedRaces)
    .filter(([_, raceId]) => (raceBitmask & getPlayerRaceBit(raceId)) !== 0)
    .map(([raceName]) => raceName).join(' ');
};

export const getClassStringListFromClassBitmask = (classBitmask: number): string => {
  return classBitmask === 65535 ? 'ALL' : Object.entries(Classes)
    .filter(([_, classId]) => (classBitmask & (playerClassBitmasks[classId])) !== 0)
    .map(([className]) => className).join(' ');
};

export const getClassListFromClassBitmask = (classBitmask: number): number[] => {
  return Object.values(Classes).filter((classId) => (classBitmask & (playerClassBitmasks[classId])) !== 0);
};

export const startingCityMap = {
  [BRD]: {
    [HALFELF]: {
      [Agnostic]     : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [BrellSerilis] : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [Bristlebane]  : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [ErollisiMarr] : [NorthFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [NorthFreeport],
      [Prexus]       : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [Quellious]    : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [RallosZek]    : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [RodcetNife]   : [TaliosLowharbor],
      [SolusekRo]    : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [TheTribunal]  : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [Tunare]       : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
      [Veeshan]      : [TaliosLowharbor, NorthFreeport, GreaterFaydark],
    },
    [HUMAN]: {
      [Agnostic]     : [TaliosLowharbor, NorthFreeport],
      [BrellSerilis] : [TaliosLowharbor, NorthFreeport],
      [Bristlebane]  : [TaliosLowharbor, NorthFreeport],
      [ErollisiMarr] : [NorthFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [NorthFreeport],
      [Prexus]       : [TaliosLowharbor, NorthFreeport],
      [Quellious]    : [TaliosLowharbor, NorthFreeport],
      [RallosZek]    : [TaliosLowharbor, NorthFreeport],
      [RodcetNife]   : [TaliosLowharbor],
      [SolusekRo]    : [TaliosLowharbor, NorthFreeport],
      [TheTribunal]  : [TaliosLowharbor, NorthFreeport],
      [Tunare]       : [TaliosLowharbor, NorthFreeport],
      [Veeshan]      : [TaliosLowharbor, NorthFreeport],
    },
    [WOODELF]: {
      [Agnostic]     : [GreaterFaydark],
      [BrellSerilis] : [GreaterFaydark],
      [Bristlebane]  : [GreaterFaydark],
      [ErollisiMarr] : [GreaterFaydark],
      [Karana]       : [GreaterFaydark],
      [MithanielMarr]: [GreaterFaydark],
      [Prexus]       : [GreaterFaydark],
      [Quellious]    : [GreaterFaydark],
      [RallosZek]    : [GreaterFaydark],
      [RodcetNife]   : [GreaterFaydark],
      [SolusekRo]    : [GreaterFaydark],
      [TheTribunal]  : [GreaterFaydark],
      [Tunare]       : [GreaterFaydark],
      [Veeshan]      : [GreaterFaydark],
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
      [Prexus]    : [Erudin],
      [Quellious] : [Erudin],
    },
    [GNOME]: {
      [Bertoxxulous]: [AkAnon],
      [BrellSerilis]: [AkAnon],
      [Bristlebane] : [AkAnon],
    },
    [HALFLING]: {
      [Bristlebane]: [Rivervale],
    },
    [HIGHELF]: {
      [Tunare]: [NorthernFelwithe],
    },
    [HUMAN]: {
      [Bertoxxulous] : [TaliosUndervault],
      [ErollisiMarr] : [NorthFreeport],
      [Innoruuk]     : [EastFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [NorthFreeport],
      [RodcetNife]   : [TaliosCrownward],
    },
  },
  [ENC]: {
    [DARKELF]: {
      [Agnostic]: [NeriakCommons],
      [Innoruuk]: [NeriakCommons],
    },
    [ERUDITE]: {
      [Agnostic] : [ErudinPalace],
      [Prexus]   : [ErudinPalace],
      [Quellious]: [ErudinPalace],
    },
    [GNOME]: {
      [Agnostic]    : [AkAnon],
      [Bertoxxulous]: [AkAnon],
      [BrellSerilis]: [AkAnon],
    },
    [HIGHELF]: {
      [Agnostic]     : [SouthernFelwithe],
      [ErollisiMarr] : [SouthernFelwithe],
      [Karana]       : [SouthernFelwithe],
      [MithanielMarr]: [SouthernFelwithe],
      [Tunare]       : [SouthernFelwithe],
    },
    [HUMAN]: {
      [Agnostic]     : [TaliosLowharbor, WestFreeport],
      [Bertoxxulous] : [TaliosUndervault],
      [ErollisiMarr] : [WestFreeport],
      [Innoruuk]     : [EastFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [WestFreeport],
      [RodcetNife]   : [TaliosLowharbor],
    },
  },
  [MAG]: {
    [DARKELF]: {
      [Agnostic]: [NeriakCommons],
      [Innoruuk]: [NeriakCommons],
    },
    [ERUDITE]: {
      [Agnostic] : [ErudinPalace],
      [Prexus]   : [ErudinPalace],
      [Quellious]: [ErudinPalace],
    },
    [GNOME]: {
      [Agnostic]    : [AkAnon],
      [Bertoxxulous]: [AkAnon],
      [BrellSerilis]: [AkAnon],
    },
    [HIGHELF]: {
      [Agnostic]     : [SouthernFelwithe],
      [ErollisiMarr] : [SouthernFelwithe],
      [Karana]       : [SouthernFelwithe],
      [MithanielMarr]: [SouthernFelwithe],
      [Tunare]       : [SouthernFelwithe],
    },
    [HUMAN]: {
      [Agnostic]     : [TaliosLowharbor, WestFreeport],
      [Bertoxxulous] : [TaliosUndervault],
      [ErollisiMarr] : [WestFreeport],
      [Innoruuk]     : [EastFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [WestFreeport],
      [RodcetNife]   : [TaliosLowharbor],
    },
  },
  [MNK]: {
    [HUMAN]: {
      [Agnostic] : [TaliosCrownward],
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
      [Bertoxxulous]: [TaliosUndervault],
      [Innoruuk]    : [EastFreeport],
    },
  },
  [PAL]: {
    [DWARF]: {
      [BrellSerilis]: [NorthKaladim],
    },
    [ERUDITE]: {
      [Prexus]   : [Erudin],
      [Quellious]: [Erudin],
    },
    [GNOME]: {
      [BrellSerilis]: [AkAnon],
    },
    [HALFELF]: {
      [ErollisiMarr] : [NorthFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [NorthFreeport],
      [RodcetNife]   : [TaliosLowharbor],
      [Tunare]       : [NorthernFelwithe],
    },
    [HALFLING]: {
      [Karana]: [Rivervale],
    },
    [HIGHELF]: {
      [Tunare]: [NorthernFelwithe],
    },
    [HUMAN]: {
      [ErollisiMarr] : [NorthFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [NorthFreeport],
      [RodcetNife]   : [TaliosCrownward],
    },
  },
  [RNG]: {
    [HALFELF]: {
      [Karana]: [Greenveil],
      [Tunare]: [Greenveil, GreaterFaydark],
    },
    [HALFLING]: {
      [Karana]: [Rivervale],
    },
    [HUMAN]: {
      [Karana]: [Greenveil],
      [Tunare]: [Greenveil],
    },
    [WOODELF]: {
      [Tunare]: [GreaterFaydark],
    },
  },
  [ROG]: {
    [BARBARIAN]: {
      [Agnostic]   : [Halas],
      [Bristlebane]: [Halas],
      [TheTribunal]: [Halas],
    },
    [DARKELF]: {
      [Agnostic]   : [NeriakThirdGate],
      [Bristlebane]: [NeriakThirdGate],
      [Innoruuk]   : [NeriakThirdGate],
    },
    [DWARF]: {
      [Agnostic]    : [NorthKaladim],
      [BrellSerilis]: [NorthKaladim],
      [Bristlebane] : [NorthKaladim],
    },
    [GNOME]: {
      [Agnostic]    : [AkAnon],
      [Bertoxxulous]: [AkAnon],
      [BrellSerilis]: [AkAnon],
      [Bristlebane] : [AkAnon],
    },
    [HALFELF]: {
      [Agnostic]    : [TaliosCrownward, EastFreeport, GreaterFaydark],
      [Bertoxxulous]: [TaliosCrownward],
      [Bristlebane] : [TaliosCrownward, EastFreeport, GreaterFaydark],
      [ErollisiMarr]: [EastFreeport],
      [Karana]      : [TaliosCrownward],
      [RodcetNife]  : [TaliosCrownward],
      [Tunare]      : [GreaterFaydark],
    },
    [HALFLING]: {
      [Agnostic]    : [Rivervale],
      [BrellSerilis]: [Rivervale],
      [Bristlebane] : [Rivervale],
    },
    [HUMAN]: {
      [Agnostic]    : [TaliosCrownward, EastFreeport],
      [Bertoxxulous]: [TaliosCrownward],
      [Bristlebane] : [TaliosCrownward, EastFreeport],
      [ErollisiMarr]: [EastFreeport],
      [Innoruuk]    : [EastFreeport],
      [Karana]      : [TaliosCrownward],
      [RodcetNife]  : [TaliosCrownward],
    },
    [WOODELF]: {
      [Agnostic]   : [GreaterFaydark],
      [Bristlebane]: [GreaterFaydark],
      [Karana]     : [GreaterFaydark],
      [Tunare]     : [GreaterFaydark],
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
      [Bertoxxulous]: [TaliosUndervault],
      [Innoruuk]    : [EastFreeport],
    },
    [OGRE]: {
      [CazicThule]: [Oggok],
      [RallosZek] : [Oggok],
    },
    [TROLL]: {
      [CazicThule]: [Grobb],
      [Innoruuk]  : [Grobb],
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
      [Innoruuk]  : [Grobb],
    },
  },
  [WAR]: {
    [BARBARIAN]: {
      [Agnostic]   : [Halas],
      [RallosZek]  : [Halas],
      [TheTribunal]: [Halas],
    },
    [DARKELF]: {
      [Agnostic] : [NeriakCommons],
      [Innoruuk] : [NeriakCommons],
      [RallosZek]: [NeriakCommons],
    },
    [DWARF]: {
      [Agnostic]    : [SouthKaladim],
      [BrellSerilis]: [SouthKaladim],
    },
    [GNOME]: {
      [Agnostic]    : [AkAnon],
      [Bertoxxulous]: [AkAnon],
      [BrellSerilis]: [AkAnon],
      [RallosZek]   : [AkAnon],
    },
    [HALFELF]: {
      [Agnostic]     : [TaliosLowharbor, WestFreeport, GreaterFaydark],
      [Bertoxxulous] : [TaliosLowharbor],
      [ErollisiMarr] : [WestFreeport],
      [Innoruuk]     : [WestFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [WestFreeport],
      [Prexus]       : [TaliosLowharbor, WestFreeport, GreaterFaydark],
      [RallosZek]    : [TaliosLowharbor, WestFreeport, GreaterFaydark],
      [RodcetNife]   : [TaliosLowharbor],
      [TheTribunal]  : [TaliosLowharbor, WestFreeport, GreaterFaydark],
      [Tunare]       : [GreaterFaydark],
    },
    [HALFLING]: {
      [Agnostic]    : [Rivervale],
      [BrellSerilis]: [Rivervale],
      [RallosZek]   : [Rivervale],
    },
    [HUMAN]: {
      [Agnostic]     : [TaliosLowharbor, WestFreeport],
      [Bertoxxulous] : [TaliosLowharbor],
      [ErollisiMarr] : [WestFreeport],
      [Innoruuk]     : [WestFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [WestFreeport],
      [RallosZek]    : [TaliosLowharbor, WestFreeport],
      [RodcetNife]   : [TaliosLowharbor],
    },
    [OGRE]: {
      [Agnostic]  : [Oggok],
      [CazicThule]: [Oggok],
      [RallosZek] : [Oggok],
    },
    [TROLL]: {
      [Agnostic]  : [Grobb],
      [CazicThule]: [Grobb],
      [Innoruuk]  : [Grobb],
      [RallosZek] : [Grobb],
    },
    [WOODELF]: {
      [Agnostic] : [GreaterFaydark],
      [Karana]   : [GreaterFaydark],
      [RallosZek]: [GreaterFaydark],
      [Tunare]   : [GreaterFaydark],
    },
  },
  [WIZ]: {
    [DARKELF]: {
      [Agnostic] : [NeriakCommons],
      [Innoruuk] : [NeriakCommons],
      [SolusekRo]: [NeriakCommons],
    },
    [ERUDITE]: {
      [Agnostic] : [ErudinPalace],
      [Prexus]   : [ErudinPalace],
      [Quellious]: [ErudinPalace],
      [SolusekRo]: [ErudinPalace],
    },
    [GNOME]: {
      [Agnostic]    : [AkAnon],
      [Bertoxxulous]: [AkAnon],
      [BrellSerilis]: [AkAnon],
      [SolusekRo]   : [AkAnon],
    },
    [HIGHELF]: {
      [Agnostic]     : [SouthernFelwithe],
      [ErollisiMarr] : [SouthernFelwithe],
      [Karana]       : [SouthernFelwithe],
      [MithanielMarr]: [SouthernFelwithe],
      [SolusekRo]    : [SouthernFelwithe],
      [Tunare]       : [SouthernFelwithe],
    },
    [HUMAN]: {
      [Agnostic]     : [TaliosLowharbor, WestFreeport],
      [Bertoxxulous] : [TaliosUndervault],
      [ErollisiMarr] : [WestFreeport],
      [Innoruuk]     : [EastFreeport],
      [Karana]       : [TaliosLowharbor],
      [MithanielMarr]: [WestFreeport],
      [RodcetNife]   : [TaliosLowharbor],
      [SolusekRo]    : [TaliosLowharbor, WestFreeport],
    },
  },
} as const;

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
