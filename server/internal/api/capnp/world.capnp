@0x9a7b8c6d5e4f3210;  # Unique schema ID

using Go = import "go.capnp";  # Import go.capnp for Go annotations
$Go.package("net");         # Go package name
$Go.import("github.com/knervous/eqgo/internal/api/capnp");  # Go import path

struct JWTLogin {
  token @0 :Text;
}

struct JWTResponse {
  status @0 :Int32;
}

struct WebInitiateConnection {
  login @0 :Bool;
}

struct EnterWorld {
  name @0 :Text;
  tutorial @1 :Int32;
  returnHome @2 :Int32;
}

struct NameApproval {
  name @0 :Text;
  race @1 :Int32;
  charClass @2 :Int32;
  deity @3 :Int32;
}