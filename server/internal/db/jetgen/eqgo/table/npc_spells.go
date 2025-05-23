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

var NpcSpells = newNpcSpellsTable("eqgo", "npc_spells", "")

type npcSpellsTable struct {
	mysql.Table

	// Columns
	ID                   mysql.ColumnInteger
	Name                 mysql.ColumnString
	ParentList           mysql.ColumnInteger
	AttackProc           mysql.ColumnInteger
	ProcChance           mysql.ColumnInteger
	RangeProc            mysql.ColumnInteger
	RprocChance          mysql.ColumnInteger
	DefensiveProc        mysql.ColumnInteger
	DprocChance          mysql.ColumnInteger
	FailRecast           mysql.ColumnInteger
	EngagedNoSpRecastMin mysql.ColumnInteger
	EngagedNoSpRecastMax mysql.ColumnInteger
	EngagedBSelfChance   mysql.ColumnInteger
	EngagedBOtherChance  mysql.ColumnInteger
	EngagedDChance       mysql.ColumnInteger
	PursueNoSpRecastMin  mysql.ColumnInteger
	PursueNoSpRecastMax  mysql.ColumnInteger
	PursueDChance        mysql.ColumnInteger
	IdleNoSpRecastMin    mysql.ColumnInteger
	IdleNoSpRecastMax    mysql.ColumnInteger
	IdleBChance          mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type NpcSpellsTable struct {
	npcSpellsTable

	NEW npcSpellsTable
}

// AS creates new NpcSpellsTable with assigned alias
func (a NpcSpellsTable) AS(alias string) *NpcSpellsTable {
	return newNpcSpellsTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new NpcSpellsTable with assigned schema name
func (a NpcSpellsTable) FromSchema(schemaName string) *NpcSpellsTable {
	return newNpcSpellsTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new NpcSpellsTable with assigned table prefix
func (a NpcSpellsTable) WithPrefix(prefix string) *NpcSpellsTable {
	return newNpcSpellsTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new NpcSpellsTable with assigned table suffix
func (a NpcSpellsTable) WithSuffix(suffix string) *NpcSpellsTable {
	return newNpcSpellsTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newNpcSpellsTable(schemaName, tableName, alias string) *NpcSpellsTable {
	return &NpcSpellsTable{
		npcSpellsTable: newNpcSpellsTableImpl(schemaName, tableName, alias),
		NEW:            newNpcSpellsTableImpl("", "new", ""),
	}
}

func newNpcSpellsTableImpl(schemaName, tableName, alias string) npcSpellsTable {
	var (
		IDColumn                   = mysql.IntegerColumn("id")
		NameColumn                 = mysql.StringColumn("name")
		ParentListColumn           = mysql.IntegerColumn("parent_list")
		AttackProcColumn           = mysql.IntegerColumn("attack_proc")
		ProcChanceColumn           = mysql.IntegerColumn("proc_chance")
		RangeProcColumn            = mysql.IntegerColumn("range_proc")
		RprocChanceColumn          = mysql.IntegerColumn("rproc_chance")
		DefensiveProcColumn        = mysql.IntegerColumn("defensive_proc")
		DprocChanceColumn          = mysql.IntegerColumn("dproc_chance")
		FailRecastColumn           = mysql.IntegerColumn("fail_recast")
		EngagedNoSpRecastMinColumn = mysql.IntegerColumn("engaged_no_sp_recast_min")
		EngagedNoSpRecastMaxColumn = mysql.IntegerColumn("engaged_no_sp_recast_max")
		EngagedBSelfChanceColumn   = mysql.IntegerColumn("engaged_b_self_chance")
		EngagedBOtherChanceColumn  = mysql.IntegerColumn("engaged_b_other_chance")
		EngagedDChanceColumn       = mysql.IntegerColumn("engaged_d_chance")
		PursueNoSpRecastMinColumn  = mysql.IntegerColumn("pursue_no_sp_recast_min")
		PursueNoSpRecastMaxColumn  = mysql.IntegerColumn("pursue_no_sp_recast_max")
		PursueDChanceColumn        = mysql.IntegerColumn("pursue_d_chance")
		IdleNoSpRecastMinColumn    = mysql.IntegerColumn("idle_no_sp_recast_min")
		IdleNoSpRecastMaxColumn    = mysql.IntegerColumn("idle_no_sp_recast_max")
		IdleBChanceColumn          = mysql.IntegerColumn("idle_b_chance")
		allColumns                 = mysql.ColumnList{IDColumn, NameColumn, ParentListColumn, AttackProcColumn, ProcChanceColumn, RangeProcColumn, RprocChanceColumn, DefensiveProcColumn, DprocChanceColumn, FailRecastColumn, EngagedNoSpRecastMinColumn, EngagedNoSpRecastMaxColumn, EngagedBSelfChanceColumn, EngagedBOtherChanceColumn, EngagedDChanceColumn, PursueNoSpRecastMinColumn, PursueNoSpRecastMaxColumn, PursueDChanceColumn, IdleNoSpRecastMinColumn, IdleNoSpRecastMaxColumn, IdleBChanceColumn}
		mutableColumns             = mysql.ColumnList{NameColumn, ParentListColumn, AttackProcColumn, ProcChanceColumn, RangeProcColumn, RprocChanceColumn, DefensiveProcColumn, DprocChanceColumn, FailRecastColumn, EngagedNoSpRecastMinColumn, EngagedNoSpRecastMaxColumn, EngagedBSelfChanceColumn, EngagedBOtherChanceColumn, EngagedDChanceColumn, PursueNoSpRecastMinColumn, PursueNoSpRecastMaxColumn, PursueDChanceColumn, IdleNoSpRecastMinColumn, IdleNoSpRecastMaxColumn, IdleBChanceColumn}
		defaultColumns             = mysql.ColumnList{ParentListColumn, AttackProcColumn, ProcChanceColumn, RangeProcColumn, RprocChanceColumn, DefensiveProcColumn, DprocChanceColumn, FailRecastColumn, EngagedNoSpRecastMinColumn, EngagedNoSpRecastMaxColumn, EngagedBSelfChanceColumn, EngagedBOtherChanceColumn, EngagedDChanceColumn, PursueNoSpRecastMinColumn, PursueNoSpRecastMaxColumn, PursueDChanceColumn, IdleNoSpRecastMinColumn, IdleNoSpRecastMaxColumn, IdleBChanceColumn}
	)

	return npcSpellsTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:                   IDColumn,
		Name:                 NameColumn,
		ParentList:           ParentListColumn,
		AttackProc:           AttackProcColumn,
		ProcChance:           ProcChanceColumn,
		RangeProc:            RangeProcColumn,
		RprocChance:          RprocChanceColumn,
		DefensiveProc:        DefensiveProcColumn,
		DprocChance:          DprocChanceColumn,
		FailRecast:           FailRecastColumn,
		EngagedNoSpRecastMin: EngagedNoSpRecastMinColumn,
		EngagedNoSpRecastMax: EngagedNoSpRecastMaxColumn,
		EngagedBSelfChance:   EngagedBSelfChanceColumn,
		EngagedBOtherChance:  EngagedBOtherChanceColumn,
		EngagedDChance:       EngagedDChanceColumn,
		PursueNoSpRecastMin:  PursueNoSpRecastMinColumn,
		PursueNoSpRecastMax:  PursueNoSpRecastMaxColumn,
		PursueDChance:        PursueDChanceColumn,
		IdleNoSpRecastMin:    IdleNoSpRecastMinColumn,
		IdleNoSpRecastMax:    IdleNoSpRecastMaxColumn,
		IdleBChance:          IdleBChanceColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
