//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type AdventureTemplate struct {
	ID              uint32 `sql:"primary_key"`
	Zone            string
	ZoneVersion     uint8
	IsHard          uint8
	IsRaid          uint8
	MinLevel        uint8
	MaxLevel        uint8
	Type            uint8
	TypeData        uint32
	TypeCount       uint16
	AssaX           float64
	AssaY           float64
	AssaZ           float64
	AssaH           float64
	Text            *string
	Duration        uint32
	ZoneInTime      uint32
	WinPoints       uint16
	LosePoints      uint16
	Theme           uint8
	ZoneInZoneID    uint16
	ZoneInX         float64
	ZoneInY         float64
	ZoneInObjectID  int16
	DestX           float64
	DestY           float64
	DestZ           float64
	DestH           float64
	GraveyardZoneID uint32
	GraveyardX      float64
	GraveyardY      float64
	GraveyardZ      float64
	GraveyardRadius float64
}
