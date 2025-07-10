package items

import (
	"bytes"
	"encoding/binary"
	"errors"
	"time"

	eq "github.com/knervous/eqgo/internal/api/capnp"
	"github.com/knervous/eqgo/internal/session"

	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
)

func ConvertItemTemplateToCapnp(ses *session.Session, item *model.Items, i *eq.ItemInstance) {
	// Basic fields (int32, uint32, float64, string)
	i.SetMinstatus(int32(item.Minstatus))
	i.SetName(item.Name)
	i.SetAagi(item.Aagi)
	i.SetAc(item.Ac)
	i.SetAccuracy(item.Accuracy)
	i.SetAcha(item.Acha)
	i.SetAdex(item.Adex)
	i.SetAint(item.Aint)
	i.SetArtifactflag(uint32(item.Artifactflag))
	i.SetAsta(item.Asta)
	i.SetAstr(item.Astr)
	i.SetAttack(item.Attack)
	i.SetAugrestrict(item.Augrestrict)
	i.SetAugslot1type(int32(item.Augslot1type))
	i.SetAugslot1visible(int32(item.Augslot1visible))
	i.SetAugslot2type(int32(item.Augslot2type))
	i.SetAugslot2visible(int32(item.Augslot2visible))
	i.SetAugslot3type(int32(item.Augslot3type))
	i.SetAugslot3visible(int32(item.Augslot3visible))
	i.SetAugslot4type(int32(item.Augslot4type))
	i.SetAugslot4visible(int32(item.Augslot4visible))
	i.SetAugslot5type(int32(item.Augslot5type))
	i.SetAugslot5visible(int32(item.Augslot5visible))
	i.SetAugslot6type(int32(item.Augslot6type))
	i.SetAugslot6visible(int32(item.Augslot6visible))
	i.SetAugtype(item.Augtype)
	i.SetAvoidance(item.Avoidance)
	i.SetAwis(item.Awis)
	i.SetBagsize(item.Bagsize)
	i.SetBagslots(item.Bagslots)
	i.SetBagtype(item.Bagtype)
	i.SetBagwr(item.Bagwr)
	i.SetBanedmgamt(item.Banedmgamt)
	i.SetBanedmgraceamt(item.Banedmgraceamt)
	i.SetBanedmgbody(item.Banedmgbody)
	i.SetBanedmgrace(item.Banedmgrace)
	i.SetBardtype(item.Bardtype)
	i.SetBardvalue(item.Bardvalue)
	i.SetBook(item.Book)
	i.SetCasttime(item.Casttime)
	i.SetCasttime2(item.Casttime2)
	i.SetClasses(item.Classes)
	i.SetColor(item.Color)
	i.SetCombateffects(item.Combateffects)
	i.SetExtradmgskill(item.Extradmgskill)
	i.SetExtradmgamt(item.Extradmgamt)
	i.SetPrice(item.Price)
	i.SetCr(item.Cr)
	i.SetDamage(item.Damage)
	i.SetDamageshield(item.Damageshield)
	i.SetDeity(item.Deity)
	i.SetDelay(item.Delay)
	i.SetAugdistiller(item.Augdistiller)
	i.SetDotshielding(item.Dotshielding)
	i.SetDr(item.Dr)
	i.SetClicktype(item.Clicktype)
	i.SetClicklevel2(item.Clicklevel2)
	i.SetElemdmgtype(item.Elemdmgtype)
	i.SetElemdmgamt(item.Elemdmgamt)
	i.SetEndur(item.Endur)
	i.SetFactionamt1(item.Factionamt1)
	i.SetFactionamt2(item.Factionamt2)
	i.SetFactionamt3(item.Factionamt3)
	i.SetFactionamt4(item.Factionamt4)
	i.SetFactionmod1(item.Factionmod1)
	i.SetFactionmod2(item.Factionmod2)
	i.SetFactionmod3(item.Factionmod3)
	i.SetFactionmod4(item.Factionmod4)
	i.SetFocuseffect(item.Focuseffect)
	i.SetFr(item.Fr)
	i.SetFvnodrop(item.Fvnodrop)
	i.SetHaste(item.Haste)
	i.SetClicklevel(item.Clicklevel)
	i.SetHp(item.Hp)
	i.SetRegen(item.Regen)
	i.SetIcon(item.Icon)
	i.SetIdfile(item.Idfile)
	i.SetItemclass(item.Itemclass)
	i.SetItemtype(item.Itemtype)
	i.SetLight(item.Light)
	i.SetLore(item.Lore)
	i.SetLoregroup(item.Loregroup)
	i.SetMagic(item.Magic)
	i.SetMana(item.Mana)
	i.SetManaregen(item.Manaregen)
	i.SetEnduranceregen(item.Enduranceregen)
	i.SetMaterial(item.Material)
	i.SetHerosforgemodel(item.Herosforgemodel)
	i.SetMaxcharges(item.Maxcharges)
	i.SetMr(item.Mr)
	i.SetNodrop(1 - item.Nodrop) // XOR because this is revered in the db
	i.SetNorent(item.Norent)
	i.SetPendingloreflag(uint32(item.Pendingloreflag))
	i.SetPr(item.Pr)
	i.SetProcrate(item.Procrate)
	i.SetRaces(item.Races)
	i.SetRange(item.Range)
	i.SetReclevel(item.Reclevel)
	i.SetRecskill(item.Recskill)
	i.SetReqlevel(item.Reqlevel)
	i.SetSellrate(item.Sellrate)
	i.SetShielding(item.Shielding)
	i.SetSize(item.Size)
	i.SetSkillmodtype(item.Skillmodtype)
	i.SetSkillmodvalue(item.Skillmodvalue)
	i.SetSlots(item.Slots)
	i.SetClickeffect(item.Clickeffect)
	i.SetSpellshield(item.Spellshield)
	i.SetStrikethrough(item.Strikethrough)
	i.SetStunresist(item.Stunresist)
	i.SetSummonedflag(uint32(item.Summonedflag))
	i.SetTradeskills(item.Tradeskills)
	i.SetFavor(item.Favor)
	i.SetWeight(item.Weight)
	i.SetBenefitflag(item.Benefitflag)
	i.SetBooktype(item.Booktype)
	i.SetRecastdelay(item.Recastdelay)
	i.SetRecasttype(item.Recasttype)
	i.SetGuildfavor(item.Guildfavor)
	i.SetAttuneable(item.Attuneable)
	i.SetNopet(item.Nopet)

	// Handle Updated (*time.Time)
	if item.Updated != nil {
		i.SetUpdated(item.Updated.Format(time.RFC3339))
	} else {
		i.SetUpdated("")
	}

	i.SetPointtype(item.Pointtype)
	i.SetPotionbelt(item.Potionbelt)
	i.SetPotionbeltslots(item.Potionbeltslots)
	i.SetStacksize(item.Stacksize)
	i.SetNotransfer(item.Notransfer)
	i.SetStackable(item.Stackable)
	i.SetProceffect(item.Proceffect)
	i.SetProctype(item.Proctype)
	i.SetProclevel2(item.Proclevel2)
	i.SetProclevel(item.Proclevel)
	i.SetWorneffect(item.Worneffect)
	i.SetWorntype(item.Worntype)
	i.SetWornlevel2(item.Wornlevel2)
	i.SetWornlevel(item.Wornlevel)
	i.SetFocustype(item.Focustype)
	i.SetFocuslevel2(item.Focuslevel2)
	i.SetFocuslevel(item.Focuslevel)
	i.SetScrolleffect(item.Scrolleffect)
	i.SetScrolltype(item.Scrolltype)
	i.SetScrolllevel2(item.Scrolllevel2)
	i.SetScrolllevel(item.Scrolllevel)
	i.SetSvcorruption(item.Svcorruption)
	i.SetSkillmodmax(item.Skillmodmax)
	i.SetQuestitemflag(item.Questitemflag)
	i.SetPurity(item.Purity)
	i.SetEvoitem(item.Evoitem)
	i.SetEvoid(item.Evoid)
	i.SetEvolvinglevel(item.Evolvinglevel)
	i.SetEvomax(item.Evomax)
	i.SetDsmitigation(int32(item.Dsmitigation))
	i.SetHealamt(int32(item.Healamt))
	i.SetSpelldmg(int32(item.Spelldmg))
	i.SetClairvoyance(int32(item.Clairvoyance))
	i.SetBackstabdmg(int32(item.Backstabdmg))
	i.SetElitematerial(int32(item.Elitematerial))
	i.SetScriptfileid(item.Scriptfileid)
	i.SetExpendablearrow(int32(item.Expendablearrow))
	i.SetPowersourcecapacity(item.Powersourcecapacity)
	i.SetBardeffect(item.Bardeffect)
	i.SetBardeffecttype(int32(item.Bardeffecttype))
	i.SetBardlevel2(int32(item.Bardlevel2))
	i.SetBardlevel(int32(item.Bardlevel))
	i.SetSubtype(item.Subtype)
	i.SetHeirloom(item.Heirloom)
	i.SetPlaceable(item.Placeable)
	i.SetEpicitem(item.Epicitem)

}

func CreateItemInstanceFromTemplateID(id int32) ItemInstance {
	item, err := GetItemTemplateByID(id)
	if err != nil {
		panic(err)
	}

	return ItemInstance{
		ItemID:    item.ID,
		Mods:      Mods{},
		Charges:   0,
		Quantity:  0,
		OwnerID:   nil,
		OwnerType: OwnerTypeCharacter,
		Item:      item,
	}
}

// GetItemByID retrieves an item by its ItemsBinary.ID
func GetItemTemplateByID(id int32) (model.Items, error) {
	index, exists := instance.idToIndex[id]
	if !exists {
		return model.Items{}, errors.New("item ID not found")
	}

	if index < 0 || index*instance.recordSize >= int32(len(instance.data)) {
		return model.Items{}, errors.New("index out of bounds")
	}

	var binaryItem ItemsBinary
	buf := bytes.NewReader(instance.data[index*instance.recordSize : (index+1)*instance.recordSize])
	err := binary.Read(buf, binary.LittleEndian, &binaryItem)
	if err != nil {
		return model.Items{}, err
	}

	return binaryItem.ToItems(), nil
}
