package world

import (
	"encoding/binary"
	"log"

	eqpb "github.com/knervous/eqgo/internal/api/proto"
	"github.com/knervous/eqgo/internal/message"
)

// DatagramHandler defines the signature for handling datagrams.
type DatagramHandler func(msg message.ClientMessage, payload []byte, wh *WorldHandler)

// HandlerRegistry holds the handler mappings and dependencies.
type HandlerRegistry struct {
	handlers      map[eqpb.OpCodes]DatagramHandler
	globalOpcodes map[eqpb.OpCodes]bool // Opcodes that should be handled globally
	WH            *WorldHandler
}

func NewWorldOpCodeRegistry() *HandlerRegistry {
	handlers := map[eqpb.OpCodes]DatagramHandler{
		eqpb.OpCodes_OP_JWTLogin:        HandleJWTLogin,
		eqpb.OpCodes_OP_CharacterCreate: HandleCharacterCreate,
		eqpb.OpCodes_OP_DeleteCharacter: HandleCharacterDelete,
		eqpb.OpCodes_OP_EnterWorld:      HandleEnterWorld,
		eqpb.OpCodes_OP_ZoneSession:     HandleZoneSession,
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

func (r *HandlerRegistry) ShouldHandleGlobally(data []byte) bool {
	if len(data) < 2 {
		return false
	}
	op := binary.LittleEndian.Uint16(data[:2])
	return r.globalOpcodes[(eqpb.OpCodes)(op)]
}

func (r *HandlerRegistry) HandleWorldPacket(msg message.ClientMessage, validSession bool) {
	if len(msg.Data) < 2 {
		log.Printf("invalid datagram length %d from session %d", len(msg.Data), msg.SessionID)
		return
	}
	op := binary.LittleEndian.Uint16(msg.Data[:2])
	payload := msg.Data[2:]
	if (!validSession && op != uint16(eqpb.OpCodes_OP_JWTLogin)) || len(payload) == 0 {
		log.Printf("unauthenticated opcode %d from session %d", op, msg.SessionID)
	} else if h, ok := r.handlers[(eqpb.OpCodes)(op)]; ok {
		h(msg, payload, r.WH)
	} else {
		log.Printf("no handler for opcode %d from session %d", op, msg.SessionID)
	}
}

func NewZoneOpCodeRegistry(zoneID int) *HandlerRegistry {
	registry := &HandlerRegistry{
		handlers:      map[eqpb.OpCodes]DatagramHandler{},
		globalOpcodes: map[eqpb.OpCodes]bool{},
	}

	return registry
}
