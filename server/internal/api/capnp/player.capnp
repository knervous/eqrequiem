@0xabcdefabcdefabc234;

using Go = import "go.capnp";
$Go.package("net");
$Go.import("github.com/knervous/eqgo/internal/api/capnp");

using Item = import "item.capnp";
using Common = import "common.capnp";

struct CharacterSelect {
  characterCount @0 :Int32;
  characters @1 :List(CharacterSelectEntry);
}

struct CharacterSelectEntry {
  name @0 :Text;
  charClass @1 :Int32;
  race @2 :Int32;
  level @3 :Int32;
  zone @4 :Int32;
  instance @5 :Int32;
  gender @6 :Int32;
  face @7 :Int32;
  items @8 :List(Item.ItemInstance);
  deity @9 :Int32;
  primaryIdFile @10 :Int32;
  secondaryIdFile @11 :Int32;
  goHome @12 :Int32;
  enabled @13 :Int32;
  lastLogin @14 :Int32;
}

struct CharSelectEquip {
  material @0 :Int32;
  color @1 :Tint;
}

struct PlayerProfile {
  gender @0 :Int32;
  race @1 :Int32;
  charClass @2 :Int32;
  level @3 :Int32;
  binds @4 :List(Common.Bind);
  deity @5 :Int32;
  intoxication @6 :Int32;
  spellSlotRefresh @7 :List(Int32);
  abilitySlotRefresh @8 :Int32;
  itemMaterial @9 :Common.TextureProfile;
  itemTint @10 :Int32;
  aaArray @11 :List(Common.AAArray);
  points @12 :Int32;
  mana @13 :Int32;
  curHp @14 :Int32;
  str @15 :Int32;
  sta @16 :Int32;
  cha @17 :Int32;
  dex @18 :Int32;
  intel @19 :Int32;
  agi @20 :Int32;
  wis @21 :Int32;
  face @22 :Int32;
  spellBook @23 :List(Int32);
  memSpells @24 :List(Int32);
  platinum @25 :Int32;
  gold @26 :Int32;
  silver @27 :Int32;
  copper @28 :Int32;
  platinumCursor @29 :Int32;
  goldCursor @30 :Int32;
  silverCursor @31 :Int32;
  copperCursor @32 :Int32;
  skills @33 :List(Int32);
  innateSkills @34 :List(Int32);
  toxicity @35 :Int32;
  thirstLevel @36 :Int32;
  hungerLevel @37 :Int32;
  buffs @38 :List(Common.SpellBuff);
  disciplines @39 :Common.Disciplines;
  recastTimers @40 :List(Int32);
  endurance @41 :Int32;
  aapointsSpent @42 :Int32;
  aapoints @43 :Int32;
  bandoliers @44 :List(Common.Bandolier);
  potionbelt @45 :Common.PotionBelt;
  availableSlots @46 :Int32;
  name @47 :Text;
  lastName @48 :Text;
  guildId @49 :Int32;
  birthday @50 :Int32;
  lastlogin @51 :Int32;
  timePlayedMin @52 :Int32;
  pvp @53 :Int32;
  anon @54 :Int32;
  gm @55 :Int32;
  guildrank @56 :Int32;
  guildbanker @57 :Int32;
  exp @58 :Int32;
  timeentitledonaccount @59 :Int32;
  languages @60 :List(Int32);
  x @61 :Float32;
  y @62 :Float32;
  z @63 :Float32;
  heading @64 :Float32;
  platinumBank @65 :Int32;
  goldBank @66 :Int32;
  silverBank @67 :Int32;
  copperBank @68 :Int32;
  platinumShared @69 :Int32;
  expansions @70 :Int32;
  autosplit @71 :Int32;
  zoneId @72 :Int32;
  zoneInstance @73 :Int32;
  groupMembers @74 :List(Common.StringList);
  groupLeader @75 :Text;
  entityid @76 :Int32;
  leadAaActive @77 :Int32;
  airRemaining @78 :Int32;
  expAa @79 :Int32;
  groupAutoconsent @80 :Int32;
  raidAutoconsent @81 :Int32;
  guildAutoconsent @82 :Int32;
  showhelm @83 :Int32;
  inventoryItems @84 :List(Item.ItemInstance);
  spawnId @85 :Int32;
  status @86 :Int32;
  aaPoints @87 :Int32;
  ac @88 :Int32;
  magicResist @89 :Int32;
  fireResist @90 :Int32;
  coldResist @91 :Int32;
  poisonResist @92 :Int32;
  diseaseResist @93 :Int32;
  haste @94 :Int32;
  accuracy @95 :Int32;
  attack @96 :Int32;
  avoidance @97 :Int32;
  clairvoyance @98 :Int32;
  combatEffects @99 :Int32;
  damageShieldMitigation @100 :Int32;
  damageShield @101 :Int32;
  dotShielding @102 :Int32;
  hpRegen @103 :Int32;
  manaRegen @104 :Int32;
  enduranceRegen @105 :Int32;
  shielding @106 :Int32;
  spellDamage @107 :Int32;
  spellShielding @108 :Int32;
  strikethrough @109 :Int32;
  stunResist @110 :Int32;
  backstab @111 :Int32;
  wind @112 :Int32;
  brass @113 :Int32;
  string @114 :Int32;
  percussion @115 :Int32;
  singing @116 :Int32;
  baking @117 :Int32;
  alchemy @118 :Int32;
  tailoring @119 :Int32;
  blacksmithing @120 :Int32;
  fletching @121 :Int32;
  brewing @122 :Int32;
  jewelry @123 :Int32;
  pottery @124 :Int32;
  research @125 :Int32;
  alcohol @126 :Int32;
  fishing @127 :Int32;
  tinkering @128 :Int32;
  maxHp @129 :Int64;
  maxMana @130 :Int64;
  maxEndurance @131 :Int64;
}

struct Tint {
  blue @0 :Int32;
  green @1 :Int32;
  reddays @2 :Int32;
  useTint @3 :Int32;
}