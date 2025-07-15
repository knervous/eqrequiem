package zone

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"sync"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/db/items"

	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/session"
)

var (
	commandRegistry = map[string]func(*ZoneInstance, *session.Session, []string){
		"level":  commandLevel,
		"gearup": commandGearup,
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

func commandGearup(z *ZoneInstance, ses *session.Session, args []string) {
	db_character.PurgeCharacterEquipment(context.Background(), int32(ses.Client.CharData().ID))
	db_character.GearUp(ses.Client)
	db_character.UpdateCharacterItems(context.Background(), ses.Client)
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
				item.SetSlot(slot.Slot)
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
