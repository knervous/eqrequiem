package zone

import (
	"fmt"
	"knervous/eqgo/internal/message"
	"sync"
	"time"
)

type ZoneInstance struct {
	ZoneID     int
	InstanceID int
	Inbox      chan message.ClientMessage
	Quit       chan struct{}
	wg         sync.WaitGroup
	registry   *HandlerRegistry
}

func NewZoneInstance(zoneID, instanceID int) *ZoneInstance {
	zoneRegistry := NewZoneOpCodeRegistry(zoneID)
	z := &ZoneInstance{
		ZoneID:     zoneID,
		InstanceID: instanceID,
		Inbox:      make(chan message.ClientMessage, 128),
		Quit:       make(chan struct{}),
		registry:   zoneRegistry,
	}
	z.wg.Add(1)
	go z.run()
	return z
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
		case msg := <-z.Inbox:
			z.registry.HandleZonePacket(msg)
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
