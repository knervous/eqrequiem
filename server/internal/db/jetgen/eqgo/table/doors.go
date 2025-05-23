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

var Doors = newDoorsTable("eqgo", "doors", "")

type doorsTable struct {
	mysql.Table

	// Columns
	ID                   mysql.ColumnInteger
	Doorid               mysql.ColumnInteger
	Zone                 mysql.ColumnString
	Version              mysql.ColumnInteger
	Name                 mysql.ColumnString
	PosY                 mysql.ColumnFloat
	PosX                 mysql.ColumnFloat
	PosZ                 mysql.ColumnFloat
	Heading              mysql.ColumnFloat
	Opentype             mysql.ColumnInteger
	Guild                mysql.ColumnInteger
	Lockpick             mysql.ColumnInteger
	Keyitem              mysql.ColumnInteger
	Nokeyring            mysql.ColumnInteger
	Triggerdoor          mysql.ColumnInteger
	Triggertype          mysql.ColumnInteger
	DisableTimer         mysql.ColumnInteger
	Doorisopen           mysql.ColumnInteger
	DoorParam            mysql.ColumnInteger
	DestZone             mysql.ColumnString
	DestInstance         mysql.ColumnInteger
	DestX                mysql.ColumnFloat
	DestY                mysql.ColumnFloat
	DestZ                mysql.ColumnFloat
	DestHeading          mysql.ColumnFloat
	InvertState          mysql.ColumnInteger
	Incline              mysql.ColumnInteger
	Size                 mysql.ColumnInteger
	Buffer               mysql.ColumnFloat
	ClientVersionMask    mysql.ColumnInteger
	IsLdonDoor           mysql.ColumnInteger
	CloseTimerMs         mysql.ColumnInteger
	DzSwitchID           mysql.ColumnInteger
	MinExpansion         mysql.ColumnInteger
	MaxExpansion         mysql.ColumnInteger
	ContentFlags         mysql.ColumnString
	ContentFlagsDisabled mysql.ColumnString

	AllColumns     mysql.ColumnList
	MutableColumns mysql.ColumnList
	DefaultColumns mysql.ColumnList
}

type DoorsTable struct {
	doorsTable

	NEW doorsTable
}

// AS creates new DoorsTable with assigned alias
func (a DoorsTable) AS(alias string) *DoorsTable {
	return newDoorsTable(a.SchemaName(), a.TableName(), alias)
}

// Schema creates new DoorsTable with assigned schema name
func (a DoorsTable) FromSchema(schemaName string) *DoorsTable {
	return newDoorsTable(schemaName, a.TableName(), a.Alias())
}

// WithPrefix creates new DoorsTable with assigned table prefix
func (a DoorsTable) WithPrefix(prefix string) *DoorsTable {
	return newDoorsTable(a.SchemaName(), prefix+a.TableName(), a.TableName())
}

// WithSuffix creates new DoorsTable with assigned table suffix
func (a DoorsTable) WithSuffix(suffix string) *DoorsTable {
	return newDoorsTable(a.SchemaName(), a.TableName()+suffix, a.TableName())
}

func newDoorsTable(schemaName, tableName, alias string) *DoorsTable {
	return &DoorsTable{
		doorsTable: newDoorsTableImpl(schemaName, tableName, alias),
		NEW:        newDoorsTableImpl("", "new", ""),
	}
}

func newDoorsTableImpl(schemaName, tableName, alias string) doorsTable {
	var (
		IDColumn                   = mysql.IntegerColumn("id")
		DooridColumn               = mysql.IntegerColumn("doorid")
		ZoneColumn                 = mysql.StringColumn("zone")
		VersionColumn              = mysql.IntegerColumn("version")
		NameColumn                 = mysql.StringColumn("name")
		PosYColumn                 = mysql.FloatColumn("pos_y")
		PosXColumn                 = mysql.FloatColumn("pos_x")
		PosZColumn                 = mysql.FloatColumn("pos_z")
		HeadingColumn              = mysql.FloatColumn("heading")
		OpentypeColumn             = mysql.IntegerColumn("opentype")
		GuildColumn                = mysql.IntegerColumn("guild")
		LockpickColumn             = mysql.IntegerColumn("lockpick")
		KeyitemColumn              = mysql.IntegerColumn("keyitem")
		NokeyringColumn            = mysql.IntegerColumn("nokeyring")
		TriggerdoorColumn          = mysql.IntegerColumn("triggerdoor")
		TriggertypeColumn          = mysql.IntegerColumn("triggertype")
		DisableTimerColumn         = mysql.IntegerColumn("disable_timer")
		DoorisopenColumn           = mysql.IntegerColumn("doorisopen")
		DoorParamColumn            = mysql.IntegerColumn("door_param")
		DestZoneColumn             = mysql.StringColumn("dest_zone")
		DestInstanceColumn         = mysql.IntegerColumn("dest_instance")
		DestXColumn                = mysql.FloatColumn("dest_x")
		DestYColumn                = mysql.FloatColumn("dest_y")
		DestZColumn                = mysql.FloatColumn("dest_z")
		DestHeadingColumn          = mysql.FloatColumn("dest_heading")
		InvertStateColumn          = mysql.IntegerColumn("invert_state")
		InclineColumn              = mysql.IntegerColumn("incline")
		SizeColumn                 = mysql.IntegerColumn("size")
		BufferColumn               = mysql.FloatColumn("buffer")
		ClientVersionMaskColumn    = mysql.IntegerColumn("client_version_mask")
		IsLdonDoorColumn           = mysql.IntegerColumn("is_ldon_door")
		CloseTimerMsColumn         = mysql.IntegerColumn("close_timer_ms")
		DzSwitchIDColumn           = mysql.IntegerColumn("dz_switch_id")
		MinExpansionColumn         = mysql.IntegerColumn("min_expansion")
		MaxExpansionColumn         = mysql.IntegerColumn("max_expansion")
		ContentFlagsColumn         = mysql.StringColumn("content_flags")
		ContentFlagsDisabledColumn = mysql.StringColumn("content_flags_disabled")
		allColumns                 = mysql.ColumnList{IDColumn, DooridColumn, ZoneColumn, VersionColumn, NameColumn, PosYColumn, PosXColumn, PosZColumn, HeadingColumn, OpentypeColumn, GuildColumn, LockpickColumn, KeyitemColumn, NokeyringColumn, TriggerdoorColumn, TriggertypeColumn, DisableTimerColumn, DoorisopenColumn, DoorParamColumn, DestZoneColumn, DestInstanceColumn, DestXColumn, DestYColumn, DestZColumn, DestHeadingColumn, InvertStateColumn, InclineColumn, SizeColumn, BufferColumn, ClientVersionMaskColumn, IsLdonDoorColumn, CloseTimerMsColumn, DzSwitchIDColumn, MinExpansionColumn, MaxExpansionColumn, ContentFlagsColumn, ContentFlagsDisabledColumn}
		mutableColumns             = mysql.ColumnList{DooridColumn, ZoneColumn, VersionColumn, NameColumn, PosYColumn, PosXColumn, PosZColumn, HeadingColumn, OpentypeColumn, GuildColumn, LockpickColumn, KeyitemColumn, NokeyringColumn, TriggerdoorColumn, TriggertypeColumn, DisableTimerColumn, DoorisopenColumn, DoorParamColumn, DestZoneColumn, DestInstanceColumn, DestXColumn, DestYColumn, DestZColumn, DestHeadingColumn, InvertStateColumn, InclineColumn, SizeColumn, BufferColumn, ClientVersionMaskColumn, IsLdonDoorColumn, CloseTimerMsColumn, DzSwitchIDColumn, MinExpansionColumn, MaxExpansionColumn, ContentFlagsColumn, ContentFlagsDisabledColumn}
		defaultColumns             = mysql.ColumnList{DooridColumn, VersionColumn, NameColumn, PosYColumn, PosXColumn, PosZColumn, HeadingColumn, OpentypeColumn, GuildColumn, LockpickColumn, KeyitemColumn, NokeyringColumn, TriggerdoorColumn, TriggertypeColumn, DisableTimerColumn, DoorisopenColumn, DoorParamColumn, DestZoneColumn, DestInstanceColumn, DestXColumn, DestYColumn, DestZColumn, DestHeadingColumn, InvertStateColumn, InclineColumn, SizeColumn, BufferColumn, ClientVersionMaskColumn, IsLdonDoorColumn, CloseTimerMsColumn, DzSwitchIDColumn, MinExpansionColumn, MaxExpansionColumn}
	)

	return doorsTable{
		Table: mysql.NewTable(schemaName, tableName, alias, allColumns...),

		//Columns
		ID:                   IDColumn,
		Doorid:               DooridColumn,
		Zone:                 ZoneColumn,
		Version:              VersionColumn,
		Name:                 NameColumn,
		PosY:                 PosYColumn,
		PosX:                 PosXColumn,
		PosZ:                 PosZColumn,
		Heading:              HeadingColumn,
		Opentype:             OpentypeColumn,
		Guild:                GuildColumn,
		Lockpick:             LockpickColumn,
		Keyitem:              KeyitemColumn,
		Nokeyring:            NokeyringColumn,
		Triggerdoor:          TriggerdoorColumn,
		Triggertype:          TriggertypeColumn,
		DisableTimer:         DisableTimerColumn,
		Doorisopen:           DoorisopenColumn,
		DoorParam:            DoorParamColumn,
		DestZone:             DestZoneColumn,
		DestInstance:         DestInstanceColumn,
		DestX:                DestXColumn,
		DestY:                DestYColumn,
		DestZ:                DestZColumn,
		DestHeading:          DestHeadingColumn,
		InvertState:          InvertStateColumn,
		Incline:              InclineColumn,
		Size:                 SizeColumn,
		Buffer:               BufferColumn,
		ClientVersionMask:    ClientVersionMaskColumn,
		IsLdonDoor:           IsLdonDoorColumn,
		CloseTimerMs:         CloseTimerMsColumn,
		DzSwitchID:           DzSwitchIDColumn,
		MinExpansion:         MinExpansionColumn,
		MaxExpansion:         MaxExpansionColumn,
		ContentFlags:         ContentFlagsColumn,
		ContentFlagsDisabled: ContentFlagsDisabledColumn,

		AllColumns:     allColumns,
		MutableColumns: mutableColumns,
		DefaultColumns: defaultColumns,
	}
}
