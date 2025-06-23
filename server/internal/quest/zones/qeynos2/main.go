package qeynos2

import "github.com/knervous/eqgo/internal/quest"

func RegisterZone() *quest.ZoneQuestInterface {
	zq := &quest.ZoneQuestInterface{}
	registerNpcQuests(zq)
	registerZoneQuests(zq)
	return zq
}
