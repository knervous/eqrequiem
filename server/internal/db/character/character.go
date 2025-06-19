package db_character

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	_ "github.com/go-sql-driver/mysql"
)

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
