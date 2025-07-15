package client

import (
	"github.com/knervous/eqgo/internal/constants"
	entity "github.com/knervous/eqgo/internal/zone/interface"
)

func (c *Client) CalcBonuses() {
	// client.CalcItemBonuses()
	// client.CalcAABonuses()
	// client.CalcSpellBonuses()

	// client.CalcAC()
	c.CalcATK()
	c.CalcHaste()

	// Base stats
	c.CalcSTR()
	c.CalcSTA()
	c.CalcDEX()
	c.CalcAGI()
	c.CalcINT()
	c.CalcWIS()
	c.CalcCHA()

	// Resists
	c.CalcMR()
	c.CalcFR()
	c.CalcDR()
	c.CalcPR()
	c.CalcCR()

	// HP / Mana
	c.CalcMaxHP()
	c.CalcMaxMana()
}

func (client *Client) CalcATK() {

}

func (client *Client) CalcHaste() {

}

// Core stats
func (client *Client) CalcSTR() {
	client.mob.STR = int32(client.CharData().Str)
	if client.mob.ItemBonuses != nil {
		client.mob.STR += client.mob.ItemBonuses.STR
	}
	if client.mob.SpellBonuses != nil {
		client.mob.STR += client.mob.SpellBonuses.STR
	}
	if client.mob.AABonuses != nil {
		client.mob.STR += client.mob.AABonuses.STR
	}
	if client.mob.STR < 1 {
		client.mob.STR = 1
	}
}

func (client *Client) CalcSTA() {
	client.mob.STA = int32(client.CharData().Sta)
	if client.mob.ItemBonuses != nil {
		client.mob.STA += client.mob.ItemBonuses.STA
	}
	if client.mob.SpellBonuses != nil {
		client.mob.STA += client.mob.SpellBonuses.STA
	}
	if client.mob.AABonuses != nil {
		client.mob.STA += client.mob.AABonuses.STA
	}
	if client.mob.STA < 1 {
		client.mob.STA = 1
	}

}
func (client *Client) CalcDEX() {
	client.mob.DEX = int32(client.CharData().Dex)
	if client.mob.ItemBonuses != nil {
		client.mob.DEX += client.mob.ItemBonuses.DEX
	}
	if client.mob.SpellBonuses != nil {
		client.mob.DEX += client.mob.SpellBonuses.DEX
	}
	if client.mob.AABonuses != nil {
		client.mob.DEX += client.mob.AABonuses.DEX
	}
	if client.mob.DEX < 1 {
		client.mob.DEX = 1
	}

}
func (client *Client) CalcAGI() {
	client.mob.AGI = int32(client.CharData().Agi)
	if client.mob.ItemBonuses != nil {
		client.mob.AGI += client.mob.ItemBonuses.AGI
	}
	if client.mob.SpellBonuses != nil {
		client.mob.AGI += client.mob.SpellBonuses.AGI
	}
	if client.mob.AABonuses != nil {
		client.mob.AGI += client.mob.AABonuses.AGI
	}
	if client.mob.AGI < 1 {
		client.mob.AGI = 1
	}

}
func (client *Client) CalcINT() {
	client.mob.INT = int32(client.CharData().Int)
	if client.mob.ItemBonuses != nil {
		client.mob.INT += client.mob.ItemBonuses.INT
	}
	if client.mob.SpellBonuses != nil {
		client.mob.INT += client.mob.SpellBonuses.INT
	}
	if client.mob.AABonuses != nil {
		client.mob.INT += client.mob.AABonuses.INT
	}
	if client.mob.INT < 1 {
		client.mob.INT = 1
	}

}
func (client *Client) CalcWIS() {
	client.mob.WIS = int32(client.CharData().Wis)
	if client.mob.ItemBonuses != nil {
		client.mob.WIS += client.mob.ItemBonuses.WIS
	}
	if client.mob.SpellBonuses != nil {
		client.mob.WIS += client.mob.SpellBonuses.WIS
	}
	if client.mob.AABonuses != nil {
		client.mob.WIS += client.mob.AABonuses.WIS
	}
	if client.mob.WIS < 1 {
		client.mob.WIS = 1
	}

}
func (client *Client) CalcCHA() {
	client.mob.CHA = int32(client.CharData().Cha)
	if client.mob.ItemBonuses != nil {
		client.mob.CHA += client.mob.ItemBonuses.CHA
	}
	if client.mob.SpellBonuses != nil {
		client.mob.CHA += client.mob.SpellBonuses.CHA
	}
	if client.mob.AABonuses != nil {
		client.mob.CHA += client.mob.AABonuses.CHA
	}
	if client.mob.CHA < 1 {
		client.mob.CHA = 1
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
	race := constants.RaceID(c.CharData().Race)
	base, ok := raceBaseMR[race]
	if !ok {
		base = 20
	}

	total := base
	if b := c.mob.ItemBonuses; b != nil {
		total += b.MR
	}
	if b := c.mob.SpellBonuses; b != nil {
		total += b.MR
	}
	if b := c.mob.AABonuses; b != nil {
		total += b.MR
	}

	if total < 1 {
		total = 1
	}

	c.mob.MR = total
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
	race := constants.RaceID(c.CharData().Race)
	base, ok := raceBaseFR[race]
	if !ok {
		base = 20
	}

	switch c.CharData().Class {
	case constants.Class_Ranger, constants.Class_Monk:
		bonus := uint32(0)
		if c.CharData().Class == constants.Class_Ranger {
			bonus = 4
		} else {
			bonus = 8
		}
		level := c.CharData().Level
		if level > 49 {
			bonus += level - 49
		}
		base += int32(bonus)
	}

	total := base
	if b := c.mob.ItemBonuses; b != nil {
		total += b.FR
	}
	if b := c.mob.SpellBonuses; b != nil {
		total += b.FR
	}
	if b := c.mob.AABonuses; b != nil {
		total += b.FR
	}

	if total < 1 {
		total = 1
	}

	c.mob.FR = total
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
	race := constants.RaceID(c.CharData().Race)
	base, ok := raceBaseCR[race]
	if !ok {
		base = 25
	}

	switch c.CharData().Class {
	case constants.Class_Ranger, constants.Class_Beastlord:
		bonus := uint32(4)
		if level := c.CharData().Level; level > 49 {
			bonus += level - 49
		}
		base += int32(bonus)
	}

	total := base
	if b := c.mob.ItemBonuses; b != nil {
		total += b.CR
	}
	if b := c.mob.SpellBonuses; b != nil {
		total += b.CR
	}
	if b := c.mob.AABonuses; b != nil {
		total += b.CR
	}

	if total < 1 {
		total = 1
	}

	c.mob.CR = total
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
	race := constants.RaceID(c.CharData().Race)
	base, ok := raceBaseDR[race]
	if !ok {
		base = 15
	}

	// Class-based bonuses
	switch c.CharData().Class {
	case constants.Class_Monk:
		if level := c.CharData().Level; level > 50 {
			base += int32(level - 50)
		}

	case constants.Class_Paladin:
		bonus := int32(8)
		if level := c.CharData().Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus

	case constants.Class_ShadowKnight, constants.Class_Beastlord:
		bonus := int32(4)
		if level := c.CharData().Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus
	}

	// Accumulate item, spell, and AA bonuses
	total := base
	if b := c.mob.ItemBonuses; b != nil {
		total += b.DR
	}
	if b := c.mob.SpellBonuses; b != nil {
		total += b.DR
	}
	if b := c.mob.AABonuses; b != nil {
		total += b.DR
	}

	// Enforce minimum and maximum bounds
	if total < 1 {
		total = 1
	}

	c.mob.DR = total
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
	race := constants.RaceID(c.CharData().Race)
	base, ok := raceBasePR[race]
	if !ok {
		base = 15
	}

	switch c.CharData().Class {
	case constants.Class_Monk:
		if level := c.CharData().Level; level > 50 {
			base += int32(level - 50)
		}

	case constants.Class_Rogue:
		bonus := int32(8)
		if level := c.CharData().Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus

	case constants.Class_ShadowKnight:
		fallthrough
	case constants.Class_Beastlord:
		bonus := int32(4)
		if level := c.CharData().Level; level > 49 {
			bonus += int32(level - 49)
		}
		base += bonus
	}

	total := base
	if b := c.mob.ItemBonuses; b != nil {
		total += b.PR
	}
	if b := c.mob.SpellBonuses; b != nil {
		total += b.PR
	}
	if b := c.mob.AABonuses; b != nil {
		total += b.PR
	}

	if total < 1 {
		total = 1
	}

	c.mob.PR = total
}

// Hp / mana
func (client *Client) CalcMaxHP() {
	maxHp := client.CalcBaseHP()
	if client.mob.ItemBonuses != nil {
		maxHp += int(client.mob.ItemBonuses.HP)
	}
	if client.mob.SpellBonuses != nil {
		maxHp += int(client.mob.SpellBonuses.HP)
	}
	if client.mob.AABonuses != nil {
		maxHp += int(client.mob.AABonuses.HP)
	}
	if client.mob.CurrentHp > maxHp {
		client.mob.CurrentHp = maxHp
	}
	client.mob.MaxHp = maxHp
}

func (client *Client) CalcBaseHP() int {
	baseHp := 5
	var post255 uint32 = 0
	lm := client.mob.GetClassLevelFactor()
	if (client.mob.STA-255)/2 > 0 {
		post255 = uint32((client.mob.STA - 255) / 2)
	} else {
		post255 = 0
	}
	baseHp += (int(client.CharData().Level) * int(lm) / 10) +
		((int(client.mob.STA) - int(post255)) * int(client.CharData().Level) * int(lm) / 3000) +
		((int(post255) * int(client.CharData().Level)) * int(lm) / 6000)
	return baseHp
}

func (c *Client) CalcBaseMana() int32 {
	mindLesserFactor := int32(0)
	mindFactor := int32(0)
	baseMana := int32(0)
	switch c.mob.GetCasterClass() {
	case entity.CasterClassWisdom, entity.CasterClassIntelligence:
		wisInt := int32(0)
		if c.mob.GetCasterClass() == entity.CasterClassWisdom {
			wisInt = c.mob.WIS
		} else {
			wisInt = c.mob.INT
		}
		if (wisInt-199)/2 > 0 {
			mindLesserFactor = (wisInt - 199) / 2
		} else {
			mindLesserFactor = 0
		}
		mindFactor = wisInt - mindLesserFactor
		if wisInt > 100 {
			baseMana = (((5 * (mindFactor + 20)) / 2) * 3 * int32(c.CharData().Level)) / 40
		} else {
			baseMana = (((5 * (mindFactor + 200)) / 2) * 3 * int32(c.CharData().Level)) / 100
		}
	case entity.CasterClassNone:
		baseMana = 0

	}
	return baseMana

}

func (c *Client) CalcMaxMana() {
	spellBonusMana := int32(0)
	itemBonusMana := int32(0)
	m := &c.mob
	if m.SpellBonuses != nil {
		spellBonusMana = int32(m.SpellBonuses.Mana)
	}
	if m.ItemBonuses != nil {
		itemBonusMana = int32(m.ItemBonuses.Mana)
	}
	switch m.GetCasterClass() {
	case entity.CasterClassIntelligence, entity.CasterClassWisdom:
		m.MaxMana = int(c.CalcBaseMana() + spellBonusMana + itemBonusMana)
	default:
		m.MaxMana = 0
	}

	if m.MaxMana < 0 {
		m.MaxMana = 0
	}
}
