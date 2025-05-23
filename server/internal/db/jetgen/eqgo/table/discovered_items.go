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

var DiscoveredItems = newDiscoveredItemsTable("eqgo", "discovered_items", "")

type discoveredItemsTable struct {
	mysql.Table

	// Columns
	ItemID         mysql.ColumnInteger
	CharName       mysql.ColumnString
	DiscoveredDate mysql.ColumnInteger
	AccountStatus  mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type DiscoveredItemsTable struct {
	discoveredItemsTable

	NEW discoveredItemsTable
}

// AS creates new DiscoveredItemsTable with assigned alias
func (a DiscoveredItemsTable) AS(alias string) *DiscoveredItemsTable {
	return newDiscoveredItemsTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new DiscoveredItemsTable with assigned schema name
func (a DiscoveredItemsTable) FromSchema(schemaName string) *DiscoveredItemsTable {
	return newDiscoveredItemsTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new DiscoveredItemsTable with assigned table prefix
func (a DiscoveredItemsTable) WithPrefix(prefix string) *DiscoveredItemsTable {
	return newDiscoveredItemsTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new DiscoveredItemsTable with assigned table suffix
func (a DiscoveredItemsTable) WithSuffix(suffix string) *DiscoveredItemsTable {
	return newDiscoveredItemsTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newDiscoveredItemsTable(schemaName, tableName, alias string) *DiscoveredItemsTable {
	return &DiscoveredItemsTable{
		discoveredItemsTable: newDiscoveredItemsTableImpl(schemaName, tableName, alias),
		NEW:                  newDiscoveredItemsTableImpl("", "new", ""),
	}
}

func newDiscoveredItemsTableImpl(schemaName, tableName, alias string) discoveredItemsTable {
	var (
		ItemIDColumn         = mysql.IntegerColumn("item_id")
		CharNameColumn       = mysql.StringColumn("char_name")
		DiscoveredDateColumn = mysql.IntegerColumn("discovered_date")
		AccountStatusColumn  = mysql.IntegerColumn("account_status")
		allColumns           = mysql.ColumnList{ItemIDColumn, CharNameColumn, DiscoveredDateColumn, AccountStatusColumn}
		mutableColumns       = mysql.ColumnList{CharNameColumn, DiscoveredDateColumn, AccountStatusColumn}
		defaultColumns       = mysql.ColumnList{ItemIDColumn, CharNameColumn, DiscoveredDateColumn, AccountStatusColumn}
	)

	return discoveredItemsTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ItemID:         ItemIDColumn,
		CharName:       CharNameColumn,
		DiscoveredDate: DiscoveredDateColumn,
		AccountStatus:  AccountStatusColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
