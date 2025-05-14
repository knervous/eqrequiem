package entity

import "github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"

type Client struct {
	Mob
	CharData     *model.CharacterData
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
