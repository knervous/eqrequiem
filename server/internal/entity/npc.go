package entity

import (
	"time"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

type NPC struct {
	Mob
	NpcData         model.NpcTypes
	AggressionLevel int

	GridEntries  []*model.GridEntries // the full path
	GridIndex    int                  // which entry we’re on
	NextGridMove time.Time            // when to move to the next entry
	PauseUntil   time.Time            // if now < PauseUntil, we’re paused
	LastUpdate   time.Time            // last time we moved/interpolated
}

func (n *NPC) Type() string { return "npc" }
