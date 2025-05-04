package qeynos

import "github.com/knervous/eqgo/internal/quest"

func RegisterZone() *quest.ZoneQuestInterface {
	zq := &quest.ZoneQuestInterface{}
	registerNpcQuests(zq)
	return zq
}
