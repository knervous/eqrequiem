package qeynos

import (
	"fmt"

	"github.com/knervous/eqgo/quests"
)

func init() {
	ZoneQuests.Npc["Captain_Tillin"] = quests.Register(
		quests.EVENT_SAY, func(e *quests.QuestEvent) bool {
			fmt.Println("Got event say from Captain Tillin")
			return true
		},
		quests.EVENT_AGGRO, func(e *quests.QuestEvent) bool {
			// ...
			return true
		},
	)
}
