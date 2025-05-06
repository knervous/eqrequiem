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

func GetZonePointsByZoneName(zoneName string) ([]*model.ZonePoints, error) {
	cacheKey := fmt.Sprintf("zone:id:%s", zoneName)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if zonePoints, ok := val.([]*model.ZonePoints); ok {
			return zonePoints, nil
		}
	}
	ctx := context.Background()
	var zonePoints []*model.ZonePoints
	err := table.ZonePoints.
		SELECT(table.ZonePoints.AllColumns).
		FROM(table.ZonePoints).
		WHERE(
			table.ZonePoints.Zone.EQ(mysql.String(zoneName)),
		).
		QueryContext(ctx, db.GlobalWorldDB.DB, &zonePoints)
	if err != nil {
		return nil, fmt.Errorf("query zone_data: %w", err)
	}
	// Store in cache
	if ok, err := cache.GetCache().Set(cacheKey, zonePoints); err != nil || !ok {
		return nil, fmt.Errorf("cache set error: %w", err)
	}

	return zonePoints, nil
}
