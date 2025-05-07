package qeynos2

import (
	"github.com/knervous/eqgo/internal/quest"
)

func registerNpcQuests(zq *quest.ZoneQuestInterface) {
	zq.Register(
		"Guard_Gehnus",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			return true
		},
		quest.EventAggro, func(e *quest.QuestEvent) bool {
			return true
		},
	)
}
