//go:build !dev
// +build !dev

package questregistry

import (
	"fmt"
	"sync"

	"github.com/knervous/eqgo/internal/quest"
	"github.com/knervous/eqgo/internal/quest/zones/qeynos"
	"github.com/knervous/eqgo/internal/quest/zones/qeynos2"
)

var (
	mu             sync.RWMutex
	questRegistry  = make(map[string]*quest.ZoneQuestInterface)
	zoneConstructs = map[string]func() *quest.ZoneQuestInterface{
		"qeynos":  qeynos.RegisterZone,
		"qeynos2": qeynos2.RegisterZone,
	}
)

func IsDev() bool {
	return false
}

func RegisterReload(zoneName string, callback func(*quest.ZoneQuestInterface)) {

}

// GetQuestInterface returns the cached or newly constructed quest data for a zone
func GetQuestInterface(zoneName string) *quest.ZoneQuestInterface {
	mu.RLock()
	q, ok := questRegistry[zoneName]
	mu.RUnlock()
	if ok {
		return q
	}

	// Construct if available
	constructor, found := zoneConstructs[zoneName]
	if !found {
		fmt.Printf("No constructor found for zone: %s\n", zoneName)
		return nil
	}

	newQuest := constructor()

	mu.Lock()
	questRegistry[zoneName] = newQuest
	mu.Unlock()

	return newQuest
}
