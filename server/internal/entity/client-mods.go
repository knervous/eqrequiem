package entity

import "github.com/knervous/eqgo/internal/constants"

func (client *Client) CalcBonuses() {
	client.CalcItemBonuses()
	client.CalcAABonuses()
	client.CalcSpellBonuses()

	client.CalcAC()
	client.CalcATK()
	client.CalcHaste()

	// Base stats
	client.CalcSTR()
	client.CalcSTA()
	client.CalcDEX()
	client.CalcAGI()
	client.CalcINT()
	client.CalcWIS()
	client.CalcCHA()

	// Resists
	client.CalcMR()
	client.CalcFR()
	client.CalcDR()
	client.CalcPR()
	client.CalcCR()

	client.CalcMaxHP()
	client.CalcMaxMana()
}

func (client *Client) CalcATK() {

}

func (client *Client) CalcHaste() {

}

// Core stats
func (client *Client) CalcSTR() {
	client.Mob.STR = int32(client.CharData.Str)
	if client.Mob.ItemBonuses != nil {
		client.Mob.STR += client.Mob.ItemBonuses.STR
	}
	if client.Mob.SpellBonuses != nil {
		client.Mob.STR += client.Mob.SpellBonuses.STR
	}
	if client.Mob.AABonuses != nil {
		client.Mob.STR += client.Mob.AABonuses.STR
	}
	if client.Mob.STR < 1 {
		client.Mob.STR = 1
	}
}

func (client *Client) CalcSTA() {
	client.Mob.STA = int32(client.CharData.Sta)
	if client.Mob.ItemBonuses != nil {
		client.Mob.STA += client.Mob.ItemBonuses.STA
	}
	if client.Mob.SpellBonuses != nil {
		client.Mob.STA += client.Mob.SpellBonuses.STA
	}
	if client.Mob.AABonuses != nil {
		client.Mob.STA += client.Mob.AABonuses.STA
	}
	if client.Mob.STA < 1 {
		client.Mob.STA = 1
	}

}
func (client *Client) CalcDEX() {
	client.Mob.DEX = int32(client.CharData.Dex)
	if client.Mob.ItemBonuses != nil {
		client.Mob.DEX += client.Mob.ItemBonuses.DEX
	}
	if client.Mob.SpellBonuses != nil {
		client.Mob.DEX += client.Mob.SpellBonuses.DEX
	}
	if client.Mob.AABonuses != nil {
		client.Mob.DEX += client.Mob.AABonuses.DEX
	}
	if client.Mob.DEX < 1 {
		client.Mob.DEX = 1
	}

}
func (client *Client) CalcAGI() {
	client.Mob.AGI = int32(client.CharData.Agi)
	if client.Mob.ItemBonuses != nil {
		client.Mob.AGI += client.Mob.ItemBonuses.AGI
	}
	if client.Mob.SpellBonuses != nil {
		client.Mob.AGI += client.Mob.SpellBonuses.AGI
	}
	if client.Mob.AABonuses != nil {
		client.Mob.AGI += client.Mob.AABonuses.AGI
	}
	if client.Mob.AGI < 1 {
		client.Mob.AGI = 1
	}

}
func (client *Client) CalcINT() {
	client.Mob.INT = int32(client.CharData.Int)
	if client.Mob.ItemBonuses != nil {
		client.Mob.INT += client.Mob.ItemBonuses.INT
	}
	if client.Mob.SpellBonuses != nil {
		client.Mob.INT += client.Mob.SpellBonuses.INT
	}
	if client.Mob.AABonuses != nil {
		client.Mob.INT += client.Mob.AABonuses.INT
	}
	if client.Mob.INT < 1 {
		client.Mob.INT = 1
	}

}
func (client *Client) CalcWIS() {
	client.Mob.WIS = int32(client.CharData.Wis)
	if client.Mob.ItemBonuses != nil {
		client.Mob.WIS += client.Mob.ItemBonuses.WIS
	}
	if client.Mob.SpellBonuses != nil {
		client.Mob.WIS += client.Mob.SpellBonuses.WIS
	}
	if client.Mob.AABonuses != nil {
		client.Mob.WIS += client.Mob.AABonuses.WIS
	}
	if client.Mob.WIS < 1 {
		client.Mob.WIS = 1
	}

}
func (client *Client) CalcCHA() {
	client.Mob.CHA = int32(client.CharData.Cha)
	if client.Mob.ItemBonuses != nil {
		client.Mob.CHA += client.Mob.ItemBonuses.CHA
	}
	if client.Mob.SpellBonuses != nil {
		client.Mob.CHA += client.Mob.SpellBonuses.CHA
	}
	if client.Mob.AABonuses != nil {
		client.Mob.CHA += client.Mob.AABonuses.CHA
	}
	if client.Mob.CHA < 1 {
		client.Mob.CHA = 1
	}

}

// Resists
// raceBaseMR maps each race to its base Magic Resistance.
var raceBaseMR = map[constants.RaceID]int32{
	constants.RaceHuman:     25,
	constants.RaceBarbarian: 25,
	constants.RaceErudite:   30,
	constants.RaceWoodElf:   25,
	constants.RaceHighElf:   25,
	constants.RaceDarkElf:   25,
	constants.RaceHalfElf:   25,
	constants.RaceDwarf:     30,
	constants.RaceTroll:     25,
	constants.RaceOgre:      25,
	constants.RaceHalfling:  25,
	constants.RaceGnome:     25,
	constants.RaceIksar:     25,
	constants.RaceVahShir:   25,
	constants.RaceFroglok:   30,
}

func (c *Client) CalcMR() {
	race := constants.RaceID(c.CharData.Race)
	base, ok := raceBaseMR[race]
	if !ok {
		base = 20
	}

	total := base
	if b := c.Mob.ItemBonuses; b != nil {
		total += b.MR
	}
	if b := c.Mob.SpellBonuses; b != nil {
		total += b.MR
	}
	if b := c.Mob.AABonuses; b != nil {
		total += b.MR
	}

	if total < 1 {
		total = 1
	}

	c.Mob.MR = total
}

var raceBaseFR = map[constants.RaceID]int32{
	constants.RaceHuman:     25,
	constants.RaceBarbarian: 25,
	constants.RaceErudite:   25,
	constants.RaceWoodElf:   25,
	constants.RaceHighElf:   25,
	constants.RaceDarkElf:   25,
	constants.RaceHalfElf:   25,
	constants.RaceDwarf:     25,
	constants.RaceTroll:     5,
	constants.RaceOgre:      25,
	constants.RaceHalfling:  25,
	constants.RaceGnome:     25,
	constants.RaceIksar:     30,
	constants.RaceVahShir:   25,
	constants.RaceFroglok:   25,
}

// CalcFR computes the client's Fire Resistance in an idiomatic Go manner.
func (c *Client) CalcFR() {
	race := constants.RaceID(c.CharData.Race)
	base, ok := raceBaseFR[race]
	if !ok {
		base = 20
	}

	switch c.CharData.Class {
	case constants.Class_Ranger, constants.Class_Monk:
		bonus := uint32(0)
		if c.CharData.Class == constants.Class_Ranger {
			bonus = 4
		} else {
			bonus = 8
		}
		level := c.CharData.Level
		if level > 49 {
			bonus += level - 49
		}
		base += int32(bonus)
	}

	total := base
	if b := c.Mob.ItemBonuses; b != nil {
		total += b.FR
	}
	if b := c.Mob.SpellBonuses; b != nil {
		total += b.FR
	}
	if b := c.Mob.AABonuses; b != nil {
		total += b.FR
	}

	if total < 1 {
		total = 1
	}

	c.Mob.FR = total
}

// raceBaseCR holds the base Cold Resistance values per race.
var raceBaseCR = map[constants.RaceID]int32{
	constants.RaceHuman:     25,
	constants.RaceBarbarian: 35,
	constants.RaceErudite:   25,
	constants.RaceWoodElf:   25,
	constants.RaceHighElf:   25,
	constants.RaceDarkElf:   25,
	constants.RaceHalfElf:   25,
	constants.RaceDwarf:     25,
	constants.RaceTroll:     25,
	constants.RaceOgre:      25,
	constants.RaceHalfling:  25,
	constants.RaceGnome:     25,
	constants.RaceIksar:     15,
	constants.RaceVahShir:   25,
	constants.RaceFroglok:   25,
}

func (c *Client) CalcCR() {
	race := constants.RaceID(c.CharData.Race)
	base, ok := raceBaseCR[race]
	if !ok {
		base = 25
	}

	switch c.CharData.Class {
	case constants.Class_Ranger, constants.Class_Beastlord:
		bonus := uint32(4)
		if level := c.CharData.Level; level > 49 {
			bonus += level - 49
		}
		base += int32(bonus)
	}

	total := base
	if b := c.Mob.ItemBonuses; b != nil {
		total += b.CR
	}
	if b := c.Mob.SpellBonuses; b != nil {
		total += b.CR
	}
	if b := c.Mob.AABonuses; b != nil {
		total += b.CR
	}

	if total < 1 {
		total = 1
	}

	c.Mob.CR = total
}

var raceBaseDR = map[constants.RaceID]int32{
	constants.RaceHuman:     15,
	constants.RaceBarbarian: 15,
	constants.RaceErudite:   10,
	constants.RaceWoodElf:   15,
	constants.RaceHighElf:   15,
	constants.RaceDarkElf:   15,
	constants.RaceHalfElf:   15,
	constants.RaceDwarf:     15,
	constants.RaceTroll:     15,
	constants.RaceOgre:      15,
	constants.RaceHalfling:  20,
	constants.RaceGnome:     15,
	constants.RaceIksar:     15,
	constants.RaceVahShir:   15,
	constants.RaceFroglok:   15,
}

func (c *Client) CalcDR() {
	// Determine base DR from race, defaulting to 15 if unknown.
	race := constants.RaceID(c.CharData.Race)
	base, ok := raceBaseDR[race]
	if !ok {
		base = 15
	}

	// Class-based bonuses
	switch c.CharData.Class {
	case constants.Class_Monk:
		if level := c.CharData.Level; level > 50 {
			base += int32(level - 50)
		}

	case constants.Class_Paladin:
		bonus := int32(8)
		if level := c.CharData.Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus

	case constants.Class_ShadowKnight, constants.Class_Beastlord:
		bonus := int32(4)
		if level := c.CharData.Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus
	}

	// Accumulate item, spell, and AA bonuses
	total := base
	if b := c.Mob.ItemBonuses; b != nil {
		total += b.DR
	}
	if b := c.Mob.SpellBonuses; b != nil {
		total += b.DR
	}
	if b := c.Mob.AABonuses; b != nil {
		total += b.DR
	}

	// Enforce minimum and maximum bounds
	if total < 1 {
		total = 1
	}

	c.Mob.DR = total
}

var raceBasePR = map[constants.RaceID]int32{
	constants.RaceHuman:     15,
	constants.RaceBarbarian: 15,
	constants.RaceErudite:   15,
	constants.RaceWoodElf:   15,
	constants.RaceHighElf:   15,
	constants.RaceDarkElf:   15,
	constants.RaceHalfElf:   15,
	constants.RaceDwarf:     20,
	constants.RaceTroll:     15,
	constants.RaceOgre:      15,
	constants.RaceHalfling:  20,
	constants.RaceGnome:     15,
	constants.RaceIksar:     15,
	constants.RaceVahShir:   15,
	constants.RaceFroglok:   30,
}

func (c *Client) CalcPR() {
	race := constants.RaceID(c.CharData.Race)
	base, ok := raceBasePR[race]
	if !ok {
		base = 15
	}

	switch c.CharData.Class {
	case constants.Class_Monk:
		if level := c.CharData.Level; level > 50 {
			base += int32(level - 50)
		}

	case constants.Class_Rogue:
		bonus := int32(8)
		if level := c.CharData.Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus

	case constants.Class_ShadowKnight:
		fallthrough
	case constants.Class_Beastlord:
		bonus := int32(4)
		if level := c.CharData.Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus
	}

	total := base
	if b := c.Mob.ItemBonuses; b != nil {
		total += b.PR
	}
	if b := c.Mob.SpellBonuses; b != nil {
		total += b.PR
	}
	if b := c.Mob.AABonuses; b != nil {
		total += b.PR
	}

	if total < 1 {
		total = 1
	}

	c.Mob.PR = total
}

// Hp / mana
func (client *Client) CalcMaxHP() {
	maxHp := client.CalcBaseHP()
	if client.Mob.ItemBonuses != nil {
		maxHp += int(client.Mob.ItemBonuses.HP)
	}
	if client.Mob.SpellBonuses != nil {
		maxHp += int(client.Mob.SpellBonuses.HP)
	}
	if client.Mob.AABonuses != nil {
		maxHp += int(client.Mob.AABonuses.HP)
	}
	if client.Mob.CurrentHp > maxHp {
		client.Mob.CurrentHp = maxHp
	}
	client.Mob.MaxHp = maxHp
}

func (client *Client) CalcBaseHP() int {
	baseHp := 5
	var post255 uint32 = 0
	lm := client.Mob.GetClassLevelFactor()
	if (client.Mob.STA-255)/2 > 0 {
		post255 = uint32((client.Mob.STA - 255) / 2)
	} else {
		post255 = 0
	}
	baseHp += (int(client.CharData.Level) * int(lm) / 10) +
		((int(client.Mob.STA) - int(post255)) * int(client.CharData.Level) * int(lm) / 3000) +
		((int(post255) * int(client.CharData.Level)) * int(lm) / 6000)
	return baseHp
}

func (c *Client) CalcBaseMana() int32 {
	mindLesserFactor := int32(0)
	mindFactor := int32(0)
	baseMana := int32(0)
	switch c.Mob.GetCasterClass() {
	case CasterClassWisdom, CasterClassIntelligence:
		wisInt := int32(0)
		if c.Mob.GetCasterClass() == CasterClassWisdom {
			wisInt = c.Mob.WIS
		} else {
			wisInt = c.Mob.INT
		}
		if (wisInt-199)/2 > 0 {
			mindLesserFactor = (wisInt - 199) / 2
		} else {
			mindLesserFactor = 0
		}
		mindFactor = wisInt - mindLesserFactor
		if wisInt > 100 {
			baseMana = (((5 * (mindFactor + 20)) / 2) * 3 * int32(c.CharData.Level)) / 40
		} else {
			baseMana = (((5 * (mindFactor + 200)) / 2) * 3 * int32(c.CharData.Level)) / 100
		}
	case CasterClassNone:
		baseMana = 0

	}
	return baseMana

}

func (c *Client) CalcMaxMana() {
	spellBonusMana := int32(0)
	itemBonusMana := int32(0)
	m := &c.Mob
	if m.SpellBonuses != nil {
		spellBonusMana = int32(m.SpellBonuses.Mana)
	}
	if m.ItemBonuses != nil {
		itemBonusMana = int32(m.ItemBonuses.Mana)
	}
	switch m.GetCasterClass() {
	case CasterClassIntelligence, CasterClassWisdom:
		m.MaxMana = int(c.CalcBaseMana() + spellBonusMana + itemBonusMana)
	default:
		m.MaxMana = 0
	}

	if m.MaxMana < 0 {
		m.MaxMana = 0
	}
}
