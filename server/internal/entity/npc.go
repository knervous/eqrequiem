package entity

import (
	"time"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
)

type NPC struct {
	Mob
	NpcData         model.NpcTypes
	AggressionLevel int

	GridEntries  []db_zone.GridEntries // the full path
	GridIndex    int                   // which entry we’re on
	NextGridMove time.Time             // when to move to the next entry
	PauseUntil   time.Time             // if now < PauseUntil, we’re paused
	LastUpdate   time.Time             // last time we moved/interpolated
}

func (n *NPC) Type() int32 { return EntityTypeNPC }

func (n *NPC) GetPosition() MobPosition {
	return n.Mob.Position
}
