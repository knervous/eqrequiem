package zone

import (
	"encoding/binary"
	eqpb "knervous/eqgo/internal/api/proto"
	"knervous/eqgo/internal/message"
	"log"
)

// DatagramHandler defines the signature for handling datagrams.
type DatagramHandler func(msg message.ClientMessage, payload []byte)

// HandlerRegistry holds the handler mappings and dependencies.
type HandlerRegistry struct {
	handlers      map[eqpb.OpCodes]DatagramHandler
	globalOpcodes map[eqpb.OpCodes]bool // Opcodes that should be handled globally
}

func NewZoneOpCodeRegistry(zoneID int) *HandlerRegistry {
	handlers := map[eqpb.OpCodes]DatagramHandler{
		eqpb.OpCodes_OP_RequestClientZoneChange: HandleRequestClientZoneChange,
	}

	registry := &HandlerRegistry{
		handlers:      handlers,
		globalOpcodes: map[eqpb.OpCodes]bool{},
	}

	return registry
}

func (r *HandlerRegistry) HandleZonePacket(msg message.ClientMessage) {
	if len(msg.Data) < 2 {
		log.Printf("invalid datagram length %d from session %d", len(msg.Data), msg.SessionID)
		return
	}
	op := binary.LittleEndian.Uint16(msg.Data[:2])
	payload := msg.Data[2:]
	if h, ok := r.handlers[(eqpb.OpCodes)(op)]; ok {
		h(msg, payload)
	} else {
		log.Printf("no handler for opcode %d from session %d", op, msg.SessionID)
	}
}
