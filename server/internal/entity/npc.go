package entity

import (
	"time"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	"github.com/knervous/eqgo/internal/ports/client"
)

type NPC struct {
	npcData         *model.NpcTypes // NPC data from the database
	mob             client.Mob
	aggressionLevel int
	gridEntries     []db_zone.GridEntries // the full path
	gridIndex       int                   // which entry we’re on
	nextGridMove    time.Time             // when to move to the next entry
	pauseUntil      time.Time             // if now < PauseUntil, we’re paused
	lastUpdate      time.Time             // last time we moved/interpolated
}

func (n *NPC) Type() int32 { return client.EntityTypeNPC }

func (n *NPC) SetPosition(pos client.MobPosition) {
	n.mob.X = pos.X
	n.mob.Y = pos.Y
	n.mob.Z = pos.Z
	n.mob.Heading = pos.Heading
	n.mob.Dirty = true
}

func (n *NPC) Position() client.MobPosition {
	return client.MobPosition{X: n.mob.X, Y: n.mob.Y, Z: n.mob.Z, Heading: n.mob.Heading}
}

func (c *NPC) Mob() *client.Mob {
	return &c.mob
}

func (c *NPC) GetMob() *client.Mob {
	return &c.mob
}

func (c *NPC) Level() uint8 {
	return uint8(c.Mob().DataSource.Level())
}

func (c *NPC) Class() uint8 {
	return uint8(c.Mob().DataSource.Class())
}

func (n *NPC) CalcBonuses() {

}

func (n *NPC) AggressionLevel() int {
	return n.aggressionLevel
}
func (n *NPC) SetAggressionLevel(level int) {
	n.aggressionLevel = level
}
func (n *NPC) GridEntries() []db_zone.GridEntries {
	return n.gridEntries
}
func (n *NPC) SetGridEntries(entries []db_zone.GridEntries) {
	n.gridEntries = entries
}
func (n *NPC) GridIndex() int {
	return n.gridIndex
}
func (n *NPC) SetGridIndex(index int) {
	n.gridIndex = index
}
func (n *NPC) CurrentGridEntry() db_zone.GridEntries {
	if n.gridIndex < 0 || n.gridIndex >= len(n.gridEntries) {
		return db_zone.GridEntries{} // Return an empty entry if index is out of bounds
	}
	return n.gridEntries[n.gridIndex]
}
func (n *NPC) NextGridMove() time.Time {
	return n.nextGridMove
}
func (n *NPC) SetNextGridMove(next time.Time) {
	n.nextGridMove = next
}
func (n *NPC) PauseUntil() time.Time {
	return n.pauseUntil
}
func (n *NPC) SetPauseUntil(pause time.Time) {
	n.pauseUntil = pause
}
func (n *NPC) LastUpdate() time.Time {
	return n.lastUpdate
}
func (n *NPC) SetLastUpdate(last time.Time) {
	n.lastUpdate = last
}
func (n *NPC) Say(msg string) {
	// NPCs typically don't have a say method, but if they do, implement it here.
	// This could be used for debugging or logging purposes.
}
func (n *NPC) ID() int {
	return n.mob.ID()
}
func (n *NPC) Name() string {
	return n.Mob().Name()
}
func (n *NPC) GetNpc() *NPC {
	return n
}

func (n *NPC) Speed() float32 {
	return n.mob.Speed
}

func (n *NPC) SetVelocity(vel client.Velocity) {
	n.mob.SetVelocity(vel)
}
func (n *NPC) Velocity() client.Velocity {
	return n.mob.GetVelocity()
}

func (n *NPC) NpcData() *model.NpcTypes {
	return n.npcData
}

func NewNPC(mob client.Mob, npcData *model.NpcTypes, gridEntries []db_zone.GridEntries, gridIndex int, nextGridMove time.Time, pauseUntil time.Time, lastUpdate time.Time) *NPC {
	npc := &NPC{
		npcData:         npcData,
		mob:             mob,
		gridEntries:     gridEntries,
		gridIndex:       gridIndex,
		nextGridMove:    nextGridMove,
		pauseUntil:      pauseUntil,
		lastUpdate:      lastUpdate,
		aggressionLevel: 0,
	}
	npc.mob.DataSource = npc

	// In values for ctor
	npc.mob.CurrentHp = int(npcData.Hp)
	npc.mob.MaxHp = int(npcData.Hp)
	npc.mob.BaseHp = int(npcData.Hp)
	npc.mob.HpRegen = int(npcData.HpRegenRate)
	npc.mob.CurrentMana = int(npcData.Mana)
	npc.mob.MaxMana = int(npcData.Mana)
	npc.mob.ManaRegen = int(npcData.ManaRegenRate)
	npc.mob.Size = float32(npcData.Size)
	npc.mob.Speed = float32(npcData.Runspeed)
	npc.mob.AC = int(npcData.Ac)
	npc.mob.ATK = int32(npcData.Atk)
	npc.mob.STR = int32(npcData.Str)
	npc.mob.STA = int32(npcData.Sta)
	npc.mob.DEX = int32(npcData.Dex)
	npc.mob.AGI = int32(npcData.Agi)
	npc.mob.INT = int32(npcData.Int)
	npc.mob.WIS = int32(npcData.Wis)
	npc.mob.CHA = int32(npcData.Cha)
	npc.mob.MR = int32(npcData.Mr)
	npc.mob.FR = int32(npcData.Fr)
	npc.mob.CR = int32(npcData.Cr)
	npc.mob.DR = int32(npcData.Dr)
	npc.mob.PR = int32(npcData.Pr)

	return npc
}
