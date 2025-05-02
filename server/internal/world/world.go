package world

import (
	"encoding/binary"
	"knervous/eqgo/internal/message"
	"knervous/eqgo/internal/session"
	"knervous/eqgo/internal/zone"
	"log"
	"sync"
)

// WorldHandler manages global message routing and session-to-zone mapping.
type WorldHandler struct {
	zoneManager    *ZoneManager
	sessionManager *session.SessionManager // SessionManager for session context
	globalRegistry *HandlerRegistry
}

// NewWorldHandler creates a new WorldHandler.
func NewWorldHandler(zoneManager *ZoneManager, sessionManager *session.SessionManager) *WorldHandler {
	registry := NewWorldOpCodeRegistry() // Global registry
	return &WorldHandler{
		zoneManager:    zoneManager,
		sessionManager: sessionManager,
		globalRegistry: registry,
	}
}

// HandleDatagram processes incoming datagrams and routes them.
func (wh *WorldHandler) HandleDatagram(msg message.ClientMessage) {

	// Get session to determine the zone
	session, ok := wh.sessionManager.GetSession(msg.SessionID)

	// Check if the message should be handled globally (e.g., login)
	if wh.globalRegistry.ShouldHandleGlobally(msg.Data) {
		wh.globalRegistry.HandleWorldPacket(msg, ok)
		return
	}

	if !ok {
		op := binary.LittleEndian.Uint16(msg.Data[:2])
		log.Printf("unauthenticated opcode %d from session %d – dropping", op, msg.SessionID)
		return
	}

	// Route to the zone from the session
	zone, _ := wh.zoneManager.GetOrCreate(session.ZoneID, session.InstanceID)
	zone.Inbox <- msg
}

// RemoveSession cleans up session data.
func (wh *WorldHandler) RemoveSession(sessionID int) {
	wh.sessionManager.RemoveSession(sessionID)
}

type zoneKey struct {
	ZoneID     int
	InstanceID int
}

// ZoneManager tracks all instances.
type ZoneManager struct {
	mu    sync.Mutex
	zones map[zoneKey]*zone.ZoneInstance
}

func NewZoneManager() *ZoneManager {
	return &ZoneManager{
		zones: make(map[zoneKey]*zone.ZoneInstance),
	}
}

// GetOrCreate retrieves or creates a zone instance.
func (m *ZoneManager) GetOrCreate(zoneID, instanceID int) (*zone.ZoneInstance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := zoneKey{ZoneID: zoneID, InstanceID: instanceID}
	if inst, ok := m.zones[key]; ok {
		return inst, nil
	}
	inst := zone.NewZoneInstance(zoneID, instanceID)
	m.zones[key] = inst
	return inst, nil
}

func (m *ZoneManager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, inst := range m.zones {
		inst.Stop()
	}
}
