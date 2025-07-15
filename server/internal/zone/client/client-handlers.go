package client

import (
	"context"
	"log"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/constants"
	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/session"
	entity "github.com/knervous/eqgo/internal/zone/interface"
)

func (c *Client) HandleMoveItem(z entity.ZoneAccess, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootMoveItem)
	if err != nil {
		log.Printf("failed to read MoveItem request: %v", err)
		return
	}

	fromSlot := req.FromSlot()
	toSlot := req.ToSlot()
	fromKey := constants.InventoryKey{
		Bag:  int8(req.FromBagSlot()),
		Slot: fromSlot,
	}
	toKey := constants.InventoryKey{
		Bag:  int8(req.ToBagSlot()),
		Slot: toSlot,
	}

	fromItem := ses.Client.Items()[fromKey]
	toItem := ses.Client.Items()[toKey]

	if !fromItem.AllowedInSlot(toSlot) {
		log.Printf("from item not allowed in to slot %d", toSlot)
		return
	}
	if !toItem.AllowedInSlot(fromSlot) {
		log.Printf("to item not allowed in slot %d", fromSlot)
		return
	}
	if constants.IsEquipSlot(toSlot) && fromItem != nil && !c.CanEquipItem(fromItem) {
		log.Printf("client %d cannot equip item %d in slot %d", c.ID(), fromItem.Instance.ItemID, toSlot)
		return
	}
	if constants.IsEquipSlot(fromSlot) && toItem != nil && !c.CanEquipItem(toItem) {
		log.Printf("client %d cannot equip item %d in slot %d", c.ID(), toItem.Instance.ItemID, fromSlot)
		return
	}

	err = items.SwapItemSlots(int32(c.CharData().ID), fromSlot, toSlot, int8(req.ToBagSlot()), int8(req.FromBagSlot()))
	if err != nil {
		// Send some kind of notification if it's illegal, i.e. bypassing client logic probably
		log.Printf("failed to swap item slots: %v", err)
		return
	}
	charItems := c.Items()
	tempFrom := charItems[fromKey]
	tempTo := charItems[toKey]
	charItems[fromKey] = tempTo
	charItems[toKey] = tempFrom

	if constants.IsVisibleSlot(fromSlot) && charItems[fromKey] != nil {
		z.BroadcastWearChange(c.ID(), fromSlot, charItems[fromKey])
	}

	if constants.IsVisibleSlot(toSlot) && charItems[toKey] != nil {
		z.BroadcastWearChange(c.ID(), toSlot, charItems[toKey])
	}

	moveItemPacket, err := session.NewMessage(ses, eq.NewRootMoveItem)
	if err != nil {
		log.Printf("failed to create ClientSpawn message: %v", err)
		return
	}
	moveItemPacket.SetFromSlot(fromSlot)
	moveItemPacket.SetToSlot(toSlot)
	moveItemPacket.SetNumberInStack(1)
	moveItemPacket.SetFromBagSlot(req.FromBagSlot())
	moveItemPacket.SetToBagSlot(req.ToBagSlot())
	ses.SendStream(moveItemPacket.Message(), opcodes.MoveItem)
}

func (c *Client) HandleDeleteItem(z entity.ZoneAccess, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootDeleteItem)
	if err != nil {
		log.Printf("failed to read DeleteItem request: %v", err)
		return
	}

	slot := req.FromSlot()
	if slot != constants.SlotCursor {
		log.Printf("invalid slot for DeleteItem: %d", slot)
		return
	}

	db_character.PurgeCharacterItem(context.Background(), int32(c.CharData().ID), slot)

	delete(c.items, constants.InventoryKey{
		Bag:  0,
		Slot: slot,
	})
	ses.SendStream(req.Message(), opcodes.DeleteItem)
}
