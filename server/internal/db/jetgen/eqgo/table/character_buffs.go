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

var CharacterBuffs = newCharacterBuffsTable("eqgo", "character_buffs", "")

type characterBuffsTable struct {
	mysql.Table

	// Columns
	CharacterID   mysql.ColumnInteger
	SlotID        mysql.ColumnInteger
	SpellID       mysql.ColumnInteger
	CasterLevel   mysql.ColumnInteger
	CasterName    mysql.ColumnString
	Ticsremaining mysql.ColumnInteger
	Counters      mysql.ColumnInteger
	Numhits       mysql.ColumnInteger
	MeleeRune     mysql.ColumnInteger
	MagicRune     mysql.ColumnInteger
	Persistent    mysql.ColumnInteger
	DotRune       mysql.ColumnInteger
	CastonX       mysql.ColumnInteger
	CastonY       mysql.ColumnInteger
	CastonZ       mysql.ColumnInteger
	ExtraDIChance mysql.ColumnInteger
	InstrumentMod mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type CharacterBuffsTable struct {
	characterBuffsTable

	NEW characterBuffsTable
}

// AS creates new CharacterBuffsTable with assigned alias
func (a CharacterBuffsTable) AS(alias string) *CharacterBuffsTable {
	return newCharacterBuffsTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new CharacterBuffsTable with assigned schema name
func (a CharacterBuffsTable) FromSchema(schemaName string) *CharacterBuffsTable {
	return newCharacterBuffsTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new CharacterBuffsTable with assigned table prefix
func (a CharacterBuffsTable) WithPrefix(prefix string) *CharacterBuffsTable {
	return newCharacterBuffsTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new CharacterBuffsTable with assigned table suffix
func (a CharacterBuffsTable) WithSuffix(suffix string) *CharacterBuffsTable {
	return newCharacterBuffsTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newCharacterBuffsTable(schemaName, tableName, alias string) *CharacterBuffsTable {
	return &CharacterBuffsTable{
		characterBuffsTable: newCharacterBuffsTableImpl(schemaName, tableName, alias),
		NEW:                 newCharacterBuffsTableImpl("", "new", ""),
	}
}

func newCharacterBuffsTableImpl(schemaName, tableName, alias string) characterBuffsTable {
	var (
		CharacterIDColumn   = mysql.IntegerColumn("character_id")
		SlotIDColumn        = mysql.IntegerColumn("slot_id")
		SpellIDColumn       = mysql.IntegerColumn("spell_id")
		CasterLevelColumn   = mysql.IntegerColumn("caster_level")
		CasterNameColumn    = mysql.StringColumn("caster_name")
		TicsremainingColumn = mysql.IntegerColumn("ticsremaining")
		CountersColumn      = mysql.IntegerColumn("counters")
		NumhitsColumn       = mysql.IntegerColumn("numhits")
		MeleeRuneColumn     = mysql.IntegerColumn("melee_rune")
		MagicRuneColumn     = mysql.IntegerColumn("magic_rune")
		PersistentColumn    = mysql.IntegerColumn("persistent")
		DotRuneColumn       = mysql.IntegerColumn("dot_rune")
		CastonXColumn       = mysql.IntegerColumn("caston_x")
		CastonYColumn       = mysql.IntegerColumn("caston_y")
		CastonZColumn       = mysql.IntegerColumn("caston_z")
		ExtraDIChanceColumn = mysql.IntegerColumn("ExtraDIChance")
		InstrumentModColumn = mysql.IntegerColumn("instrument_mod")
		allColumns          = mysql.ColumnList{CharacterIDColumn, SlotIDColumn, SpellIDColumn, CasterLevelColumn, CasterNameColumn, TicsremainingColumn, CountersColumn, NumhitsColumn, MeleeRuneColumn, MagicRuneColumn, PersistentColumn, DotRuneColumn, CastonXColumn, CastonYColumn, CastonZColumn, ExtraDIChanceColumn, InstrumentModColumn}
		mutableColumns      = mysql.ColumnList{SpellIDColumn, CasterLevelColumn, CasterNameColumn, TicsremainingColumn, CountersColumn, NumhitsColumn, MeleeRuneColumn, MagicRuneColumn, PersistentColumn, DotRuneColumn, CastonXColumn, CastonYColumn, CastonZColumn, ExtraDIChanceColumn, InstrumentModColumn}
		defaultColumns      = mysql.ColumnList{DotRuneColumn, CastonXColumn, CastonYColumn, CastonZColumn, ExtraDIChanceColumn, InstrumentModColumn}
	)

	return characterBuffsTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		CharacterID:   CharacterIDColumn,
		SlotID:        SlotIDColumn,
		SpellID:       SpellIDColumn,
		CasterLevel:   CasterLevelColumn,
		CasterName:    CasterNameColumn,
		Ticsremaining: TicsremainingColumn,
		Counters:      CountersColumn,
		Numhits:       NumhitsColumn,
		MeleeRune:     MeleeRuneColumn,
		MagicRune:     MagicRuneColumn,
		Persistent:    PersistentColumn,
		DotRune:       DotRuneColumn,
		CastonX:       CastonXColumn,
		CastonY:       CastonYColumn,
		CastonZ:       CastonZColumn,
		ExtraDIChance: ExtraDIChanceColumn,
		InstrumentMod: InstrumentModColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
