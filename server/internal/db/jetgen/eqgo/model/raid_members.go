//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type RaidMembers struct {
	ID            uint64 `sql:"primary_key"`
	Raidid        int32
	Charid        int32
	BotID         int32
	Groupid       uint32
	Class         int8
	Level         int8
	Name          string
	Isgroupleader bool
	Israidleader  bool
	Islooter      bool
	IsMarker      uint8
	IsAssister    uint8
	Note          string
}
