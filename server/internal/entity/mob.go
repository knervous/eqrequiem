package entity

import (
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

type Mob struct {
	model.Spawn2
	MobID    int
	MobName  string
	Position MobPosition
}

func (m *Mob) ID() int      { return m.MobID }
func (m *Mob) Name() string { return m.MobName }
func (m *Mob) Type() string { return "mob" }

type MobPosition struct {
	X       float32
	Y       float32
	Z       float32
	Heading float32
}

type Moblike interface {
	ID() int
	Name() string
	Type() string
}
