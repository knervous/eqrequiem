package session

import (
	"encoding/binary"
	"fmt"

	capnp "capnproto.org/go/capnp/v3"
	capnpext "github.com/knervous/eqgo/internal/api"
	"github.com/knervous/eqgo/internal/api/opcodes"
)

func (s *Session) SendData(
	msg *capnp.Message,
	opcode opcodes.OpCode,
) error {
	s.sendMu.Lock()
	defer s.sendMu.Unlock()
	payload := s.writeBuffer[2:]
	var totalLen int = 2
	if msg != nil {
		n, err := capnpext.MarshalTo(msg, payload)
		if err == capnpext.ErrBufferTooSmall {
			newCap := 2 + n
			s.writeBuffer = make([]byte, newCap)
			payload = s.writeBuffer[2:]
			n, err = capnpext.MarshalTo(msg, payload)
		}
		if err != nil {
			return fmt.Errorf("SendData: %w", err)
		}
		totalLen = 2 + n
	}

	binary.LittleEndian.PutUint16(s.writeBuffer[:2], uint16(opcode))
	return s.Messenger.SendDatagram(s.SessionID, s.writeBuffer[:totalLen])
}

func (s *Session) SendStream(
	msg *capnp.Message,
	opcode opcodes.OpCode,
) error {
	s.sendMu.Lock()
	defer s.sendMu.Unlock()
	const headerSize = 6

	buf := s.writeBuffer[:cap(s.writeBuffer)]
	payload := buf[headerSize:]

	n, err := capnpext.MarshalTo(msg, payload)
	if err == capnpext.ErrBufferTooSmall {
		newCap := headerSize + n
		s.writeBuffer = make([]byte, newCap)
		buf = s.writeBuffer
		payload = buf[headerSize:]
		n, err = capnpext.MarshalTo(msg, payload)
	}
	if err != nil {
		return fmt.Errorf("SendStream: %w", err)
	}

	totalLen := headerSize + n
	binary.LittleEndian.PutUint32(buf[0:4], uint32(2+n))
	binary.LittleEndian.PutUint16(buf[4:6], uint16(opcode))

	return s.Messenger.SendStream(s.SessionID, buf[:totalLen])
}

func (s *Session) SendStreamNoLock(
	msg *capnp.Message,
	opcode opcodes.OpCode,
) error {
	const headerSize = 6

	buf := s.writeBuffer[:cap(s.writeBuffer)]
	payload := buf[headerSize:]

	n, err := capnpext.MarshalTo(msg, payload)
	if err == capnpext.ErrBufferTooSmall {
		newCap := headerSize + n
		s.writeBuffer = make([]byte, newCap)
		buf = s.writeBuffer
		payload = buf[headerSize:]
		n, err = capnpext.MarshalTo(msg, payload)
	}
	if err != nil {
		return fmt.Errorf("SendStream: %w", err)
	}

	totalLen := headerSize + n
	binary.LittleEndian.PutUint32(buf[0:4], uint32(2+n))
	binary.LittleEndian.PutUint16(buf[4:6], uint16(opcode))

	return s.Messenger.SendStream(s.SessionID, buf[:totalLen])
}
