package zone

import (
	"fmt"
	"math"
	"math/rand"
	"time"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/ports/client"
	"github.com/knervous/eqgo/internal/session"
)

// spawnTick handles NPC movement along its pathgrid, updates its velocity,
// and ensures a final update when transitioning from moving to stopped.
func (z *ZoneInstance) spawnTick(now time.Time, npc client.NPC) {
	if len(npc.GridEntries()) == 0 {
		return
	}
	// 1) still pausing?
	if now.Before(npc.PauseUntil()) {
		npc.SetLastUpdate(now)
		return
	}

	// 2) save old pos and velocity for movement and transition check
	oldX, oldY, oldZ := npc.Mob().X, npc.Mob().Y, npc.Mob().Z
	oldVel := npc.Mob().GetVelocity()

	// 3) interpolation logic
	target := npc.CurrentGridEntry()
	tx, ty, tz := target.X, target.Y, target.Z
	delta := now.Sub(npc.LastUpdate()).Seconds()
	npc.SetLastUpdate(now)

	dx := tx - oldX
	dy := ty - oldY
	dz := tz - oldZ
	distSq := dx*dx + dy*dy + dz*dz

	if distSq == 0 {
		// arrived → zero velocity, schedule pause, advance index
		npc.SetVelocity(client.Velocity{X: 0, Y: 0, Z: 0})
		pause := npc.CurrentGridEntry().Pause
		npc.SetPauseUntil(now.Add(time.Duration(pause) * time.Second))
		npc.SetGridIndex((npc.GridIndex() + 1) % len(npc.GridEntries()))

	} else {
		dist := math.Sqrt(float64(distSq))
		moveAmt := float64(npc.Speed()) * 5 * delta
		if moveAmt >= dist {
			npc.Mob().X, npc.Mob().Y, npc.Mob().Z = tx, ty, tz
			pause := npc.CurrentGridEntry().Pause
			npc.SetPauseUntil(now.Add(time.Duration(pause) * time.Second))
			npc.SetGridIndex((npc.GridIndex() + 1) % len(npc.GridEntries()))

		} else {
			frac := moveAmt / dist
			npc.Mob().X += dx * frac
			npc.Mob().Y += dy * frac
			npc.Mob().Z += dz * frac
		}
		// compute and set velocity based on movement
		vx := (npc.Mob().X - oldX) / (delta)
		vy := (npc.Mob().Y - oldY) / (delta)
		vz := (npc.Mob().Z - oldZ) / (delta)
		npc.SetVelocity(client.Velocity{X: vx, Y: vy, Z: vz})

		// update heading
		npc.Mob().Heading = math.Atan2(
			npc.Mob().Y-oldY,
			npc.Mob().X-oldX,
		) * (180.0 / math.Pi)
	}

	// Todo don't need to send NPC updates if velocity hasn't changed
	// and bucket hasn't changed, do this in zone-movement.go

	// 4) if velocity transitioned from moving to stopped, emit one final update
	newVel := npc.Velocity()
	wasMoving := oldVel.X != 0 || oldVel.Y != 0 || oldVel.Z != 0
	stoppedNow := newVel.X == 0 && newVel.Y == 0 && newVel.Z == 0
	if wasMoving && stoppedNow {
		z.markMoved(npc.ID(), npc.Position())
	}

	// 5) mark moved if position changed
	if npc.Mob().X != oldX || npc.Mob().Y != oldY || npc.Mob().Z != oldZ {
		z.markMoved(npc.ID(), npc.Position())
	}
}

func (z *ZoneInstance) processSpawns() {
	z.mutex.Lock()
	defer z.mutex.Unlock()

	now := time.Now()
	for spawn2ID, entry := range z.ZonePool {
		if npcID, exists := z.spawn2ToNpc[spawn2ID]; exists {
			npc, ok := z.Npcs[npcID]
			if ok {
				z.spawnTick(now, npc)
			}
			continue
		}
		nextSpawnTime, exists := z.spawnTimers[spawn2ID]

		// Respawning
		if !exists || now.After(nextSpawnTime) {
			npcType, err := respawnNpc(*entry)
			if err != nil {
				continue
			}
			npcID := z.nextEntityID
			z.nextEntityID++
			npc := entity.NewNPC(
				client.Mob{
					Speed:   1,
					Zone:    z,
					Spawn2:  *entry.Spawn2,
					MobID:   npcID,
					MobName: npcType.Name,
				},
				npcType,
				z.gridEntries[int64(entry.Spawn2.Pathgrid)],
				1, // Start at the first grid entry
				now.Add(time.Duration(entry.Spawn2.Respawntime)*time.Millisecond),
				now, // Pause until now, will be updated in spawnTick
				now, // Last update time
			)

			z.Npcs[npcID] = npc
			z.Entities[npcID] = npc
			z.npcsByName[npcType.Name] = npc
			z.spawn2ToNpc[spawn2ID] = npcID
			z.spawnTimers[spawn2ID] = now.Add(24 * time.Hour)

			z.registerNewClientGrid(npcID, npc.Position())

			// fmt.Printf("Spawned NPC %s (ID: %d) at Spawn2 %d (%.2f, %.2f, %.2f)\n",
			// 	npcType.Name, npcID, spawn2ID, entry.Spawn2.X, entry.Spawn2.Y, entry.Spawn2.Z)

			pktBuilder := func(spawn eq.Spawn) error {
				spawn.SetRace(int32(npcType.Race))
				spawn.SetCharClass(int32(npcType.Class))
				spawn.SetLevel(int32(npcType.Level))
				spawn.SetName(npcType.Name)
				spawn.SetSize(float32(npc.Mob().Size))
				spawn.SetIsNpc(1)
				spawn.SetSpawnId(int32(npcID))
				spawn.SetX(int32(entry.Spawn2.X))
				spawn.SetY(int32(entry.Spawn2.Y))
				spawn.SetGender(int32(npcType.Gender))
				spawn.SetZ(int32(entry.Spawn2.Z))
				spawn.SetFace(int32(npcType.Face))
				spawn.SetHelm(int32(npcType.Helmtexture))
				spawn.SetBodytype(int32(npcType.Bodytype))
				spawn.SetEquipChest(int32(npcType.Texture))
				spawn.SetHeading(int32(entry.Spawn2.Heading))
				c := worldToCell(npc.Mob().X, npc.Mob().Y, npc.Mob().Z)
				spawn.SetCellX(int32(c[0]))
				spawn.SetCellY(int32(c[1]))
				spawn.SetCellZ(int32(c[2]))
				return nil
			}
			for _, client := range z.ClientEntries {
				if npc.ID() == client.EntityId {
					// Skip the player character spawn
					continue
				}
				err := session.QueueMessage(
					client.ClientSession,
					eq.NewRootSpawn,
					opcodes.ZoneSpawns,
					pktBuilder,
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

// DespawnNPC removes a live NPC from the zone, notifies clients, and
// frees up its spawn point for the next respawn.
func (z *ZoneInstance) DespawnNPC(npcID int) error {
	z.mutex.Lock()
	defer z.mutex.Unlock()

	// 1) Find the NPC
	npc, ok := z.Npcs[npcID]
	if !ok {
		return fmt.Errorf("NPC with ID %d not found", npcID)
	}

	// 2) Broadcast despawn to all clients
	for _, client := range z.ClientEntries {
		if err := session.QueueMessage(
			client.ClientSession,
			eq.NewRootDeleteSpawn, // builder for a Despawn message
			opcodes.DeleteSpawn,   // your zone‐despawn opcode
			func(d eq.DeleteSpawn) error {
				d.SetSpawnId(int32(npcID))
				return nil
			},
		); err != nil {
			fmt.Printf("Failed to send despawn to session %d: %v\n",
				client.ClientSession.SessionID, err)
		}
	}

	// 3) Tear down local indices

	// a) Remove from the ID→NPC map
	delete(z.Npcs, npcID)

	// b) Remove from the name index (only if it’s the same instance)
	if existing, exists := z.npcsByName[npc.Name()]; exists && existing.ID() == npcID {
		delete(z.npcsByName, npc.Name())
	}

	// c) Free up the spawn2ID → npcID mapping so the next spawn can run
	for spawn2ID, id := range z.spawn2ToNpc {
		if id == npcID {
			delete(z.spawn2ToNpc, spawn2ID)
			break
		}
	}

	return nil
}
