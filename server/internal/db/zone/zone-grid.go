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

// GetZoneGridEntries loads every Grid and its GridEntries for a zone.
// Returns a map: gridID → slice of entries (ordered by entry.Sequence).
func GetZoneGridEntries(zoneID int32) (map[int64][]*model.GridEntries, error) {
	cacheKey := fmt.Sprintf("zone:grid_entries:%d", zoneID)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if m, ok := val.(map[int64][]*model.GridEntries); ok {
			return m, nil
		}
	}

	ctx := context.Background()

	// We'll pull both Grid.* and GridEntries.* in one JOIN-ed query.
	// Jet will unmarshal into this helper struct.
	var rows []struct {
		Grid      model.Grid
		GridEntry model.GridEntries
	}
	err := table.Grid.
		SELECT(
			table.Grid.AllColumns,
			table.GridEntries.AllColumns,
		).
		FROM(
			table.Grid.
				INNER_JOIN(
					table.GridEntries,
					table.Grid.ID.EQ(table.GridEntries.Gridid),
				),
		).
		WHERE(
			table.Grid.Zoneid.EQ(mysql.Int32(zoneID)).AND(table.GridEntries.Zoneid.EQ(mysql.Int32(zoneID))),
		).ORDER_BY(
		table.Grid.ID,
		table.GridEntries.Number,
	).
		QueryContext(ctx, db.GlobalWorldDB.DB, &rows)
	if err != nil {
		return nil, fmt.Errorf("query grid + entries: %w", err)
	}

	gridMap := make(map[int64][]*model.GridEntries, len(rows))
	for i := range rows {
		gID := int64(rows[i].Grid.ID)
		entry := rows[i].GridEntry
		gridMap[gID] = append(gridMap[gID], &entry)
	}

	if ok, err := cache.GetCache().Set(cacheKey, gridMap); err != nil || !ok {
		return nil, fmt.Errorf("cache set error: %w", err)
	}
	return gridMap, nil
}
