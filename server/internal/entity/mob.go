package entity

import (
	"strings"

	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

const (
	EntityTypeNPC = iota
	EntityTypePlayer
	EntityTypeCorpse
)

type EntityDataSource interface {
	Level() uint8
	Class() uint8
}

type Mob struct {
	model.Spawn2
	MobID     int
	MobName   string
	Velocity  Velocity
	Zone      ZoneAccess
	Speed     float32
	Size      float32
	Animation string
	dirty     bool

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
	m.Zone.BroadcastChannelMessage(m.CleanName(), msg, 0)
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

func (m *Mob) MarkDirty()    { m.dirty = true }
func (m *Mob) ClearDirty()   { m.dirty = false }
func (m *Mob) IsDirty() bool { return m.dirty }

type MobPosition struct {
	X       float64
	Y       float64
	Z       float64
	Heading float64
}

type Velocity struct {
	X float64
	Y float64
	Z float64
}

type Entity interface {
	ID() int
	GetMob() *Mob
	Name() string
	Type() int32
	Say(msg string)
	Position() MobPosition
	SetPosition(pos MobPosition)
}

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

type CasterClass uint8

const (
	CasterClassWisdom CasterClass = iota // Wisdom casters
	CasterClassIntelligence
	CasterClassNone
)

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
