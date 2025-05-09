package zone

import (
	"context"
	"fmt"
	"sync"
	"time"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/quest"
	questregistry "github.com/knervous/eqgo/internal/quest/registry"
	"github.com/knervous/eqgo/internal/session"
)

// ClientEntry represents a client session in the zone.
type ClientEntry struct {
	ClientSession *session.Session
}

// packet represents a client packet to be processed.
type packet struct {
	session *session.Session
	data    []byte
}

// ZoneInstance manages a zone instance, including clients, NPCs, and spawning.
type ZoneInstance struct {
	Zone       *model.Zone
	ZoneID     int
	InstanceID int
	Clients    map[int]ClientEntry
	Quit       chan struct{}

	QuestInterface *quest.ZoneQuestInterface

	// Entities
	ZonePool    map[int64]*db_zone.SpawnPoolEntry
	Npcs        map[int]*entity.NPC
	spawnTimers map[int64]time.Time // Maps Spawn2.ID to next spawn time
	spawn2ToNpc map[int64]int       // Maps Spawn2.ID to NPC ID (if spawned)
	nextNpcID   int                 // Incremental NPC ID generator

	wg         sync.WaitGroup
	registry   *HandlerRegistry
	mutex      sync.RWMutex
	messageMu  sync.RWMutex
	questEvent *quest.QuestEvent
	backlogMu  sync.Mutex
	backlog    []packet // Unbounded FIFO
	notify     chan struct{}
}

// NewZoneInstance creates a new ZoneInstance and starts its run loop.
func NewZoneInstance(zoneID, instanceID int) *ZoneInstance {
	zoneRegistry := NewZoneOpCodeRegistry(zoneID)
	zone, err := db_zone.GetZoneById(context.Background(), zoneID)
	if err != nil {
		fmt.Println("Error getting zone:", err)
		return nil
	}
	zonePool, err := db_zone.GetZoneSpawnPool(*zone.ShortName)
	if err != nil {
		fmt.Println("Error getting zone spawn groups:", err)
		return nil
	}

	// Initialize spawn timers
	spawnTimers := make(map[int64]time.Time)
	for spawn2ID := range zonePool {
		// Set initial spawn time to now (immediate spawn)
		spawnTimers[spawn2ID] = time.Now()
	}

	// Register quests
	QuestInterface := questregistry.GetQuestInterface(*zone.ShortName)

	z := &ZoneInstance{
		Zone:           zone,
		ZoneID:         zoneID,
		InstanceID:     instanceID,
		Quit:           make(chan struct{}),
		Clients:        make(map[int]ClientEntry),
		ZonePool:       zonePool,
		QuestInterface: QuestInterface,
		Npcs:           make(map[int]*entity.NPC),

		spawnTimers: spawnTimers,
		spawn2ToNpc: make(map[int64]int),
		nextNpcID:   1,
		registry:    zoneRegistry,
		questEvent:  &quest.QuestEvent{},
		backlog:     make([]packet, 0, 1024),
		notify:      make(chan struct{}, 1),
	}
	if QuestInterface == nil {
		fmt.Printf("[Zone %d·Inst %d :: Name %s] failed to get quest interface\n", zoneID, instanceID, *zone.ShortName)
	} else {
		z.QuestInterface.SetZoneAccess(z) // Add this
	}
	if questregistry.IsDev() {
		questregistry.RegisterReload(*zone.ShortName, func(qi *quest.ZoneQuestInterface) {
			z.QuestInterface = qi
			z.QuestInterface.SetZoneAccess(z)
			z.BroadcastChannelMessage("Dev", "Quests were hot reloaded", 0)

		})
	}
	z.wg.Add(1)
	z.processSpawns()
	go z.run()
	return z
}

// QE returns the quest event for the zone.
func (z *ZoneInstance) QE() *quest.QuestEvent {
	return z.questEvent.Reset()
}

// AddClient adds a client session to the zone.
func (z *ZoneInstance) AddClient(sessionID int) {
	clientSession, ok := session.GetSessionManager().GetSession(sessionID)
	if !ok {
		fmt.Printf("failed to get session for sessionID %d\n", sessionID)
		return
	}
	z.mutex.Lock()
	defer z.mutex.Unlock()

	z.Clients[sessionID] = ClientEntry{
		ClientSession: clientSession,
	}
	fmt.Printf("Added client session %d to zone %d instance %d\n", sessionID, z.ZoneID, z.InstanceID)
}

// HandleClientPacket queues a client packet for processing.
func (z *ZoneInstance) HandleClientPacket(ses *session.Session, data []byte) {
	z.mutex.RLock()
	_, exists := z.Clients[ses.SessionID]
	z.mutex.RUnlock()

	if !exists {
		z.AddClient(ses.SessionID)
	}

	z.backlogMu.Lock()
	z.backlog = append(z.backlog, packet{ses, data})
	z.backlogMu.Unlock()

	select {
	case z.notify <- struct{}{}:
	default:
	}
}
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

			// Copy clients to avoid holding lock during message sending
			clients := make([]*session.Session, 0, len(z.Clients))
			for _, client := range z.Clients {
				clients = append(clients, client.ClientSession)
			}

			for _, client := range clients {
				err := session.QueueMessage(
					client,
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
					fmt.Printf("Failed to send spawn message to session %d: %v\n", client.SessionID, err)
				}
			}
		}
	}
}

func (z *ZoneInstance) RemoveClient(sessionID int) {
	z.mutex.Lock()
	defer z.mutex.Unlock()
	delete(z.Clients, sessionID)
}

// run is the main loop for the zone instance.
func (z *ZoneInstance) run() {
	defer z.wg.Done()
	zoneLoop := time.NewTicker(50 * time.Millisecond)
	defer zoneLoop.Stop()
	worldTick := time.NewTicker(50 * time.Millisecond)
	defer worldTick.Stop()
	fmt.Printf("[Zone %d·Inst %d] started\n", z.ZoneID, z.InstanceID)

	for {
		select {
		case <-worldTick.C:
			// World tick tasks (e.g., global updates)
		case <-zoneLoop.C:
			z.processSpawns()
			// Other zone updates (e.g., NPC AI, movement)
		case <-z.Quit:
			fmt.Printf("[Zone %d·Inst %d] shutting down\n", z.ZoneID, z.InstanceID)
			return
		case <-z.notify:
			for {
				z.backlogMu.Lock()
				if len(z.backlog) == 0 {
					z.backlogMu.Unlock()
					break
				}
				pkt := z.backlog[0]
				z.backlog = z.backlog[1:]
				z.backlogMu.Unlock()

				z.registry.HandleZonePacket(z, pkt.session, pkt.data)
			}
		}
	}
}

// Stop shuts down the zone instance.
func (z *ZoneInstance) Stop() {
	close(z.Quit)
	z.wg.Wait()
}
