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

var PlayerEventNpcHandinEntries = newPlayerEventNpcHandinEntriesTable("eqgo", "player_event_npc_handin_entries", "")

type playerEventNpcHandinEntriesTable struct {
	mysql.Table

	// Columns
	ID                     mysql.ColumnInteger
	PlayerEventNpcHandinID mysql.ColumnInteger
	Type                   mysql.ColumnInteger
	ItemID                 mysql.ColumnInteger
	Charges                mysql.ColumnInteger
	EvolveLevel            mysql.ColumnInteger
	EvolveAmount           mysql.ColumnInteger
	Augment1ID             mysql.ColumnInteger
	Augment2ID             mysql.ColumnInteger
	Augment3ID             mysql.ColumnInteger
	Augment4ID             mysql.ColumnInteger
	Augment5ID             mysql.ColumnInteger
	Augment6ID             mysql.ColumnInteger
	CreatedAt              mysql.ColumnTimestamp

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type PlayerEventNpcHandinEntriesTable struct {
	playerEventNpcHandinEntriesTable

	NEW playerEventNpcHandinEntriesTable
}

// AS creates new PlayerEventNpcHandinEntriesTable with assigned alias
func (a PlayerEventNpcHandinEntriesTable) AS(alias string) *PlayerEventNpcHandinEntriesTable {
	return newPlayerEventNpcHandinEntriesTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new PlayerEventNpcHandinEntriesTable with assigned schema name
func (a PlayerEventNpcHandinEntriesTable) FromSchema(schemaName string) *PlayerEventNpcHandinEntriesTable {
	return newPlayerEventNpcHandinEntriesTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new PlayerEventNpcHandinEntriesTable with assigned table prefix
func (a PlayerEventNpcHandinEntriesTable) WithPrefix(prefix string) *PlayerEventNpcHandinEntriesTable {
	return newPlayerEventNpcHandinEntriesTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new PlayerEventNpcHandinEntriesTable with assigned table suffix
func (a PlayerEventNpcHandinEntriesTable) WithSuffix(suffix string) *PlayerEventNpcHandinEntriesTable {
	return newPlayerEventNpcHandinEntriesTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newPlayerEventNpcHandinEntriesTable(schemaName, tableName, alias string) *PlayerEventNpcHandinEntriesTable {
	return &PlayerEventNpcHandinEntriesTable{
		playerEventNpcHandinEntriesTable: newPlayerEventNpcHandinEntriesTableImpl(schemaName, tableName, alias),
		NEW:                              newPlayerEventNpcHandinEntriesTableImpl("", "new", ""),
	}
}

func newPlayerEventNpcHandinEntriesTableImpl(schemaName, tableName, alias string) playerEventNpcHandinEntriesTable {
	var (
		IDColumn                     = mysql.IntegerColumn("id")
		PlayerEventNpcHandinIDColumn = mysql.IntegerColumn("player_event_npc_handin_id")
		TypeColumn                   = mysql.IntegerColumn("type")
		ItemIDColumn                 = mysql.IntegerColumn("item_id")
		ChargesColumn                = mysql.IntegerColumn("charges")
		EvolveLevelColumn            = mysql.IntegerColumn("evolve_level")
		EvolveAmountColumn           = mysql.IntegerColumn("evolve_amount")
		Augment1IDColumn             = mysql.IntegerColumn("augment_1_id")
		Augment2IDColumn             = mysql.IntegerColumn("augment_2_id")
		Augment3IDColumn             = mysql.IntegerColumn("augment_3_id")
		Augment4IDColumn             = mysql.IntegerColumn("augment_4_id")
		Augment5IDColumn             = mysql.IntegerColumn("augment_5_id")
		Augment6IDColumn             = mysql.IntegerColumn("augment_6_id")
		CreatedAtColumn              = mysql.TimestampColumn("created_at")
		allColumns                   = mysql.ColumnList{IDColumn, PlayerEventNpcHandinIDColumn, TypeColumn, ItemIDColumn, ChargesColumn, EvolveLevelColumn, EvolveAmountColumn, Augment1IDColumn, Augment2IDColumn, Augment3IDColumn, Augment4IDColumn, Augment5IDColumn, Augment6IDColumn, CreatedAtColumn}
		mutableColumns               = mysql.ColumnList{PlayerEventNpcHandinIDColumn, TypeColumn, ItemIDColumn, ChargesColumn, EvolveLevelColumn, EvolveAmountColumn, Augment1IDColumn, Augment2IDColumn, Augment3IDColumn, Augment4IDColumn, Augment5IDColumn, Augment6IDColumn, CreatedAtColumn}
		defaultColumns               = mysql.ColumnList{PlayerEventNpcHandinIDColumn, ItemIDColumn, ChargesColumn, EvolveLevelColumn, EvolveAmountColumn, Augment1IDColumn, Augment2IDColumn, Augment3IDColumn, Augment4IDColumn, Augment5IDColumn, Augment6IDColumn}
	)

	return playerEventNpcHandinEntriesTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:                     IDColumn,
		PlayerEventNpcHandinID: PlayerEventNpcHandinIDColumn,
		Type:                   TypeColumn,
		ItemID:                 ItemIDColumn,
		Charges:                ChargesColumn,
		EvolveLevel:            EvolveLevelColumn,
		EvolveAmount:           EvolveAmountColumn,
		Augment1ID:             Augment1IDColumn,
		Augment2ID:             Augment2IDColumn,
		Augment3ID:             Augment3IDColumn,
		Augment4ID:             Augment4IDColumn,
		Augment5ID:             Augment5IDColumn,
		Augment6ID:             Augment6IDColumn,
		CreatedAt:              CreatedAtColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
