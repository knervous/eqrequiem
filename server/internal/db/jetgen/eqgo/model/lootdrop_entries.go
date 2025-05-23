//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type LootdropEntries struct {
	LootdropID           uint32 `sql:"primary_key"`
	ItemID               int32  `sql:"primary_key"`
	ItemCharges          uint16
	EquipItem            uint8
	Chance               float64
	DisabledChance       float64
	TrivialMinLevel      uint16
	TrivialMaxLevel      uint16
	Multiplier           uint8
	NpcMinLevel          uint16
	NpcMaxLevel          uint16
	MinExpansion         int8
	MaxExpansion         int8
	ContentFlags         *string
	ContentFlagsDisabled *string
}
