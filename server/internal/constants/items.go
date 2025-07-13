package constants

import "github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"

const (
	SlotCharm int32 = iota
	SlotEar1
	SlotHead
	SlotFace
	SlotEar2
	SlotNeck
	SlotShoulders
	SlotArms
	SlotBack
	SlotWrist1
	SlotWrist2
	SlotRange
	SlotHands
	SlotPrimary
	SlotSecondary
	SlotFinger1
	SlotFinger2
	SlotChest
	SlotLegs
	SlotFeet
	SlotWaist
	SlotAmmo
	SlotGeneral1
	SlotGeneral2
	SlotGeneral3
	SlotGeneral4
	SlotGeneral5
	SlotGeneral6
	SlotGeneral7
	SlotGeneral8
	SlotCursor
)

func IsEquipSlot(slot int32) bool {
	return slot >= SlotCharm && slot <= SlotAmmo
}

var EquipmentSlots = []int32{
	SlotCharm,
	SlotEar1,
	SlotHead,
	SlotFace,
	SlotEar2,
	SlotNeck,
	SlotShoulders,
	SlotArms,
	SlotBack,
	SlotWrist1,
	SlotWrist2,
	SlotRange,
	SlotHands,
	SlotPrimary,
	SlotSecondary,
	SlotFinger1,
	SlotFinger2,
	SlotChest,
	SlotLegs,
	SlotFeet,
	SlotWaist,
	SlotAmmo,
}

var visibleSlotsMap = map[int32]bool{
	SlotHead:      true,
	SlotHands:     true,
	SlotFeet:      true,
	SlotChest:     true,
	SlotArms:      true,
	SlotLegs:      true,
	SlotWrist1:    true,
	SlotWrist2:    true,
	SlotPrimary:   true,
	SlotSecondary: true,
}

// OwnerType represents the type of owner for an item instance
type OwnerType uint8

// Constants for owner types
const (
	OwnerTypeCharacter OwnerType = 0
	OwnerTypeMerchant  OwnerType = 1
	OwnerTypeGuild     OwnerType = 2
)

// Mods represents the JSON structure of the mods field
type Mods struct {
	Enchantment string `json:"enchantment"`
	Durability  int    `json:"durability"`
	// Add other fields as needed
}

// ItemInstance represents a domain model for item_instances
type ItemInstance struct {
	ID        int32
	ItemID    int32
	Mods      Mods // Rich type for JSON
	Charges   uint8
	Quantity  uint8
	OwnerID   *uint32
	OwnerType OwnerType
	Item      model.Items
}

func IsVisibleSlot(slot int32) bool {
	return visibleSlotsMap[slot]
}

func (item *ItemWithInstance) AllowedInSlot(slot int32) bool {
	if item == nil {
		return true
	}
	if slot == SlotCursor {
		return true
	}
	if !IsEquipSlot(slot) {
		return true
	}
	if item.Item.Slots&(1<<slot) == 0 {
		return false
	}
	if item.Item.Slots&(1<<SlotAmmo) != 0 && slot == SlotAmmo {
		return true
	}
	return true
}

type ItemWithSlot struct {
	model.ItemInstances
	model.CharacterInventory
}

type ItemWithInstance struct {
	Item     model.Items
	Instance ItemInstance
	BagSlot  int8
}
