package zone

import (
	"time"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/session"

	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	entity "github.com/knervous/eqgo/internal/entity"
)

// Implement ZoneAccess interface
func (z *ZoneInstance) GetZone() *model.Zone {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	return z.Zone
}

func (z *ZoneInstance) GetZoneID() int {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	return z.ZoneID
}

func (z *ZoneInstance) GetInstanceID() int {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	return z.InstanceID
}

func (z *ZoneInstance) GetClients() map[int]ClientEntry {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	clientsCopy := make(map[int]ClientEntry, len(z.ClientEntries))
	for k, v := range z.ClientEntries {
		clientsCopy[k] = v
	}
	return clientsCopy
}

func (z *ZoneInstance) GetClientBySessionID(sessionID int) (ClientEntry, bool) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	client, ok := z.ClientEntries[sessionID]
	return client, ok
}

func (z *ZoneInstance) GetNPCs() map[int]*entity.NPC {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	npcsCopy := make(map[int]*entity.NPC, len(z.Npcs))
	for k, v := range z.Npcs {
		npcsCopy[k] = v
	}
	return npcsCopy
}

func (z *ZoneInstance) GetNPCByID(npcID int) (*entity.NPC, bool) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	npc, ok := z.Npcs[npcID]
	return npc, ok
}

func (z *ZoneInstance) GetNPCByName(name string) *entity.NPC {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	return z.npcsByName[name]
}

func (z *ZoneInstance) GetZonePool() map[int64]*db_zone.SpawnPoolEntry {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	poolCopy := make(map[int64]*db_zone.SpawnPoolEntry, len(z.ZonePool))
	for k, v := range z.ZonePool {
		poolCopy[k] = v
	}
	return poolCopy
}

func (z *ZoneInstance) GetSpawnTimers() map[int64]time.Time {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	timersCopy := make(map[int64]time.Time, len(z.spawnTimers))
	for k, v := range z.spawnTimers {
		timersCopy[k] = v
	}
	return timersCopy
}

func (z *ZoneInstance) GetSpawn2ToNpc() map[int64]int {
	z.mutex.RLock()
	defer z.mutex.RUnlock()
	spawnCopy := make(map[int64]int, len(z.spawn2ToNpc))
	for k, v := range z.spawn2ToNpc {
		spawnCopy[k] = v
	}
	return spawnCopy
}

func (z *ZoneInstance) BroadcastChannelMessage(senderName, message string, chatChannel int) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()

	for _, ce := range z.ClientEntries {
		session.QueueMessage(
			ce.ClientSession,
			eq.NewRootChannelMessage,
			opcodes.ChannelMessage,
			func(m eq.ChannelMessage) error {
				m.SetSender(senderName)
				m.SetMessage_(message)
				m.SetChanNum(int32(chatChannel))
				return nil
			},
		)
	}
}

func (z *ZoneInstance) BroadcastServerMessage(message string) {
	z.mutex.RLock()
	defer z.mutex.RUnlock()

	for _, ce := range z.ClientEntries {
		session.QueueMessage(
			ce.ClientSession,
			eq.NewRootChannelMessage,
			opcodes.ChannelMessage,
			func(m eq.ChannelMessage) error {
				m.SetSender("")
				m.SetMessage_(message)
				m.SetChanNum(int32(-1))
				return nil
			},
		)
	}
}
