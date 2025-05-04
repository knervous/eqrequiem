package quests

import (
	"fmt"

	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

type ZoneIndex uint16
type QuestEventType uint16
type QuestHandler func(*QuestEvent) bool
type QuestInterfaceType map[string]map[QuestEventType]QuestHandler

const (
	Qeynos ZoneIndex = 1 + iota
	Qeynos2
	Qrg
	Qeytoqrg

	MaxZoneIndex
)
const (
	EVENT_SAY QuestEventType = iota
	EVENT_TRADE
	EVENT_DEATH
	EVENT_SPAWN
	EVENT_ATTACK
	EVENT_COMBAT
	EVENT_AGGRO
	EVENT_SLAY
	EVENT_NPC_SLAY
	EVENT_WAYPOINT_ARRIVE
	EVENT_WAYPOINT_DEPART
	EVENT_TIMER
	EVENT_SIGNAL
	EVENT_HP
	EVENT_ENTER
	EVENT_EXIT
	EVENT_ENTER_ZONE
	EVENT_CLICK_DOOR
	EVENT_LOOT
	EVENT_ZONE
	EVENT_LEVEL_UP
	EVENT_KILLED_MERIT
	EVENT_CAST_ON
	EVENT_TASK_ACCEPTED
	EVENT_TASK_STAGE_COMPLETE
	EVENT_TASK_UPDATE
	EVENT_TASK_COMPLETE
	EVENT_TASK_FAIL
	EVENT_AGGRO_SAY
	EVENT_PLAYER_PICKUP
	EVENT_POPUP_RESPONSE
	EVENT_ENVIRONMENTAL_DAMAGE
	EVENT_PROXIMITY_SAY
	EVENT_CAST
	EVENT_CAST_BEGIN
	EVENT_SCALE_CALC
	EVENT_ITEM_ENTER_ZONE
	EVENT_TARGET_CHANGE
	EVENT_HATE_LIST
	EVENT_SPELL_EFFECT_CLIENT
	EVENT_SPELL_EFFECT_NPC
	EVENT_SPELL_EFFECT_BUFF_TIC_CLIENT
	EVENT_SPELL_EFFECT_BUFF_TIC_NPC
	EVENT_SPELL_FADE
	EVENT_SPELL_EFFECT_TRANSLOCATE_COMPLETE
	EVENT_COMBINE_SUCCESS
	EVENT_COMBINE_FAILURE
	EVENT_ITEM_CLICK
	EVENT_ITEM_CLICK_CAST
	EVENT_GROUP_CHANGE
	EVENT_FORAGE_SUCCESS
	EVENT_FORAGE_FAILURE
	EVENT_FISH_START
	EVENT_FISH_SUCCESS
	EVENT_FISH_FAILURE
	EVENT_CLICK_OBJECT
	EVENT_DISCOVER_ITEM
	EVENT_DISCONNECT
	EVENT_CONNECT
	EVENT_ITEM_TICK
	EVENT_DUEL_WIN
	EVENT_DUEL_LOSE
	EVENT_ENCOUNTER_LOAD
	EVENT_ENCOUNTER_UNLOAD
	EVENT_COMMAND
	EVENT_DROP_ITEM
	EVENT_DESTROY_ITEM
	EVENT_FEIGN_DEATH
	EVENT_WEAPON_PROC
	EVENT_EQUIP_ITEM
	EVENT_UNEQUIP_ITEM
	EVENT_AUGMENT_ITEM
	EVENT_UNAUGMENT_ITEM
	EVENT_AUGMENT_INSERT
	EVENT_AUGMENT_REMOVE
	EVENT_ENTER_AREA
	EVENT_LEAVE_AREA
	EVENT_RESPAWN
	EVENT_DEATH_COMPLETE
	EVENT_UNHANDLED_OPCODE
	EVENT_TICK
	EVENT_SPAWN_ZONE
	EVENT_DEATH_ZONE
	EVENT_USE_SKILL
	EVENT_COMBINE_VALIDATE
	EVENT_BOT_COMMAND
	EVENT_WARP
	EVENT_TEST_BUFF
	EVENT_COMBINE
	EVENT_CONSIDER
	EVENT_CONSIDER_CORPSE
	EVENT_LOOT_ZONE
	EVENT_EQUIP_ITEM_CLIENT
	EVENT_UNEQUIP_ITEM_CLIENT
	EVENT_SKILL_UP
	EVENT_LANGUAGE_SKILL_UP
	EVENT_ALT_CURRENCY_MERCHANT_BUY
	EVENT_ALT_CURRENCY_MERCHANT_SELL
	EVENT_MERCHANT_BUY
	EVENT_MERCHANT_SELL
	EVENT_INSPECT
	EVENT_TASK_BEFORE_UPDATE
	EVENT_AA_BUY
	EVENT_AA_GAIN
	EVENT_AA_EXP_GAIN
	EVENT_EXP_GAIN
	EVENT_PAYLOAD
	EVENT_LEVEL_DOWN
	EVENT_GM_COMMAND
	EVENT_DESPAWN
	EVENT_DESPAWN_ZONE
	EVENT_BOT_CREATE
	EVENT_AUGMENT_INSERT_CLIENT
	EVENT_AUGMENT_REMOVE_CLIENT
	EVENT_EQUIP_ITEM_BOT
	EVENT_UNEQUIP_ITEM_BOT
	EVENT_DAMAGE_GIVEN
	EVENT_DAMAGE_TAKEN
	EVENT_ITEM_CLICK_CLIENT
	EVENT_ITEM_CLICK_CAST_CLIENT
	EVENT_DESTROY_ITEM_CLIENT
	EVENT_DROP_ITEM_CLIENT
	EVENT_MEMORIZE_SPELL
	EVENT_UNMEMORIZE_SPELL
	EVENT_SCRIBE_SPELL
	EVENT_UNSCRIBE_SPELL
	EVENT_LOOT_ADDED
	EVENT_LDON_POINTS_GAIN
	EVENT_LDON_POINTS_LOSS
	EVENT_ALT_CURRENCY_GAIN
	EVENT_ALT_CURRENCY_LOSS
	EVENT_CRYSTAL_GAIN
	EVENT_CRYSTAL_LOSS
	EVENT_TIMER_PAUSE
	EVENT_TIMER_RESUME
	EVENT_TIMER_START
	EVENT_TIMER_STOP
	EVENT_ENTITY_VARIABLE_DELETE
	EVENT_ENTITY_VARIABLE_SET
	EVENT_ENTITY_VARIABLE_UPDATE
	EVENT_AA_LOSS
	EVENT_SPELL_BLOCKED
	EVENT_READ_ITEM
	_LargestEventID // sentinel
)

type QuestEvent struct {
	EventType     QuestEventType
	Actor         int
	Receiver      int
	Item          *[]items.ItemInstance
	ZoneData      *[]interface{}
	EncounterName string
	ExtraData     uint32
	SpellID       uint32
	ItemArray     *[]items.ItemInstance
	ActorArray    *[]model.Spawn2
	StringArray   []string
}

type ZoneQuestInterface struct {
	Npc  QuestInterfaceType
	Pc   QuestInterfaceType
	Item QuestInterfaceType
}

func (z *ZoneQuestInterface) HandleNpcEvent(name string, evt *QuestEvent) bool {
	if handlers, ok := z.Npc[name]; ok {
		if handler, ok := handlers[evt.EventType]; ok {
			return handler(evt)
		}
	}
	return false
}

func (z *ZoneQuestInterface) HandlePcEvent(name string, evt *QuestEvent) bool {
	if handlers, ok := z.Pc[name]; ok {
		if handler, ok := handlers[evt.EventType]; ok {
			return handler(evt)
		}
	}
	return false
}

func (z *ZoneQuestInterface) HandleItemEvent(itemID string, evt *QuestEvent) bool {
	if handlers, ok := z.Item[itemID]; ok {
		if handler, ok := handlers[evt.EventType]; ok {
			return handler(evt)
		}
	}
	return false
}

func NewZoneQuest() *ZoneQuestInterface {
	return &ZoneQuestInterface{
		Npc:  make(QuestInterfaceType),
		Pc:   make(QuestInterfaceType),
		Item: make(QuestInterfaceType),
	}
}

type EventHandler struct {
	Event   QuestEventType
	Handler QuestHandler
}

func Register(pairs ...any) map[QuestEventType]QuestHandler {
	if len(pairs)%2 != 0 {
		panic("Register expects pairs of (QuestEventType, QuestHandler) pairs")
	}

	m := make(map[QuestEventType]QuestHandler, len(pairs)/2)

	for i := 0; i < len(pairs); i += 2 {
		event, ok := pairs[i].(QuestEventType)
		if !ok {
			panic(fmt.Sprintf("argument %d is not a QuestEventType", i))
		}

		switch handler := pairs[i+1].(type) {
		case QuestHandler:
			m[event] = handler
		case func(*QuestEvent) bool:
			m[event] = QuestHandler(handler)
		default:
			panic(fmt.Sprintf("argument %d is not a valid QuestHandler", i+1))
		}
	}

	return m
}
