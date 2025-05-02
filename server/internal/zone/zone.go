package zone

import (
	"fmt"
	"knervous/eqgo/internal/message"
	"knervous/eqgo/internal/session"
	"sync"
	"time"
)

type ClientEntry struct {
	ClientSession *session.Session
}

type ZoneInstance struct {
	ZoneID     int
	InstanceID int
	Clients    map[int]ClientEntry
	Quit       chan struct{}
	wg         sync.WaitGroup
	registry   *HandlerRegistry
	mutex      sync.RWMutex
}

func NewZoneInstance(zoneID, instanceID int) *ZoneInstance {
	zoneRegistry := NewZoneOpCodeRegistry(zoneID)
	z := &ZoneInstance{
		ZoneID:     zoneID,
		InstanceID: instanceID,
		Quit:       make(chan struct{}),
		Clients:    make(map[int]ClientEntry),
		registry:   zoneRegistry,
	}
	z.wg.Add(1)
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
