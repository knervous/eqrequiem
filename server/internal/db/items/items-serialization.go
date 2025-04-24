package items

import (
	"bytes"
	"encoding/binary"
	"knervous/eqgo/internal/db/jetgen/peq/model"
	"os"
	"time"
)

// ItemsBinary is a fixed-size version of Items for binary serialization
type ItemsBinary struct {
	ID                  int32
	Minstatus           int16
	Name                [64]byte // varchar(64)
	Aagi                int32
	Ac                  int32
	Accuracy            int32
	Acha                int32
	Adex                int32
	Aint                int32
	Artifactflag        uint8
	Asta                int32
	Astr                int32
	Attack              int32
	Augrestrict         int32
	Augslot1type        int8
	Augslot1visible     int8
	Augslot2type        int8
	Augslot2visible     int8
	Augslot3type        int8
	Augslot3visible     int8
	Augslot4type        int8
	Augslot4visible     int8
	Augslot5type        int8
	Augslot5visible     int8
	Augslot6type        int8
	Augslot6visible     int8
	Augtype             int32
	Avoidance           int32
	Awis                int32
	Bagsize             int32
	Bagslots            int32
	Bagtype             int32
	Bagwr               int32
	Banedmgamt          int32
	Banedmgraceamt      int32
	Banedmgbody         int32
	Banedmgrace         int32
	Bardtype            int32
	Bardvalue           int32
	Book                int32
	Casttime            int32
	Casttime2           int32
	Classes             int32
	Color               uint32
	Combateffects       [10]byte // varchar(10)
	Extradmgskill       int32
	Extradmgamt         int32
	Price               int32
	Cr                  int32
	Damage              int32
	Damageshield        int32
	Deity               int32
	Delay               int32
	Augdistiller        uint32
	Dotshielding        int32
	Dr                  int32
	Clicktype           int32
	Clicklevel2         int32
	Elemdmgtype         int32
	Elemdmgamt          int32
	Endur               int32
	Factionamt1         int32
	Factionamt2         int32
	Factionamt3         int32
	Factionamt4         int32
	Factionmod1         int32
	Factionmod2         int32
	Factionmod3         int32
	Factionmod4         int32
	Focuseffect         int32
	Fr                  int32
	Fvnodrop            int32
	Haste               int32
	Clicklevel          int32
	Hp                  int32
	Regen               int32
	Icon                int32
	Idfile              [30]byte // varchar(30)
	Itemclass           int32
	Itemtype            int32
	Light               int32
	Lore                [80]byte // varchar(80)
	Loregroup           int32
	Magic               int32
	Mana                int32
	Manaregen           int32
	Enduranceregen      int32
	Material            int32
	Herosforgemodel     int32
	Maxcharges          int32
	Mr                  int32
	Nodrop              int32
	Norent              int32
	Pendingloreflag     uint8
	Pr                  int32
	Procrate            int32
	Races               int32
	Range               int32
	Reclevel            int32
	Recskill            int32
	Reqlevel            int32
	Sellrate            float64
	Shielding           int32
	Size                int32
	Skillmodtype        int32
	Skillmodvalue       int32
	Slots               int32
	Clickeffect         int32
	Spellshield         int32
	Strikethrough       int32
	Stunresist          int32
	Summonedflag        uint8
	Tradeskills         int32
	Favor               int32
	Weight              int32
	Benefitflag         int32
	Booktype            int32
	Recastdelay         int32
	Recasttype          int32
	Guildfavor          int32
	Attuneable          int32
	Nopet               int32
	Updated             int64 // Unix timestamp for datetime
	UpdatedPresent      uint8 // Flag for nil check
	Pointtype           int32
	Potionbelt          int32
	Potionbeltslots     int32
	Stacksize           int32
	Notransfer          int32
	Stackable           int32
	Proceffect          int32
	Proctype            int32
	Proclevel2          int32
	Proclevel           int32
	Worneffect          int32
	Worntype            int32
	Wornlevel2          int32
	Wornlevel           int32
	Focustype           int32
	Focuslevel2         int32
	Focuslevel          int32
	Scrolleffect        int32
	Scrolltype          int32
	Scrolllevel2        int32
	Scrolllevel         int32
	Svcorruption        int32
	Skillmodmax         int32
	Questitemflag       int32
	Purity              int32
	Evoitem             int32
	Evoid               int32
	Evolvinglevel       int32
	Evomax              int32
	Dsmitigation        int16
	Healamt             int16
	Spelldmg            int16
	Clairvoyance        int16
	Backstabdmg         int16
	Elitematerial       int16
	Scriptfileid        int32
	Expendablearrow     int16
	Powersourcecapacity int32
	Bardeffect          int32
	Bardeffecttype      int16
	Bardlevel2          int16
	Bardlevel           int16
	Subtype             int32
	Heirloom            int32
	Placeable           int32
	Epicitem            int32
}

// ToBinary converts Items to ItemsBinary
func ToBinary(i *model.Items) ItemsBinary {
	b := ItemsBinary{
		ID:                  i.ID,
		Minstatus:           i.Minstatus,
		Aagi:                i.Aagi,
		Ac:                  i.Ac,
		Accuracy:            i.Accuracy,
		Acha:                i.Acha,
		Adex:                i.Adex,
		Aint:                i.Aint,
		Artifactflag:        i.Artifactflag,
		Asta:                i.Asta,
		Astr:                i.Astr,
		Attack:              i.Attack,
		Augrestrict:         i.Augrestrict,
		Augslot1type:        i.Augslot1type,
		Augslot1visible:     i.Augslot1visible,
		Augslot2type:        i.Augslot2type,
		Augslot2visible:     i.Augslot2visible,
		Augslot3type:        i.Augslot3type,
		Augslot3visible:     i.Augslot3visible,
		Augslot4type:        i.Augslot4type,
		Augslot4visible:     i.Augslot4visible,
		Augslot5type:        i.Augslot5type,
		Augslot5visible:     i.Augslot5visible,
		Augslot6type:        i.Augslot6type,
		Augslot6visible:     i.Augslot6visible,
		Augtype:             i.Augtype,
		Avoidance:           i.Avoidance,
		Awis:                i.Awis,
		Bagsize:             i.Bagsize,
		Bagslots:            i.Bagslots,
		Bagtype:             i.Bagtype,
		Bagwr:               i.Bagwr,
		Banedmgamt:          i.Banedmgamt,
		Banedmgraceamt:      i.Banedmgraceamt,
		Banedmgbody:         i.Banedmgbody,
		Banedmgrace:         i.Banedmgrace,
		Bardtype:            i.Bardtype,
		Bardvalue:           i.Bardvalue,
		Book:                i.Book,
		Casttime:            i.Casttime,
		Casttime2:           i.Casttime2,
		Classes:             i.Classes,
		Color:               i.Color,
		Extradmgskill:       i.Extradmgskill,
		Extradmgamt:         i.Extradmgamt,
		Price:               i.Price,
		Cr:                  i.Cr,
		Damage:              i.Damage,
		Damageshield:        i.Damageshield,
		Deity:               i.Deity,
		Delay:               i.Delay,
		Augdistiller:        i.Augdistiller,
		Dotshielding:        i.Dotshielding,
		Dr:                  i.Dr,
		Clicktype:           i.Clicktype,
		Clicklevel2:         i.Clicklevel2,
		Elemdmgtype:         i.Elemdmgtype,
		Elemdmgamt:          i.Elemdmgamt,
		Endur:               i.Endur,
		Factionamt1:         i.Factionamt1,
		Factionamt2:         i.Factionamt2,
		Factionamt3:         i.Factionamt3,
		Factionamt4:         i.Factionamt4,
		Factionmod1:         i.Factionmod1,
		Factionmod2:         i.Factionmod2,
		Factionmod3:         i.Factionmod3,
		Factionmod4:         i.Factionmod4,
		Focuseffect:         i.Focuseffect,
		Fr:                  i.Fr,
		Fvnodrop:            i.Fvnodrop,
		Haste:               i.Haste,
		Clicklevel:          i.Clicklevel,
		Hp:                  i.Hp,
		Regen:               i.Regen,
		Icon:                i.Icon,
		Itemclass:           i.Itemclass,
		Itemtype:            i.Itemtype,
		Light:               i.Light,
		Loregroup:           i.Loregroup,
		Magic:               i.Magic,
		Mana:                i.Mana,
		Manaregen:           i.Manaregen,
		Enduranceregen:      i.Enduranceregen,
		Material:            i.Material,
		Herosforgemodel:     i.Herosforgemodel,
		Maxcharges:          i.Maxcharges,
		Mr:                  i.Mr,
		Nodrop:              i.Nodrop,
		Norent:              i.Norent,
		Pendingloreflag:     i.Pendingloreflag,
		Pr:                  i.Pr,
		Procrate:            i.Procrate,
		Races:               i.Races,
		Range:               i.Range,
		Reclevel:            i.Reclevel,
		Recskill:            i.Recskill,
		Reqlevel:            i.Reqlevel,
		Sellrate:            i.Sellrate,
		Shielding:           i.Shielding,
		Size:                i.Size,
		Skillmodtype:        i.Skillmodtype,
		Skillmodvalue:       i.Skillmodvalue,
		Slots:               i.Slots,
		Clickeffect:         i.Clickeffect,
		Spellshield:         i.Spellshield,
		Strikethrough:       i.Strikethrough,
		Stunresist:          i.Stunresist,
		Summonedflag:        i.Summonedflag,
		Tradeskills:         i.Tradeskills,
		Favor:               i.Favor,
		Weight:              i.Weight,
		Benefitflag:         i.Benefitflag,
		Booktype:            i.Booktype,
		Recastdelay:         i.Recastdelay,
		Recasttype:          i.Recasttype,
		Guildfavor:          i.Guildfavor,
		Attuneable:          i.Attuneable,
		Nopet:               i.Nopet,
		Pointtype:           i.Pointtype,
		Potionbelt:          i.Potionbelt,
		Potionbeltslots:     i.Potionbeltslots,
		Stacksize:           i.Stacksize,
		Notransfer:          i.Notransfer,
		Stackable:           i.Stackable,
		Proceffect:          i.Proceffect,
		Proctype:            i.Proctype,
		Proclevel2:          i.Proclevel2,
		Proclevel:           i.Proclevel,
		Worneffect:          i.Worneffect,
		Worntype:            i.Worntype,
		Wornlevel2:          i.Wornlevel2,
		Wornlevel:           i.Wornlevel,
		Focustype:           i.Focustype,
		Focuslevel2:         i.Focuslevel2,
		Focuslevel:          i.Focuslevel,
		Scrolleffect:        i.Scrolleffect,
		Scrolltype:          i.Scrolltype,
		Scrolllevel2:        i.Scrolllevel2,
		Scrolllevel:         i.Scrolllevel,
		Svcorruption:        i.Svcorruption,
		Skillmodmax:         i.Skillmodmax,
		Questitemflag:       i.Questitemflag,
		Purity:              i.Purity,
		Evoitem:             i.Evoitem,
		Evoid:               i.Evoid,
		Evolvinglevel:       i.Evolvinglevel,
		Evomax:              i.Evomax,
		Dsmitigation:        i.Dsmitigation,
		Healamt:             i.Healamt,
		Spelldmg:            i.Spelldmg,
		Clairvoyance:        i.Clairvoyance,
		Backstabdmg:         i.Backstabdmg,
		Elitematerial:       i.Elitematerial,
		Scriptfileid:        i.Scriptfileid,
		Expendablearrow:     i.Expendablearrow,
		Powersourcecapacity: i.Powersourcecapacity,
		Bardeffect:          i.Bardeffect,
		Bardeffecttype:      i.Bardeffecttype,
		Bardlevel2:          i.Bardlevel2,
		Bardlevel:           i.Bardlevel,
		Subtype:             i.Subtype,
		Heirloom:            i.Heirloom,
		Placeable:           i.Placeable,
		Epicitem:            i.Epicitem,
	}

	// Copy strings to fixed-size arrays, trunc湘, truncating if necessary
	copy(b.Name[:], i.Name)
	copy(b.Combateffects[:], i.Combateffects)
	copy(b.Idfile[:], i.Idfile)
	copy(b.Lore[:], i.Lore)

	// Handle nullable time fields
	if i.Updated != nil {
		b.Updated = i.Updated.Unix()
		b.UpdatedPresent = 1
	}

	return b
}

// ToItems converts ItemsBinary back to Items
func (b *ItemsBinary) ToItems() model.Items {
	i := model.Items{
		ID:                  b.ID,
		Minstatus:           b.Minstatus,
		Name:                string(bytes.TrimRight(b.Name[:], "\x00")),
		Aagi:                b.Aagi,
		Ac:                  b.Ac,
		Accuracy:            b.Accuracy,
		Acha:                b.Acha,
		Adex:                b.Adex,
		Aint:                b.Aint,
		Artifactflag:        b.Artifactflag,
		Asta:                b.Asta,
		Astr:                b.Astr,
		Attack:              b.Attack,
		Augrestrict:         b.Augrestrict,
		Augslot1type:        b.Augslot1type,
		Augslot1visible:     b.Augslot1visible,
		Augslot2type:        b.Augslot2type,
		Augslot2visible:     b.Augslot2visible,
		Augslot3type:        b.Augslot3type,
		Augslot3visible:     b.Augslot3visible,
		Augslot4type:        b.Augslot4type,
		Augslot4visible:     b.Augslot4visible,
		Augslot5type:        b.Augslot5type,
		Augslot5visible:     b.Augslot5visible,
		Augslot6type:        b.Augslot6type,
		Augslot6visible:     b.Augslot6visible,
		Augtype:             b.Augtype,
		Avoidance:           b.Avoidance,
		Awis:                b.Awis,
		Bagsize:             b.Bagsize,
		Bagslots:            b.Bagslots,
		Bagtype:             b.Bagtype,
		Bagwr:               b.Bagwr,
		Banedmgamt:          b.Banedmgamt,
		Banedmgraceamt:      b.Banedmgraceamt,
		Banedmgbody:         b.Banedmgbody,
		Banedmgrace:         b.Banedmgrace,
		Bardtype:            b.Bardtype,
		Bardvalue:           b.Bardvalue,
		Book:                b.Book,
		Casttime:            b.Casttime,
		Casttime2:           b.Casttime2,
		Classes:             b.Classes,
		Color:               b.Color,
		Combateffects:       string(bytes.TrimRight(b.Combateffects[:], "\x00")),
		Extradmgskill:       b.Extradmgskill,
		Extradmgamt:         b.Extradmgamt,
		Price:               b.Price,
		Cr:                  b.Cr,
		Damage:              b.Damage,
		Damageshield:        b.Damageshield,
		Deity:               b.Deity,
		Delay:               b.Delay,
		Augdistiller:        b.Augdistiller,
		Dotshielding:        b.Dotshielding,
		Dr:                  b.Dr,
		Clicktype:           b.Clicktype,
		Clicklevel2:         b.Clicklevel2,
		Elemdmgtype:         b.Elemdmgtype,
		Elemdmgamt:          b.Elemdmgamt,
		Endur:               b.Endur,
		Factionamt1:         b.Factionamt1,
		Factionamt2:         b.Factionamt2,
		Factionamt3:         b.Factionamt3,
		Factionamt4:         b.Factionamt4,
		Factionmod1:         b.Factionmod1,
		Factionmod2:         b.Factionmod2,
		Factionmod3:         b.Factionmod3,
		Factionmod4:         b.Factionmod4,
		Focuseffect:         b.Focuseffect,
		Fr:                  b.Fr,
		Fvnodrop:            b.Fvnodrop,
		Haste:               b.Haste,
		Clicklevel:          b.Clicklevel,
		Hp:                  b.Hp,
		Regen:               b.Regen,
		Icon:                b.Icon,
		Idfile:              string(bytes.TrimRight(b.Idfile[:], "\x00")),
		Itemclass:           b.Itemclass,
		Itemtype:            b.Itemtype,
		Light:               b.Light,
		Lore:                string(bytes.TrimRight(b.Lore[:], "\x00")),
		Loregroup:           b.Loregroup,
		Magic:               b.Magic,
		Mana:                b.Mana,
		Manaregen:           b.Manaregen,
		Enduranceregen:      b.Enduranceregen,
		Material:            b.Material,
		Herosforgemodel:     b.Herosforgemodel,
		Maxcharges:          b.Maxcharges,
		Mr:                  b.Mr,
		Nodrop:              b.Nodrop,
		Norent:              b.Norent,
		Pendingloreflag:     b.Pendingloreflag,
		Pr:                  b.Pr,
		Procrate:            b.Procrate,
		Races:               b.Races,
		Range:               b.Range,
		Reclevel:            b.Reclevel,
		Recskill:            b.Recskill,
		Reqlevel:            b.Reqlevel,
		Sellrate:            b.Sellrate,
		Shielding:           b.Shielding,
		Size:                b.Size,
		Skillmodtype:        b.Skillmodtype,
		Skillmodvalue:       b.Skillmodvalue,
		Slots:               b.Slots,
		Clickeffect:         b.Clickeffect,
		Spellshield:         b.Spellshield,
		Strikethrough:       b.Strikethrough,
		Stunresist:          b.Stunresist,
		Summonedflag:        b.Summonedflag,
		Tradeskills:         b.Tradeskills,
		Favor:               b.Favor,
		Weight:              b.Weight,
		Benefitflag:         b.Benefitflag,
		Booktype:            b.Booktype,
		Recastdelay:         b.Recastdelay,
		Recasttype:          b.Recasttype,
		Guildfavor:          b.Guildfavor,
		Attuneable:          b.Attuneable,
		Nopet:               b.Nopet,
		Pointtype:           b.Pointtype,
		Potionbelt:          b.Potionbelt,
		Potionbeltslots:     b.Potionbeltslots,
		Stacksize:           b.Stacksize,
		Notransfer:          b.Notransfer,
		Stackable:           b.Stackable,
		Proceffect:          b.Proceffect,
		Proctype:            b.Proctype,
		Proclevel2:          b.Proclevel2,
		Proclevel:           b.Proclevel,
		Worneffect:          b.Worneffect,
		Worntype:            b.Worntype,
		Wornlevel2:          b.Wornlevel2,
		Wornlevel:           b.Wornlevel,
		Focustype:           b.Focustype,
		Focuslevel2:         b.Focuslevel2,
		Focuslevel:          b.Focuslevel,
		Scrolleffect:        b.Scrolleffect,
		Scrolltype:          b.Scrolltype,
		Scrolllevel2:        b.Scrolllevel2,
		Scrolllevel:         b.Scrolllevel,
		Svcorruption:        b.Svcorruption,
		Skillmodmax:         b.Skillmodmax,
		Questitemflag:       b.Questitemflag,
		Purity:              b.Purity,
		Evoitem:             b.Evoitem,
		Evoid:               b.Evoid,
		Evolvinglevel:       b.Evolvinglevel,
		Evomax:              b.Evomax,
		Dsmitigation:        b.Dsmitigation,
		Healamt:             b.Healamt,
		Spelldmg:            b.Spelldmg,
		Clairvoyance:        b.Clairvoyance,
		Backstabdmg:         b.Backstabdmg,
		Elitematerial:       b.Elitematerial,
		Scriptfileid:        b.Scriptfileid,
		Expendablearrow:     b.Expendablearrow,
		Powersourcecapacity: b.Powersourcecapacity,
		Bardeffect:          b.Bardeffect,
		Bardeffecttype:      b.Bardeffecttype,
		Bardlevel2:          b.Bardlevel2,
		Bardlevel:           b.Bardlevel,
		Subtype:             b.Subtype,
		Heirloom:            b.Heirloom,
		Placeable:           b.Placeable,
		Epicitem:            b.Epicitem,
	}

	// Restore nullable time fields
	if b.UpdatedPresent == 1 {
		t := time.Unix(b.Updated, 0)
		i.Updated = &t
	}

	return i
}

// WriteItemsToFile writes items to the items data file
func WriteItemsToFile(items []model.Items) error {
	file, err := os.Create(getItemsFilePath())
	if err != nil {
		return err
	}
	defer file.Close()

	for _, item := range items {
		binaryItem := ToBinary(&item)
		err = binary.Write(file, binary.LittleEndian, &binaryItem)
		if err != nil {
			return err
		}
	}
	return nil
}
