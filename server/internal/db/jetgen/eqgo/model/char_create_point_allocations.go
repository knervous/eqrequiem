//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type CharCreatePointAllocations struct {
	ID       uint32 `sql:"primary_key"`
	BaseStr  uint32
	BaseSta  uint32
	BaseDex  uint32
	BaseAgi  uint32
	BaseInt  uint32
	BaseWis  uint32
	BaseCha  uint32
	AllocStr uint32
	AllocSta uint32
	AllocDex uint32
	AllocAgi uint32
	AllocInt uint32
	AllocWis uint32
	AllocCha uint32
}
