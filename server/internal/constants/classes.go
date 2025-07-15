package constants

const (
	Class_None         uint8 = 0
	Class_Warrior      uint8 = 1
	Class_Cleric       uint8 = 2
	Class_Paladin      uint8 = 3
	Class_Ranger       uint8 = 4
	Class_ShadowKnight uint8 = 5
	Class_Druid        uint8 = 6
	Class_Monk         uint8 = 7
	Class_Bard         uint8 = 8
	Class_Rogue        uint8 = 9
	Class_Shaman       uint8 = 10
	Class_Necromancer  uint8 = 11
	Class_Wizard       uint8 = 12
	Class_Magician     uint8 = 13
	Class_Enchanter    uint8 = 14
	Class_Beastlord    uint8 = 15
	Class_Berserker    uint8 = 16

	Class_WarriorGM      uint8 = 20
	Class_ClericGM       uint8 = 21
	Class_PaladinGM      uint8 = 22
	Class_RangerGM       uint8 = 23
	Class_ShadowKnightGM uint8 = 24
	Class_DruidGM        uint8 = 25
	Class_MonkGM         uint8 = 26
	Class_BardGM         uint8 = 27
	Class_RogueGM        uint8 = 28
	Class_ShamanGM       uint8 = 29
	Class_NecromancerGM  uint8 = 30
	Class_WizardGM       uint8 = 31
	Class_MagicianGM     uint8 = 32
	Class_EnchanterGM    uint8 = 33
	Class_BeastlordGM    uint8 = 34
	Class_BerserkerGM    uint8 = 35

	Class_Banker                    uint8 = 40
	Class_Merchant                  uint8 = 41
	Class_DiscordMerchant           uint8 = 59
	Class_AdventureRecruiter        uint8 = 60
	Class_AdventureMerchant         uint8 = 61
	Class_LDoNTreasure              uint8 = 62
	Class_TributeMaster             uint8 = 63
	Class_GuildTributeMaster        uint8 = 64
	Class_GuildBanker               uint8 = 66
	Class_NorrathsKeepersMerchant   uint8 = 67
	Class_DarkReignMerchant         uint8 = 68
	Class_FellowshipMaster          uint8 = 69
	Class_AlternateCurrencyMerchant uint8 = 70
	Class_MercenaryLiaison          uint8 = 71
)

// playerClassBitmasks maps uint8 to its bitmask
var playerClassBitmasks = map[uint8]uint16{
	Class_Warrior:      1,
	Class_Cleric:       2,
	Class_Paladin:      4,
	Class_Ranger:       8,
	Class_ShadowKnight: 16,
	Class_Druid:        32,
	Class_Monk:         64,
	Class_Bard:         128,
	Class_Rogue:        256,
	Class_Shaman:       512,
	Class_Necromancer:  1024,
	Class_Wizard:       2048,
	Class_Magician:     4096,
	Class_Enchanter:    8192,
	Class_Beastlord:    16384,
	Class_Berserker:    32768,
}

// classNames maps uint8 to its display name
var classNames = map[uint8]string{
	Class_Warrior:      "Warrior",
	Class_Cleric:       "Cleric",
	Class_Paladin:      "Paladin",
	Class_Ranger:       "Ranger",
	Class_ShadowKnight: "Shadow Knight",
	Class_Druid:        "Druid",
	Class_Monk:         "Monk",
	Class_Bard:         "Bard",
	Class_Rogue:        "Rogue",
	Class_Shaman:       "Shaman",
	Class_Necromancer:  "Necromancer",
	Class_Wizard:       "Wizard",
	Class_Magician:     "Magician",
	Class_Enchanter:    "Enchanter",
	Class_Beastlord:    "Beastlord",
	Class_Berserker:    "Berserker",
}

// Getuint8Name returns the class name or level-based title
func Getuint8Name(uint8 uint8, level uint8) string {
	switch uint8 {
	case Class_Warrior:
		return warriorTitle(level)
	case Class_Cleric:
		return clericTitle(level)
	case Class_Paladin:
		return paladinTitle(level)
	case Class_Ranger:
		return rangerTitle(level)
	case Class_ShadowKnight:
		return shadowKnightTitle(level)
	case Class_Druid:
		return druidTitle(level)
	case Class_Monk:
		return monkTitle(level)
	case Class_Bard:
		return bardTitle(level)
	case Class_Rogue:
		return rogueTitle(level)
	case Class_Shaman:
		return shamanTitle(level)
	case Class_Necromancer:
		return necromancerTitle(level)
	case Class_Wizard:
		return wizardTitle(level)
	case Class_Magician:
		return magicianTitle(level)
	case Class_Enchanter:
		return enchanterTitle(level)
	case Class_Beastlord:
		return beastlordTitle(level)
	case Class_Berserker:
		return berserkerTitle(level)
	default:
		if name, ok := classNames[uint8]; ok {
			return name
		}
		return "Unknown"
	}
}

// helper title functions per class
func warriorTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Imperator"
	case level >= 70:
		return "Vanquisher"
	case level >= 65:
		return "Overlord"
	case level >= 60:
		return "Warlord"
	case level >= 55:
		return "Myrmidon"
	case level >= 51:
		return "Champion"
	}
	return "Warrior"
}

func clericTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Exemplar"
	case level >= 70:
		return "Prelate"
	case level >= 65:
		return "Archon"
	case level >= 60:
		return "High Priest"
	case level >= 55:
		return "Templar"
	case level >= 51:
		return "Vicar"
	}
	return "Cleric"
}

func paladinTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Holy Defender"
	case level >= 70:
		return "Lord"
	case level >= 65:
		return "Lord Protector"
	case level >= 60:
		return "Crusader"
	case level >= 55:
		return "Knight"
	case level >= 51:
		return "Cavalier"
	}
	return "Paladin"
}

func rangerTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Huntmaster"
	case level >= 70:
		return "Plainswalker"
	case level >= 65:
		return "Forest Stalker"
	case level >= 60:
		return "Warder"
	case level >= 55:
		return "Outrider"
	case level >= 51:
		return "Pathfinder"
	}
	return "Ranger"
}

func shadowKnightTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Bloodreaver"
	case level >= 70:
		return "Scourge Knight"
	case level >= 65:
		return "Dread Lord"
	case level >= 60:
		return "Grave Lord"
	case level >= 55:
		return "Revenant"
	case level >= 51:
		return "Reaver"
	}
	return "Shadow Knight"
}

func druidTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Storm Caller"
	case level >= 70:
		return "Natureguard"
	case level >= 65:
		return "Storm Warden"
	case level >= 60:
		return "Hierophant"
	case level >= 55:
		return "Preserver"
	case level >= 51:
		return "Wanderer"
	}
	return "Druid"
}

func monkTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Ashenhand"
	case level >= 70:
		return "Stone Fist"
	case level >= 65:
		return "Transcendent"
	case level >= 60:
		return "Grandmaster"
	case level >= 55:
		return "Master"
	case level >= 51:
		return "Disciple"
	}
	return "Monk"
}

func bardTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Lyricist"
	case level >= 70:
		return "Performer"
	case level >= 65:
		return "Maestro"
	case level >= 60:
		return "Virtuoso"
	case level >= 55:
		return "Troubadour"
	case level >= 51:
		return "Minstrel"
	}
	return "Bard"
}

func rogueTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Shadowblade"
	case level >= 70:
		return "Nemesis"
	case level >= 65:
		return "Deceiver"
	case level >= 60:
		return "Assassin"
	case level >= 55:
		return "Blackguard"
	case level >= 51:
		return "Rake"
	}
	return "Rogue"
}

func shamanTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Spiritwatcher"
	case level >= 70:
		return "Soothsayer"
	case level >= 65:
		return "Prophet"
	case level >= 60:
		return "Oracle"
	case level >= 55:
		return "Luminary"
	case level >= 51:
		return "Mystic"
	}
	return "Shaman"
}

func necromancerTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Deathcaller"
	case level >= 70:
		return "Wraith"
	case level >= 65:
		return "Arch Lich"
	case level >= 60:
		return "Warlock"
	case level >= 55:
		return "Defiler"
	case level >= 51:
		return "Heretic"
	}
	return "Necromancer"
}

func wizardTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Pyromancer"
	case level >= 70:
		return "Grand Arcanist"
	case level >= 65:
		return "Arcanist"
	case level >= 60:
		return "Sorcerer"
	case level >= 55:
		return "Evoker"
	case level >= 51:
		return "Channeler"
	}
	return "Wizard"
}

func magicianTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Grand Summoner"
	case level >= 70:
		return "Arch Magus"
	case level >= 65:
		return "Arch Convoker"
	case level >= 60:
		return "Arch Mage"
	case level >= 55:
		return "Conjurer"
	case level >= 51:
		return "Elementalist"
	}
	return "Magician"
}

func enchanterTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Entrancer"
	case level >= 70:
		return "Bedazzler"
	case level >= 65:
		return "Coercer"
	case level >= 60:
		return "Phantasmist"
	case level >= 55:
		return "Beguiler"
	case level >= 51:
		return "Illusionist"
	}
	return "Enchanter"
}

func beastlordTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Frostblood"
	case level >= 70:
		return "Wildblood"
	case level >= 65:
		return "Feral Lord"
	case level >= 60:
		return "Savage Lord"
	case level >= 55:
		return "Animist"
	case level >= 51:
		return "Primalist"
	}
	return "Beastlord"
}

func berserkerTitle(level uint8) string {
	switch {
	case level >= 75:
		return "Juggernaut"
	case level >= 70:
		return "Ravager"
	case level >= 65:
		return "Fury"
	case level >= 60:
		return "Rager"
	case level >= 55:
		return "Vehement"
	case level >= 51:
		return "Brawler"
	}
	return "Berserker"
}

// IsPlayerClass returns true for core playable classes
func IsPlayerClass(uint8 uint8) bool {
	switch uint8 {
	case Class_Warrior, Class_Cleric, Class_Paladin, Class_Ranger,
		Class_ShadowKnight, Class_Druid, Class_Monk, Class_Bard,
		Class_Rogue, Class_Shaman, Class_Necromancer, Class_Wizard,
		Class_Magician, Class_Enchanter, Class_Beastlord, Class_Berserker:
		return true
	}
	return false
}

// GetPlayerClassValue returns uint8 if playable, else None
func GetPlayerClassValue(uint8 uint8) uint8 {
	if !IsPlayerClass(uint8) {
		return Class_None
	}
	return uint8
}

// GetPlayerClassBit returns the bitmask for uint8
func GetPlayerClassBit(uint8 uint8) uint16 {
	if bit, ok := playerClassBitmasks[uint8]; ok {
		return bit
	}
	return 0
}

// GetPlayerClassAbbreviation returns 3-letter code
func GetPlayerClassAbbreviation(uint8 uint8) string {
	switch uint8 {
	case Class_Warrior:
		return "WAR"
	case Class_Cleric:
		return "CLR"
	case Class_Paladin:
		return "PAL"
	case Class_Ranger:
		return "RNG"
	case Class_ShadowKnight:
		return "SHD"
	case Class_Druid:
		return "DRU"
	case Class_Monk:
		return "MNK"
	case Class_Bard:
		return "BRD"
	case Class_Rogue:
		return "ROG"
	case Class_Shaman:
		return "SHM"
	case Class_Necromancer:
		return "NEC"
	case Class_Wizard:
		return "WIZ"
	case Class_Magician:
		return "MAG"
	case Class_Enchanter:
		return "ENC"
	case Class_Beastlord:
		return "BST"
	case Class_Berserker:
		return "BER"
	}
	return "UNK"
}
