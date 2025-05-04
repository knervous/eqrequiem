package entity

type NPC struct {
	Mob
	AggressionLevel int
}

func (n *NPC) Type() string { return "npc" }
