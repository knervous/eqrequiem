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

	fromSlot := int8(req.FromSlot())
	toSlot := int8(req.ToSlot())
	fromBag := int8(req.FromBagSlot())
	toBag := int8(req.ToBagSlot())
	fromKey := constants.InventoryKey{
		Bag:  int8(fromBag),
		Slot: fromSlot,
	}
	toKey := constants.InventoryKey{
		Bag:  int8(toBag),
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

	// 3) do the DB swap
	updates, err := items.SwapItemSlots(
		int32(c.CharData().ID),
		fromSlot, toSlot,
		toBag, fromBag,
		fromItem, toItem,
	)
	if err != nil {
		log.Printf("failed to swap item slots: %v", err)
		return
	}

	// 4) mutate our in‐memory map: for each moved row, delete old key and set new key
	charItems := c.Items()
	for _, u := range updates {
		oldKey := constants.InventoryKey{Bag: u.FromBag, Slot: u.FromSlot}
		newKey := constants.InventoryKey{Bag: u.ToBag, Slot: u.ToSlot}

		existingItem := charItems[oldKey]
		newItem := charItems[newKey]
		if existingItem != nil {
			// move it in the map
			charItems[newKey] = existingItem
			if newItem == nil {
				delete(charItems, oldKey)
			}
		}
		if newItem != nil {
			charItems[oldKey] = newItem
			if existingItem == nil {
				delete(charItems, newKey)

			}
		}
	}

	// 5) broadcast wear changes for any equip slots that changed
	for _, u := range updates {
		newKey := constants.InventoryKey{Bag: u.ToBag, Slot: u.ToSlot}
		itm := charItems[newKey]

		// if it landed in a visible/equip slot, broadcast it
		if itm != nil && constants.IsVisibleSlot(u.ToSlot) {
			z.BroadcastWearChange(c.ID(), u.ToSlot, itm)
		}
		// likewise, if you want to clear old equip positions:
		if constants.IsVisibleSlot(u.FromSlot) {
			z.BroadcastWearChange(c.ID(), u.FromSlot, nil)
		}
	}

	// 6) notify the game client of each individual move
	for _, u := range updates {
		pkt, err := session.NewMessage(ses, eq.NewRootMoveItem)
		if err != nil {
			log.Printf("failed to create MoveItem message: %v", err)
			continue
		}
		pkt.SetFromSlot(u.FromSlot)
		pkt.SetToSlot(u.ToSlot)
		pkt.SetFromBagSlot((u.FromBag))
		pkt.SetToBagSlot((u.ToBag))
		pkt.SetNumberInStack(1) // or your actual stack count

		ses.SendStream(pkt.Message(), opcodes.MoveItem)
	}

}

func (c *Client) HandleDeleteItem(z entity.ZoneAccess, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootDeleteItem)
	if err != nil {
		log.Printf("failed to read DeleteItem request: %v", err)
		return
	}

	slot := req.Slot()
	if slot != int8(constants.SlotCursor) {
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
