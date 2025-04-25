package items

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"knervous/eqgo/internal/cache"
	"knervous/eqgo/internal/db"
	"knervous/eqgo/internal/db/jetgen/eqgo/model"
	"knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	_ "github.com/go-sql-driver/mysql"
)

const (
	SlotCharm = iota
	SlotEar1
	SlotHead
	SlotFace
	SlotEar2
	SlotNeck
	SlotShoulders
	SlotArms
	SlotBack
	SlotWrist1
	SlotWrist2
	SlotRange
	SlotHands
	SlotPrimary
	SlotSecondary
	SlotFinger1
	SlotFinger2
	SlotChest
	SlotLegs
	SlotFeet
	SlotWaist
	SlotAmmo
	SlotGeneral1
	SlotGeneral2
	SlotGeneral3
	SlotGeneral4
	SlotGeneral5
	SlotGeneral6
	SlotGeneral7
	SlotGeneral8
	SlotCursor
)

type ItemWithSlot struct {
	model.ItemInstances
	model.CharacterInventory
}

// CreateItemInstance creates a new item_instances row and returns its auto-increment ID.
func CreateDBItemInstance(tx *sql.Tx, itemInstance ItemInstance, ownerId int32) (int32, error) {
	// 1) marshal mods JSON
	modsJSON, err := json.Marshal(itemInstance.Mods)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal mods: %v", err)
	}
	modsStr := string(modsJSON)

	// 2) build and exec the INSERT
	res, err := table.ItemInstances.
		INSERT(
			table.ItemInstances.ItemID,
			table.ItemInstances.Mods,
			table.ItemInstances.Charges,
			table.ItemInstances.Quantity,
			table.ItemInstances.OwnerID,
			table.ItemInstances.OwnerType,
			// leave OwnerID and OwnerType NULL/zero here
		).
		VALUES(
			itemInstance.ItemID,
			modsStr,
			itemInstance.Charges,
			itemInstance.Quantity,
			ownerId,
			itemInstance.OwnerType,
		).
		Exec(tx)
	if err != nil {
		return 0, fmt.Errorf("failed to insert item instance: %v", err)
	}

	// 3) grab the newly assigned auto-increment ID
	lastID, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to fetch last insert id: %v", err)
	}

	return int32(lastID), nil
}

func AddItemToPlayerInventoryFreeSlot(itemInstance ItemInstance, playerID int32) (int32, error) {
	tx, err := db.GlobalWorldDB.DB.Begin()
	if err != nil {
		return 0, fmt.Errorf("begin tx: %v", err)
	}
	// if we ever return a non‐nil err, roll back
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	// 1) create the item_instance
	itemInstanceID, err := CreateDBItemInstance(tx, itemInstance, playerID)
	if err != nil {
		return 0, fmt.Errorf("create item instance: %v", err)
	}

	// 2) move it onto the character
	if _, err = table.ItemInstances.
		UPDATE(table.ItemInstances.OwnerID, table.ItemInstances.OwnerType).
		SET(mysql.Int32(playerID), OwnerTypeCharacter).
		WHERE(table.ItemInstances.ID.EQ(mysql.Int32(itemInstanceID))).
		Exec(tx); err != nil {
		return 0, fmt.Errorf("move item instance: %v", err)
	}

	// 3) lock all *currently* occupied slots (gap‐lock them)
	var occupied []model.CharacterInventory
	if err = table.CharacterInventory.
		SELECT(table.CharacterInventory.Slot).
		WHERE(table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID))).
		FOR(mysql.UPDATE()). // ← here’s the magic
		Query(tx, &occupied); err != nil {
		return 0, fmt.Errorf("lock occupied slots: %v", err)
	}

	used := map[int32]bool{}
	for _, ci := range occupied {
		used[int32(ci.Slot)] = true
	}

	generalSlots := []int32{
		SlotGeneral1,
		SlotGeneral2,
		SlotGeneral3,
		SlotGeneral4,
		SlotGeneral5,
		SlotGeneral6,
		SlotGeneral7,
		SlotGeneral8,
	}
	freeSlot := int32(-1)
	for _, s := range generalSlots {
		if !used[s] {
			freeSlot = s
			break
		}
	}
	if freeSlot < 0 {
		freeSlot = SlotCursor
	}

	if _, err = table.CharacterInventory.
		INSERT(
			table.CharacterInventory.CharacterID,
			table.CharacterInventory.Slot,
			table.CharacterInventory.ItemInstanceID,
			table.CharacterInventory.Bag,
		).
		VALUES(
			playerID,
			freeSlot,
			itemInstanceID,
			0,
		).
		Exec(tx); err != nil {
		return 0, fmt.Errorf("insert inventory row: %v", err)
	}

	if err = tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit tx: %v", err)
	}

	return freeSlot, nil
}

func MoveItemInPlayerInventory(itemInstanceId int32, playerId int32, slot int32) error {
	stmt := table.ItemInstances.
		UPDATE(table.ItemInstances.OwnerID, table.ItemInstances.OwnerType).
		SET(playerId, OwnerTypeCharacter).
		WHERE(table.ItemInstances.ID.EQ(mysql.Int32(itemInstanceId)))

	if _, err := stmt.Exec(db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("failed to move item instance: %v", err)
	}

	stmt = table.CharacterInventory.
		UPDATE(table.CharacterInventory.Slot).
		SET(slot).
		WHERE(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(itemInstanceId)))

	if _, err := stmt.Exec(db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("failed to update inventory slot: %v", err)
	}

	return nil
}

func InsertItemInstance(instance ItemInstance) error {
	modsJSON, err := json.Marshal(instance.Mods)
	if err != nil {
		return fmt.Errorf("failed to marshal mods: %v", err)
	}
	modsStr := string(modsJSON)

	stmt := table.ItemInstances.INSERT(
		table.ItemInstances.ItemID,
		table.ItemInstances.Mods,
		table.ItemInstances.Charges,
		table.ItemInstances.Quantity,
		table.ItemInstances.OwnerID,
		table.ItemInstances.OwnerType,
	).VALUES(
		instance.ItemID,
		modsStr,
		instance.Charges,
		instance.Quantity,
		instance.OwnerID,
		instance.OwnerType,
	)

	if _, err = stmt.Exec(db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("failed to insert item instance: %v", err)
	}

	return nil
}

// GetItemInstanceByID retrieves an item instance (with caching) and its associated item
func GetItemInstanceByID(guid int32) (ItemInstance, error) {
	cacheKey := fmt.Sprintf("iteminstance:guid:%d", guid)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if inst, ok := val.(ItemInstance); ok {
			return inst, nil
		}
	}

	var jetInstance model.ItemInstances
	stmt := table.ItemInstances.
		SELECT(table.ItemInstances.AllColumns).
		WHERE(table.ItemInstances.ID.EQ(mysql.Int32(guid)))

	err := stmt.Query(db.GlobalWorldDB.DB, &jetInstance)
	if err != nil {
		return ItemInstance{}, fmt.Errorf("failed to query item instance: %v", err)
	}

	var mods Mods
	if jetInstance.Mods != nil {
		if err := json.Unmarshal([]byte(*jetInstance.Mods), &mods); err != nil {
			return ItemInstance{}, fmt.Errorf("failed to unmarshal mods: %v", err)
		}
	}

	item, err := GetItemTemplateByID(jetInstance.ID)
	if err != nil {
		return ItemInstance{}, err
	}

	inst := ItemInstance{
		Item:      item,
		ID:        jetInstance.ID,
		ItemID:    jetInstance.ItemID,
		Mods:      mods,
		Charges:   jetInstance.Charges,
		Quantity:  jetInstance.Quantity,
		OwnerID:   jetInstance.OwnerID,
		OwnerType: OwnerType(jetInstance.OwnerType),
	}

	// Cache the instance
	cache.GetCache().Set(cacheKey, inst)

	return inst, nil
}

// UpdateItemInstance updates fields of an existing item instance
func UpdateItemInstance(instance ItemInstance) error {
	// Prepare mods JSON
	modsJSON, err := json.Marshal(instance.Mods)
	if err != nil {
		return fmt.Errorf("failed to marshal mods: %v", err)
	}
	modsStr := string(modsJSON)

	// Perform update
	stmt := table.ItemInstances.
		UPDATE(
			table.ItemInstances.Mods,
			table.ItemInstances.Charges,
			table.ItemInstances.Quantity,
			table.ItemInstances.OwnerID,
			table.ItemInstances.OwnerType,
		).
		SET(
			modsStr,
			instance.Charges,
			instance.Quantity,
			instance.OwnerID,
			instance.OwnerType,
		).
		WHERE(table.ItemInstances.ID.EQ(mysql.Int32(instance.ID)))

	if _, err := stmt.Exec(db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("failed to update item instance: %v", err)
	}

	// Invalidate cache
	cacheKey := fmt.Sprintf("iteminstance:guid:%d", instance.ID)
	cache.GetCache().Delete(cacheKey)

	return nil
}
