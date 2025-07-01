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

}

func (client *Client) CalcSTA() {

}
func (client *Client) CalcDEX() {

}
func (client *Client) CalcAGI() {

}
func (client *Client) CalcINT() {

}
func (client *Client) CalcWIS() {

}
func (client *Client) CalcCHA() {

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

}

func (client *Client) CalcMaxMana() {

}
