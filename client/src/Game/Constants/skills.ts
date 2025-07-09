

export enum Skills {
    OneHandedBlunt,
    OneHandedSlashing,
    TwoHandedBlunt,
    TwoHandedSlashing,
    Abjuration,
    Alteration, // 5
    ApplyPoison,
    Archery,
    Backstab,
    BindWound,
    Bash, // 10
    Block,
    BrassInstruments,
    Channeling,
    Conjuration,
    Defense, // 15
    Disarm,
    DisarmTraps,
    Divination,
    Dodge,
    DoubleAttack, // 20
    DragonPunchTailRake, // Dragon Punch is the Iksar Monk skill Tail Rake is the Iksar Monk equivalent
    DualWield,
    EagleStrike,
    Evocation,
    FeignDeath, // 25
    FlyingKick,
    Forage,
    HandToHand,
    Hide,
    Kick, // 30
    Meditate,
    Mend,
    Offense,
    Parry,
    PickLock, // 35
    OneHandedPiercing, // Changed in RoF2(05-10-2
    Riposte,
    RoundKick,
    SafeFall,
    SenseHeading, // 40
    Singing,
    Sneak,
    SpecializeAbjure, // No idea why they trunca
    SpecializeAlteration,
    SpecializeConjuration, // 45
    SpecializeDivination,
    SpecializeEvocation,
    PickPockets,
    StringedInstruments,
    Swimming, // 50
    Throwing,
    TigerClaw,
    Tracking,
    WindInstruments,
    Fishing, // 55
    MakePoison,
    Tinkering,
    Research,
    Alchemy,
    Baking, // 60
    Tailoring,
    SenseTraps,
    Blacksmithing,
    Fletching,
    Brewing, // 65
    AlcoholTolerance,
    Begging,
    JewelryMaking,
    Pottery,
    PercussionInstruments, // 70
    Intimidation,
    Berserking,
    Taunt,
    Frenzy, // 74
    RemoveTraps, // 75
    TripleAttack,
    TwoHandedPiercing, // 77
}

export const ActiveCombatSkills = [
  Skills.ApplyPoison,
  Skills.Backstab,
  Skills.Bash,
  Skills.Disarm, // 15
  Skills.DragonPunchTailRake, // Dragon Punch is the Iksar Monk skill Tail Rake is the Iksar Monk equivalent
  Skills.DualWield, // 20
  Skills.EagleStrike,
  Skills.Evocation,
  Skills.FlyingKick,
  Skills.Kick,
  Skills.RoundKick,
] as const;