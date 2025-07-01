package constants

// --- basic spell constants ---
const (
	SpellUnknown     = 0xFFFF
	PoisonProc       = 0xFFFE
	SpellbookUnknown = 0xFFFFFFFF // player-profile spells are 32bit

	Spell_CompleteHeal     = 13
	Spell_Lifeburn         = 2755
	Spell_LeechTouch       = 2766
	Spell_LayOnHands       = 87
	Spell_HarmTouch        = 88
	Spell_HarmTouch2       = 2821
	Spell_ImpHarmTouch     = 2774
	Spell_NpcHarmTouch     = 929
	Spell_AvatarStProc     = 2434
	Spell_CazicTouch       = 982
	Spell_TouchOfVinitras  = 2859
	Spell_DesperateHope    = 841
	Spell_Charm            = 300
	Spell_Metamorphosis65  = 2314
	Spell_JtBuff           = 3716
	Spell_CanOWhoopAss     = 911
	Spell_PhoenixCharm     = 3014
	Spell_AvatarKnockback  = 905
	Spell_ShapeChange65    = 2079
	Spell_SunsetHome1218   = 1218
	Spell_SunsetHome819    = 819
	Spell_ShapeChange75    = 780
	Spell_ShapeChange80    = 781
	Spell_ShapeChange85    = 782
	Spell_ShapeChange90    = 783
	Spell_ShapeChange95    = 784
	Spell_ShapeChange100   = 785
	Spell_ShapeChange25    = 1200
	Spell_ShapeChange30    = 1201
	Spell_ShapeChange35    = 1202
	Spell_ShapeChange40    = 1203
	Spell_ShapeChange45    = 1204
	Spell_ShapeChange50    = 1205
	Spell_NpcAegolism      = 1343
	Spell_ShapeChange55    = 1923
	Spell_ShapeChange60    = 1924
	Spell_CommandOfDruzzil = 3355
	Spell_ShapeChange70    = 6503
	Spell_ManaBurn         = 2751
	Spell_TouchOfTheDivine = 4789

	Spell_TheDainsJustice       = 1476
	Spell_Modulation            = 1502
	Spell_Torpor                = 1576
	Spell_Splurt                = 1620
	Spell_SebilitePox           = 1814
	Spell_SoulWell              = 1816
	Spell_MysticalTransvergence = 2716
	Spell_ActOfValor            = 2775
	Spell_Stoicism              = 3694
	Spell_AlterPlaneHate        = 666
	Spell_AlterPlaneSky         = 674
	Spell_DenonsDesperateDirge  = 742
	Spell_BondOfSathir          = 833
	Spell_DiseasedCloud         = 836

	Spell_ActingResist         = 775
	Spell_ActingShield         = 776
	Spell_ActingGuard          = 777
	Spell_GuideActing          = 778
	Spell_ByeBye               = 779
	Spell_ActingResistII       = 1206
	Spell_ActingShieldII       = 1207
	Spell_ActingGuardII        = 1208
	Spell_GuideActing2         = 1209
	Spell_ByeByte2             = 1210
	Spell_GuideCancelMagic     = 1211
	Spell_GuideJourney         = 1212
	Spell_GuideVision          = 1213
	Spell_GuideHealth          = 1214
	Spell_GuideInvulnerability = 1215
	Spell_GuideBolt            = 1216
	Spell_GuideMemoryBlue      = 1217
	Spell_GuideAlliance        = 1219
	Spell_SpecialSight         = 1220

	Spell_TerrorOfDarkness       = 1221
	Spell_TerrorOfShadows        = 1222
	Spell_TerrorOfDeath          = 1223
	Spell_TerrorOfTerris         = 1224
	Spell_VoiceOfDarkness        = 1225
	Spell_VoiceOfShadows         = 1226
	Spell_VoiceOfDeath           = 1227
	Spell_VoiceOfTerris          = 1228
	Spell_VengeanceV             = 1229
	Spell_VengeanceVII           = 1230
	Spell_VengeanceVIII          = 1231
	Spell_VengeanceIX            = 1232
	Spell_CorruptedLaceration    = 1233
	Spell_VisionsOfChaos         = 1234
	Spell_VisionsOfPain          = 1235
	Spell_CommandingPresence     = 1236
	Spell_MaliciousIntent        = 1237
	Spell_CurseOfFlames          = 1238
	Spell_DevouringConflagration = 1239

	Spell_AvatarShield      = 1240
	Spell_AvatarSight       = 1241
	Spell_AvatarGuard       = 1242
	Spell_AvatarResist      = 1243
	Spell_MagiBolt          = 1244
	Spell_MagiStrike        = 1245
	Spell_MagiCurse         = 1246
	Spell_MagiCircle        = 1247
	Spell_SpiritualEcho     = 1248
	Spell_BristlingArmament = 1249
	Spell_WatonDestruction  = 1250

	Spell_TranslocateGroup = 1334
	Spell_Translocate      = 1422

	Spell_ActingMagicResistI    = 1900
	Spell_ActingFireResistI     = 1901
	Spell_ActingColdResistI     = 1902
	Spell_ActingPoisonResistI   = 1903
	Spell_ActingDiseaseResistI  = 1904
	Spell_ActingMagicResistII   = 1905
	Spell_ActingFireResistII    = 1906
	Spell_ActingColdResistII    = 1907
	Spell_ActingPoisonResistII  = 1908
	Spell_ActingDiseaseResistII = 1909

	Spell_ActingFireShield    = 1910
	Spell_ActingPoisonShield  = 1911
	Spell_ActingColdShield    = 1912
	Spell_ActingDiseaseShield = 1913
	Spell_ActingArmorI        = 1914
	Spell_ActingArmorII       = 1915
	Spell_ActingArmorIII      = 1916
	Spell_ActingHealthI       = 1917
	Spell_ActingHealthII      = 1918
	Spell_ActingHealthIII     = 1919
	Spell_ActingHealthIV      = 1920
	Spell_ActingSpiritI       = 1921
	Spell_ActingSpiritII      = 1922

	Spell_ResurrectionSickness  = 756
	Spell_ResurrectionSickness4 = 757
	Spell_Teleport              = 3243
	Spell_ResurrectionSickness2 = 5249
	Spell_RevivalSickness       = 13087
	Spell_ResurrectionSickness3 = 37624

	Spell_PactOfHateRecourse = 40375
	Spell_IncendiaryOozeBuff = 32513
	Spell_EyeOfZomm          = 323
	Spell_MinorIllusion      = 287
	Spell_IllusionTree       = 601
	Spell_IllusionFemale     = 1731
	Spell_IllusionMale       = 1732
	Spell_UnsummonSelf       = 892
	Spell_AncientLifebane    = 2115

	Spell_GMHP25K  = 6817
	Spell_GMHP50K  = 6818
	Spell_GMHP100K = 6819
	Spell_GMHP225K = 6820
	Spell_GMHP475K = 6821
	Spell_GMHP925K = 6822
	Spell_GMHP2M   = 6823
	Spell_GMHP3M   = 6824
	Spell_GMHP5M   = 39851

	Spell_GuideActingOne          = 778
	Spell_GuideAllianceOne        = 810
	Spell_GuideCancelMagicOne     = 811
	Spell_GuideJourneyOne         = 813
	Spell_GuideVisionOne          = 814
	Spell_GuideHealthOne          = 815
	Spell_GuideInvulnerabilityOne = 816
	Spell_GuideBoltOne            = 817
	Spell_GuideMemoryBlurOne      = 818

	Spell_GuideActingTwo          = 1209
	Spell_GuideCancelMagicTwo     = 1211
	Spell_GuideJourneyTwo         = 1212
	Spell_GuideVisionTwo          = 1213
	Spell_GuideHealthTwo          = 1214
	Spell_GuideInvulnerabilityTwo = 1215
	Spell_GuideBoltTwo            = 1216
	Spell_GuideMemoryBlurTwo      = 1217
	Spell_GuideAllianceTwo        = 1219

	Spell_GuideEvacuation = 3921
	Spell_GuideLevitation = 39852
	Spell_GuideSpellHaste = 39853
	Spell_GuideHaste      = 39854

	Spell_VampiricEmbrace         = 821
	Spell_VampiricEmbraceOfShadow = 822
	Spell_BattleCry               = 5027
	Spell_WarCry                  = 5028
	Spell_BattleCryOfDravel       = 5029
	Spell_WarCryOfDravel          = 5030
	Spell_BattleCryOfTheMastruq   = 5031
	Spell_AncientCryOfChaos       = 5032
	Spell_Bloodthirst             = 8476
	Spell_Amplification           = 2603
	Spell_DivineRez               = 2738
)

// --- focus‐limit include enum ---
type FocusLimitInclude int

const (
	Include_ExistsSELimitResist FocusLimitInclude = iota
	Include_FoundSELimitResist
	Include_ExistsSELimitSpell
	Include_FoundSELimitSpell
	Include_ExistsSELimitEffect
	Include_FoundSELimitEffect
	Include_ExistsSELimitTarget
	Include_FoundSELimitTarget
	Include_ExistsSELimitSpellGroup
	Include_FoundSELimitSpellGroup
	Include_ExistsSELimitCastingSkill
	Include_FoundSELimitCastingSkill
	Include_ExistsSELimitSpellClass
	Include_FoundSELimitSpellClass
	Include_ExistsSELimitSpellSubclass
	Include_FoundSELimitSpellSubclass
	Include_ExistsSEFFItemClass
	Include_FoundSEFFItemClass
)

// --- spell‐restriction enum ---
type SpellRestriction int

const (
	Unknown3           SpellRestriction = 3
	IsNotOnHorse       SpellRestriction = 5
	IsAnimalOrHumanoid SpellRestriction = 100
	IsDragon           SpellRestriction = 101
	// …etc, preserving each explicit numeric value
)

// --- other small enums ---
type NegateSpellEffectType int

const (
	NegateSpaAllBonuses NegateSpellEffectType = iota
	NegateSpaSpellbonus
	NegateSpaItembonus
	NegateSpaSpellbonusAndItembonus
	NegateSpaAAbonus
	NegateSpaSpellbonusAndAAbonus
	NegateSpaItembonusAndAAbonus
)

type ReflectSpellType int

const (
	ReflectDisabled ReflectSpellType = iota
	ReflectSingleTargetSpellsOnly
	ReflectAllPlayerSpells
	ReflectAllSingleTargetSpells
	ReflectAllSpells
)

type InvisType int

const (
	TInvisible InvisType = iota
	TInvisibleVerseUndead
	TInvisibleVerseAnimal
)

type ProcType int

const (
	MeleeProc ProcType = 1 + iota
	RangedProc
	DefensiveProc
	SkillProc
	SkillProcSuccess
)

type SpellTargetType uint8

const (
	ST_TargetOptional SpellTargetType = 0x01 // only used for targeted projectile spells
	ST_AEClientV1     SpellTargetType = 0x02
	ST_GroupTeleport  SpellTargetType = 0x03
	ST_AECaster       SpellTargetType = 0x04
	ST_Target         SpellTargetType = 0x05
	ST_Self           SpellTargetType = 0x06
	// 0x07 not used
	ST_AETarget SpellTargetType = 0x08
	ST_Animal   SpellTargetType = 0x09
	ST_Undead   SpellTargetType = 0x0A
	ST_Summoned SpellTargetType = 0x0B
	// 0x0C not used
	ST_Tap    SpellTargetType = 0x0D
	ST_Pet    SpellTargetType = 0x0E
	ST_Corpse SpellTargetType = 0x0F
	ST_Plant  SpellTargetType = 0x10
	ST_Giant  SpellTargetType = 0x11 // special giant
	ST_Dragon SpellTargetType = 0x12 // special dragon
	// 0x13 not used
	ST_TargetAETap SpellTargetType = 0x14
	// 0x15–0x17 not used
	ST_UndeadAE   SpellTargetType = 0x18
	ST_SummonedAE SpellTargetType = 0x19
	// 0x1A–0x1F not used
	ST_AETargetHateList  SpellTargetType = 0x20
	ST_HateList          SpellTargetType = 0x21
	ST_LDoNChestCursed   SpellTargetType = 0x22
	ST_Muramite          SpellTargetType = 0x23 // only works on special muramites
	ST_AreaClientOnly    SpellTargetType = 0x24
	ST_AreaNPCOnly       SpellTargetType = 0x25
	ST_SummonedPet       SpellTargetType = 0x26
	ST_GroupNoPets       SpellTargetType = 0x27
	ST_AEBard            SpellTargetType = 0x28
	ST_Group             SpellTargetType = 0x29
	ST_Directional       SpellTargetType = 0x2A // AE around this target between two angles
	ST_GroupClientAndPet SpellTargetType = 0x2B
	ST_Beam              SpellTargetType = 0x2C
	ST_Ring              SpellTargetType = 0x2D
	ST_TargetsTarget     SpellTargetType = 0x2E // uses the target of your target
	ST_PetMaster         SpellTargetType = 0x2F // uses the master as target
	// 0x30–0x31 not used
	ST_TargetAENoPlayersPets SpellTargetType = 0x32
)

// --- spell‐type bitflags ---
type SpellTypes uint32

const (
	SpellTypeNuke                SpellTypes = 1 << 0
	SpellTypeHeal                           = 1 << 1
	SpellTypeRoot                           = 1 << 2
	SpellTypeBuff                           = 1 << 3
	SpellTypeEscape                         = 1 << 4
	SpellTypePet                            = 1 << 5
	SpellTypeLifetap                        = 1 << 6
	SpellTypeSnare                          = 1 << 7
	SpellTypeDot                            = 1 << 8
	SpellTypeDispel                         = 1 << 9
	SpellTypeInCombatBuff                   = 1 << 10
	SpellTypeMez                            = 1 << 11
	SpellTypeCharm                          = 1 << 12
	SpellTypeSlow                           = 1 << 13
	SpellTypeDebuff                         = 1 << 14
	SpellTypeCure                           = 1 << 15
	SpellTypeResurrect                      = 1 << 16
	SpellTypeHateRedux                      = 1 << 17
	SpellTypeInCombatBuffSong               = 1 << 18
	SpellTypeOutOfCombatBuffSong            = 1 << 19
	SpellTypePreCombatBuff                  = 1 << 20
	SpellTypePreCombatBuffSong              = 1 << 21
)

const (
	SpellTypeMin = (SpellTypeNuke << 1) - 1
	SpellTypeMax = (SpellTypePreCombatBuffSong << 1) - 1
	SpellTypeAny = 0xFFFFFFFF
)

// --- fixed sizes used below ---
const (
	EffectCount          = 12
	MaxSpellTrigger      = 12
	MaxResistableEffects = 12
	MaxLimitInclude      = 18
	MaxSkillProcs        = 4
	MaxAAProcs           = 16
	MaxCastOnSkillUse    = 36
	MaxInvisibilityLevel = 254
)

// --- the core SPDat_Spell struct ---
type SPDatSpell struct {
	ID                      int32
	Name                    [64]byte
	Player1                 [32]byte
	TeleportZone            [64]byte
	YouCast                 [64]byte
	OtherCasts              [64]byte
	CastOnYou               [64]byte
	CastOnOther             [64]byte
	SpellFades              [64]byte
	Range                   float32
	AeORange                float32
	PushBack                float32
	PushUp                  float32
	CastTime                uint32
	RecoveryTime            uint32
	RecastTime              uint32
	BuffDurationFormula     uint32
	BuffDuration            uint32
	AeODuration             uint32
	Mana                    int32
	BaseValue               [EffectCount]int32
	LimitValue              [EffectCount]int32
	MaxValue                [EffectCount]int32
	Component               [4]int32
	ComponentCount          [4]int32
	NoExpendReagent         [4]int32
	Formula                 [EffectCount]uint32
	GoodEffect              int8
	Activated               int32
	ResistType              int32
	EffectID                [EffectCount]int32
	TargetType              SpellTargetType
	BaseDifficulty          int32
	Skill                   uint8 // or a dedicated SkillType
	ZoneType                int8
	EnvironmentType         int8
	TimeOfDay               int8
	Classes                 [16]uint8
	CastingAnimation        uint8
	SpellAffectIndex        uint16
	DisallowSit             int8
	DeityAgnostic           int8
	Deities                 [16]int8
	NewIcon                 int16
	Uninterruptable         bool
	ResistDifficulty        int16
	UnstackableDot          bool
	RecourseLink            uint16
	NoPartialResist         bool
	ShortBuffBox            int8
	DescriptionID           int32
	TypeDescriptionID       int32
	EffectDescriptionID     int32
	NPCNoLOS                bool
	Feedbackable            bool
	Reflectable             bool
	BonusHate               int32
	LDoNTrap                bool
	EnduranceCost           int32
	TimerID                 int8
	IsDiscipline            bool
	HateAdded               int32
	EnduranceUpkeep         int32
	HitNumberType           int32
	HitNumber               int32
	PvPResistBase           int32
	PvPResistPerLevel       int32
	PvPResistCap            int32
	SpellCategory           int32
	PvPDuration             int32
	PvPDurationCap          int32
	PCNPCOnlyFlag           int32
	CastNotStanding         bool
	CanMGB                  bool
	DispelFlag              int32
	MinResist               int32
	MaxResist               int32
	ViralTargets            uint8
	ViralTimer              uint8
	NimbusEffect            int32
	DirectionalStart        float32
	DirectionalEnd          float32
	Sneak                   bool
	NotFocusable            bool
	NoDetrimentalSpellAggro bool
	Suspendable             bool
	ViralRange              int32
	SongCap                 int32
	NoBlock                 bool
	SpellGroup              int32
	Rank                    int32
	NoResist                int32
	CasterRequirementID     int32
	SpellClass              int32
	PersistDeath            bool
	MinDistance             float32
	MinDistanceMod          float32
	MaxDistance             float32
	MaxDistanceMod          float32
	MinRange                float32
	NoRemove                bool
	DamageShieldType        uint8
}

// global accessors
var (
	Spells       []SPDatSpell
	SPDATRecords int32
)
