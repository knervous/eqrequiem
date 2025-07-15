package entity

import (
	"time"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
)

type NPC interface {
	Mob() *Mob
	GetMob() *Mob
	NpcData() *model.NpcTypes // returns the NPC data from the database
	AggressionLevel() int
	SetAggressionLevel(level int)
	Level() uint8
	Class() uint8
	Position() MobPosition
	SetPosition(MobPosition)
	Velocity() Velocity
	SetVelocity(Velocity)
	ID() int
	Name() string
	Say(msg string)
	Type() int32 // EntityTypePlayer, EntityTypeNPC, etc.

	Speed() float32 // speed in units per second
	CalcBonuses()   // calculate any bonuses or stats

	GridEntries() []db_zone.GridEntries // the full path
	SetGridEntries(entries []db_zone.GridEntries)
	CurrentGridEntry() db_zone.GridEntries // current entry in the path
	GridIndex() int                        // which entry we’re on
	SetGridIndex(index int)
	NextGridMove() time.Time // when to move to the next entry
	SetNextGridMove(next time.Time)
	PauseUntil() time.Time // if now < PauseUntil, we’re paused
	SetPauseUntil(pause time.Time)
	LastUpdate() time.Time // last time we moved/interpolated
	SetLastUpdate(last time.Time)
}
