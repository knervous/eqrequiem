package db_zone

import (
	"context"
	"fmt"

	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	_ "github.com/go-sql-driver/mysql"
)

type SpawnPoolEntry struct {
	Spawn2       *model.Spawn2
	SpawnGroup   *model.Spawngroup
	SpawnEntries []*SpawnEntryWithNPC
	GridEntries  []GridEntries
}

type SpawnEntryWithNPC struct {
	SpawnEntry *model.Spawnentry
	NPCType    *model.NpcTypes
}

// GetZoneSpawnPool returns a map of spawn2 IDs to their associated spawn pool data (spawngroup, spawnentries, and npc_types).
func GetZoneSpawnPool(zoneName string) (map[int64]*SpawnPoolEntry, error) {
	// Define cache key
	cacheKey := fmt.Sprintf("zone:spawn_pool:%s", zoneName)

	// Check cache
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if spawnPool, ok := val.(map[int64]*SpawnPoolEntry); ok {
			return spawnPool, nil
		}
	}

	// Initialize context
	ctx := context.Background()

	// Query to fetch spawn2, spawngroup, spawnentry, and npc_types data
	stmt := table.Spawn2.
		SELECT(
			table.Spawn2.ID,
			table.Spawn2.SpawngroupID,
			table.Spawn2.Zone,
			table.Spawn2.X,
			table.Spawn2.Y,
			table.Spawn2.Z,
			table.Spawn2.Heading,
			table.Spawn2.Pathgrid,
			table.Spawn2.Respawntime,
			table.Spawngroup.ID.AS("spawngroup.id"),
			table.Spawngroup.Name.AS("spawngroup.name"),
			table.Spawnentry.SpawngroupID.AS("spawnentry.spawngroup_id"),
			table.Spawnentry.NpcID.AS("spawnentry.npc_id"),
			table.Spawnentry.Chance.AS("spawnentry.chance"),
			table.NpcTypes.ID.AS("npc_types.id"),
			table.NpcTypes.Name.AS("npc_types.name"),
			table.NpcTypes.AllColumns,
		).
		FROM(
			table.Spawn2.
				INNER_JOIN(table.Spawngroup,
					table.Spawn2.SpawngroupID.EQ(table.Spawngroup.ID)).
				LEFT_JOIN(table.Spawnentry,
					table.Spawngroup.ID.EQ(table.Spawnentry.SpawngroupID)).
				LEFT_JOIN(table.NpcTypes,
					table.Spawnentry.NpcID.EQ(table.NpcTypes.ID)),
		).
		WHERE(
			table.Spawn2.Zone.EQ(mysql.String(zoneName)).
				AND(table.Spawn2.Version.EQ(mysql.Int(0))),
		)

	// Execute query
	var results []struct {
		Spawn2     model.Spawn2
		Spawngroup model.Spawngroup
		Spawnentry *model.Spawnentry // Nullable due to LEFT JOIN
		NpcTypes   *model.NpcTypes   // Nullable due to LEFT JOIN
	}
	err := stmt.QueryContext(ctx, db.GlobalWorldDB.DB, &results)
	if err != nil {
		return nil, fmt.Errorf("query zone spawn pool: %w", err)
	}

	// Build spawn pool map
	spawnPool := make(map[int64]*SpawnPoolEntry)
	for _, r := range results {
		// Get or create SpawnPoolEntry for this spawn2 ID
		entry, exists := spawnPool[int64(r.Spawn2.ID)]
		if !exists {
			entry = &SpawnPoolEntry{
				Spawn2:       &r.Spawn2,
				SpawnGroup:   &r.Spawngroup,
				SpawnEntries: []*SpawnEntryWithNPC{},
			}
			spawnPool[int64(r.Spawn2.ID)] = entry
		}

		if r.Spawnentry != nil && r.NpcTypes != nil {
			entry.SpawnEntries = append(entry.SpawnEntries, &SpawnEntryWithNPC{
				SpawnEntry: r.Spawnentry,
				NPCType:    r.NpcTypes,
			})
		}
	}

	if ok, err := cache.GetCache().Set(cacheKey, spawnPool); err != nil || !ok {
		return nil, fmt.Errorf("cache set error: %w", err)
	}

	return spawnPool, nil
}
