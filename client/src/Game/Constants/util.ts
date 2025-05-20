 

import { Classes, Deity, Races, StartingZones } from './constants';

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
  Agnostic,
  Bertoxxulous,
  BrellSerilis,
  CazicThule,
  ErollisiMarr,
  Bristlebane,
  Innoruuk,
  Karana,
  MithanielMarr,
  Prexus,
  Quellious,
  RallosZek,
  RodcetNife,
  SolusekRo,
  TheTribunal,
  Tunare,
  Veeshan,
} = Deity;


const {
  SouthQeynos,
  NorthQeynos,
  SurefallGlade,
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
  QeynosAqueducts,
  NeriakCommons,
  NeriakThirdGate,
} = StartingZones;

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
