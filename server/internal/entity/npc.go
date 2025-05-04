package entity

import "github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"

type NPC struct {
	Mob
	NpcData         model.NpcTypes
	AggressionLevel int
}

func (n *NPC) Type() string { return "npc" }
