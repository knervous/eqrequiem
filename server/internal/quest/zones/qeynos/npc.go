package qeynos

import (
	"fmt"

	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/quest"
)

func registerNpcQuests(zq *quest.ZoneQuestInterface) {
	zq.Register(
		"Captain_Tillin",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			switch e.Actor.(type) {
			case *entity.NPC:
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
		"Trumpy_Irontoe",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			greetings := fmt.Sprintf("Shaddup, %s!", e.Actor.Name())
			e.Actor.Say(greetings)
			return true
		},
		quest.EventAggro, func(e *quest.QuestEvent) bool {
			return true
		},
	)

	zq.Register(
		"Klieb_Torne",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			greetings := fmt.Sprintf("Shaddup, %s!", e.Actor.Name())
			e.Receiver.Say(greetings)
			fish := e.ZoneAccess.GetNPCByName("Fish_Ranamer")
			if fish != nil {
				fish.Say("Let the boy drink")
			}
			return true
		},
		quest.EventAggro, func(e *quest.QuestEvent) bool {
			return true
		},
	)
}
