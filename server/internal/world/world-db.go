package world

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/constants"
	"github.com/knervous/eqgo/internal/session"

	"github.com/knervous/eqgo/internal/cache"
	"github.com/knervous/eqgo/internal/db"

	db_character "github.com/knervous/eqgo/internal/db/character"
	"github.com/knervous/eqgo/internal/db/items"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"

	"github.com/go-jet/jet/v2/mysql"
	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
)

const (
	ClassCount = 15
	SkillCount = 78
	LevelCount = 100
	TotalSize  = ClassCount * SkillCount * LevelCount
)

func LoginIP(ctx context.Context, accountID int64, ip string) error {
	stmt := table.AccountIP.
		INSERT(
			table.AccountIP.Accid,
			table.AccountIP.IP,
			table.AccountIP.Count,
			table.AccountIP.Lastused,
		).
		VALUES(
			accountID,
			ip,
			1,
			mysql.NOW(),
		).
		ON_DUPLICATE_KEY_UPDATE(
			table.AccountIP.Count.SET(table.AccountIP.Count.ADD(mysql.Int(1))),
			table.AccountIP.Lastused.SET(mysql.NOW()),
		)

	if _, err := stmt.ExecContext(ctx, db.GlobalWorldDB.DB); err != nil {
		return fmt.Errorf("log account IP (accid=%d, ip=%s): %w", accountID, ip, err)
	}
	return nil
}

func GetVariable(ctx context.Context, name string) (model.Variables, error) {
	cacheKey := fmt.Sprintf("variables:%s", name)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if variable, ok := val.(model.Variables); ok {
			return (variable), nil
		}
	}
	var variable model.Variables
	err := table.Variables.
		SELECT(table.Variables.Value).
		FROM(table.Variables).
		WHERE(table.Variables.Varname.EQ(mysql.String(name))).
		QueryContext(ctx, db.GlobalWorldDB.DB, &variable)

	if err == nil {
		cache.GetCache().Set(cacheKey, variable.ID)
		return variable, nil
	}
	return model.Variables{}, fmt.Errorf("GetVariable err: %w", err)
}

func GetOrCreateAccount(ctx context.Context, discordID string) (int64, error) {
	cacheKey := fmt.Sprintf("account:discord:%s", discordID)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if accountID, ok := val.(int32); ok {
			return (int64)(accountID), nil
		}
	}

	var acc model.Account
	err := table.Account.
		SELECT(table.Account.ID).
		FROM(table.Account).
		WHERE(table.Account.DiscordID.EQ(mysql.String(discordID))).
		QueryContext(ctx, db.GlobalWorldDB.DB, &acc)

	if err == nil {
		cache.GetCache().Set(cacheKey, acc.ID)
		return int64(acc.ID), nil
	}

	res, err := table.Account.
		INSERT(
			table.Account.DiscordID,
			table.Account.Name,
			table.Account.PrimaryAuth,
			table.Account.LsID,
			table.Account.LsaccountID,
		).
		VALUES(
			mysql.String(discordID),
			mysql.String(discordID),
			mysql.Int8(1),
			mysql.String(discordID),
			mysql.Int8(1),
		).
		ExecContext(ctx, db.GlobalWorldDB.DB)
	if err != nil {
		return 0, fmt.Errorf("insert account: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("getting last insert id: %w", err)
	}
	cache.GetCache().Set(cacheKey, id)
	return id, nil
}

func AccountHasCharacterName(ctx context.Context, accountID int64, charName string) (bool, error) {
	// Never cache this - always keep up to date
	var chars []model.CharacterData
	err := table.CharacterData.
		SELECT(
			table.CharacterData.Name,
		).
		FROM(table.CharacterData).
		WHERE(
			table.CharacterData.AccountID.EQ(mysql.Int64(accountID)).
				AND(table.CharacterData.Name.EQ(mysql.String(charName))).
				AND(table.CharacterData.DeletedAt.IS_NULL()),
		).
		LIMIT(1).
		QueryContext(ctx, db.GlobalWorldDB.DB, &chars)
	if err != nil {
		return false, fmt.Errorf("query character_data: %w", err)
	}

	return len(chars) > 0, nil
}

func GetCharSelectInfo(ses *session.Session, ctx context.Context, accountID int64) (eq.CharacterSelect, error) {

	const limit = 8

	var chars []model.CharacterData
	if err := table.CharacterData.
		SELECT(
			table.CharacterData.AllColumns,
		).
		FROM(table.CharacterData).
		WHERE(
			table.CharacterData.AccountID.EQ(mysql.Int64(accountID)).
				AND(table.CharacterData.DeletedAt.IS_NULL()),
		).
		ORDER_BY(table.CharacterData.Name.ASC()).
		LIMIT(limit).
		QueryContext(ctx, db.GlobalWorldDB.DB, &chars); err != nil {

		return eq.CharacterSelect{}, fmt.Errorf("query character_data: %w", err)
	}
	info, err := session.NewMessage(ses, eq.NewRootCharacterSelect)
	if err != nil {
		return eq.CharacterSelect{}, fmt.Errorf("create character select message: %w", err)
	}
	info.SetCharacterCount(int32(len(chars)))

	characters, err := info.NewCharacters(int32(len(chars)))

	if err != nil {
		return eq.CharacterSelect{}, fmt.Errorf("get character select message: %w", err)
	}
	info.SetCharacters(characters)
	for i, c := range chars {
		characterSelectEntry := characters.At(i)
		characterSelectEntry.SetName(c.Name)
		characterSelectEntry.SetGender(int32(c.Gender))
		characterSelectEntry.SetRace(int32(c.Race))
		characterSelectEntry.SetCharClass(int32(c.Class))
		characterSelectEntry.SetLevel(int32(c.Level))
		characterSelectEntry.SetDeity(int32(c.Deity))
		characterSelectEntry.SetLastLogin(int32(c.LastLogin))
		characterSelectEntry.SetFace(int32(c.Face))
		characterSelectEntry.SetZone(int32(c.ZoneID))
		characterSelectEntry.SetEnabled(1)

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
				table.ItemInstances.OwnerID.EQ(mysql.Int(int64(c.ID))),
			)

		if err := stmt.QueryContext(ctx, db.GlobalWorldDB.DB, &charItems); err != nil {
			return eq.CharacterSelect{}, fmt.Errorf("query character_data items: %w", err)
		}
		charItemsLength := int32(len(charItems))
		capCharItems, err := characterSelectEntry.NewItems(charItemsLength)
		if err != nil {
			return eq.CharacterSelect{}, fmt.Errorf("get character select message: %w", err)
		}
		for itemIdx, charItem := range charItems {
			itemTemplate, err := items.GetItemTemplateByID(charItem.ItemID)
			if err != nil {
				log.Printf("failed to get item template for itemID %d: %v", charItem.ItemID, err)
				continue
			}
			mods, err := json.Marshal(charItem.Mods)
			if err != nil {
				log.Printf("failed to marshal mods for itemID %d: %v", charItem.ItemID, err)
				continue
			}

			item := capCharItems.At(itemIdx)
			item.SetCharges(uint32(charItem.Charges))
			item.SetQuantity(uint32(charItem.Quantity))
			item.SetMods(string(mods))
			item.SetSlot(int32(charItem.Slot))
			items.ConvertItemTemplateToCapnp(ses, &itemTemplate, &item)
		}
	}

	return info, nil
}

func GetCharacterBinds(ctx context.Context, characterID int64) ([]model.CharacterBind, error) {
	var binds []model.CharacterBind
	if err := table.CharacterBind.
		SELECT(
			table.CharacterBind.ZoneID,
			table.CharacterBind.InstanceID,
			table.CharacterBind.X,
			table.CharacterBind.Y,
			table.CharacterBind.Z,
			table.CharacterBind.Heading,
			table.CharacterBind.Slot,
		).
		FROM(table.CharacterBind).
		WHERE(table.CharacterBind.ID.EQ(mysql.Int64(characterID))).
		LIMIT(5).
		QueryContext(ctx, db.GlobalWorldDB.DB, &binds); err != nil {
		return nil, err
	}
	return binds, nil
}

func CheckNameFilter(ctx context.Context, name string) bool {
	cacheKey := "namefilter"

	// Try to get name filters from cache
	var nameFilters []model.NameFilter
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if filters, ok := val.([]model.NameFilter); ok {
			nameFilters = filters
		}
	}

	if len(nameFilters) == 0 {
		if err := table.NameFilter.
			SELECT(table.NameFilter.Name).
			FROM(table.NameFilter).
			QueryContext(ctx, db.GlobalWorldDB.DB, &nameFilters); err != nil {
			fmt.Printf("failed to query name filter: %v\n", err)
			return true
		}
		cache.GetCache().Set(cacheKey, nameFilters)
	}

	for _, filter := range nameFilters {
		if filter.Name == "" {
			continue
		}
		if strings.Contains(strings.ToLower(name), strings.ToLower(filter.Name)) {
			return false
		}
	}

	return true
}

func skillCapIdx(class, skill, level int) int {
	return (class-1)*SkillCount*LevelCount +
		skill*LevelCount +
		(level - 1)
}

func LoadSkillCapsBuffer(ctx context.Context) ([]uint16, error) {
	cacheKey := "skillcaps_buffer"
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if buf, ok := val.([]uint16); ok {
			return buf, nil
		}
	}

	var rows []model.SkillCaps
	if err := table.SkillCaps.
		SELECT(table.SkillCaps.AllColumns).
		FROM(table.SkillCaps).
		QueryContext(ctx, db.GlobalWorldDB.DB, &rows); err != nil {
		return nil, fmt.Errorf("query skill caps: %w", err)
	}

	buf := make([]uint16, TotalSize)

	for _, r := range rows {
		c := int(r.ClassID) // 1…15
		s := int(r.SkillID) // 0…77
		l := int(r.Level)   // 1…100
		if c < 1 || c > ClassCount || s < 0 || s >= SkillCount || l < 1 || l > LevelCount {
			continue
		}
		buf[skillCapIdx(c, s, l)] = uint16(r.Cap)
	}

	cache.GetCache().Set(cacheKey, buf)
	return buf, nil
}

func GetSkillCap(class, skill, level int) (uint16, error) {
	buf, err := LoadSkillCapsBuffer(context.Background())
	if err != nil {
		log.Printf("failed to load skill caps buffer: %v", err)
		return 0, err
	}
	return buf[skillCapIdx(class, skill, level)], nil
}

func GetStartZone(ctx context.Context, class uint8, deity uint32, race uint32) (model.CharacterBind, error) {
	var sz model.StartZones
	if err := table.StartZones.
		SELECT(
			table.StartZones.ZoneID,
			table.StartZones.BindID,
			table.StartZones.X,
			table.StartZones.Y,
			table.StartZones.Z,
			table.StartZones.Heading,
		).
		FROM(table.StartZones).
		WHERE(
			table.StartZones.PlayerClass.EQ(mysql.Uint8(class)).
				AND(table.StartZones.PlayerDeity.EQ(mysql.Uint32(deity))).
				AND(table.StartZones.PlayerRace.EQ(mysql.Uint32(race))),
		).
		LIMIT(1).
		QueryContext(ctx, db.GlobalWorldDB.DB, &sz); err != nil {
		return model.CharacterBind{}, err
	}

	zone := sz.ZoneID
	if sz.BindID != 0 {
		zone = sz.BindID
	}

	return model.CharacterBind{
		ZoneID:  uint16(zone),
		X:       sz.X,
		Y:       sz.Y,
		Z:       sz.Z,
		Heading: sz.Heading,
	}, nil
}

func InsertBind(ctx context.Context, characterID int64, bind model.CharacterBind, slot int) error {
	_, err := table.CharacterBind.
		INSERT(
			table.CharacterBind.ID,
			table.CharacterBind.ZoneID,
			table.CharacterBind.InstanceID,
			table.CharacterBind.X,
			table.CharacterBind.Y,
			table.CharacterBind.Z,
			table.CharacterBind.Heading,
			table.CharacterBind.Slot,
		).
		VALUES(
			characterID,
			bind.ZoneID,
			bind.InstanceID,
			bind.X,
			bind.Y,
			bind.Z,
			bind.Heading,
			slot,
		).
		ON_DUPLICATE_KEY_UPDATE(
			table.CharacterBind.ZoneID.SET(mysql.Uint16(bind.ZoneID)),
			table.CharacterBind.InstanceID.SET(mysql.Uint32(bind.InstanceID)),
			table.CharacterBind.X.SET(mysql.Float(bind.X)),
			table.CharacterBind.Y.SET(mysql.Float(bind.Y)),
			table.CharacterBind.Z.SET(mysql.Float(bind.Z)),
			table.CharacterBind.Heading.SET(mysql.Float(bind.Heading)),
		).
		ExecContext(ctx, db.GlobalWorldDB.DB)
	return err
}

func GetOrCreateCharacterID(ctx context.Context, accountId int64, pp *eq.PlayerProfile) (int64, error) {
	cacheKey := fmt.Sprintf("account:character:%d", accountId)
	if val, found, err := cache.GetCache().Get(cacheKey); err == nil && found {
		if characterId, ok := val.(int32); ok {
			return (int64)(characterId), nil
		}
	}

	var acc model.Account
	name, err := pp.Name()
	if err != nil {
		return 0, fmt.Errorf("get name from PlayerProfile: %w", err)
	}
	err = table.CharacterData.
		SELECT(table.CharacterData.ID).
		FROM(table.CharacterData).
		WHERE(table.CharacterData.ID.EQ(mysql.Int(accountId)).AND(table.CharacterData.Name.EQ(mysql.String(name)))).
		QueryContext(ctx, db.GlobalWorldDB.DB, &acc)

	if err == nil {
		cache.GetCache().Set(cacheKey, acc.ID)
		return int64(acc.ID), nil
	}

	res, err := table.CharacterData.
		INSERT(
			table.CharacterData.AccountID,
			table.CharacterData.Name,
		).
		VALUES(
			mysql.Int(accountId),
			mysql.String(name),
		).
		ExecContext(ctx, db.GlobalWorldDB.DB)
	if err != nil {
		return 0, fmt.Errorf("insert account: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("getting last insert id: %w", err)
	}
	cache.GetCache().Set(cacheKey, id)
	return id, nil
}

// SaveCharacterCreate saves the character creation data to the database
func SaveCharacterCreate(ctx context.Context, accountID int64, pp *eq.PlayerProfile) bool {
	// Get or create character ID
	charID, err := GetOrCreateCharacterID(ctx, accountID, pp)
	if err != nil {
		log.Printf("Failed to get or create character ID for %d: %v", accountID, err)
		return false
	}
	name, err := pp.Name()
	if err != nil {
		log.Printf("Failed to get character name from PlayerProfile: %v", err)
		return false
	}

	// Start a transaction
	tx, err := db.GlobalWorldDB.DB.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("Failed to start transaction: %v", err)
		return false
	}
	defer tx.Rollback()

	// Update character_data
	stmt := table.CharacterData.
		UPDATE(
			table.CharacterData.ZoneID,
			table.CharacterData.X,
			table.CharacterData.Y,
			table.CharacterData.Z,
			table.CharacterData.Heading,
			table.CharacterData.Race,
			table.CharacterData.Class,
			table.CharacterData.Gender,
			table.CharacterData.Deity,
			table.CharacterData.Level,
			table.CharacterData.Str,
			table.CharacterData.Sta,
			table.CharacterData.Agi,
			table.CharacterData.Dex,
			table.CharacterData.Wis,
			table.CharacterData.Int,
			table.CharacterData.Cha,
			table.CharacterData.Face,
			table.CharacterData.LastLogin,
			table.CharacterData.Points,
			table.CharacterData.CurHp,
			table.CharacterData.HungerLevel,
			table.CharacterData.ThirstLevel,
		).
		SET(
			mysql.Uint32(uint32(pp.ZoneId())),
			mysql.Float(float64(pp.X())),
			mysql.Float(float64(pp.Y())),
			mysql.Float(float64(pp.Z())),
			mysql.Float(float64(pp.Heading())),
			mysql.Uint32(uint32(pp.Race())),
			mysql.Uint8(uint8(pp.CharClass())),
			mysql.Uint8(uint8(pp.Gender())),
			mysql.Uint32(uint32(pp.Deity())),
			mysql.Uint8(uint8(pp.Level())),
			mysql.Int32(pp.Str()),
			mysql.Int32(pp.Sta()),
			mysql.Int32(pp.Agi()),
			mysql.Int32(pp.Dex()),
			mysql.Int32(pp.Wis()),
			mysql.Int32(pp.Intel()),
			mysql.Int32(pp.Cha()),
			mysql.Int32(pp.Face()),
			mysql.Int32(pp.Lastlogin()),
			mysql.Int32(pp.Points()),
			mysql.Int32(pp.CurHp()),
			mysql.Int32(pp.HungerLevel()),
			mysql.Int32(pp.ThirstLevel()),
		).
		WHERE(table.CharacterData.ID.EQ(mysql.Int64(charID)))

	if _, err := stmt.ExecContext(ctx, tx); err != nil {
		log.Printf("Failed to save character data for %s: %v", name, err)
		return false
	}

	// Save skills
	skills, err := pp.Skills()
	if err != nil {
		log.Printf("Failed to get skills for %s: %v", name, err)
		return false
	}
	for i := range skills.Len() {
		skill := skills.At(i)

		if skill > 0 {
			stmt := table.CharacterSkills.
				INSERT(
					table.CharacterSkills.ID,
					table.CharacterSkills.SkillID,
					table.CharacterSkills.Value,
				).
				VALUES(
					charID,
					i,
					skill,
				).
				ON_DUPLICATE_KEY_UPDATE(
					table.CharacterSkills.Value.SET(mysql.Uint32(uint32(skill))),
				)
			if _, err := stmt.ExecContext(ctx, tx); err != nil {
				log.Printf("Failed to save skill %d for %s: %v", i, name, err)
				return false
			}
		}
	}

	// Save languages
	languages, err := pp.Languages()
	if err != nil {
		log.Printf("Failed to get languages for %s: %v", name, err)
		return false
	}
	for i := range languages.Len() {
		lang := languages.At(i)
		if lang > 0 {
			stmt := table.CharacterLanguages.
				INSERT(
					table.CharacterLanguages.ID,
					table.CharacterLanguages.LangID,
					table.CharacterLanguages.Value,
				).
				VALUES(
					charID,
					i,
					lang,
				).
				ON_DUPLICATE_KEY_UPDATE(
					table.CharacterLanguages.Value.SET(mysql.Uint32(uint32(lang))),
				)
			if _, err := stmt.ExecContext(ctx, tx); err != nil {
				log.Printf("Failed to save language %d for %s: %v", i, name, err)
				return false
			}
		}
	}

	// Save bind points
	binds, err := pp.Binds()
	if err != nil {
		log.Printf("Failed to get bind points for %s: %v", name, err)
		return false
	}
	for i := range binds.Len() {
		bind := binds.At(i)
		if bind.ZoneId() == 0 {
			continue // Skip unset binds
		}
		stmt := table.CharacterBind.
			INSERT(
				table.CharacterBind.ID,
				table.CharacterBind.ZoneID,
				table.CharacterBind.InstanceID,
				table.CharacterBind.X,
				table.CharacterBind.Y,
				table.CharacterBind.Z,
				table.CharacterBind.Heading,
				table.CharacterBind.Slot,
			).
			VALUES(
				charID,
				bind.ZoneId(),
				0, // InstanceID assumed 0 for new characters
				bind.X(),
				bind.Y(),
				bind.Z(),
				bind.Heading(),
				i,
			).
			ON_DUPLICATE_KEY_UPDATE(
				table.CharacterBind.ZoneID.SET(mysql.Uint16(uint16(bind.ZoneId()))),
				table.CharacterBind.InstanceID.SET(mysql.Uint32(0)),
				table.CharacterBind.X.SET(mysql.Float(float64(bind.X()))),
				table.CharacterBind.Y.SET(mysql.Float(float64(bind.Y()))),
				table.CharacterBind.Z.SET(mysql.Float(float64(bind.Z()))),
				table.CharacterBind.Heading.SET(mysql.Float(float64(bind.Heading()))),
			)
		if _, err := stmt.ExecContext(ctx, tx); err != nil {
			log.Printf("Failed to save bind point %d for %s: %v", i, name, err)
			return false
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("Failed to commit transaction for %s: %v", name, err)
		return false
	}

	// Save inventory later
	startingItems, err := db_character.InstantiateStartingItems(pp.Race(), pp.CharClass(), pp.Deity(), pp.ZoneId())
	if err != nil {
		log.Printf("Failed to instantiate starting items for %s: %v", name, err)
		return false
	}
	for _, item := range startingItems {
		_, _, err = items.AddItemToPlayerInventoryFreeSlot(item, int32(charID))
		if err != nil {
			log.Printf("Failed to add item to inventory for %s: %v", name, err)
			return false
		}
	}

	// Invalidate character select cache
	cacheKey := fmt.Sprintf("account:characters:%d", accountID)
	cache.GetCache().Delete(cacheKey)

	log.Printf("Character creation succeeded for %s (ID: %d)", name, charID)
	return true
}

// DeleteCharacter soft-deletes a character by setting the deleted_at timestamp
// and appending -DELETED-<uuid> to the character's name.
func DeleteCharacter(ctx context.Context, accountID int64, characterName string) error {
	uuidStr := uuid.New().String()
	newNameSuffix := fmt.Sprintf("-DELETED-%s", uuidStr)

	tx, err := db.GlobalWorldDB.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	var currentChar model.CharacterData
	err = table.CharacterData.
		SELECT(table.CharacterData.AllColumns).
		FROM(table.CharacterData).
		WHERE(
			table.CharacterData.Name.EQ(mysql.String(characterName)).
				AND(table.CharacterData.AccountID.EQ(mysql.Int64(accountID))).
				AND(table.CharacterData.DeletedAt.IS_NULL()),
		).
		QueryContext(ctx, tx, &currentChar)
	if err != nil {
		return fmt.Errorf("failed to retrieve character name (name=%s): %w", characterName, err)
	}

	// Append -DELETED-<uuid> to the name
	newName := currentChar.Name + newNameSuffix

	// Soft-delete the character and update name
	stmt := table.CharacterData.
		UPDATE(
			table.CharacterData.Name,
			table.CharacterData.DeletedAt,
		).
		SET(
			mysql.String(newName),
			mysql.NOW(),
		).
		WHERE(
			table.CharacterData.Name.EQ(mysql.String(characterName)).
				AND(table.CharacterData.AccountID.EQ(mysql.Int64(accountID))).
				AND(table.CharacterData.DeletedAt.IS_NULL()),
		)

	result, err := stmt.ExecContext(ctx, tx)
	if err != nil {
		return fmt.Errorf("failed to delete character (id=%s): %w", characterName, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("no character found with id %s for account %d or already deleted", characterName, accountID)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Invalidate character select cache
	cacheKey := fmt.Sprintf("account:characters:%d", accountID)
	if err := cache.GetCache().Delete(cacheKey); err != nil {
		log.Printf("Failed to delete cache key %s: %v", cacheKey, err)
		// Log but don't fail, as the database operation succeeded
	}

	log.Printf("Successfully deleted character (name=%s, new name=%s) for account %d", characterName, newName, accountID)
	return nil
}

func GetZone(ctx context.Context, zoneID int32) (model.Zone, error) {

	var zone model.Zone
	err := table.Zone.
		SELECT(table.Zone.AllColumns).
		FROM(table.Zone).
		WHERE(table.Zone.Zoneidnumber.EQ(mysql.Int32(zoneID))).
		QueryContext(ctx, db.GlobalWorldDB.DB, &zone)
	if err != nil {
		return model.Zone{}, fmt.Errorf("failed to get zone (id=%d): %w", zoneID, err)
	}
	return zone, nil
}
