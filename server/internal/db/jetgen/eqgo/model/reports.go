//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type Reports struct {
	ID           uint32 `sql:"primary_key"`
	Name         *string
	Reported     *string
	ReportedText *string
}
