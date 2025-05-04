package qeynos

import (
	"fmt"

	entity "github.com/knervous/eqgo/internal/entities"
	"github.com/knervous/eqgo/quest"
)

func registerNpcQuests(zq *quest.ZoneQuestInterface) {
	zq.Register(
		"Captain_Tillin",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			fmt.Println("Got event say from Captain Tillin")
			if npc, ok := e.Actor.(*entity.NPC); ok {
				fmt.Println("Actor is an NPC:", npc.MobName)
			}
			return true
		},
		quest.EventAggro, func(e *quest.QuestEvent) bool {
			return true
		},
	)
}
