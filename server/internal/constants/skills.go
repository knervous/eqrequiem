package constants

const (
	Skill_1HBlunt int = iota
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

// IsTradeskill returns true if this skill is a crafting/tradeskill.
func IsTradeskill(skill int) bool {
	switch skill {
	case Skill_Fishing,
		Skill_MakePoison,
		Skill_Tinkering,
		Skill_Research,
		Skill_Alchemy,
		Skill_Baking,
		Skill_Tailoring,
		Skill_Blacksmithing,
		Skill_Fletching,
		Skill_Brewing,
		Skill_Pottery,
		Skill_JewelryMaking:
		return true
	default:
		return false
	}
}

// IsSpecializedSkill returns true if this skill is one of the five mage-specializations.
func IsSpecializedSkill(skill int) bool {
	switch skill {
	case Skill_SpecializeAbjure,
		Skill_SpecializeAlteration,
		Skill_SpecializeConjuration,
		Skill_SpecializeDivination,
		Skill_SpecializeEvocation:
		return true
	default:
		return false
	}
}

// GetSkillMeleePushForce is the “push” force applied by a melee attack of this skill.
func GetSkillMeleePushForce(skill int) float32 {
	switch skill {
	case Skill_1HBlunt,
		Skill_1HSlashing,
		Skill_HandtoHand,
		Skill_Throwing:
		return 0.1
	case Skill_2HBlunt,
		Skill_2HSlashing,
		Skill_EagleStrike,
		Skill_Kick,
		Skill_TigerClaw,
		Skill_2HPiercing:
		return 0.2
	case Skill_Archery:
		return 0.15
	case Skill_Backstab,
		Skill_Bash:
		return 0.3
	case Skill_DragonPunchTailRake,
		Skill_RoundKick:
		return 0.25
	case Skill_FlyingKick:
		return 0.4
	case Skill_1HPiercing,
		Skill_Frenzy:
		return 0.05
	case Skill_Intimidation:
		return 2.5
	default:
		return 0.0
	}
}

// IsBardInstrumentSkill returns true if the skill is one of the bard instrument skills.
func IsBardInstrumentSkill(skill int) bool {
	switch skill {
	case Skill_BrassInstruments,
		Skill_Singing,
		Skill_StringedInstruments,
		Skill_WindInstruments,
		Skill_PercussionInstruments:
		return true
	default:
		return false
	}
}

// IsCastingSkill returns true if the skill is one of the five spell schools.
func IsCastingSkill(skill int) bool {
	switch skill {
	case Skill_Abjuration,
		Skill_Alteration,
		Skill_Conjuration,
		Skill_Divination,
		Skill_Evocation:
		return true
	default:
		return false
	}
}

// GetBaseDamage returns the “base” damage associated with certain melee skills.
func GetBaseDamage(skill int) int {
	switch skill {
	case Skill_Bash:
		return 2
	case Skill_DragonPunchTailRake:
		return 12
	case Skill_EagleStrike:
		return 7
	case Skill_FlyingKick:
		return 25
	case Skill_Kick:
		return 3
	case Skill_RoundKick:
		return 5
	case Skill_TigerClaw:
		return 4
	case Skill_Frenzy:
		return 10
	default:
		return 0
	}
}

// skillTypeMap maps skill IDs to their display names.
var skillTypeMap = map[int]string{
	Skill_1HBlunt:               "1H Blunt",
	Skill_1HSlashing:            "1H Slashing",
	Skill_2HBlunt:               "2H Blunt",
	Skill_2HSlashing:            "2H Slashing",
	Skill_Abjuration:            "Abjuration",
	Skill_Alteration:            "Alteration",
	Skill_ApplyPoison:           "Apply Poison",
	Skill_Archery:               "Archery",
	Skill_Backstab:              "Backstab",
	Skill_BindWound:             "Bind Wound",
	Skill_Bash:                  "Bash",
	Skill_Block:                 "Block",
	Skill_BrassInstruments:      "Brass Instruments",
	Skill_Channeling:            "Channeling",
	Skill_Conjuration:           "Conjuration",
	Skill_Defense:               "Defense",
	Skill_Disarm:                "Disarm",
	Skill_DisarmTraps:           "Disarm Traps",
	Skill_Divination:            "Divination",
	Skill_Dodge:                 "Dodge",
	Skill_DoubleAttack:          "Double Attack",
	Skill_DragonPunchTailRake:   "Dragon Punch",
	Skill_DualWield:             "Dual Wield",
	Skill_EagleStrike:           "Eagle Strike",
	Skill_Evocation:             "Evocation",
	Skill_FeignDeath:            "Feign Death",
	Skill_FlyingKick:            "Flying Kick",
	Skill_Forage:                "Forage",
	Skill_HandtoHand:            "Hand to Hand",
	Skill_Hide:                  "Hide",
	Skill_Kick:                  "Kick",
	Skill_Meditate:              "Meditate",
	Skill_Mend:                  "Mend",
	Skill_Offense:               "Offense",
	Skill_Parry:                 "Parry",
	Skill_PickLock:              "Pick Lock",
	Skill_1HPiercing:            "1H Piercing",
	Skill_Riposte:               "Riposte",
	Skill_RoundKick:             "Round Kick",
	Skill_SafeFall:              "Safe Fall",
	Skill_SenseHeading:          "Sense Heading",
	Skill_Singing:               "Singing",
	Skill_Sneak:                 "Sneak",
	Skill_SpecializeAbjure:      "Specialize Abjuration",
	Skill_SpecializeAlteration:  "Specialize Alteration",
	Skill_SpecializeConjuration: "Specialize Conjuration",
	Skill_SpecializeDivination:  "Specialize Divination",
	Skill_SpecializeEvocation:   "Specialize Evocation",
	Skill_PickPockets:           "Pick Pockets",
	Skill_StringedInstruments:   "Stringed Instruments",
	Skill_Swimming:              "Swimming",
	Skill_Throwing:              "Throwing",
	Skill_TigerClaw:             "Tiger Claw",
	Skill_Tracking:              "Tracking",
	Skill_WindInstruments:       "Wind Instruments",
	Skill_Fishing:               "Fishing",
	Skill_MakePoison:            "Make Poison",
	Skill_Tinkering:             "Tinkering",
	Skill_Research:              "Research",
	Skill_Alchemy:               "Alchemy",
	Skill_Baking:                "Baking",
	Skill_Tailoring:             "Tailoring",
	Skill_SenseTraps:            "Sense Traps",
	Skill_Blacksmithing:         "Blacksmithing",
	Skill_Fletching:             "Fletching",
	Skill_Brewing:               "Brewing",
	Skill_AlcoholTolerance:      "Alcohol Tolerance",
	Skill_Begging:               "Begging",
	Skill_JewelryMaking:         "Jewelry Making",
	Skill_Pottery:               "Pottery",
	Skill_PercussionInstruments: "Percussion Instruments",
	Skill_Intimidation:          "Intimidation",
	Skill_Berserking:            "Berserking",
	Skill_Taunt:                 "Taunt",
	Skill_Frenzy:                "Frenzy",
	Skill_RemoveTraps:           "Remove Traps",
	Skill_TripleAttack:          "Triple Attack",
	Skill_2HPiercing:            "2H Piercing",
}

// GetSkillName returns the human-readable name for a skill, or empty if unknown.
func GetSkillName(skill int) string {
	if name, ok := skillTypeMap[skill]; ok {
		return name
	}
	return ""
}

// ExtraDamageSkills lists all skills which grant an “extra-damage” bonus.
var ExtraDamageSkills = []int{
	Skill_Backstab,
	Skill_Bash,
	Skill_DragonPunchTailRake,
	Skill_EagleStrike,
	Skill_FlyingKick,
	Skill_Kick,
	Skill_RoundKick,
	Skill_RoundKick, // duplicate by design
	Skill_TigerClaw,
	Skill_Frenzy,
}
