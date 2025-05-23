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

var GridEntries = newGridEntriesTable("eqgo", "grid_entries", "")

type gridEntriesTable struct {
	mysql.Table

	// Columns
	Gridid      mysql.ColumnInteger
	Zoneid      mysql.ColumnInteger
	Number      mysql.ColumnInteger
	X           mysql.ColumnFloat
	Y           mysql.ColumnFloat
	Z           mysql.ColumnFloat
	Heading     mysql.ColumnFloat
	Pause       mysql.ColumnInteger
	Centerpoint mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type GridEntriesTable struct {
	gridEntriesTable

	NEW gridEntriesTable
}

// AS creates new GridEntriesTable with assigned alias
func (a GridEntriesTable) AS(alias string) *GridEntriesTable {
	return newGridEntriesTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new GridEntriesTable with assigned schema name
func (a GridEntriesTable) FromSchema(schemaName string) *GridEntriesTable {
	return newGridEntriesTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new GridEntriesTable with assigned table prefix
func (a GridEntriesTable) WithPrefix(prefix string) *GridEntriesTable {
	return newGridEntriesTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new GridEntriesTable with assigned table suffix
func (a GridEntriesTable) WithSuffix(suffix string) *GridEntriesTable {
	return newGridEntriesTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newGridEntriesTable(schemaName, tableName, alias string) *GridEntriesTable {
	return &GridEntriesTable{
		gridEntriesTable: newGridEntriesTableImpl(schemaName, tableName, alias),
		NEW:              newGridEntriesTableImpl("", "new", ""),
	}
}

func newGridEntriesTableImpl(schemaName, tableName, alias string) gridEntriesTable {
	var (
		GrididColumn      = mysql.IntegerColumn("gridid")
		ZoneidColumn      = mysql.IntegerColumn("zoneid")
		NumberColumn      = mysql.IntegerColumn("number")
		XColumn           = mysql.FloatColumn("x")
		YColumn           = mysql.FloatColumn("y")
		ZColumn           = mysql.FloatColumn("z")
		HeadingColumn     = mysql.FloatColumn("heading")
		PauseColumn       = mysql.IntegerColumn("pause")
		CenterpointColumn = mysql.IntegerColumn("centerpoint")
		allColumns        = mysql.ColumnList{GrididColumn, ZoneidColumn, NumberColumn, XColumn, YColumn, ZColumn, HeadingColumn, PauseColumn, CenterpointColumn}
		mutableColumns    = mysql.ColumnList{XColumn, YColumn, ZColumn, HeadingColumn, PauseColumn, CenterpointColumn}
		defaultColumns    = mysql.ColumnList{GrididColumn, ZoneidColumn, NumberColumn, XColumn, YColumn, ZColumn, HeadingColumn, PauseColumn, CenterpointColumn}
	)

	return gridEntriesTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		Gridid:      GrididColumn,
		Zoneid:      ZoneidColumn,
		Number:      NumberColumn,
		X:           XColumn,
		Y:           YColumn,
		Z:           ZColumn,
		Heading:     HeadingColumn,
		Pause:       PauseColumn,
		Centerpoint: CenterpointColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
