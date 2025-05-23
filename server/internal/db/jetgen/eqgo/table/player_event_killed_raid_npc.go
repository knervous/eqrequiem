//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package table

import (
	"github.com/go-jet/jet/v2/mysql"
)

var PlayerEventKilledRaidNpc = newPlayerEventKilledRaidNpcTable("eqgo", "player_event_killed_raid_npc", "")

type playerEventKilledRaidNpcTable struct {
	mysql.Table

	// Columns
	ID                        mysql.ColumnInteger
	NpcID                     mysql.ColumnInteger
	NpcName                   mysql.ColumnString
	CombatTimeSeconds         mysql.ColumnInteger
	TotalDamagePerSecondTaken mysql.ColumnInteger
	TotalHealPerSecondTaken   mysql.ColumnInteger
	CreatedAt                 mysql.ColumnTimestamp

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type PlayerEventKilledRaidNpcTable struct {
	playerEventKilledRaidNpcTable

	NEW playerEventKilledRaidNpcTable
}

// AS creates new PlayerEventKilledRaidNpcTable with assigned alias
func (a PlayerEventKilledRaidNpcTable) AS(alias string) *PlayerEventKilledRaidNpcTable {
	return newPlayerEventKilledRaidNpcTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new PlayerEventKilledRaidNpcTable with assigned schema name
func (a PlayerEventKilledRaidNpcTable) FromSchema(schemaName string) *PlayerEventKilledRaidNpcTable {
	return newPlayerEventKilledRaidNpcTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new PlayerEventKilledRaidNpcTable with assigned table prefix
func (a PlayerEventKilledRaidNpcTable) WithPrefix(prefix string) *PlayerEventKilledRaidNpcTable {
	return newPlayerEventKilledRaidNpcTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new PlayerEventKilledRaidNpcTable with assigned table suffix
func (a PlayerEventKilledRaidNpcTable) WithSuffix(suffix string) *PlayerEventKilledRaidNpcTable {
	return newPlayerEventKilledRaidNpcTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newPlayerEventKilledRaidNpcTable(schemaName, tableName, alias string) *PlayerEventKilledRaidNpcTable {
	return &PlayerEventKilledRaidNpcTable{
		playerEventKilledRaidNpcTable: newPlayerEventKilledRaidNpcTableImpl(schemaName, tableName, alias),
		NEW:                           newPlayerEventKilledRaidNpcTableImpl("", "new", ""),
	}
}

func newPlayerEventKilledRaidNpcTableImpl(schemaName, tableName, alias string) playerEventKilledRaidNpcTable {
	var (
		IDColumn                        = mysql.IntegerColumn("id")
		NpcIDColumn                     = mysql.IntegerColumn("npc_id")
		NpcNameColumn                   = mysql.StringColumn("npc_name")
		CombatTimeSecondsColumn         = mysql.IntegerColumn("combat_time_seconds")
		TotalDamagePerSecondTakenColumn = mysql.IntegerColumn("total_damage_per_second_taken")
		TotalHealPerSecondTakenColumn   = mysql.IntegerColumn("total_heal_per_second_taken")
		CreatedAtColumn                 = mysql.TimestampColumn("created_at")
		allColumns                      = mysql.ColumnList{IDColumn, NpcIDColumn, NpcNameColumn, CombatTimeSecondsColumn, TotalDamagePerSecondTakenColumn, TotalHealPerSecondTakenColumn, CreatedAtColumn}
		mutableColumns                  = mysql.ColumnList{NpcIDColumn, NpcNameColumn, CombatTimeSecondsColumn, TotalDamagePerSecondTakenColumn, TotalHealPerSecondTakenColumn, CreatedAtColumn}
		defaultColumns                  = mysql.ColumnList{NpcIDColumn, CombatTimeSecondsColumn, TotalDamagePerSecondTakenColumn, TotalHealPerSecondTakenColumn}
	)

	return playerEventKilledRaidNpcTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:                        IDColumn,
		NpcID:                     NpcIDColumn,
		NpcName:                   NpcNameColumn,
		CombatTimeSeconds:         CombatTimeSecondsColumn,
		TotalDamagePerSecondTaken: TotalDamagePerSecondTakenColumn,
		TotalHealPerSecondTaken:   TotalHealPerSecondTakenColumn,
		CreatedAt:                 CreatedAtColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
