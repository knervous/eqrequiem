// stat_bonuses.go
package constants

// StatBonuses holds all the various bonus stats for an entity.
type StatBonuses struct {
	AC                         int32
	HP                         int64
	HPRegen                    int64
	MaxHP                      int64
	ManaRegen                  int64
	EnduranceRegen             int64
	Mana                       int64
	Endurance                  int64
	ATK                        int32
	STR                        int32
	STRCapMod                  int32
	HeroicSTR                  int32
	STA                        int32
	STACapMod                  int32
	HeroicSTA                  int32
	DEX                        int32
	DEXCapMod                  int32
	HeroicDEX                  int32
	AGI                        int32
	AGICapMod                  int32
	HeroicAGI                  int32
	INT                        int32
	INTCapMod                  int32
	HeroicINT                  int32
	WIS                        int32
	WISCapMod                  int32
	HeroicWIS                  int32
	CHA                        int32
	CHACapMod                  int32
	HeroicCHA                  int32
	MR                         int32
	MRCapMod                   int32
	HeroicMR                   int32
	FR                         int32
	FRCapMod                   int32
	HeroicFR                   int32
	CR                         int32
	CRCapMod                   int32
	HeroicCR                   int32
	PR                         int32
	PRCapMod                   int32
	HeroicPR                   int32
	DR                         int32
	DRCapMod                   int32
	HeroicDR                   int32
	Corrup                     int32
	CorrupCapMod               int32
	HeroicCorrup               int32
	DamageShieldSpellID        uint16
	DamageShield               int
	DamageShieldType           DmgShieldType
	SpellDamageShield          int
	SpellShield                int
	ReverseDamageShield        int
	ReverseDamageShieldSpellID uint16
	ReverseDamageShieldType    DmgShieldType
	MovementSpeed              int
	Haste                      int32
	HasteType2                 int32
	HasteType3                 int32
	InhibitMelee               int32
	AggroRange                 float32
	AssistRange                float32
	SkillMod                   [Skill_HIGHEST + 1]uint8
	SkillModMax                [Skill_HIGHEST + 1]uint8
	EffectiveCastingLevel      int
	AdjustedCastingSkill       int
	Reflect                    [3]int
	SingingMod                 uint32
	Amplification              uint32
	BrassMod                   uint32
	PercussionMod              uint32
	WindMod                    uint32
	StringedMod                uint32
	SongModCap                 uint32
	HateMod                    int32
	EnduranceReduction         int64

	StrikeThrough                int32
	MeleeMitigation              int32
	MeleeMitigationEffect        int32
	CriticalHitChance            [Skill_HIGHEST + 2]int32
	CriticalSpellChance          int32
	SpellCritDmgIncrease         int32
	SpellCritDmgIncNoStack       int32
	DotCritDmgIncrease           int32
	CriticalHealChance           int32
	CriticalHealOverTime         int32
	CriticalDoTChance            int32
	CrippBlowChance              int32
	AvoidMeleeChance             int32
	AvoidMeleeChanceEffect       int32
	RiposteChance                int32
	DodgeChance                  int32
	ParryChance                  int32
	DualWieldChance              int32
	DoubleAttackChance           int32
	TripleAttackChance           int32
	DoubleRangedAttack           int32
	ResistSpellChance            int32
	ResistFearChance             int32
	Fearless                     bool
	IsFeared                     bool
	IsBlind                      bool
	StunResist                   int32
	MeleeSkillCheck              int32
	MeleeSkillCheckSkill         uint8
	HitChance                    int32
	HitChanceEffect              [Skill_HIGHEST + 2]int32
	DamageModifier               [Skill_HIGHEST + 2]int32
	DamageModifier2              [Skill_HIGHEST + 2]int32
	DamageModifier3              [Skill_HIGHEST + 2]int32
	MinDamageModifier            [Skill_HIGHEST + 2]int32
	ProcChance                   int32
	ProcChanceSPA                int32
	ExtraAttackChance            [2]int32
	ExtraAttackChancePrimary     [2]int32
	ExtraAttackChanceSecondary   [2]int32
	DoubleMeleeRound             [2]int32
	DoTShielding                 int32
	DivineSaveChance             [2]int32
	DeathSave                    [4]uint32
	FlurryChance                 int32
	Accuracy                     [Skill_HIGHEST + 2]int32
	HundredHands                 int32
	MeleeLifetap                 int32
	Vampirism                    int32
	HealRate                     int32
	MaxHPChange                  int32
	SkillDmgTaken                [Skill_HIGHEST + 2]int16
	HealAmt                      int32
	SpellDmg                     int32
	Clairvoyance                 int32
	DSMitigation                 int32
	DSMitigationOffHand          int32
	SpellTriggers                [MaxSpellTrigger]uint32
	SpellOnKill                  [MaxSpellTrigger * 3]uint32
	SpellOnDeath                 [MaxSpellTrigger * 2]uint32
	CritDmgMod                   [Skill_HIGHEST + 2]int32
	CritDmgModNoStack            [Skill_HIGHEST + 2]int32
	SkillReuseTime               [Skill_HIGHEST + 1]int32
	SkillDamageAmount            [Skill_HIGHEST + 2]int32
	TwoHandBluntBlock            int32
	ItemManaRegenCap             uint32
	GravityEffect                int32
	AntiGate                     bool
	MagicWeapon                  bool
	IncreaseBlockChance          int32
	PersistantCasting            uint32
	XPRateMod                    int
	HPPercCap                    [2]int
	ManaPercCap                  [2]int
	EndPercCap                   [2]int
	ImmuneToFlee                 bool
	VoiceGraft                   uint32
	SpellProcChance              int32
	CharmBreakChance             int32
	SongRange                    int32
	HPToManaConvert              uint32
	FocusEffects                 [Focus_HIGHEST + 1]int32
	FocusEffectsWorn             [Focus_HIGHEST + 1]int16
	NegateEffects                bool
	SkillDamageAmount2           [Skill_HIGHEST + 2]int32
	NegateAttacks                [3]uint32
	MitigateMeleeRune            [4]uint32
	MeleeThresholdGuard          [3]uint32
	SpellThresholdGuard          [3]uint32
	MitigateSpellRune            [4]uint32
	MitigateDotRune              [4]uint32
	TriggerMeleeThreshold        bool
	TriggerSpellThreshold        bool
	ManaAbsorbPercentDamage      uint32
	EnduranceAbsorbPercentDamage [2]int32
	ShieldBlock                  int32
	BlockBehind                  int32
	CriticalRegenDecay           bool
	CriticalHealDecay            bool
	CriticalDotDecay             bool
	DivineAura                   bool
	DistanceRemoval              bool
	ImprovedTaunt                [3]int32
	Root                         [2]int8
	FrenziedDevastation          int32
	AbsorbMagicAtt               [2]uint32
	MeleeRune                    [2]uint32
	NegateIfCombat               bool
	Screech                      int8
	AlterNPCLevel                int32
	AStacker                     [2]int32
	BStacker                     [2]int32
	CStacker                     [2]int32
	DStacker                     [2]int32
	BerserkSPA                   bool
	Metabolism                   int32
	Sanctuary                    bool
	FactionModPct                int32
	LimitToSkill                 [Skill_HIGHEST + 3]bool
	SkillProc                    [MaxSkillProcs]int32
	SkillProcSuccess             [MaxSkillProcs]int32
	SpellProc                    [MaxAAProcs]int32
	RangedProc                   [MaxAAProcs]int32
	DefensiveProc                [MaxAAProcs]int32
	ProcTimerModifier            bool
	PCPetRampage                 [2]uint32
	PCPetAERampage               [2]uint32
	PCPetFlurry                  uint32
	AttackAccuracyMaxPercent     int32
	ACMitigationMaxPercent       int32
	ACAvoidanceMaxPercent        int32
	DamageTakenPositionMod       [2]int32
	MeleeDamagePositionMod       [2]int32
	DamageTakenPositionAmt       [2]int32
	MeleeDamagePositionAmt       [2]int32
	DoubleBackstabFront          int32
	DSMitigationAmount           int32
	DSMitigationPercentage       int32
	PetCritMeleeDamagePctOwner   int32
	PetAddAtk                    int32
	ItemEnduranceRegenCap        int32
	WeaponStance                 [WeaponStanceTypeMax + 1]int32
	ZoneSuspendMinion            bool
	CompleteHealBuffBlocker      bool
	Illusion                     int32
	Invisibility                 uint8
	InvisibilityVerseUndead      uint8
	InvisibilityVerseAnimal      uint8

	// AAs
	TrapCircumvention        int32
	SecondaryForte           uint16
	ShieldDuration           int32
	ExtendedShielding        int32
	Packrat                  int8
	BuffSlotIncrease         uint8
	DelayDeath               uint32
	BaseMovementSpeed        int8
	IncreaseRunSpeedCap      uint8
	DoubleSpecialAttack      int32
	SkillAttackProc          [MaxCastOnSkillUse]int32
	HasSkillAttackProc       [Skill_HIGHEST + 1]bool
	FrontalStunResist        uint8
	BindWound                int32
	MaxBindWound             int32
	ChannelChanceSpells      int32
	ChannelChanceItems       int32
	SeeInvis                 uint8
	TripleBackstab           uint8
	FrontalBackstabMinDmg    bool
	FrontalBackstabChance    uint8
	ConsumeProjectile        uint8
	ForageAdditionalItems    uint8
	SalvageChance            uint8
	ArcheryDamageModifier    uint32
	SecondaryDmgInc          bool
	GiveDoubleAttack         uint32
	SlayUndead               [2]int32
	PetCriticalHit           int32
	PetAvoidance             int32
	CombatStability          int32
	DoubleRiposte            int32
	GiveDoubleRiposte        [3]int32
	RaiseSkillCap            [Skill_HIGHEST + 1]uint32
	Ambidexterity            int32
	PetMaxHP                 int32
	PetFlurry                int32
	MasteryOfPast            uint8
	GivePetGroupTarget       bool
	RootBreakChance          int32
	UnfailingDivinity        int32
	ItemHPRegenCap           int32
	SEResist                 [MaxResistableEffects * 2]int32
	OffhandRiposteFail       int32
	ItemATKCap               int32
	FinishingBlow            [2]int32
	FinishingBlowLvl         [2]uint32
	ShieldEquipDmgMod        int32
	TriggerOnCastRequirement bool
	StunBashChance           int8
	IncreaseChanceMemwipe    int8
	CriticalMend             int8
	ImprovedReclaimEnergy    int32
	HeadShot                 [2]uint32
	HSLevel                  [2]uint8
	Assassinate              [2]uint32
	AssassinateLevel         [2]uint8
	PetMeleeMitigation       int32
	IllusionPersistence      int
	ExtraXTargets            uint16
	ShroudOfStealth          bool
	ReduceFallDamage         uint16
	ReduceTradeskillFail     [Skill_HIGHEST + 1]int32
	TradeSkillMastery        uint8
	NoBreakAESneak           int16
	FeignedCastOnChance      int16
	PetCommands              [PetMaxCommands]bool
	FeignedMinionChance      int
	GrantForage              int
	AuraSlots                int
	TrapSlots                int
	Hunger                   bool
	HeroicMaxHP              int64
	HeroicMaxMana            int64
	HeroicMaxEndurance       int64
	HeroicHPRegen            int64
	HeroicManaRegen          int64
	HeroicEnduranceRegen     int64
	HeroicStrShieldAC        int32
	HeroicStrMeleeDamage     int32
	HeroicAgiAvoidance       int32
	HeroicDexRangedDamage    int32
}
