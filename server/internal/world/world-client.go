package world

import (
	"context"
	"log"
	"unicode"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/session"

	_ "github.com/go-sql-driver/mysql"
)

// Constants for races and classes
const (
	RaceHuman     = 1
	RaceBarbarian = 2
	RaceErudite   = 3
	RaceWoodElf   = 4
	RaceHighElf   = 5
	RaceDarkElf   = 6
	RaceHalfElf   = 7
	RaceDwarf     = 8
	RaceTroll     = 9
	RaceOgre      = 10
	RaceHalfling  = 11
	RaceGnome     = 12
	RaceIksar     = 128
	RaceVahShir   = 130
	RaceFroglok   = 330
	RaceDrakkin   = 522

	ClassWarrior      = 1
	ClassCleric       = 2
	ClassPaladin      = 3
	ClassRanger       = 4
	ClassShadowKnight = 5
	ClassDruid        = 6
	ClassMonk         = 7
	ClassBard         = 8
	ClassRogue        = 9
	ClassShaman       = 10
	ClassNecromancer  = 11
	ClassWizard       = 12
	ClassMagician     = 13
	ClassEnchanter    = 14
	ClassBeastlord    = 15
	ClassBerserker    = 16
)

// BaseRaceStats defines base stats for each race
var BaseRaceStats = map[uint32][7]uint32{
	RaceHuman:     {75, 75, 75, 75, 75, 75, 75},
	RaceBarbarian: {103, 95, 82, 70, 70, 60, 55},
	RaceErudite:   {60, 70, 70, 70, 83, 107, 70},
	RaceWoodElf:   {65, 65, 95, 80, 80, 75, 75},
	RaceHighElf:   {55, 65, 85, 70, 95, 92, 80},
	RaceDarkElf:   {60, 65, 90, 75, 83, 99, 60},
	RaceHalfElf:   {70, 70, 90, 85, 60, 75, 75},
	RaceDwarf:     {90, 90, 70, 90, 83, 60, 45},
	RaceTroll:     {108, 109, 83, 75, 60, 52, 40},
	RaceOgre:      {130, 122, 70, 70, 67, 60, 37},
	RaceHalfling:  {70, 75, 95, 90, 80, 67, 50},
	RaceGnome:     {60, 70, 85, 85, 67, 98, 60},
	RaceIksar:     {70, 70, 90, 85, 80, 75, 55},
	RaceVahShir:   {90, 75, 90, 70, 70, 65, 65},
	RaceFroglok:   {70, 80, 100, 100, 75, 75, 50},
	RaceDrakkin:   {70, 80, 85, 75, 80, 85, 75},
}

// BaseClassStats defines base stats and additional points for each class
var BaseClassStats = map[uint32][8]uint32{
	ClassWarrior:      {10, 10, 5, 0, 0, 0, 0, 25},
	ClassCleric:       {5, 5, 0, 0, 10, 0, 0, 30},
	ClassPaladin:      {10, 5, 0, 0, 5, 0, 10, 20},
	ClassRanger:       {5, 10, 10, 0, 5, 0, 0, 20},
	ClassShadowKnight: {10, 5, 0, 0, 0, 10, 5, 20},
	ClassDruid:        {0, 10, 0, 0, 10, 0, 0, 30},
	ClassMonk:         {5, 5, 10, 10, 0, 0, 0, 20},
	ClassBard:         {5, 0, 0, 10, 0, 0, 10, 25},
	ClassRogue:        {0, 0, 10, 10, 0, 0, 0, 30},
	ClassShaman:       {0, 5, 0, 0, 10, 0, 5, 30},
	ClassNecromancer:  {0, 0, 0, 10, 0, 10, 0, 30},
	ClassWizard:       {0, 10, 0, 0, 0, 10, 0, 30},
	ClassMagician:     {0, 10, 0, 0, 0, 10, 0, 30},
	ClassEnchanter:    {0, 0, 0, 0, 0, 10, 10, 30},
	ClassBeastlord:    {0, 10, 5, 0, 10, 0, 5, 20},
	ClassBerserker:    {10, 5, 0, 10, 0, 0, 0, 25},
}

// ClassRaceLookupTable defines valid race/class combinations
var ClassRaceLookupTable = [16][16]bool{
	// Warrior
	{true, true, false, true, false, true, true, true, true, true, true, true, true, true, true, true},
	// Cleric
	{true, false, true, false, true, true, true, true, false, false, true, true, false, false, true, true},
	// Paladin
	{true, false, true, false, true, false, true, true, false, false, true, true, false, false, true, true},
	// Ranger
	{true, false, false, true, false, false, true, false, false, false, true, false, false, false, false, true},
	// ShadowKnight
	{true, false, true, false, false, true, false, false, true, true, false, true, true, false, true, true},
	// Druid
	{true, false, false, true, false, false, true, false, false, false, true, false, false, false, false, true},
	// Monk
	{true, false, false, false, false, false, false, false, false, false, false, false, true, false, false, true},
	// Bard
	{true, false, false, true, false, false, true, false, false, false, false, false, false, true, false, true},
	// Rogue
	{true, true, false, true, false, true, true, true, false, false, true, true, false, true, true, true},
	// Shaman
	{false, true, false, false, false, false, false, false, true, true, false, false, true, true, true, false},
	// Necromancer
	{true, false, true, false, false, true, false, false, false, false, false, true, true, false, true, true},
	// Wizard
	{true, false, true, false, true, true, false, false, false, false, false, true, false, false, true, true},
	// Magician
	{true, false, true, false, true, true, false, false, false, false, false, true, false, false, false, true},
	// Enchanter
	{true, false, true, false, true, true, false, false, false, false, false, true, false, false, false, true},
	// Beastlord
	{false, true, false, false, false, false, false, false, true, true, false, false, true, true, false, false},
	// Berserker
	{false, true, false, false, false, false, false, true, true, true, false, false, false, true, false, false},
}

// OPCharCreate creates the character in the database
func CharacterCreate(ses *session.Session, accountId int64, cc eq.CharCreate) bool {
	ctx := context.Background()
	if !CheckCharCreateInfo(cc) {
		log.Println("CheckCharCreateInfo failed")
		return false
	}
	pp, err := session.NewMessage(ses, eq.NewPlayerProfile)
	if err != nil {
		log.Printf("failed to create new PlayerProfile message: %v", err)
		return false
	}
	segment := pp.Segment()
	_, err = pp.NewSkills(78)
	if err != nil {
		log.Printf("failed to create new Skills list: %v", err)
		return false
	}
	_, err = pp.NewLanguages(18)
	if err != nil {
		log.Printf("failed to create new Languages list: %v", err)
		return false
	}

	_, err = pp.NewBinds(5)
	if err != nil {
		log.Printf("failed to create new Binds list: %v", err)
		return false
	}

	if !eq.CopyErrorValue(cc.Name, pp.SetName) {
		return false
	}
	pp.SetRace(cc.Race())
	pp.SetCharClass(cc.CharClass())
	pp.SetGender(cc.Gender())
	pp.SetDeity(cc.Deity())
	pp.SetStr(cc.Str())
	pp.SetSta(cc.Sta())
	pp.SetAgi(cc.Agi())
	pp.SetDex(cc.Dex())
	pp.SetWis(cc.Wis())
	pp.SetIntel(cc.Intel())
	pp.SetCha(cc.Cha())
	pp.SetFace(cc.Face())
	pp.SetBeard(cc.Beard())
	pp.SetLevel(1)
	pp.SetPoints(5)
	pp.SetCurHp(1000)
	pp.SetHungerLevel(6000)
	pp.SetThirstLevel(6000)
	pp.SetHeading(0)
	pp.SetPvp(0)
	pp.SetZoneId(2) // Qeynos as default
	pp.SetX(-1)
	pp.SetY(-1)
	pp.SetZ(-1)
	skills, _ := pp.Skills()
	skills.Set(27, 50) // Swimming
	skills.Set(55, 50) // Sense Heading

	// Set racial and class skills and languages
	SetRacialLanguages(&pp)
	SetRaceStartingSkills(&pp)
	SetClassStartingSkills(&pp)
	SetClassLanguages(&pp)

	startZone, err := GetStartZone(ctx, uint8(pp.CharClass()), uint32(pp.Deity()), uint32(pp.Race()))
	if err == nil {
		pp.SetZoneId(int32(startZone.ZoneID))
		cc.SetStartZone(int32(pp.ZoneId()))
		pp.SetX(float32(startZone.X))
		pp.SetY(float32(startZone.Y))
		pp.SetZ(float32(startZone.Z))
	} else {
		zone, err := GetZone(ctx, pp.ZoneId())
		if err != nil {
			pp.SetX(float32(zone.SafeX))
			pp.SetY(float32(zone.SafeY))
			pp.SetZ(float32(zone.SafeZ))
		} else {
			pp.SetX(-1)
			pp.SetY(-1)
			pp.SetZ(-1)
		}
	}

	binds, _ := pp.Binds()

	// Set bind points
	for i := range 5 {
		bind, _ := eq.NewBind(segment)
		bind.SetZoneId(pp.ZoneId())
		bind.SetX(pp.X())
		bind.SetY(pp.Y())
		bind.SetZ(pp.Z())
		bind.SetHeading(pp.Heading())
		binds.Set(i, bind)
	}

	// Store character
	return StoreCharacter(accountId, &pp)
}

func CheckCharCreateInfo(cc eq.CharCreate) bool {
	// Map race to table index
	raceMap := map[uint32]int{
		RaceHuman:     0,
		RaceBarbarian: 1,
		RaceErudite:   2,
		RaceWoodElf:   3,
		RaceHighElf:   4,
		RaceDarkElf:   5,
		RaceHalfElf:   6,
		RaceDwarf:     7,
		RaceTroll:     8,
		RaceOgre:      9,
		RaceHalfling:  10,
		RaceGnome:     11,
		RaceIksar:     12,
		RaceVahShir:   13,
		RaceFroglok:   14,
		RaceDrakkin:   15,
	}
	race := cc.Race()
	class := cc.CharClass()

	raceIdx, ok := raceMap[uint32(race)]
	if !ok || raceIdx >= 16 {
		log.Printf("Race %d is out of range", race)
		return false
	}

	classIdx := int(class) - 1
	if classIdx >= 16 {
		log.Printf("Class %d is out of range", class)
		return false
	}

	// Check race/class combination
	if !ClassRaceLookupTable[classIdx][raceIdx] {
		log.Println("Invalid race/class combination")
		return false
	}

	// Calculate base stats
	bSTR := BaseClassStats[uint32(class)][0] + BaseRaceStats[uint32(race)][0]
	bSTA := BaseClassStats[uint32(class)][1] + BaseRaceStats[uint32(race)][1]
	bAGI := BaseClassStats[uint32(class)][2] + BaseRaceStats[uint32(race)][2]
	bDEX := BaseClassStats[uint32(class)][3] + BaseRaceStats[uint32(race)][3]
	bWIS := BaseClassStats[uint32(class)][4] + BaseRaceStats[uint32(race)][4]
	bINT := BaseClassStats[uint32(class)][5] + BaseRaceStats[uint32(race)][5]
	bCHA := BaseClassStats[uint32(class)][6] + BaseRaceStats[uint32(race)][6]
	statPoints := BaseClassStats[uint32(class)][7]

	bTotal := bSTR + bSTA + bAGI + bDEX + bWIS + bINT + bCHA
	cTotal := cc.Str() + cc.Sta() + cc.Agi() + cc.Dex() + cc.Wis() + cc.Intel() + cc.Cha()

	errors := 0
	if bTotal+statPoints != uint32(cTotal) {
		log.Printf("Stat points total doesn't match: expected %d, got %d", bTotal+statPoints, cTotal)
		errors++
	}

	if uint32(cc.Str()) > bSTR+statPoints || cc.Str() < int32(bSTR) {
		log.Println("Str out of range")
		errors++
	}
	if uint32(cc.Sta()) > bSTA+statPoints || uint32(cc.Sta()) < bSTA {
		log.Println("Sta out of range")
		errors++
	}
	if uint32(cc.Agi()) > bAGI+statPoints || uint32(cc.Agi()) < bAGI {
		log.Println("Agi out of range")
		errors++
	}
	if uint32(cc.Dex()) > bDEX+statPoints || uint32(cc.Dex()) < bDEX {
		log.Println("Dex out of range")
		errors++
	}
	if uint32(cc.Wis()) > bWIS+statPoints || uint32(cc.Wis()) < bWIS {
		log.Println("Wis out of range")
		errors++
	}
	if uint32(cc.Intel()) > bINT+statPoints || uint32(cc.Intel()) < bINT {
		log.Println("Intel out of range")
		errors++
	}
	if uint32(cc.Cha()) > bCHA+statPoints || uint32(cc.Cha()) < bCHA {
		log.Println("Cha out of range")
		errors++
	}

	log.Printf("Found %d errors in character creation request", errors)
	return errors == 0
}

// SetRacialLanguages sets language skills based on race
func SetRacialLanguages(pp *eq.PlayerProfile) {
	const (
		LanguageCommonTongue  = 0
		LanguageBarbarian     = 1
		LanguageErudian       = 2
		LanguageElvish        = 3
		LanguageDarkElvish    = 4
		LanguageDwarvish      = 5
		LanguageTroll         = 6
		LanguageOgre          = 7
		LanguageGnomish       = 8
		LanguageHalfling      = 9
		LanguageLizardman     = 10
		LanguageVahShir       = 11
		LanguageFroglok       = 12
		LanguageDarkSpeech    = 13
		LanguageElderElvish   = 14
		LanguageCombineTongue = 15
		LanguageElderDragon   = 16
		LanguageDragon        = 17
	)

	maxValue := int32(100) // Language::MaxValue equivalent
	languages, err := pp.Languages()
	if err != nil {
		log.Printf("failed to get languages: %v", err)
		return
	}
	switch pp.Race() {
	case RaceHuman:
		languages.Set(LanguageCommonTongue, maxValue)
	case RaceBarbarian:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageBarbarian, maxValue)
	case RaceErudite:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageErudian, maxValue)
	case RaceWoodElf:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageElvish, maxValue)
	case RaceHighElf:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageElvish, maxValue)
		languages.Set(LanguageDarkElvish, maxValue)
		languages.Set(LanguageElderElvish, maxValue)
	case RaceDarkElf:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageDarkElvish, maxValue)
		languages.Set(LanguageDarkSpeech, maxValue)
		languages.Set(LanguageElderElvish, maxValue)
		languages.Set(LanguageElvish, 25)
	case RaceHalfElf:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageDarkElvish, maxValue)
	case RaceDwarf:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageDwarvish, maxValue)
		languages.Set(LanguageDarkElvish, 25)
	case RaceTroll:
		languages.Set(LanguageCommonTongue, 25) // RuleI(Character, TrollCommonTongue)
		languages.Set(LanguageDarkSpeech, maxValue)
		languages.Set(LanguageTroll, maxValue)
	case RaceOgre:
		languages.Set(LanguageCommonTongue, 25) // RuleI(Character, OgreCommonTongue)
		languages.Set(LanguageDarkSpeech, maxValue)
		languages.Set(LanguageOgre, maxValue)
	case RaceHalfling:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageHalfling, maxValue)
	case RaceGnome:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageGnomish, maxValue)
		languages.Set(LanguageDwarvish, 25)
	case RaceIksar:
		languages.Set(LanguageCommonTongue, 25)
		languages.Set(LanguageLizardman, maxValue)
		languages.Set(LanguageDarkSpeech, maxValue)

	case RaceVahShir:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageCombineTongue, maxValue)
		languages.Set(LanguageVahShir, maxValue)
		languages.Set(LanguageErudian, 25)
	case RaceFroglok:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageFroglok, maxValue)
		languages.Set(LanguageTroll, 25)
	case RaceDrakkin:
		languages.Set(LanguageCommonTongue, maxValue)
		languages.Set(LanguageElderDragon, maxValue)
		languages.Set(LanguageDragon, maxValue)
	}
}

// SetRaceStartingSkills sets race-specific starting skills
func SetRaceStartingSkills(pp *eq.PlayerProfile) {
	const (
		SkillHide      = 29
		SkillSneak     = 34
		SkillForage    = 17
		SkillSwimming  = 27
		SkillTinkering = 23
		SkillSafeFall  = 31
	)
	skills, err := pp.Skills()
	if err != nil {
		log.Printf("failed to get skills: %v", err)
		return
	}
	switch pp.Race() {
	case RaceDarkElf:
		skills.Set(SkillHide, 50)
	case RaceFroglok:
		skills.Set(SkillSwimming, 100)
	case RaceGnome:
		skills.Set(SkillTinkering, 50)
	case RaceHalfling:
		skills.Set(SkillHide, 50)
		skills.Set(SkillSneak, 50)
	case RaceIksar:
		skills.Set(SkillForage, 50)
		skills.Set(SkillSwimming, 50)
	case RaceWoodElf:
		skills.Set(SkillForage, 50)
		skills.Set(SkillHide, 50)
	case RaceVahShir:
		skills.Set(SkillSafeFall, 50)
		skills.Set(SkillSneak, 50)
	}
}

// SetClassStartingSkills sets class-specific starting skills
func SetClassStartingSkills(pp *eq.PlayerProfile) {
	// Simplified: Set non-zero skills to their cap at level 1
	// You may need a skill_caps table or function to get accurate caps
	skills, err := pp.Skills()
	if err != nil {
		log.Printf("failed to get skills: %v", err)
		return
	}
	for i := 0; i <= 77; i++ {
		if skills.At(i) == 0 {
			// Skip specialized skills, tradeskills (except fishing), etc.
			if i == 23 || i == 24 || i == 25 || i == 26 || i == 28 || i == 30 || i == 32 || i == 33 || i == 35 {
				continue
			}
			skills.Set(i, 50) // Placeholder; replace with actual skill cap logic
		}
	}
}

// SetClassLanguages sets class-specific languages
func SetClassLanguages(pp *eq.PlayerProfile) {
	const (
		LanguageThievesCant = 18
	)
	maxValue := uint32(100)
	languages, err := pp.Languages()
	if err != nil {
		log.Printf("failed to get languages: %v", err)
		return
	}
	if pp.CharClass() == ClassRogue {
		languages.Set(LanguageThievesCant, int32(maxValue))
	}
}

// StoreCharacter saves the character to the database
func StoreCharacter(accountID int64, pp *eq.PlayerProfile) bool {
	// Get character ID
	ctx := context.Background()
	return SaveCharacterCreate(ctx, accountID, pp)
}

func ValidateName(name string) bool {
	ctx := context.Background()
	isValid := true
	if len(name) < 4 || len(name) > 15 {
		isValid = false
	} else if !unicode.IsUpper(rune(name[0])) {
		isValid = false
	} else if !CheckNameFilter(ctx, name) {
		isValid = false
	} else {
		for idx, char := range name {
			if idx > 0 && (!unicode.IsLetter(char) || unicode.IsUpper(char)) {
				isValid = false
				break
			}
		}
	}
	return isValid
}
