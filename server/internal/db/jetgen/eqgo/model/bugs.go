//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

import (
	"time"
)

type Bugs struct {
	ID     uint32 `sql:"primary_key"`
	Zone   string
	Name   string
	UI     string
	X      float64
	Y      float64
	Z      float64
	Type   string
	Flag   uint8
	Target *string
	Bug    string
	Date   time.Time
	Status uint8
}
