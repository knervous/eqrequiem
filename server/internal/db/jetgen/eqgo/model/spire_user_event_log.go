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

type SpireUserEventLog struct {
	ID                         uint64 `sql:"primary_key"`
	UserID                     *uint64
	ServerDatabaseConnectionID *uint64
	EventName                  *string
	Data                       *string
	CreatedAt                  *time.Time
}
