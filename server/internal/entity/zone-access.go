package entity

import (
	"time"

	db_zone "github.com/knervous/eqgo/internal/db/zone"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

// ZoneAccess provides access to ZoneInstance data for quests.
type ZoneAccess interface {
	// Zone data
	GetZone() *model.Zone
	GetZoneID() int
	GetInstanceID() int

	// Clients
	//GetClients() map[int]ClientEntry
	//GetClientBySessionID(sessionID int) (ClientEntry, bool)

	// NPCs
	GetNPCs() map[int]*NPC
	GetNPCByID(npcID int) (*NPC, bool)
	GetNPCByName(name string) *NPC

	// Spawning
	GetZonePool() map[int64]*db_zone.SpawnPoolEntry
	GetSpawnTimers() map[int64]time.Time
	GetSpawn2ToNpc() map[int64]int

	// Broadcasting
	BroadcastChannelMessage(senderName, message string, chatChannel int)
}
