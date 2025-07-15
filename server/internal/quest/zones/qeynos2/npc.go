package qeynos2

import (
	"fmt"

	"github.com/knervous/eqgo/internal/quest"
	"github.com/knervous/eqgo/internal/zone/npc"
)

func registerNpcQuests(zq *quest.ZoneQuestInterface) {
	zq.Register(
		"Guard_Gehnus",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			greetings := fmt.Sprintf("Hello, %s! How can I assist you today?", e.Actor.Name())
			e.Receiver.Say(greetings)
			switch e.Actor.(type) {
			case *npc.NPC:
				return true

			default:
				return false
			}
		},
		quest.EventAggro, func(e *quest.QuestEvent) bool {
			return true
		},
	)

	zq.Register(
		"Phin_Esrinap",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			greetings := fmt.Sprintf("Hello, %s!", e.Actor.Name())
			e.Receiver.Say(greetings)
			switch e.Actor.(type) {
			case *npc.NPC:
				return true

			default:
				return false
			}
		},
		quest.EventAggro, func(e *quest.QuestEvent) bool {
			return true
		},
	)
}
