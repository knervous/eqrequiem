//
// Code generated by go-jet DO NOT EDIT.
//
// WARNING: Changes to this file may cause incorrect behavior
// and will be lost if the code is regenerated
//

package model

type LogsysCategories struct {
	LogCategoryID          int32 `sql:"primary_key"`
	LogCategoryDescription *string
	LogToConsole           *int16
	LogToFile              *int16
	LogToGmsay             *int16
	LogToDiscord           *int16
	DiscordWebhookID       *int32
}
