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

type Mob struct {
	model.Spawn2
	MobID     int
	MobName   string
	Position  MobPosition
	Velocity  Velocity
	Zone      ZoneAccess
	Speed     float32
	Animation string
	dirty     bool

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

func (m *Mob) GetPosition() MobPosition {
	return m.Position
}

func (m *Mob) SetPosition(pos MobPosition) {
	m.Position = pos
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
	X       float32
	Y       float32
	Z       float32
	Heading float32
}

type Velocity struct {
	X float32
	Y float32
	Z float32
}

type Entity interface {
	ID() int
	GetMob() *Mob
	Name() string
	Type() int32
	Say(msg string)
	GetPosition() MobPosition
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
