package zone

import (
	"context"
	"fmt"
	"log"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"

	db_character "github.com/knervous/eqgo/internal/db/character"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	"github.com/knervous/eqgo/internal/session"
)

func HandleRequestClientZoneChange(ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootRequestClientZoneChange)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}

	charData := ses.CharacterData
	if charData == nil {
		log.Printf("client session %d has no character data", ses.SessionID)
		return
	}
	if req.Type() == 0 {
		req.SetX(float32(charData.X))
		req.SetY(float32(charData.Y))
		req.SetZ(float32(charData.Z))
		req.SetHeading(float32(charData.Heading))
		req.SetInstanceId(int32(charData.ZoneInstance))
		req.SetZoneId(int32(charData.ZoneID))

	} else {
		// We are zoning from another zone
		// Get validation logic later for this zone request, for now save off and bust cache

		charData.X = float64(req.X())
		charData.Y = float64(req.Y())
		charData.Z = float64(req.Z())
		charData.Heading = float64(req.Heading())
		charData.ZoneID = uint32(req.ZoneId())
		charData.ZoneInstance = uint32(req.InstanceId())
		db_character.UpdateCharacter(charData, ses.AccountID)

	}
	dbZone, err := db_zone.GetZoneById(context.Background(), int(req.ZoneId()))
	if err != nil {
		log.Printf("failed to get zone %d: %v", req.ZoneId, err)
		return
	}
	fmt.Println("zone data", dbZone)

	// TODO get here later
	// newZone := &eqpb.NewZone{}

	newZone, err := session.NewMessage(ses, eq.NewRootNewZone)
	if err != nil {
		log.Printf("failed to create NewZone message: %v", err)
		return
	}
	newZone.SetShortName(*dbZone.ShortName)
	newZone.SetLongName(*&dbZone.LongName)
	newZone.SetZoneIdNumber(int32(dbZone.Zoneidnumber))
	newZone.SetSafeX(float32(dbZone.SafeX))
	newZone.SetSafeY(float32(dbZone.SafeY))
	newZone.SetSafeZ(float32(dbZone.SafeZ))

	zonePoints, err := db_zone.GetZonePointsByZoneName(*dbZone.ShortName)
	if err != nil {
		log.Printf("failed to get zone points for zone %s: %v", newZone.ShortName, err)
		return
	}
	zp, err := newZone.NewZonePoints(int32(len(zonePoints)))
	if err != nil {
		log.Printf("failed to create NewZone message: %v", err)
		return
	}
	for i, zonePoint := range zonePoints {
		zonePointProto := zp.At(i)

		zonePointProto.SetX(float32(zonePoint.X))
		zonePointProto.SetY(float32(zonePoint.Y))
		zonePointProto.SetZ(float32(zonePoint.Z))
		zonePointProto.SetZoneId(int32(zonePoint.TargetZoneID))
		zonePointProto.SetZoneInstance(int32(zonePoint.TargetInstance))
		zonePointProto.SetHeading(float32(zonePoint.Heading))
		zonePointProto.SetNumber(int32(zonePoint.Number))
	}

	ses.SendStream(newZone.Message(), opcodes.NewZone)
	playerProfile, err := session.NewMessage(ses, eq.NewRootPlayerProfile)
	if err != nil {
		log.Printf("failed to create PlayerProfile message: %v", err)
		return
	}
	playerProfile.SetName(charData.Name)
	playerProfile.SetLevel(int32(charData.Level))
	playerProfile.SetRace(int32(charData.Race))
	playerProfile.SetCharClass(int32(charData.Class))
	playerProfile.SetStr(int32(charData.Str))
	playerProfile.SetSta(int32(charData.Sta))
	playerProfile.SetDex(int32(charData.Dex))
	playerProfile.SetAgi(int32(charData.Agi))
	playerProfile.SetWis(int32(charData.Wis))
	playerProfile.SetIntel(int32(charData.Int))
	playerProfile.SetCha(int32(charData.Cha))
	playerProfile.SetZoneId(int32(charData.ZoneID))
	playerProfile.SetZoneInstance(int32(charData.ZoneInstance))
	playerProfile.SetX(float32(charData.X))
	playerProfile.SetY(float32(charData.Y))
	playerProfile.SetZ(float32(charData.Z))
	playerProfile.SetHeading(float32(charData.Heading))
	ses.SendStream(playerProfile.Message(), opcodes.PlayerProfile)
}
