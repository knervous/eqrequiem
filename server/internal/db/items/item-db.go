package items

import (
	"encoding/json"
	"fmt"

	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	"github.com/go-jet/jet/v2/stmtcache"
	_ "github.com/go-sql-driver/mysql"
)

type SlotUpdate struct {
	ItemInstanceID int32
	FromSlot       int32
	FromBag        int8
	ToSlot         int32
	ToBag          int8
}

// CreateItemInstance creates a new item_instances row and returns its auto-increment ID.
func CreateDBItemInstance(tx *stmtcache.Tx, itemInstance constants.ItemInstance, ownerId int32) (int32, error) {
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

// SwapItemSlots swaps (or moves) two character‐inventory slots (and all children
// if general inventory‐level), returning a slice of SlotUpdate records for
// every row that actually changed.
func SwapItemSlots(
	playerID, fromSlot, toSlot int32,
	toBagSlot, fromBagSlot int8,
	fromItem, toItem *constants.ItemWithInstance,
) (updates []SlotUpdate, err error) {
	tx, err := db.GlobalWorldDB.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		} else if err != nil {
			tx.Rollback()
		} else {
			err = tx.Commit()
		}
	}()

	// 1) Lock the two target slots for update
	var inv []model.CharacterInventory
	if err = table.CharacterInventory.
		SELECT(
			table.CharacterInventory.Slot,
			table.CharacterInventory.Bag,
			table.CharacterInventory.ItemInstanceID,
		).
		WHERE(
			table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
				AND(table.CharacterInventory.Slot.IN(
					mysql.Int32(fromSlot),
					mysql.Int32(toSlot),
				)),
		).
		FOR(mysql.UPDATE()).
		Query(tx, &inv); err != nil {
		return nil, fmt.Errorf("lock inventory rows: %w", err)
	}

	// Map existing rows by (slot, bag)
	type loc struct {
		Slot int32
		Bag  int8
	}
	baseRows := make(map[loc]model.CharacterInventory, len(inv))
	childFromRows := make(map[loc]model.CharacterInventory, len(inv))
	childToRows := make(map[loc]model.CharacterInventory, len(inv))
	for _, ci := range inv {
		if ci.Bag == fromBagSlot || ci.Bag == toBagSlot {
			baseRows[loc{int32(ci.Slot), ci.Bag}] = ci
		} else if int32(ci.Slot) == fromSlot {
			childFromRows[loc{int32(ci.Slot), ci.Bag}] = ci
		} else if int32(ci.Slot) == toSlot {
			childToRows[loc{int32(ci.Slot), ci.Bag}] = ci
		}
	}
	fromRow, hasFrom := baseRows[loc{fromSlot, fromBagSlot}]
	toRow, hasTo := baseRows[loc{toSlot, toBagSlot}]

	// 2) Handle the four move/swap cases
	switch {
	case !hasFrom && !hasTo:
		// nothing to do

	case hasFrom && !hasTo:
		// simple move: fromSlot → toSlot
		if _, err = table.CharacterInventory.
			UPDATE(table.CharacterInventory.Slot, table.CharacterInventory.Bag).
			SET(mysql.Int32(toSlot), mysql.Int8(toBagSlot)).
			WHERE(
				table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
					AND(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(fromRow.ItemInstanceID))),
			).
			Exec(tx); err != nil {
			return nil, fmt.Errorf("move fromSlot→toSlot: %w", err)
		}

	case !hasFrom && hasTo:
		// simple move: toSlot → fromSlot
		if _, err = table.CharacterInventory.
			UPDATE(table.CharacterInventory.Slot, table.CharacterInventory.Bag).
			SET(mysql.Int32(fromSlot), mysql.Int8(fromBagSlot)).
			WHERE(
				table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
					AND(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(toRow.ItemInstanceID))),
			).
			Exec(tx); err != nil {
			return nil, fmt.Errorf("move toSlot→fromSlot: %w", err)
		}

	default: // hasFrom && hasTo → full swap via temp
		const tempSlot = -1

		// a) stash toSlot occupant → tempSlot
		if _, err = table.CharacterInventory.
			UPDATE(table.CharacterInventory.Slot).
			SET(mysql.Int32(tempSlot)).
			WHERE(
				table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
					AND(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(toRow.ItemInstanceID))),
			).
			Exec(tx); err != nil {
			return nil, fmt.Errorf("stash toSlot→tempSlot: %w", err)
		}

		// b) move fromSlot → toSlot
		if _, err = table.CharacterInventory.
			UPDATE(table.CharacterInventory.Slot, table.CharacterInventory.Bag).
			SET(mysql.Int32(toSlot), mysql.Int8(toBagSlot)).
			WHERE(
				table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
					AND(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(fromRow.ItemInstanceID))),
			).
			Exec(tx); err != nil {
			return nil, fmt.Errorf("move fromSlot→toSlot: %w", err)
		}
		// c) restore tempSlot → fromSlot
		if _, err = table.CharacterInventory.
			UPDATE(table.CharacterInventory.Slot, table.CharacterInventory.Bag).
			SET(mysql.Int32(fromSlot), mysql.Int8(toRow.Bag)).
			WHERE(
				table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
					AND(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(toRow.ItemInstanceID))),
			).
			Exec(tx); err != nil {
			return nil, fmt.Errorf("restore tempSlot→fromSlot: %w", err)
		}
	}

	updates = append(updates, SlotUpdate{
		ItemInstanceID: fromRow.ItemInstanceID,
		FromSlot:       fromSlot,
		FromBag:        fromBagSlot,
		ToSlot:         toSlot,
		ToBag:          toBagSlot,
	})
	// TODO handle case for when these are both containers
	// Will have to lock rows and swap out the child rows temporarily
	// to prevent index collision
	if fromItem.IsContainer() {
		for _, childRow := range childFromRows {
			if _, err = table.CharacterInventory.
				UPDATE(table.CharacterInventory.Slot).
				SET(mysql.Int32(toSlot)).
				WHERE(
					table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
						AND(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(childRow.ItemInstanceID))),
				).
				Exec(tx); err != nil {
				return nil, fmt.Errorf("move child fromSlot→toSlot: %w", err)
			}
			updates = append(updates, SlotUpdate{
				ItemInstanceID: childRow.ItemInstanceID,
				FromSlot:       fromSlot,
				FromBag:        childRow.Bag,
				ToSlot:         toSlot,
				ToBag:          childRow.Bag,
			})
		}

	}
	if toItem.IsContainer() {
		for _, childRow := range childToRows {
			if _, err = table.CharacterInventory.
				UPDATE(table.CharacterInventory.Slot).
				SET(mysql.Int32(fromSlot)).
				WHERE(
					table.CharacterInventory.CharacterID.EQ(mysql.Int32(playerID)).
						AND(table.CharacterInventory.ItemInstanceID.EQ(mysql.Int32(childRow.ItemInstanceID))),
				).
				Exec(tx); err != nil {
				return nil, fmt.Errorf("move child toSlot→fromSlot: %w", err)
			}
			updates = append(updates, SlotUpdate{
				ItemInstanceID: childRow.ItemInstanceID,
				FromSlot:       toSlot,
				FromBag:        childRow.Bag,
				ToSlot:         fromSlot,
				ToBag:          childRow.Bag,
			})
		}
	}

	return updates, nil
}
func AddItemToPlayerInventoryFreeSlot(itemInstance constants.ItemInstance, playerID int32) (int32, error) {
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
		SET(mysql.Int32(playerID), constants.OwnerTypeCharacter).
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
		constants.SlotGeneral1,
		constants.SlotGeneral2,
		constants.SlotGeneral3,
		constants.SlotGeneral4,
		constants.SlotGeneral5,
		constants.SlotGeneral6,
		constants.SlotGeneral7,
		constants.SlotGeneral8,
	}
	freeSlot := int32(-1)
	for _, s := range generalSlots {
		if !used[s] {
			freeSlot = s
			break
		}
	}
	if freeSlot < 0 {
		freeSlot = constants.SlotCursor
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
		SET(playerId, constants.OwnerTypeCharacter).
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

func InsertItemInstance(instance constants.ItemInstance) error {
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
func GetItemInstanceByID(guid int32) (constants.ItemInstance, error) {
	cacheKey := fmt.Sprintf("iteminstance:guid:%d", guid)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if inst, ok := val.(constants.ItemInstance); ok {
			return inst, nil
		}
	}

	var jetInstance model.ItemInstances
	stmt := table.ItemInstances.
		SELECT(table.ItemInstances.AllColumns).
		WHERE(table.ItemInstances.ID.EQ(mysql.Int32(guid)))

	err := stmt.Query(db.GlobalWorldDB.DB, &jetInstance)
	if err != nil {
		return constants.ItemInstance{}, fmt.Errorf("failed to query item instance: %v", err)
	}

	var mods constants.Mods
	if jetInstance.Mods != nil {
		if err := json.Unmarshal([]byte(*jetInstance.Mods), &mods); err != nil {
			return constants.ItemInstance{}, fmt.Errorf("failed to unmarshal mods: %v", err)
		}
	}

	item, err := GetItemTemplateByID(jetInstance.ID)
	if err != nil {
		return constants.ItemInstance{}, err
	}

	inst := constants.ItemInstance{
		Item:      item,
		ID:        jetInstance.ID,
		ItemID:    jetInstance.ItemID,
		Mods:      mods,
		Charges:   jetInstance.Charges,
		Quantity:  jetInstance.Quantity,
		OwnerID:   jetInstance.OwnerID,
		OwnerType: constants.OwnerType(jetInstance.OwnerType),
	}

	// Cache the instance
	cache.GetCache().Set(cacheKey, inst)

	return inst, nil
}

// UpdateItemInstance updates fields of an existing item instance
func UpdateItemInstance(instance constants.ItemInstance) error {
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
