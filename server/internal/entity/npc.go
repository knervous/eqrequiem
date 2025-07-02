package entity

import (
	"time"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
)

type NPC struct {
	Mob
	NpcData         *model.NpcTypes
	AggressionLevel int

	GridEntries  []db_zone.GridEntries // the full path
	GridIndex    int                   // which entry we’re on
	NextGridMove time.Time             // when to move to the next entry
	PauseUntil   time.Time             // if now < PauseUntil, we’re paused
	LastUpdate   time.Time             // last time we moved/interpolated
}

func (n *NPC) Type() int32 { return EntityTypeNPC }

func (n *NPC) SetPosition(pos MobPosition) {
	n.Mob.X = pos.X
	n.Mob.Y = pos.Y
	n.Mob.Z = pos.Z
	n.Mob.Heading = pos.Heading
	n.Mob.dirty = true
}

func (n *NPC) Position() MobPosition {
	return MobPosition{X: n.Mob.X, Y: n.Mob.Y, Z: n.Mob.Z, Heading: n.Mob.Heading}
}

func (c *NPC) Level() uint8 {
	return uint8(c.NpcData.Level)
}

func (c *NPC) Class() uint8 {
	return uint8(c.NpcData.Class)
}

func (n *NPC) CalcBonuses() {

}

func NewNPC(mob Mob, npcData *model.NpcTypes, gridEntries []db_zone.GridEntries, gridIndex int, nextGridMove time.Time, pauseUntil time.Time, lastUpdate time.Time) *NPC {
	npc := &NPC{
		NpcData:         npcData,
		Mob:             mob,
		GridEntries:     gridEntries,
		GridIndex:       gridIndex,
		NextGridMove:    nextGridMove,
		PauseUntil:      pauseUntil,
		LastUpdate:      lastUpdate,
		AggressionLevel: 0,
	}
	npc.Mob.DataSource = npc

	// In values for ctor
	npc.Mob.CurrentHp = int(npcData.Hp)
	npc.Mob.MaxHp = int(npcData.Hp)
	npc.Mob.BaseHp = int(npcData.Hp)
	npc.Mob.HpRegen = int(npcData.HpRegenRate)
	npc.Mob.CurrentMana = int(npcData.Mana)
	npc.Mob.MaxMana = int(npcData.Mana)
	npc.Mob.ManaRegen = int(npcData.ManaRegenRate)
	npc.Mob.Size = float32(npcData.Size)
	npc.Mob.Speed = float32(npcData.Runspeed)
	npc.Mob.AC = int(npcData.Ac)
	npc.Mob.ATK = int32(npcData.Atk)
	npc.Mob.STR = int32(npcData.Str)
	npc.Mob.STA = int32(npcData.Sta)
	npc.Mob.DEX = int32(npcData.Dex)
	npc.Mob.AGI = int32(npcData.Agi)
	npc.Mob.INT = int32(npcData.Int)
	npc.Mob.WIS = int32(npcData.Wis)
	npc.Mob.CHA = int32(npcData.Cha)
	npc.Mob.MR = int32(npcData.Mr)
	npc.Mob.FR = int32(npcData.Fr)
	npc.Mob.CR = int32(npcData.Cr)
	npc.Mob.DR = int32(npcData.Dr)
	npc.Mob.PR = int32(npcData.Pr)

	return npc
}
