package client

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/knervous/eqgo/internal/constants"
	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	entity "github.com/knervous/eqgo/internal/zone/interface"
)

var _ entity.Client = (*Client)(nil)

type Client struct {
	mob            entity.Mob
	items          map[constants.InventoryKey]*constants.ItemWithInstance
	itemsMu        sync.RWMutex
	packetHandlers *HandlerRegistry
	charData       *model.CharacterData
	ConnectionID   string
}

func (c *Client) Items() map[constants.InventoryKey]*constants.ItemWithInstance {
	return c.items
}

func (c *Client) WithItems(caller func(map[constants.InventoryKey]*constants.ItemWithInstance)) {
	c.itemsMu.RLock()
	defer c.itemsMu.RUnlock()
	caller(c.items)
}

func NewClient(charData *model.CharacterData) (entity.Client, error) {
	client := &Client{
		charData: charData,
		items:    make(map[constants.InventoryKey]*constants.ItemWithInstance),
		itemsMu:  sync.RWMutex{},
	}
	client.packetHandlers = client.NewClientRegistry()
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
		itemInstance.ItemID = item.ItemID
		itemInstance.ID = item.ItemInstanceID
		json.Unmarshal([]byte(*item.Mods), &itemInstance.Mods)
		itemWithTemplate := &constants.ItemWithInstance{
			Item:           itemTemplate,
			Instance:       *itemInstance,
			BagSlot:        item.Bag,
			ItemInstanceID: item.ItemInstanceID,
		}
		key := constants.InventoryKey{
			Bag:  item.Bag,
			Slot: item.Slot,
		}
		client.items[key] = itemWithTemplate
	}

	client.CalcBonuses()

	return client, nil
}

func (c *Client) CanEquipItem(item *constants.ItemWithInstance) bool {
	if item == nil {
		return false
	}
	if item.Item.Slots == 0 {
		return false
	}
	if item.Instance.OwnerType != constants.OwnerTypeCharacter {
		return false
	}

	return item.IsEquippable(constants.RaceID(c.Race()), c.Class())
}

func (c *Client) Race() uint8 {
	return uint8(c.charData.Race)
}

func (c *Client) UpdateStats() {
	c.CalcBonuses()
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
	return entity.EntityTypePlayer
}

func (c *Client) ID() int {
	if c.charData == nil {
		return 0
	}
	return int(c.charData.ID)
}

func (c *Client) Mob() *entity.Mob {
	return &c.mob
}

func (c *Client) GetMob() *entity.Mob {
	return &c.mob
}

func (c *Client) Level() uint8 {
	return uint8(c.CharData().Level)
}

func (c *Client) Class() uint8 {
	return uint8(c.CharData().Class)
}

func (c *Client) Position() entity.MobPosition {
	return entity.MobPosition{
		X:       c.charData.X,
		Y:       c.charData.Y,
		Z:       c.charData.Z,
		Heading: c.charData.Heading,
	}
}

func (c *Client) SetPosition(pos entity.MobPosition) {
	c.charData.X = pos.X
	c.charData.Y = pos.Y
	c.charData.Z = pos.Z
	c.charData.Heading = pos.Heading
}

func (c *Client) SetVelocity(vel entity.Velocity) {
	c.mob.SetVelocity(vel)
}
