export declare const sleep: (ms: any) => Promise<unknown>;
declare const HUMAN: number, BARBARIAN: number, ERUDITE: number, WOODELF: number, HIGHELF: number, DARKELF: number, HALFELF: number, DWARF: number, TROLL: number, OGRE: number, HALFLING: number, GNOME: number;
declare const WAR: number, CLR: number, PAL: number, RNG: number, SHD: number, MNK: number, BRD: number, ROG: number, SHM: number, NEC: number, WIZ: number, MAG: number, ENC: number;
declare const Agnostic: any, Bertoxxulous: any, BrellSerilis: any, CazicThule: any, ErollisiMarr: any, Bristlebane: any, Innoruuk: any, Karana: any, MithanielMarr: any, Prexus: any, Quellious: any, RallosZek: any, RodcetNife: any, SolusekRo: any, TheTribunal: any, Tunare: any, Veeshan: any;
export declare const getDeityName: (deity: number) => string | number;
export declare const getRaceStringListFromRaceBitmask: (raceBitmask: number) => string;
export declare const getClassStringListFromClassBitmask: (classBitmask: number) => string;
export declare const getClassListFromClassBitmask: (classBitmask: number) => number[];
export declare const startingCityMap: {
    readonly [BRD]: {
        readonly [HALFELF]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [Quellious]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [TheTribunal]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [Tunare]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [Veeshan]: readonly [(string | number)[], (string | number)[], (string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[], (string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[], (string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[], (string | number)[]];
            readonly [Quellious]: readonly [(string | number)[], (string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[], (string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[], (string | number)[]];
            readonly [TheTribunal]: readonly [(string | number)[], (string | number)[]];
            readonly [Tunare]: readonly [(string | number)[], (string | number)[]];
            readonly [Veeshan]: readonly [(string | number)[], (string | number)[]];
        };
        readonly [WOODELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[]];
            readonly [Quellious]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[]];
            readonly [TheTribunal]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
            readonly [Veeshan]: readonly [(string | number)[]];
        };
    };
    readonly [CLR]: {
        readonly [DARKELF]: {
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
        readonly [DWARF]: {
            readonly [BrellSerilis]: readonly [(string | number)[]];
        };
        readonly [ERUDITE]: {
            readonly [CazicThule]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[]];
            readonly [Quellious]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
        };
        readonly [HALFLING]: {
            readonly [Bristlebane]: readonly [(string | number)[]];
        };
        readonly [HIGHELF]: {
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
        };
    };
    readonly [ENC]: {
        readonly [DARKELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
        readonly [ERUDITE]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[]];
            readonly [Quellious]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
        };
        readonly [HIGHELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
        };
    };
    readonly [MAG]: {
        readonly [DARKELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
        readonly [ERUDITE]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[]];
            readonly [Quellious]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
        };
        readonly [HIGHELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
        };
    };
    readonly [MNK]: {
        readonly [HUMAN]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Quellious]: readonly [(string | number)[]];
        };
    };
    readonly [NEC]: {
        readonly [DARKELF]: {
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
        readonly [ERUDITE]: {
            readonly [CazicThule]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Bertoxxulous]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
    };
    readonly [PAL]: {
        readonly [DWARF]: {
            readonly [BrellSerilis]: readonly [(string | number)[]];
        };
        readonly [ERUDITE]: {
            readonly [Prexus]: readonly [(string | number)[]];
            readonly [Quellious]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [BrellSerilis]: readonly [(string | number)[]];
        };
        readonly [HALFELF]: {
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HALFLING]: {
            readonly [Karana]: readonly [(string | number)[]];
        };
        readonly [HIGHELF]: {
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
        };
    };
    readonly [RNG]: {
        readonly [HALFELF]: {
            readonly [Karana]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[], (string | number)[]];
        };
        readonly [HALFLING]: {
            readonly [Karana]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Karana]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [WOODELF]: {
            readonly [Tunare]: readonly [(string | number)[]];
        };
    };
    readonly [ROG]: {
        readonly [BARBARIAN]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
            readonly [TheTribunal]: readonly [(string | number)[]];
        };
        readonly [DARKELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
        readonly [DWARF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
        };
        readonly [HALFELF]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HALFLING]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[], (string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
        };
        readonly [WOODELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bristlebane]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
    };
    readonly [SHD]: {
        readonly [DARKELF]: {
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
        readonly [ERUDITE]: {
            readonly [CazicThule]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Bertoxxulous]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
        readonly [OGRE]: {
            readonly [CazicThule]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
        };
        readonly [TROLL]: {
            readonly [CazicThule]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
    };
    readonly [SHM]: {
        readonly [BARBARIAN]: {
            readonly [TheTribunal]: readonly [(string | number)[]];
        };
        readonly [OGRE]: {
            readonly [RallosZek]: readonly [(string | number)[]];
        };
        readonly [TROLL]: {
            readonly [CazicThule]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
        };
    };
    readonly [WAR]: {
        readonly [BARBARIAN]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
            readonly [TheTribunal]: readonly [(string | number)[]];
        };
        readonly [DARKELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
        };
        readonly [DWARF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
        };
        readonly [HALFELF]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
            readonly [TheTribunal]: readonly [(string | number)[], (string | number)[], (string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HALFLING]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[], (string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
        };
        readonly [OGRE]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [CazicThule]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
        };
        readonly [TROLL]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [CazicThule]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
        };
        readonly [WOODELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [RallosZek]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
    };
    readonly [WIZ]: {
        readonly [DARKELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[]];
        };
        readonly [ERUDITE]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Prexus]: readonly [(string | number)[]];
            readonly [Quellious]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[]];
        };
        readonly [GNOME]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [BrellSerilis]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[]];
        };
        readonly [HIGHELF]: {
            readonly [Agnostic]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[]];
            readonly [Tunare]: readonly [(string | number)[]];
        };
        readonly [HUMAN]: {
            readonly [Agnostic]: readonly [(string | number)[], (string | number)[]];
            readonly [Bertoxxulous]: readonly [(string | number)[]];
            readonly [ErollisiMarr]: readonly [(string | number)[]];
            readonly [Innoruuk]: readonly [(string | number)[]];
            readonly [Karana]: readonly [(string | number)[]];
            readonly [MithanielMarr]: readonly [(string | number)[]];
            readonly [RodcetNife]: readonly [(string | number)[]];
            readonly [SolusekRo]: readonly [(string | number)[], (string | number)[]];
        };
    };
};
export declare const getAvailableDeities: (race: any, classId: any) => any[];
export {};
