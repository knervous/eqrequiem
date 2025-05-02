package db_zone

import (
	"context"
	"fmt"
	"knervous/eqgo/internal/cache"
	"knervous/eqgo/internal/db"
	"knervous/eqgo/internal/db/jetgen/eqgo/model"
	"knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	_ "github.com/go-sql-driver/mysql"
)

func GetZoneById(ctx context.Context, zoneID int) (*model.Zone, error) {
	cacheKey := fmt.Sprintf("zone:id:%d", zoneID)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if zone, ok := val.(*model.Zone); ok {
			return zone, nil
		}
	}

	var zone model.Zone
	err := table.Zone.
		SELECT(table.Zone.AllColumns).
		FROM(table.Zone).
		WHERE(
			table.Zone.Zoneidnumber.EQ(mysql.Int(int64(zoneID))),
		).
		QueryContext(ctx, db.GlobalWorldDB.DB, &zone)
	if err != nil {
		return nil, fmt.Errorf("query zone_data: %w", err)
	}

	cache.GetCache().Set(cacheKey, &zone)
	return &zone, nil
}
