package world

import (
	"encoding/binary"
	"log"

	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/session"
)

// DatagramHandler defines the signature for handling datagrams.
type DatagramHandler func(session *session.Session, payload []byte, wh *WorldHandler) bool

// HandlerRegistry holds the handler mappings and dependencies.
type HandlerRegistry struct {
	handlers      map[opcodes.OpCode]DatagramHandler
	globalOpcodes map[opcodes.OpCode]bool // Opcodes that should be handled globally
	WH            *WorldHandler
}

func NewWorldOpCodeRegistry() *HandlerRegistry {
	handlers := map[opcodes.OpCode]DatagramHandler{
		opcodes.JWTLogin:                HandleJWTLogin,
		opcodes.CharacterCreate:         HandleCharacterCreate,
		opcodes.DeleteCharacter:         HandleCharacterDelete,
		opcodes.EnterWorld:              HandleEnterWorld,
		opcodes.ZoneSession:             HandleZoneSession,
		opcodes.RequestClientZoneChange: HandleRequestClientZoneChange,
	}

	globalOpcodes := make(map[opcodes.OpCode]bool)
	for opCode := range handlers {
		globalOpcodes[opCode] = true
	}

	registry := &HandlerRegistry{
		handlers:      handlers,
		globalOpcodes: globalOpcodes,
	}

	return registry
}

func (r *HandlerRegistry) ShouldHandleGlobally(data []byte) bool {
	if len(data) < 2 {
		return false
	}
	op := binary.LittleEndian.Uint16(data[:2])
	return r.globalOpcodes[(opcodes.OpCode)(op)]
}

func (r *HandlerRegistry) HandleWorldPacket(ses *session.Session, data []byte) bool {
	if len(data) < 2 {
		log.Printf("invalid datagram length %d from session %d", len(data), ses.SessionID)
		return false
	}
	op := binary.LittleEndian.Uint16(data[:2])
	payload := data[2:]
	forwardToZone := false
	if (!ses.Authenticated && op != uint16(opcodes.JWTLogin)) || len(payload) == 0 {
		log.Printf("unauthenticated opcode %d from session %d", op, ses.SessionID)
	} else if h, ok := r.handlers[(opcodes.OpCode)(op)]; ok {
		forwardToZone = h(ses, payload, r.WH)
	} else {
		log.Printf("no handler for opcode %d from session %d", op, ses.SessionID)
	}
	return forwardToZone
}

func NewZoneOpCodeRegistry(zoneID int) *HandlerRegistry {
	registry := &HandlerRegistry{
		handlers:      map[opcodes.OpCode]DatagramHandler{},
		globalOpcodes: map[opcodes.OpCode]bool{},
	}

	return registry
}
