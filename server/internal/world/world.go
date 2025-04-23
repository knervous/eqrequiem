package world

import (
	"encoding/binary"
	"fmt"
	"log"
	"sync"
	"time"

	"google.golang.org/protobuf/proto"
)

// ClientMessenger defines how to send messages back to the client.
type ClientMessenger interface {
	SendDatagram(sessionID int, opcode uint16, msg proto.Message) error
}

// ZoneMessage represents a message from a client to a zone.
type ZoneMessage struct {
	SessionID int
	Data      []byte
	Messenger ClientMessenger // For sending replies
	IP        string          // Client IP address
}

// WorldHandler manages global message routing and session-to-zone mapping.
type WorldHandler struct {
	zoneManager    *ZoneManager
	sessionManager *SessionManager // SessionManager for session context
	globalRegistry *HandlerRegistry
}

// NewWorldHandler creates a new WorldHandler.
func NewWorldHandler(zoneManager *ZoneManager, sessionManager *SessionManager) *WorldHandler {
	registry := NewWorldOpCodeRegistry() // Global registry
	return &WorldHandler{
		zoneManager:    zoneManager,
		sessionManager: sessionManager,
		globalRegistry: registry,
	}
}

// HandleDatagram processes incoming datagrams and routes them.
func (wh *WorldHandler) HandleDatagram(msg ZoneMessage) {

	// Get session to determine the zone
	session, ok := wh.sessionManager.GetSession(msg.SessionID)

	// Check if the message should be handled globally (e.g., login)
	if wh.globalRegistry.ShouldHandleGlobally(msg.Data) {
		wh.globalRegistry.HandleDatagram(msg, ok)
		return
	}

	if !ok {
		op := binary.LittleEndian.Uint16(msg.Data[:2])
		log.Printf("unauthenticated opcode %d from session %d – dropping", op, msg.SessionID)
		return
	}

	// Route to the zone from the session
	zone := wh.zoneManager.GetOrCreate(session.ZoneID)
	zone.Inbox <- msg
}

// RemoveSession cleans up session data.
func (wh *WorldHandler) RemoveSession(sessionID int) {
	wh.sessionManager.RemoveSession(sessionID)
}

// ZoneInstance represents a single zone instance.
type ZoneInstance struct {
	ID       int
	Inbox    chan ZoneMessage
	Quit     chan struct{}
	wg       sync.WaitGroup
	registry *HandlerRegistry // Zone-specific HandlerRegistry
}

// NewZoneInstance creates a new zone instance with a HandlerRegistry.
func NewZoneInstance(zoneID int, registry *HandlerRegistry) *ZoneInstance {
	// Create a new registry for the zone, potentially customized
	zoneRegistry := NewZoneOpCodeRegistry(GetWorldDB(), zoneID)
	z := &ZoneInstance{
		ID:       zoneID,
		Inbox:    make(chan ZoneMessage, 128),
		Quit:     make(chan struct{}),
		registry: zoneRegistry,
	}
	z.wg.Add(1)
	go z.run()
	return z
}

func (z *ZoneInstance) run() {
	defer z.wg.Done()
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	fmt.Printf("[Zone %d] started\n", z.ID)

	for {
		select {
		case <-ticker.C:
			// 20Hz tick: update NPCs, physics, etc.
			// z.update()
		case msg := <-z.Inbox:
			// Use zone-specific HandlerRegistry to process datagrams
			z.registry.HandleDatagram(msg, true)
		case <-z.Quit:
			fmt.Printf("[Zone %d] shutting down\n", z.ID)
			return
		}
	}
}

func (z *ZoneInstance) Stop() {
	close(z.Quit)
	z.wg.Wait()
}

// ZoneManager tracks all instances.
type ZoneManager struct {
	mu       sync.Mutex
	zones    map[int]*ZoneInstance
	registry *HandlerRegistry // Default registry for new zones
}

// NewZoneManager creates a new ZoneManager with a default HandlerRegistry.
func NewZoneManager(registry *HandlerRegistry) *ZoneManager {
	return &ZoneManager{
		zones:    make(map[int]*ZoneInstance),
		registry: registry,
	}
}

// GetOrCreate retrieves or creates a zone instance.
func (m *ZoneManager) GetOrCreate(zoneID int) *ZoneInstance {
	m.mu.Lock()
	defer m.mu.Unlock()
	if z, ok := m.zones[zoneID]; ok {
		return z
	}
	z := NewZoneInstance(zoneID, m.registry) // Pass default registry
	m.zones[zoneID] = z
	return z
}

// Shutdown stops all zone instances.
func (m *ZoneManager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, z := range m.zones {
		z.Stop()
	}
}
