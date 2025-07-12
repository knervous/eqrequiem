package zone

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/api/opcodes"
	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/ports/client"
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
	if recv, ok := z.NPCByName(targetName); ok && recv != nil {
		z.QuestInterface.Invoke(targetName, z.QE().Type(quest.EventSay).SetActor(ses.Client).SetReceiver(recv))
	}

	z.BroadcastChannel(ses.Client.CharData().Name, int(req.ChanNum()), message)
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
	newPosition := client.MobPosition{
		X:       float64(req.X()),
		Y:       float64(req.Y()),
		Z:       float64(req.Z()),
		Heading: float64(req.Heading()),
	}

	// 3) compute velocity as delta position
	vel := client.Velocity{
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

	if ses.Client.Mob().Animation != anim {
		ses.Client.Mob().Animation = anim
		pkt := func(m eq.EntityAnimation) error {
			err := m.SetAnimation(anim)
			if err != nil {
				log.Printf("failed to set animation: %v", err)
				return err
			}
			m.SetSpawnId(int32(ses.Client.ID()))
			return nil
		}
		spawnId := int32(ses.Client.ID())
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

	charData := ses.Client.CharData()
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
	charItems := ses.Client.Items()
	charItemsLength := int32(len(charItems))
	capCharItems, err := playerProfile.NewInventoryItems(charItemsLength)
	if err != nil {
		log.Printf("failed to create InventoryItems array: %v", err)
		return
	}
	itemIdx := 0
	for slot, charItem := range charItems {
		if charItem == nil {
			continue
		}
		mods, err := json.Marshal(charItem.Instance.Mods)
		if err != nil {
			log.Printf("failed to marshal mods for itemID %d: %v", charItem.Instance.ItemID, err)
			continue
		}

		item := capCharItems.At(itemIdx)
		itemIdx++
		item.SetCharges(uint32(charItem.Instance.Charges))
		item.SetQuantity(uint32(charItem.Instance.Quantity))
		item.SetMods(string(mods))
		item.SetSlot(slot)
		items.ConvertItemTemplateToCapnp(ses, &charItem.Item, &item)
	}

	// Derived stats
	mob := ses.Client.Mob()
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
		npcData := npc.NpcData()
		position := npc.Position()
		spawn.SetRace(int32(npcData.Race))
		spawn.SetCharClass(int32(npcData.Class))
		spawn.SetLevel(int32(npcData.Level))
		spawn.SetName(npc.Name())
		spawn.SetSize(float32(npcData.Size))
		spawn.SetFace(int32(npcData.Face))
		spawn.SetSpawnId(int32(npc.ID()))
		spawn.SetIsNpc(1)
		spawn.SetGender(int32(npcData.Gender))
		spawn.SetX(int32(position.X))
		spawn.SetY(int32(position.Y))
		spawn.SetZ(int32(position.Z))
		spawn.SetBodytype(int32(npcData.Bodytype))
		spawn.SetHelm(int32(npcData.Helmtexture))
		spawn.SetEquipChest(int32(npcData.Texture))
		spawn.SetHeading(int32(position.Heading))
		c := worldToCell(position.X, position.Y, position.Z)
		spawn.SetCellX(int32(c[0]))
		spawn.SetCellY(int32(c[1]))
		spawn.SetCellZ(int32(c[2]))

	}
	err = ses.SendStream(spawns.Message(), opcodes.BatchZoneSpawns)
	if err != nil {
		log.Printf("failed to send Spawn message: %v", err)
		return
	}
	z.registerNewClientGrid(clientEntry.EntityId, client.MobPosition{
		X: charData.X, Y: charData.Y, Z: charData.Z, Heading: charData.Heading,
	})

	// Send all client entities
	for sessionId, client := range z.ClientEntries {
		if sessionId == ses.SessionID || client.ClientSession == nil {
			continue
		}
		pcData := client.ClientSession.Client.CharData()
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

func HandleMoveItem(z *ZoneInstance, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootMoveItem)
	if err != nil {
		log.Printf("failed to read MoveItem request: %v", err)
		return
	}

	fromSlot := req.FromSlot()
	toSlot := req.ToSlot()
	// numberInStack := req.NumberInStack()

	// Will do the validation logic down in this function to make sure
	// Characters can equip an item etc.
	err = items.SwapItemSlots(int32(ses.Client.CharData().ID), fromSlot, toSlot, int8(req.BagSlot()))
	if err != nil {
		// Send some kind of notification if it's illegal, i.e. bypassing client logic probably
		log.Printf("failed to swap item slots: %v", err)
		return
	}
	charItems := ses.Client.Items()
	tempFrom := charItems[fromSlot]
	tempTo := charItems[toSlot]
	charItems[fromSlot] = tempTo
	charItems[toSlot] = tempFrom

	if constants.IsVisibleSlot(fromSlot) && charItems[fromSlot] != nil {
		z.broadcastWearChange(ses.Client.ID(), fromSlot, charItems[fromSlot])
	}

	if constants.IsVisibleSlot(toSlot) && charItems[toSlot] != nil {
		z.broadcastWearChange(ses.Client.ID(), toSlot, charItems[toSlot])
	}

	moveItemPacket, err := session.NewMessage(ses, eq.NewRootMoveItem)
	if err != nil {
		log.Printf("failed to create ClientSpawn message: %v", err)
		return
	}
	moveItemPacket.SetFromSlot(fromSlot)
	moveItemPacket.SetToSlot(toSlot)
	moveItemPacket.SetNumberInStack(1) // just for now until we do stacks
	moveItemPacket.SetBagSlot(0)       // Just for now until we get bags in
	ses.SendStream(moveItemPacket.Message(), opcodes.MoveItem)
}

func HandleCamp(z *ZoneInstance, ses *session.Session, payload []byte) {
	savePlayerData(ses)
	z.RemoveClient(ses.SessionID)
}

func HandleGMCommand(z *ZoneInstance, ses *session.Session, payload []byte) {
	req, err := session.Deserialize(ses, payload, eq.ReadRootCommandMessage)
	if err != nil {
		return
	}

	command, err := req.Command()
	if err != nil {
		return
	}
	args, err := req.Args()
	if err != nil {
		return
	}
	// turns args to string slice
	argsSlice := make([]string, 0, args.Len())
	for i := 0; i < args.Len(); i++ {
		arg, err := args.At(i)
		if err != nil {
			return
		}
		argsSlice = append(argsSlice, arg)
	}
	z.HandleCommand(ses, command, argsSlice)
}
