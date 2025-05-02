package world

import (
	"context"
	"log"

	eqpb "knervous/eqgo/internal/api/proto"
	db_character "knervous/eqgo/internal/db/character"
	"knervous/eqgo/internal/discord"
	"knervous/eqgo/internal/message"
	"knervous/eqgo/internal/session"

	"google.golang.org/protobuf/proto"
)

func sendCharInfo(msg message.ClientMessage, accountId int64) {
	ctx := context.Background()
	charInfo, err := GetCharSelectInfo(ctx, accountId)
	if err != nil {
		log.Printf("failed to get character select info for accountID %d: %v", accountId, err)
		return
	}
	msg.Messenger.SendStream(msg.SessionID, uint16(eqpb.OpCodes_OP_SendCharInfo), charInfo)
}

func HandleJWTLogin(msg message.ClientMessage, payload []byte, wh *WorldHandler) {
	ctx := context.Background()

	req := &eqpb.JWTLogin{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("JWTLogin unmarshal error: %v", err)
		return
	}
	discordID, err := discord.ValidateJWT(req.Token)
	if err != nil {
		log.Printf("failed to validate JWT token: %v", err)
		return
	}

	accountID, err := GetOrCreateAccount(ctx, discordID)
	if err != nil {
		log.Printf("failed to get or create account for discordID %q: %v", discordID, err)
		resp := &eqpb.JWTResponse{Status: 1}
		if err := msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_JWTResponse), resp); err != nil {
			log.Printf("failed to send JWTResponse for session %d: %v", msg.SessionID, err)
		}

		return
	}

	// Initialize session with accountID
	sessionManager := session.GetSessionManager()
	sessionManager.CreateSession(msg.SessionID, accountID, msg.IP)

	resp := &eqpb.JWTResponse{
		Status: 0,
	}
	if err := msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_JWTResponse), resp); err != nil {
		log.Printf("failed to send JWTResponse for session %d: %v", msg.SessionID, err)
	}
	sendCharInfo(msg, accountID)
	LoginIP(ctx, accountID, msg.IP)
}

func HandleEnterWorld(msg message.ClientMessage, payload []byte, wh *WorldHandler) {
	session, found := session.GetSessionManager().GetSession(msg.SessionID)
	if !found {
		log.Printf("failed to get session for sessionID %d", msg.SessionID)
		return
	}
	req := &eqpb.EnterWorld{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("EnterWorld unmarshal error: %v", err)
		return
	}
	if accountMatch, err := AccountHasCharacterName(context.Background(), session.AccountID, req.Name); err != nil || !accountMatch {
		log.Printf("Tried to log in unsuccessfully from account %d with character %q: %v", session.AccountID, req.Name, err)
		return
	}
	session.CharacterName = req.Name
	msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_PostEnterWorld), &eqpb.Int{Value: 1})
}

func HandleZoneSession(msg message.ClientMessage, payload []byte, wh *WorldHandler) {
	session, found := session.GetSessionManager().GetSession(msg.SessionID)
	if !found {
		log.Printf("failed to get session for sessionID %d", msg.SessionID)
		return
	}
	req := &eqpb.ZoneSession{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("EnterWorld unmarshal error: %v", err)
		return
	}

	charData, err := db_character.GetCharacterByName(session.CharacterName)
	if err != nil {
		log.Printf("failed to get character %q for accountID %d: %v", session.CharacterName, session.AccountID, err)
		return
	}
	session.CharacterData = charData
	session.ZoneID = int(req.ZoneId)
	session.InstanceID = int(req.InstanceId)

	msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_ZoneSessionValid), &eqpb.Bool{Value: true})
}

func HandleCharacterCreate(msg message.ClientMessage, payload []byte, wh *WorldHandler) {
	session, found := session.GetSessionManager().GetSession(msg.SessionID)
	if !found {
		log.Printf("failed to get session for sessionID %d", msg.SessionID)
		return
	}
	req := &eqpb.CharCreate{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("JWTLogin unmarshal error: %v", err)
		return
	}

	if !ValidateName(req.Name) {
		msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_ApproveName_Server), &eqpb.Int{Value: 0})
		return
	}

	if !CharacterCreate(session.AccountID, req) {
		msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_ApproveName_Server), &eqpb.Int{Value: 0})
		return
	}
	msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_ApproveName_Server), &eqpb.Int{Value: 1})

	sendCharInfo(msg, session.AccountID)
}

func HandleCharacterDelete(msg message.ClientMessage, payload []byte, wh *WorldHandler) {
	session, found := session.GetSessionManager().GetSession(msg.SessionID)
	if !found {
		log.Printf("failed to get session for sessionID %d", msg.SessionID)
		return
	}
	req := &eqpb.String{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("CharDelete unmarshal error: %v", err)
		return
	}
	ctx := context.Background()
	if err := DeleteCharacter(ctx, session.AccountID, req.Value); err != nil {
		return
	}

	sendCharInfo(msg, session.AccountID)
}
