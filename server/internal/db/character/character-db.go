package db_character

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"
	entity "github.com/knervous/eqgo/internal/zone/interface"

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

func GetCharacterSkills(ctx context.Context, characterID int64) ([]model.CharacterSkills, error) {
	var skills []model.CharacterSkills
	if err := table.CharacterSkills.
		SELECT(
			table.CharacterSkills.SkillID,
			table.CharacterSkills.Value,
		).
		FROM(table.CharacterSkills).
		WHERE(table.CharacterSkills.ID.EQ(mysql.Int64(characterID))).
		QueryContext(ctx, db.GlobalWorldDB.DB, &skills); err != nil {
		return nil, fmt.Errorf("query character skills: %w", err)
	}
	return skills, nil
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
			table.CharacterData.Level,
		).
		SET(
			charData.ZoneID,
			charData.ZoneInstance,
			charData.X,
			charData.Y,
			charData.Z,
			charData.Heading,
			charData.Level,
		).
		WHERE(table.CharacterData.ID.EQ(mysql.Int32(int32(charData.ID))))

	if result, err := stmt.Exec(db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("failed to update character: %v", err)
	} else {
		fmt.Println("UpdateCharacter result:", result)
	}
	return nil
}

func GetCharacterItems(ctx context.Context, id int) ([]constants.ItemWithSlot, error) {
	var charItems []constants.ItemWithSlot
	stmt := table.ItemInstances.
		SELECT(
			table.ItemInstances.AllColumns,
			table.CharacterInventory.AllColumns,
		).
		FROM(table.ItemInstances.LEFT_JOIN(
			table.CharacterInventory,
			table.CharacterInventory.ItemInstanceID.
				EQ(table.ItemInstances.ID),
		)).
		WHERE(
			table.ItemInstances.OwnerID.EQ(mysql.Int(int64(id))),
		)

	if err := stmt.QueryContext(ctx, db.GlobalWorldDB.DB, &charItems); err != nil {
		return nil, fmt.Errorf("query character items: %w", err)
	}
	return charItems, nil
}

func InstantiateStartingItems(race, classID, deity, zone int32) ([]constants.ItemInstance, error) {
	// 1) load them all
	var raw []model.StartingItems
	if err := table.StartingItems.
		SELECT(table.StartingItems.AllColumns).
		FROM(table.StartingItems).
		Query(db.GlobalWorldDB.DB, &raw); err != nil {
		return nil, err
	}

	// 2) filter
	var out []constants.ItemInstance
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
		if inst == nil {
			return nil, fmt.Errorf("failed to create item instance for itemID %d", e.ItemID)
		}
		inst.Quantity = uint8(e.ItemCharges)

		out = append(out, *inst)
	}

	return out, nil
}

func PurgeCharacterEquipment(ctx context.Context, charID int32) error {

	// 1) delete only those item_instances that are in equipment slots for this character
	subQ := table.CharacterInventory.
		SELECT(table.CharacterInventory.ItemInstanceID).
		FROM(table.CharacterInventory).
		WHERE(
			table.CharacterInventory.CharacterID.EQ(mysql.Int32(charID)).
				AND(table.CharacterInventory.Bag.EQ(mysql.Int8(-1))),
		)

	if _, err := table.ItemInstances.
		DELETE().
		WHERE(table.ItemInstances.ID.IN(subQ)).
		ExecContext(ctx, db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("delete equipped instances for char %d: %w", charID, err)
	}

	if _, err := table.CharacterInventory.
		DELETE().
		WHERE(
			table.CharacterInventory.CharacterID.EQ(mysql.Int32(charID)).
				AND(table.CharacterInventory.Bag.EQ(mysql.Int8(-1))),
		).
		ExecContext(ctx, db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("delete character_inventory for char %d: %w", charID, err)
	}

	return nil
}

func PurgeCharacterItem(ctx context.Context, charID, slot int32) error {

	// 1) delete only those item_instances that are in equipment slots for this character
	subQ := table.CharacterInventory.
		SELECT(table.CharacterInventory.ItemInstanceID).
		FROM(table.CharacterInventory).
		WHERE(
			table.CharacterInventory.CharacterID.EQ(mysql.Int32(charID)).
				AND(table.CharacterInventory.Slot.EQ(mysql.Int32(slot))),
		)

	if _, err := table.ItemInstances.
		DELETE().
		WHERE(table.ItemInstances.ID.IN(subQ)).
		ExecContext(ctx, db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("delete equipped instances for char %d: %w", charID, err)
	}

	if _, err := table.CharacterInventory.
		DELETE().
		WHERE(
			table.CharacterInventory.CharacterID.EQ(mysql.Int32(charID)).
				AND(table.CharacterInventory.Slot.EQ(mysql.Int32(slot))),
		).
		ExecContext(ctx, db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("delete character_inventory for char %d: %w", charID, err)
	}

	return nil
}

func GearUp(c entity.Client) error {
	var raw []model.ToolGearupArmorSets
	if err := table.ToolGearupArmorSets.
		SELECT(table.ToolGearupArmorSets.AllColumns).
		FROM(table.ToolGearupArmorSets).
		WHERE(
			table.ToolGearupArmorSets.Class.EQ(mysql.Int32(int32(c.Class()))).AND(
				table.ToolGearupArmorSets.Level.EQ(mysql.Int32(int32(c.Level()))),
			),
		).
		Query(db.GlobalWorldDB.DB, &raw); err != nil {
		return err
	}
	slotsFilled := map[int32]bool{
		constants.SlotHead:      false,
		constants.SlotHands:     false,
		constants.SlotFeet:      false,
		constants.SlotChest:     false,
		constants.SlotArms:      false,
		constants.SlotLegs:      false,
		constants.SlotWrist1:    false,
		constants.SlotWrist2:    false,
		constants.SlotPrimary:   false,
		constants.SlotSecondary: false,
		constants.SlotCursor:    false,
		constants.SlotEar1:      false,
		constants.SlotEar2:      false,
		constants.SlotNeck:      false,
		constants.SlotShoulders: false,
		constants.SlotBack:      false,
		constants.SlotRange:     false,
		constants.SlotFinger1:   false,
		constants.SlotFinger2:   false,
		constants.SlotWaist:     false,
		constants.SlotAmmo:      false,
	}

	for _, e := range raw {

		if e.Slot == nil || e.ItemID == nil {
			continue
		}
		slot := int32(*e.Slot)
		if slot < 0 || slot > 23 {
			continue
		}
		if slot == constants.SlotWrist1 && slotsFilled[constants.SlotWrist1] {
			slot = constants.SlotWrist2
		}
		if slot == constants.SlotEar1 && slotsFilled[constants.SlotEar1] {
			slot = constants.SlotEar2
		}
		if slot == constants.SlotFinger1 && slotsFilled[constants.SlotFinger1] {
			slot = constants.SlotFinger2
		}

		if slotsFilled[slot] {
			continue
		}

		inst := items.CreateItemInstanceFromTemplateID(int32(*e.ItemID))
		if inst == nil {
			continue
		}
		err := items.InsertItemInstance(*inst)
		if err != nil {
			return fmt.Errorf("failed to insert item instance for itemID %d: %w", *e.ItemID, err)
		}
		slotsFilled[slot] = true
		key := constants.InventoryKey{
			Bag:  -1, // -1 means no bag, i.e. equipped
			Slot: slot,
		}
		c.Items()[key] = &constants.ItemWithInstance{
			Item:     inst.Item,
			Instance: *inst,
			BagSlot:  -1,
		}
	}

	return nil
}

// UpdateCharacterItems writes every non-nil slot in c.Items() into
//  1. item_instances  (inserting if ID<=0, updating otherwise) and
//  2. character_inventory (upsert on (character_id,slot))
//
// All in one TX so the FK is never broken.
func UpdateCharacterItems(ctx context.Context, c entity.Client) (err error) {
	// 1) begin TX
	tx, err := db.GlobalWorldDB.DB.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		} else if err != nil {
			_ = tx.Rollback()
		} else {
			err = tx.Commit()
		}
	}()

	charID := int32(c.ID())

	for itemSlot, wi := range c.Items() {
		if wi == nil {
			// slot empty: we skip (or you could DELETE the inventory row here if you like)
			continue
		}

		inst := &wi.Instance

		// 2a) if new instance, INSERT and grab its ID
		if inst.ID <= 0 {
			newID, err2 := items.CreateDBItemInstance(tx, *inst, charID)
			if err2 != nil {
				return fmt.Errorf("inserting new instance for slot %d: %w", itemSlot, err2)
			}
			inst.ID = newID
		} else {
			// 2b) existing instance → UPDATE mods/quantity/owner
			modsJSON, err2 := json.Marshal(inst.Mods)
			if err2 != nil {
				return fmt.Errorf("marshal mods for inst %d: %w", inst.ID, err2)
			}
			if _, err2 = table.ItemInstances.
				UPDATE(
					table.ItemInstances.Mods,
					table.ItemInstances.Charges,
					table.ItemInstances.Quantity,
					table.ItemInstances.OwnerID,
					table.ItemInstances.OwnerType,
				).
				SET(
					string(modsJSON),
					inst.Charges,
					inst.Quantity,
					mysql.Int32(charID),
					constants.OwnerTypeCharacter,
				).
				WHERE(table.ItemInstances.ID.EQ(mysql.Int32(inst.ID))).
				Exec(tx); err2 != nil {
				return fmt.Errorf("updating instance %d: %w", inst.ID, err2)
			}
		}

		// 3) upsert inventory row so (character_id, slot) → item_instance_id + bag
		if _, err2 := table.CharacterInventory.
			INSERT(
				table.CharacterInventory.CharacterID,
				table.CharacterInventory.Slot,
				table.CharacterInventory.ItemInstanceID,
				table.CharacterInventory.Bag,
			).
			VALUES(
				mysql.Int32(charID),
				mysql.Int32(int32(itemSlot.Slot)),
				mysql.Int32(inst.ID),
				mysql.Int8(wi.BagSlot),
			).
			ON_DUPLICATE_KEY_UPDATE(
				table.CharacterInventory.ItemInstanceID.SET(mysql.Int32(inst.ID)),
				table.CharacterInventory.Bag.SET(mysql.Int8(wi.BagSlot)),
			).
			Exec(tx); err2 != nil {
			return fmt.Errorf("upserting inventory for slot %d: %w", itemSlot, err2)
		}
	}

	return nil
}
