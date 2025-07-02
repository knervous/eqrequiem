package entity

import (
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

type Client struct {
	Mob
	CharData     *model.CharacterData
	CharStats    *model.CharacterStatsRecord
	ConnectionID string
}

func NewClient(charData *model.CharacterData, charStats *model.CharacterStatsRecord) *Client {
	client := &Client{
		CharData:  charData,
		CharStats: charStats,
	}
	client.Mob.CurrentHp = int(charData.CurHp)
	client.Mob.DataSource = client

	// In values for ctor
	client.Mob.CurrentHp = int(charData.CurHp)
	client.Mob.CurrentMana = int(charData.Mana)

	client.UpdateStats()

	return client
}

func (c *Client) Level() uint8 {
	return uint8(c.CharData.Level)
}

func (c *Client) Class() uint8 {
	return uint8(c.CharData.Class)
}

func (c *Client) Position() MobPosition {
	return MobPosition{
		X:       c.CharData.X,
		Y:       c.CharData.Y,
		Z:       c.CharData.Z,
		Heading: c.CharData.Heading,
	}
}

func (c *Client) SetPosition(pos MobPosition) {
	c.CharData.X = pos.X
	c.CharData.Y = pos.Y
	c.CharData.Z = pos.Z
	c.CharData.Heading = pos.Heading
}

func (n *Client) Type() int32 { return EntityTypePlayer }

func (client *Client) UpdateStats() {
	client.CalcBonuses()
	charStats := client.CharStats
	*charStats.Status = 0
	*charStats.Name = client.CharData.Name
	*charStats.AaPoints = int32(client.CharData.AaPoints) - int32(client.CharData.AaPointsSpent)
	*charStats.Level = int32(client.CharData.Level)
	*charStats.Class = int32(client.CharData.Class)
	*charStats.Race = int32(client.CharData.Race)
}
