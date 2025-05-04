package quest

import (
	"fmt"
	"sync"

	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	entity "github.com/knervous/eqgo/internal/entities"
)

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
	mu       sync.RWMutex
	handlers map[string]map[QuestEventType]QuestHandler
}

func (z *ZoneQuestInterface) Register(name string, events ...any) {
	z.mu.Lock()
	defer z.mu.Unlock()
	if z.handlers == nil {
		z.handlers = make(map[string]map[QuestEventType]QuestHandler)
	}
	if z.handlers[name] == nil {
		z.handlers[name] = make(map[QuestEventType]QuestHandler)
	}
	for i := 0; i < len(events); i += 2 {
		event, ok := events[i].(QuestEventType)
		if !ok {
			panic(fmt.Sprintf("arg %d is not QuestEventType", i))
		}
		switch handler := events[i+1].(type) {
		case QuestHandler:
			z.handlers[name][event] = handler
		case func(*QuestEvent) bool:
			z.handlers[name][event] = QuestHandler(handler)
		default:
			panic(fmt.Sprintf("arg %d is not a valid QuestHandler", i+1))
		}
	}
}

func (z *ZoneQuestInterface) Unregister(name string, events ...QuestEventType) {
	z.mu.Lock()
	defer z.mu.Unlock()

	if z.handlers == nil || z.handlers[name] == nil {
		return
	}

	if len(events) == 0 {
		delete(z.handlers, name)
		return
	}

	for _, event := range events {
		delete(z.handlers[name], event)
	}

	if len(z.handlers[name]) == 0 {
		delete(z.handlers, name)
	}
}

func (z *ZoneQuestInterface) Invoke(name string, evt *QuestEvent) bool {
	z.mu.RLock()
	defer z.mu.RUnlock()
	if handlers, ok := z.handlers[name]; ok {
		if handler, ok := handlers[evt.EventType]; ok {
			return handler(evt)
		}
	}
	return false
}
