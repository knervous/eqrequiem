//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

import (
	"time"
)

type CharacterParcels struct {
	ID       uint32 `sql:"primary_key"`
	CharID   uint32
	ItemID   uint32
	AugSlot1 uint32
	AugSlot2 uint32
	AugSlot3 uint32
	AugSlot4 uint32
	AugSlot5 uint32
	AugSlot6 uint32
	SlotID   uint32
	Quantity uint32
	FromName *string
	Note     *string
	SentDate *time.Time
}
