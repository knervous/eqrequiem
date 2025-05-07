package qeynos

import (
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
}
