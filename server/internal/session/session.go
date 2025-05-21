package session

import (
	"fmt"
	"io"
	"sync"

	capnp "capnproto.org/go/capnp/v3"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/entity"
	"github.com/quic-go/webtransport-go"
)

type pendingMsg struct {
	ctor    func(*capnp.Segment) (capnp.Struct, error)
	opcode  uint16
	builder func(capnp.Struct) error
}

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
	Client        *entity.Client
	Messenger     ClientMessenger // For sending replies
	ControlStream webtransport.Stream
	// Private

	writeMessageBuffer *capnp.Message
	readMessageBuffer  *capnp.Message
	arena              capnp.Arena
	writeBuffer        []byte // Pre-allocated buffer for message and serialization
	readBuffer         []byte // Pre-allocated buffer for message and serialization
	packBuf            []byte // Pre-allocated buffer for packing/unpacking messages
	sendMu             sync.Mutex
	messageMu          sync.Mutex
	closed             bool
	closedMu           sync.RWMutex
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

func (sm *SessionManager) GetValidSession(sessionID int, ip string) (*Session, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session not found")
	}
	if session.IP != ip {
		return nil, fmt.Errorf("IP mismatch")
	}
	return session, nil
}

// CreateSession initializes a new session with the given sessionID and accountID.
func (sm *SessionManager) CreateSession(messenger ClientMessenger, sessionID int, ip string, stream webtransport.Stream) *Session {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	const initialSegCap = 8 * 1024
	writeBuf := make([]byte, initialSegCap)
	readBuf := make([]byte, initialSegCap)
	packBuf := make([]byte, 0, initialSegCap)
	msg, seg, _ := capnp.NewMessage(capnp.SingleSegment(nil))
	readMsg, _, _ := capnp.NewMessage(capnp.SingleSegment(nil))

	session := &Session{
		SessionID:          sessionID,
		Authenticated:      false,
		ZoneID:             -1,
		ControlStream:      stream,
		IP:                 ip,
		RootSeg:            seg,
		arena:              msg.Arena,
		writeBuffer:        writeBuf,
		readBuffer:         readBuf,
		writeMessageBuffer: msg,
		readMessageBuffer:  readMsg,
		Messenger:          messenger,
		packBuf:            packBuf,
	}
	sm.sessions[sessionID] = session
	return session
}

// NewMessage creates a new message with zero allocation.
func NewMessage[T any](
	s *Session,
	ctor func(*capnp.Segment) (T, error),
) (T, error) {
	s.messageMu.Lock()
	defer s.messageMu.Unlock()
	newSeg, err := s.writeMessageBuffer.Reset(s.arena)
	if err != nil {
		var zero T
		return zero, fmt.Errorf("new message: %w", err)
	}
	s.RootSeg = newSeg
	return ctor(s.RootSeg)
}

func (s *Session) ReadMessageZero(data []byte) error {
	if err := capnp.UnmarshalZeroTo(s.readMessageBuffer, &s.readBuffer, data); err != nil {
		return err
	}
	seg, err := s.readMessageBuffer.Segment(0)
	if err != nil {
		return err
	}
	s.RootSeg = seg
	return nil
}

func (s *Session) ReadMessagePackedZero(data []byte) error {
	if err := capnp.UnmarshalPackedZeroTo(s.writeMessageBuffer, &s.writeBuffer, &s.packBuf, data); err != nil {
		return err
	}
	seg, err := s.writeMessageBuffer.Segment(0)
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
	return get(ses.readMessageBuffer)
}

func (s *Session) Close() {
	s.closedMu.Lock()
	s.closed = true
	s.closedMu.Unlock()

	s.writeMessageBuffer.Release()
	s.RootSeg = nil
	s.arena = nil
	s.writeBuffer = nil
	s.packBuf = nil
	if closer, ok := s.Messenger.(io.Closer); ok {
		_ = closer.Close()
	}
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

type capnpMessage interface {
	Message() *capnp.Message
}

func QueueMessage[T capnpMessage](
	s *Session,
	ctor func(*capnp.Segment) (T, error),
	opcode opcodes.OpCode,
	build func(T) error,
) error {
	s.closedMu.RLock()
	if s.closed {
		s.closedMu.RUnlock()
		return fmt.Errorf("session %d is closed", s.SessionID)
	}
	s.closedMu.RUnlock()

	s.sendMu.Lock()
	defer s.sendMu.Unlock()

	obj, err := NewMessage(s, ctor)
	if err != nil {
		return fmt.Errorf("new message: %w", err)
	}
	if err := build(obj); err != nil {
		return fmt.Errorf("build message: %w", err)
	}
	return s.SendStreamNoLock(obj.Message(), opcode)
}

func QueueDatagram[T capnpMessage](
	s *Session,
	ctor func(*capnp.Segment) (T, error),
	opcode opcodes.OpCode,
	build func(T) error,
) error {
	s.closedMu.RLock()
	if s.closed {
		s.closedMu.RUnlock()
		return fmt.Errorf("session %d is closed", s.SessionID)
	}
	s.closedMu.RUnlock()

	s.sendMu.Lock()
	defer s.sendMu.Unlock()

	obj, err := NewMessage(s, ctor)
	if err != nil {
		return fmt.Errorf("new message: %w", err)
	}
	if err := build(obj); err != nil {
		return fmt.Errorf("build message: %w", err)
	}
	return s.SendDataNoLock(obj.Message(), opcode)
}
