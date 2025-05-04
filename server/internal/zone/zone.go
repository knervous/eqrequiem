package zone

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/message"
	"github.com/knervous/eqgo/internal/quest"
	questregistry "github.com/knervous/eqgo/internal/quest/registry"
	"github.com/knervous/eqgo/internal/session"
)

type ClientEntry struct {
	ClientSession *session.Session
}

type ZoneInstance struct {
	Zone       *model.Zone
	ZoneID     int
	InstanceID int
	Clients    map[int]ClientEntry
	Quit       chan struct{}
	wg         sync.WaitGroup
	registry   *HandlerRegistry
	mutex      sync.RWMutex
}

var zoneQuestInterface *quest.ZoneQuestInterface = nil

func NewZoneInstance(zoneID, instanceID int) *ZoneInstance {
	zoneRegistry := NewZoneOpCodeRegistry(zoneID)
	zone, err := db_zone.GetZoneById(context.Background(), zoneID)
	if err != nil {
		return nil
	}
	z := &ZoneInstance{
		Zone:       zone,
		ZoneID:     zoneID,
		InstanceID: instanceID,
		Quit:       make(chan struct{}),
		Clients:    make(map[int]ClientEntry),
		registry:   zoneRegistry,
	}
	z.wg.Add(1)
	spawnZone(zone)
	go z.run()
	return z
}

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

func (z *ZoneInstance) HandleClientPacket(msg message.ClientMessage) {
	// Fast read-only check for existence
	z.mutex.RLock()
	_, exists := z.Clients[msg.SessionID]
	z.mutex.RUnlock()

	if !exists {
		z.AddClient(msg.SessionID)
	}

	z.registry.HandleZonePacket(msg)
}

func (z *ZoneInstance) run() {
	defer z.wg.Done()
	zoneLoop := time.NewTicker(50 * time.Millisecond)
	defer zoneLoop.Stop()
	worldTick := time.NewTicker(50 * time.Millisecond)
	defer worldTick.Stop()
	fmt.Printf("[Zone %d·Inst %d] started\n", z.ZoneID, z.InstanceID)

	// Register quests
	zoneQuestInterface = questregistry.GetQuestInterface(*z.Zone.ShortName)

	zoneQuestInterface.Invoke("Captain_Tillin", &quest.QuestEvent{
		EventType: quest.EventSay,
		Actor: &entity.NPC{
			NpcData: model.NpcTypes{
				Name: "Captaaaain Tillin",
			},
		},
		// any other data relating to event
	})

	for {
		select {
		case <-worldTick.C:
			// world tick here
		case <-zoneLoop.C:
			// z.update()
		case <-z.Quit:
			fmt.Printf("[Zone %d·Inst %d] shutting down\n", z.ZoneID, z.InstanceID)
			return
		}
	}
}

func (z *ZoneInstance) Stop() {
	close(z.Quit)
	z.wg.Wait()
}
