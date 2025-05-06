package session

import (
	"testing"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
)

// noopMessenger satisfies ClientMessenger but does nothing.
type noopMessenger struct{}

func (noopMessenger) SendDatagram(sessionID int, data []byte) error { return nil }
func (noopMessenger) SendStream(sessionID int, data []byte) error   { return nil }

var benchSession *Session
var benchMessage eq.JWTResponse

func init() {
	benchSession = NewSessionManager().CreateSession(noopMessenger{}, 42, "127.0.0.1")
	benchMessage, _ = NewMessage(benchSession, eq.NewRootJWTResponse)
	benchMessage.SetStatus(1)
}

func BenchmarkSendData(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		err := benchSession.SendData(benchMessage.Message(), opcodes.JWTResponse)
		if err != nil {
			b.Fatal(err)
		}
		benchMessage, _ = NewMessage(benchSession, eq.NewRootJWTResponse)

	}
}

func BenchmarkSendStream(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		err := benchSession.SendStream(benchMessage.Message(), opcodes.JWTResponse)
		if err != nil {
			b.Fatal(err)
		}
		benchMessage, _ = NewMessage(benchSession, eq.NewRootJWTResponse)
	}
}
