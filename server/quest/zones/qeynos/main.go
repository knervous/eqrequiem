package qeynos

import "github.com/knervous/eqgo/quest"

func RegisterZone() *quest.ZoneQuestInterface {
	zq := &quest.ZoneQuestInterface{}
	registerNpcQuests(zq)
	return zq
}
