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

var SpireUserServerResourcePermissions = newSpireUserServerResourcePermissionsTable("eqgo", "spire_user_server_resource_permissions", "")

type spireUserServerResourcePermissionsTable struct {
	mysql.Table

	// Columns
	ID                         mysql.ColumnInteger
	UserID                     mysql.ColumnInteger
	ServerDatabaseConnectionID mysql.ColumnInteger
	ResourceName               mysql.ColumnString
	CanWrite                   mysql.ColumnInteger
	CanRead                    mysql.ColumnInteger
	CreatedAt                  mysql.ColumnTimestamp

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type SpireUserServerResourcePermissionsTable struct {
	spireUserServerResourcePermissionsTable

	NEW spireUserServerResourcePermissionsTable
}

// AS creates new SpireUserServerResourcePermissionsTable with assigned alias
func (a SpireUserServerResourcePermissionsTable) AS(alias string) *SpireUserServerResourcePermissionsTable {
	return newSpireUserServerResourcePermissionsTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new SpireUserServerResourcePermissionsTable with assigned schema name
func (a SpireUserServerResourcePermissionsTable) FromSchema(schemaName string) *SpireUserServerResourcePermissionsTable {
	return newSpireUserServerResourcePermissionsTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new SpireUserServerResourcePermissionsTable with assigned table prefix
func (a SpireUserServerResourcePermissionsTable) WithPrefix(prefix string) *SpireUserServerResourcePermissionsTable {
	return newSpireUserServerResourcePermissionsTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new SpireUserServerResourcePermissionsTable with assigned table suffix
func (a SpireUserServerResourcePermissionsTable) WithSuffix(suffix string) *SpireUserServerResourcePermissionsTable {
	return newSpireUserServerResourcePermissionsTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newSpireUserServerResourcePermissionsTable(schemaName, tableName, alias string) *SpireUserServerResourcePermissionsTable {
	return &SpireUserServerResourcePermissionsTable{
		spireUserServerResourcePermissionsTable: newSpireUserServerResourcePermissionsTableImpl(schemaName, tableName, alias),
		NEW:                                     newSpireUserServerResourcePermissionsTableImpl("", "new", ""),
	}
}

func newSpireUserServerResourcePermissionsTableImpl(schemaName, tableName, alias string) spireUserServerResourcePermissionsTable {
	var (
		IDColumn                         = mysql.IntegerColumn("id")
		UserIDColumn                     = mysql.IntegerColumn("user_id")
		ServerDatabaseConnectionIDColumn = mysql.IntegerColumn("server_database_connection_id")
		ResourceNameColumn               = mysql.StringColumn("resource_name")
		CanWriteColumn                   = mysql.IntegerColumn("can_write")
		CanReadColumn                    = mysql.IntegerColumn("can_read")
		CreatedAtColumn                  = mysql.TimestampColumn("created_at")
		allColumns                       = mysql.ColumnList{IDColumn, UserIDColumn, ServerDatabaseConnectionIDColumn, ResourceNameColumn, CanWriteColumn, CanReadColumn, CreatedAtColumn}
		mutableColumns                   = mysql.ColumnList{UserIDColumn, ServerDatabaseConnectionIDColumn, ResourceNameColumn, CanWriteColumn, CanReadColumn, CreatedAtColumn}
		defaultColumns                   = mysql.ColumnList{}
	)

	return spireUserServerResourcePermissionsTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:                         IDColumn,
		UserID:                     UserIDColumn,
		ServerDatabaseConnectionID: ServerDatabaseConnectionIDColumn,
		ResourceName:               ResourceNameColumn,
		CanWrite:                   CanWriteColumn,
		CanRead:                    CanReadColumn,
		CreatedAt:                  CreatedAtColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
