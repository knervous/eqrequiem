//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type Lfguild struct {
	Type       uint8  `sql:"primary_key"`
	Name       string `sql:"primary_key"`
	Comment    string
	Fromlevel  uint8
	Tolevel    uint8
	Classes    uint32
	Aacount    uint32
	Timezone   uint32
	Timeposted uint32
}
