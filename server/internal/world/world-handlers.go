package world

import (
	"context"
	"log"
	"unicode"

	eqpb "knervous/eqgo/internal/api/proto"
	"knervous/eqgo/internal/discord"

	"google.golang.org/protobuf/proto"
)

func sendCharInfo(msg ZoneMessage, accountId int64) {
	ctx := context.Background()
	charInfo, err := GetCharSelectInfo(ctx, accountId)
	if err != nil {
		log.Printf("failed to get character select info for accountID %d: %v", accountId, err)
		return
	}
	msg.Messenger.SendStream(msg.SessionID, uint16(eqpb.OpCodes_OP_SendCharInfo), charInfo)
}

func sendMaxCharacters(msg ZoneMessage) {
	msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_SendCharInfo), &eqpb.Int{Value: 8})
}

func HandleJWTLogin(msg ZoneMessage, payload []byte) {
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
	sessionManager := GetSessionManager()
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

func HandleCharacterCreate(msg ZoneMessage, payload []byte) {
	session, found := GetSessionManager().GetSession(msg.SessionID)
	if !found {
		log.Printf("failed to get session for sessionID %d: %v", msg.SessionID)
		return
	}
	req := &eqpb.CharCreate{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("JWTLogin unmarshal error: %v", err)
		return
	}

	if !CharacterCreate(session.CharacterName, session.AccountID, req) {
		return
	}

	sendCharInfo(msg, session.AccountID)
}

func HandleCharacterDelete(msg ZoneMessage, payload []byte) {
	session, found := GetSessionManager().GetSession(msg.SessionID)
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

func HandleApproveName(msg ZoneMessage, payload []byte) {
	ctx := context.Background()
	session, found := GetSessionManager().GetSession(msg.SessionID)
	if !found {
		log.Printf("failed to get session for sessionID %d", msg.SessionID)
		return
	}
	req := &eqpb.NameApprove{}
	if err := proto.Unmarshal(payload, req); err != nil {
		log.Printf("JWTLogin unmarshal error: %v", err)
		return
	}

	isValid := true
	if len(req.Name) < 4 || len(req.Name) > 15 {
		isValid = false
	} else if !unicode.IsUpper(rune(req.Name[0])) {
		isValid = false
	} else if !CheckNameFilter(ctx, req.Name) {
		isValid = false
	} else {
		for idx, char := range req.Name {
			if idx > 0 && (!unicode.IsLetter(char) || unicode.IsUpper(char)) {
				isValid = false
				break
			}
		}
	}
	retValue := 0
	if isValid {
		retValue = 1
		session.CharacterName = req.Name
	}
	resp := &eqpb.Int{
		Value: int32(retValue),
	}
	if err := msg.Messenger.SendDatagram(msg.SessionID, uint16(eqpb.OpCodes_OP_ApproveName_Server), resp); err != nil {
		log.Printf("failed to send NameApproveResponse for session %d: %v", msg.SessionID, err)
	}
}
