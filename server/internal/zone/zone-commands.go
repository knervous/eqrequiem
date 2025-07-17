package zone

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"sync"

	capnp "capnproto.org/go/capnp/v3"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/constants"
	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/db/items"

	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/session"
)

var (
	commandRegistry = map[string]func(*ZoneInstance, *session.Session, []string){
		"level":      commandLevel,
		"gearup":     commandGearup,
		"purgeitems": purgeItems,
		"searchitem": searchItem,
		"summonitem": summonItem,
	}
	commandRegistryMutex = &sync.Mutex{}
)

func AddCommandHandler(command string, handler func(*ZoneInstance, *session.Session, []string)) {
	commandRegistryMutex.Lock()
	defer commandRegistryMutex.Unlock()
	commandRegistry[command] = handler
}

func (z *ZoneInstance) HandleCommand(session *session.Session, command string, args []string) {
	commandRegistryMutex.Lock()
	defer commandRegistryMutex.Unlock()

	if handler, exists := commandRegistry[command]; exists {
		handler(z, session, args)
	}
}

func summonItem(z *ZoneInstance, ses *session.Session, args []string) {
	if len(args) < 1 {
		return
	}
	itemIDStr := args[0]
	if itemIDStr == "" {
		return
	}

	itemID, err := strconv.Atoi(itemIDStr)
	if err != nil || itemID <= 0 {
		log.Printf("invalid item ID: %s", itemIDStr)
		return
	}

	instance := items.CreateItemInstanceFromTemplateID(int32(itemID))
	if instance == nil {
		log.Printf("failed to create item instance for item ID: %d", itemID)
		return
	}
	slot, bagslot, itemInstanceId, err := items.AddItemToPlayerInventoryFreeSlot(*instance, int32(ses.Client.CharData().ID))
	if err != nil {
		log.Printf("failed to add item to inventory: %v", err)
		return
	}
	ses.Client.WithItems(func(items map[constants.InventoryKey]*constants.ItemWithInstance) {
		items[constants.InventoryKey{Bag: int8(bagslot), Slot: int8(slot)}] = &constants.ItemWithInstance{
			Item:           instance.Item,
			Instance:       *instance,
			BagSlot:        int8(bagslot),
			ItemInstanceID: itemInstanceId,
		}
	})
	Message(
		ses,
		eq.NewRootItemInstance,
		opcodes.AddItemPacket,
		func(m eq.ItemInstance) error {
			items.ConvertItemTemplateToCapnp(ses, &instance.Item, &m)
			m.SetSlot(int32(slot))
			m.SetBagSlot(int32(bagslot))
			m.SetCharges(uint32(instance.Charges))
			return nil
		},
	)
}

func searchItem(z *ZoneInstance, ses *session.Session, args []string) {
	if len(args) < 1 {
		return
	}
	itemName := args[0]
	if itemName == "" {
		return
	}

	searchItems := items.SearchItems(itemName)

	for _, item := range searchItems {
		_ = session.QueueMessage(
			ses,
			eq.NewRootChannelMessage,
			opcodes.ChannelMessage,
			func(m eq.ChannelMessage) error {
				itemInstance := items.CreateItemInstanceFromTemplateID(int32(item.ID))
				msg, seg := capnp.NewMultiSegmentMessage(nil)

				capnItem, err := eq.NewRootItemInstance(seg)
				if err != nil {
					return fmt.Errorf("NewRootItemInstance: %w", err)
				}

				items.ConvertItemTemplateToCapnp(ses, &itemInstance.Item, &capnItem)
				var buf bytes.Buffer
				if err := capnp.NewEncoder(&buf).Encode(msg); err != nil {
					return fmt.Errorf("capnp encode: %w", err)
				}
				m.SetChanNum(0)
				m.SetSender("")
				m.SetMessage_(item.Name + ": (" + z.createJsonCommandLink(CommandTypeSummon, "Summon "+strconv.Itoa(int(item.ID)), item.ID) + ")" + " - (" + z.createJsonCommandLink(CommandTypeLink, "Item Link", buf.Bytes()) + ")")
				return nil
			},
		)
	}
}

func purgeItems(z *ZoneInstance, ses *session.Session, args []string) {
	charData := ses.Client.CharData()
	err := db_character.PurgeCharacterItems(context.Background(), int32(charData.ID))
	if err != nil {
		log.Printf("failed to purge item for character %d: %v", charData.ID, err)
		return
	}

	ses.Client.UpdateStats()
	Message(
		ses,
		eq.NewRootBulkDeleteItem,
		opcodes.DeleteItems,
		func(m eq.BulkDeleteItem) error {
			ses.Client.WithItems(func(items map[constants.InventoryKey]*constants.ItemWithInstance) {
				charItems := ses.Client.Items()
				list, err := m.NewItems(int32(len(charItems)))
				if err != nil {
					log.Printf("failed to create items list for BulkDeleteItem: %v", err)
					return
				}
				itemIdx := 0
				for key := range charItems {
					item := list.At(itemIdx)
					itemIdx++
					item.SetSlot(key.Slot)
					item.SetBag(key.Bag)
					delete(charItems, key)
				}
			})
			return nil
		},
	)
}

func commandGearup(z *ZoneInstance, ses *session.Session, args []string) {
	db_character.PurgeCharacterEquipment(context.Background(), int32(ses.Client.CharData().ID))
	db_character.GearUp(ses.Client)
	// db_character.UpdateCharacterItems(context.Background(), ses.Client)
	charItems := ses.Client.Items()
	charItemsLength := int32(len(charItems))
	Message(
		ses,
		eq.NewRootBulkItemPacket,
		opcodes.ItemPacket,
		func(m eq.BulkItemPacket) error {
			itemsList, err := m.NewItems(charItemsLength)
			if err != nil {
				return err
			}
			itemIdx := 0
			for slot, charItem := range charItems {
				if charItem == nil {
					continue
				}
				mods, err := json.Marshal(charItem.Instance.Mods)
				if err != nil {
					log.Printf("failed to marshal mods for itemID %d: %v", charItem.Instance.ItemID, err)
					continue
				}

				item := itemsList.At(itemIdx)
				itemIdx++
				item.SetCharges(uint32(charItem.Instance.Charges))
				item.SetQuantity(uint32(charItem.Instance.Quantity))
				item.SetMods(string(mods))
				item.SetSlot(int32(slot.Slot))
				item.SetBagSlot(int32(slot.Bag))
				items.ConvertItemTemplateToCapnp(ses, &charItem.Item, &item)
			}
			return nil
		},
	)

}

func commandLevel(z *ZoneInstance, ses *session.Session, args []string) {
	if len(args) < 1 {
		return
	}
	level := args[0]
	if level == "" {
		return
	}
	levelInt, err := strconv.Atoi(level)
	if err != nil || levelInt < 1 || levelInt > 50 {
		return
	}

	charData := ses.Client.CharData()
	charData.Level = uint32(levelInt)
	ses.Client.UpdateStats()

	// Send level
	Datagram(
		ses,
		eq.NewRootLevelUpdate,
		opcodes.LevelUpdate,
		func(m eq.LevelUpdate) error {
			m.SetLevel(int32(levelInt))
			m.SetExp(0)
			return nil
		},
	)
}
