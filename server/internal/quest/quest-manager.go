package quest

import (
	"fmt"
	"sync"

	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/ports/client"
	"github.com/knervous/eqgo/internal/session"
)

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
	Actor         client.Entity // will be Actor which can be interpreted as any type of Mob (NPC, PC, Client)
	Receiver      client.Entity
	Item          *[]constants.ItemInstance
	ZoneData      *[]interface{}
	EncounterName string
	ExtraData     uint32
	SpellID       uint32
	ItemArray     *[]constants.ItemInstance
	ActorArray    *[]model.Spawn2
	StringArray   []string
	ZoneAccess    client.ZoneAccess
}

type QuestHandler func(*QuestEvent) bool
type ZoneQuestInterface struct {
	ZoneAccess client.ZoneAccess //
	Mu         sync.RWMutex
	Handlers   map[string]map[QuestEventType]QuestHandler
}

func (z *ZoneQuestInterface) SetZoneAccess(za client.ZoneAccess) {
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
	// First check for global handler and try to invoke it
	if z == nil {
		return false
	}
	if globalHandler, ok := z.Handlers[""]; ok {
		if handler, ok := globalHandler[evt.EventType]; ok {
			stopPropagation := handler(evt)
			// If we want to stop propagating downwards to specific NPC handlers
			// we return true here, which will prevent further processing.
			if stopPropagation {
				return true
			}
		}
	}
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
func (e *QuestEvent) SetActor(a client.Entity) *QuestEvent {
	e.Actor = a
	return e
}
func (e *QuestEvent) SetReceiver(r client.Entity) *QuestEvent {
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
