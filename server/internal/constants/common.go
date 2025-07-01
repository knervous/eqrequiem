// constants.go
package constants

const (
	// NPC vision
	HeadPosition float32 = 0.9 // ratio of GetSize() where NPCs see from
	SeePosition  float32 = 0.5 // ratio of GetSize() where NPCs try to see for LOS

	// Archetypes
	ArchetypeHybrid = 1
	ArchetypeCaster = 2
	ArchetypeMelee  = 3

	// CON colors
	ConGreen         = 2
	ConLightBlue     = 18
	ConBlue          = 4
	ConWhite         = 10
	ConWhiteTitanium = 20
	ConYellow        = 15
	ConRed           = 13
	ConGray          = 6

	// Damage results
	DmgBlocked      = -1
	DmgParried      = -2
	DmgRiposted     = -3
	DmgDodged       = -4
	DmgInvulnerable = -5
	DmgRune         = -6

	// Spell specialization parameters
	SpecializeFizzle = 11 // % fizzle chance reduce at 200 specialized

	// Zone point ranges
	ZonePointNoZoneRange = 40000.0
	ZonePointZoneRange   = 40000.0

	// Pet commands (RoF2 Client)
	PetHealthReport = 0  // 0x00 - /pet health or Pet Window
	PetLeader       = 1  // 0x01 - /pet leader or Pet Window
	PetAttack       = 2  // 0x02 - /pet attack or Pet Window
	PetQAttack      = 3  // 0x03 - /pet qattack or Pet Window
	PetFollowMe     = 4  // 0x04 - /pet follow or Pet Window
	PetGuardHere    = 5  // 0x05 - /pet guard or Pet Window
	PetSit          = 6  // 0x06 - /pet sit or Pet Window
	PetSitDown      = 7  // 0x07 - /pet sit on
	PetStandUp      = 8  // 0x08 - /pet sit off
	PetStop         = 9  // 0x09 - /pet stop or Pet Window - Not implemented
	PetStopOn       = 10 // 0x0A - /pet stop on - Not implemented
	PetStopOff      = 11 // 0x0B - /pet stop off - Not implemented
	PetTaunt        = 12 // 0x0C - /pet taunt or Pet Window
	PetTauntOn      = 13 // 0x0D - /pet taunt on
	PetTauntOff     = 14 // 0x0E - /pet taunt off
	PetHold         = 15 // 0x0F - /pet hold or Pet Window
	PetHoldOn       = 16 // 0x10 - /pet hold on
	PetHoldOff      = 17 // 0x11 - /pet hold off
	PetGHold        = 18 // 0x12 - /pet ghold
	PetGHoldOn      = 19 // 0x13 - /pet ghold on
	PetGHoldOff     = 20 // 0x14 - /pet ghold off
	PetSpellHold    = 21 // 0x15 - /pet spellhold or Pet Window
	PetSpellHoldOn  = 22 // 0x16 - /pet spellhold on
	PetSpellHoldOff = 23 // 0x17 - /pet spellhold off
	PetFocus        = 24 // 0x18 - /pet focus or Pet Window
	PetFocusOn      = 25 // 0x19 - /pet focus on
	PetFocusOff     = 26 // 0x1A - /pet focus off
	PetFeign        = 27 // 0x1B - /pet feign
	PetBackOff      = 28 // 0x1C - /pet back off
	PetGetLost      = 29 // 0x1D - /pet get lost
	PetGuardMe      = 30 // 0x1E - same as /pet follow, different message in older clients
	PetRegroup      = 31 // 0x1F - /pet regroup
	PetRegroupOn    = 32 // 0x20 - /pet regroup on
	PetRegroupOff   = 33 // 0x21 - /pet regroup off
	PetMaxCommands  = PetRegroupOff + 1

	// Pet UI button indices
	PetButtonSit       = 0
	PetButtonStop      = 1
	PetButtonRegroup   = 2
	PetButtonFollow    = 3
	PetButtonGuard     = 4
	PetButtonTaunt     = 5
	PetButtonHold      = 6
	PetButtonGhold     = 7
	PetButtonFocus     = 8
	PetButtonSpellHold = 9

	// Misc
	AuraHardCap         = 2
	WeaponStanceTypeMax = 2
)

// FocusType represents different spell focus modifiers.
type FocusType int

const (
	Focus_SpellHaste                 FocusType = iota + 1 // @Fc, SPA:127 SE_IncreaseSpellHaste – on caster, cast time mod pct, base: pct
	Focus_SpellDuration                                   // @Fc, SPA:128 SE_IncreaseSpellDuration – on caster, spell duration mod pct, base: pct
	Focus_Range                                           // @Fc, SPA:129 SE_IncreaseRange – on caster, spell range mod pct, base: pct
	Focus_ReagentCost                                     // @Fc, SPA:131 SE_ReduceReagentCost – on caster, do not consume reagent pct chance
	Focus_ManaCost                                        // @Fc, SPA:132 SE_ReduceManaCost – on caster, reduce mana cost by pct
	Focus_ImprovedHeal                                    // @Fc, SPA:125 SE_ImprovedHeal – on caster, spell healing mod pct
	Focus_ImprovedDamage                                  // @Fc, SPA:124 SE_ImprovedDamage – on caster, spell damage mod pct
	Focus_ImprovedDamage2                                 // @Fc, SPA:461 SE_ImprovedDamage2 – on caster, spell damage mod pct
	Focus_FcDamagePctCrit                                 // @Fc, SPA:302 SE_FcDamagePctCrit – on caster, spell damage mod pct
	Focus_PetPower                                        // @Fc, SPA:167 SE_PetPowerIncrease – on caster, pet power mod
	Focus_ResistRate                                      // @Fc, SPA:126 SE_SpellResistReduction – on caster, resist mod pct
	Focus_SpellHateMod                                    // @Fc, SPA:130 SE_SpellHateMod – on caster, spell hate mod pct
	Focus_TriggerOnCast                                   // @Fc, SPA:339 SE_TriggerOnCast – on caster, cast-on-spell chance pct
	Focus_SpellVulnerability                              // @Fc, SPA:296 SE_FcSpellVulnerability – on target, damage taken mod pct
	Focus_FcSpellDamagePctIncomingPC                      // @Fc, SPA:483 SE_Fc_Spell_Damage_Pct_IncomingPC – on target, damage taken mod pct
	Focus_Twincast                                        // @Fc, SPA:399 SE_FcTwincast – on caster, chance to cast twice
	Focus_SympatheticProc                                 // @Fc, SPA:383 SE_SympatheticProc – on caster, proc-on-cast chance pct
	Focus_FcDamageAmt                                     // @Fc, SPA:286 SE_FcDamageAmt – on caster, damage mod flat amt
	Focus_FcDamageAmt2                                    // @Fc, SPA:462 SE_FcDamageAmt2 – on caster, damage mod flat amt
	Focus_FcDamageAmtCrit                                 // @Fc, SPA:303 SE_FFcDamageAmtCrit – on caster, damage mod flat amt
	Focus_SpellDurByTic                                   // @Fc, SPA:287 SE_SpellDurationIncByTic – on caster, buff duration mod tics
	Focus_SwarmPetDuration                                // @Fc, SPA:398 SE_SwarmPetDuration – on caster, swarm pet duration mod ms
	Focus_ReduceRecastTime                                // @Fc, SPA:310 SE_ReduceReuseTimer – on caster, recast time mod ms
	Focus_BlockNextSpell                                  // @Fc, SPA:335 SE_BlockNextSpellFocus – on caster, block next spell chance
	Focus_FcHealPctIncoming                               // @Fc, SPA:393 SE_FcHealPctIncoming – on target, heal received mod pct
	Focus_FcDamageAmtIncoming                             // @Fc, SPA:297 SE_FcDamageAmtIncoming – on target, damage taken flat amt
	Focus_FcSpellDamageAmtIncomingPC                      // @Fc, SPA:484 SE_Fc_Spell_Damage_Amt_IncomingPC – on target, damage taken flat amt
	Focus_FcCastSpellOnLand                               // @Fc, SPA:481 SE_Fc_Cast_Spell_On_Land – on target, cast spell if hit, chance pct
	Focus_FcHealAmtIncoming                               // @Fc, SPA:394 SE_FcHealAmtIncoming – on target, heal received flat amt
	Focus_FcBaseEffects                                   // @Fc, SPA:413 SE_FcBaseEffects – on caster, base spell effectiveness pct
	Focus_IncreaseNumHits                                 // @Fc, SPA:421 SE_FcIncreaseNumHits – on caster, num hits mod flat amt
	Focus_FcLimitUse                                      // @Fc, SPA:420 SE_FcLimitUse – on caster, limit use pct
	Focus_FcMute                                          // @Fc, SPA:357 SE_FcMute – on caster, prevent casting chance pct
	Focus_FcTimerRefresh                                  // @Fc, SPA:389 SE_FcTimerRefresh – on caster, reset recast timer
	Focus_FcTimerLockout                                  // @Fc, SPA:390 SE_FcTimerLockout – on caster, set recast timer duration ms
	Focus_FcStunTimeMod                                   // @Fc, SPA:133 SE_FcStunTimeMod – on caster, stun time mod pct
	Focus_FcResistIncoming                                // @Fc, SPA:510 SE_Fc_Resist_Incoming – on target, resist modifier amt
	Focus_FcAmplifyMod                                    // @Fc, SPA:507 SE_Fc_Amplify_Mod – on caster, damage/heal/DOT mod pct
	Focus_FcAmplifyAmt                                    // @Fc, SPA:508 SE_Fc_Amplify_Amt – on caster, damage/heal/DOT mod amt
	Focus_FcCastTimeMod2                                  // @Fc, SPA:500 SE_Fc_CastTimeMod2 – on caster, cast time mod pct
	Focus_FcCastTimeAmt                                   // @Fc, SPA:501 SE_FcCastTimeAmt – on caster, cast time mod flat ms
	Focus_FcHealPctCritIncoming                           // @Fc, SPA:395 SE_FcHealPctCritIncoming – on target, heal pct mod on crit
	Focus_FcHealAmt                                       // @Fc, SPA:392 SE_FcHealAmt – on caster, heal mod flat amt
	Focus_FcHealAmtCrit                                   // @Fc, SPA:396 SE_FcHealAmtCrit – on caster, heal mod flat amt on crit

	Focus_HIGHEST = Focus_FcHealAmtCrit // Highest focus type, used for validation checks
)

type GravityBehavior int

const (
	GravityBehavior_Ground GravityBehavior = iota // Ground gravity, used for most entities
	GravityBehavior_Flying
	GravityBehavior_Levitating
	GravityBehavior_RaceWaterDragonFloating
	GravityBehavior_LevitateWhileRunning
)

type TradeState int

const (
	TradeState_TradeNone TradeState = iota // No trade in progress
	TradeState_Trading
	TradeState_TradeAccepted
	TradeState_TradeCompleting
)

type NumHit int

const (
	NumHit_IncomingHitAttempts NumHit = iota + 1 // Number of hit attempts for incoming hits
	NumHit_OutgoingHitAttempts                   // Attempted outgoing melee attacks (hit or miss) on YOUR TARGET.
	NumHit_IncomingSpells                        // Incoming detrimental spells
	NumHit_OutgoingSpells                        // Outgoing detrimental spells
	NumHit_OutgoingHitSuccess                    // Successful outgoing melee attack HIT on YOUR TARGET.
	NumHit_IncomingHitSuccess                    // Successful incoming melee attack HIT on YOU.
	NumHit_MatchingSpells                        // Any casted spell matching/triggering a focus effect.
	NumHit_IncomingDamage                        // Successful incoming spell or melee dmg attack on YOU
	NumHit_ReflectSpell                          // Incoming Reflected spells.
	NumHit_DefensiveSpellProcs                   // Defensive buff procs
	NumHit_OffensiveSpellProcs                   // Offensive buff procs
)

type PlayerState uint32

const (
	PlayerState_None                    PlayerState = 0
	PlayerState_Open                    PlayerState = 1
	PlayerState_WeaponSheathed          PlayerState = 2
	PlayerState_Aggressive              PlayerState = 4
	PlayerState_ForcedAggressive        PlayerState = 8
	PlayerState_InstrumentEquipped      PlayerState = 16
	PlayerState_Stunned                 PlayerState = 32
	PlayerState_PrimaryWeaponEquipped   PlayerState = 64
	PlayerState_SecondaryWeaponEquipped PlayerState = 128
)

type LootResponse uint8

const (
	LootResponse_SomeoneElse = iota
	LootResponse_Normal
	LootResponse_NotAtThisTime
	LootResponse_Normal2 // acts exactly the same as Normal, maybe group vs ungroup?
	LootResponse_Hostiles
	LootResponse_TooFar
	LootResponse_LootAll // SoD+
)

type LootRequestType uint8

const (
	LootRequestType_Forbidden LootRequestType = iota
	LootRequestType_GMPeek
	LootRequestType_GMAllowed
	LootRequestType_Self
	LootRequestType_AllowedPVE
	LootRequestType_AllowedPVPAll
	LootRequestType_AllowedPVPSingle
	LootRequestType_AllowedPVPDefined
)

type DmgShieldType int

const (
	DamageShieldType_Decay    DmgShieldType = 244 // DS_DECAY
	DamageShieldType_Chilled  DmgShieldType = 245 // DS_CHILLED
	DamageShieldType_Freezing DmgShieldType = 246 // DS_FREEZING
	DamageShieldType_Torment  DmgShieldType = 247 // DS_TORMENT
	DamageShieldType_Burn     DmgShieldType = 248 // DS_BURN
)
