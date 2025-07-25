// This file has been automatically generated by capnp-es.
import * as $ from "capnp-es";
export const _capnpFileId = BigInt("0xcdefabcdefabc123");
export class ItemInstance extends $.Struct {
  static readonly _capnp = {
    displayName: "ItemInstance",
    id: "d8a782a58f006803",
    size: new $.ObjectSize(672, 6)
  };
  get mods(): string {
    return $.utils.getText(0, this);
  }
  set mods(value: string) {
    $.utils.setText(0, value, this);
  }
  get charges(): number {
    return $.utils.getUint32(0, this);
  }
  set charges(value: number) {
    $.utils.setUint32(0, value, this);
  }
  get quantity(): number {
    return $.utils.getUint32(4, this);
  }
  set quantity(value: number) {
    $.utils.setUint32(4, value, this);
  }
  get slot(): number {
    return $.utils.getInt32(8, this);
  }
  set slot(value: number) {
    $.utils.setInt32(8, value, this);
  }
  get ac(): number {
    return $.utils.getInt32(12, this);
  }
  set ac(value: number) {
    $.utils.setInt32(12, value, this);
  }
  get accuracy(): number {
    return $.utils.getInt32(16, this);
  }
  set accuracy(value: number) {
    $.utils.setInt32(16, value, this);
  }
  get acha(): number {
    return $.utils.getInt32(20, this);
  }
  set acha(value: number) {
    $.utils.setInt32(20, value, this);
  }
  get adex(): number {
    return $.utils.getInt32(24, this);
  }
  set adex(value: number) {
    $.utils.setInt32(24, value, this);
  }
  get aint(): number {
    return $.utils.getInt32(28, this);
  }
  set aint(value: number) {
    $.utils.setInt32(28, value, this);
  }
  get artifactflag(): number {
    return $.utils.getUint32(32, this);
  }
  set artifactflag(value: number) {
    $.utils.setUint32(32, value, this);
  }
  get asta(): number {
    return $.utils.getInt32(36, this);
  }
  set asta(value: number) {
    $.utils.setInt32(36, value, this);
  }
  get astr(): number {
    return $.utils.getInt32(40, this);
  }
  set astr(value: number) {
    $.utils.setInt32(40, value, this);
  }
  get attack(): number {
    return $.utils.getInt32(44, this);
  }
  set attack(value: number) {
    $.utils.setInt32(44, value, this);
  }
  get augrestrict(): number {
    return $.utils.getInt32(48, this);
  }
  set augrestrict(value: number) {
    $.utils.setInt32(48, value, this);
  }
  get augslot1type(): number {
    return $.utils.getInt32(52, this);
  }
  set augslot1type(value: number) {
    $.utils.setInt32(52, value, this);
  }
  get augslot1visible(): number {
    return $.utils.getInt32(56, this);
  }
  set augslot1visible(value: number) {
    $.utils.setInt32(56, value, this);
  }
  get augslot2type(): number {
    return $.utils.getInt32(60, this);
  }
  set augslot2type(value: number) {
    $.utils.setInt32(60, value, this);
  }
  get augslot2visible(): number {
    return $.utils.getInt32(64, this);
  }
  set augslot2visible(value: number) {
    $.utils.setInt32(64, value, this);
  }
  get augslot3type(): number {
    return $.utils.getInt32(68, this);
  }
  set augslot3type(value: number) {
    $.utils.setInt32(68, value, this);
  }
  get augslot3visible(): number {
    return $.utils.getInt32(72, this);
  }
  set augslot3visible(value: number) {
    $.utils.setInt32(72, value, this);
  }
  get augslot4type(): number {
    return $.utils.getInt32(76, this);
  }
  set augslot4type(value: number) {
    $.utils.setInt32(76, value, this);
  }
  get augslot4visible(): number {
    return $.utils.getInt32(80, this);
  }
  set augslot4visible(value: number) {
    $.utils.setInt32(80, value, this);
  }
  get augslot5type(): number {
    return $.utils.getInt32(84, this);
  }
  set augslot5type(value: number) {
    $.utils.setInt32(84, value, this);
  }
  get augslot5visible(): number {
    return $.utils.getInt32(88, this);
  }
  set augslot5visible(value: number) {
    $.utils.setInt32(88, value, this);
  }
  get augslot6type(): number {
    return $.utils.getInt32(92, this);
  }
  set augslot6type(value: number) {
    $.utils.setInt32(92, value, this);
  }
  get augslot6visible(): number {
    return $.utils.getInt32(96, this);
  }
  set augslot6visible(value: number) {
    $.utils.setInt32(96, value, this);
  }
  get augtype(): number {
    return $.utils.getInt32(100, this);
  }
  set augtype(value: number) {
    $.utils.setInt32(100, value, this);
  }
  get avoidance(): number {
    return $.utils.getInt32(104, this);
  }
  set avoidance(value: number) {
    $.utils.setInt32(104, value, this);
  }
  get awis(): number {
    return $.utils.getInt32(108, this);
  }
  set awis(value: number) {
    $.utils.setInt32(108, value, this);
  }
  get bagsize(): number {
    return $.utils.getInt32(112, this);
  }
  set bagsize(value: number) {
    $.utils.setInt32(112, value, this);
  }
  get bagslots(): number {
    return $.utils.getInt32(116, this);
  }
  set bagslots(value: number) {
    $.utils.setInt32(116, value, this);
  }
  get bagtype(): number {
    return $.utils.getInt32(120, this);
  }
  set bagtype(value: number) {
    $.utils.setInt32(120, value, this);
  }
  get bagwr(): number {
    return $.utils.getInt32(124, this);
  }
  set bagwr(value: number) {
    $.utils.setInt32(124, value, this);
  }
  get banedmgamt(): number {
    return $.utils.getInt32(128, this);
  }
  set banedmgamt(value: number) {
    $.utils.setInt32(128, value, this);
  }
  get banedmgraceamt(): number {
    return $.utils.getInt32(132, this);
  }
  set banedmgraceamt(value: number) {
    $.utils.setInt32(132, value, this);
  }
  get banedmgbody(): number {
    return $.utils.getInt32(136, this);
  }
  set banedmgbody(value: number) {
    $.utils.setInt32(136, value, this);
  }
  get banedmgrace(): number {
    return $.utils.getInt32(140, this);
  }
  set banedmgrace(value: number) {
    $.utils.setInt32(140, value, this);
  }
  get bardtype(): number {
    return $.utils.getInt32(144, this);
  }
  set bardtype(value: number) {
    $.utils.setInt32(144, value, this);
  }
  get bardvalue(): number {
    return $.utils.getInt32(148, this);
  }
  set bardvalue(value: number) {
    $.utils.setInt32(148, value, this);
  }
  get book(): number {
    return $.utils.getInt32(152, this);
  }
  set book(value: number) {
    $.utils.setInt32(152, value, this);
  }
  get casttime(): number {
    return $.utils.getInt32(156, this);
  }
  set casttime(value: number) {
    $.utils.setInt32(156, value, this);
  }
  get casttime2(): number {
    return $.utils.getInt32(160, this);
  }
  set casttime2(value: number) {
    $.utils.setInt32(160, value, this);
  }
  get classes(): number {
    return $.utils.getInt32(164, this);
  }
  set classes(value: number) {
    $.utils.setInt32(164, value, this);
  }
  get color(): number {
    return $.utils.getUint32(168, this);
  }
  set color(value: number) {
    $.utils.setUint32(168, value, this);
  }
  get combateffects(): string {
    return $.utils.getText(1, this);
  }
  set combateffects(value: string) {
    $.utils.setText(1, value, this);
  }
  get extradmgskill(): number {
    return $.utils.getInt32(172, this);
  }
  set extradmgskill(value: number) {
    $.utils.setInt32(172, value, this);
  }
  get extradmgamt(): number {
    return $.utils.getInt32(176, this);
  }
  set extradmgamt(value: number) {
    $.utils.setInt32(176, value, this);
  }
  get price(): number {
    return $.utils.getInt32(180, this);
  }
  set price(value: number) {
    $.utils.setInt32(180, value, this);
  }
  get cr(): number {
    return $.utils.getInt32(184, this);
  }
  set cr(value: number) {
    $.utils.setInt32(184, value, this);
  }
  get damage(): number {
    return $.utils.getInt32(188, this);
  }
  set damage(value: number) {
    $.utils.setInt32(188, value, this);
  }
  get damageshield(): number {
    return $.utils.getInt32(192, this);
  }
  set damageshield(value: number) {
    $.utils.setInt32(192, value, this);
  }
  get deity(): number {
    return $.utils.getInt32(196, this);
  }
  set deity(value: number) {
    $.utils.setInt32(196, value, this);
  }
  get delay(): number {
    return $.utils.getInt32(200, this);
  }
  set delay(value: number) {
    $.utils.setInt32(200, value, this);
  }
  get augdistiller(): number {
    return $.utils.getUint32(204, this);
  }
  set augdistiller(value: number) {
    $.utils.setUint32(204, value, this);
  }
  get dotshielding(): number {
    return $.utils.getInt32(208, this);
  }
  set dotshielding(value: number) {
    $.utils.setInt32(208, value, this);
  }
  get dr(): number {
    return $.utils.getInt32(212, this);
  }
  set dr(value: number) {
    $.utils.setInt32(212, value, this);
  }
  get clicktype(): number {
    return $.utils.getInt32(216, this);
  }
  set clicktype(value: number) {
    $.utils.setInt32(216, value, this);
  }
  get clicklevel2(): number {
    return $.utils.getInt32(220, this);
  }
  set clicklevel2(value: number) {
    $.utils.setInt32(220, value, this);
  }
  get elemdmgtype(): number {
    return $.utils.getInt32(224, this);
  }
  set elemdmgtype(value: number) {
    $.utils.setInt32(224, value, this);
  }
  get elemdmgamt(): number {
    return $.utils.getInt32(228, this);
  }
  set elemdmgamt(value: number) {
    $.utils.setInt32(228, value, this);
  }
  get endur(): number {
    return $.utils.getInt32(232, this);
  }
  set endur(value: number) {
    $.utils.setInt32(232, value, this);
  }
  get factionamt1(): number {
    return $.utils.getInt32(236, this);
  }
  set factionamt1(value: number) {
    $.utils.setInt32(236, value, this);
  }
  get factionamt2(): number {
    return $.utils.getInt32(240, this);
  }
  set factionamt2(value: number) {
    $.utils.setInt32(240, value, this);
  }
  get factionamt3(): number {
    return $.utils.getInt32(244, this);
  }
  set factionamt3(value: number) {
    $.utils.setInt32(244, value, this);
  }
  get factionamt4(): number {
    return $.utils.getInt32(248, this);
  }
  set factionamt4(value: number) {
    $.utils.setInt32(248, value, this);
  }
  get factionmod1(): number {
    return $.utils.getInt32(252, this);
  }
  set factionmod1(value: number) {
    $.utils.setInt32(252, value, this);
  }
  get factionmod2(): number {
    return $.utils.getInt32(256, this);
  }
  set factionmod2(value: number) {
    $.utils.setInt32(256, value, this);
  }
  get factionmod3(): number {
    return $.utils.getInt32(260, this);
  }
  set factionmod3(value: number) {
    $.utils.setInt32(260, value, this);
  }
  get factionmod4(): number {
    return $.utils.getInt32(264, this);
  }
  set factionmod4(value: number) {
    $.utils.setInt32(264, value, this);
  }
  get focuseffect(): number {
    return $.utils.getInt32(268, this);
  }
  set focuseffect(value: number) {
    $.utils.setInt32(268, value, this);
  }
  get fr(): number {
    return $.utils.getInt32(272, this);
  }
  set fr(value: number) {
    $.utils.setInt32(272, value, this);
  }
  get fvnodrop(): number {
    return $.utils.getInt32(276, this);
  }
  set fvnodrop(value: number) {
    $.utils.setInt32(276, value, this);
  }
  get haste(): number {
    return $.utils.getInt32(280, this);
  }
  set haste(value: number) {
    $.utils.setInt32(280, value, this);
  }
  get clicklevel(): number {
    return $.utils.getInt32(284, this);
  }
  set clicklevel(value: number) {
    $.utils.setInt32(284, value, this);
  }
  get hp(): number {
    return $.utils.getInt32(288, this);
  }
  set hp(value: number) {
    $.utils.setInt32(288, value, this);
  }
  get regen(): number {
    return $.utils.getInt32(292, this);
  }
  set regen(value: number) {
    $.utils.setInt32(292, value, this);
  }
  get icon(): number {
    return $.utils.getInt32(296, this);
  }
  set icon(value: number) {
    $.utils.setInt32(296, value, this);
  }
  get idfile(): string {
    return $.utils.getText(2, this);
  }
  set idfile(value: string) {
    $.utils.setText(2, value, this);
  }
  get itemclass(): number {
    return $.utils.getInt32(300, this);
  }
  set itemclass(value: number) {
    $.utils.setInt32(300, value, this);
  }
  get itemtype(): number {
    return $.utils.getInt32(304, this);
  }
  set itemtype(value: number) {
    $.utils.setInt32(304, value, this);
  }
  get light(): number {
    return $.utils.getInt32(308, this);
  }
  set light(value: number) {
    $.utils.setInt32(308, value, this);
  }
  get lore(): string {
    return $.utils.getText(3, this);
  }
  set lore(value: string) {
    $.utils.setText(3, value, this);
  }
  get loregroup(): number {
    return $.utils.getInt32(312, this);
  }
  set loregroup(value: number) {
    $.utils.setInt32(312, value, this);
  }
  get magic(): number {
    return $.utils.getInt32(316, this);
  }
  set magic(value: number) {
    $.utils.setInt32(316, value, this);
  }
  get mana(): number {
    return $.utils.getInt32(320, this);
  }
  set mana(value: number) {
    $.utils.setInt32(320, value, this);
  }
  get manaregen(): number {
    return $.utils.getInt32(324, this);
  }
  set manaregen(value: number) {
    $.utils.setInt32(324, value, this);
  }
  get enduranceregen(): number {
    return $.utils.getInt32(328, this);
  }
  set enduranceregen(value: number) {
    $.utils.setInt32(328, value, this);
  }
  get material(): number {
    return $.utils.getInt32(332, this);
  }
  set material(value: number) {
    $.utils.setInt32(332, value, this);
  }
  get herosforgemodel(): number {
    return $.utils.getInt32(336, this);
  }
  set herosforgemodel(value: number) {
    $.utils.setInt32(336, value, this);
  }
  get maxcharges(): number {
    return $.utils.getInt32(340, this);
  }
  set maxcharges(value: number) {
    $.utils.setInt32(340, value, this);
  }
  get mr(): number {
    return $.utils.getInt32(344, this);
  }
  set mr(value: number) {
    $.utils.setInt32(344, value, this);
  }
  get nodrop(): number {
    return $.utils.getInt32(348, this);
  }
  set nodrop(value: number) {
    $.utils.setInt32(348, value, this);
  }
  get norent(): number {
    return $.utils.getInt32(352, this);
  }
  set norent(value: number) {
    $.utils.setInt32(352, value, this);
  }
  get pendingloreflag(): number {
    return $.utils.getUint32(356, this);
  }
  set pendingloreflag(value: number) {
    $.utils.setUint32(356, value, this);
  }
  get pr(): number {
    return $.utils.getInt32(360, this);
  }
  set pr(value: number) {
    $.utils.setInt32(360, value, this);
  }
  get procrate(): number {
    return $.utils.getInt32(364, this);
  }
  set procrate(value: number) {
    $.utils.setInt32(364, value, this);
  }
  get races(): number {
    return $.utils.getInt32(368, this);
  }
  set races(value: number) {
    $.utils.setInt32(368, value, this);
  }
  get range(): number {
    return $.utils.getInt32(372, this);
  }
  set range(value: number) {
    $.utils.setInt32(372, value, this);
  }
  get reclevel(): number {
    return $.utils.getInt32(376, this);
  }
  set reclevel(value: number) {
    $.utils.setInt32(376, value, this);
  }
  get recskill(): number {
    return $.utils.getInt32(380, this);
  }
  set recskill(value: number) {
    $.utils.setInt32(380, value, this);
  }
  get reqlevel(): number {
    return $.utils.getInt32(384, this);
  }
  set reqlevel(value: number) {
    $.utils.setInt32(384, value, this);
  }
  get sellrate(): number {
    return $.utils.getFloat64(392, this);
  }
  set sellrate(value: number) {
    $.utils.setFloat64(392, value, this);
  }
  get shielding(): number {
    return $.utils.getInt32(388, this);
  }
  set shielding(value: number) {
    $.utils.setInt32(388, value, this);
  }
  get size(): number {
    return $.utils.getInt32(400, this);
  }
  set size(value: number) {
    $.utils.setInt32(400, value, this);
  }
  get skillmodtype(): number {
    return $.utils.getInt32(404, this);
  }
  set skillmodtype(value: number) {
    $.utils.setInt32(404, value, this);
  }
  get skillmodvalue(): number {
    return $.utils.getInt32(408, this);
  }
  set skillmodvalue(value: number) {
    $.utils.setInt32(408, value, this);
  }
  get slots(): number {
    return $.utils.getInt32(412, this);
  }
  set slots(value: number) {
    $.utils.setInt32(412, value, this);
  }
  get clickeffect(): number {
    return $.utils.getInt32(416, this);
  }
  set clickeffect(value: number) {
    $.utils.setInt32(416, value, this);
  }
  get spellshield(): number {
    return $.utils.getInt32(420, this);
  }
  set spellshield(value: number) {
    $.utils.setInt32(420, value, this);
  }
  get strikethrough(): number {
    return $.utils.getInt32(424, this);
  }
  set strikethrough(value: number) {
    $.utils.setInt32(424, value, this);
  }
  get stunresist(): number {
    return $.utils.getInt32(428, this);
  }
  set stunresist(value: number) {
    $.utils.setInt32(428, value, this);
  }
  get summonedflag(): number {
    return $.utils.getUint32(432, this);
  }
  set summonedflag(value: number) {
    $.utils.setUint32(432, value, this);
  }
  get tradeskills(): number {
    return $.utils.getInt32(436, this);
  }
  set tradeskills(value: number) {
    $.utils.setInt32(436, value, this);
  }
  get favor(): number {
    return $.utils.getInt32(440, this);
  }
  set favor(value: number) {
    $.utils.setInt32(440, value, this);
  }
  get weight(): number {
    return $.utils.getInt32(444, this);
  }
  set weight(value: number) {
    $.utils.setInt32(444, value, this);
  }
  get benefitflag(): number {
    return $.utils.getInt32(448, this);
  }
  set benefitflag(value: number) {
    $.utils.setInt32(448, value, this);
  }
  get booktype(): number {
    return $.utils.getInt32(452, this);
  }
  set booktype(value: number) {
    $.utils.setInt32(452, value, this);
  }
  get recastdelay(): number {
    return $.utils.getInt32(456, this);
  }
  set recastdelay(value: number) {
    $.utils.setInt32(456, value, this);
  }
  get recasttype(): number {
    return $.utils.getInt32(460, this);
  }
  set recasttype(value: number) {
    $.utils.setInt32(460, value, this);
  }
  get guildfavor(): number {
    return $.utils.getInt32(464, this);
  }
  set guildfavor(value: number) {
    $.utils.setInt32(464, value, this);
  }
  get attuneable(): number {
    return $.utils.getInt32(468, this);
  }
  set attuneable(value: number) {
    $.utils.setInt32(468, value, this);
  }
  get nopet(): number {
    return $.utils.getInt32(472, this);
  }
  set nopet(value: number) {
    $.utils.setInt32(472, value, this);
  }
  get updated(): string {
    return $.utils.getText(4, this);
  }
  set updated(value: string) {
    $.utils.setText(4, value, this);
  }
  get pointtype(): number {
    return $.utils.getInt32(476, this);
  }
  set pointtype(value: number) {
    $.utils.setInt32(476, value, this);
  }
  get potionbelt(): number {
    return $.utils.getInt32(480, this);
  }
  set potionbelt(value: number) {
    $.utils.setInt32(480, value, this);
  }
  get potionbeltslots(): number {
    return $.utils.getInt32(484, this);
  }
  set potionbeltslots(value: number) {
    $.utils.setInt32(484, value, this);
  }
  get stacksize(): number {
    return $.utils.getInt32(488, this);
  }
  set stacksize(value: number) {
    $.utils.setInt32(488, value, this);
  }
  get notransfer(): number {
    return $.utils.getInt32(492, this);
  }
  set notransfer(value: number) {
    $.utils.setInt32(492, value, this);
  }
  get stackable(): number {
    return $.utils.getInt32(496, this);
  }
  set stackable(value: number) {
    $.utils.setInt32(496, value, this);
  }
  get proceffect(): number {
    return $.utils.getInt32(500, this);
  }
  set proceffect(value: number) {
    $.utils.setInt32(500, value, this);
  }
  get proctype(): number {
    return $.utils.getInt32(504, this);
  }
  set proctype(value: number) {
    $.utils.setInt32(504, value, this);
  }
  get proclevel2(): number {
    return $.utils.getInt32(508, this);
  }
  set proclevel2(value: number) {
    $.utils.setInt32(508, value, this);
  }
  get proclevel(): number {
    return $.utils.getInt32(512, this);
  }
  set proclevel(value: number) {
    $.utils.setInt32(512, value, this);
  }
  get worneffect(): number {
    return $.utils.getInt32(516, this);
  }
  set worneffect(value: number) {
    $.utils.setInt32(516, value, this);
  }
  get worntype(): number {
    return $.utils.getInt32(520, this);
  }
  set worntype(value: number) {
    $.utils.setInt32(520, value, this);
  }
  get wornlevel2(): number {
    return $.utils.getInt32(524, this);
  }
  set wornlevel2(value: number) {
    $.utils.setInt32(524, value, this);
  }
  get wornlevel(): number {
    return $.utils.getInt32(528, this);
  }
  set wornlevel(value: number) {
    $.utils.setInt32(528, value, this);
  }
  get focustype(): number {
    return $.utils.getInt32(532, this);
  }
  set focustype(value: number) {
    $.utils.setInt32(532, value, this);
  }
  get focuslevel2(): number {
    return $.utils.getInt32(536, this);
  }
  set focuslevel2(value: number) {
    $.utils.setInt32(536, value, this);
  }
  get focuslevel(): number {
    return $.utils.getInt32(540, this);
  }
  set focuslevel(value: number) {
    $.utils.setInt32(540, value, this);
  }
  get scrolleffect(): number {
    return $.utils.getInt32(544, this);
  }
  set scrolleffect(value: number) {
    $.utils.setInt32(544, value, this);
  }
  get scrolltype(): number {
    return $.utils.getInt32(548, this);
  }
  set scrolltype(value: number) {
    $.utils.setInt32(548, value, this);
  }
  get scrolllevel2(): number {
    return $.utils.getInt32(552, this);
  }
  set scrolllevel2(value: number) {
    $.utils.setInt32(552, value, this);
  }
  get scrolllevel(): number {
    return $.utils.getInt32(556, this);
  }
  set scrolllevel(value: number) {
    $.utils.setInt32(556, value, this);
  }
  get svcorruption(): number {
    return $.utils.getInt32(560, this);
  }
  set svcorruption(value: number) {
    $.utils.setInt32(560, value, this);
  }
  get skillmodmax(): number {
    return $.utils.getInt32(564, this);
  }
  set skillmodmax(value: number) {
    $.utils.setInt32(564, value, this);
  }
  get questitemflag(): number {
    return $.utils.getInt32(568, this);
  }
  set questitemflag(value: number) {
    $.utils.setInt32(568, value, this);
  }
  get purity(): number {
    return $.utils.getInt32(572, this);
  }
  set purity(value: number) {
    $.utils.setInt32(572, value, this);
  }
  get evoitem(): number {
    return $.utils.getInt32(576, this);
  }
  set evoitem(value: number) {
    $.utils.setInt32(576, value, this);
  }
  get evoid(): number {
    return $.utils.getInt32(580, this);
  }
  set evoid(value: number) {
    $.utils.setInt32(580, value, this);
  }
  get evolvinglevel(): number {
    return $.utils.getInt32(584, this);
  }
  set evolvinglevel(value: number) {
    $.utils.setInt32(584, value, this);
  }
  get evomax(): number {
    return $.utils.getInt32(588, this);
  }
  set evomax(value: number) {
    $.utils.setInt32(588, value, this);
  }
  get dsmitigation(): number {
    return $.utils.getInt32(592, this);
  }
  set dsmitigation(value: number) {
    $.utils.setInt32(592, value, this);
  }
  get healamt(): number {
    return $.utils.getInt32(596, this);
  }
  set healamt(value: number) {
    $.utils.setInt32(596, value, this);
  }
  get spelldmg(): number {
    return $.utils.getInt32(600, this);
  }
  set spelldmg(value: number) {
    $.utils.setInt32(600, value, this);
  }
  get clairvoyance(): number {
    return $.utils.getInt32(604, this);
  }
  set clairvoyance(value: number) {
    $.utils.setInt32(604, value, this);
  }
  get backstabdmg(): number {
    return $.utils.getInt32(608, this);
  }
  set backstabdmg(value: number) {
    $.utils.setInt32(608, value, this);
  }
  get elitematerial(): number {
    return $.utils.getInt32(612, this);
  }
  set elitematerial(value: number) {
    $.utils.setInt32(612, value, this);
  }
  get scriptfileid(): number {
    return $.utils.getInt32(616, this);
  }
  set scriptfileid(value: number) {
    $.utils.setInt32(616, value, this);
  }
  get expendablearrow(): number {
    return $.utils.getInt32(620, this);
  }
  set expendablearrow(value: number) {
    $.utils.setInt32(620, value, this);
  }
  get powersourcecapacity(): number {
    return $.utils.getInt32(624, this);
  }
  set powersourcecapacity(value: number) {
    $.utils.setInt32(624, value, this);
  }
  get bardeffect(): number {
    return $.utils.getInt32(628, this);
  }
  set bardeffect(value: number) {
    $.utils.setInt32(628, value, this);
  }
  get bardeffecttype(): number {
    return $.utils.getInt32(632, this);
  }
  set bardeffecttype(value: number) {
    $.utils.setInt32(632, value, this);
  }
  get bardlevel2(): number {
    return $.utils.getInt32(636, this);
  }
  set bardlevel2(value: number) {
    $.utils.setInt32(636, value, this);
  }
  get bardlevel(): number {
    return $.utils.getInt32(640, this);
  }
  set bardlevel(value: number) {
    $.utils.setInt32(640, value, this);
  }
  get subtype(): number {
    return $.utils.getInt32(644, this);
  }
  set subtype(value: number) {
    $.utils.setInt32(644, value, this);
  }
  get heirloom(): number {
    return $.utils.getInt32(648, this);
  }
  set heirloom(value: number) {
    $.utils.setInt32(648, value, this);
  }
  get placeable(): number {
    return $.utils.getInt32(652, this);
  }
  set placeable(value: number) {
    $.utils.setInt32(652, value, this);
  }
  get epicitem(): number {
    return $.utils.getInt32(656, this);
  }
  set epicitem(value: number) {
    $.utils.setInt32(656, value, this);
  }
  get minstatus(): number {
    return $.utils.getInt32(660, this);
  }
  set minstatus(value: number) {
    $.utils.setInt32(660, value, this);
  }
  get name(): string {
    return $.utils.getText(5, this);
  }
  set name(value: string) {
    $.utils.setText(5, value, this);
  }
  get aagi(): number {
    return $.utils.getInt32(664, this);
  }
  set aagi(value: number) {
    $.utils.setInt32(664, value, this);
  }
  get bagSlot(): number {
    return $.utils.getInt32(668, this);
  }
  set bagSlot(value: number) {
    $.utils.setInt32(668, value, this);
  }
  toString(): string {
    return "ItemInstance_" + super.toString();
  }
}
export class BulkItemPacket extends $.Struct {
  static readonly _capnp = {
    displayName: "BulkItemPacket",
    id: "817d8fbf84fe89c1",
    size: new $.ObjectSize(0, 1)
  };
  static _Items: $.ListCtor<ItemInstance>;
  _adoptItems(value: $.Orphan<$.List<ItemInstance>>): void {
    $.utils.adopt(value, $.utils.getPointer(0, this));
  }
  _disownItems(): $.Orphan<$.List<ItemInstance>> {
    return $.utils.disown(this.items);
  }
  get items(): $.List<ItemInstance> {
    return $.utils.getList(0, BulkItemPacket._Items, this);
  }
  _hasItems(): boolean {
    return !$.utils.isNull($.utils.getPointer(0, this));
  }
  _initItems(length: number): $.List<ItemInstance> {
    return $.utils.initList(0, BulkItemPacket._Items, length, this);
  }
  set items(value: $.List<ItemInstance>) {
    $.utils.copyFrom(value, $.utils.getPointer(0, this));
  }
  toString(): string {
    return "BulkItemPacket_" + super.toString();
  }
}
export class BulkDeleteItem extends $.Struct {
  static readonly _capnp = {
    displayName: "BulkDeleteItem",
    id: "ab1d6befe41d5e7c",
    size: new $.ObjectSize(0, 1)
  };
  static _Items: $.ListCtor<DeleteItem>;
  _adoptItems(value: $.Orphan<$.List<DeleteItem>>): void {
    $.utils.adopt(value, $.utils.getPointer(0, this));
  }
  _disownItems(): $.Orphan<$.List<DeleteItem>> {
    return $.utils.disown(this.items);
  }
  get items(): $.List<DeleteItem> {
    return $.utils.getList(0, BulkDeleteItem._Items, this);
  }
  _hasItems(): boolean {
    return !$.utils.isNull($.utils.getPointer(0, this));
  }
  _initItems(length: number): $.List<DeleteItem> {
    return $.utils.initList(0, BulkDeleteItem._Items, length, this);
  }
  set items(value: $.List<DeleteItem>) {
    $.utils.copyFrom(value, $.utils.getPointer(0, this));
  }
  toString(): string {
    return "BulkDeleteItem_" + super.toString();
  }
}
export class DeleteItem extends $.Struct {
  static readonly _capnp = {
    displayName: "DeleteItem",
    id: "ea44e8bfb6132911",
    size: new $.ObjectSize(8, 0)
  };
  get slot(): number {
    return $.utils.getInt8(0, this);
  }
  set slot(value: number) {
    $.utils.setInt8(0, value, this);
  }
  get bag(): number {
    return $.utils.getInt8(1, this);
  }
  set bag(value: number) {
    $.utils.setInt8(1, value, this);
  }
  toString(): string {
    return "DeleteItem_" + super.toString();
  }
}
BulkItemPacket._Items = $.CompositeList(ItemInstance);
BulkDeleteItem._Items = $.CompositeList(DeleteItem);
