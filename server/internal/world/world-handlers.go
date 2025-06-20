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

func HandleJWTLogin(ses *session.Session, payload []byte, wh *WorldHandler) {
	ctx := context.Background()
	jwtLogin, err := session.Deserialize(ses, payload, eq.ReadRootJWTLogin)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}

	token, err := jwtLogin.Token()
	if err != nil {
		log.Printf("failed to get token from JWTLogin struct: %v", err)
		return
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
				return
			}
			jwtResponse.SetStatus(-100)
			err = ses.SendData(jwtResponse.Message(), opcodes.JWTResponse)
			return
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
		return
	}

	ses.AccountID = accountID
	ses.Authenticated = true
	jwtResponse, err := session.NewMessage(ses, eq.NewRootJWTResponse)
	if err != nil {
		log.Printf("failed to create JWTResponse: %v", err)
		return
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
}

func HandleEnterWorld(ses *session.Session, payload []byte, wh *WorldHandler) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootEnterWorld)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}
	fmt.Println("Got enter world")

	name, err := req.Name()
	if err != nil {
		log.Printf("failed to get name from EnterWorld struct: %v", err)
		return
	}
	if accountMatch, err := AccountHasCharacterName(context.Background(), ses.AccountID, name); err != nil || !accountMatch {
		log.Printf("Tried to log in unsuccessfully from account %d with character %q: %v", ses.AccountID, req.Name, err)
		return
	}
	ses.CharacterName = name

	enterWorld, err := session.NewMessage(ses, eq.NewRootInt)
	if err != nil {
		log.Printf("failed to create EnterWorld message: %v", err)
		return
	}
	enterWorld.SetValue(1)
	ses.SendData(enterWorld.Message(), opcodes.PostEnterWorld)
}

func HandleZoneSession(ses *session.Session, payload []byte, wh *WorldHandler) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootZoneSession)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}

	charData, err := db_character.GetCharacterByName(ses.CharacterName)
	if err != nil {
		log.Printf("failed to get character %q for accountID %d: %v", ses.CharacterName, ses.AccountID, err)
		return
	}
	ses.Client = &entity.Client{
		CharData: charData,
	}
	ses.ZoneID = int(req.ZoneId())
	ses.InstanceID = int(req.InstanceId())

	enterWorld, err := session.NewMessage(ses, eq.NewRootInt)
	if err != nil {
		log.Printf("failed to create EnterWorld message: %v", err)
		return
	}
	enterWorld.SetValue(1)
	ses.SendData(enterWorld.Message(), opcodes.ZoneSessionValid)

}

func HandleCharacterCreate(ses *session.Session, payload []byte, wh *WorldHandler) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootCharCreate)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}

	name, err := req.Name()
	if err != nil {
		log.Printf("failed to get name from CharCreate struct: %v", err)
		return
	}
	if !ValidateName(name) {
		enterWorld, _ := session.NewMessage(ses, eq.NewRootInt)
		enterWorld.SetValue(0)
		ses.SendData(enterWorld.Message(), opcodes.ApproveName_Server)
		return
	}

	if !CharacterCreate(ses, ses.AccountID, req) {
		enterWorld, _ := session.NewMessage(ses, eq.NewRootInt)
		enterWorld.SetValue(0)
		ses.SendData(enterWorld.Message(), opcodes.ApproveName_Server)
		return
	}
	enterWorld, _ := session.NewMessage(ses, eq.NewRootInt)
	enterWorld.SetValue(1)
	ses.SendData(enterWorld.Message(), opcodes.ApproveName_Server)

	sendCharInfo(ses, ses.AccountID)
}

func HandleCharacterDelete(ses *session.Session, payload []byte, wh *WorldHandler) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootString)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}

	ctx := context.Background()
	name, err := req.Value()
	if err != nil {
		log.Printf("failed to get name from CharCreate struct: %v", err)
		return
	}
	if err := DeleteCharacter(ctx, ses.AccountID, name); err != nil {
		return
	}

	sendCharInfo(ses, ses.AccountID)
}
