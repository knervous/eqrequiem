package zone

import (
	"context"
	eqpb "knervous/eqgo/internal/api/proto"
	db_character "knervous/eqgo/internal/db/character"
	db_zone "knervous/eqgo/internal/db/zone"
	"knervous/eqgo/internal/message"
	"knervous/eqgo/internal/session"
	"log"

	"github.com/jinzhu/copier"
	"google.golang.org/protobuf/proto"
)

func HandleRequestClientZoneChange(msg message.ClientMessage, payload []byte) {
	session, found := session.GetSessionManager().GetSession(msg.SessionID)
	if !found {
		log.Printf("failed to get session for sessionID %d", msg.SessionID)
		return
	}
	req := &eqpb.RequestClientZoneChange{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("ZoneChangeRequest unmarshal error: %v", err)
		return
	}
	if req.Type == eqpb.ZoneChangeType_FROM_WORLD {
		char, err := db_character.GetCharacterByName(context.Background(), session.CharacterName)
		if err != nil {
			log.Printf("failed to get character %q for accountID %d: %v", session.CharacterName, session.AccountID, err)
			return
		}
		req.X = float32(char.X)
		req.Y = float32(char.Y)
		req.Z = float32(char.Z)
		req.Heading = float32(char.Heading)
		req.InstanceId = int32(char.ZoneInstance)
		req.ZoneId = int32(char.ZoneID)
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
	newZone.ZoneShortName = *dbZone.ShortName
	newZone.ZoneId = int32(dbZone.Zoneidnumber)
	newZone.ZoneLongName = dbZone.LongName

	msg.Messenger.SendStream(msg.SessionID, uint16(eqpb.OpCodes_OP_NewZone), newZone)
}
