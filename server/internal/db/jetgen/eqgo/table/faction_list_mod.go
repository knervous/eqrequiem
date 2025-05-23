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

var FactionListMod = newFactionListModTable("eqgo", "faction_list_mod", "")

type factionListModTable struct {
	mysql.Table

	// Columns
	ID        mysql.ColumnInteger
	FactionID mysql.ColumnInteger
	Mod       mysql.ColumnInteger
	ModName   mysql.ColumnString

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type FactionListModTable struct {
	factionListModTable

	NEW factionListModTable
}

// AS creates new FactionListModTable with assigned alias
func (a FactionListModTable) AS(alias string) *FactionListModTable {
	return newFactionListModTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new FactionListModTable with assigned schema name
func (a FactionListModTable) FromSchema(schemaName string) *FactionListModTable {
	return newFactionListModTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new FactionListModTable with assigned table prefix
func (a FactionListModTable) WithPrefix(prefix string) *FactionListModTable {
	return newFactionListModTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new FactionListModTable with assigned table suffix
func (a FactionListModTable) WithSuffix(suffix string) *FactionListModTable {
	return newFactionListModTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newFactionListModTable(schemaName, tableName, alias string) *FactionListModTable {
	return &FactionListModTable{
		factionListModTable: newFactionListModTableImpl(schemaName, tableName, alias),
		NEW:                 newFactionListModTableImpl("", "new", ""),
	}
}

func newFactionListModTableImpl(schemaName, tableName, alias string) factionListModTable {
	var (
		IDColumn        = mysql.IntegerColumn("id")
		FactionIDColumn = mysql.IntegerColumn("faction_id")
		ModColumn       = mysql.IntegerColumn("mod")
		ModNameColumn   = mysql.StringColumn("mod_name")
		allColumns      = mysql.ColumnList{IDColumn, FactionIDColumn, ModColumn, ModNameColumn}
		mutableColumns  = mysql.ColumnList{FactionIDColumn, ModColumn, ModNameColumn}
		defaultColumns  = mysql.ColumnList{}
	)

	return factionListModTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:        IDColumn,
		FactionID: FactionIDColumn,
		Mod:       ModColumn,
		ModName:   ModNameColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
