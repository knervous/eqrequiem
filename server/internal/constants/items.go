package constants

import (
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

// OwnerType represents the type of owner for an item instance
type OwnerType uint8

// Constants for owner types
const (
	OwnerTypeCharacter OwnerType = 0
	OwnerTypeMerchant  OwnerType = 1
	OwnerTypeGuild     OwnerType = 2
)

const (
	ItemClassCommon uint8 = iota
	ItemClassBag
	ItemClassBook
)

type InventoryKey struct {
	Bag  int8
	Slot int8
}

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

type ItemWithSlot struct {
	model.ItemInstances
	model.CharacterInventory
}

type ItemWithInstance struct {
	Item     model.Items
	Instance ItemInstance
	BagSlot  int8
}

const (
	SlotCharm int8 = iota
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

const (
	ItemTypeShield uint8 = iota + 10 // placeholder start
	ItemType1HBlunt
	ItemType1HSlash
	ItemType1HPiercing
	ItemType2HBlunt
	ItemType2HSlash
	ItemType2HPiercing
	ItemTypeMartial
)

func IsEquipSlot(slot int8) bool {
	return slot >= SlotCharm && slot <= SlotAmmo
}

func IsGeneralSlot(slot int8) bool {
	return slot >= SlotGeneral1 && slot <= SlotGeneral8
}

var EquipmentSlots = []int8{
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

var visibleSlotsMap = map[int8]bool{
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

func IsVisibleSlot(slot int8) bool {
	return visibleSlotsMap[slot]
}

func (item *ItemWithInstance) IsContainer() bool {
	if item == nil {
		return false
	}
	return item.Item.Bagslots > 0
}

func (item *ItemWithInstance) AllowedInSlot(slot int8) bool {
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

func (item *ItemWithInstance) IsClassEquippable(classId uint8) bool {
	return (uint16(item.Item.Classes) & GetPlayerClassBit(GetPlayerClassValue(classId))) != 0
}

func (item *ItemWithInstance) IsRaceEquippable(raceId RaceID) bool {
	return (uint32(item.Item.Races) & GetPlayerRaceBit(raceId)) != 0
}

func (item *ItemWithInstance) IsEquippable(raceId RaceID, classId uint8) bool {
	return item.IsRaceEquippable(raceId) && item.IsClassEquippable(classId)
}
func (item *ItemWithInstance) IsClassCommon() bool {
	return uint8(item.Item.Classes) == ItemClassCommon
}

func (item *ItemWithInstance) IsClassBag() bool {
	return uint8(item.Item.Classes) == ItemClassBag
}
func (item *ItemWithInstance) IsClassBook() bool {
	return uint8(item.Item.Classes) == ItemClassBook
}

func (item *ItemWithInstance) IsType1HWeapon() bool {
	return uint8(item.Item.Itemtype) >= ItemType1HBlunt && uint8(item.Item.Itemtype) <= ItemType1HPiercing
}
func (item *ItemWithInstance) IsType2HWeapon() bool {
	return uint8(item.Item.Itemtype) >= ItemType2HBlunt && uint8(item.Item.Itemtype) <= ItemType2HPiercing
}
func (item *ItemWithInstance) IsTypeMartial() bool {
	return uint8(item.Item.Itemtype) == ItemTypeMartial
}
func (item *ItemWithInstance) IsTypeShield() bool {
	return uint8(item.Item.Itemtype) == ItemTypeShield
}
func (item *ItemWithInstance) IsType1H() bool {
	return item.IsType1HWeapon() || item.IsTypeShield()
}
func (item *ItemWithInstance) IsType2H() bool {
	return item.IsType2HWeapon() || item.IsTypeMartial()
}
func (item *ItemWithInstance) IsTypeWeapon() bool {
	return item.IsType1HWeapon() || item.IsType2HWeapon() || item.IsTypeMartial() || item.IsTypeShield()
}
func (item *ItemWithInstance) CheckLoreConflict(other *ItemWithInstance) bool {
	if item == nil || other == nil {
		return false
	}
	if item.Item.Loregroup != 0 && item.Item.Loregroup == other.Item.Loregroup {
		return true
	}
	if item.Item.Name == other.Item.Name && item.Item.ID != other.Item.ID {
		return true
	}
	return false
}
func (item *ItemWithInstance) IsLore() bool {
	if item == nil {
		return false
	}
	return item.Item.Loregroup != 0 || item.Item.Name == "Lore Item"
}
