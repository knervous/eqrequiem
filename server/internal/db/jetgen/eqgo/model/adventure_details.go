//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type AdventureDetails struct {
	ID               uint32 `sql:"primary_key"`
	AdventureID      uint16
	InstanceID       int32
	Count            uint16
	AssassinateCount uint16
	Status           uint8
	TimeCreated      uint32
	TimeZoned        uint32
	TimeCompleted    uint32
}
