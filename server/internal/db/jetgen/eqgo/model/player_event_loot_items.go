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

type PlayerEventLootItems struct {
	ID         uint64 `sql:"primary_key"`
	ItemID     *uint32
	ItemName   *string
	Charges    *int32
	Augment1ID *uint32
	Augment2ID *uint32
	Augment3ID *uint32
	Augment4ID *uint32
	Augment5ID *uint32
	Augment6ID *uint32
	NpcID      *uint32
	CorpseName *string
	CreatedAt  *time.Time
}
