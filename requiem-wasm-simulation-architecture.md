# Requiem MMO Simulation Architecture

## Wasm, Recast/Detour, SoA, WebGPU, Node.js, and Shado

This document consolidates the proposed architecture for moving Requiem's authoritative MMO simulation into WebAssembly while sharing schemas, memory layouts, and selected kernels between the Node.js backend and browser frontend.

> **Recommendation:** use Wasm as the authoritative simulation runtime, Node.js as the orchestration and networking host, and Shado as the shared schema and memory-ABI compiler. Treat WebGPU as an optional accelerator and rendering consumer rather than the backend authority.

---

## 1. Target architecture

```text
Node.js main thread
    networking
    sessions
    persistence
    packet serialization
    shard and zone lifecycle

        command SharedArrayBuffer ring
                    ↓

Node.js simulation worker
    one Wasm instance per zone or partition
    authoritative entity SoA
    NPC AI
    aggro and threat
    spatial indexing
    navigation
    steering
    movement
    combat timers
    simulation events

                    ↓
        event ring + published snapshots

Node.js main thread
    replication
    persistence effects
    external integrations
```

The live world state should be owned by Wasm inside the simulation worker. Shared memory should be limited to controlled boundaries:

- Incoming command ring.
- Outgoing event ring.
- Double- or triple-buffered replication snapshots.
- Optional diagnostics and profiling buffers.

Do not let Node.js, Wasm, and WebGPU mutate the same live entity arrays concurrently.

---

## 2. Why Wasm is the best fit

The reason for choosing Node.js was code and structure sharing between frontend and backend. Wasm preserves that advantage while providing a stronger execution environment for the hot loop.

The workload is a good fit for Wasm because it contains:

- Recast/Detour-style algorithms.
- Fixed-layout entity arrays.
- Dense movement and perception loops.
- Explicit memory arenas.
- Sparse dirty queues.
- Bounded route-query workspaces.
- SIMD-friendly math.
- No need for garbage collection inside the tick.
- A browser-compatible runtime.

One simulation implementation can support:

```text
Node.js authoritative backend
browser prediction
browser replay
headless tests
debug visualizers
offline benchmarks
optional WebGPU consumers
```

Use coarse Wasm entry points:

```ts
sim.applyCommands(commandRead, commandWrite);
sim.tick(tickId, deltaMs);
sim.publishSnapshot(snapshotIndex);
```

Avoid per-entity calls across the JS/Wasm boundary.

---

## 3. Performance budget

Using a well-optimized native N-API SIMD implementation as `1.0x`:

| Implementation | Dense SoA movement | Mixed AI, aggro, routing | Practical overall |
|---|---:|---:|---:|
| Native N-API SIMD | 1.0x | 1.0x | 1.0x |
| Wasm SIMD | 0.75-1.0x | 0.65-0.9x | 0.7-0.95x |
| Typed-array JavaScript | 0.45-0.85x | 0.25-0.65x | 0.35-0.7x |
| WebGPU | 1-10x for isolated dense kernels | Often worse for branch-heavy AI and A* | Workload-dependent |

These are planning ranges, not measured Requiem numbers. The upper end assumes:

- SoA or AoSoA.
- No allocation during the tick.
- Dense work queues.
- One host call per phase.
- Stable loops.
- Explicit scratch arenas.
- Minimal CPU/GPU transfer.

### Native N-API

Native remains the likely maximum-throughput option because it can use AVX2, AVX-512, NEON, and architecture-specific dispatch. Its disadvantages are packaging, platform-specific builds, and divergence from the browser implementation.

The N-API boundary is negligible if the API is coarse. It becomes expensive only when called per entity or per subsystem.

### Straight JavaScript

Typed-array JavaScript is useful for orchestration and as a reference implementation. Keep it for networking, sessions, persistence, zone lifecycle, coarse scripting, and command/event handling. It is less attractive for the dense movement, spatial, threat, and routing loops.

### WebGPU

WebGPU is strong for:

- Spatial binning.
- Distance and cone tests.
- Bulk neighbor filtering.
- Homogeneous steering passes.
- Movement integration.
- Batched route-field generation.

It is weak for:

- Behavior trees.
- Script-heavy AI.
- Sparse threat tables.
- Highly divergent NPC states.
- Variable-length A*.
- Small irregular route repairs.
- Immediate authoritative CPU decisions.
- Cross-hardware deterministic replay.

Use it only for isolated kernels after profiling.

---

## 4. Simulation ownership

The authoritative world should reside in private Wasm memory inside a simulation worker.

```text
Wasm-owned live state:
    positions
    velocities
    movement state
    AI state
    threat and aggro data
    current targets
    spatial index
    navmesh graph
    route corridors
    Detour node pools
    timers
    dirty queues
    combat state
```

### Node-to-Wasm command ring

Typical commands:

```text
player input
ability input
damage
healing
taunt
spawn
despawn
target change
administrative state change
navmesh invalidation
zone transfer
```

### Wasm-to-Node event ring

Typical events:

```text
combat event
entity death
arrival
route failure
stuck state
zone transfer
replication dirty
script callback
persistence effect
analytics event
```

### Snapshot publication

Use double or triple buffering:

```text
snapshot 0: Wasm writing
snapshot 1: networking reading
snapshot 2: spare or pending
```

Publish with one atomic generation or active-buffer index. Avoid atomics per entity.

---

## 5. Worker and zone model

Start with one simulation worker per independently simulated zone or instance.

```text
worker 0 -> zone A
worker 1 -> zone B
worker 2 -> dungeon instances
worker 3 -> zone C
```

Benefits:

- No locks inside one zone tick.
- Deterministic update order.
- Natural CPU-core scaling.
- Simple ownership.
- Explicit entity transfer between zones.
- Easier profiling and failure isolation.

Do not initially run several workers over the same zone arrays. Only split one overloaded zone after profiling, with explicit phases and barriers.

---

## 6. Entity layout: SoA and AoSoA

Use SoA for authoritative state:

```text
posX[capacity]
posY[capacity]
posZ[capacity]

velX[capacity]
velY[capacity]
velZ[capacity]

currentPoly[capacity]
targetEntity[capacity]
routeId[capacity]
routeCursor[capacity]

aiState[capacity]
movementMode[capacity]
flags[capacity]
```

This improves sequential access, SIMD, filtering, cache use, serialization, and schema sharing.

For selected kernels, use AoSoA blocks matching portable Wasm SIMD width. Wasm SIMD is 128-bit:

```text
4 x f32
4 x i32
8 x i16
16 x i8
```

An AoSoA block width of four maps naturally to `f32x4`. Use it only where profiling proves value; plain SoA is simpler.

---

## 7. Shado's role

Shado should evolve from a render-oriented structure system into a backend-neutral schema and memory-ABI compiler.

```text
shado/schema
    decorators
    schema definitions
    field types
    layout selection
    alignment and offsets
    schema hashes
    code generation

shado/memory
    byte arena
    Wasm memory arena
    shared memory arena
    SoA, AoS, and AoSoA pools
    queues
    bitsets
    free lists

shado/kernel
    AssemblyScript compilation
    precompiled Wasm loading
    kernel bindings
    pointer ABI generation

shado/babylon
    storage buffers
    data textures
    material integration
    rendering synchronization

shado/sim
    entity pools
    command rings
    event rings
    snapshots
    dirty queues
```

The Node.js backend should not import Babylon dependencies.

### Existing strengths

Shado already has several useful pieces:

- Unified arenas.
- Generated AssemblyScript offsets.
- Optional precompiled Wasm.
- Wasm-backed typed-array adoption.
- Raw pointer kernels.
- Active-index queues.
- Changed-index queues.
- Expiration queues.
- Hand-written `v128` SIMD.
- Shared TypeScript/shader schema concepts.

The current `activeIndex[]`, `changedIndex[]`, and `expiration[]` pattern is already close to the right MMO hot-loop architecture.

### Required evolution

Add first-class layout modes:

```ts
layout: "aos"
layout: "soa"
layout: "aosoa"
layout: "net"   // checked fixed-width packet/snapshot records
```

`net` is the transport-facing packed projection. It uses the same byte-addressed scalar
ABI, adds schema/version/hash validation, supports inline whole structs or selected
field projections, and exposes received snapshot payloads without object decoding or
repacking. See `shader-object/AOS-NET-DESIGN.md` for the executable wire contract.

Example:

```ts
@shadoPool({
  name: "WorldEntities",
  layout: "soa",
  capacity: 65536,
})
class WorldEntity {
  @field("f32") posX!: number;
  @field("f32") posY!: number;
  @field("f32") posZ!: number;

  @field("f32") velX!: number;
  @field("f32") velY!: number;
  @field("f32") velZ!: number;

  @field("u32") currentPoly!: number;
  @field("u32") targetEntity!: number;
  @field("u16") routeCursor!: number;
  @field("u8") aiState!: number;
  @field("u8") movementMode!: number;
}
```

Generated views:

```ts
world.posX: Float32Array;
world.currentPoly: Uint32Array;
world.routeCursor: Uint16Array;
world.aiState: Uint8Array;
```

Replace float-only arena assumptions with a byte-addressed arena:

```ts
class ByteArena {
  buffer: ArrayBuffer | SharedArrayBuffer;
  bytes: Uint8Array;
  view: DataView;

  viewF32(offset: number, count: number): Float32Array;
  viewU32(offset: number, count: number): Uint32Array;
  viewU16(offset: number, count: number): Uint16Array;
  viewU8(offset: number, count: number): Uint8Array;
}
```

Suggested layout rules:

```text
f32      align 4, size 4
u32      align 4, size 4
i32      align 4, size 4
u16      align 2, size 2
i16      align 2, size 2
u8       align 1, size 1
i8       align 1, size 1
vec4f    align 16, size 16
```

Generate TypeScript, AssemblyScript, WGSL, optional C/C++ headers, schema hashes, and runtime layout validation.

Expose a small stable ABI:

```text
sim_init
sim_apply_commands
sim_tick
sim_publish_snapshot
sim_get_stats
sim_save
sim_load
```

---

## 8. Recast as a parallel pipeline

Recast's build side can be redesigned as a staged Wasm or WebGPU pipeline. It should not be one kernel.

```text
geometry
-> triangle slope classification
-> tile/cell binning
-> voxel rasterization
-> candidate span emission
-> span sort and merge
-> compact heightfield
-> walkability filtering
-> neighbor connections
-> erosion
-> distance field
-> region construction
-> contour extraction
-> polygonization
-> detail mesh
```

Do not preserve linked span lists. Use CSR-style SoA:

```text
cellOffset[cellCount + 1]
spanMin[spanCount]
spanMax[spanCount]
spanArea[spanCount]
```

Compact representation:

```text
cellOffset[cellCount + 1]
spanY[spanCount]
spanHeight[spanCount]
spanConnections[spanCount]
spanArea[spanCount]
spanDistance[spanCount]
spanRegion[spanCount]
```

Candidate spans:

```text
candidateCell[]
candidateMin[]
candidateMax[]
candidateArea[]
```

Rasterization pipeline:

1. Count or emit candidate spans.
2. Associate each span with a cell.
3. Sort or bucket by cell.
4. Merge overlapping intervals.
5. Prefix-sum surviving counts.
6. Scatter into compact arrays.

GPU suitability:

| Stage | Suitability |
|---|---:|
| Triangle classification | Excellent |
| Tile/cell binning | Excellent |
| Voxel rasterization | Good |
| Span sorting and merging | Good but complex |
| Compact heightfield | Excellent |
| Walkability filtering | Excellent |
| Neighbor generation | Excellent |
| Erosion | Excellent |
| Distance field | Excellent |
| Region generation | Moderate |
| Boundary extraction | Good |
| Contour stitching | Difficult |
| Polygonization | Difficult |
| Detail sampling | Good |

For the backend, prefer offline baking, prebuilt tiles, and event-driven dirty-tile rebuilds. Recast construction is usually not the primary hot loop.

---

## 9. Detour for batched entity routing

Flatten the navmesh into dense arrays:

```text
polyFirstLink[polyCount + 1]
polyCenterX[polyCount]
polyCenterY[polyCount]
polyCenterZ[polyCount]
polyFlags[polyCount]
polyArea[polyCount]

linkTarget[linkCount]
linkEdge[linkCount]
linkCost[linkCount]
```

Portal geometry:

```text
portalLeftX[]
portalLeftY[]
portalLeftZ[]
portalRightX[]
portalRightY[]
portalRightZ[]
```

Entity route state:

```text
entityCurrentPoly[]
entityTargetPoly[]
entityRouteId[]
entityRouteCursor[]
entityRouteState[]
entityRouteClass[]
```

### Shared-destination reverse fields

This is likely the largest routing optimization for MMO NPCs.

```text
nextPoly[fieldId][poly]
distance[fieldId][poly]
```

An NPC route step becomes:

```text
next = nextPoly[fieldId * polyCount + currentPoly]
```

Good shared targets include spawn points, patrol points, exits, vendors, resource nodes, guard posts, encounter anchors, portals, flee points, and rally points.

Key route fields by destination, movement class, faction restrictions, cost profile, and phase/door state.

### Batched bounded A*

For arbitrary targets, use sliced bounded queries with fixed node arenas:

```text
queryStartPoly[]
queryGoalPoly[]
queryStatus[]
queryNodeOffset[]
queryNodeCount[]

nodePoly[]
nodeParent[]
nodeG[]
nodeF[]
nodeState[]
```

Advance each query by a limited number of expansions per tick. This prevents pathfinding spikes.

### Hierarchical routing

For large worlds:

```text
zone
-> region
-> tile
-> polygon corridor
```

Coarse A* should reduce the fine search space before polygon routing.

### Corridor storage

Use CSR:

```text
routeOffset[routeCount + 1]
routePoly[totalRoutePolys]
```

Each entity stores only:

```text
routeId
routeCursor
currentPoly
```

Entities may share immutable routes.

---

## 10. Detour integration options

### Compile Detour C++ to Wasm

This is the fastest path to production capability.

Use:

- A separate Detour Wasm module.
- Shared imported `WebAssembly.Memory` where practical.
- Fixed scratch arenas.
- No general allocation during the tick.
- Dense route-request buffers.

Example flow:

```ts
sim.preRoute(tick);
nav.processRouteBatch(routeRequestPtr, routeRequestCount);
sim.postRoute(tick);
```

A few Wasm calls per tick are negligible.

### Reimplement the runtime query layer in AssemblyScript

Later, implement:

- Flattened graph loading.
- Bounded A*.
- Reverse route fields.
- Corridor maintenance.
- Funnel.
- Local repair.

Recommended order:

1. Bake navmesh offline.
2. Compile Detour runtime to Wasm.
3. Batch route requests.
4. Add shared-destination route fields.
5. Replace selected Detour pieces only when profiling justifies it.

---

## 11. MMO hot loop

The hot loop should consume route state rather than discover routes.

```text
slow/event-driven:
    target changed
    navmesh changed
    corridor invalidated
    entity stuck
    leash changed
    tactical mode changed
        -> enqueue route work

hot tick:
    read next portal or corner
    calculate desired velocity
    query nearby entities
    apply steering and avoidance
    integrate position
    advance corridor cursor
```

Suggested tick:

```text
1. Consume commands.
2. Apply combat and threat events.
3. Build or update spatial bins.
4. Run staggered perception.
5. Update dirty aggro targets.
6. Update dirty AI decisions.
7. Classify navigation requests.
8. Advance bounded route jobs.
9. Advance corridors.
10. Compute desired velocity.
11. Apply avoidance and separation.
12. Integrate movement.
13. Advance combat timers.
14. Produce events.
15. Publish replication snapshot.
```

---

## 12. NPC AI and aggro

Use this pipeline:

```text
perception
-> threat updates
-> target selection
-> behavior decision
-> navigation intent
-> route reuse, repair, or replacement
-> steering
-> movement
```

### Sparse threat storage

```text
npcThreatOffset[npcCount + 1]
threatTarget[threatEntryCount]
threatValue[threatEntryCount]
threatLastEventTick[threatEntryCount]
```

Cache:

```text
npcTarget[]
npcTargetThreat[]
npcTargetRevision[]
```

Threat changes should be event-driven: damage, healing, taunt, proximity, line of sight, decay, script changes, death, and despawn.

### Navigation intent

NPCs should own an intent rather than a point:

```text
targetEntity
targetRevision
targetRegion
lastPlannedRegion
desiredRangeMin
desiredRangeMax
requiresLineOfSight
movementMode
routeState
```

Navigation chooses among:

```text
reuse corridor
adjust endpoint
repair locally
full route
```

### Engagement envelopes

Route to a valid engagement region rather than the target's exact feet.

```text
melee: reachable point in melee range
ranged: preferred range band with line of sight
healer: healing range outside danger
guard: interception or leash-constrained point
flee: point increasing distance from threats
```

This prevents full replanning for small target movements.

### Travel versus combat movement

Travel mode:

```text
coarse region route
polygon corridor
portal/corner following
```

Combat mode:

```text
short local queries
range-band maintenance
line-of-sight positioning
orbiting
flanking
fleeing
hazard avoidance
crowd spacing
```

Near the target, global pathfinding should become rare.

---

## 13. Update cadence and dirty queues

Not every subsystem should run every tick.

```text
20-30 Hz:
    movement integration
    corridor advancement
    nearby separation
    immediate combat transitions

5-10 Hz:
    local corridor repair
    local target tracking
    tactical candidates

2-5 Hz:
    perception
    line-of-sight reevaluation
    threat decay
    behavior scoring

event-driven:
    damage/healing threat
    taunt
    target death
    despawn
    full routes
    navmesh invalidation
    encounter changes
```

Stagger periodic work by entity ID and tick.

Use explicit queues:

```text
perceptionDirty[]
aggroDirty[]
decisionDirty[]
routeRepair[]
routeFull[]
combatTransition[]
movementActive[]
snapshotDirty[]
```

Process homogeneous work rather than one branch-heavy loop over every NPC.

---

## 14. Spatial indexing

A uniform grid or spatial hash is one of the best SIMD and optional WebGPU targets.

```text
cellCount[]
cellOffset[]
cellEntity[]
```

Pipeline:

```text
count entities per cell
prefix-sum counts
scatter IDs
query neighboring cells
emit perception candidates
emit avoidance candidates
```

Separate broad-phase numeric filtering from gameplay policy.

Broad phase:

```text
distance
cell overlap
view cone
height difference
```

Gameplay filtering:

```text
faction
phase
stealth
encounter ownership
line-of-sight policy
script conditions
aggro eligibility
```

---

## 15. SIMD expectations

Portable Wasm SIMD is 128-bit.

### ARM64

NEON is also 128-bit, so dense Wasm SIMD loops may achieve roughly `0.85-1.0x` native performance.

### x86-64

Native may use AVX2 or AVX-512, so dense Wasm SIMD loops may achieve roughly `0.6-0.9x` native performance.

Branch-heavy AI and routing often stay closer because they are limited by cache misses and control flow rather than vector width.

If half the tick is vectorizable and SIMD makes that half three times faster:

```text
new time = 0.50 / 3 + 0.50
         = 0.667

overall speedup ~= 1.5x
```

Do not expect a four-lane vector to produce a fourfold whole-tick improvement. SoA and cache behavior may matter more.

---

## 16. Float16 and packed data

Do not design the authoritative world around FP16.

- `Float16Array` saves storage, but JavaScript arithmetic still uses `Number`.
- Portable Wasm FP16 arithmetic is not yet a universal production assumption.
- Native FP16 support varies by CPU and instruction set.
- WebGPU FP16 is optional and adapter-dependent.

Use `f32` for:

```text
authoritative position
velocity integration
steering
route costs
distance calculations
```

Use `u16`, `i16`, `u8`, and bit fields for:

```text
AI state
movement mode
route cursor
short timers
angles
normalized values
snapshot coordinates
bounded IDs
flags
```

Use FP16 selectively for approximate cached data, GPU-only buffers, cold fields, and rendering snapshots.

For large worlds, prefer tile-local fixed-point coordinates over raw FP16 world positions.

Example:

```text
64-meter tile
uint16 local coordinate
64 / 65535 ~= 0.000977 m
```

That gives roughly 1 mm uniform local precision.

---

## 17. Replication layout

Do not expose the full server simulation state to the client.

Server-only state may include:

```text
threat tables
AI decisions
full corridors
combat timers
hidden entities
server flags
encounter ownership
anti-cheat state
```

Client render state should contain only:

```text
visible entity ID
position
orientation
velocity
animation
movement state
appearance
interpolation target
selected combat state
```

Generate a separate render snapshot schema in Shado. Use changed-index queues:

```text
Wasm updates entity
-> changedIndex[]
-> pack changed render record
-> write snapshot
-> optionally upload changed GPU ranges
```

Do not upload the entire unified arena every frame for large worlds.

---

## 18. Determinism

Define whether the target is same-build determinism or cross-architecture bit identity.

Useful rules:

- Use integer or fixed-point values for critical combat decisions.
- Quantize inputs before threshold comparisons.
- Define stable dirty-queue ordering.
- Avoid unordered-map iteration in gameplay logic.
- Use deterministic A* tie-breakers.
- Do not let atomics determine gameplay order.
- Keep authoritative logic on Wasm/CPU rather than WebGPU.
- Record command streams and periodic state hashes.

Wasm is a better determinism target than heterogeneous GPU execution.

---

## 19. Allocation rules

The tick should perform no general-purpose allocation.

Preallocate:

```text
entity pool
threat-entry pool
route-query node pool
corridor pool
event ring
command ring
spatial scratch
dirty queues
snapshot buffers
```

Every bounded subsystem should define visible overflow behavior:

```text
route query out of nodes
threat table full
event ring full
snapshot overflow
spatial cell overflow
```

Expose overflow as status, metrics, debug events, and fallback behavior. Never silently corrupt or drop authoritative state.

---

## 20. Suggested schema families

### Authoritative entity core

```text
entityId
generation
active
entityType
position
velocity
orientation
currentPoly
movementMode
flags
```

### NPC AI

```text
aiState
behaviorId
decisionRevision
currentTarget
targetRevision
leashRegion
desiredRangeMin
desiredRangeMax
perceptionBucket
decisionBucket
```

### Aggro and threat

```text
npcThreatOffset
npcThreatCount
threatTarget
threatValue
threatLastEventTick
npcTargetThreat
```

### Navigation

```text
currentPoly
targetPoly
routeId
routeCursor
routeState
routeClass
lastProgressTick
stuckCounter
```

### Movement

```text
desiredVelocity
actualVelocity
maxSpeed
acceleration
radius
nextCorner
```

### Replication

```text
replicationFlags
snapshotGeneration
visibleState
packedLocalPosition
packedOrientation
animationState
```

---

## 21. Implementation plan

### Phase 1: baseline

1. Preserve the Go benchmark.
2. Create a TypeScript typed-array reference loop.
3. Define workloads for movement, perception, aggro, shared routing, arbitrary A*, and mixed ticks.
4. Record p50, p95, and p99 tick times, allocations, memory use, route expansions, and queue lengths.

### Phase 2: Shado memory core

1. Introduce `ByteArena`.
2. Add true `u8`, `u16`, `i16`, `u32`, and `f32` fields.
3. Add SoA layout generation.
4. Generate TypeScript and AssemblyScript views.
5. Add schema hashes and validation.
6. Separate Babylon integration from schema and memory packages.

### Phase 3: Wasm simulation worker

1. Create a Node.js worker.
2. Instantiate one Wasm simulation module.
3. Add command and event rings.
4. Add double-buffered snapshots.
5. Implement entity lifecycle, movement, dirty queues, and spatial grid.
6. Expose one `tick()` entry point.

### Phase 4: AI and aggro

1. Implement sparse threat tables.
2. Add event-driven threat updates.
3. Add target revisions.
4. Add staggered perception.
5. Add dirty decision queues.
6. Add navigation intents and engagement envelopes.

### Phase 5: Detour

1. Bake navmesh offline.
2. Compile Detour runtime to Wasm.
3. Add route-request batches.
4. Add bounded sliced queries.
5. Add packed corridors.
6. Add local repair.
7. Add reverse route fields for shared destinations.

### Phase 6: client sharing

1. Generate browser-compatible schemas.
2. Define a separate render snapshot schema.
3. Add changed-index packing.
4. Mirror selected fields into Babylon/WebGPU buffers.
5. Add browser replay and prediction tests.

### Phase 7: optional WebGPU

Only after profiling:

1. Spatial binning.
2. Neighbor candidate generation.
3. Bulk visibility-distance tests.
4. Homogeneous crowd steering.
5. Route-field generation.
6. Recast dirty-tile preprocessing.

---

## 22. Benchmark matrix

Use the same deterministic input stream across implementations.

| Test | JS | Wasm scalar | Wasm SIMD | Native N-API | WebGPU |
|---|---:|---:|---:|---:|---:|
| Movement only | Yes | Yes | Yes | Optional | Optional |
| Spatial bin build | Yes | Yes | Yes | Optional | Optional |
| Perception broad phase | Yes | Yes | Yes | Optional | Optional |
| Aggro event application | Yes | Yes | Limited | Optional | No |
| AI transitions | Yes | Yes | Limited | Optional | No |
| Shared route-field lookup | Yes | Yes | Yes | Optional | Optional |
| Bounded A* | Yes | Yes | Limited | Optional | Experimental |
| Full tick | Yes | Yes | Yes | Optional | No |

Measure:

```text
ticks per second
milliseconds per tick
entities per second
route expansions per second
bytes touched per entity
cache misses where available
snapshot cost
host-boundary cost
worker messaging cost
```

---

## 23. Decision rules

Use Wasm by default when:

- Frontend and backend should share implementations.
- World state can live in linear memory.
- The loop is typed-array friendly.
- Explicit arenas are acceptable.
- Portable SIMD is useful.
- Browser replay or prediction matters.

Use native N-API for a subsystem when profiling proves Wasm insufficient or architecture-specific SIMD is materially valuable.

Use straight JavaScript for orchestration-heavy, sparse, or I/O-bound work.

Use WebGPU only when the work is very large, homogeneous, GPU-resident, and does not require immediate full readback.

---

## 24. Final recommendation

The strongest Requiem architecture is:

```text
Node.js orchestration
+
one Wasm simulation per zone worker
+
Shado-generated typed SoA memory
+
offline Recast baking
+
Detour runtime in Wasm
+
batched bounded route work
+
shared-destination route fields
+
event-driven aggro
+
staggered AI
+
dense SIMD movement passes
+
explicit command, event, and snapshot buffers
```

Do not begin with WebGPU as the backend authority.

Do not begin with a complete Detour rewrite.

Do not share the mutable live world directly between Node.js and Wasm.

Do not run full AI, perception, and A* for every NPC every tick.

The first high-value implementation slice is:

```text
Shado ByteArena
-> SoA WorldEntityPool
-> Node.js simulation worker
-> Wasm tickMovement()
-> shared command ring
-> double-buffered snapshot
-> benchmark against the existing Go loop
```

After that baseline is stable, add spatial indexing, NPC dirty queues, threat tables, and Detour route batches in that order.
