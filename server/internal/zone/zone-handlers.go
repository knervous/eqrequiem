package zone

import (
	"context"
	"fmt"
	"log"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/quest"

	db_character "github.com/knervous/eqgo/internal/db/character"
	db_zone "github.com/knervous/eqgo/internal/db/zone"
	"github.com/knervous/eqgo/internal/session"
)

func HandleChannelMessage(z *ZoneInstance, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootChannelMessage)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}
	targetName, err := req.Targetname()
	if err != nil {
		log.Printf("failed to get target name: %v", err)
		return
	}
	message, err := req.Message_()
	if err != nil {
		log.Printf("failed to get message: %v", err)
		return
	}
	z.QuestInterface.Invoke(targetName, z.QE().Type(quest.EventSay).SetActor(&entity.Client{
		Mob: entity.Mob{
			MobName: ses.Client.CharData.Name,
		},
	}).SetReceiver(z.GetNPCByName(targetName)))
	charData := ses.Client.CharData

	z.BroadcastChannelMessage(charData.Name, message, int(req.ChanNum()))
}

func HandleClientUpdate(z *ZoneInstance, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootClientPositionUpdate)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}
	newPosition := entity.MobPosition{
		X:       req.X(),
		Y:       req.Y(),
		Z:       req.Z(),
		Heading: req.Heading(),
	}
	clientSession := z.ClientEntries[ses.SessionID]
	ses.Client.SetPosition(newPosition)
	z.markMoved(clientSession.EntityId, newPosition)
}

func HandleClientAnimation(z *ZoneInstance, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootEntityAnimation)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}
	animation, err := req.Animation()
	if err != nil {
		log.Printf("failed to get animation: %v", err)
		return
	}

	pkt := func(m eq.EntityAnimation) error {
		err := m.SetAnimation(animation)
		if err != nil {
			log.Printf("failed to set animation: %v", err)
			return err
		}
		m.SetSpawnId(req.SpawnId())
		return nil
	}
	spawnId := req.SpawnId()
	for entityId := range z.subs[int(spawnId)] {
		if entityId == int(spawnId) {
			continue
		}
		if cs := z.ClientEntriesByEntityID[entityId].ClientSession; cs != nil && cs != ses {
			session.QueueDatagram(
				cs,
				eq.NewRootEntityAnimation,
				opcodes.Animation,
				pkt,
			)
		}
	}

}

func HandleRequestClientZoneChange(z *ZoneInstance, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootRequestClientZoneChange)
	if err != nil {
		log.Printf("failed to read JWTLogin struct: %v", err)
		return
	}

	charData := ses.Client.CharData
	if charData == nil {
		log.Printf("client session %d has no character data", ses.SessionID)
		return
	}
	clientEntry := z.ClientEntries[ses.SessionID]
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

	newZone, err := session.NewMessage(ses, eq.NewRootNewZone)
	if err != nil {
		log.Printf("failed to create NewZone message: %v", err)
		return
	}
	newZone.SetShortName(*dbZone.ShortName)
	newZone.SetLongName(dbZone.LongName)
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

	// PlayerProfile

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
	playerProfile.SetSpawnId(int32(clientEntry.EntityId))
	ses.SendStream(playerProfile.Message(), opcodes.PlayerProfile)

	// Send all zone spawns
	for _, npc := range z.Npcs {
		spawn, err := session.NewMessage(ses, eq.NewRootSpawn)
		if err != nil {
			log.Printf("failed to create Spawn message: %v", err)
			return
		}
		spawn.SetRace(int32(npc.NpcData.Race))
		spawn.SetCharClass(int32(npc.NpcData.Class))
		spawn.SetLevel(int32(npc.NpcData.Level))
		spawn.SetName(npc.Name())
		spawn.SetSpawnId(int32(npc.ID()))
		spawn.SetIsNpc(1)
		spawn.SetX(int32(npc.X))
		spawn.SetY(int32(npc.Y))
		spawn.SetZ(int32(npc.Z))
		spawn.SetHeading(int32(npc.Heading))
		c := worldToCell(npc.Position.X, npc.Position.Y, npc.Position.Z)
		spawn.SetCellX(int32(c[0]))
		spawn.SetCellY(int32(c[1]))
		spawn.SetCellZ(int32(c[2]))
		ses.SendStream(spawn.Message(), opcodes.ZoneSpawns)

		// TODO fill out rest of struct
	}
	z.registerNewClientGrid(clientEntry.EntityId, entity.MobPosition{X: float32(charData.X), Y: float32(charData.Y), Z: float32(charData.Z), Heading: float32(charData.Heading)})

	// Send all client entities
	for sessionId, client := range z.ClientEntries {
		if sessionId == ses.SessionID || client.ClientSession == nil {
			continue
		}
		pcData := client.ClientSession.Client.CharData
		if pcData == nil {
			log.Printf("client session %d has no character data", client.ClientSession.SessionID)
			continue
		}
		pc, err := session.NewMessage(ses, eq.NewRootSpawn)
		if err != nil {
			log.Printf("failed to create ClientSpawn message: %v", err)
			return
		}
		pc.SetRace(int32(pcData.Race))
		pc.SetCharClass(int32(pcData.Class))
		pc.SetLevel(int32(pcData.Level))
		pc.SetName(pcData.Name)
		pc.SetIsNpc(0)
		pc.SetSpawnId(int32(client.EntityId))
		pc.SetX(int32(pcData.X))
		pc.SetY(int32(pcData.Y))
		pc.SetZ(int32(pcData.Z))
		pc.SetHeading(int32(pcData.Heading))
		ses.SendStream(pc.Message(), opcodes.ZoneSpawns)

		session.QueueMessage(
			client.ClientSession,
			eq.NewRootSpawn,
			opcodes.ZoneSpawns,
			func(me eq.Spawn) error {
				me.SetRace(int32(charData.Race))
				me.SetCharClass(int32(charData.Class))
				me.SetLevel(int32(charData.Level))
				me.SetName(charData.Name)
				me.SetSpawnId(int32(clientEntry.EntityId))
				me.SetIsNpc(0)
				me.SetX(int32(charData.X))
				me.SetY(int32(charData.Y))
				me.SetZ(int32(charData.Z))
				me.SetHeading(int32(charData.Heading))
				return nil
			},
		)
	}
}
