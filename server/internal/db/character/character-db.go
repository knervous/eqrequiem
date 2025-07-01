package db_character

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	_ "github.com/go-sql-driver/mysql"
)

func UpdateCharacterStats(stats *model.CharacterStatsRecord) error {
	cacheKey := fmt.Sprintf("character:stats:id:%d", stats.CharacterID)
	if err := cache.GetCache().Delete(cacheKey); err != nil {
		return err
	}

	stmt := table.CharacterStatsRecord.
		UPDATE(
			table.CharacterStatsRecord.CharacterID,
			table.CharacterStatsRecord.Name,
			table.CharacterStatsRecord.Status,
			table.CharacterStatsRecord.Level,
			table.CharacterStatsRecord.Class,
			table.CharacterStatsRecord.Race,
			table.CharacterStatsRecord.AaPoints,
			table.CharacterStatsRecord.Hp,
			table.CharacterStatsRecord.Mana,
			table.CharacterStatsRecord.Endurance,
			table.CharacterStatsRecord.Ac,
			table.CharacterStatsRecord.Strength,
			table.CharacterStatsRecord.Stamina,
			table.CharacterStatsRecord.Dexterity,
			table.CharacterStatsRecord.Agility,
			table.CharacterStatsRecord.Intelligence,
			table.CharacterStatsRecord.Wisdom,
			table.CharacterStatsRecord.Charisma,
			table.CharacterStatsRecord.MagicResist,
			table.CharacterStatsRecord.FireResist,
			table.CharacterStatsRecord.ColdResist,
			table.CharacterStatsRecord.PoisonResist,
			table.CharacterStatsRecord.DiseaseResist,
			table.CharacterStatsRecord.CorruptionResist,
			table.CharacterStatsRecord.HeroicStrength,
			table.CharacterStatsRecord.HeroicStamina,
			table.CharacterStatsRecord.HeroicDexterity,
			table.CharacterStatsRecord.HeroicAgility,
			table.CharacterStatsRecord.HeroicIntelligence,
			table.CharacterStatsRecord.HeroicWisdom,
			table.CharacterStatsRecord.HeroicCharisma,
			table.CharacterStatsRecord.HeroicMagicResist,
			table.CharacterStatsRecord.HeroicFireResist,
			table.CharacterStatsRecord.HeroicColdResist,
			table.CharacterStatsRecord.HeroicPoisonResist,
			table.CharacterStatsRecord.HeroicDiseaseResist,
			table.CharacterStatsRecord.HeroicCorruptionResist,
			table.CharacterStatsRecord.Haste,
			table.CharacterStatsRecord.Accuracy,
			table.CharacterStatsRecord.Attack,
			table.CharacterStatsRecord.Avoidance,
			table.CharacterStatsRecord.Clairvoyance,
			table.CharacterStatsRecord.CombatEffects,
			table.CharacterStatsRecord.DamageShieldMitigation,
			table.CharacterStatsRecord.DamageShield,
			table.CharacterStatsRecord.DotShielding,
			table.CharacterStatsRecord.HpRegen,
			table.CharacterStatsRecord.ManaRegen,
			table.CharacterStatsRecord.EnduranceRegen,
			table.CharacterStatsRecord.Shielding,
			table.CharacterStatsRecord.SpellDamage,
			table.CharacterStatsRecord.SpellShielding,
			table.CharacterStatsRecord.Strikethrough,
			table.CharacterStatsRecord.StunResist,
			table.CharacterStatsRecord.Backstab,
			table.CharacterStatsRecord.Wind,
			table.CharacterStatsRecord.Brass,
			table.CharacterStatsRecord.String,
			table.CharacterStatsRecord.Percussion,
			table.CharacterStatsRecord.Singing,
			table.CharacterStatsRecord.Baking,
			table.CharacterStatsRecord.Alchemy,
			table.CharacterStatsRecord.Tailoring,
			table.CharacterStatsRecord.Blacksmithing,
			table.CharacterStatsRecord.Fletching,
			table.CharacterStatsRecord.Brewing,
			table.CharacterStatsRecord.Jewelry,
			table.CharacterStatsRecord.Pottery,
			table.CharacterStatsRecord.Research,
			table.CharacterStatsRecord.Alcohol,
			table.CharacterStatsRecord.Fishing,
			table.CharacterStatsRecord.Tinkering,
			table.CharacterStatsRecord.CreatedAt,
			table.CharacterStatsRecord.UpdatedAt,
		).
		SET(
			stats.CharacterID,
			stats.Name,
			stats.Status,
			stats.Level,
			stats.Class,
			stats.Race,
			stats.AaPoints,
			stats.Hp,
			stats.Mana,
			stats.Endurance,
			stats.Ac,
			stats.Strength,
			stats.Stamina,
			stats.Dexterity,
			stats.Agility,
			stats.Intelligence,
			stats.Wisdom,
			stats.Charisma,
			stats.MagicResist,
			stats.FireResist,
			stats.ColdResist,
			stats.PoisonResist,
			stats.DiseaseResist,
			stats.CorruptionResist,
			stats.HeroicStrength,
			stats.HeroicStamina,
			stats.HeroicDexterity,
			stats.HeroicAgility,
			stats.HeroicIntelligence,
			stats.HeroicWisdom,
			stats.HeroicCharisma,
			stats.HeroicMagicResist,
			stats.HeroicFireResist,
			stats.HeroicColdResist,
			stats.HeroicPoisonResist,
			stats.HeroicDiseaseResist,
			stats.HeroicCorruptionResist,
			stats.Haste,
			stats.Accuracy,
			stats.Attack,
			stats.Avoidance,
			stats.Clairvoyance,
			stats.CombatEffects,
			stats.DamageShieldMitigation,
			stats.DamageShield,
			stats.DotShielding,
			stats.HpRegen,
			stats.ManaRegen,
			stats.EnduranceRegen,
			stats.Shielding,
			stats.SpellDamage,
			stats.SpellShielding,
			stats.Strikethrough,
			stats.StunResist,
			stats.Backstab,
			stats.Wind,
			stats.Brass,
			stats.String,
			stats.Percussion,
			stats.Singing,
			stats.Baking,
			stats.Alchemy,
			stats.Tailoring,
			stats.Blacksmithing,
			stats.Fletching,
			stats.Brewing,
			stats.Jewelry,
			stats.Pottery,
			stats.Research,
			stats.Alcohol,
			stats.Fishing,
			stats.Tinkering,
			stats.CreatedAt,
			stats.UpdatedAt,
		).
		WHERE(table.CharacterStatsRecord.CharacterID.EQ(mysql.Int32(int32(stats.CharacterID))))

	if result, err := stmt.Exec(db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("failed to update character stats: %v", err)
	} else {
		fmt.Println("UpdateCharacterStats result:", result)
	}
	return nil

}

func GetCharacterStatsByID(id int32) (*model.CharacterStatsRecord, error) {
	cacheKey := fmt.Sprintf("character:stats:id:%d", id)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if stats, ok := val.(*model.CharacterStatsRecord); ok {
			return stats, nil
		}
	}

	var stats model.CharacterStatsRecord
	ctx := context.Background()
	err := table.CharacterStatsRecord.
		SELECT(table.CharacterStatsRecord.AllColumns).
		FROM(table.CharacterStatsRecord).
		WHERE(
			table.CharacterStatsRecord.CharacterID.EQ(mysql.Int32(id)),
		).LIMIT(1).
		QueryContext(ctx, db.GlobalWorldDB.DB, &stats)
	if err != nil {
		// First time creation
		stats = model.CharacterStatsRecord{
			CharacterID:            id,
			CreatedAt:              ptr(time.Now()),
			Name:                   ptr(""),
			Status:                 ptr[int32](0),
			Level:                  ptr[int32](1),
			Class:                  ptr[int32](1),
			Race:                   ptr[int32](1),
			AaPoints:               ptr[int32](0),
			Hp:                     ptr[int64](100),
			Mana:                   ptr[int64](100),
			Endurance:              ptr[int64](100),
			Ac:                     ptr[int32](0),
			Strength:               ptr[int32](75),
			Stamina:                ptr[int32](75),
			Dexterity:              ptr[int32](75),
			Agility:                ptr[int32](75),
			Intelligence:           ptr[int32](75),
			Wisdom:                 ptr[int32](75),
			Charisma:               ptr[int32](75),
			MagicResist:            ptr[int32](0),
			FireResist:             ptr[int32](0),
			ColdResist:             ptr[int32](0),
			PoisonResist:           ptr[int32](0),
			DiseaseResist:          ptr[int32](0),
			CorruptionResist:       ptr[int32](0),
			HeroicStrength:         ptr[int32](0),
			HeroicStamina:          ptr[int32](0),
			HeroicDexterity:        ptr[int32](0),
			HeroicAgility:          ptr[int32](0),
			HeroicIntelligence:     ptr[int32](0),
			HeroicWisdom:           ptr[int32](0),
			HeroicCharisma:         ptr[int32](0),
			HeroicMagicResist:      ptr[int32](0),
			HeroicFireResist:       ptr[int32](0),
			HeroicColdResist:       ptr[int32](0),
			HeroicPoisonResist:     ptr[int32](0),
			HeroicDiseaseResist:    ptr[int32](0),
			HeroicCorruptionResist: ptr[int32](0),
			Haste:                  ptr[int32](0),
			Accuracy:               ptr[int32](0),
			Attack:                 ptr[int32](0),
			Avoidance:              ptr[int32](0),
			Clairvoyance:           ptr[int32](0),
			CombatEffects:          ptr[int32](0),
			DamageShieldMitigation: ptr[int32](0),
			DamageShield:           ptr[int32](0),
			DotShielding:           ptr[int32](0),
			HpRegen:                ptr[int32](0),
			ManaRegen:              ptr[int32](0),
			EnduranceRegen:         ptr[int32](0),
			Shielding:              ptr[int32](0),
			SpellDamage:            ptr[int32](0),
			SpellShielding:         ptr[int32](0),
			Strikethrough:          ptr[int32](0),
			StunResist:             ptr[int32](0),
			Backstab:               ptr[int32](0),
			Wind:                   ptr[int32](0),
			Brass:                  ptr[int32](0),
			String:                 ptr[int32](0),
			Percussion:             ptr[int32](0),
			Singing:                ptr[int32](0),
			Baking:                 ptr[int32](0),
			Alchemy:                ptr[int32](0),
			Tailoring:              ptr[int32](0),
			Blacksmithing:          ptr[int32](0),
			Fletching:              ptr[int32](0),
			Brewing:                ptr[int32](0),
			Jewelry:                ptr[int32](0),
			Pottery:                ptr[int32](0),
			Research:               ptr[int32](0),
			Alcohol:                ptr[int32](0),
			Fishing:                ptr[int32](0),
			Tinkering:              ptr[int32](0),
			UpdatedAt:              ptr(time.Now()),
		}

		stmt := table.CharacterStatsRecord.
			INSERT(
				table.CharacterStatsRecord.CharacterID,
				table.CharacterStatsRecord.Name,
				table.CharacterStatsRecord.Status,
				table.CharacterStatsRecord.Level,
				table.CharacterStatsRecord.Class,
				table.CharacterStatsRecord.Race,
				table.CharacterStatsRecord.AaPoints,
				table.CharacterStatsRecord.Hp,
				table.CharacterStatsRecord.Mana,
				table.CharacterStatsRecord.Endurance,
				table.CharacterStatsRecord.Ac,
				table.CharacterStatsRecord.Strength,
				table.CharacterStatsRecord.Stamina,
				table.CharacterStatsRecord.Dexterity,
				table.CharacterStatsRecord.Agility,
				table.CharacterStatsRecord.Intelligence,
				table.CharacterStatsRecord.Wisdom,
				table.CharacterStatsRecord.Charisma,
				table.CharacterStatsRecord.MagicResist,
				table.CharacterStatsRecord.FireResist,
				table.CharacterStatsRecord.ColdResist,
				table.CharacterStatsRecord.PoisonResist,
				table.CharacterStatsRecord.DiseaseResist,
				table.CharacterStatsRecord.CorruptionResist,
				table.CharacterStatsRecord.HeroicStrength,
				table.CharacterStatsRecord.HeroicStamina,
				table.CharacterStatsRecord.HeroicDexterity,
				table.CharacterStatsRecord.HeroicAgility,
				table.CharacterStatsRecord.HeroicIntelligence,
				table.CharacterStatsRecord.HeroicWisdom,
				table.CharacterStatsRecord.HeroicCharisma,
				table.CharacterStatsRecord.HeroicMagicResist,
				table.CharacterStatsRecord.HeroicFireResist,
				table.CharacterStatsRecord.HeroicColdResist,
				table.CharacterStatsRecord.HeroicPoisonResist,
				table.CharacterStatsRecord.HeroicDiseaseResist,
				table.CharacterStatsRecord.HeroicCorruptionResist,
				table.CharacterStatsRecord.Haste,
				table.CharacterStatsRecord.Accuracy,
				table.CharacterStatsRecord.Attack,
				table.CharacterStatsRecord.Avoidance,
				table.CharacterStatsRecord.Clairvoyance,
				table.CharacterStatsRecord.CombatEffects,
				table.CharacterStatsRecord.DamageShieldMitigation,
				table.CharacterStatsRecord.DamageShield,
				table.CharacterStatsRecord.DotShielding,
				table.CharacterStatsRecord.HpRegen,
				table.CharacterStatsRecord.ManaRegen,
				table.CharacterStatsRecord.EnduranceRegen,
				table.CharacterStatsRecord.Shielding,
				table.CharacterStatsRecord.SpellDamage,
				table.CharacterStatsRecord.SpellShielding,
				table.CharacterStatsRecord.Strikethrough,
				table.CharacterStatsRecord.StunResist,
				table.CharacterStatsRecord.Backstab,
				table.CharacterStatsRecord.Wind,
				table.CharacterStatsRecord.Brass,
				table.CharacterStatsRecord.String,
				table.CharacterStatsRecord.Percussion,
				table.CharacterStatsRecord.Singing,
				table.CharacterStatsRecord.Baking,
				table.CharacterStatsRecord.Alchemy,
				table.CharacterStatsRecord.Tailoring,
				table.CharacterStatsRecord.Blacksmithing,
				table.CharacterStatsRecord.Fletching,
				table.CharacterStatsRecord.Brewing,
				table.CharacterStatsRecord.Jewelry,
				table.CharacterStatsRecord.Pottery,
				table.CharacterStatsRecord.Research,
				table.CharacterStatsRecord.Alcohol,
				table.CharacterStatsRecord.Fishing,
				table.CharacterStatsRecord.Tinkering,
				table.CharacterStatsRecord.CreatedAt,
				table.CharacterStatsRecord.UpdatedAt,
			).
			VALUES(
				stats.CharacterID,
				stats.Name,
				stats.Status,
				stats.Level,
				stats.Class,
				stats.Race,
				stats.AaPoints,
				stats.Hp,
				stats.Mana,
				stats.Endurance,
				stats.Ac,
				stats.Strength,
				stats.Stamina,
				stats.Dexterity,
				stats.Agility,
				stats.Intelligence,
				stats.Wisdom,
				stats.Charisma,
				stats.MagicResist,
				stats.FireResist,
				stats.ColdResist,
				stats.PoisonResist,
				stats.DiseaseResist,
				stats.CorruptionResist,
				stats.HeroicStrength,
				stats.HeroicStamina,
				stats.HeroicDexterity,
				stats.HeroicAgility,
				stats.HeroicIntelligence,
				stats.HeroicWisdom,
				stats.HeroicCharisma,
				stats.HeroicMagicResist,
				stats.HeroicFireResist,
				stats.HeroicColdResist,
				stats.HeroicPoisonResist,
				stats.HeroicDiseaseResist,
				stats.HeroicCorruptionResist,
				stats.Haste,
				stats.Accuracy,
				stats.Attack,
				stats.Avoidance,
				stats.Clairvoyance,
				stats.CombatEffects,
				stats.DamageShieldMitigation,
				stats.DamageShield,
				stats.DotShielding,
				stats.HpRegen,
				stats.ManaRegen,
				stats.EnduranceRegen,
				stats.Shielding,
				stats.SpellDamage,
				stats.SpellShielding,
				stats.Strikethrough,
				stats.StunResist,
				stats.Backstab,
				stats.Wind,
				stats.Brass,
				stats.String,
				stats.Percussion,
				stats.Singing,
				stats.Baking,
				stats.Alchemy,
				stats.Tailoring,
				stats.Blacksmithing,
				stats.Fletching,
				stats.Brewing,
				stats.Jewelry,
				stats.Pottery,
				stats.Research,
				stats.Alcohol,
				stats.Fishing,
				stats.Tinkering,
				stats.CreatedAt,
				stats.UpdatedAt,
			)
		if _, err := stmt.Exec(db.GlobalWorldDB.DB); err != nil {
			return nil, fmt.Errorf("failed to create character stats: %v", err)
		}

		cache.GetCache().Set(cacheKey, &stats)
		return &stats, nil
	}

	cache.GetCache().Set(cacheKey, &stats)
	return &stats, nil
}

// Helper function to create pointers
func ptr[T any](v T) *T {
	return &v
}
func GetCharacterByName(name string) (*model.CharacterData, error) {
	cacheKey := fmt.Sprintf("character:name:%s", name)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if character, ok := val.(*model.CharacterData); ok {
			return character, nil
		}
	}

	var character model.CharacterData
	ctx := context.Background()
	err := table.CharacterData.
		SELECT(table.CharacterData.AllColumns).
		FROM(table.CharacterData).
		WHERE(
			table.CharacterData.Name.EQ(mysql.String(name)).
				AND(table.CharacterData.DeletedAt.IS_NULL()),
		).
		QueryContext(ctx, db.GlobalWorldDB.DB, &character)
	if err != nil {
		return nil, fmt.Errorf("query character_data: %w", err)
	}

	cache.GetCache().Set(cacheKey, &character)
	return &character, nil
}

func UpdateCharacter(charData *model.CharacterData, accountID int64) error {
	cacheKey := fmt.Sprintf("character:id:%d", charData.ID)
	if _, err := cache.GetCache().Set(cacheKey, charData); err != nil {
		return err
	}
	charSelectCacheKey := fmt.Sprintf("account:characters:%d", accountID)
	cache.GetCache().Delete(charSelectCacheKey)

	stmt := table.CharacterData.
		UPDATE(
			table.CharacterData.ZoneID,
			table.CharacterData.ZoneInstance,
			table.CharacterData.X,
			table.CharacterData.Y,
			table.CharacterData.Z,
			table.CharacterData.Heading,
		).
		SET(
			charData.ZoneID,
			charData.ZoneInstance,
			charData.X,
			charData.Y,
			charData.Z,
			charData.Heading,
		).
		WHERE(table.CharacterData.ID.EQ(mysql.Int32(int32(charData.ID))))

	if result, err := stmt.Exec(db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("failed to update character: %v", err)
	} else {
		fmt.Println("UpdateCharacter result:", result)
	}
	return nil
}

func InstantiateStartingItems(race, classID, deity, zone int32) ([]items.ItemInstance, error) {
	// 1) load them all
	var raw []model.StartingItems
	if err := table.StartingItems.
		SELECT(table.StartingItems.AllColumns).
		FROM(table.StartingItems).
		Query(db.GlobalWorldDB.DB, &raw); err != nil {
		return nil, err
	}

	// 2) filter
	var out []items.ItemInstance
	wildcard := "0"

	for _, e := range raw {
		// split only once
		cls := []string{wildcard}
		if e.ClassList != nil && *e.ClassList != "" {
			cls = strings.Split(*e.ClassList, "|")
		}
		dts := []string{wildcard}
		if e.DeityList != nil && *e.DeityList != "" {
			dts = strings.Split(*e.DeityList, "|")
		}
		rcs := []string{wildcard}
		if e.RaceList != nil && *e.RaceList != "" {
			rcs = strings.Split(*e.RaceList, "|")
		}
		zns := []string{wildcard}
		if e.ZoneIDList != nil && *e.ZoneIDList != "" {
			zns = strings.Split(*e.ZoneIDList, "|")
		}

		// if first element != "0", enforce membership
		if cls[0] != wildcard && !slices.Contains(cls, strconv.Itoa(int(classID))) {
			continue
		}
		if dts[0] != wildcard && !slices.Contains(dts, strconv.Itoa(int(deity))) {
			continue
		}
		if rcs[0] != wildcard && !slices.Contains(rcs, strconv.Itoa(int(race))) {
			continue
		}
		if zns[0] != wildcard && !slices.Contains(zns, strconv.Itoa(int(zone))) {
			continue
		}

		// pass → instantiate
		inst := items.CreateItemInstanceFromTemplateID(int32(e.ItemID))
		inst.Quantity = uint8(e.ItemCharges)
		out = append(out, inst)
	}

	return out, nil
}
