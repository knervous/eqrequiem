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

var CharacterAlternateAbilities = newCharacterAlternateAbilitiesTable("eqgo", "character_alternate_abilities", "")

type characterAlternateAbilitiesTable struct {
	mysql.Table

	// Columns
	ID      mysql.ColumnInteger
	AaID    mysql.ColumnInteger
	AaValue mysql.ColumnInteger
	Charges mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type CharacterAlternateAbilitiesTable struct {
	characterAlternateAbilitiesTable

	NEW characterAlternateAbilitiesTable
}

// AS creates new CharacterAlternateAbilitiesTable with assigned alias
func (a CharacterAlternateAbilitiesTable) AS(alias string) *CharacterAlternateAbilitiesTable {
	return newCharacterAlternateAbilitiesTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new CharacterAlternateAbilitiesTable with assigned schema name
func (a CharacterAlternateAbilitiesTable) FromSchema(schemaName string) *CharacterAlternateAbilitiesTable {
	return newCharacterAlternateAbilitiesTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new CharacterAlternateAbilitiesTable with assigned table prefix
func (a CharacterAlternateAbilitiesTable) WithPrefix(prefix string) *CharacterAlternateAbilitiesTable {
	return newCharacterAlternateAbilitiesTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new CharacterAlternateAbilitiesTable with assigned table suffix
func (a CharacterAlternateAbilitiesTable) WithSuffix(suffix string) *CharacterAlternateAbilitiesTable {
	return newCharacterAlternateAbilitiesTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newCharacterAlternateAbilitiesTable(schemaName, tableName, alias string) *CharacterAlternateAbilitiesTable {
	return &CharacterAlternateAbilitiesTable{
		characterAlternateAbilitiesTable: newCharacterAlternateAbilitiesTableImpl(schemaName, tableName, alias),
		NEW:                              newCharacterAlternateAbilitiesTableImpl("", "new", ""),
	}
}

func newCharacterAlternateAbilitiesTableImpl(schemaName, tableName, alias string) characterAlternateAbilitiesTable {
	var (
		IDColumn       = mysql.IntegerColumn("id")
		AaIDColumn     = mysql.IntegerColumn("aa_id")
		AaValueColumn  = mysql.IntegerColumn("aa_value")
		ChargesColumn  = mysql.IntegerColumn("charges")
		allColumns     = mysql.ColumnList{IDColumn, AaIDColumn, AaValueColumn, ChargesColumn}
		mutableColumns = mysql.ColumnList{AaValueColumn, ChargesColumn}
		defaultColumns = mysql.ColumnList{IDColumn, AaIDColumn, AaValueColumn, ChargesColumn}
	)

	return characterAlternateAbilitiesTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:      IDColumn,
		AaID:    AaIDColumn,
		AaValue: AaValueColumn,
		Charges: ChargesColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
