package constants

type Skill uint8

const (
	Skill_1HBlunt Skill = iota
	Skill_1HSlashing
	Skill_2HBlunt
	Skill_2HSlashing
	Skill_Abjuration
	Skill_Alteration // 5
	Skill_ApplyPoison
	Skill_Archery
	Skill_Backstab
	Skill_BindWound
	Skill_Bash // 10
	Skill_Block
	Skill_BrassInstruments
	Skill_Channeling
	Skill_Conjuration
	Skill_Defense // 15
	Skill_Disarm
	Skill_DisarmTraps
	Skill_Divination
	Skill_Dodge
	Skill_DoubleAttack        // 20
	Skill_DragonPunchTailRake // Dragon Punch is the Iksar Monk skill Tail Rake is the Iksar Monk equivalent
	Skill_DualWield
	Skill_EagleStrike
	Skill_Evocation
	Skill_FeignDeath // 25
	Skill_FlyingKick
	Skill_Forage
	Skill_HandtoHand
	Skill_Hide
	Skill_Kick // 30
	Skill_Meditate
	Skill_Mend
	Skill_Offense
	Skill_Parry
	Skill_PickLock   // 35
	Skill_1HPiercing // Changed in RoF2(05-10-2
	Skill_Riposte
	Skill_RoundKick
	Skill_SafeFall
	Skill_SenseHeading // 40
	Skill_Singing
	Skill_Sneak
	Skill_SpecializeAbjure // No idea why they trunca
	Skill_SpecializeAlteration
	Skill_SpecializeConjuration // 45
	Skill_SpecializeDivination
	Skill_SpecializeEvocation
	Skill_PickPockets
	Skill_StringedInstruments
	Skill_Swimming // 50
	Skill_Throwing
	Skill_TigerClaw
	Skill_Tracking
	Skill_WindInstruments
	Skill_Fishing // 55
	Skill_MakePoison
	Skill_Tinkering
	Skill_Research
	Skill_Alchemy
	Skill_Baking // 60
	Skill_Tailoring
	Skill_SenseTraps
	Skill_Blacksmithing
	Skill_Fletching
	Skill_Brewing // 65
	Skill_AlcoholTolerance
	Skill_Begging
	Skill_JewelryMaking
	Skill_Pottery
	Skill_PercussionInstruments // 70
	Skill_Intimidation
	Skill_Berserking
	Skill_Taunt
	Skill_Frenzy      // 74
	Skill_RemoveTraps // 75
	Skill_TripleAttack
	Skill_2HPiercing // 77

	Skill_HIGHEST = Skill_2HPiercing
)
