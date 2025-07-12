@0xabcdefabcdefabcdef;

using Go = import "go.capnp";  # Import go.capnp for Go annotations
$Go.package("net");         # Go package name
$Go.import("github.com/knervous/eqgo/internal/api/capnp");  # Go import path

struct Vector3 {
  x @0 :Float32;
  y @1 :Float32;
  z @2 :Float32;
}


struct InventorySlot {
  type @0 :Int32;
  slot @1 :Int32;
  subIndex @2 :Int32;
}

struct TypelessInventorySlot {
  slot @0 :Int32;
  subIndex @1 :Int32;
}

struct EntityId {
  entityId @0 :Int32;
}

struct Duel {
  duelInitiator @0 :Int32;
  duelTarget @1 :Int32;
}

struct DuelResponse {
  targetId @0 :Int32;
  entityId @1 :Int32;
}

struct AdventureInfo {
  questId @0 :Int32;
  npcId @1 :Int32;
  inUse @2 :Bool;
  status @3 :Int32;
  showCompass @4 :Bool;
  objetive @5 :Int32;
  objetiveValue @6 :Int32;
  text @7 :Text;
  type @8 :Int32;
  minutes @9 :Int32;
  points @10 :Int32;
  x @11 :Float32;
  y @12 :Float32;
  zoneid @13 :Int32;
  zonedungeonid @14 :Int32;
}

struct TextureProfile {
  head @0 :Int32;
  chest @1 :Int32;
  arms @2 :Int32;
  wrist @3 :Int32;
  hands @4 :Int32;
  legs @5 :Int32;
  feet @6 :Int32;
  primary @7 :Int32;
  secondary @8 :Int32;
}

struct TintProfile {
  head @0 :Int32;
  chest @1 :Int32;
  arms @2 :Int32;
  wrist @3 :Int32;
  hands @4 :Int32;
  legs @5 :Int32;
  feet @6 :Int32;
  primary @7 :Int32;
  secondary @8 :Int32;
}

struct Spawns {
  spawns @0 :List(Spawn);
}

struct Spawn {
  gm @0 :Int32;
  aaitle @1 :Int32;
  anon @2 :Int32;
  face @3 :Int32;
  name @4 :Text;
  deity @5 :Int32;
  size @6 :Float32;
  npc @7 :Int32;
  invis @8 :Int32;
  haircolor @9 :Int32;
  curHp @10 :Int32;
  maxHp @11 :Int32;
  findable @12 :Int32;
  deltaHeading @13 :Int32;
  x @14 :Int32;
  y @15 :Int32;
  animation @16 :Int32;
  z @17 :Int32;
  deltaY @18 :Int32;
  deltaX @19 :Int32;
  heading @20 :Int32;
  deltaZ @21 :Int32;
  eyecolor1 @22 :Int32;
  showhelm @23 :Int32;
  isNpc @24 :Int32;
  hairstyle @25 :Int32;
  beardcolor @26 :Int32;
  level @27 :Int32;
  playerState @28 :Int32;
  beard @29 :Int32;
  suffix @30 :Text;
  petOwnerId @31 :Int32;
  guildrank @32 :Int32;
  equipment @33 :TextureProfile;
  runspeed @34 :Float32;
  afk @35 :Int32;
  guildId @36 :Int32;
  title @37 :Text;
  helm @38 :Int32;
  race @39 :Int32;
  lastName @40 :Text;
  walkspeed @41 :Float32;
  isPet @42 :Int32;
  light @43 :Int32;
  charClass @44 :Int32;
  eyecolor2 @45 :Int32;
  flymode @46 :Int32;
  gender @47 :Int32;
  bodytype @48 :Int32;
  equipChest @49 :Int32;
  mountColor @50 :Int32;
  spawnId @51 :Int32;
  boundingRadius @52 :Float32;
  equipmentTint @53 :Int32;
  lfg @54 :Int32;
  cellX     @55 :Int32;
  cellY     @56 :Int32;
  cellZ     @57 :Int32;
}

struct ClientZoneEntry {
  charName @0 :Text;
}

struct ServerZoneEntry {
  player @0 :Spawn;
}

struct MemorizeSpell {
  slot @0 :Int32;
  spellId @1 :Int32;
  scribing @2 :Int32;
  reduction @3 :Int32;
}

struct Charm {
  ownerId @0 :Int32;
  petId @1 :Int32;
  command @2 :Int32;
}

struct InterruptCast {
  spawnid @0 :Int32;
  messageid @1 :Int32;
  message @2 :Text;
}

struct DeleteSpell {
  spellSlot @0 :Int32;
  success @1 :Int32;
}

struct ManaChange {
  newMana @0 :Int32;
  stamina @1 :Int32;
  spellId @2 :Int32;
  keepcasting @3 :Int32;
  padding @4 :List(Int32);
}

struct SwapSpell {
  fromSlot @0 :Int32;
  toSlot @1 :Int32;
}

struct BeginCast {
  casterId @0 :Int32;
  spellId @1 :Int32;
  castTime @2 :Int32;
}

struct CastSpell {
  slot @0 :Int32;
  spellId @1 :Int32;
  inventoryslot @2 :Int32;
  targetId @3 :Int32;
}

struct SpawnAppearance {
  spawnId @0 :Int32;
  type @1 :Int32;
  parameter @2 :Int32;
}

struct SpellBuff {
  effectType @0 :Int32;
  level @1 :Int32;
  bardModifier @2 :Int32;
  spellid @3 :Int32;
  duration @4 :Int32;
  counters @5 :Int32;
  playerId @6 :Int32;
}

struct SpellBuffPacket {
  entityid @0 :Int32;
  buff @1 :SpellBuff;
  slotid @2 :Int32;
  bufffade @3 :Int32;
}

struct ItemNamePacket {
  itemId @0 :Int32;
  unkown @1 :Int32;
  name @2 :Text;
}

struct ItemProperties {
  charges @0 :Int32;
}

struct GMTrainee {
  npcid @0 :Int32;
  playerid @1 :Int32;
  skills @2 :List(Int32);
}

struct GMTrainEnd {
  npcid @0 :Int32;
  playerid @1 :Int32;
}

struct GMSkillChange {
  npcid @0 :Int32;
  skillbank @1 :Int32;
  skillId @2 :Int32;
}

struct ConsentResponse {
  grantname @0 :Text;
  ownername @1 :Text;
  permission @2 :Int32;
  zonename @3 :Text;
}

struct NameGeneration {
  race @0 :Int32;
  gender @1 :Int32;
  name @2 :Text;
}

struct NameApprove {
  name @0 :Text;
  race @1 :Int32;
  gender @2 :Int32;
}

struct CharCreate {
  charClass @0 :Int32;
  haircolor @1 :Int32;
  beardcolor @2 :Int32;
  beard @3 :Int32;
  gender @4 :Int32;
  race @5 :Int32;
  startZone @6 :Int32;
  hairstyle @7 :Int32;
  deity @8 :Int32;
  str @9 :Int32;
  sta @10 :Int32;
  agi @11 :Int32;
  dex @12 :Int32;
  wis @13 :Int32;
  intel @14 :Int32;
  cha @15 :Int32;
  face @16 :Int32;
  eyecolor1 @17 :Int32;
  eyecolor2 @18 :Int32;
  tutorial @19 :Int32;
  name @20 :Text;
}

struct AAArray {
  aa @0 :Int32;
  value @1 :Int32;
}

struct Disciplines {
  values @0 :List(Int32);
}

struct Tribute {
  tribute @0 :Int32;
  tier @1 :Int32;
}

struct BandolierItem {
  id @0 :Int32;
  icon @1 :Int32;
  name @2 :Text;
}

struct Bandolier {
  name @0 :Text;
  items @1 :List(BandolierItem);
}

struct PotionBeltItem {
  id @0 :Int32;
  icon @1 :Int32;
  name @2 :Text;
}

struct PotionBelt {
  items @0 :List(PotionBeltItem);
}

struct StringList {
  str @0 :Text;
}

struct GroupLeadershipAA {
  groupAaMarkNpc @0 :Int32;
  groupAanpcHealth @1 :Int32;
  groupAaDelegateMainAssist @2 :Int32;
  groupAaDelegateMarkNpc @3 :Int32;
  groupAa4 @4 :Int32;
  groupAa5 @5 :Int32;
  groupAaInspectBuffs @6 :Int32;
  groupAa7 @7 :Int32;
  groupAaSpellAwareness @8 :Int32;
  groupAaOffenseEnhancement @9 :Int32;
  groupAaManaEnhancement @10 :Int32;
  groupAaHealthEnhancement @11 :Int32;
  groupAaHealthRegeneration @12 :Int32;
  groupAaFindPathToPc @13 :Int32;
  groupAaHealthOfTargetsTarget @14 :Int32;
  groupAa15 @15 :Int32;
}

struct RaidLeadershipAA {
  raidAaMarkNpc @0 :Int32;
  raidAanpcHealth @1 :Int32;
  raidAaDelegateMainAssist @2 :Int32;
  raidAaDelegateMarkNpc @3 :Int32;
  raidAa4 @4 :Int32;
  raidAa5 @5 :Int32;
  raidAa6 @6 :Int32;
  raidAaSpellAwareness @7 :Int32;
  raidAaOffenseEnhancement @8 :Int32;
  raidAaManaEnhancement @9 :Int32;
  raidAaHealthEnhancement @10 :Int32;
  raidAaHealthRegeneration @11 :Int32;
  raidAaFindPathToPc @12 :Int32;
  raidAaHealthOfTargetsTarget @13 :Int32;
  raidAa14 @14 :Int32;
  raidAa15 @15 :Int32;
}

struct LeadershipAA {
  group @0 :GroupLeadershipAA;
  raid @1 :RaidLeadershipAA;
}

struct Bind {
  zoneId @0 :Int32;
  x @1 :Float32;
  y @2 :Float32;
  z @3 :Float32;
  heading @4 :Float32;
}

struct PVPStatsEntry {
  name @0 :Text;
  level @1 :Int32;
  race @2 :Int32;
  charClass @3 :Int32;
  zone @4 :Int32;
  time @5 :Int32;
  points @6 :Int32;
}

struct ClientTarget {
  newTarget @0 :Int32;
}


struct PetCommand {
  command @0 :Int32;
  target @1 :Int32;
}

struct DeleteSpawn {
  spawnId @0 :Int32;
}

struct ChannelMessage {
  targetname @0 :Text;
  sender @1 :Text;
  language @2 :Int32;
  chanNum @3 :Int32;
  skillInLanguage @4 :Int32;
  message @5 :Text;
}

struct CommandMessage {
  command @0 :Text;
  args @1 :List(Text);
}

struct SpecialMesg {
  header @0 :Text;
  msgType @1 :Int32;
  targetSpawnId @2 :Int32;
  sayer @3 :Text;
  message @4 :Text;
}

struct WearChange {
  spawnId @0 :Int32;
  material @1 :Int32;
  color @2 :Int32;
  wearSlotId @3 :Int32;
}

struct BindWound {
  to @0 :Int32;
  type @1 :Int32;
}

struct Animation {
  spawnid @0 :Int32;
  speed @1 :Int32;
  action @2 :Int32;
}

struct Action {
  target @0 :Int32;
  source @1 :Int32;
  level @2 :Int32;
  instrumentMod @3 :Int32;
  force @4 :Float32;
  hitHeading @5 :Float32;
  hitPitch @6 :Float32;
  type @7 :Int32;
  spell @8 :Int32;
  spellLevel @9 :Int32;
  effectFlag @10 :Int32;
}

struct CombatDamage {
  target @0 :Int32;
  source @1 :Int32;
  type @2 :Int32;
  spellid @3 :Int32;
  damage @4 :Int32;
  force @5 :Float32;
  hitHeading @6 :Float32;
  hitPitch @7 :Float32;
}

struct Consider {
  playerid @0 :Int32;
  targetid @1 :Int32;
  faction @2 :Int32;
  level @3 :Int32;
  curHp @4 :Int32;
  maxHp @5 :Int32;
  pvpcon @6 :Int32;
}

struct Death {
  spawnId @0 :Int32;
  killerId @1 :Int32;
  corpseid @2 :Int32;
  attackSkill @3 :Int32;
  spellId @4 :Int32;
  bindzoneid @5 :Int32;
  damage @6 :Int32;
}

struct BecomeCorpse {
  spawnId @0 :Int32;
  y @1 :Float32;
  x @2 :Float32;
  z @3 :Float32;
}

struct EntityPositionUpdateBase {
  spawnId @0 :Int32;
  position @1: Vector3;
  velocity @2: Vector3;
  heading @3 :Float32;
  animation @4 :Text;
}

struct EntityPositionUpdate {
  updates @0 :List(EntityPositionUpdateBase);
}

struct EntityAnimation {
  spawnId @0 :Int32;
  animation @1 :Text;
}

struct ClientPositionUpdate {
  clientId @0 :Int32;
  x @1 :Float32;
  y @2 :Float32;
  z @3 :Float32;
  heading @4 :Float32;
  animation @5 :Text;
}

struct SpawnHPUpdate {
  curHp @0 :Int32;
  maxHp @1 :Int32;
  spawnId @2 :Int32;
}

struct SpawnHPUpdate2 {
  spawnId @0 :Int32;
  hp @1 :Int32;
}

struct Stamina {
  food @0 :Int32;
  water @1 :Int32;
}

struct LevelUpdate {
  level @0 :Int32;
  exp @1 :Int32;
}

struct ExpUpdate {
  exp @0 :Int32;
  aaxp @1 :Int32;
}

struct BulkItemPacket {
  serializedItem @0 :Text;
}

struct Consume {
  slot @0 :Int32;
  autoConsumed @1 :Int32;
  type @2 :Int32;
}

struct DeleteItem {
  fromSlot @0 :Int32;
  toSlot @1 :Int32;
  numberInStack @2 :Int32;
}

struct MoveItem {
  fromSlot @0 :Int32;
  toSlot @1 :Int32;
  numberInStack @2 :Int32;
  bagSlot @3 :Int32;
}

struct MultiMoveItemSub {
  fromSlot @0 :InventorySlot;
  numberInStack @1 :Int32;
  toSlot @2 :InventorySlot;
}

struct MultiMoveItem {
  moves @0 :List(MultiMoveItemSub);
}

struct MoveCoin {
  fromSlot @0 :Int32;
  toSlot @1 :Int32;
  cointype1 @2 :Int32;
  cointype2 @3 :Int32;
  amount @4 :Int32;
}

struct TradeBusy {
  toMobId @0 :Int32;
  fromMobId @1 :Int32;
}

struct TradeCoin {
  trader @0 :Int32;
  slot @1 :Int32;
  amount @2 :Int32;
}

struct TradeMoneyUpdate {
  trader @0 :Int32;
  type @1 :Int32;
  amount @2 :Int32;
}

struct Surname {
  name @0 :Text;
  lastname @1 :Text;
}

struct GuildsList {
  guilds @0 :List(StringList);
}

struct MoneyOnCorpse {
  response @0 :Int32;
  platinum @1 :Int32;
  gold @2 :Int32;
  silver @3 :Int32;
  copper @4 :Int32;
}

struct LootingItem {
  lootee @0 :Int32;
  looter @1 :Int32;
  slotId @2 :Int32;
  autoLoot @3 :Int32;
}

struct GuildManageStatus {
  guildid @0 :Int32;
  oldrank @1 :Int32;
  newrank @2 :Int32;
  name @3 :Text;
}

struct GuildJoin {
  guildid @0 :Int32;
  level @1 :Int32;
  charClass @2 :Int32;
  rank @3 :Int32;
  zoneid @4 :Int32;
  name @5 :Text;
}

struct GuildInviteAccept {
  inviter @0 :Text;
  newmember @1 :Text;
  response @2 :Int32;
  guildeqid @3 :Int32;
}

struct GuildManageRemove {
  guildeqid @0 :Int32;
  member @1 :Text;
}

struct Guildcommand {
  othername @0 :Text;
  myname @1 :Text;
  guildeqid @2 :Int32;
  officer @3 :Int32;
}

struct OnLevelMessage {
  title @0 :Text;
  text @1 :Text;
  buttons @2 :Int32;
  duration @3 :Int32;
  popupId @4 :Int32;
}

struct GMZoneRequest {
  charname @0 :Text;
  zoneId @1 :Int32;
  x @2 :Float32;
  y @3 :Float32;
  z @4 :Float32;
  heading @5 :Float32;
  success @6 :Int32;
}

struct GMSummon {
  charname @0 :Text;
  gmname @1 :Text;
  success @2 :Int32;
  zoneId @3 :Int32;
  y @4 :Int32;
  x @5 :Int32;
  z @6 :Int32;
}

struct GMGoto {
  charname @0 :Text;
  gmname @1 :Text;
  success @2 :Int32;
  zoneId @3 :Int32;
  y @4 :Int32;
  x @5 :Int32;
  z @6 :Int32;
}

struct GMLastName {
  name @0 :Text;
  gmname @1 :Text;
  lastname @2 :Text;
}

struct CombatAbility {
  mTarget @0 :Int32;
  mAtk @1 :Int32;
  mSkill @2 :Int32;
}

struct InstillDoubt {
  iId @0 :Int32;
  iAtk @1 :Int32;
  iType @2 :Int32;
}

struct GiveItem {
  toEntity @0 :Int32;
  toEquipSlot @1 :Int32;
  fromEntity @2 :Int32;
  fromEquipSlot @3 :Int32;
}

struct RandomReq {
  low @0 :Int32;
  high @1 :Int32;
}

struct RandomReply {
  low @0 :Int32;
  high @1 :Int32;
  result @2 :Int32;
  name @3 :Text;
}

struct LFG {
  value @0 :Int32;
  name @1 :Text;
}

struct LFGAppearance {
  spawnId @0 :Int32;
  lfg @1 :Int32;
}

struct TimeOfDay {
  hour @0 :Int32;
  minute @1 :Int32;
  day @2 :Int32;
  month @3 :Int32;
  year @4 :Int32;
}

struct MerchantClick {
  npcid @0 :Int32;
  playerid @1 :Int32;
  command @2 :Int32;
  rate @3 :Float32;
}

struct MerchantSell {
  npcid @0 :Int32;
  playerid @1 :Int32;
  itemslot @2 :Int32;
  quantity @3 :Int32;
  price @4 :Int32;
}

struct MerchantPurchase {
  npcid @0 :Int32;
  itemslot @1 :Int32;
  quantity @2 :Int32;
  price @3 :Int32;
}

struct MerchantDelItem {
  npcid @0 :Int32;
  playerid @1 :Int32;
  itemslot @2 :Int32;
}

struct AdventurePurchase {
  someFlag @0 :Int32;
  npcid @1 :Int32;
  itemid @2 :Int32;
  variable @3 :Int32;
}

struct AdventureSell {
  npcid @0 :Int32;
  slot @1 :Int32;
  charges @2 :Int32;
  sellPrice @3 :Int32;
}

struct AdventurePointsUpdate {
  ldonAvailablePoints @0 :Int32;
  unkownApu @1 :List(Int32);
  ldonGukPoints @2 :Int32;
  ldonMirugalPoints @3 :Int32;
  ldonMistmoorePoints @4 :Int32;
  ldonRujarkianPoints @5 :Int32;
  ldonTakishPoints @6 :Int32;
}

struct AdventureFinish {
  winLose @0 :Int32;
  points @1 :Int32;
}

struct AdventureRequest {
  risk @0 :Int32;
  entityId @1 :Int32;
}

struct AdventureRequestResponse {
  text @0 :Text;
  timetoenter @1 :Int32;
  timeleft @2 :Int32;
  risk @3 :Int32;
  x @4 :Float32;
  y @5 :Float32;
  z @6 :Float32;
  showcompass @7 :Int32;
}

struct Illusion {
  spawnid @0 :Int32;
  charname @1 :Text;
  race @2 :Int32;
  gender @3 :Int32;
  texture @4 :Int32;
  helmtexture @5 :Int32;
  face @6 :Int32;
  hairstyle @7 :Int32;
  haircolor @8 :Int32;
  beard @9 :Int32;
  beardcolor @10 :Int32;
  size @11 :Float32;
}

struct SkillUpdate {
  skillId @0 :Int32;
  value @1 :Int32;
}

struct ZoneUnavail {
  zonename @0 :Text;
}

struct GroupGeneric {
  name1 @0 :Text;
  name2 @1 :Text;
}

struct GroupCancel {
  name1 @0 :Text;
  name2 @1 :Text;
  toggle @2 :Int32;
}

struct GroupUpdate {
  action @0 :Int32;
  yourname @1 :Text;
  membername @2 :List(StringList);
  leadersname @3 :Text;
}

struct GroupUpdate2 {
  action @0 :Int32;
  yourname @1 :Text;
  membername @2 :List(StringList);
  leadersname @3 :Text;
  leaderAas @4 :GroupLeadershipAA;
}

struct GroupJoin {
  action @0 :Int32;
  yourname @1 :Text;
  membername @2 :Text;
}

struct FaceChange {
  haircolor @0 :Int32;
  beardcolor @1 :Int32;
  eyecolor1 @2 :Int32;
  eyecolor2 @3 :Int32;
  hairstyle @4 :Int32;
  beard @5 :Int32;
  face @6 :Int32;
}

struct TradeRequest {
  toMobId @0 :Int32;
  fromMobId @1 :Int32;
}

struct TradeAccept {
  fromMobId @0 :Int32;
}

struct CancelTrade {
  fromid @0 :Int32;
  action @1 :Int32;
}

struct PetitionUpdate {
  petnumber @0 :Int32;
  color @1 :Int32;
  status @2 :Int32;
  senttime @3 :Int32;
  accountid @4 :Text;
  gmsenttoo @5 :Text;
  quetotal @6 :Int32;
  charname @7 :Text;
}

struct Petition {
  petnumber @0 :Int32;
  urgency @1 :Int32;
  accountid @2 :Text;
  lastgm @3 :Text;
  zone @4 :Int32;
  charname @5 :Text;
  charlevel @6 :Int32;
  charclass @7 :Int32;
  charrace @8 :Int32;
  checkouts @9 :Int32;
  unavail @10 :Int32;
  senttime @11 :Int32;
  petitiontext @12 :Text;
  gmtext @13 :Text;
}

struct WhoAll {
  whom @0 :Text;
  wrace @1 :Int32;
  wclass @2 :Int32;
  lvllow @3 :Int32;
  lvlhigh @4 :Int32;
  gmlookup @5 :Int32;
}

struct Stun {
  duration @0 :Int32;
}

struct AugmentItem {
  containerSlot @0 :Int32;
  augmentSlot @1 :Int32;
}

struct Emote {
  message @0 :Text;
}

struct Inspect {
  targetId @0 :Int32;
  playerId @1 :Int32;
}

struct InspectResponse {
  targetId @0 :Int32;
  playerid @1 :Int32;
  itemnames @2 :List(StringList);
  itemicons @3 :List(Int32);
  text @4 :Text;
}

struct SetDataRate {
  newdatarate @0 :Float32;
}

struct SetServerFilter {
  filters @0 :List(Int32);
}

struct SetServerFilterAck {
  blank @0 :List(Int32);
}

struct IncreaseStat {
  str @0 :Int32;
  sta @1 :Int32;
  agi @2 :Int32;
  dex @3 :Int32;
  int @4 :Int32;
  wis @5 :Int32;
  cha @6 :Int32;
  fire @7 :Int32;
  cold @8 :Int32;
  magic @9 :Int32;
  poison @10 :Int32;
  disease @11 :Int32;
  str2 @12 :Int32;
  sta2 @13 :Int32;
  agi2 @14 :Int32;
  dex2 @15 :Int32;
  int2 @16 :Int32;
  wis2 @17 :Int32;
  cha2 @18 :Int32;
  fire2 @19 :Int32;
  cold2 @20 :Int32;
  magic2 @21 :Int32;
  poison2 @22 :Int32;
  disease2 @23 :Int32;
}

struct GMName {
  oldname @0 :Text;
  gmname @1 :Text;
  newname @2 :Text;
  badname @3 :Int32;
}

struct GMDelCorpse {
  corpsename @0 :Text;
  gmname @1 :Text;
}

struct GMKick {
  name @0 :Text;
  gmname @1 :Text;
}

struct GMKill {
  name @0 :Text;
  gmname @1 :Text;
}

struct GMEmoteZone {
  text @0 :Text;
}

struct BookText {
  window @0 :Int32;
  type @1 :Int32;
  booktext @2 :Text;
}

struct BookRequest {
  window @0 :Int32;
  type @1 :Int32;
  txtfile @2 :Text;
}

struct Object {
  linkedListAddr @0 :List(Int32);
  dropId @1 :Int32;
  zoneId @2 :Int32;
  zoneInstance @3 :Int32;
  heading @4 :Float32;
  z @5 :Float32;
  x @6 :Float32;
  y @7 :Float32;
  objectName @8 :Text;
  objectType @9 :Int32;
  spawnId @10 :Int32;
}

struct ClickObject {
  dropId @0 :Int32;
  playerId @1 :Int32;
}

struct ClickObjectAction {
  playerId @0 :Int32;
  dropId @1 :Int32;
  open @2 :Int32;
  type @3 :Int32;
  icon @4 :Int32;
  objectName @5 :Text;
}
struct Shielding {
  targetId @0 :Int32;
}

struct ClickObjectAck {
  playerId @0 :Int32;
  dropId @1 :Int32;
  open @2 :Int32;
  type @3 :Int32;
  icon @4 :Int32;
  objectName @5 :Text;
}

struct CloseContainer {
  playerId @0 :Int32;
  dropId @1 :Int32;
  open @2 :Int32;
}

struct Door {
  name @0 :Text;
  yPos @1 :Float32;
  xPos @2 :Float32;
  zPos @3 :Float32;
  heading @4 :Float32;
  incline @5 :Int32;
  size @6 :Int32;
  doorId @7 :Int32;
  opentype @8 :Int32;
  stateAtSpawn @9 :Int32;
  invertState @10 :Int32;
  doorParam @11 :Int32;
}

struct DoorSpawns {
  count @0 :Int32;
  doors @1 :List(Door);
}

struct ClickDoor {
  doorid @0 :Int32;
  picklockskill @1 :Int32;
  itemId @2 :Int32;
  playerId @3 :Int32;
}

struct MoveDoor {
  doorid @0 :Int32;
  action @1 :Int32;
}


struct BecomeNPC {
  id @0 :Int32;
  maxlevel @1 :Int32;
}

struct Underworld {
  speed @0 :Float32;
  y @1 :Float32;
  x @2 :Float32;
  z @3 :Float32;
}

struct Resurrect {
  zoneId @0 :Int32;
  instanceId @1 :Int32;
  y @2 :Float32;
  x @3 :Float32;
  z @4 :Float32;
  yourName @5 :Text;
  rezzerName @6 :Text;
  spellid @7 :Int32;
  corpseName @8 :Text;
  action @9 :Int32;
}

struct SetRunMode {
  mode @0 :Int32;
}

struct EnvDamage2 {
  id @0 :Int32;
  damage @1 :Int32;
  dmgtype @2 :Int32;
  constant @3 :Int32;
}

struct BazaarWindowStart {
  action @0 :Int32;
}

struct BazaarWelcome {
  beginning @0 :BazaarWindowStart;
  traders @1 :Int32;
  items @2 :Int32;
}

struct BazaarSearch {
  beginning @0 :BazaarWindowStart;
  traderid @1 :Int32;
  charClass @2 :Int32;
  race @3 :Int32;
  stat @4 :Int32;
  slot @5 :Int32;
  type @6 :Int32;
  name @7 :Text;
  minprice @8 :Int32;
  maxprice @9 :Int32;
  minlevel @10 :Int32;
  maxlevel @11 :Int32;
}

struct BazaarInspect {
  itemId @0 :Int32;
  name @1 :Text;
}

struct BazaarReturnDone {
  type @0 :Int32;
  traderid @1 :Int32;
}

struct BazaarSearchResults {
  beginning @0 :BazaarWindowStart;
  sellerId @1 :Int32;
  numItems @2 :Int32;
  serialNumber @3 :Int32;
  itemName @4 :Text;
  cost @5 :Int32;
  itemStat @6 :Int32;
}

struct ServerSideFilters {
  clientattackfilters @0 :Int32;
  npcattackfilters @1 :Int32;
  clientcastfilters @2 :Int32;
  npccastfilters @3 :Int32;
}

struct ItemViewRequest {
  itemId @0 :Int32;
  augments @1 :List(Int32);
  linkHash @2 :Int32;
}


struct PickPocket {
  to @0 :Int32;
  from @1 :Int32;
  myskill @2 :Int32;
  type @3 :Int32;
  coin @4 :Int32;
  lastsix @5 :List(Int32);
}

struct ActionPickPocket {
  to @0 :Int32;
  from @1 :Int32;
  myskill @2 :Int32;
  type @3 :Int32;
  coin @4 :Int32;
  itemname @5 :Text;
}

struct LogServer {
  worldshortname @0 :Text;
}


struct ClientError {
  type @0 :Text;
  characterName @1 :Text;
  message @2 :Text;
}

struct MobHealth {
  hp @0 :Int32;
  id @1 :Int32;
}

struct Track {
  entityid @0 :Int32;
  distance @1 :Float32;
}

struct TrackTarget {
  entityid @0 :Int32;
}

struct Tracking {
  count @0 :Int32;
  entries @1 :List(Track);
}

struct ZoneServerInfo {
  ip @0 :Text;
  port @1 :Int32;
}

struct WhoAllPlayer {
  formatstring @0 :Int32;
  pidstring @1 :Int32;
  name @2 :Text;
  rankstring @3 :Int32;
  guild @4 :Text;
  zonestring @5 :Int32;
  zone @6 :Int32;
  charClass @7 :Int32;
  level @8 :Int32;
  race @9 :Int32;
  account @10 :Text;
}

struct WhoAllReturn {
  id @0 :Int32;
  playerineqstring @1 :Int32;
  line @2 :Text;
  playersinzonestring @3 :Int32;
  count @4 :Int32;
  player @5 :List(WhoAllPlayer);
}

struct Trader {
  code @0 :Int32;
  itemid @1 :List(Int32);
  itemcost @2 :List(Int32);
}

struct ClickTrader {
  code @0 :Int32;
  itemcost @1 :List(Int32);
}

struct GetItems {
  items @0 :List(Int32);
}

struct BecomeTrader {
  id @0 :Int32;
  code @1 :Int32;
}

struct TraderShowItems {
  code @0 :Int32;
  traderId @1 :Int32;
}

struct TraderBuy {
  action @0 :Int32;
  price @1 :Int32;
  traderId @2 :Int32;
  itemName @3 :Text;
  itemId @4 :Int32;
  alreadySold @5 :Int32;
  quantity @6 :Int32;
}

struct TraderItemUpdate {
  traderid @0 :Int32;
  fromslot @1 :Int32;
  toslot @2 :Int32;
  charges @3 :Int32;
}

struct MoneyUpdate {
  platinum @0 :Int32;
  gold @1 :Int32;
  silver @2 :Int32;
  copper @3 :Int32;
}

struct TraderDelItem {
  slotid @0 :Int32;
  quantity @1 :Int32;
}

struct TraderClick {
  traderid @0 :Int32;
  approval @1 :Int32;
}

struct FormattedMessage {
  stringId @0 :Int32;
  type @1 :Int32;
  message @2 :Text;
}

struct SimpleMessage {
  stringId @0 :Int32;
  color @1 :Int32;
}

struct GuildMemberEntry {
  name @0 :Text;
  level @1 :Int32;
  banker @2 :Int32;
  charClass @3 :Int32;
  rank @4 :Int32;
  timeLastOn @5 :Int32;
  tributeEnable @6 :Int32;
  totalTribute @7 :Int32;
  lastTribute @8 :Int32;
  publicNote @9 :Text;
  zoneinstance @10 :Int32;
  zoneId @11 :Int32;
}

struct GuildMembers {
  playerName @0 :Text;
  count @1 :Int32;
  member @2 :List(GuildMemberEntry);
}

struct GuildMOTD {
  name @0 :Text;
  setbyName @1 :Text;
  motd @2 :Text;
}

struct GuildUpdatePublicNote {
  name @0 :Text;
  target @1 :Text;
  note @2 :Text;
}

struct GuildDemote {
  name @0 :Text;
  target @1 :Text;
}

struct GuildRemove {
  target @0 :Text;
  name @1 :Text;
  leaderstatus @2 :Int32;
}

struct GuildMakeLeader {
  name @0 :Text;
  target @1 :Text;
}

struct MakePet {
  level @0 :Int32;
  charClass @1 :Int32;
  race @2 :Int32;
  texture @3 :Int32;
  pettype @4 :Int32;
  size @5 :Float32;
  type @6 :Int32;
  minDmg @7 :Int32;
  maxDmg @8 :Int32;
}

struct GroundSpawn {
  maxX @0 :Float32;
  maxY @1 :Float32;
  minX @2 :Float32;
  minY @3 :Float32;
  maxZ @4 :Float32;
  heading @5 :Float32;
  name @6 :Text;
  item @7 :Int32;
  maxAllowed @8 :Int32;
  respawntimer @9 :Int32;
}

struct GroundSpawns {
  spawn @0 :List(GroundSpawn);
}

struct ApproveZone {
  name @0 :Text;
  zoneid @1 :Int32;
  approve @2 :Int32;
}

struct ZoneInSendName {
  name @0 :Text;
  name2 @1 :Text;
}

struct ZoneInSendName2 {
  name @0 :Text;
}

struct StartTribute {
  clientId @0 :Int32;
  tributeMasterId @1 :Int32;
  response @2 :Int32;
}

struct TributeLevel {
  level @0 :Int32;
  tributeItemId @1 :Int32;
  cost @2 :Int32;
}

struct TributeAbility {
  tributeId @0 :Int32;
  tierCount @1 :Int32;
  tiers @2 :List(TributeLevel);
  name @3 :Text;
}

struct GuildTributeAbility {
  guildId @0 :Int32;
  ability @1 :TributeAbility;
}

struct SelectTributeReq {
  clientId @0 :Int32;
  tributeId @1 :Int32;
}

struct SelectTributeReply {
  clientId @0 :Int32;
  tributeId @1 :Int32;
  desc @2 :Text;
}

struct TributeInfo {
  active @0 :Int32;
  tributes @1 :List(Int32);
  tiers @2 :List(Int32);
  tributeMasterId @3 :Int32;
}

struct TributeItem {
  slot @0 :Int32;
  quantity @1 :Int32;
  tributeMasterId @2 :Int32;
  tributePoints @3 :Int32;
}

struct TributePoint {
  tributePoints @0 :Int32;
  careerTributePoints @1 :Int32;
}

struct TributeMoney {
  platinum @0 :Int32;
  tributeMasterId @1 :Int32;
  tributePoints @2 :Int32;
}

struct Split {
  platinum @0 :Int32;
  gold @1 :Int32;
  silver @2 :Int32;
  copper @3 :Int32;
}

struct NewCombine {
  containerSlot @0 :Int32;
  guildtributeSlot @1 :Int32;
}

struct TradeskillFavorites {
  objectType @0 :Int32;
  someId @1 :Int32;
  favoriteRecipes @2 :List(Int32);
}

struct RecipesSearch {
  objectType @0 :Int32;
  someId @1 :Int32;
  mintrivial @2 :Int32;
  maxtrivial @3 :Int32;
  query @4 :Text;
}

struct RecipeReply {
  objectType @0 :Int32;
  someId @1 :Int32;
  componentCount @2 :Int32;
  recipeId @3 :Int32;
  trivial @4 :Int32;
  recipeName @5 :Text;
}

struct RecipeAutoCombine {
  objectType @0 :Int32;
  someId @1 :Int32;
  recipeId @2 :Int32;
  replyCode @3 :Int32;
}

struct LevelAppearance {
  spawnId @0 :Int32;
  parm1 @1 :Int32;
  value1a @2 :Int32;
  value1b @3 :Int32;
  parm2 @4 :Int32;
  value2a @5 :Int32;
  value2b @6 :Int32;
  parm3 @7 :Int32;
  value3a @8 :Int32;
  value3b @9 :Int32;
  parm4 @10 :Int32;
  value4a @11 :Int32;
  value4b @12 :Int32;
  parm5 @13 :Int32;
  value5a @14 :Int32;
  value5b @15 :Int32;
}

struct MerchantList {
  id @0 :Int32;
  slot @1 :Int32;
  item @2 :Int32;
}

struct TempMerchantList {
  npcid @0 :Int32;
  slot @1 :Int32;
  item @2 :Int32;
  charges @3 :Int32;
  origslot @4 :Int32;
}

struct FindPersonPoint {
  y @0 :Float32;
  x @1 :Float32;
  z @2 :Float32;
}

struct FindPersonRequest {
  npcId @0 :Int32;
  clientPos @1 :Int32;
}

struct FindPersonResult {
  dest @0 :Int32;
  path @1 :List(Int32);
}

struct MobRename {
  oldName @0 :Text;
  oldNameAgain @1 :Text;
  newName @2 :Text;
}

struct PlayMP3 {
  filename @0 :Text;
}

struct TitleEntry {
  skillId @0 :Int32;
  skillValue @1 :Int32;
  title @2 :Text;
}

struct Titles {
  count @0 :Int32;
  titles @1 :List(TitleEntry);
}

struct TitleListEntry {
  prefix @0 :Text;
  postfix @1 :Text;
}

struct TitleList {
  count @0 :Int32;
  titles @1 :List(TitleListEntry);
}

struct SetTitle {
  isSuffix @0 :Int32;
  titleId @1 :Int32;
}

struct SetTitleReply {
  isSuffix @0 :Int32;
  title @1 :Text;
  entityId @2 :Int32;
}

struct TaskDescription {
  activityCount @0 :Int32;
  taskid @1 :Int32;
  unk @2 :Int32;
  id @3 :Int32;
  name @4 :Text;
  desc @5 :Text;
  rewardCount @6 :Int32;
  rewardLink @7 :Text;
}

struct TaskMemberList {
  gopherId @0 :Int32;
  memberCount @1 :Int32;
  listPointer @2 :Text;
}

struct TaskActivity {
  activityCount @0 :Int32;
  id @1 :Int32;
  taskid @2 :Int32;
  activityId @3 :Int32;
  activityType @4 :Int32;
  mobName @5 :Text;
  itemName @6 :Text;
  goalCount @7 :Int32;
  activityName @8 :Text;
  doneCount @9 :Int32;
}

struct TaskHistoryEntry {
  taskId @0 :Int32;
  name @1 :Text;
  completedTime @2 :Int32;
}

struct TaskHistory {
  count @0 :Int32;
  entries @1 :List(TaskHistoryEntry);
}

struct AcceptNewTask {
  taskId @0 :Int32;
  taskMasterId @1 :Int32;
}


struct AvaliableTask {
  taskIndex @0 :Int32;
  taskMasterId @1 :Int32;
  taskId @2 :Int32;
  activityCount @3 :Int32;
  desc @4 :Text;
  rewardPlatinum @5 :Int32;
  rewardGold @6 :Int32;
  rewardSilver @7 :Int32;
  rewardCopper @8 :Int32;
  someName @9 :Text;
}

struct BankerChange {
  platinum @0 :Int32;
  gold @1 :Int32;
  silver @2 :Int32;
  copper @3 :Int32;
  platinumBank @4 :Int32;
  goldBank @5 :Int32;
  silverBank @6 :Int32;
  copperBank @7 :Int32;
}

struct LeadershipExpUpdate {
  groupLeadershipExp @0 :Float64;
  groupLeadershipPoints @1 :Int32;
  raidLeadershipExp @2 :Float64;
  raidLeadershipPoints @3 :Int32;
}

struct UpdateLeadershipAA {
  abilityId @0 :Int32;
  newRank @1 :Int32;
  pointsleft @2 :Int32;
}

struct LeadExpUpdate {
  groupLeadershipExp @0 :Int32;
  groupLeadershipPoints @1 :Int32;
  raidLeadershipExp @2 :Int32;
  raidLeadershipPoints @3 :Int32;
}

struct RaidGeneral {
  action @0 :Int32;
  playerName @1 :Text;
  leaderName @2 :Text;
  parameter @3 :Int32;
}

struct RaidAddMember {
  raidGen @0 :RaidGeneral;
  charClass @1 :Int32;
  level @2 :Int32;
  isGroupLeader @3 :Int32;
}

struct RaidNote {
  general @0 :RaidGeneral;
  note @1 :Text;
}

struct RaidMOTD {
  general @0 :RaidGeneral;
  motd @1 :Text;
}

struct RaidLeadershipUpdate {
  action @0 :Int32;
  playerName @1 :Text;
  leaderName @2 :Text;
  group @3 :GroupLeadershipAA;
  raid @4 :RaidLeadershipAA;
}

struct RaidCreate {
  action @0 :Int32;
  leaderName @1 :Text;
  leaderId @2 :Int32;
}

struct RaidMemberInfo {
  groupNumber @0 :Int32;
  memberName @1 :Text;
  charClass @2 :Int32;
  level @3 :Int32;
  isRaidLeader @4 :Int32;
  isGroupLeader @5 :Int32;
  mainTank @6 :Int32;
}

struct RaidDetails {
  action @0 :Int32;
  leaderName @1 :Text;
  abilities @2 :LeadershipAA;
  leaderId @3 :Int32;
}

struct RaidMembers {
  details @0 :RaidDetails;
  memberCount @1 :Int32;
  members @2 :List(RaidMemberInfo);
  empty @3 :RaidMemberInfo;
}

struct DynamicWall {
  name @0 :Text;
  y @1 :Float32;
  x @2 :Float32;
  z @3 :Float32;
  oneHundred @4 :Int32;
}

struct BandolierCreate {
  action @0 :Int32;
  number @1 :Int32;
  name @2 :Text;
}

struct BandolierDelete {
  action @0 :Int32;
  number @1 :Int32;
}

struct BandolierSet {
  action @0 :Int32;
  number @1 :Int32;
}

struct Arrow {
  type @0 :Int32;
  srcY @1 :Float32;
  srcX @2 :Float32;
  srcZ @3 :Float32;
  velocity @4 :Float32;
  launchAngle @5 :Float32;
  tilt @6 :Float32;
  arc @7 :Float32;
  sourceId @8 :Int32;
  targetId @9 :Int32;
  itemId @10 :Int32;
  modelName @11 :Text;
}

struct Consent {
  name @0 :Text;
}

struct AdventureMerchant {
  entityId @0 :Int32;
}

struct GMtoggle {
  toggle @0 :Int32;
}

struct GroupInvite {
  inviteeName @0 :Text;
  inviterName @1 :Text;
}

struct ColoredText {
  color @0 :Int32;
  msg @1 :Text;
}

struct UseAA {
  begin @0 :Int32;
  ability @1 :Int32;
  end @2 :Int32;
}

struct AAAbility {
  skillId @0 :Int32;
  baseValue @1 :Int32;
  limitValue @2 :Int32;
  slot @3 :Int32;
}

struct SendAA {
  id @0 :Int32;
  hotkeySid @1 :Int32;
  hotkeySid2 @2 :Int32;
  titleSid @3 :Int32;
  descSid @4 :Int32;
  classType @5 :Int32;
  cost @6 :Int32;
  seq @7 :Int32;
  currentLevel @8 :Int32;
  prereqSkill @9 :Int32;
  prereqMinpoints @10 :Int32;
  type @11 :Int32;
  spellid @12 :Int32;
  spellType @13 :Int32;
  spellRefresh @14 :Int32;
  classes @15 :Int32;
  maxLevel @16 :Int32;
  lastId @17 :Int32;
  nextId @18 :Int32;
  cost2 @19 :Int32;
  count @20 :Int32;
  abilities @21 :List(AAAbility);
}

struct AAList {
  count @0 :Int32;
  aa @1 :List(SendAA);
}

struct AAAction {
  action @0 :Int32;
  ability @1 :Int32;
  targetId @2 :Int32;
  expValue @3 :Int32;
}

struct AAExpUpdate {
  aapointsUnspent @0 :Int32;
  aaxpPercent @1 :Int32;
}

struct AltAdvStats {
  experience @0 :Int32;
  unspent @1 :Int32;
  percentage @2 :Int32;
}

struct PlayerAA {
  aaList @0 :List(AAArray);
}

struct AATable {
  aaList @0 :List(AAArray);
}

struct Weather {
  val @0 :Int32;
  type @1 :Int32;
  mode @2 :Int32;
}

struct LoadSpellSet {
  spell @0 :List(Int32);
}

struct ApplyPoison {
  inventorySlot @0 :Int32;
  success @1 :Int32;
}

struct GuildMemberUpdate {
  guildId @0 :Int32;
  memberName @1 :Text;
  zoneId @2 :Int32;
  instanceId @3 :Int32;
}

struct VeteranRewardItem {
  itemId @0 :Int32;
  itemName @1 :Text;
}

struct VeteranReward {
  claimId @0 :Int32;
  item @1 :VeteranRewardItem;
}

struct ExpeditionInvite {
  clientId @0 :Int32;
  inviterName @1 :Text;
  expeditionName @2 :Text;
  swapping @3 :Int32;
  swapName @4 :Text;
  padding @5 :List(Int32);
  dzZoneId @6 :Int32;
  dzInstanceId @7 :Int32;
}

struct ExpeditionInviteResponse {
  dzZoneId @0 :Int32;
  dzInstanceId @1 :Int32;
  accepted @2 :Int32;
  swapping @3 :Int32;
  swapName @4 :Text;
}

struct DynamicZoneInfo {
  clientId @0 :Int32;
  assigned @1 :Int32;
  maxPlayers @2 :Int32;
  dzName @3 :Text;
  leaderName @4 :Text;
}

struct DynamicZoneMemberEntry {
  name @0 :Text;
  onlineStatus @1 :Int32;
}

struct DynamicZoneMemberList {
  clientId @0 :Int32;
  count @1 :Int32;
  members @2 :List(DynamicZoneMemberEntry);
}

struct DynamicZoneMemberListName {
  clientId @0 :Int32;
  addName @1 :Int32;
  name @2 :Text;
}

struct ExpeditionLockoutTimerEntry {
  expeditionName @0 :Text;
  secondsRemaining @1 :Int32;
  eventType @2 :Int32;
  eventName @3 :Text;
}

struct ExpeditionLockoutTimers {
  clientId @0 :Int32;
  count @1 :Int32;
  timers @2 :List(ExpeditionLockoutTimerEntry);
}

struct DynamicZoneLeaderName {
  clientId @0 :Int32;
  leaderName @1 :Text;
}

struct ExpeditionCommand {
  name @0 :Text;
}

struct ExpeditionCommandSwap {
  addPlayerName @0 :Text;
  remPlayerName @1 :Text;
}

struct ExpeditionExpireWarning {
  clientId @0 :Int32;
  minutesRemaining @1 :Int32;
}

struct DynamicZoneCompassEntry {
  dzZoneId @0 :Int32;
  dzInstanceId @1 :Int32;
  dzType @2 :Int32;
  dzSwitchId @3 :Int32;
  y @4 :Float32;
  x @5 :Float32;
  z @6 :Float32;
}

struct DynamicZoneCompass {
  clientId @0 :Int32;
  count @1 :Int32;
  entries @2 :List(DynamicZoneCompassEntry);
}

struct DynamicZoneChooseZoneEntry {
  dzZoneId @0 :Int32;
  dzInstanceId @1 :Int32;
  dzType @2 :Int32;
  description @3 :Text;
  leaderName @4 :Text;
}

struct DynamicZoneChooseZone {
  clientId @0 :Int32;
  count @1 :Int32;
  choices @2 :List(DynamicZoneChooseZoneEntry);
}

struct DynamicZoneChooseZoneReply {
  dzZoneId @0 :Int32;
  dzInstanceId @1 :Int32;
  dzType @2 :Int32;
}

struct LFGuildSearchPlayer {
  command @0 :Int32;
  fromLevel @1 :Int32;
  toLevel @2 :Int32;
  minAa @3 :Int32;
  timeZone @4 :Int32;
  classes @5 :Int32;
}

struct LFGuildSearchGuild {
  command @0 :Int32;
  level @1 :Int32;
  aaPoints @2 :Int32;
  timeZone @3 :Int32;
  charClass @4 :Int32;
}

struct LFGuildPlayertoggle {
  command @0 :Int32;
  comment @1 :Text;
  timeZone @2 :Int32;
  toggle @3 :Int32;
  expires @4 :Int32;
}

struct LFGuildGuildtoggle {
  command @0 :Int32;
  comment @1 :Text;
  fromLevel @2 :Int32;
  toLevel @3 :Int32;
  classes @4 :Int32;
  aaCount @5 :Int32;
  timeZone @6 :Int32;
  toggle @7 :Int32;
  expires @8 :Int32;
  name @9 :Text;
}

struct SayLinkBodyFrame {
  actionId @0 :Text;
  itemId @1 :Text;
  augment1 @2 :Text;
  augment2 @3 :Text;
  augment3 @4 :Text;
  augment4 @5 :Text;
  augment5 @6 :Text;
  isEvolving @7 :Text;
  evolveGroup @8 :Text;
  evolveLevel @9 :Text;
  hash @10 :Text;
}

struct WebLogin {
  username @0 :Text;
  password @1 :Text;
}

struct WebLoginServerRequest {
  sequence @0 :Int32;
}

struct WebLoginReply {
  key @0 :Text;
  errorStrId @1 :Int32;
  failedAttempts @2 :Int32;
  lsid @3 :Int32;
  success @4 :Bool;
  showPlayerCount @5 :Bool;
}

struct WebLoginWorldServer {
  buffer @0 :Text;
  ip @1 :Text;
  longName @2 :Text;
  countryCode @3 :Text;
  languageCode @4 :Text;
  serverType @5 :Int32;
  serverId @6 :Int32;
  status @7 :Int32;
  playersOnline @8 :Int32;
}

struct WebLoginServerResponse {
  serverCount @0 :Int32;
  servers @1 :List(WebLoginWorldServer);
}

struct WebPlayEverquestRequest {
  serverId @0 :Int32;
}

struct WebPlayEverquestResponse {
  serverId @0 :Int32;
  success @1 :Bool;
  errorStrId @2 :Int32;
}

struct WebSession {
  remoteAddr @0 :Text;
  remoteIp @1 :Int32;
  remotePort @2 :Int32;
}

struct Int {
  value @0 :Int32;
}

struct Bool {
  value @0 :Bool;
}

struct String {
  value @0 :Text;
}
