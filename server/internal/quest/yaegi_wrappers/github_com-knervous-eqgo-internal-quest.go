// Code generated by 'yaegi extract github.com/knervous/eqgo/internal/quest'. DO NOT EDIT.

package yaegi_wrappers

import (
	"github.com/knervous/eqgo/internal/quest"
	"reflect"
)

var Symbols = make(map[string]map[string]reflect.Value)


func init() {
	Symbols["github.com/knervous/eqgo/internal/quest/quest"] = map[string]reflect.Value{
		// function, constant and variable definitions
		"EventAaBuy":                          reflect.ValueOf(quest.EventAaBuy),
		"EventAaExpGain":                      reflect.ValueOf(quest.EventAaExpGain),
		"EventAaGain":                         reflect.ValueOf(quest.EventAaGain),
		"EventAaLoss":                         reflect.ValueOf(quest.EventAaLoss),
		"EventAggro":                          reflect.ValueOf(quest.EventAggro),
		"EventAggroSay":                       reflect.ValueOf(quest.EventAggroSay),
		"EventAltCurrencyGain":                reflect.ValueOf(quest.EventAltCurrencyGain),
		"EventAltCurrencyLoss":                reflect.ValueOf(quest.EventAltCurrencyLoss),
		"EventAltCurrencyMerchantBuy":         reflect.ValueOf(quest.EventAltCurrencyMerchantBuy),
		"EventAltCurrencyMerchantSell":        reflect.ValueOf(quest.EventAltCurrencyMerchantSell),
		"EventAttack":                         reflect.ValueOf(quest.EventAttack),
		"EventAugmentInsert":                  reflect.ValueOf(quest.EventAugmentInsert),
		"EventAugmentInsertClient":            reflect.ValueOf(quest.EventAugmentInsertClient),
		"EventAugmentItem":                    reflect.ValueOf(quest.EventAugmentItem),
		"EventAugmentRemove":                  reflect.ValueOf(quest.EventAugmentRemove),
		"EventAugmentRemoveClient":            reflect.ValueOf(quest.EventAugmentRemoveClient),
		"EventBotCommand":                     reflect.ValueOf(quest.EventBotCommand),
		"EventBotCreate":                      reflect.ValueOf(quest.EventBotCreate),
		"EventCast":                           reflect.ValueOf(quest.EventCast),
		"EventCastBegin":                      reflect.ValueOf(quest.EventCastBegin),
		"EventCastOn":                         reflect.ValueOf(quest.EventCastOn),
		"EventClickDoor":                      reflect.ValueOf(quest.EventClickDoor),
		"EventClickObject":                    reflect.ValueOf(quest.EventClickObject),
		"EventCombat":                         reflect.ValueOf(quest.EventCombat),
		"EventCombine":                        reflect.ValueOf(quest.EventCombine),
		"EventCombineFailure":                 reflect.ValueOf(quest.EventCombineFailure),
		"EventCombineSuccess":                 reflect.ValueOf(quest.EventCombineSuccess),
		"EventCombineValidate":                reflect.ValueOf(quest.EventCombineValidate),
		"EventCommand":                        reflect.ValueOf(quest.EventCommand),
		"EventConnect":                        reflect.ValueOf(quest.EventConnect),
		"EventConsider":                       reflect.ValueOf(quest.EventConsider),
		"EventConsiderCorpse":                 reflect.ValueOf(quest.EventConsiderCorpse),
		"EventCrystalGain":                    reflect.ValueOf(quest.EventCrystalGain),
		"EventCrystalLoss":                    reflect.ValueOf(quest.EventCrystalLoss),
		"EventDamageGiven":                    reflect.ValueOf(quest.EventDamageGiven),
		"EventDamageTaken":                    reflect.ValueOf(quest.EventDamageTaken),
		"EventDeath":                          reflect.ValueOf(quest.EventDeath),
		"EventDeathComplete":                  reflect.ValueOf(quest.EventDeathComplete),
		"EventDeathZone":                      reflect.ValueOf(quest.EventDeathZone),
		"EventDespawn":                        reflect.ValueOf(quest.EventDespawn),
		"EventDespawnZone":                    reflect.ValueOf(quest.EventDespawnZone),
		"EventDestroyItem":                    reflect.ValueOf(quest.EventDestroyItem),
		"EventDestroyItemClient":              reflect.ValueOf(quest.EventDestroyItemClient),
		"EventDisconnect":                     reflect.ValueOf(quest.EventDisconnect),
		"EventDiscoverItem":                   reflect.ValueOf(quest.EventDiscoverItem),
		"EventDropItem":                       reflect.ValueOf(quest.EventDropItem),
		"EventDropItemClient":                 reflect.ValueOf(quest.EventDropItemClient),
		"EventDuelLose":                       reflect.ValueOf(quest.EventDuelLose),
		"EventDuelWin":                        reflect.ValueOf(quest.EventDuelWin),
		"EventEncounterLoad":                  reflect.ValueOf(quest.EventEncounterLoad),
		"EventEncounterUnload":                reflect.ValueOf(quest.EventEncounterUnload),
		"EventEnter":                          reflect.ValueOf(quest.EventEnter),
		"EventEnterArea":                      reflect.ValueOf(quest.EventEnterArea),
		"EventEnterZone":                      reflect.ValueOf(quest.EventEnterZone),
		"EventEntityVariableDelete":           reflect.ValueOf(quest.EventEntityVariableDelete),
		"EventEntityVariableSet":              reflect.ValueOf(quest.EventEntityVariableSet),
		"EventEntityVariableUpdate":           reflect.ValueOf(quest.EventEntityVariableUpdate),
		"EventEnvironmentalDamage":            reflect.ValueOf(quest.EventEnvironmentalDamage),
		"EventEquipItem":                      reflect.ValueOf(quest.EventEquipItem),
		"EventEquipItemBot":                   reflect.ValueOf(quest.EventEquipItemBot),
		"EventEquipItemClient":                reflect.ValueOf(quest.EventEquipItemClient),
		"EventExit":                           reflect.ValueOf(quest.EventExit),
		"EventExpGain":                        reflect.ValueOf(quest.EventExpGain),
		"EventFeignDeath":                     reflect.ValueOf(quest.EventFeignDeath),
		"EventFishFailure":                    reflect.ValueOf(quest.EventFishFailure),
		"EventFishStart":                      reflect.ValueOf(quest.EventFishStart),
		"EventFishSuccess":                    reflect.ValueOf(quest.EventFishSuccess),
		"EventForageFailure":                  reflect.ValueOf(quest.EventForageFailure),
		"EventForageSuccess":                  reflect.ValueOf(quest.EventForageSuccess),
		"EventGmCommand":                      reflect.ValueOf(quest.EventGmCommand),
		"EventGroupChange":                    reflect.ValueOf(quest.EventGroupChange),
		"EventHateList":                       reflect.ValueOf(quest.EventHateList),
		"EventHp":                             reflect.ValueOf(quest.EventHp),
		"EventInspect":                        reflect.ValueOf(quest.EventInspect),
		"EventItemClick":                      reflect.ValueOf(quest.EventItemClick),
		"EventItemClickCast":                  reflect.ValueOf(quest.EventItemClickCast),
		"EventItemClickCastClient":            reflect.ValueOf(quest.EventItemClickCastClient),
		"EventItemClickClient":                reflect.ValueOf(quest.EventItemClickClient),
		"EventItemEnterZone":                  reflect.ValueOf(quest.EventItemEnterZone),
		"EventItemTick":                       reflect.ValueOf(quest.EventItemTick),
		"EventKilledMerit":                    reflect.ValueOf(quest.EventKilledMerit),
		"EventLanguageSkillUp":                reflect.ValueOf(quest.EventLanguageSkillUp),
		"EventLdonPointsGain":                 reflect.ValueOf(quest.EventLdonPointsGain),
		"EventLdonPointsLoss":                 reflect.ValueOf(quest.EventLdonPointsLoss),
		"EventLeaveArea":                      reflect.ValueOf(quest.EventLeaveArea),
		"EventLevelDown":                      reflect.ValueOf(quest.EventLevelDown),
		"EventLevelUp":                        reflect.ValueOf(quest.EventLevelUp),
		"EventLoot":                           reflect.ValueOf(quest.EventLoot),
		"EventLootAdded":                      reflect.ValueOf(quest.EventLootAdded),
		"EventLootZone":                       reflect.ValueOf(quest.EventLootZone),
		"EventMemorizeSpell":                  reflect.ValueOf(quest.EventMemorizeSpell),
		"EventMerchantBuy":                    reflect.ValueOf(quest.EventMerchantBuy),
		"EventMerchantSell":                   reflect.ValueOf(quest.EventMerchantSell),
		"EventNpcSlay":                        reflect.ValueOf(quest.EventNpcSlay),
		"EventPayload":                        reflect.ValueOf(quest.EventPayload),
		"EventPlayerPickup":                   reflect.ValueOf(quest.EventPlayerPickup),
		"EventPopupResponse":                  reflect.ValueOf(quest.EventPopupResponse),
		"EventProximitySay":                   reflect.ValueOf(quest.EventProximitySay),
		"EventReadItem":                       reflect.ValueOf(quest.EventReadItem),
		"EventRespawn":                        reflect.ValueOf(quest.EventRespawn),
		"EventSay":                            reflect.ValueOf(quest.EventSay),
		"EventScaleCalc":                      reflect.ValueOf(quest.EventScaleCalc),
		"EventScribeSpell":                    reflect.ValueOf(quest.EventScribeSpell),
		"EventSignal":                         reflect.ValueOf(quest.EventSignal),
		"EventSkillUp":                        reflect.ValueOf(quest.EventSkillUp),
		"EventSlay":                           reflect.ValueOf(quest.EventSlay),
		"EventSpawn":                          reflect.ValueOf(quest.EventSpawn),
		"EventSpawnZone":                      reflect.ValueOf(quest.EventSpawnZone),
		"EventSpellBlocked":                   reflect.ValueOf(quest.EventSpellBlocked),
		"EventSpellEffectBuffTicClient":       reflect.ValueOf(quest.EventSpellEffectBuffTicClient),
		"EventSpellEffectBuffTicNpc":          reflect.ValueOf(quest.EventSpellEffectBuffTicNpc),
		"EventSpellEffectClient":              reflect.ValueOf(quest.EventSpellEffectClient),
		"EventSpellEffectNpc":                 reflect.ValueOf(quest.EventSpellEffectNpc),
		"EventSpellEffectTranslocateComplete": reflect.ValueOf(quest.EventSpellEffectTranslocateComplete),
		"EventSpellFade":                      reflect.ValueOf(quest.EventSpellFade),
		"EventTargetChange":                   reflect.ValueOf(quest.EventTargetChange),
		"EventTaskAccepted":                   reflect.ValueOf(quest.EventTaskAccepted),
		"EventTaskBeforeUpdate":               reflect.ValueOf(quest.EventTaskBeforeUpdate),
		"EventTaskComplete":                   reflect.ValueOf(quest.EventTaskComplete),
		"EventTaskFail":                       reflect.ValueOf(quest.EventTaskFail),
		"EventTaskStageComplete":              reflect.ValueOf(quest.EventTaskStageComplete),
		"EventTaskUpdate":                     reflect.ValueOf(quest.EventTaskUpdate),
		"EventTestBuff":                       reflect.ValueOf(quest.EventTestBuff),
		"EventTick":                           reflect.ValueOf(quest.EventTick),
		"EventTimer":                          reflect.ValueOf(quest.EventTimer),
		"EventTimerPause":                     reflect.ValueOf(quest.EventTimerPause),
		"EventTimerResume":                    reflect.ValueOf(quest.EventTimerResume),
		"EventTimerStart":                     reflect.ValueOf(quest.EventTimerStart),
		"EventTimerStop":                      reflect.ValueOf(quest.EventTimerStop),
		"EventTrade":                          reflect.ValueOf(quest.EventTrade),
		"EventUnaugmentItem":                  reflect.ValueOf(quest.EventUnaugmentItem),
		"EventUnequipItem":                    reflect.ValueOf(quest.EventUnequipItem),
		"EventUnequipItemBot":                 reflect.ValueOf(quest.EventUnequipItemBot),
		"EventUnequipItemClient":              reflect.ValueOf(quest.EventUnequipItemClient),
		"EventUnhandledOpcode":                reflect.ValueOf(quest.EventUnhandledOpcode),
		"EventUnmemorizeSpell":                reflect.ValueOf(quest.EventUnmemorizeSpell),
		"EventUnscribeSpell":                  reflect.ValueOf(quest.EventUnscribeSpell),
		"EventUseSkill":                       reflect.ValueOf(quest.EventUseSkill),
		"EventWarp":                           reflect.ValueOf(quest.EventWarp),
		"EventWaypointArrive":                 reflect.ValueOf(quest.EventWaypointArrive),
		"EventWaypointDepart":                 reflect.ValueOf(quest.EventWaypointDepart),
		"EventWeaponProc":                     reflect.ValueOf(quest.EventWeaponProc),
		"EventZone":                           reflect.ValueOf(quest.EventZone),
		"LargestEventId":                      reflect.ValueOf(quest.LargestEventId),

		// type definitions
		"QuestEvent":         reflect.ValueOf((*quest.QuestEvent)(nil)),
		"QuestEventType":     reflect.ValueOf((*quest.QuestEventType)(nil)),
		"QuestHandler":       reflect.ValueOf((*quest.QuestHandler)(nil)),
		"ZoneQuestInterface": reflect.ValueOf((*quest.ZoneQuestInterface)(nil)),
	}
}
