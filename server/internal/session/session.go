package session

import (
	"knervous/eqgo/internal/db/jetgen/eqgo/model"
	"sync"
)

// Session holds the context for a client session.
type Session struct {
	SessionID     int
	AccountID     int64
	ZoneID        int    // Current zone the session is in
	InstanceID    int    // Current instance ID the session is in
	IP            string // Client IP address
	CharacterName string
	CharacterData *model.CharacterData
}

// SessionManager manages active sessions.
type SessionManager struct {
	sessions map[int]*Session // sessionID -> Session
	mu       sync.RWMutex
}

// globalSessionManager holds the singleton SessionManager.
var globalSessionManager *SessionManager

// InitSessionManager initializes the global SessionManager.
func InitSessionManager(sm *SessionManager) {
	globalSessionManager = sm
}

// GetSessionManager returns the global SessionManager.
func GetSessionManager() *SessionManager {
	if globalSessionManager == nil {
		panic("SessionManager not initialized")
	}
	return globalSessionManager
}

// NewSessionManager creates a new SessionManager.
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[int]*Session),
	}
}

// CreateSession initializes a new session with the given sessionID and accountID.
func (sm *SessionManager) CreateSession(sessionID int, accountID int64, ip string) *Session {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session := &Session{
		SessionID: sessionID,
		AccountID: accountID,
		ZoneID:    1, // Default zone; can be updated based on user context
		IP:        ip,
	}
	sm.sessions[sessionID] = session
	return session
}

// GetSession retrieves a session by sessionID.
func (sm *SessionManager) GetSession(sessionID int) (*Session, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	session, ok := sm.sessions[sessionID]
	return session, ok
}

// RemoveSession deletes a session by sessionID.
func (sm *SessionManager) RemoveSession(sessionID int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	delete(sm.sessions, sessionID)
}

// UpdateZone updates the zoneID for a session.
func (sm *SessionManager) UpdateZone(sessionID int, zoneID int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if session, ok := sm.sessions[sessionID]; ok {
		session.ZoneID = zoneID
	}
}
