//go:build dev
// +build dev

package questregistry

import (
	"log"
	"os"
	"path/filepath"
	"testing"

	"github.com/knervous/eqgo/internal/quest"
	entity "github.com/knervous/eqgo/internal/zone/interface"
)

var questInterface *quest.ZoneQuestInterface
var questEvent *quest.QuestEvent
var npc entity.NPC

func init() {
	testDir, err := os.Getwd()
	if err != nil {
		log.Fatalf("Failed to get test directory: %v", err)
	}

	serverDir := filepath.Join(testDir, "..", "..", "..")
	serverDir, err = filepath.Abs(serverDir)
	if err != nil {
		log.Fatalf("Failed to resolve server directory: %v", err)
	}

	err = os.Chdir(serverDir)
	if err != nil {
		log.Fatalf("Failed to set CWD to %s: %v", serverDir, err)
	}

	cwd, _ := os.Getwd()
	log.Printf("[dev] Set CWD to: %s", cwd)
	questInterface = GetQuestInterface("qeynos")
	questEvent = &quest.QuestEvent{}
	// npc = &clientz.NPC{
	// 	NpcData: &model.NpcTypes{
	// 		Name: "Captaaaain Tillin",
	// 	},
	// }
}

func BenchmarkQuestInvoke(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		questEvent.Reset()
		questEvent.Type(quest.EventSay)
		questEvent.SetActor(npc)
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
