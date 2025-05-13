package zone

import (
	"context"
	"fmt"
	"sync"
	"time"

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
	EntityId      int
}

// packet represents a client packet to be processed.
type packet struct {
	session *session.Session
	data    []byte
}

// ZoneInstance manages a zone instance, including clients, NPCs, and spawning.
type ZoneInstance struct {
	Zone          *model.Zone
	ZoneID        int
	InstanceID    int
	ClientEntries map[int]ClientEntry
	Quit          chan struct{}

	QuestInterface *quest.ZoneQuestInterface

	// Entities
	ZonePool    map[int64]*db_zone.SpawnPoolEntry
	Npcs        map[int]*entity.NPC
	npcsByName  map[string]*entity.NPC // name → NPC
	clientsById map[int]*entity.Client

	// spatial-grid bookkeeping:
	entityCell map[int]int64
	bucketMap  map[int64]map[int]struct{}
	subs       map[int]map[int]struct{} // still per‐entity subscriber lists

	dirtyEntities []int // list of npcIDs that moved this tick

	// Grid
	gridEntries map[int64][]*model.GridEntries

	spawnTimers  map[int64]time.Time // Maps Spawn2.ID to next spawn time
	spawn2ToNpc  map[int64]int       // Maps Spawn2.ID to NPC ID (if spawned)
	nextEntityID int                 // Incremental NPC ID generator

	wg         sync.WaitGroup
	registry   *HandlerRegistry
	mutex      sync.RWMutex
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

	// Grid entries
	gridEntries, err := db_zone.GetZoneGridEntries(zone.ID)
	if err != nil {
		fmt.Println("Error getting grid entries:", err)
		return nil
	}

	// Register quests
	QuestInterface := questregistry.GetQuestInterface(*zone.ShortName)

	z := &ZoneInstance{
		Zone:           zone,
		ZoneID:         zoneID,
		InstanceID:     instanceID,
		Quit:           make(chan struct{}),
		ClientEntries:  make(map[int]ClientEntry),
		ZonePool:       zonePool,
		QuestInterface: QuestInterface,
		Npcs:           make(map[int]*entity.NPC),
		npcsByName:     make(map[string]*entity.NPC),
		clientsById:    make(map[int]*entity.Client),

		// Grid processing
		entityCell:    make(map[int]int64),
		subs:          make(map[int]map[int]struct{}),
		bucketMap:     make(map[int64]map[int]struct{}),
		dirtyEntities: make([]int, 0, 256),

		gridEntries:  gridEntries,
		spawnTimers:  spawnTimers,
		spawn2ToNpc:  make(map[int64]int),
		nextEntityID: 1,
		registry:     zoneRegistry,
		questEvent:   &quest.QuestEvent{},
		backlog:      make([]packet, 0, 1024),
		notify:       make(chan struct{}, 1),
	}

	// Quest Interface
	if QuestInterface == nil {
		fmt.Printf("[Zone %d·Inst %d :: Name %s] failed to get quest interface\n", zoneID, instanceID, *zone.ShortName)
	} else {
		z.QuestInterface.SetZoneAccess(z) // Add this
	}
	if questregistry.IsDev() {
		questregistry.RegisterReload(*zone.ShortName, func(qi *quest.ZoneQuestInterface) {
			z.QuestInterface = qi
			z.QuestInterface.SetZoneAccess(z)
			z.BroadcastServerMessage("Quests were hot reloaded")

		})
	}
	z.wg.Add(1)
	z.processSpawns()
	go z.run()
	return z
}

// QE returns the quest event for the zone.
func (z *ZoneInstance) QE() *quest.QuestEvent {
	qe := z.questEvent.Reset()
	qe.ZoneAccess = z
	return qe
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
	nextId := z.nextEntityID
	z.nextEntityID++
	z.ClientEntries[sessionID] = ClientEntry{
		ClientSession: clientSession,
		EntityId:      nextId,
	}
	z.clientsById[nextId] = clientSession.Client
	z.registerNewClientGrid(sessionID, clientSession.Client.GetPosition())

	fmt.Printf("Added client session %d to zone %d instance %d\n", sessionID, z.ZoneID, z.InstanceID)
}

// HandleClientPacket queues a client packet for processing.
func (z *ZoneInstance) HandleClientPacket(ses *session.Session, data []byte) {
	z.mutex.RLock()
	_, exists := z.ClientEntries[ses.SessionID]
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

func (z *ZoneInstance) RemoveClient(sessionID int) {
	z.mutex.Lock()
	defer z.mutex.Unlock()
	fmt.Println("Removing client session", sessionID)
	delete(z.ClientEntries, sessionID)
	delete(z.clientsById, sessionID)
}

// run is the main loop for the zone instance.
func (z *ZoneInstance) run() {
	defer z.wg.Done()
	zoneLoop := time.NewTicker(50 * time.Millisecond)
	defer zoneLoop.Stop()
	worldTick := time.NewTicker(6 * time.Second)
	defer worldTick.Stop()
	fmt.Printf("[Zone %d·Inst %d] started\n", z.ZoneID, z.InstanceID)

	for {
		select {
		case <-worldTick.C:
			// World tick tasks (e.g., global updates)
		case <-zoneLoop.C:
			z.processSpawns()
			z.FlushUpdates()
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
