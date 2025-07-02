package zone

import (
	"math"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/session"
)

const (
	EntityTypeNPC = iota
	EntityTypePlayer
	EntityTypeCorpse
)

// cellSize is the edge length (in world units) of each grid cell.
const cellSize = 300.0

const cellOffset = 1 << 20 // must be > max |cell index| you’ll ever see

func packCell(c [3]int) int64 {
	ux := int64(c[0] + cellOffset)
	uy := int64(c[1] + cellOffset)
	uz := int64(c[2] + cellOffset)
	return (ux << 42) | (uy << 21) | uz
}

// worldToCell computes the 3D cell indices for a world position.
func worldToCell(x, y, z float64) [3]int {
	return [3]int{
		int(math.Floor(x / cellSize)),
		int(math.Floor(y / cellSize)),
		int(math.Floor(z / cellSize)),
	}
}

// markMoved flags an entity for broadcast and rebuckets it if its cell changed.
func (z *ZoneInstance) markMoved(id int, pos entity.MobPosition) {
	if (z.Entities[id] == nil) || (z.Entities[id].GetMob() == nil) {
		return // entity not found or not a mob
	}
	m := z.Entities[id].GetMob()

	// 1) only enqueue once, via its own flag
	if !m.IsDirty() {
		m.MarkDirty()
		z.dirtyEntities = append(z.dirtyEntities, id)
	}

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
					if sid == id {
						continue
					}
					if ce, ok := z.ClientEntriesByEntityID[sid]; ok && ce.ClientSession != nil {
						newSubs[sid] = struct{}{}
					}
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
					// only subscribe *players* (i.e. ones with a live session)
					if ce, isPlayer := z.ClientEntriesByEntityID[otherID]; !isPlayer || ce.ClientSession == nil {
						continue
					}
					// add new client as subscriber
					if z.subs[otherID] == nil {
						z.subs[otherID] = make(map[int]struct{})
					}
					z.subs[otherID][newID] = struct{}{}
					// flag for immediate update
					z.dirtyEntities = append(z.dirtyEntities, otherID)
				}
			}
		}
	}
}

func (z *ZoneInstance) FlushUpdates() {
	// 1) clear last tick’s data (no allocation)
	for clientID, slice := range z.updatesByClient {
		z.updatesByClient[clientID] = slice[:0]
	}

	// 2) scatter each dirty entity into its subscribers
	for _, eid := range z.dirtyEntities {
		for clientID := range z.subs[eid] {
			// validate client…
			if ce, ok := z.ClientEntriesByEntityID[clientID]; !ok || ce.ClientSession == nil {
				continue
			}
			z.updatesByClient[clientID] = append(z.updatesByClient[clientID], eid)
		}
		z.Entities[eid].GetMob().ClearDirty()
	}

	// 3) send one batch per client with non-empty list
	for clientID, eids := range z.updatesByClient {
		if len(eids) == 0 {
			continue
		}
		ce := z.ClientEntriesByEntityID[clientID]
		session.QueueMessage(
			ce.ClientSession,
			eq.NewRootEntityPositionUpdate,
			opcodes.SpawnPositionUpdate,
			func(b eq.EntityPositionUpdate) error {
				updates, _ := b.NewUpdates(int32(len(eids)))
				for i, eid := range eids {
					m := updates.At(i)
					p, _ := m.NewPosition()
					ent := z.Entities[eid]
					pos := ent.Position()
					m.SetSpawnId(int32(eid))
					p.SetX(float32(pos.X))
					p.SetY(float32(pos.Y))
					p.SetZ(float32(pos.Z))
					m.SetHeading(float32(pos.Heading))
					v, _ := m.NewVelocity()
					vel := ent.GetMob().GetVelocity()
					v.SetX(float32(vel.X))
					v.SetY(float32(vel.Y))
					v.SetZ(float32(vel.Z))
					if ent.GetMob().Type() == EntityTypeNPC {
						if vel.X == 0 && vel.Y == 0 && vel.Z == 0 {
							m.SetAnimation(Idle1)
						} else {
							m.SetAnimation(Walking)
						}
					} else {
						m.SetAnimation("")
					}

				}
				return nil
			},
		)
		// clear for next tick
		z.updatesByClient[clientID] = eids[:0]
	}

	// 4) reset the dirty‐entity list
	z.dirtyEntities = z.dirtyEntities[:0]
}
