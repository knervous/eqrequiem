//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type CharacterLeadershipAbilities struct {
	ID   uint32 `sql:"primary_key"`
	Slot uint16 `sql:"primary_key"`
	Rank uint16
}
