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

var Saylink = newSaylinkTable("eqgo", "saylink", "")

type saylinkTable struct {
	mysql.Table

	// Columns
	ID     mysql.ColumnInteger
	Phrase mysql.ColumnString

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type SaylinkTable struct {
	saylinkTable

	NEW saylinkTable
}

// AS creates new SaylinkTable with assigned alias
func (a SaylinkTable) AS(alias string) *SaylinkTable {
	return newSaylinkTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new SaylinkTable with assigned schema name
func (a SaylinkTable) FromSchema(schemaName string) *SaylinkTable {
	return newSaylinkTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new SaylinkTable with assigned table prefix
func (a SaylinkTable) WithPrefix(prefix string) *SaylinkTable {
	return newSaylinkTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new SaylinkTable with assigned table suffix
func (a SaylinkTable) WithSuffix(suffix string) *SaylinkTable {
	return newSaylinkTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newSaylinkTable(schemaName, tableName, alias string) *SaylinkTable {
	return &SaylinkTable{
		saylinkTable: newSaylinkTableImpl(schemaName, tableName, alias),
		NEW:          newSaylinkTableImpl("", "new", ""),
	}
}

func newSaylinkTableImpl(schemaName, tableName, alias string) saylinkTable {
	var (
		IDColumn       = mysql.IntegerColumn("id")
		PhraseColumn   = mysql.StringColumn("phrase")
		allColumns     = mysql.ColumnList{IDColumn, PhraseColumn}
		mutableColumns = mysql.ColumnList{PhraseColumn}
		defaultColumns = mysql.ColumnList{PhraseColumn}
	)

	return saylinkTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:     IDColumn,
		Phrase: PhraseColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
