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

var TradeskillRecipe = newTradeskillRecipeTable("eqgo", "tradeskill_recipe", "")

type tradeskillRecipeTable struct {
	mysql.Table

	// Columns
	ID                   mysql.ColumnInteger
	Name                 mysql.ColumnString
	Tradeskill           mysql.ColumnInteger
	Skillneeded          mysql.ColumnInteger
	Trivial              mysql.ColumnInteger
	Nofail               mysql.ColumnBool
	ReplaceContainer     mysql.ColumnBool
	Notes                mysql.ColumnString
	MustLearn            mysql.ColumnInteger
	LearnedByItemID      mysql.ColumnInteger
	Quest                mysql.ColumnBool
	Enabled              mysql.ColumnBool
	MinExpansion         mysql.ColumnInteger
	MaxExpansion         mysql.ColumnInteger
	ContentFlags         mysql.ColumnString
	ContentFlagsDisabled mysql.ColumnString

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type TradeskillRecipeTable struct {
	tradeskillRecipeTable

	NEW tradeskillRecipeTable
}

// AS creates new TradeskillRecipeTable with assigned alias
func (a TradeskillRecipeTable) AS(alias string) *TradeskillRecipeTable {
	return newTradeskillRecipeTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new TradeskillRecipeTable with assigned schema name
func (a TradeskillRecipeTable) FromSchema(schemaName string) *TradeskillRecipeTable {
	return newTradeskillRecipeTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new TradeskillRecipeTable with assigned table prefix
func (a TradeskillRecipeTable) WithPrefix(prefix string) *TradeskillRecipeTable {
	return newTradeskillRecipeTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new TradeskillRecipeTable with assigned table suffix
func (a TradeskillRecipeTable) WithSuffix(suffix string) *TradeskillRecipeTable {
	return newTradeskillRecipeTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newTradeskillRecipeTable(schemaName, tableName, alias string) *TradeskillRecipeTable {
	return &TradeskillRecipeTable{
		tradeskillRecipeTable: newTradeskillRecipeTableImpl(schemaName, tableName, alias),
		NEW:                   newTradeskillRecipeTableImpl("", "new", ""),
	}
}

func newTradeskillRecipeTableImpl(schemaName, tableName, alias string) tradeskillRecipeTable {
	var (
		IDColumn                   = mysql.IntegerColumn("id")
		NameColumn                 = mysql.StringColumn("name")
		TradeskillColumn           = mysql.IntegerColumn("tradeskill")
		SkillneededColumn          = mysql.IntegerColumn("skillneeded")
		TrivialColumn              = mysql.IntegerColumn("trivial")
		NofailColumn               = mysql.BoolColumn("nofail")
		ReplaceContainerColumn     = mysql.BoolColumn("replace_container")
		NotesColumn                = mysql.StringColumn("notes")
		MustLearnColumn            = mysql.IntegerColumn("must_learn")
		LearnedByItemIDColumn      = mysql.IntegerColumn("learned_by_item_id")
		QuestColumn                = mysql.BoolColumn("quest")
		EnabledColumn              = mysql.BoolColumn("enabled")
		MinExpansionColumn         = mysql.IntegerColumn("min_expansion")
		MaxExpansionColumn         = mysql.IntegerColumn("max_expansion")
		ContentFlagsColumn         = mysql.StringColumn("content_flags")
		ContentFlagsDisabledColumn = mysql.StringColumn("content_flags_disabled")
		allColumns                 = mysql.ColumnList{IDColumn, NameColumn, TradeskillColumn, SkillneededColumn, TrivialColumn, NofailColumn, ReplaceContainerColumn, NotesColumn, MustLearnColumn, LearnedByItemIDColumn, QuestColumn, EnabledColumn, MinExpansionColumn, MaxExpansionColumn, ContentFlagsColumn, ContentFlagsDisabledColumn}
		mutableColumns             = mysql.ColumnList{NameColumn, TradeskillColumn, SkillneededColumn, TrivialColumn, NofailColumn, ReplaceContainerColumn, NotesColumn, MustLearnColumn, LearnedByItemIDColumn, QuestColumn, EnabledColumn, MinExpansionColumn, MaxExpansionColumn, ContentFlagsColumn, ContentFlagsDisabledColumn}
		defaultColumns             = mysql.ColumnList{NameColumn, TradeskillColumn, SkillneededColumn, TrivialColumn, NofailColumn, ReplaceContainerColumn, MustLearnColumn, LearnedByItemIDColumn, QuestColumn, EnabledColumn, MinExpansionColumn, MaxExpansionColumn}
	)

	return tradeskillRecipeTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:                   IDColumn,
		Name:                 NameColumn,
		Tradeskill:           TradeskillColumn,
		Skillneeded:          SkillneededColumn,
		Trivial:              TrivialColumn,
		Nofail:               NofailColumn,
		ReplaceContainer:     ReplaceContainerColumn,
		Notes:                NotesColumn,
		MustLearn:            MustLearnColumn,
		LearnedByItemID:      LearnedByItemIDColumn,
		Quest:                QuestColumn,
		Enabled:              EnabledColumn,
		MinExpansion:         MinExpansionColumn,
		MaxExpansion:         MaxExpansionColumn,
		ContentFlags:         ContentFlagsColumn,
		ContentFlagsDisabled: ContentFlagsDisabledColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
