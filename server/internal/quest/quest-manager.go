package quest

import (
	"fmt"
	"sync"
	"time"

	db_zone "github.com/knervous/eqgo/internal/db/zone"

	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	entity "github.com/knervous/eqgo/internal/entity"
	"github.com/knervous/eqgo/internal/session"
)

// ZoneAccess provides access to ZoneInstance data for quests.
type ZoneAccess interface {
	// Zone data
	GetZone() *model.Zone
	GetZoneID() int
	GetInstanceID() int

	// Clients
	//GetClients() map[int]ClientEntry
	//GetClientBySessionID(sessionID int) (ClientEntry, bool)

	// NPCs
	GetNPCs() map[int]*entity.NPC
	GetNPCByID(npcID int) (*entity.NPC, bool)

	// Spawning
	GetZonePool() map[int64]*db_zone.SpawnPoolEntry
	GetSpawnTimers() map[int64]time.Time
	GetSpawn2ToNpc() map[int64]int

	// Broadcasting
	BroadcastChannelMessage(senderName, message string, chatChannel int)
}

// ClientEntry mirrors zone.ClientEntry for quest access.
type ClientEntry struct {
	ClientSession *session.Session
}

type QuestEventType uint16

const (
	EventSay QuestEventType = iota
	EventTrade
	EventDeath
	EventSpawn
	EventAttack
	EventCombat
	EventAggro
	EventSlay
	EventNpcSlay
	EventWaypointArrive
	EventWaypointDepart
	EventTimer
	EventSignal
	EventHp
	EventEnter
	EventExit
	EventEnterZone
	EventClickDoor
	EventLoot
	EventZone
	EventLevelUp
	EventKilledMerit
	EventCastOn
	EventTaskAccepted
	EventTaskStageComplete
	EventTaskUpdate
	EventTaskComplete
	EventTaskFail
	EventAggroSay
	EventPlayerPickup
	EventPopupResponse
	EventEnvironmentalDamage
	EventProximitySay
	EventCast
	EventCastBegin
	EventScaleCalc
	EventItemEnterZone
	EventTargetChange
	EventHateList
	EventSpellEffectClient
	EventSpellEffectNpc
	EventSpellEffectBuffTicClient
	EventSpellEffectBuffTicNpc
	EventSpellFade
	EventSpellEffectTranslocateComplete
	EventCombineSuccess
	EventCombineFailure
	EventItemClick
	EventItemClickCast
	EventGroupChange
	EventForageSuccess
	EventForageFailure
	EventFishStart
	EventFishSuccess
	EventFishFailure
	EventClickObject
	EventDiscoverItem
	EventDisconnect
	EventConnect
	EventItemTick
	EventDuelWin
	EventDuelLose
	EventEncounterLoad
	EventEncounterUnload
	EventCommand
	EventDropItem
	EventDestroyItem
	EventFeignDeath
	EventWeaponProc
	EventEquipItem
	EventUnequipItem
	EventAugmentItem
	EventUnaugmentItem
	EventAugmentInsert
	EventAugmentRemove
	EventEnterArea
	EventLeaveArea
	EventRespawn
	EventDeathComplete
	EventUnhandledOpcode
	EventTick
	EventSpawnZone
	EventDeathZone
	EventUseSkill
	EventCombineValidate
	EventBotCommand
	EventWarp
	EventTestBuff
	EventCombine
	EventConsider
	EventConsiderCorpse
	EventLootZone
	EventEquipItemClient
	EventUnequipItemClient
	EventSkillUp
	EventLanguageSkillUp
	EventAltCurrencyMerchantBuy
	EventAltCurrencyMerchantSell
	EventMerchantBuy
	EventMerchantSell
	EventInspect
	EventTaskBeforeUpdate
	EventAaBuy
	EventAaGain
	EventAaExpGain
	EventExpGain
	EventPayload
	EventLevelDown
	EventGmCommand
	EventDespawn
	EventDespawnZone
	EventBotCreate
	EventAugmentInsertClient
	EventAugmentRemoveClient
	EventEquipItemBot
	EventUnequipItemBot
	EventDamageGiven
	EventDamageTaken
	EventItemClickClient
	EventItemClickCastClient
	EventDestroyItemClient
	EventDropItemClient
	EventMemorizeSpell
	EventUnmemorizeSpell
	EventScribeSpell
	EventUnscribeSpell
	EventLootAdded
	EventLdonPointsGain
	EventLdonPointsLoss
	EventAltCurrencyGain
	EventAltCurrencyLoss
	EventCrystalGain
	EventCrystalLoss
	EventTimerPause
	EventTimerResume
	EventTimerStart
	EventTimerStop
	EventEntityVariableDelete
	EventEntityVariableSet
	EventEntityVariableUpdate
	EventAaLoss
	EventSpellBlocked
	EventReadItem
	LargestEventId // sentinel
)

// Big TBD on what data is going in here
type QuestEvent struct {
	EventType     QuestEventType
	Actor         entity.Moblike // will be Actor which can be interpreted as any type of Mob (NPC, PC, Client)
	Receiver      entity.Moblike
	Item          *[]items.ItemInstance
	ZoneData      *[]interface{}
	EncounterName string
	ExtraData     uint32
	SpellID       uint32
	ItemArray     *[]items.ItemInstance
	ActorArray    *[]model.Spawn2
	StringArray   []string
}

type QuestHandler func(*QuestEvent) bool
type ZoneQuestInterface struct {
	ZoneAccess ZoneAccess //
	Mu         sync.RWMutex
	Handlers   map[string]map[QuestEventType]QuestHandler
}

func (z *ZoneQuestInterface) SetZoneAccess(za ZoneAccess) {
	z.ZoneAccess = za
}

func (z *ZoneQuestInterface) Register(name string, events ...any) {
	z.Mu.Lock()
	defer z.Mu.Unlock()
	if z.Handlers == nil {
		z.Handlers = make(map[string]map[QuestEventType]QuestHandler)
	}
	if z.Handlers[name] == nil {
		z.Handlers[name] = make(map[QuestEventType]QuestHandler)
	}
	for i := 0; i < len(events); i += 2 {
		event, ok := events[i].(QuestEventType)
		if !ok {
			panic(fmt.Sprintf("arg %d is not QuestEventType", i))
		}
		switch handler := events[i+1].(type) {
		case QuestHandler:
			z.Handlers[name][event] = handler
		case func(*QuestEvent) bool:
			z.Handlers[name][event] = QuestHandler(handler)
		default:
			panic(fmt.Sprintf("arg %d is not a valid QuestHandler", i+1))
		}
	}
}

func (z *ZoneQuestInterface) Unregister(name string, events ...QuestEventType) {
	z.Mu.Lock()
	defer z.Mu.Unlock()

	if z.Handlers == nil || z.Handlers[name] == nil {
		return
	}

	if len(events) == 0 {
		delete(z.Handlers, name)
		return
	}

	for _, event := range events {
		delete(z.Handlers[name], event)
	}

	if len(z.Handlers[name]) == 0 {
		delete(z.Handlers, name)
	}
}

func (z *ZoneQuestInterface) Invoke(name string, evt *QuestEvent) bool {
	if handlers, ok := z.Handlers[name]; ok {
		if handler, ok := handlers[evt.EventType]; ok {
			return handler(evt)
		}
	}
	return false
}

// Reset the whole struct (zeroing every field).
// The compiler will turn this into a single memclr.
func (e *QuestEvent) Reset() *QuestEvent {
	*e = QuestEvent{}
	return e
}

// Now “builder” methods—each one is just one store + return receiver:
func (e *QuestEvent) Type(t QuestEventType) *QuestEvent {
	e.EventType = t
	return e
}
func (e *QuestEvent) SetActor(a entity.Moblike) *QuestEvent {
	e.Actor = a
	return e
}
func (e *QuestEvent) SetReceiver(r entity.Moblike) *QuestEvent {
	e.Receiver = r
	return e
}
func (e *QuestEvent) Spell(id uint32) *QuestEvent {
	e.SpellID = id
	return e
}
func (e *QuestEvent) Extra(d uint32) *QuestEvent {
	e.ExtraData = d
	return e
}
func (e *QuestEvent) Encounter(name string) *QuestEvent {
	e.EncounterName = name
	return e
}
func (e *QuestEvent) Strings(vals ...string) *QuestEvent {
	e.StringArray = e.StringArray[:0]
	e.StringArray = append(e.StringArray, vals...)
	return e
}
