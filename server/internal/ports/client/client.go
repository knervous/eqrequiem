// internal/ports/client/interface.go
package client

import (
	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

// Client defines the minimal methods Session needs.
type Client interface {
	Level() uint8
	Class() uint8
	Position() MobPosition
	Items() map[int32]*constants.ItemWithInstance
	SetPosition(MobPosition)
	SetVelocity(Velocity)
	CharData() *model.CharacterData
	Mob() *Mob
	GetMob() *Mob
	ID() int
	Name() string
	Say(msg string)
	Type() int32 // EntityTypePlayer, EntityTypeNPC, etc.
}
