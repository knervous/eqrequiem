//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type CharacterAuras struct {
	ID      int32 `sql:"primary_key"`
	Slot    int8  `sql:"primary_key"`
	SpellID int32
}
