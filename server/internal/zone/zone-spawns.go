package zone

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
)

// respawnNpc selects an NPC type from the SpawnPoolEntry based on spawnentry chances and returns it.
// Returns an error if no NPC can be selected (e.g., empty entries or invalid chances).
func respawnNpc(entry db_zone.SpawnPoolEntry) (*model.NpcTypes, error) {
	// Check if there are any spawn entries
	if len(entry.SpawnEntries) == 0 {
		return nil, fmt.Errorf("no spawn entries available for spawngroup %d", entry.SpawnGroup.ID)
	}

	// Seed random number generator (do this once in a real application, e.g., in init())
	rand.Seed(time.Now().UnixNano())

	// Calculate total chance
	totalChance := int16(0)
	for _, se := range entry.SpawnEntries {
		if se.SpawnEntry == nil || se.NPCType == nil {
			continue
		}
		totalChance += se.SpawnEntry.Chance
	}

	if totalChance <= 0 {
		return nil, fmt.Errorf("invalid total chance (%d) for spawngroup %d", totalChance, entry.SpawnGroup.ID)
	}

	// Generate random number between 0 and totalChance
	roll := rand.Intn(int(totalChance))

	// Select NPC based on chance
	current := int16(0)
	for _, se := range entry.SpawnEntries {
		if se.SpawnEntry == nil || se.NPCType == nil {
			continue
		}
		current += se.SpawnEntry.Chance
		if roll < int(current) {
			return se.NPCType, nil
		}
	}

	// Fallback: return the last valid NPC type if rounding errors occur
	for i := len(entry.SpawnEntries) - 1; i >= 0; i-- {
		if entry.SpawnEntries[i].SpawnEntry != nil && entry.SpawnEntries[i].NPCType != nil {
			return entry.SpawnEntries[i].NPCType, nil
		}
	}

	return nil, fmt.Errorf("failed to select NPC for spawngroup %d", entry.SpawnGroup.ID)
}
