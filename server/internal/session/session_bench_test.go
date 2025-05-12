package session

import (
	"fmt"
	"testing"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
)

// noopMessenger satisfies ClientMessenger but does nothing.
type noopMessenger struct{}

func (noopMessenger) SendDatagram(sessionID int, data []byte) error { return nil }
func (noopMessenger) SendStream(sessionID int, data []byte) error   { return nil }

var benchSession *Session
var benchDeserSession *Session
var benchMessage eq.JWTResponse
var buffer []byte
var packedBuffer []byte
var equalValue int32

func init() {
	mgr := NewSessionManager()
	benchSession = mgr.CreateSession(noopMessenger{}, 1, "127.0.0.1")
	benchDeserSession = mgr.CreateSession(noopMessenger{}, 2, "127.0.0.1")
	benchMessage, _ = NewMessage(benchSession, eq.NewRootJWTResponse)
	benchMessage.SetStatus(1)
	buffer = []byte{0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0}
	packedBuffer = []byte{16, 2, 16, 1, 1, 1}
	equalValue = 1
	benchSession.writeBuffer = buffer
}

func BenchmarkDeserialize(b *testing.B) {
	b.ReportAllocs()
	count := 50 //b.N
	fmt.Println("count", count)
	for i := 0; i < count; i++ {
		_, err := Deserialize(benchDeserSession, buffer, eq.ReadRootJWTResponse)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkCreateNewMessage(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := NewMessage(benchSession, eq.NewRootJWTResponse)
		if err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkSendData(b *testing.B) {
	b.ReportAllocs()
	count := 50 //b.N
	fmt.Println("count", count)
	for i := 0; i < count; i++ {
		err := benchSession.SendData(benchMessage.Message(), opcodes.JWTResponse)
		mgr := NewSessionManager()
		benchSession = mgr.CreateSession(noopMessenger{}, i+4, "127.0.0.1")
		if err != nil {
			b.Fatal(err)
		}

	}
}

func BenchmarkSendStream(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		err := benchSession.SendStream(benchMessage.Message(), opcodes.JWTResponse)
		if err != nil {
			b.Fatal(err)
		}
	}
}
