package zone

import (
	"encoding/binary"
	"log"

	"github.com/knervous/eqgo/internal/api/opcodes"

	"github.com/knervous/eqgo/internal/session"
)

type ClientMessage struct {
}

// DatagramHandler defines the signature for handling datagrams.
type DatagramHandler func(clientSession *session.Session, payload []byte)

// HandlerRegistry holds the handler mappings and dependencies.
type HandlerRegistry struct {
	handlers      map[opcodes.OpCode]DatagramHandler
	globalOpcodes map[opcodes.OpCode]bool // Opcodes that should be handled globally
}

func NewZoneOpCodeRegistry(zoneID int) *HandlerRegistry {
	handlers := map[opcodes.OpCode]DatagramHandler{
		opcodes.RequestClientZoneChange: HandleRequestClientZoneChange,
	}

	registry := &HandlerRegistry{
		handlers:      handlers,
		globalOpcodes: map[opcodes.OpCode]bool{},
	}

	return registry
}

func (r *HandlerRegistry) HandleZonePacket(session *session.Session, data []byte) {
	if len(data) < 2 {
		log.Printf("invalid datagram length %d from session %d", len(data), session.SessionID)
		return
	}
	op := binary.LittleEndian.Uint16(data[:2])
	payload := data[2:]
	if h, ok := r.handlers[(opcodes.OpCode)(op)]; ok {
		h(session, payload)
	} else {
		log.Printf("no handler for opcode %d from session %d", op, session.SessionID)
	}
}
