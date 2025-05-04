package entity

import "github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"

type Mob struct {
	model.Spawn2
	MobID   int
	MobName string
}

func (m *Mob) ID() int      { return m.MobID }
func (m *Mob) Name() string { return m.MobName }
func (m *Mob) Type() string { return "mob" }

type Moblike interface {
	ID() int
	Name() string
	Type() string
}
