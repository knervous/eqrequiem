package message

import (
	"google.golang.org/protobuf/proto"
)

type ClientMessenger interface {
	SendDatagram(sessionID int, opcode uint16, msg proto.Message) error
	SendStream(sessionID int, opcode uint16, msg proto.Message) error
}

// ClientMessage represents a message from a client to a zone.
type ClientMessage struct {
	SessionID int
	Data      []byte
	Messenger ClientMessenger // For sending replies
	IP        string          // Client IP address
}
