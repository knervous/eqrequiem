package qeynos2

import (
	"fmt"

	"github.com/knervous/eqgo/quest"
)

func registerNpcQuests(zq *quest.ZoneQuestInterface) {
	zq.Register(
		"Guard_Gehnus",
		quest.EventSay, func(e *quest.QuestEvent) bool {
			fmt.Println("Got event say from Guard_Gehnus")
			return true
		},
		quest.EventAggro, func(e *quest.QuestEvent) bool {
			return true
		},
	)
}
