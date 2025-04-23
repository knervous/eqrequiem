package world

import (
	"encoding/binary"
	eqpb "knervous/eqgo/internal/api/proto"
	"log"
)

// DatagramHandler defines the signature for handling datagrams.
type DatagramHandler func(msg ZoneMessage, payload []byte)

// HandlerRegistry holds the handler mappings and dependencies.
type HandlerRegistry struct {
	handlers      map[eqpb.OpCodes]DatagramHandler
	globalOpcodes map[eqpb.OpCodes]bool // Opcodes that should be handled globally
}

func NewWorldOpCodeRegistry() *HandlerRegistry {
	handlers := map[eqpb.OpCodes]DatagramHandler{
		eqpb.OpCodes_OP_JWTLogin:        HandleJWTLogin,
		eqpb.OpCodes_OP_ApproveName:     HandleApproveName,
		eqpb.OpCodes_OP_CharacterCreate: HandleCharacterCreate,
		eqpb.OpCodes_OP_DeleteCharacter: HandleCharacterDelete,
	}

	globalOpcodes := make(map[eqpb.OpCodes]bool)
	for opCode := range handlers {
		globalOpcodes[opCode] = true
	}

	registry := &HandlerRegistry{
		handlers:      handlers,
		globalOpcodes: globalOpcodes,
	}

	return registry
}

// ShouldHandleGlobally checks if an opcode should be handled globally.
func (r *HandlerRegistry) ShouldHandleGlobally(data []byte) bool {
	if len(data) < 2 {
		return false
	}
	op := binary.LittleEndian.Uint16(data[:2])
	return r.globalOpcodes[(eqpb.OpCodes)(op)]
}

func (r *HandlerRegistry) HandleDatagram(msg ZoneMessage, validSession bool) {
	if len(msg.Data) < 2 {
		log.Printf("invalid datagram length %d from session %d", len(msg.Data), msg.SessionID)
		return
	}
	op := binary.LittleEndian.Uint16(msg.Data[:2])
	payload := msg.Data[2:]
	if (!validSession && op != uint16(eqpb.OpCodes_OP_JWTLogin)) || len(payload) == 0 {
		log.Printf("unauthenticated opcode %d from session %d", op, msg.SessionID)
	} else if h, ok := r.handlers[(eqpb.OpCodes)(op)]; ok {
		h(msg, payload)
	} else {
		log.Printf("no handler for opcode %d from session %d", op, msg.SessionID)
	}
}

func NewZoneOpCodeRegistry(db *WorldDB, zoneID int) *HandlerRegistry {
	registry := &HandlerRegistry{
		handlers:      map[eqpb.OpCodes]DatagramHandler{},
		globalOpcodes: map[eqpb.OpCodes]bool{},
	}

	return registry
}
