package db_zone

import (
	"context"
	"fmt"

	eqpb "github.com/knervous/eqgo/internal/api/proto"
	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	_ "github.com/go-sql-driver/mysql"
)

func GetZonePointsByZoneName(zoneName string) ([]*eqpb.ZonePoint, error) {

	cacheKey := fmt.Sprintf("zone:id:%s", zoneName)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if zonePoints, ok := val.([]*eqpb.ZonePoint); ok {
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
	// Convert to protobuf
	var zonePointsProto []*eqpb.ZonePoint
	for _, zonePoint := range zonePoints {
		zonePointProto := &eqpb.ZonePoint{}
		zonePointProto.X = float32(zonePoint.X)
		zonePointProto.Y = float32(zonePoint.Y)
		zonePointProto.Z = float32(zonePoint.Z)
		zonePointProto.Zoneid = int32(zonePoint.TargetZoneID)
		zonePointProto.Zoneinstance = int32(zonePoint.TargetInstance)
		zonePointProto.Heading = float32(zonePoint.Heading)
		zonePointProto.Number = int32(zonePoint.Number)
		zonePointsProto = append(zonePointsProto, zonePointProto)
	}

	cache.GetCache().Set(cacheKey, &zonePointsProto)
	return zonePointsProto, nil
}
