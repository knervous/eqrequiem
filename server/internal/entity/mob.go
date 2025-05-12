package entity

import (
	"strings"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

type Mob struct {
	model.Spawn2
	MobID    int
	MobName  string
	Position MobPosition
	Zone     ZoneAccess
	Speed    float32
}

func (m *Mob) ID() int      { return m.MobID }
func (m *Mob) Name() string { return m.MobName }
func (m *Mob) CleanName() string {
	return strings.ReplaceAll(m.Name(), "_", " ")
}
func (m *Mob) Type() string        { return "mob" }
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

type MobPosition struct {
	X       float32
	Y       float32
	Z       float32
	Heading float32
}

type Entity interface {
	ID() int
	Name() string
	Type() string
	Say(msg string)
}
