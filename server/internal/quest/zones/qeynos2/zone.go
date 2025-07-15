package qeynos2

import (
	"fmt"

	"github.com/knervous/eqgo/internal/quest"
	"github.com/knervous/eqgo/internal/zone/npc"
)

func registerZoneQuests(zq *quest.ZoneQuestInterface) {
	zq.Register(
		"",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			switch e.Receiver.(type) {
			case *npc.NPC:
				if e.Receiver == nil || e.Actor == nil {
					return false
				}
				greetings := fmt.Sprintf("Hello, %s! My name is %s", e.Actor.Name(), e.Receiver.Name())
				e.Receiver.Say(greetings)
			}
			switch e.Actor.(type) {
			case *npc.NPC:
				return true

			default:
				return false
			}
		},
	)
}
