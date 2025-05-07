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
	questEvent *quest.QuestEvent
}

func (z *ZoneInstance) QE() *quest.QuestEvent {
	return z.questEvent.Reset()
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
		questEvent: &quest.QuestEvent{},
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

func (z *ZoneInstance) HandleClientPacket(session *session.Session, data []byte) {
	// Fast read-only check for existence
	z.mutex.RLock()
	_, exists := z.Clients[session.SessionID]
	z.mutex.RUnlock()

	if !exists {
		z.AddClient(session.SessionID)
	}

	z.registry.HandleZonePacket(session, data)
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
	if zoneQuestInterface == nil {
		fmt.Printf("[Zone %d·Inst %d] failed to get quest interface\n", z.ZoneID, z.InstanceID)
	} else {
		zoneQuestInterface.Invoke("Captain_Tillin", z.QE().Type(quest.EventSay).SetActor(&entity.NPC{
			NpcData: model.NpcTypes{
				Name: "Captaaaain Tillin",
			},
		}))
	}

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
