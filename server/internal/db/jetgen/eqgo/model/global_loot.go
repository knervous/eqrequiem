//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type GlobalLoot struct {
	ID                   int32 `sql:"primary_key"`
	Description          *string
	LoottableID          int32
	Enabled              int8
	MinLevel             int32
	MaxLevel             int32
	Rare                 *int8
	Raid                 *int8
	Race                 *string
	Class                *string
	Bodytype             *string
	Zone                 *string
	HotZone              *int8
	MinExpansion         int8
	MaxExpansion         int8
	ContentFlags         *string
	ContentFlagsDisabled *string
}
