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

var GridPaths = newGridPathsTable("eqgo", "grid_paths", "")

type gridPathsTable struct {
	mysql.Table

	// Columns
	Zoneid mysql.ColumnInteger
	Gridid mysql.ColumnInteger
	Points mysql.ColumnString

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type GridPathsTable struct {
	gridPathsTable

	NEW gridPathsTable
}

// AS creates new GridPathsTable with assigned alias
func (a GridPathsTable) AS(alias string) *GridPathsTable {
	return newGridPathsTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new GridPathsTable with assigned schema name
func (a GridPathsTable) FromSchema(schemaName string) *GridPathsTable {
	return newGridPathsTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new GridPathsTable with assigned table prefix
func (a GridPathsTable) WithPrefix(prefix string) *GridPathsTable {
	return newGridPathsTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new GridPathsTable with assigned table suffix
func (a GridPathsTable) WithSuffix(suffix string) *GridPathsTable {
	return newGridPathsTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newGridPathsTable(schemaName, tableName, alias string) *GridPathsTable {
	return &GridPathsTable{
		gridPathsTable: newGridPathsTableImpl(schemaName, tableName, alias),
		NEW:            newGridPathsTableImpl("", "new", ""),
	}
}

func newGridPathsTableImpl(schemaName, tableName, alias string) gridPathsTable {
	var (
		ZoneidColumn   = mysql.IntegerColumn("zoneid")
		GrididColumn   = mysql.IntegerColumn("gridid")
		PointsColumn   = mysql.StringColumn("points")
		allColumns     = mysql.ColumnList{ZoneidColumn, GrididColumn, PointsColumn}
		mutableColumns = mysql.ColumnList{PointsColumn}
		defaultColumns = mysql.ColumnList{}
	)

	return gridPathsTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		Zoneid: ZoneidColumn,
		Gridid: GrididColumn,
		Points: PointsColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
