package character

import (
	db "knervous/eqgo/internal/db"
	"knervous/eqgo/internal/db/items"
	"knervous/eqgo/internal/db/jetgen/eqgo/model"
	"knervous/eqgo/internal/db/jetgen/eqgo/table"
	"slices"
	"strconv"
	"strings"
)

func InstantiateStartingItems(race, classID, deity, zone int32) ([]items.ItemInstance, error) {
	// 1) load them all
	var raw []model.StartingItems
	if err := table.StartingItems.
		SELECT(table.StartingItems.AllColumns).
		FROM(table.StartingItems).
		Query(db.GlobalWorldDB.DB, &raw); err != nil {
		return nil, err
	}

	// 2) filter
	var out []items.ItemInstance
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
		inst.Quantity = uint8(e.ItemCharges)
		out = append(out, inst)
	}

	return out, nil
}
