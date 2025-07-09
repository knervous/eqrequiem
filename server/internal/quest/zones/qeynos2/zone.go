package qeynos2

import (
	"fmt"

	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/quest"
)

func registerZoneQuests(zq *quest.ZoneQuestInterface) {
	zq.Register(
		"",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			switch e.Receiver.(type) {
			case *entity.NPC:
				if e.Receiver == nil || e.Actor == nil {
					return false
				}
				greetings := fmt.Sprintf("Hello, %s! My name is %s", e.Actor.Name(), e.Receiver.Name())
				e.Receiver.Say(greetings)
			}
			switch e.Actor.(type) {
			case *entity.NPC:
				return true

			default:
				return false
			}
		},
	)
}
