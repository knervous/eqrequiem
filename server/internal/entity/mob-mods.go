package entity

import (
	"github.com/knervous/eqgo/internal/constants"
)

// levelThreshold associates an upper level bound with a multiplier.
// If a mob's level is less than MaxLevel, it receives the corresponding Factor.
type levelThreshold struct {
	MaxLevel uint8
	Factor   uint32
}

// classLevelThresholds defines level-based factors for each class.
var classLevelThresholds = map[uint8][]levelThreshold{
	constants.Class_Warrior: {
		{20, 220}, {30, 230}, {40, 250}, {53, 270}, {57, 280}, {60, 290}, {70, 300}, {255, 311},
	},
	constants.Class_Druid:  {{70, 150}, {255, 157}},
	constants.Class_Cleric: {{70, 150}, {255, 157}},
	constants.Class_Shaman: {{70, 150}, {255, 157}},
	constants.Class_Berserker: {
		{35, 210}, {45, 220}, {51, 230}, {56, 240}, {60, 250}, {68, 260}, {255, 270},
	},
	constants.Class_Paladin: {
		{35, 210}, {45, 220}, {51, 230}, {56, 240}, {60, 250}, {68, 260}, {255, 270},
	},
	constants.Class_ShadowKnight: {
		{35, 210}, {45, 220}, {51, 230}, {56, 240}, {60, 250}, {68, 260}, {255, 270},
	},
	constants.Class_Monk: {
		{51, 180}, {58, 190}, {70, 200}, {255, 210},
	},
	constants.Class_Bard: {
		{51, 180}, {58, 190}, {70, 200}, {255, 210},
	},
	constants.Class_Rogue: {
		{51, 180}, {58, 190}, {70, 200}, {255, 210},
	},
	constants.Class_Beastlord: {
		{51, 180}, {58, 190}, {70, 200}, {255, 210},
	},
	constants.Class_Ranger: {
		{58, 200}, {70, 210}, {255, 220},
	},
	constants.Class_Magician:    {{70, 120}, {255, 127}},
	constants.Class_Wizard:      {{70, 120}, {255, 127}},
	constants.Class_Necromancer: {{70, 120}, {255, 127}},
	constants.Class_Enchanter:   {{70, 120}, {255, 127}},
}

// defaultClassLevelThresholds applies when a class has no specific entry.
var defaultClassLevelThresholds = []levelThreshold{
	{35, 210}, {45, 220}, {51, 230}, {56, 240}, {60, 250}, {255, 260},
}

func (m *Mob) GetClassLevelFactor() uint32 {
	classID := uint8(m.DataSource.Level())
	thresholds, ok := classLevelThresholds[classID]
	if !ok {
		thresholds = defaultClassLevelThresholds
	}

	level := uint8(m.DataSource.Level())
	for _, t := range thresholds {
		if level < t.MaxLevel {
			return t.Factor
		}
	}
	return thresholds[len(thresholds)-1].Factor
}

func (m *Mob) CalcMaxHP() {
	m.MaxHp = m.BaseHp
	if m.ItemBonuses != nil {
		m.MaxHp += int(m.ItemBonuses.HP)
	}
	if m.SpellBonuses != nil {
		m.MaxHp += int(m.SpellBonuses.HP)
	}
	// todo c++ conversion
	// 	max_hp += max_hp * ((aabonuses.MaxHPChange + spellbonuses.MaxHPChange + itembonuses.MaxHPChange) / 10000.0f);
}

func (m *Mob) CalcMaxMana() {
	spellBonusMana := int32(0)
	itemBonusMana := int32(0)
	if m.SpellBonuses != nil {
		spellBonusMana = int32(m.SpellBonuses.Mana)
	}
	if m.ItemBonuses != nil {
		itemBonusMana = int32(m.ItemBonuses.Mana)
	}
	switch m.GetCasterClass() {
	case CasterClassIntelligence:
		m.MaxMana = int(((m.INT/2)+1)*int32(m.DataSource.Level()) + spellBonusMana + itemBonusMana)
	case CasterClassWisdom:
		m.MaxMana = int(((m.WIS/2)+1)*int32(m.DataSource.Level()) + spellBonusMana + itemBonusMana)
	default:
		m.MaxMana = 0 // Non-casters have no mana
	}

	if m.MaxMana < 0 {
		m.MaxMana = 0
	}
}
