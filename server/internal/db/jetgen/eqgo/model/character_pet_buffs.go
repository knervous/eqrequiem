//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type CharacterPetBuffs struct {
	CharID        int32 `sql:"primary_key"`
	Pet           int32 `sql:"primary_key"`
	Slot          int32 `sql:"primary_key"`
	SpellID       int32
	CasterLevel   int8
	Castername    string
	Ticsremaining int32
	Counters      int32
	Numhits       int32
	Rune          int32
	InstrumentMod uint8
}
