# Node Backend Migration Checklist

## 0) Workspace + runtime skeleton
- [x] Create app layout under `serverjs/src` with `gateway`, `world`, `zone`, `db`, `nav`, `persist`, `protocol`, `shared`
- [x] Add strict TypeScript config
- [x] Add lint/test/build/dev/check scripts
- [x] Add env/config loader with validation for ports, DB creds, tick rates, and feature flags
- [x] Add process lifecycle hooks for startup and graceful shutdown

## 1) Networking parity (Go -> Node)
- [x] Stand up Fails WebTransport endpoint `/game` on single public port
- [x] Implement session accept + reconnect (`sid` + IP validation)
- [x] Support datagrams and single control stream per session
- [x] Implement opcode + payload framing compatibility
- [x] Add gateway routing map `sessionId -> zoneWorker`

## 2) Protocol + opcode registry
- [x] Create shared opcode registry matching Go world/zone handlers
- [x] Implement packet decode/encode utilities (little-endian opcode prefix)
- [x] Add handler registries for world and zone routing
- [x] Add unknown-opcode and invalid-frame guards with metrics

## 3) Session + world flow parity
- [x] Implement session manager (create/get/remove/update)
- [x] Port world handlers: login/create/delete/enter/zone-session/zone-change
- [x] Add auth gate for pre-auth packets
- [x] Port character-select and account/IP bookkeeping

## 4) Zone worker model
- [x] Run one WorkerThread per zone instance
- [x] Keep zone mutable state single-writer inside worker
- [x] Implement fixed tick loop (10-20 Hz) with work budget
- [x] Enforce no blocking/await in hot tick phases
- [x] Port baseline zone handlers
- [x] Add controllable zone shard start/stop/status operations through Libra

## 5) Entity + spawn + movement parity
- [ ] Port spawn pool loading and respawn timers
- [ ] Port NPC pathgrid movement and pause logic
- [x] Add client attach/detach lifecycle and zone-instance ownership
- [ ] Port dirty-entity tracking and batched updates
- [x] Send ordered zone/profile/spawn bootstrap on join

## 6) AOI/replication upgrade
- [ ] Build per-client AOI + priority scheduling
- [ ] Add per-client byte budgets and tick caps
- [ ] Add near/mid/far multi-rate sends via next-send timestamps
- [ ] Add distance/importance/staleness scoring
- [ ] Add replication telemetry

## 7) Navigation service
- [ ] Create dedicated shared nav worker
- [ ] Load navmeshes on-demand by zone with LRU eviction
- [ ] Add per-zone queues + weighted round-robin fairness
- [ ] Add path cache `(zoneId,startPoly,endPoly,agentType)` with TTL/LRU
- [ ] Add no-path short cache and replan/cancel policy

## 8) DB split (PostgreSQL + SQLite)
- [x] Stand up separate `game_content` and `game_runtime` database boundaries
- [x] Add a portable driver interface for PostgreSQL and SQLite/OPFS implementations
- [ ] Enforce content read-only credentials in PostgreSQL production deployment
- [ ] Add content release pinning behavior
- [x] Set runtime policy for no live branching semantics

## 9) Canonical schema + migrations
- [x] Hydrate all existing MySQL content/runtime tables into local SQLite
- [x] Verify exact imported table and row counts against MySQL
- [x] Add forward-only portable content/runtime schema migrations
- [x] Promote zones, NPCs, spawns, accounts, characters, positions, and inventory into canonical tables
- [x] Split DB modules into runtime/content packages
- [x] Remove generated legacy MySQL/Drizzle schemas and compatibility runtime paths
- [x] Add migration flow to CI/deploy
- [x] Normalize local defaults to file-backed SQLite with PostgreSQL URL support

## 10) Persistence architecture
- [x] Add persist worker/pool for runtime DB writes
- [ ] Implement `validate -> reserve -> enqueue PersistCommand`
- [ ] Implement result queue + finalize/rollback in zone tick
- [ ] Add deterministic dedupe keys + pending maps + timeouts
- [ ] Add status enums and retry/conflict handling

## 11) Loot/trade/inventory safety
- [x] Port current inventory move/delete path for parity
- [ ] Add lock/reserve layer to prevent dupes
- [ ] Block pending resources from benefit actions
- [ ] Add idempotency keys for loot/trade commit
- [ ] Add crash recovery/audit strategy for pending txns

## 12) Caching and hot data
- [ ] Port core cache layer for read-hot queries
- [ ] Decide items MMF parity vs runtime cache snapshot approach
- [ ] Add cache invalidation rules for mutable runtime entities

## 13) Quests + scripting
- [x] Add deterministic quest event reducer and handler registration
- [x] Support per-zone quest binding inside the owning zone worker
- [x] Add validated JSON quest definitions and dev hot reload
- [x] Prove NPC quest effects through the precompiled AssemblyScript kernel

## 14) Tooling (Libra)
- [x] Choose custom Libra + portable driver CRUD and forward-only migrations
- [x] Remove Directus scaffolding/scripts/config
- [ ] Build content release selection + publish flow
- [ ] Add content validation checks (bootstrap `/libra/validate` checks live)
- [x] Add runtime-safe shard/quest admin operations and a read-only runtime guard + audit log

## 15) Observability + quality gates
- [ ] Add structured logs (`sessionId`, `zoneId`, `txnId`, `opcode`)
- [ ] Add metrics for ticks, queues, budgets, persist/nav latency
- [ ] Add load tests for movement/replication/txn paths
- [ ] Add failure tests (worker crash, DB timeout, reconnect storms)

## 16) Delivery order
- [x] Milestone 1: gateway/session/opcode scaffold + minimal login
- [x] Milestone 2: one zone worker + movement/chat baseline
- [x] Milestone 3: runtime persist worker + login/inventory operations
- [ ] Milestone 4: nav worker stub -> Navcat integration
- [ ] Milestone 5: AOI priority scheduler + byte budgets
- [ ] Milestone 6: loot/trade txn hardening
- [ ] Milestone 7: DB split + Drizzle migrations + tooling
