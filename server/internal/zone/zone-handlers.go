package zone

import (
	"context"
	"fmt"
	"log"
	"strings"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/constants"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/quest"

	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/db/items"
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
	if strings.Trim(targetName, " ") == "" {
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
	// 1) get old position
	oldPos := ses.Client.Position()

	// 2) parse new position from request
	newPosition := entity.MobPosition{
		X:       float64(req.X()),
		Y:       float64(req.Y()),
		Z:       float64(req.Z()),
		Heading: float64(req.Heading()),
	}

	// 3) compute velocity as delta position
	vel := entity.Velocity{
		X: newPosition.X - oldPos.X,
		Y: newPosition.Y - oldPos.Y,
		Z: newPosition.Z - oldPos.Z,
	}

	// 4) update session client state
	ses.Client.SetVelocity(vel)

	clientSession := z.ClientEntries[ses.SessionID]
	ses.Client.SetPosition(newPosition)
	z.markMoved(clientSession.EntityId, newPosition)

	anim, err := req.Animation()
	if err != nil {
		return
	}

	if ses.Client.Mob.Animation != anim {
		ses.Client.Mob.Animation = anim
		pkt := func(m eq.EntityAnimation) error {
			err := m.SetAnimation(anim)
			if err != nil {
				log.Printf("failed to set animation: %v", err)
				return err
			}
			m.SetSpawnId(int32(ses.Client.GetMob().ID()))
			return nil
		}
		spawnId := int32(ses.Client.GetMob().ID())
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
	dbZone, err := db_zone.GetZoneById(context.Background(), int(charData.ZoneID))
	if err != nil {
		log.Printf("failed to get zone %d: %v", req.ZoneId(), err)
		return
	}
	fmt.Println("zone data", dbZone)

	characterSkills, err := db_character.GetCharacterSkills(context.Background(), int64(charData.ID))
	if err != nil {
		log.Printf("failed to get character skills for character %d: %v", charData.ID, err)
		return
	}

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
		log.Printf("failed to get zone points for zone %d: %v", newZone.ZoneIdNumber(), err)
		return
	}
	zp, err := newZone.NewZonePoints(int32(len(zonePoints)))
	if err != nil {
		log.Printf("failed to create NewZone message: %v", err)
		return
	}
	for i, zonePoint := range zonePoints {
		zonePointProto := zp.At(i)
		zonePointProto.SetX(float32(zonePoint.TargetX))
		zonePointProto.SetY(float32(zonePoint.TargetY))
		zonePointProto.SetZ(float32(zonePoint.TargetZ))
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
	playerProfile.SetExp(int32(charData.Exp))
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
	playerProfile.SetDeity(int32(charData.Deity))
	playerProfile.SetAaPoints(int32(charData.AaPoints))

	// Inventory
	charItems, err := db_character.GetCharacterItems(context.Background(), int(charData.ID))
	if err != nil {
		log.Printf("failed to get character items for character %d: %v", charData.ID, err)
		return
	}

	charItemsLength := int32(len(charItems))
	capCharItems, err := playerProfile.NewInventoryItems(charItemsLength)
	if err != nil {
		log.Printf("failed to create InventoryItems array: %v", err)
		return
	}
	for itemIdx, charItem := range charItems {
		itemTemplate, err := items.GetItemTemplateByID(charItem.ItemID)
		if err != nil {
			log.Printf("failed to get item template for itemID %d: %v", charItem.ItemID, err)
			continue
		}

		item := capCharItems.At(itemIdx)
		item.SetCharges(uint32(charItem.Charges))
		item.SetQuantity(uint32(charItem.Quantity))
		item.SetMods(*charItem.Mods)
		item.SetSlot(int32(charItem.Slot))
		items.ConvertItemTemplateToCapnp(ses, &itemTemplate, &item)
	}

	// Derived stats
	mob := ses.Client.Mob
	playerProfile.SetAc(int32(mob.AC))
	playerProfile.SetMagicResist(mob.MR)
	playerProfile.SetFireResist(mob.FR)
	playerProfile.SetColdResist(mob.CR)
	playerProfile.SetPoisonResist(mob.PR)
	playerProfile.SetDiseaseResist(mob.DR)
	playerProfile.SetAttack(int32(mob.ATK))
	playerProfile.SetCurHp(int32(mob.CurrentHp))
	playerProfile.SetMana(int32(mob.CurrentMana))
	playerProfile.SetMaxHp(int64(mob.MaxHp))
	playerProfile.SetMaxMana(int64(mob.MaxMana))

	// Skills
	skills, err := playerProfile.NewSkills(int32(constants.Skill_HIGHEST) + 1)
	if err != nil {
		log.Printf("failed to create Skills array: %v", err)
		return
	}
	for _, skill := range characterSkills {
		skills.Set(int(skill.SkillID), int32(skill.Value))
	}
	playerProfile.SetSkills(skills)

	// TODO stats fill the rest of this out

	ses.SendStream(playerProfile.Message(), opcodes.PlayerProfile)

	// Send all zone spawns
	spawns, err := session.NewMessage(ses, eq.NewRootSpawns)
	if err != nil {
		log.Printf("failed to create Spawns message: %v", err)
		return
	}
	spawnArray, err := spawns.NewSpawns(int32(len(z.Npcs))) // +1 for the player character spawn
	if err != nil {
		log.Printf("failed to create Spawns array: %v", err)
		return
	}
	spawnIdx := 0
	for _, npc := range z.Npcs {
		if npc.ID() == clientEntry.EntityId {
			// Skip the player character spawn
			continue
		}
		spawn := spawnArray.At(spawnIdx)
		spawnIdx++
		spawn.SetRace(int32(npc.NpcData.Race))
		spawn.SetCharClass(int32(npc.NpcData.Class))
		spawn.SetLevel(int32(npc.NpcData.Level))
		spawn.SetName(npc.Name())
		spawn.SetSize(float32(npc.NpcData.Size))
		spawn.SetFace(int32(npc.NpcData.Face))
		spawn.SetSpawnId(int32(npc.ID()))
		spawn.SetIsNpc(1)
		spawn.SetGender(int32(npc.NpcData.Gender))
		spawn.SetX(int32(npc.X))
		spawn.SetY(int32(npc.Y))
		spawn.SetZ(int32(npc.Z))
		spawn.SetBodytype(int32(npc.NpcData.Bodytype))
		spawn.SetHelm(int32(npc.NpcData.Helmtexture))
		spawn.SetEquipChest(int32(npc.NpcData.Texture))
		spawn.SetHeading(int32(npc.Heading))
		c := worldToCell(npc.Mob.X, npc.Mob.Y, npc.Mob.Z)
		spawn.SetCellX(int32(c[0]))
		spawn.SetCellY(int32(c[1]))
		spawn.SetCellZ(int32(c[2]))

	}
	err = ses.SendStream(spawns.Message(), opcodes.BatchZoneSpawns)
	if err != nil {
		log.Printf("failed to send Spawn message: %v", err)
		return
	}
	z.registerNewClientGrid(clientEntry.EntityId, entity.MobPosition{
		X: charData.X, Y: charData.Y, Z: charData.Z, Heading: charData.Heading,
	})

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
