package entity

import (
	"context"
	"encoding/json"
	"log"

	"github.com/knervous/eqgo/internal/constants"

	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/ports/client"
)

var _ client.Client = (*Client)(nil)

type Client struct {
	mob          client.Mob
	items        map[int32]*constants.ItemWithInstance
	charData     *model.CharacterData
	ConnectionID string
}

func (c *Client) Items() map[int32]*constants.ItemWithInstance {
	return c.items
}

func NewClient(charData *model.CharacterData) (client.Client, error) {
	client := &Client{
		charData: charData,
		items:    make(map[int32]*constants.ItemWithInstance),
	}
	client.mob.CurrentHp = int(charData.CurHp)
	client.mob.DataSource = client

	// In values for ctor
	client.mob.CurrentHp = int(charData.CurHp)
	client.mob.CurrentMana = int(charData.Mana)

	// Inventory
	charItems, err := db_character.GetCharacterItems(context.Background(), int(charData.ID))
	if err != nil {
		log.Printf("failed to get character items for character %d: %v", charData.ID, err)
		return nil, err

	}
	for _, item := range charItems {
		itemTemplate, err := items.GetItemTemplateByID(item.ItemID)
		if err != nil {
			log.Printf("failed to get item template for itemID %d: %v", item.ItemID, err)
			continue
		}
		itemInstance := items.CreateItemInstanceFromTemplateID(item.ItemID)
		itemInstance.Quantity = item.Quantity
		itemInstance.Charges = item.Charges
		json.Unmarshal([]byte(*item.Mods), &itemInstance.Mods)
		itemWithTemplate := &constants.ItemWithInstance{
			Item:     itemTemplate,
			Instance: *itemInstance,
			BagSlot:  item.Bag,
		}
		client.items[int32(item.Slot)] = itemWithTemplate
	}

	client.CalcBonuses()

	return client, nil
}

func (c *Client) CharData() *model.CharacterData {
	return c.charData
}

func (c *Client) Name() string {
	if c.charData == nil {
		return ""
	}
	return c.charData.Name
}

func (c *Client) Say(msg string) {

}

func (c *Client) Type() int32 {
	return client.EntityTypePlayer
}

func (c *Client) ID() int {
	if c.charData == nil {
		return 0
	}
	return int(c.charData.ID)
}

func (c *Client) Mob() *client.Mob {
	return &c.mob
}

func (c *Client) GetMob() *client.Mob {
	return &c.mob
}

func (c *Client) Level() uint8 {
	return uint8(c.CharData().Level)
}

func (c *Client) Class() uint8 {
	return uint8(c.CharData().Class)
}

func (c *Client) Position() client.MobPosition {
	return client.MobPosition{
		X:       c.charData.X,
		Y:       c.charData.Y,
		Z:       c.charData.Z,
		Heading: c.charData.Heading,
	}
}

func (c *Client) SetPosition(pos client.MobPosition) {
	c.charData.X = pos.X
	c.charData.Y = pos.Y
	c.charData.Z = pos.Z
	c.charData.Heading = pos.Heading
}

func (c *Client) SetVelocity(vel client.Velocity) {
	c.mob.SetVelocity(vel)
}
