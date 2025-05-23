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

var PerlEventExportSettings = newPerlEventExportSettingsTable("eqgo", "perl_event_export_settings", "")

type perlEventExportSettingsTable struct {
	mysql.Table

	// Columns
	EventID          mysql.ColumnInteger
	EventDescription mysql.ColumnString
	ExportQglobals   mysql.ColumnInteger
	ExportMob        mysql.ColumnInteger
	ExportZone       mysql.ColumnInteger
	ExportItem       mysql.ColumnInteger
	ExportEvent      mysql.ColumnInteger

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type PerlEventExportSettingsTable struct {
	perlEventExportSettingsTable

	NEW perlEventExportSettingsTable
}

// AS creates new PerlEventExportSettingsTable with assigned alias
func (a PerlEventExportSettingsTable) AS(alias string) *PerlEventExportSettingsTable {
	return newPerlEventExportSettingsTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new PerlEventExportSettingsTable with assigned schema name
func (a PerlEventExportSettingsTable) FromSchema(schemaName string) *PerlEventExportSettingsTable {
	return newPerlEventExportSettingsTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new PerlEventExportSettingsTable with assigned table prefix
func (a PerlEventExportSettingsTable) WithPrefix(prefix string) *PerlEventExportSettingsTable {
	return newPerlEventExportSettingsTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new PerlEventExportSettingsTable with assigned table suffix
func (a PerlEventExportSettingsTable) WithSuffix(suffix string) *PerlEventExportSettingsTable {
	return newPerlEventExportSettingsTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newPerlEventExportSettingsTable(schemaName, tableName, alias string) *PerlEventExportSettingsTable {
	return &PerlEventExportSettingsTable{
		perlEventExportSettingsTable: newPerlEventExportSettingsTableImpl(schemaName, tableName, alias),
		NEW:                          newPerlEventExportSettingsTableImpl("", "new", ""),
	}
}

func newPerlEventExportSettingsTableImpl(schemaName, tableName, alias string) perlEventExportSettingsTable {
	var (
		EventIDColumn          = mysql.IntegerColumn("event_id")
		EventDescriptionColumn = mysql.StringColumn("event_description")
		ExportQglobalsColumn   = mysql.IntegerColumn("export_qglobals")
		ExportMobColumn        = mysql.IntegerColumn("export_mob")
		ExportZoneColumn       = mysql.IntegerColumn("export_zone")
		ExportItemColumn       = mysql.IntegerColumn("export_item")
		ExportEventColumn      = mysql.IntegerColumn("export_event")
		allColumns             = mysql.ColumnList{EventIDColumn, EventDescriptionColumn, ExportQglobalsColumn, ExportMobColumn, ExportZoneColumn, ExportItemColumn, ExportEventColumn}
		mutableColumns         = mysql.ColumnList{EventDescriptionColumn, ExportQglobalsColumn, ExportMobColumn, ExportZoneColumn, ExportItemColumn, ExportEventColumn}
		defaultColumns         = mysql.ColumnList{ExportQglobalsColumn, ExportMobColumn, ExportZoneColumn, ExportItemColumn, ExportEventColumn}
	)

	return perlEventExportSettingsTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		EventID:          EventIDColumn,
		EventDescription: EventDescriptionColumn,
		ExportQglobals:   ExportQglobalsColumn,
		ExportMob:        ExportMobColumn,
		ExportZone:       ExportZoneColumn,
		ExportItem:       ExportItemColumn,
		ExportEvent:      ExportEventColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
