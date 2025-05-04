package zone

import (
	"context"
	"log"

	eqpb "github.com/knervous/eqgo/internal/api/proto"
	db_character "github.com/knervous/eqgo/internal/db/character"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	"github.com/knervous/eqgo/internal/message"
	"github.com/knervous/eqgo/internal/session"

	"github.com/jinzhu/copier"
	"google.golang.org/protobuf/proto"
)

func HandleRequestClientZoneChange(msg message.ClientMessage, clientSession *session.Session, payload []byte) {
	req := &eqpb.RequestClientZoneChange{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("ZoneChangeRequest unmarshal error: %v", err)
		return
	}
	charData := clientSession.CharacterData
	if charData == nil {
		log.Printf("client session %d has no character data", clientSession.SessionID)
		return
	}
	if req.Type == eqpb.ZoneChangeType_FROM_WORLD {
		req.X = float32(charData.X)
		req.Y = float32(charData.Y)
		req.Z = float32(charData.Z)
		req.Heading = float32(charData.Heading)
		req.InstanceId = int32(charData.ZoneInstance)
		req.ZoneId = int32(charData.ZoneID)
	} else {
		// We are zoning from another zone
		// Get validation logic later for this zone request, for now save off and bust cache
		charData.X = float64(req.X)
		charData.Y = float64(req.Y)
		charData.Z = float64(req.Z)
		charData.Heading = float64(req.Heading)
		charData.ZoneID = uint32(req.ZoneId)
		charData.ZoneInstance = uint32(req.InstanceId)
		db_character.UpdateCharacter(charData, clientSession.AccountID)

	}
	dbZone, err := db_zone.GetZoneById(context.Background(), int(req.ZoneId))
	if err != nil {
		log.Printf("failed to get zone %d: %v", req.ZoneId, err)
		return
	}
	newZone := &eqpb.NewZone{}

	if err := copier.Copy(newZone, dbZone); err != nil {
		log.Printf("warning: copier.Copy failed: %v", err)
	}

	playerProfile := &eqpb.PlayerProfile{}
	copier.Copy(playerProfile, charData)
	playerProfile.ZoneId = int32(charData.ZoneID)
	playerProfile.CharClass = int32(charData.Class)

	zonePoints, err := db_zone.GetZonePointsByZoneName(newZone.ShortName)
	if err != nil {
		log.Printf("failed to get zone points for zone %s: %v", newZone.ShortName, err)
		return
	}
	newZone.ZonePoints = zonePoints
	msg.Messenger.SendStream(msg.SessionID, uint16(eqpb.OpCodes_OP_NewZone), newZone)
	msg.Messenger.SendStream(msg.SessionID, uint16(eqpb.OpCodes_OP_PlayerProfile), playerProfile)
}
