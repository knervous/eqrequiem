package session

import (
	"encoding/binary"
	"fmt"

	capnp "capnproto.org/go/capnp/v3"
	capnpext "github.com/knervous/eqgo/internal/api"
	"github.com/knervous/eqgo/internal/api/opcodes"
)

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
