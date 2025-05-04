package world

import (
	"context"
	"log"
	"unicode"

	eqpb "github.com/knervous/eqgo/internal/api/proto"

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
func CharacterCreate(accountId int64, cc *eqpb.CharCreate) bool {
	ctx := context.Background()
	if !CheckCharCreateInfo(cc) {
		log.Println("CheckCharCreateInfo failed")
		return false
	}
	// Initialize player profile
	var pp eqpb.PlayerProfile
	pp.Skills = make([]int32, 78)
	pp.Languages = make([]int32, 18)
	pp.Binds = make([]*eqpb.Bind, 5)
	pp.Name = cc.Name
	pp.Race = cc.Race
	pp.CharClass = cc.CharClass
	pp.Gender = cc.Gender
	pp.Deity = cc.Deity
	pp.Str = cc.Str
	pp.Sta = cc.Sta
	pp.Agi = cc.Agi
	pp.Dex = cc.Dex
	pp.Wis = cc.Wis
	pp.Intel = cc.Intel
	pp.Cha = cc.Cha
	pp.Face = cc.Face
	pp.Beard = cc.Beard
	pp.Level = 1
	pp.Points = 5
	pp.CurHp = 1000
	pp.HungerLevel = 6000
	pp.ThirstLevel = 6000

	// Set default skills
	pp.Skills[27] = 50 // Swimming
	pp.Skills[55] = 50 // Sense Heading

	// Set racial and class skills and languages
	SetRacialLanguages(&pp)
	SetRaceStartingSkills(&pp)
	SetClassStartingSkills(&pp)
	SetClassLanguages(&pp)

	// Set PVP status (assuming server type 1 is PVP)

	pp.Pvp = 0

	// Set starting zone
	pp.ZoneId = 2 // Qeynos as default

	startZone, err := GetStartZone(ctx, uint8(pp.CharClass), uint32(pp.Deity), uint32(pp.Race))
	setLoc := false
	if err == nil {
		pp.ZoneId = int32(startZone.ZoneID)
		cc.StartZone = int32(pp.ZoneId)
		pp.X = float32(startZone.X)
		pp.Y = float32(startZone.Y)
		pp.Z = float32(startZone.Z)
		setLoc = true
	}

	zone, err := GetZone(ctx, pp.ZoneId)
	if err != nil {
		pp.X = float32(zone.SafeX)
		pp.Y = float32(zone.SafeY)
		pp.Z = float32(zone.SafeZ)
	} else if !setLoc {
		pp.X = -1
		pp.Y = -1
		pp.Z = -1
	}

	// Set bind points
	for i := range 5 {
		pp.Binds[i] = &eqpb.Bind{
			ZoneId:  pp.ZoneId,
			X:       pp.X,
			Y:       pp.Y,
			Z:       pp.Z,
			Heading: pp.Heading,
		}
	}

	// Store character
	return StoreCharacter(accountId, &pp)
}

func CheckCharCreateInfo(cc *eqpb.CharCreate) bool {
	if cc == nil {
		return false
	}
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

	raceIdx, ok := raceMap[uint32(cc.Race)]
	if !ok || raceIdx >= 16 {
		log.Printf("Race %d is out of range", cc.Race)
		return false
	}

	classIdx := int(cc.CharClass) - 1
	if classIdx >= 16 {
		log.Printf("Class %d is out of range", cc.CharClass)
		return false
	}

	// Check race/class combination
	if !ClassRaceLookupTable[classIdx][raceIdx] {
		log.Println("Invalid race/class combination")
		return false
	}

	// Calculate base stats
	bSTR := BaseClassStats[uint32(cc.CharClass)][0] + BaseRaceStats[uint32(cc.Race)][0]
	bSTA := BaseClassStats[uint32(cc.CharClass)][1] + BaseRaceStats[uint32(cc.Race)][1]
	bAGI := BaseClassStats[uint32(cc.CharClass)][2] + BaseRaceStats[uint32(cc.Race)][2]
	bDEX := BaseClassStats[uint32(cc.CharClass)][3] + BaseRaceStats[uint32(cc.Race)][3]
	bWIS := BaseClassStats[uint32(cc.CharClass)][4] + BaseRaceStats[uint32(cc.Race)][4]
	bINT := BaseClassStats[uint32(cc.CharClass)][5] + BaseRaceStats[uint32(cc.Race)][5]
	bCHA := BaseClassStats[uint32(cc.CharClass)][6] + BaseRaceStats[uint32(cc.Race)][6]
	statPoints := BaseClassStats[uint32(cc.CharClass)][7]

	bTotal := bSTR + bSTA + bAGI + bDEX + bWIS + bINT + bCHA
	cTotal := cc.Str + cc.Sta + cc.Agi + cc.Dex + cc.Wis + cc.Intel + cc.Cha

	errors := 0
	if bTotal+statPoints != uint32(cTotal) {
		log.Printf("Stat points total doesn't match: expected %d, got %d", bTotal+statPoints, cTotal)
		errors++
	}

	if uint32(cc.Str) > bSTR+statPoints || cc.Str < int32(bSTR) {
		log.Println("Str out of range")
		errors++
	}
	if uint32(cc.Sta) > bSTA+statPoints || uint32(cc.Sta) < bSTA {
		log.Println("Sta out of range")
		errors++
	}
	if uint32(cc.Agi) > bAGI+statPoints || uint32(cc.Agi) < bAGI {
		log.Println("Agi out of range")
		errors++
	}
	if uint32(cc.Dex) > bDEX+statPoints || uint32(cc.Dex) < bDEX {
		log.Println("Dex out of range")
		errors++
	}
	if uint32(cc.Wis) > bWIS+statPoints || uint32(cc.Wis) < bWIS {
		log.Println("Wis out of range")
		errors++
	}
	if uint32(cc.Intel) > bINT+statPoints || uint32(cc.Intel) < bINT {
		log.Println("Intel out of range")
		errors++
	}
	if uint32(cc.Cha) > bCHA+statPoints || uint32(cc.Cha) < bCHA {
		log.Println("Cha out of range")
		errors++
	}

	log.Printf("Found %d errors in character creation request", errors)
	return errors == 0
}

// SetRacialLanguages sets language skills based on race
func SetRacialLanguages(pp *eqpb.PlayerProfile) {
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

	switch pp.Race {
	case RaceHuman:
		pp.Languages[LanguageCommonTongue] = maxValue
	case RaceBarbarian:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageBarbarian] = maxValue
	case RaceErudite:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageErudian] = maxValue
	case RaceWoodElf:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageElvish] = maxValue
	case RaceHighElf:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageDarkElvish] = 25
		pp.Languages[LanguageElderElvish] = 25
		pp.Languages[LanguageElvish] = maxValue
	case RaceDarkElf:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageDarkElvish] = maxValue
		pp.Languages[LanguageDarkSpeech] = maxValue
		pp.Languages[LanguageElderElvish] = maxValue
		pp.Languages[LanguageElvish] = 25
	case RaceHalfElf:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageElvish] = maxValue
	case RaceDwarf:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageDwarvish] = maxValue
		pp.Languages[LanguageGnomish] = 25
	case RaceTroll:
		pp.Languages[LanguageCommonTongue] = 25 // RuleI(Character, TrollCommonTongue)
		pp.Languages[LanguageDarkSpeech] = maxValue
		pp.Languages[LanguageTroll] = maxValue
	case RaceOgre:
		pp.Languages[LanguageCommonTongue] = 25 // RuleI(Character, OgreCommonTongue)
		pp.Languages[LanguageDarkSpeech] = maxValue
		pp.Languages[LanguageOgre] = maxValue
	case RaceHalfling:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageHalfling] = maxValue
	case RaceGnome:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageDwarvish] = 25
		pp.Languages[LanguageGnomish] = maxValue
	case RaceIksar:
		pp.Languages[LanguageCommonTongue] = 25 // RuleI(Character, IksarCommonTongue)
		pp.Languages[LanguageDarkSpeech] = maxValue
		pp.Languages[LanguageLizardman] = maxValue
	case RaceVahShir:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageCombineTongue] = maxValue
		pp.Languages[LanguageErudian] = 25
		pp.Languages[LanguageVahShir] = maxValue
	case RaceFroglok:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageFroglok] = maxValue
		pp.Languages[LanguageTroll] = 25
	case RaceDrakkin:
		pp.Languages[LanguageCommonTongue] = maxValue
		pp.Languages[LanguageElderDragon] = maxValue
		pp.Languages[LanguageDragon] = maxValue
	}
}

// SetRaceStartingSkills sets race-specific starting skills
func SetRaceStartingSkills(pp *eqpb.PlayerProfile) {
	const (
		SkillHide      = 29
		SkillSneak     = 34
		SkillForage    = 17
		SkillSwimming  = 27
		SkillTinkering = 23
		SkillSafeFall  = 31
	)

	switch pp.Race {
	case RaceDarkElf:
		pp.Skills[SkillHide] = 50
	case RaceFroglok:
		if pp.Skills[SkillSwimming] < 125 {
			pp.Skills[SkillSwimming] = 125
		}
	case RaceGnome:
		pp.Skills[SkillTinkering] = 50
	case RaceHalfling:
		pp.Skills[SkillHide] = 50
		pp.Skills[SkillSneak] = 50
	case RaceIksar:
		pp.Skills[SkillForage] = 50
		if pp.Skills[SkillSwimming] < 100 {
			pp.Skills[SkillSwimming] = 100
		}
	case RaceWoodElf:
		pp.Skills[SkillForage] = 50
		pp.Skills[SkillHide] = 50
	case RaceVahShir:
		pp.Skills[SkillSafeFall] = 50
		pp.Skills[SkillSneak] = 50
	}
}

// SetClassStartingSkills sets class-specific starting skills
func SetClassStartingSkills(pp *eqpb.PlayerProfile) {
	// Simplified: Set non-zero skills to their cap at level 1
	// You may need a skill_caps table or function to get accurate caps
	for i := 0; i <= 77; i++ {
		if pp.Skills[i] == 0 {
			// Skip specialized skills, tradeskills (except fishing), etc.
			if i == 23 || i == 24 || i == 25 || i == 26 || i == 28 || i == 30 || i == 32 || i == 33 || i == 35 {
				continue
			}
			pp.Skills[i] = 50 // Placeholder; replace with actual skill cap logic
		}
	}
}

// SetClassLanguages sets class-specific languages
func SetClassLanguages(pp *eqpb.PlayerProfile) {
	const (
		LanguageThievesCant = 18
	)
	maxValue := uint32(100)

	if pp.CharClass == ClassRogue {
		pp.Languages[LanguageThievesCant] = int32(maxValue)
	}
}

// SetStartingItems sets starting items for the character
func SetStartingItems(pp *eqpb.PlayerProfile, race, class, deity, zoneID uint32, name string) {

}

// StoreCharacter saves the character to the database
func StoreCharacter(accountID int64, pp *eqpb.PlayerProfile) bool {
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
