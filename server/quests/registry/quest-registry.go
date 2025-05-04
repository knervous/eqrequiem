//go:build !dev
// +build !dev

package questregistry

import (
	"github.com/knervous/eqgo/quests"
	"github.com/knervous/eqgo/quests/zones/qeynos"
	"github.com/knervous/eqgo/quests/zones/qeynos2"
)

var questRegistry = [...]*quests.ZoneQuestInterface{
	qeynos.ZoneQuests,
	qeynos2.ZoneQuests,
}

func GetQuestInterface(key quests.ZoneIndex, zoneName string) *quests.ZoneQuestInterface {
	// Zone ID starts at 1
	idx := key - 1
	if idx >= quests.MaxZoneIndex {
		return nil
	}
	return questRegistry[idx]
}
