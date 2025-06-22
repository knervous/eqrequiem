@0x9a7b8c6d5e4f3456;  # Unique schema ID

using Go = import "go.capnp";  # Import go.capnp for Go annotations
$Go.package("net");         # Go package name
$Go.import("github.com/knervous/eqgo/internal/api/capnp");  # Go import path
struct ZoneChange {
  charName    @0 :Text;
  zoneId      @1 :Int32;
  instanceId  @2 :Int32;
  y           @3 :Float32;
  x           @4 :Float32;
  z           @5 :Float32;
  zoneReason  @6 :Int32;
  success     @7 :Int32;
}

struct NewZone {
  charName           @0  :Text;
  shortName          @1  :Text;
  longName           @2  :Text;
  ztype              @3  :Int32;
  fogRed             @4  :List(Int32);
  fogGreen           @5  :List(Int32);
  fogBlue            @6  :List(Int32);
  fogMinclip         @7  :List(Float32);
  fogMaxclip         @8  :List(Float32);
  gravity            @9  :Float32;
  timeType           @10 :Int32;
  rainChance         @11 :List(Int32);
  rainDuration       @12 :List(Int32);
  snowChance         @13 :List(Int32);
  snowDuration       @14 :List(Int32);
  sky                @15 :Int32;
  zoneExpMultiplier  @16 :Float32;
  safeY              @17 :Float32;
  safeX              @18 :Float32;
  safeZ              @19 :Float32;
  maxZ               @20 :Float32;
  underworld         @21 :Float32;
  minclip            @22 :Float32;
  maxclip            @23 :Float32;
  zoneShortName2     @24 :Text;
  zoneIdNumber       @25 :Int32;
  zoneInstance       @26 :Int32;
  zonePoints         @27 :List(ZonePoint);
}

enum ZoneChangeType {
  fromWorld @0;
  fromZone  @1;
}

struct RequestClientZoneChange {
  zoneId     @0 :Int32;
  instanceId @1 :Int32;
  y          @2 :Float32;
  x          @3 :Float32;
  z          @4 :Float32;
  heading    @5 :Float32;
  type       @6 :ZoneChangeType;
}

struct ZonePoint {
  iterator     @0 :Int32;
  x            @1 :Float32;
  y            @2 :Float32;
  z            @3 :Float32;
  heading      @4 :Float32;
  zoneId       @5 :Int32;
  zoneInstance @6 :Int32;
  number       @7 :Int32;
  targetX     @8 :Float32;
  targetY     @9 :Float32;
  targetZ     @10 :Float32;
}

struct ZoneSession {
  zoneId     @0 :Int32;
  instanceId @1 :Int32;
}
