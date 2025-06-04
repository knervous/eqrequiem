module github.com/knervous/eqgo

go 1.24.2

require (
	capnproto.org/go/capnp/v3 v3.1.0-alpha.1
	github.com/arl/go-detour v0.1.3
	github.com/dgraph-io/ristretto/v2 v2.2.0
	github.com/edsrzf/mmap-go v1.2.0
	github.com/fsnotify/fsnotify v1.9.0
	github.com/go-jet/jet/v2 v2.13.0
	github.com/go-sql-driver/mysql v1.9.2
	github.com/golang-jwt/jwt/v5 v5.2.2
	github.com/google/uuid v1.6.0
	github.com/quic-go/quic-go v0.43.0
	github.com/quic-go/webtransport-go v0.8.0
	github.com/sevlyar/go-daemon v0.1.6
	github.com/traefik/yaegi v0.16.1
)

// replace capnproto.org/go/capnp/v3 => ../../go-capnp

replace capnproto.org/go/capnp/v3 => github.com/knervous/go-capnp/v3 v3.1.1-knervous1

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/arl/assertgo v0.0.0-20180702120748-a1be5afdc871 // indirect
	github.com/arl/gogeo v0.0.0-20200405111831-9d419f5f7a90 // indirect
	github.com/arl/math32 v0.2.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/colega/zeropool v0.0.0-20230505084239-6fb4a4f75381 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/go-task/slim-sprig/v3 v3.0.0 // indirect
	github.com/google/pprof v0.0.0-20250602020802-c6617b811d0e // indirect
	github.com/jackc/pgio v1.0.0 // indirect
	github.com/jackc/pgtype v1.14.4 // indirect
	github.com/kardianos/osext v0.0.0-20190222173326-2bc1f35cddc0 // indirect
	github.com/onsi/ginkgo/v2 v2.23.4 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/quic-go/qpack v0.5.1 // indirect
	github.com/stretchr/testify v1.10.0 // indirect
	go.uber.org/automaxprocs v1.6.0 // indirect
	go.uber.org/mock v0.5.2 // indirect
	golang.org/x/crypto v0.38.0 // indirect
	golang.org/x/exp v0.0.0-20250531010427-b6e5de432a8b // indirect
	golang.org/x/mod v0.24.0 // indirect
	golang.org/x/net v0.40.0 // indirect
	golang.org/x/sync v0.14.0 // indirect
	golang.org/x/sys v0.33.0 // indirect
	golang.org/x/text v0.25.0 // indirect
	golang.org/x/tools v0.33.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
