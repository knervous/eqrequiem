@0xabcdefabcdefabc234;

using Go = import "go.capnp";  # Import go.capnp for Go annotations
$Go.package("net");         # Go package name
$Go.import("github.com/knervous/eqgo/internal/api/capnp");  # Go import path

using Item = import "item.capnp";
using Common = import "common.capnp";

struct Tint {
  blue @0 :Int32;
  green @1 :Int32;
  red @2 :Int32;
  useTint @3 :Int32;
}

struct CharSelectEquip {
  material @0 :Int32;
  color @1 :Tint;
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

struct CharacterSelect {
  characterCount @0 :Int32;
  characters @1 :List(CharacterSelectEntry);
}

struct PlayerProfile {
  checksum @0 :Int32;
  gender @1 :Int32;
  race @2 :Int32;
  charClass @3 :Int32;
  level @4 :Int32;
  level1 @5 :Int32;
  binds @6 :List(Common.Bind);
  deity @7 :Int32;
  intoxication @8 :Int32;
  spellSlotRefresh @9 :List(Int32);
  abilitySlotRefresh @10 :Int32;
  haircolor @11 :Int32;
  beardcolor @12 :Int32;
  eyecolor1 @13 :Int32;
  eyecolor2 @14 :Int32;
  hairstyle @15 :Int32;
  beard @16 :Int32;
  itemMaterial @17 :Common.TextureProfile;
  itemTint @18 :Int32;
  aaArray @19 :List(Common.AAArray);
  points @20 :Int32;
  mana @21 :Int32;
  curHp @22 :Int32;
  str @23 :Int32;
  sta @24 :Int32;
  cha @25 :Int32;
  dex @26 :Int32;
  intel @27 :Int32;
  agi @28 :Int32;
  wis @29 :Int32;
  face @30 :Int32;
  spellBook @31 :List(Int32);
  memSpells @32 :List(Int32);
  platinum @33 :Int32;
  gold @34 :Int32;
  silver @35 :Int32;
  copper @36 :Int32;
  platinumCursor @37 :Int32;
  goldCursor @38 :Int32;
  silverCursor @39 :Int32;
  copperCursor @40 :Int32;
  skills @41 :List(Int32);
  innateSkills @42 :List(Int32);
  toxicity @43 :Int32;
  thirstLevel @44 :Int32;
  hungerLevel @45 :Int32;
  buffs @46 :List(Common.SpellBuff);
  disciplines @47 :Common.Disciplines;
  recastTimers @48 :List(Int32);
  endurance @49 :Int32;
  aapointsSpent @50 :Int32;
  aapoints @51 :Int32;
  bandoliers @52 :List(Common.Bandolier);
  potionbelt @53 :Common.PotionBelt;
  availableSlots @54 :Int32;
  name @55 :Text;
  lastName @56 :Text;
  guildId @57 :Int32;
  birthday @58 :Int32;
  lastlogin @59 :Int32;
  timePlayedMin @60 :Int32;
  pvp @61 :Int32;
  anon @62 :Int32;
  gm @63 :Int32;
  guildrank @64 :Int32;
  guildbanker @65 :Int32;
  exp @66 :Int32;
  timeentitledonaccount @67 :Int32;
  languages @68 :List(Int32);
  x @69 :Float32;
  y @70 :Float32;
  z @71 :Float32;
  heading @72 :Float32;
  platinumBank @73 :Int32;
  goldBank @74 :Int32;
  silverBank @75 :Int32;
  copperBank @76 :Int32;
  platinumShared @77 :Int32;
  expansions @78 :Int32;
  autosplit @79 :Int32;
  zoneId @80 :Int32;
  zoneInstance @81 :Int32;
  groupMembers @82 :List(Common.StringList);
  groupLeader @83 :Text;
  entityid @84 :Int32;
  leadAaActive @85 :Int32;
  ldonPointsGuk @86 :Int32;
  ldonPointsMir @87 :Int32;
  ldonPointsMmc @88 :Int32;
  ldonPointsRuj @89 :Int32;
  ldonPointsTak @90 :Int32;
  ldonPointsAvailable @91 :Int32;
  tributeTimeRemaining @92 :Int32;
  careerTributePoints @93 :Int32;
  tributePoints @94 :Int32;
  tributeActive @95 :Int32;
  tributes @96 :List(Common.Tribute);
  groupLeadershipExp @97 :Float64;
  raidLeadershipExp @98 :Float64;
  groupLeadershipPoints @99 :Int32;
  raidLeadershipPoints @100 :Int32;
  leaderAbilities @101 :Common.LeadershipAA;
  airRemaining @102 :Int32;
  pvpKills @103 :Int32;
  pvpDeaths @104 :Int32;
  pvpCurrentPoints @105 :Int32;
  pvpCareerPoints @106 :Int32;
  pvpBestKillStreak @107 :Int32;
  pvpWorstDeathStreak @108 :Int32;
  pvpCurrentKillStreak @109 :Int32;
  pvpLastKill @110 :Common.PVPStatsEntry;
  pvpLastDeath @111 :Common.PVPStatsEntry;
  pvpNumberOfKillsInLastHours @112 :Int32;
  pvpRecentKills @113 :List(Common.PVPStatsEntry);
  expAa @114 :Int32;
  currentRadCrystals @115 :Int32;
  careerRadCrystals @116 :Int32;
  currentEbonCrystals @117 :Int32;
  careerEbonCrystals @118 :Int32;
  groupAutoconsent @119 :Int32;
  raidAutoconsent @120 :Int32;
  guildAutoconsent @121 :Int32;
  level3 @122 :Int32;
  showhelm @123 :Int32;
  inventoryItems @124 :List(Item.ItemInstance);
}
