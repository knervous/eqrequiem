package client

import (
	"strings"

	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

type CasterClass uint8

const (
	CasterClassWisdom CasterClass = iota // Wisdom casters
	CasterClassIntelligence
	CasterClassNone
)

type Mob struct {
	model.Spawn2
	MobID     int
	MobName   string
	Velocity  Velocity
	Zone      ZoneAccess
	Speed     float32
	Size      float32
	Animation string
	Dirty     bool

	DataSource   EntityDataSource
	AC           int
	MitigationAc int
	ATK          int32
	STR          int32
	STA          int32
	DEX          int32
	AGI          int32
	INT          int32
	WIS          int32
	CHA          int32
	MR           int32
	FR           int32
	CR           int32
	DR           int32
	PR           int32

	CurrentHp   int
	MaxHp       int
	BaseHp      int
	CurrentMana int
	MaxMana     int
	HpRegen     int
	ManaRegen   int

	ItemBonuses  *constants.StatBonuses
	SpellBonuses *constants.StatBonuses
	AABonuses    *constants.StatBonuses

	PetID   uint16
	OwnerId uint16

	Moving    bool
	Running   bool
	Targeted  int
	Findable  bool
	Trackable bool
}

func (m *Mob) ID() int      { return m.MobID }
func (m *Mob) Name() string { return m.MobName }
func (m *Mob) CleanName() string {
	return strings.ReplaceAll(m.Name(), "_", " ")
}
func (m *Mob) Type() int32         { return EntityTypeNPC }
func (m *Mob) GetZone() ZoneAccess { return m.Zone }

func (m *Mob) Say(msg string) {
	m.Zone.BroadcastChannel(m.CleanName(), 0, msg)
}

func (m *Mob) SetVelocity(vel Velocity) {
	m.Velocity = vel
}
func (m *Mob) GetVelocity() Velocity {
	return m.Velocity
}

func (m *Mob) GetMob() *Mob {
	return m
}

func (m *Mob) MarkDirty()    { m.Dirty = true }
func (m *Mob) ClearDirty()   { m.Dirty = false }
func (m *Mob) IsDirty() bool { return m.Dirty }

// Functions

func (m *Mob) CalcItemBonuses() {
	// Stubbed out for now
}

func (m *Mob) CalcEdibleBonuses() {
	// Stubbed out for now
}

func (m *Mob) CalcSpellBonuses() {
	// Stubbed out for now
}

func (m *Mob) CalcAABonuses() {
	// Stubbed out for now
}

func (m *Mob) CalcAC() {
	// Stubbed out for now
}

func (m *Mob) ProcessItemCaps() {

}

func (m *Mob) GetCasterClass() CasterClass {
	switch m.DataSource.Class() {
	case constants.Class_Cleric, constants.Class_Paladin, constants.Class_Ranger, constants.Class_Druid,
		constants.Class_Shaman, constants.Class_Beastlord, constants.Class_ClericGM, constants.Class_PaladinGM,
		constants.Class_RangerGM, constants.Class_DruidGM, constants.Class_ShamanGM, constants.Class_BeastlordGM:
		return CasterClassWisdom // Wisdom casters

	case constants.Class_ShadowKnight, constants.Class_Bard, constants.Class_Necromancer,
		constants.Class_Wizard, constants.Class_Magician, constants.Class_Enchanter,
		constants.Class_ShadowKnightGM, constants.Class_BardGM, constants.Class_NecromancerGM,
		constants.Class_WizardGM, constants.Class_MagicianGM, constants.Class_EnchanterGM:
		return CasterClassIntelligence // Intelligence casters

	default:
		return CasterClassNone // Non-casters
	}
}

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
