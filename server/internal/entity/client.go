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

func (c *Client) GetPosition() MobPosition {
	return MobPosition{
		X:       float32(c.CharData.X),
		Y:       float32(c.CharData.Y),
		Z:       float32(c.CharData.Z),
		Heading: float32(c.CharData.Heading),
	}
}

func (c *Client) SetPosition(pos MobPosition) {
	c.CharData.X = float64(pos.X)
	c.CharData.Y = float64(pos.Y)
	c.CharData.Z = float64(pos.Z)
	c.CharData.Heading = float64(pos.Heading)
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
