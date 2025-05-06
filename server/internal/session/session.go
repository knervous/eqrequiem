package session

import (
	"encoding/binary"
	"fmt"
	"sync"

	capnp "capnproto.org/go/capnp/v3"
	capnpext "github.com/knervous/eqgo/internal/api"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

type ClientMessenger interface {
	SendDatagram(sessionID int, data []byte) error
	SendStream(sessionID int, data []byte) error
}

// Session holds the context for a client session.
type Session struct {
	SessionID     int
	Authenticated bool
	AccountID     int64
	ZoneID        int            // Current zone the session is in
	InstanceID    int            // Current instance ID the session is in
	IP            string         // Client IP address
	RootSeg       *capnp.Segment // Current segment
	CharacterName string
	CharacterData *model.CharacterData

	// Private
	messageBuffer *capnp.Message
	arena         capnp.Arena
	segmentBuf    []byte          // Pre-allocated buffer for message and serialization
	messenger     ClientMessenger // For sending replies

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
func (sm *SessionManager) CreateSession(messenger ClientMessenger, sessionID int, ip string) *Session {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	const initialSegCap = 8 * 1024
	segmentBuf := make([]byte, 0, initialSegCap)
	msg, seg := capnp.NewSingleSegmentMessage(nil)

	session := &Session{
		SessionID:     sessionID,
		Authenticated: false,
		ZoneID:        1,
		IP:            ip,
		RootSeg:       seg,
		arena:         msg.Arena,
		segmentBuf:    segmentBuf,
		messageBuffer: msg,
		messenger:     messenger,
	}
	sm.sessions[sessionID] = session
	return session
}

// NewMessage creates a new message with zero allocation.
func NewMessage[T any](
	s *Session,
	ctor func(*capnp.Segment) (T, error),
) (T, error) {
	newSeg, err := s.messageBuffer.Reset(s.arena)
	if err != nil {
		var zero T
		return zero, fmt.Errorf("new message: %w", err)
	}
	s.RootSeg = newSeg

	// Call constructor to populate the segment
	return ctor(s.RootSeg)
}

func (s *Session) SendData(
	message *capnp.Message,
	opcode opcodes.OpCode,
) error {
	buf := s.segmentBuf[:cap(s.segmentBuf)]
	payload := buf[2:]

	n, err := capnpext.MarshalTo(message, payload)
	if err == capnpext.ErrBufferTooSmall {
		newCap := 2 + n
		s.segmentBuf = make([]byte, newCap)
		buf = s.segmentBuf
		payload = buf[2:]
		n, err = capnpext.MarshalTo(message, payload)
	}
	if err != nil {
		return fmt.Errorf("SendData: %w", err)
	}

	totalLen := 2 + n
	binary.LittleEndian.PutUint16(buf[:2], uint16(opcode))
	return s.messenger.SendDatagram(s.SessionID, buf[:totalLen])
}
func (s *Session) SendStream(
	message *capnp.Message,
	opcode opcodes.OpCode,
) error {
	const headerSize = 6

	buf := s.segmentBuf[:cap(s.segmentBuf)]
	payload := buf[headerSize:]

	n, err := capnpext.MarshalTo(message, payload)
	if err == capnpext.ErrBufferTooSmall {
		newCap := headerSize + n
		s.segmentBuf = make([]byte, newCap)
		buf = s.segmentBuf
		payload = buf[headerSize:]
		n, err = capnpext.MarshalTo(message, payload)
	}
	if err != nil {
		return fmt.Errorf("SendStream: %w", err)
	}

	totalLen := headerSize + n
	binary.LittleEndian.PutUint32(buf[0:4], uint32(2+n))
	binary.LittleEndian.PutUint16(buf[4:6], uint16(opcode))

	return s.messenger.SendStream(s.SessionID, buf[:totalLen])
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
