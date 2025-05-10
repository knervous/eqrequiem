package zone

import (
	"fmt"
	"math/rand"
	"time"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/session"
)

func (z *ZoneInstance) processSpawns() {
	z.mutex.Lock()
	defer z.mutex.Unlock()

	now := time.Now()
	for spawn2ID, entry := range z.ZonePool {
		if _, exists := z.spawn2ToNpc[spawn2ID]; exists {
			continue
		}
		nextSpawnTime, exists := z.spawnTimers[spawn2ID]
		if !exists || now.After(nextSpawnTime) {
			npcType, err := respawnNpc(*entry)
			if err != nil {
				fmt.Printf("Failed to respawn NPC for Spawn2 %d: %v\n", spawn2ID, err)
				continue
			}
			npcID := z.nextNpcID
			z.nextNpcID++
			npc := &entity.NPC{
				NpcData: *npcType,
				Mob: entity.Mob{
					Spawn2:  *entry.Spawn2,
					MobID:   npcID,
					MobName: npcType.Name,
					Position: entity.MobPosition{
						X:       float32(entry.Spawn2.X),
						Y:       float32(entry.Spawn2.Y),
						Z:       float32(entry.Spawn2.Z),
						Heading: float32(entry.Spawn2.Heading),
					},
				},
			}
			z.Npcs[npcID] = npc
			z.spawn2ToNpc[spawn2ID] = npcID
			z.spawnTimers[spawn2ID] = now.Add(24 * time.Hour)

			fmt.Printf("Spawned NPC %s (ID: %d) at Spawn2 %d (%.2f, %.2f, %.2f)\n",
				npcType.Name, npcID, spawn2ID, entry.Spawn2.X, entry.Spawn2.Y, entry.Spawn2.Z)

			// // Copy clients to avoid holding lock during message sending
			// clients := make([]*session.Session, 0, len(z.Clients))
			// for _, client := range z.Clients {
			// 	clients = append(clients, client.ClientSession)
			// }

			for _, client := range z.Clients {
				err := session.QueueMessage(
					client.ClientSession,
					eq.NewRootSpawn,
					opcodes.ZoneSpawns,
					func(spawn eq.Spawn) error {
						spawn.SetRace(int32(npcType.Race))
						spawn.SetCharClass(int32(npcType.Class))
						spawn.SetLevel(int32(npcType.Level))
						spawn.SetName(npcType.Name)
						spawn.SetSpawnId(int32(npcID))
						spawn.SetX(int32(entry.Spawn2.X))
						spawn.SetY(int32(entry.Spawn2.Y))
						spawn.SetZ(int32(entry.Spawn2.Z))
						spawn.SetHeading(int32(entry.Spawn2.Heading))
						return nil
					},
				)
				if err != nil {
					fmt.Printf("Failed to send spawn message to session %d: %v\n", client.ClientSession.SessionID, err)
				}
			}
		}
	}
}

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
