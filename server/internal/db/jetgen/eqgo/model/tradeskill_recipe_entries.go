//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type TradeskillRecipeEntries struct {
	ID             int32 `sql:"primary_key"`
	RecipeID       int32
	ItemID         int32
	Successcount   int8
	Failcount      int8
	Componentcount int8
	Salvagecount   int8
	Iscontainer    bool
}
