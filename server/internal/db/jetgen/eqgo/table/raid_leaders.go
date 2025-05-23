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

var RaidLeaders = newRaidLeadersTable("eqgo", "raid_leaders", "")

type raidLeadersTable struct {
	mysql.Table

	// Columns
	Gid           mysql.ColumnInteger
	Rid           mysql.ColumnInteger
	Marknpc       mysql.ColumnString
	Maintank      mysql.ColumnString
	Assist        mysql.ColumnString
	Puller        mysql.ColumnString
	Leadershipaa  mysql.ColumnBlob
	Mentoree      mysql.ColumnString
	MentorPercent mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type RaidLeadersTable struct {
	raidLeadersTable

	NEW raidLeadersTable
}

// AS creates new RaidLeadersTable with assigned alias
func (a RaidLeadersTable) AS(alias string) *RaidLeadersTable {
	return newRaidLeadersTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new RaidLeadersTable with assigned schema name
func (a RaidLeadersTable) FromSchema(schemaName string) *RaidLeadersTable {
	return newRaidLeadersTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new RaidLeadersTable with assigned table prefix
func (a RaidLeadersTable) WithPrefix(prefix string) *RaidLeadersTable {
	return newRaidLeadersTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new RaidLeadersTable with assigned table suffix
func (a RaidLeadersTable) WithSuffix(suffix string) *RaidLeadersTable {
	return newRaidLeadersTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newRaidLeadersTable(schemaName, tableName, alias string) *RaidLeadersTable {
	return &RaidLeadersTable{
		raidLeadersTable: newRaidLeadersTableImpl(schemaName, tableName, alias),
		NEW:              newRaidLeadersTableImpl("", "new", ""),
	}
}

func newRaidLeadersTableImpl(schemaName, tableName, alias string) raidLeadersTable {
	var (
		GidColumn           = mysql.IntegerColumn("gid")
		RidColumn           = mysql.IntegerColumn("rid")
		MarknpcColumn       = mysql.StringColumn("marknpc")
		MaintankColumn      = mysql.StringColumn("maintank")
		AssistColumn        = mysql.StringColumn("assist")
		PullerColumn        = mysql.StringColumn("puller")
		LeadershipaaColumn  = mysql.BlobColumn("leadershipaa")
		MentoreeColumn      = mysql.StringColumn("mentoree")
		MentorPercentColumn = mysql.IntegerColumn("mentor_percent")
		allColumns          = mysql.ColumnList{GidColumn, RidColumn, MarknpcColumn, MaintankColumn, AssistColumn, PullerColumn, LeadershipaaColumn, MentoreeColumn, MentorPercentColumn}
		mutableColumns      = mysql.ColumnList{GidColumn, RidColumn, MarknpcColumn, MaintankColumn, AssistColumn, PullerColumn, LeadershipaaColumn, MentoreeColumn, MentorPercentColumn}
		defaultColumns      = mysql.ColumnList{MentorPercentColumn}
	)

	return raidLeadersTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		Gid:           GidColumn,
		Rid:           RidColumn,
		Marknpc:       MarknpcColumn,
		Maintank:      MaintankColumn,
		Assist:        AssistColumn,
		Puller:        PullerColumn,
		Leadershipaa:  LeadershipaaColumn,
		Mentoree:      MentoreeColumn,
		MentorPercent: MentorPercentColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
