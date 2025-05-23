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

var CharRecipeList = newCharRecipeListTable("eqgo", "char_recipe_list", "")

type charRecipeListTable struct {
	mysql.Table

	// Columns
	CharID    mysql.ColumnInteger
	RecipeID  mysql.ColumnInteger
	Madecount mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type CharRecipeListTable struct {
	charRecipeListTable

	NEW charRecipeListTable
}

// AS creates new CharRecipeListTable with assigned alias
func (a CharRecipeListTable) AS(alias string) *CharRecipeListTable {
	return newCharRecipeListTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new CharRecipeListTable with assigned schema name
func (a CharRecipeListTable) FromSchema(schemaName string) *CharRecipeListTable {
	return newCharRecipeListTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new CharRecipeListTable with assigned table prefix
func (a CharRecipeListTable) WithPrefix(prefix string) *CharRecipeListTable {
	return newCharRecipeListTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new CharRecipeListTable with assigned table suffix
func (a CharRecipeListTable) WithSuffix(suffix string) *CharRecipeListTable {
	return newCharRecipeListTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newCharRecipeListTable(schemaName, tableName, alias string) *CharRecipeListTable {
	return &CharRecipeListTable{
		charRecipeListTable: newCharRecipeListTableImpl(schemaName, tableName, alias),
		NEW:                 newCharRecipeListTableImpl("", "new", ""),
	}
}

func newCharRecipeListTableImpl(schemaName, tableName, alias string) charRecipeListTable {
	var (
		CharIDColumn    = mysql.IntegerColumn("char_id")
		RecipeIDColumn  = mysql.IntegerColumn("recipe_id")
		MadecountColumn = mysql.IntegerColumn("madecount")
		allColumns      = mysql.ColumnList{CharIDColumn, RecipeIDColumn, MadecountColumn}
		mutableColumns  = mysql.ColumnList{MadecountColumn}
		defaultColumns  = mysql.ColumnList{MadecountColumn}
	)

	return charRecipeListTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		CharID:    CharIDColumn,
		RecipeID:  RecipeIDColumn,
		Madecount: MadecountColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
