package zone

import (
	capnp "capnproto.org/go/capnp/v3"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/ports/client"
	"github.com/knervous/eqgo/internal/quest"
	"github.com/knervous/eqgo/internal/session"
)

// ensure ZoneInstance implements ZoneAccess
var _ client.ZoneAccess = (*ZoneInstance)(nil)

// ZoneAccess methods on your existing struct:
func (z *ZoneInstance) GetZone() *model.Zone {
	return z.Zone
}

func (z *ZoneInstance) GetZoneID() int     { return z.ZoneID }
func (z *ZoneInstance) GetInstanceID() int { return z.InstanceID }

func (z *ZoneInstance) Clients() []client.Client {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	out := make([]client.Client, 0, len(z.ClientEntries))
	for _, ce := range z.ClientEntries {
		out = append(out, ce.ClientSession.Client)
	}
	return out
}

func (z *ZoneInstance) ClientBySession(sessionID int) (client.Client, bool) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	ce, ok := z.ClientEntries[sessionID]
	return ce.ClientSession.Client, ok
}

func (z *ZoneInstance) ClientByEntity(entityID int) (client.Client, bool) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	ce, ok := z.ClientEntriesByEntityID[entityID]
	return ce.ClientSession.Client, ok
}

func (z *ZoneInstance) NPCs() []client.NPC {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	out := make([]client.NPC, 0, len(z.Npcs))
	for _, npc := range z.Npcs {
		out = append(out, npc)
	}
	return out
}

func (z *ZoneInstance) NPCByID(npcID int) (client.NPC, bool) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	npc, ok := z.Npcs[npcID]
	return npc, ok
}

func (z *ZoneInstance) NPCByName(name string) (client.NPC, bool) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	npc, ok := z.npcsByName[name]
	return npc, ok
}

func (z *ZoneInstance) ZoneEntities() []client.Entity {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	out := make([]client.Entity, 0, len(z.Entities))
	for _, e := range z.Entities {
		out = append(out, e)
	}
	return out
}

func (z *ZoneInstance) EntityByID(id int) (client.Entity, bool) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	e, ok := z.Entities[id]
	return e, ok
}

func (z *ZoneInstance) QE() *quest.QuestEvent {
	qe := z.questEvent.Reset()
	qe.ZoneAccess = z
	return qe
}

func (z *ZoneInstance) broadcastWearChange(
	sender int,
	slot int32,
	item *constants.ItemWithInstance,
) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	for _, ce := range z.ClientEntries {
		if ce.ClientSession == nil || ce.ClientSession.Client.ID() == sender {
			continue
		}
		_ = session.QueueMessage(
			ce.ClientSession,
			eq.NewRootWearChange,
			opcodes.WearChange,
			func(m eq.WearChange) error {
				m.SetColor(int32(item.Item.Color))
				m.SetMaterial(item.Item.Material)
				m.SetSpawnId(int32(sender))
				m.SetWearSlotId(slot)
				return nil
			},
		)
	}
}

// private helper
func (z *ZoneInstance) broadcast(
	sender string,
	channelID int32,
	msg string,
) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	for _, ce := range z.ClientEntries {
		_ = session.QueueMessage(
			ce.ClientSession,
			eq.NewRootChannelMessage,
			opcodes.ChannelMessage,
			func(m eq.ChannelMessage) error {
				m.SetSender(sender)
				m.SetChanNum(channelID)
				m.SetMessage_(msg)
				return nil
			},
		)
	}
}

func BroadcastToClients() {

}

func (z *ZoneInstance) BroadcastChannel(sender string, channelID int, msg string) {
	z.broadcast(sender, int32(channelID), msg)
}

func (z *ZoneInstance) BroadcastServer(msg string) {
	z.broadcast("", -1, msg)
}

type capnpMessage interface {
	Message() *capnp.Message
}

func Datagram[T capnpMessage](
	ses *session.Session,
	ctor func(*capnp.Segment) (T, error),
	opcode opcodes.OpCode,
	build func(T) error,
) error {
	return session.QueueDatagram(ses, ctor, opcode, build)
}

func Message[T capnpMessage](
	ses *session.Session,
	ctor func(*capnp.Segment) (T, error),
	opcode opcodes.OpCode,
	build func(T) error,
) error {
	return session.QueueMessage(ses, ctor, opcode, build)
}
