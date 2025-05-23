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

var AaAbility = newAaAbilityTable("eqgo", "aa_ability", "")

type aaAbilityTable struct {
	mysql.Table

	// Columns
	ID               mysql.ColumnInteger
	Name             mysql.ColumnString
	Category         mysql.ColumnInteger
	Classes          mysql.ColumnInteger
	Races            mysql.ColumnInteger
	DrakkinHeritage  mysql.ColumnInteger
	Deities          mysql.ColumnInteger
	Status           mysql.ColumnInteger
	Type             mysql.ColumnInteger
	Charges          mysql.ColumnInteger
	GrantOnly        mysql.ColumnInteger
	FirstRankID      mysql.ColumnInteger
	Enabled          mysql.ColumnInteger
	ResetOnDeath     mysql.ColumnInteger
	AutoGrantEnabled mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type AaAbilityTable struct {
	aaAbilityTable

	NEW aaAbilityTable
}

// AS creates new AaAbilityTable with assigned alias
func (a AaAbilityTable) AS(alias string) *AaAbilityTable {
	return newAaAbilityTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new AaAbilityTable with assigned schema name
func (a AaAbilityTable) FromSchema(schemaName string) *AaAbilityTable {
	return newAaAbilityTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new AaAbilityTable with assigned table prefix
func (a AaAbilityTable) WithPrefix(prefix string) *AaAbilityTable {
	return newAaAbilityTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new AaAbilityTable with assigned table suffix
func (a AaAbilityTable) WithSuffix(suffix string) *AaAbilityTable {
	return newAaAbilityTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newAaAbilityTable(schemaName, tableName, alias string) *AaAbilityTable {
	return &AaAbilityTable{
		aaAbilityTable: newAaAbilityTableImpl(schemaName, tableName, alias),
		NEW:            newAaAbilityTableImpl("", "new", ""),
	}
}

func newAaAbilityTableImpl(schemaName, tableName, alias string) aaAbilityTable {
	var (
		IDColumn               = mysql.IntegerColumn("id")
		NameColumn             = mysql.StringColumn("name")
		CategoryColumn         = mysql.IntegerColumn("category")
		ClassesColumn          = mysql.IntegerColumn("classes")
		RacesColumn            = mysql.IntegerColumn("races")
		DrakkinHeritageColumn  = mysql.IntegerColumn("drakkin_heritage")
		DeitiesColumn          = mysql.IntegerColumn("deities")
		StatusColumn           = mysql.IntegerColumn("status")
		TypeColumn             = mysql.IntegerColumn("type")
		ChargesColumn          = mysql.IntegerColumn("charges")
		GrantOnlyColumn        = mysql.IntegerColumn("grant_only")
		FirstRankIDColumn      = mysql.IntegerColumn("first_rank_id")
		EnabledColumn          = mysql.IntegerColumn("enabled")
		ResetOnDeathColumn     = mysql.IntegerColumn("reset_on_death")
		AutoGrantEnabledColumn = mysql.IntegerColumn("auto_grant_enabled")
		allColumns             = mysql.ColumnList{IDColumn, NameColumn, CategoryColumn, ClassesColumn, RacesColumn, DrakkinHeritageColumn, DeitiesColumn, StatusColumn, TypeColumn, ChargesColumn, GrantOnlyColumn, FirstRankIDColumn, EnabledColumn, ResetOnDeathColumn, AutoGrantEnabledColumn}
		mutableColumns         = mysql.ColumnList{NameColumn, CategoryColumn, ClassesColumn, RacesColumn, DrakkinHeritageColumn, DeitiesColumn, StatusColumn, TypeColumn, ChargesColumn, GrantOnlyColumn, FirstRankIDColumn, EnabledColumn, ResetOnDeathColumn, AutoGrantEnabledColumn}
		defaultColumns         = mysql.ColumnList{CategoryColumn, ClassesColumn, RacesColumn, DrakkinHeritageColumn, DeitiesColumn, StatusColumn, TypeColumn, ChargesColumn, GrantOnlyColumn, FirstRankIDColumn, EnabledColumn, ResetOnDeathColumn, AutoGrantEnabledColumn}
	)

	return aaAbilityTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:               IDColumn,
		Name:             NameColumn,
		Category:         CategoryColumn,
		Classes:          ClassesColumn,
		Races:            RacesColumn,
		DrakkinHeritage:  DrakkinHeritageColumn,
		Deities:          DeitiesColumn,
		Status:           StatusColumn,
		Type:             TypeColumn,
		Charges:          ChargesColumn,
		GrantOnly:        GrantOnlyColumn,
		FirstRankID:      FirstRankIDColumn,
		Enabled:          EnabledColumn,
		ResetOnDeath:     ResetOnDeathColumn,
		AutoGrantEnabled: AutoGrantEnabledColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
