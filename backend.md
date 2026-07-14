The following is a playbook on a proof of concept of migrating the existing backend under server which is a go backend with webtransport/mysql to nodejs. Here are some starter bullet points

Folder: serverjs

Node.js backend

One worker thread per zone; authoritative, single-writer tick loop.

Keep the tick loop non-blocking (no await in hot handlers).

Network

Fails WebTransport for client transport (single public port; zones behind workers).

Navigation

Navcat.

Single shared pathfinding worker across all zones:

Load meshes on-demand (LRU if needed)

Fair scheduling (per-zone queues + round-robin/weights)

Path caching keyed by (zoneId, startPoly, endPoly, agentType).

DB

MySQL with two DBs: content + runtime.

Content is read-mostly in prod; consider version pinning (content release tag) and optionally build MMF snapshots for the largest read-hot tables.

DB access + schema

Drizzle:

First-gen TS schema via introspection from existing DB

Then TS-first schema+migrations going forward.

Under the hood, Node MySQL driver choice is effectively solved by Drizzle; if you need raw driver work, mysql2 is the baseline.

Persistence pattern

Zone handlers: validate → reserve/lock → enqueue persist command → return.

Persist worker: executes DB transaction + returns (txnId, status, reason?).

Zone tick: drains persist responses queue → finalize/rollback → emit packets.

Use pending txn maps + deterministic dedupe keys (loot/trade/etc.) + timeouts.

Replication / interest management

Prefer per-client AOI + priority scheduling + byte budgets over global distance buckets.

Tooling

“Libra” (EQ Sage v2) as the web editor layer:

Custom UI + generated CRUD endpoints from Drizzle metadata.


1) Process model and zone loop

One WorkerThread per zone instance

Single-writer authoritative state: all entity state mutations occur in that worker.

Main thread handles accept/handshake and routes messages to zone workers (or a separate “gateway” worker if you prefer).

Tick loop

Fixed tick (e.g. 10–20 Hz) with a per-tick work budget (avoid spiral of death).

Tick phases (suggested order):

Drain inbound messages (client packets/events)

Apply queued simulation events

Run sim step (movement/combat/AI hooks)

Drain persist results (finalize/rollback)

Build replication deltas with per-client budgets

Flush outbound sends

Rule: no await / blocking I/O inside the tick phase. Anything I/O becomes an async request → response queue.

2) Networking: Fails WebTransport

Single public port; terminate WebTransport in the main server process.

Session routing:

sessionId → zoneId mapping in main thread (or shared state) to forward packets to correct zone worker.

Zone worker emits outbound packets → main thread → WebTransport send.

Keep per-session scratch buffers / pooling where possible; assume final QUIC layer copies at some stage.

3) Navigation: Navcat as a service

Dedicated pathfinding worker (single instance for the box)

Owns navmeshes and path caches.

Zone workers never call pathfinding synchronously.

Navmesh loading

Load on demand by zoneId.

LRU cache of loaded meshes if memory becomes an issue.

Scheduling / fairness

Maintain queue[zoneId].

Weighted round-robin across zones per “service tick”.

Per-zone budget: cap requests/sec and max in-flight.

Coalesce per-NPC: keep only latest goal; cancel/replace older.

Path caching

Key: (zoneId, startPoly, endPoly, agentType) → corridor/points.

TTL + LRU; cache “no path” results briefly too.

Replan policy

Don’t replan per tick.

Replan on: stuck timer, target moved beyond threshold/poly change, corridor invalidation, or periodic refresh (0.5–2s for chasing).

Zone behavior while waiting:

Follow existing corridor; otherwise use short “steer to goal” fallback with collision checks; do not block zone.

4) Database: MySQL split into content + runtime

Two separate DBs:

content_db (read-mostly config/content data)

runtime_db (OLTP for character/session/inventory state)

Content DB operational model

Release tags for content publishes (no DB branching assumptions).

Shard/zone config pins a specific content release identifier.

Content IDs are immutable contracts: no reuse, no renumbering; prefer soft-deletes.

Runtime DB model

Transactions for inventory/currency/quest progress/etc.

No runtime branch swapping.

5) ORM and schema: Drizzle + TS-first

Bootstrap:

Introspect existing schema → generate initial schema.ts for runtime + content.

Then:

TS schema becomes canonical.

Generate migrations from TS; apply migrations in CI and deploy pipeline.

Code structure:

packages/db-runtime and packages/db-content (separate connection factories + schema entrypoints).

Enforce access separation by using different DB users/creds (game server content read-only).

6) Persistence architecture (no blocking tick)

Persist worker (or small pool) for runtime DB writes/reads that must not block zone.

Zone handler pattern:

validate → reserve/lock → enqueue PersistCommand → return

Persist response handling:

Persist worker posts PersistResult back.

Zone worker enqueues results into a local queue.

Tick phase drains results and runs finalize/rollback.

Command/result shapes

PersistCommand (structured, not raw SQL):

txnId, op, key, charIds, mutations[], preconditions[]

PersistResult:

(txnId, statusEnum, reasonCode?)

Status enums: OK / CONFLICT / RETRYABLE_FAIL / FATAL_FAIL / NOT_FOUND / TIMEOUT

Idempotency + dedupe

Zone-local pendingByKey + pendingById maps:

Deterministic keys (examples):

loot:<corpseId>:<lootEntryId>

trade:<tradeSessionId>:commit

inv:<charId>:<itemInstanceId>

If duplicate request arrives while pending:

soft no-op (“already processing”) for same actor

immediate reject for competing actor if already reserved

Timeouts:

pending txns have deadlines; on timeout rollback reservation and notify.

Trade & loot safety

Reserve resources in memory:

lock item instances/slots; hold currency; mark loot entries reserved

no “benefit” actions until finalize (cannot equip/sell/consume pending items)

DB transaction uses preconditions:

optimistic version checks or WHERE owner/slot/version=expected

optionally a pending_txn table for crash recovery/auditing

7) Replication / AOI

Replace bucket cadence with client-centric AOI + priority scheduling

Spatial index: uniform grid (simple, fast).

Per client:

Maintain AOI set via grid query.

Priority score = distance tier + “important now” flags + time since last update.

Send until per-client byte budget (and entity cap) per tick.

Multi-rate updates via tiers (near/mid/far) implemented as per-entity per-client next-send timestamps, not global buckets.

8) Tooling: Libra (EQ Sage v2)

Goal: web editor/admin + debug tooling for both DBs + content build pipeline.

Path:

Custom Libra: use shared Drizzle connectors + generated schema metadata to auto-build CRUD screens and domain-specific editors.

Must-have features:

Content branch/commit selection and diff/preview

“Publish content” flow: pin commit → (optional) build MMF snapshots → deploy metadata

Validation rules (no orphan IDs, loot probability sums, spawn constraints)

9) POC migration plan (Go → Node)

Start with:

Session + handshake + minimal opcode routing

Zone worker skeleton tick loop with inbound/outbound queues

Runtime persistence worker with one or two ops (login load, inventory move)

Nav worker stub returning trivial paths

Then:

Implement loot/trade pending txn pipeline end-to-end

Implement AOI replication budgets

Replace nav stub with Navcat + fairness scheduler
