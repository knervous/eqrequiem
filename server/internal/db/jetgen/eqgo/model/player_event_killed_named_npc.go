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

type PlayerEventKilledNamedNpc struct {
	ID                        uint64 `sql:"primary_key"`
	NpcID                     *uint32
	NpcName                   *string
	CombatTimeSeconds         *uint32
	TotalDamagePerSecondTaken *uint64
	TotalHealPerSecondTaken   *uint64
	CreatedAt                 *time.Time
}
