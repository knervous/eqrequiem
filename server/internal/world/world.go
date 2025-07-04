package world

import (
	"encoding/binary"
	"log"
	"sync"

	"github.com/knervous/eqgo/internal/session"
	"github.com/knervous/eqgo/internal/zone"
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
	wh := &WorldHandler{
		zoneManager:    zoneManager,
		sessionManager: sessionManager,
		globalRegistry: registry,
	}
	registry.WH = wh // Set the WorldHandler in the registry
	return wh
}

// HandlePacket processes incoming datagrams and routes them.
func (wh *WorldHandler) HandlePacket(session *session.Session, data []byte) {
	// Check if the message should be handled globally (e.g., login)
	if wh.globalRegistry.ShouldHandleGlobally(data) {
		if !wh.globalRegistry.HandleWorldPacket(session, data) {
			return
		}
	}

	if !session.Authenticated {
		op := binary.LittleEndian.Uint16(data[:2])
		log.Printf("unauthenticated opcode %d from session %d – dropping", op, session.SessionID)
		return
	}
	if session.ZoneID == -1 {
		log.Printf("session %d has no zone assigned, cannot handle packet", session.SessionID)
		return
	}

	// Route to the zone from the session and create if it doesn't exist
	zone, _ := wh.zoneManager.GetOrCreate(session.ZoneID, session.InstanceID)
	zone.HandleClientPacket(session, data)
}

// RemoveSession cleans up session data.
func (wh *WorldHandler) RemoveSession(sessionID int) {
	ses, ok := wh.sessionManager.GetSession(sessionID)
	if ok && ses != nil && ses.ZoneID != -1 {
		zoneInstance, ok := wh.zoneManager.Get(ses.ZoneID, ses.InstanceID)
		if ok {
			zoneInstance.RemoveClient(sessionID)
		}
	}
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

func (m *ZoneManager) Get(zoneID, instanceID int) (*zone.ZoneInstance, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := zoneKey{ZoneID: zoneID, InstanceID: instanceID}
	inst, ok := m.zones[key]
	return inst, ok
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
