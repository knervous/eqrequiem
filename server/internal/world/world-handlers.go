package world

import (
	"context"
	"fmt"
	"log"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/config"
	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/discord"
	"github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/session"
)

func sendCharInfo(ses *session.Session, accountId int64) {
	ctx := context.Background()
	charInfo, err := GetCharSelectInfo(ses, ctx, accountId)
	if err != nil {
		log.Printf("failed to get character select info for accountID %d: %v", accountId, err)
		return
	}
	ses.SendStream(charInfo.Message(), opcodes.SendCharInfo)
}

func HandleJWTLogin(ses *session.Session, payload []byte, wh *WorldHandler) bool {
	ctx := context.Background()
	jwtLogin, err := session.Deserialize(ses, payload, eq.ReadRootJWTLogin)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return false
	}

	token, err := jwtLogin.Token()
	if err != nil {
		log.Printf("failed to get token from JWTLogin struct: %v", err)
		return false
	}
	var discordID string
	serverConfig, _ := config.Get()
	if !serverConfig.Local {
		discordID, err = discord.ValidateJWT(token)
		if err != nil {
			log.Printf("failed to validate JWT token: %v", err)
			jwtResponse, err := session.NewMessage(ses, eq.NewRootJWTResponse)
			if err != nil {
				log.Printf("failed to create JWTResponse: %v", err)
				return false
			}
			jwtResponse.SetStatus(-100)
			err = ses.SendData(jwtResponse.Message(), opcodes.JWTResponse)
			return false
		}
	} else {
		discordID = "local"
	}

	accountID, err := GetOrCreateAccount(ctx, discordID)
	if err != nil {
		log.Printf("failed to get or create account for discordID %q: %v", discordID, err)
		jwtResponse, err := session.NewMessage(ses, eq.NewRootJWTResponse)
		jwtResponse.SetStatus(0)
		ses.SendData(jwtResponse.Message(), opcodes.JWTResponse)

		if err != nil {
			log.Printf("failed to send JWTResponse: %v", err)
		}
		return false
	}

	ses.AccountID = accountID
	ses.Authenticated = true
	jwtResponse, err := session.NewMessage(ses, eq.NewRootJWTResponse)
	if err != nil {
		log.Printf("failed to create JWTResponse: %v", err)
		return false
	}
	jwtResponse.SetStatus(int32(ses.SessionID))
	err = ses.SendData(jwtResponse.Message(), opcodes.JWTResponse)
	if err != nil {
		log.Printf("failed to send JWTResponse: %v", err)
	}

	if err != nil {
		log.Printf("failed to send JWTResponse: %v", err)
	}

	sendCharInfo(ses, accountID)
	LoginIP(ctx, accountID, ses.IP)
	return false
}

func HandleEnterWorld(ses *session.Session, payload []byte, wh *WorldHandler) bool {
	req, err := session.Deserialize(ses, payload, eq.ReadRootEnterWorld)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return false
	}
	fmt.Println("Got enter world")

	name, err := req.Name()
	if err != nil {
		log.Printf("failed to get name from EnterWorld struct: %v", err)
		return false
	}
	if accountMatch, err := AccountHasCharacterName(context.Background(), ses.AccountID, name); err != nil || !accountMatch {
		log.Printf("Tried to log in unsuccessfully from account %d with character %q: %v", ses.AccountID, req.Name, err)
		return false
	}
	ses.CharacterName = name

	enterWorld, err := session.NewMessage(ses, eq.NewRootInt)
	if err != nil {
		log.Printf("failed to create EnterWorld message: %v", err)
		return false
	}
	enterWorld.SetValue(1)
	ses.SendData(enterWorld.Message(), opcodes.PostEnterWorld)
	return false
}

func HandleZoneSession(ses *session.Session, payload []byte, wh *WorldHandler) bool {
	req, err := session.Deserialize(ses, payload, eq.ReadRootZoneSession)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return false
	}

	charData, err := db_character.GetCharacterByName(ses.CharacterName)
	if err != nil {
		log.Printf("failed to get character %q for accountID %d: %v", ses.CharacterName, ses.AccountID, err)
		return false
	}
	ses.Client = entity.NewClient(charData)
	ses.ZoneID = int(req.ZoneId())
	ses.InstanceID = int(req.InstanceId())

	enterWorld, err := session.NewMessage(ses, eq.NewRootInt)
	if err != nil {
		log.Printf("failed to create EnterWorld message: %v", err)
		return false
	}
	enterWorld.SetValue(1)
	ses.SendData(enterWorld.Message(), opcodes.ZoneSessionValid)
	return false
}

func HandleCharacterCreate(ses *session.Session, payload []byte, wh *WorldHandler) bool {
	req, err := session.Deserialize(ses, payload, eq.ReadRootCharCreate)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return false
	}

	name, err := req.Name()
	if err != nil {
		log.Printf("failed to get name from CharCreate struct: %v", err)
		return false
	}
	if !ValidateName(name) {
		enterWorld, _ := session.NewMessage(ses, eq.NewRootInt)
		enterWorld.SetValue(0)
		ses.SendData(enterWorld.Message(), opcodes.ApproveName_Server)
		return false
	}

	if !CharacterCreate(ses, ses.AccountID, req) {
		enterWorld, _ := session.NewMessage(ses, eq.NewRootInt)
		enterWorld.SetValue(0)
		ses.SendData(enterWorld.Message(), opcodes.ApproveName_Server)
		return false
	}
	enterWorld, _ := session.NewMessage(ses, eq.NewRootInt)
	enterWorld.SetValue(1)
	ses.SendData(enterWorld.Message(), opcodes.ApproveName_Server)

	sendCharInfo(ses, ses.AccountID)
	return false
}

func HandleCharacterDelete(ses *session.Session, payload []byte, wh *WorldHandler) bool {
	req, err := session.Deserialize(ses, payload, eq.ReadRootString)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return false
	}

	ctx := context.Background()
	name, err := req.Value()
	if err != nil {
		log.Printf("failed to get name from CharCreate struct: %v", err)
		return false
	}
	if err := DeleteCharacter(ctx, ses.AccountID, name); err != nil {
		return false
	}

	sendCharInfo(ses, ses.AccountID)
	return false
}

func HandleRequestClientZoneChange(ses *session.Session, payload []byte, wh *WorldHandler) bool {
	// In this case we know we're forwarding the event so we can copy the payload
	// and deserialize it directly.
	payloadCopy := make([]byte, len(payload))
	copy(payloadCopy, payload)
	req, err := session.Deserialize(ses, payloadCopy, eq.ReadRootRequestClientZoneChange)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return false
	}

	charData := ses.Client.CharData
	if charData == nil {
		log.Printf("client session %d has no character data", ses.SessionID)
		return false
	}
	fromCharacterSelect := req.Type() == 0
	if fromCharacterSelect {
		req.SetX(float32(charData.X))
		req.SetY(float32(charData.Y))
		req.SetZ(float32(charData.Z))
		req.SetHeading(float32(charData.Heading))
		req.SetInstanceId(int32(charData.ZoneInstance))
		req.SetZoneId(int32(charData.ZoneID))
	} else {
		// We are zoning from another zone
		// Get validation logic later for this zone request, for now save off and bust cache

		// First remove client from previous zone
		if ses.ZoneID != -1 {
			zoneInstance, ok := wh.zoneManager.Get(ses.ZoneID, ses.InstanceID)
			if ok {
				zoneInstance.RemoveClient(ses.SessionID)
			}
		}
		charData.X = float64(req.X())
		charData.Y = float64(req.Y())
		charData.Z = float64(req.Z())
		charData.Heading = float64(req.Heading())
		charData.ZoneID = uint32(req.ZoneId())
		charData.ZoneInstance = uint32(req.InstanceId())
		db_character.UpdateCharacter(charData, ses.AccountID)
		ses.ZoneID = int(req.ZoneId())
		ses.InstanceID = int(req.InstanceId())
	}
	return true
}
