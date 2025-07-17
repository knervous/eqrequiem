package zone

import (
	"encoding/base64"
	"encoding/json"

	"log"
)

type CommandType int32

const (
	CommandTypeLink CommandType = iota
	CommandTypeSummon
)

type JsonCommandLink struct {
	LinkType CommandType `json:"linkType"`
	Label    string      `json:"label"`
	Data     interface{} `json:"data"`
}

func (z *ZoneInstance) createJsonCommandLink(linkType CommandType, label string, data interface{}) string {
	link := JsonCommandLink{
		LinkType: linkType,
		Label:    label,
		Data:     data,
	}

	jsonData, err := json.Marshal(link)
	if err != nil {
		log.Printf("failed to marshal command link: %v", err)
		return ""
	}

	return "{{" + base64.StdEncoding.EncodeToString(jsonData) + "}}"
}
