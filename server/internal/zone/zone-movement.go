package zone

import (
	"math"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/session"
)

// cellSize is the edge length (in world units) of each grid cell.
const cellSize = 500.0

// packCell encodes a 3D cell coordinate into a single int64 key.
func packCell(c [3]int) int64 {
	return (int64(uint32(c[0])) << 42) |
		(int64(uint32(c[1])) << 21) |
		int64(uint32(c[2]))
}

// worldToCell computes the 3D cell indices for a world position.
func worldToCell(x, y, z float32) [3]int {
	return [3]int{
		int(math.Floor(float64(x) / cellSize)),
		int(math.Floor(float64(y) / cellSize)),
		int(math.Floor(float64(z) / cellSize)),
	}
}

// markMoved flags an entity for broadcast and rebuckets it if its cell changed.
func (z *ZoneInstance) markMoved(id int, pos entity.MobPosition) {
	// 1) always flag for broadcast
	z.dirtyEntities = append(z.dirtyEntities, id)

	// 2) rebucket on cell change
	newCell := worldToCell(pos.X, pos.Y, pos.Z)
	newKey := packCell(newCell)
	oldKey, existed := z.entityCell[id]
	if !existed || oldKey != newKey {
		z.rebucket(id, oldKey, newKey, newCell)
	}
}

// rebucket moves an entity between cell buckets and updates subscriptions.
func (z *ZoneInstance) rebucket(id int, oldKey, newKey int64, cell [3]int) {
	if oldKey != 0 {
		delete(z.bucketMap[oldKey], id)
	}
	if z.bucketMap[newKey] == nil {
		z.bucketMap[newKey] = make(map[int]struct{})
	}
	z.bucketMap[newKey][id] = struct{}{}
	z.entityCell[id] = newKey

	z.resubscribe(id, cell)
}

// resubscribe rebuilds the subscriber list by scanning the 3×3×3 neighborhood of cells.
func (z *ZoneInstance) resubscribe(id int, cell [3]int) {
	old := z.subs[id]
	if old == nil {
		old = make(map[int]struct{})
	}
	newSubs := make(map[int]struct{})

	// collect clients in the 27 neighbor cells
	for di := -1; di <= 1; di++ {
		for dj := -1; dj <= 1; dj++ {
			for dk := -1; dk <= 1; dk++ {
				nb := [3]int{cell[0] + di, cell[1] + dj, cell[2] + dk}
				key := packCell(nb)
				for sid := range z.bucketMap[key] {
					newSubs[sid] = struct{}{}
				}
			}
		}
	}

	// unsubscribe removed
	for sid := range old {
		if _, ok := newSubs[sid]; !ok {
			delete(old, sid)
		}
	}
	// subscribe new
	for sid := range newSubs {
		if _, ok := old[sid]; !ok {
			old[sid] = struct{}{}
		}
	}
	z.subs[id] = old
}

// RegisterNewClientGrid handles placing a freshly connected client into the spatial grid
// and wiring up bidirectional subscriptions so everyone immediately sees each other.
func (z *ZoneInstance) registerNewClientGrid(id int, pos entity.MobPosition) {
	// 1) Bucket the new client and subscribe them to neighbors
	z.markMoved(id, pos)

	// 2) Subscribe each existing neighbor to this new client
	z.subscribeExistingToNew(id, pos)

	// 3) Flush right away so both sides get a "spawn" update instantly
	z.FlushUpdates()
}

// subscribeExistingToNew adds the new client (newID) as a subscriber on all entities
// in the 3×3×3 neighborhood around its spawn cell, and flags them dirty so an
// immediate position update (spawn) goes out.
func (z *ZoneInstance) subscribeExistingToNew(newID int, pos entity.MobPosition) {
	cell := worldToCell(pos.X, pos.Y, pos.Z)
	for di := -1; di <= 1; di++ {
		for dj := -1; dj <= 1; dj++ {
			for dk := -1; dk <= 1; dk++ {
				neighbor := [3]int{cell[0] + di, cell[1] + dj, cell[2] + dk}
				key := packCell(neighbor)
				for otherID := range z.bucketMap[key] {
					if otherID == newID {
						continue
					}
					// ensure the map exists
					if z.subs[otherID] == nil {
						z.subs[otherID] = make(map[int]struct{})
					}
					// add new client as subscriber
					z.subs[otherID][newID] = struct{}{}
					// flag for immediate update
					z.dirtyEntities = append(z.dirtyEntities, otherID)
				}
			}
		}
	}
}

// FlushUpdates sends all pending position updates to subscribers.
func (z *ZoneInstance) FlushUpdates() {
	for _, id := range z.dirtyEntities {
		pkt := func(m eq.EntityPositionUpdate) error {
			posBuilder, _ := m.NewPosition()
			// choose source of truth
			if npc, ok := z.Npcs[id]; ok {
				posBuilder.SetX(npc.Position.X)
				posBuilder.SetY(npc.Position.Y)
				posBuilder.SetZ(npc.Position.Z)
				m.SetSpawnId(int32(id))

			} else if client, ok := z.clientsById[id]; ok {
				p := client.GetPosition()
				posBuilder.SetX(p.X)
				posBuilder.SetY(p.Y)
				posBuilder.SetZ(p.Z)
				m.SetSpawnId(int32(z.ClientEntries[id].EntityId))
			}
			return nil
		}

		for sid := range z.subs[id] {
			if cs := z.ClientEntries[sid].ClientSession; cs != nil {
				session.QueueMessage(
					cs,
					eq.NewRootEntityPositionUpdate,
					opcodes.SpawnPositionUpdate,
					pkt,
				)
			}
		}
	}
	z.dirtyEntities = z.dirtyEntities[:0]
}
