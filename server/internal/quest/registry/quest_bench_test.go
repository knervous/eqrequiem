//go:build !dev
// +build !dev

package questregistry

import (
	"testing"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/quest"
)

var questInterface *quest.ZoneQuestInterface
var questEvent *quest.QuestEvent
var npc *entity.NPC

func init() {
	questInterface = GetQuestInterface("qeynos")
	questEvent = &quest.QuestEvent{}
	npc = &entity.NPC{
		NpcData: model.NpcTypes{
			Name: "Captaaaain Tillin",
		},
	}
}

func BenchmarkQuestInvoke(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		questEvent.EventType = quest.EventSay
		questEvent.Actor = npc
		questInterface.Invoke("Captain_Tillin", questEvent)
	}
}

func BenchmarkNonExistQuestInvoke(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		questEvent.EventType = quest.EventSay
		questEvent.Actor = npc
		questInterface.Invoke("Captain_Tulane", questEvent)
	}
}
