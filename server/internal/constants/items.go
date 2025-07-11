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

func IsVisibleSlot(slot int32) bool {
	return visibleSlotsMap[slot]
}

type ItemWithSlot struct {
	model.ItemInstances
	model.CharacterInventory
}

type ItemWithInstance struct {
	Item     model.Items
	Instance model.ItemInstances
}
