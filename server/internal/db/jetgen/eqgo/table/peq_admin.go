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

var PeqAdmin = newPeqAdminTable("eqgo", "peq_admin", "")

type peqAdminTable struct {
	mysql.Table

	// Columns
	ID            mysql.ColumnInteger
	Login         mysql.ColumnString
	Password      mysql.ColumnString
	Administrator mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type PeqAdminTable struct {
	peqAdminTable

	NEW peqAdminTable
}

// AS creates new PeqAdminTable with assigned alias
func (a PeqAdminTable) AS(alias string) *PeqAdminTable {
	return newPeqAdminTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new PeqAdminTable with assigned schema name
func (a PeqAdminTable) FromSchema(schemaName string) *PeqAdminTable {
	return newPeqAdminTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new PeqAdminTable with assigned table prefix
func (a PeqAdminTable) WithPrefix(prefix string) *PeqAdminTable {
	return newPeqAdminTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new PeqAdminTable with assigned table suffix
func (a PeqAdminTable) WithSuffix(suffix string) *PeqAdminTable {
	return newPeqAdminTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newPeqAdminTable(schemaName, tableName, alias string) *PeqAdminTable {
	return &PeqAdminTable{
		peqAdminTable: newPeqAdminTableImpl(schemaName, tableName, alias),
		NEW:           newPeqAdminTableImpl("", "new", ""),
	}
}

func newPeqAdminTableImpl(schemaName, tableName, alias string) peqAdminTable {
	var (
		IDColumn            = mysql.IntegerColumn("id")
		LoginColumn         = mysql.StringColumn("login")
		PasswordColumn      = mysql.StringColumn("password")
		AdministratorColumn = mysql.IntegerColumn("administrator")
		allColumns          = mysql.ColumnList{IDColumn, LoginColumn, PasswordColumn, AdministratorColumn}
		mutableColumns      = mysql.ColumnList{LoginColumn, PasswordColumn, AdministratorColumn}
		defaultColumns      = mysql.ColumnList{AdministratorColumn}
	)

	return peqAdminTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:            IDColumn,
		Login:         LoginColumn,
		Password:      PasswordColumn,
		Administrator: AdministratorColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
