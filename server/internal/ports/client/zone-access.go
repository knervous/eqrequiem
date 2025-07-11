package client

import (
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

// ZoneAccess provides read-only, thread-safe access to zone state.

// ZoneAccess provides read-only, thread-safe access to zone state.
type ZoneAccess interface {
	// Basic zone info
	GetZone() *model.Zone
	GetZoneID() int
	GetInstanceID() int

	// Clients
	Clients() []Client
	ClientBySession(sessionID int) (Client, bool)
	ClientByEntity(entityID int) (Client, bool)

	// NPCs
	NPCs() []NPC
	NPCByID(npcID int) (NPC, bool)
	NPCByName(name string) (NPC, bool)

	// Entities (players + NPCs)
	ZoneEntities() []Entity
	EntityByID(id int) (Entity, bool)

	// Messaging
	BroadcastChannel(sender string, channelID int, msg string)
	BroadcastServer(msg string)
}
