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

type LoginWorldServers struct {
	ID                    uint32 `sql:"primary_key"`
	LongName              string
	ShortName             string
	TagDescription        string
	LoginServerListTypeID int32
	LastLoginDate         *time.Time
	LastIPAddress         *string
	LoginServerAdminID    int32
	IsServerTrusted       int32
	Note                  *string
}
