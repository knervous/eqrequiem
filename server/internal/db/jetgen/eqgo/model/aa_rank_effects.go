//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type AaRankEffects struct {
	RankID   uint32 `sql:"primary_key"`
	Slot     uint32 `sql:"primary_key"`
	EffectID int32
	Base1    int32
	Base2    int32
}
