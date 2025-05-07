package session

import (
	"fmt"
	"io"
	"sync"

	capnp "capnproto.org/go/capnp/v3"
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
	packBuf       []byte          // Pre-allocated buffer for packing/unpacking messages
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
	segmentBuf := make([]byte, initialSegCap)
	packBuf := make([]byte, 0, initialSegCap)
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
		packBuf:       packBuf,
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
	return ctor(s.RootSeg)
}

func (s *Session) ReadMessageZero(data []byte) error {
	if err := capnp.UnmarshalZeroTo(s.messageBuffer, &s.segmentBuf, data); err != nil {
		return err
	}
	seg, err := s.messageBuffer.Segment(0)
	if err != nil {
		return err
	}
	s.RootSeg = seg
	return nil
}

func (s *Session) ReadMessagePackedZero(data []byte) error {
	if err := capnp.UnmarshalPackedZeroTo(s.messageBuffer, &s.segmentBuf, &s.packBuf, data); err != nil {
		return err
	}
	seg, err := s.messageBuffer.Segment(0)
	if err != nil {
		return err
	}
	s.RootSeg = seg
	return nil
}

func Deserialize[T any](ses *Session, data []byte, get func(*capnp.Message) (T, error)) (T, error) {
	err := ses.ReadMessageZero(data)
	if err != nil {
		var zero T
		return zero, err
	}
	return get(ses.messageBuffer)
}

func (s *Session) Close() {
	// 1) Release the Cap’n Proto Message/Arena
	//    This returns any underlying segment buffers to the bufferpool.
	s.messageBuffer.Release()

	// 2) (Optional) zero out or drop references for GC
	s.RootSeg = nil
	s.arena = nil
	// slice buffers (segmentBuf, packBuf) can just be discarded or
	// kept around if you plan to re-open the session.
	s.segmentBuf = nil
	s.packBuf = nil

	// 3) If your messenger holds a connection you should close it:
	if closer, ok := s.messenger.(io.Closer); ok {
		_ = closer.Close()
	}

	// 4) Any other per‐session cleanup here…
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
	if sess, ok := sm.sessions[sessionID]; ok {
		sess.Close() // free up the pools
		delete(sm.sessions, sessionID)
	}
}

// UpdateZone updates the zoneID for a session.
func (sm *SessionManager) UpdateZone(sessionID int, zoneID int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if session, ok := sm.sessions[sessionID]; ok {
		session.ZoneID = zoneID
	}
}
