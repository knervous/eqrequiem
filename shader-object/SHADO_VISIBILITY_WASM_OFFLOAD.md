# Shado Visibility-Only WASM Offload

## Recommendation

Do **not** move the full Shado entity reducer off-thread yet.

Keep movement, interpolation targets, local prediction, entity lifecycle, and gameplay-facing state updates in the existing synchronous path. Offload only the work that naturally tolerates one-frame latency and grows with world size:

- Frustum visibility
- Distance culling
- Area/region visibility
- Occlusion/PVS filtering
- LOD selection
- Mesh-variant bucketing
- Visible draw-list construction
- Optional visibility sorting

The render thread should consume the latest completed visibility result without waiting for the worker.

```text
main thread
    applies entity/network changes
    updates camera snapshot
    publishes visibility request
            ↓
SharedArrayBuffer
            ↓
persistent worker + WASM visibility kernel
    tests candidate entities
    selects LOD/mesh
    builds compact draw lists
    publishes completed generation
            ↓
main thread
    acquires latest completed generation
    uploads changed draw-list ranges
    renders
```

The governing rule is:

> Visibility may be asynchronous; rendering must never block waiting for visibility.

---

## Why visibility is the right first offload

Visibility work has the properties that make worker offload worthwhile:

- It can touch a large portion of the world.
- Cost grows with candidate entity count.
- Results are naturally batch-oriented.
- Most results are compact indices, not large entity records.
- One-frame-old visibility is usually acceptable.
- It is independent from Babylon object mutation.
- It can later absorb spatial indexing, PVS, portals, regions, and LOD logic.
- It directly solves Shado's per-mesh draw-list scalability problem.

By contrast, moving the full reducer introduces avoidable complexity:

- Local-player state may require same-frame results.
- Gameplay and rendering code may expect immediate mutation.
- Double-buffering the complete entity arena is expensive.
- Ownership rules become difficult across entity creation and removal.
- Worker latency may exceed the cost of the sparse active reducer.
- Shado already limits transition work to active movers.

The existing sparse transition reducer should remain where it is until profiling shows that it is a real frame-time problem.

---

## Division of responsibility

### Main thread

Keep these synchronous:

- Entity creation and swap-removal
- Stable ID-to-index mapping
- Network delta ingress
- Movement target updates
- Local-player prediction
- Immediate camera target updates
- Current-frame interpolation inputs
- Babylon resource creation and destruction
- GPU buffer and texture updates
- Draw submission
- Picking reconciliation
- Publishing immutable visibility inputs

### Visibility worker

Move these to the persistent WASM worker:

- Broad-phase candidate filtering
- Frustum tests
- Distance thresholds
- Region and PVS tests
- Visibility flags
- LOD selection
- Mesh-variant selection
- Compact per-mesh draw-list generation
- Draw-range metadata generation
- Optional transparent-depth sort keys
- Visibility change detection

### GPU

Keep these on the GPU:

- Final transform interpolation
- Skinning, DQ, or VAT sampling
- Animation sampling
- Cosmetic effects
- Per-vertex material state
- Optional GPU occlusion stages introduced later

---

## Shared memory layout

Use one `SharedArrayBuffer` divided into stable sections.

```text
VisibilitySharedState
├── control
├── cameraSnapshots[2]
├── entityBounds
├── entityVisibilityInputs
├── outputDrawIds[2]
├── outputMeshRanges[2]
├── outputLod
├── outputChangeMasks
└── workerScratch
```

Only small control fields should use atomics. Entity bounds and output lists should use ordinary typed-array reads and writes under generation ownership.

### Control block

```ts
const enum VisibilityControl {
  RequestedGeneration = 0,
  CompletedGeneration = 1,
  PublishedInputBuffer = 2,
  PublishedOutputBuffer = 3,
  EntityCount = 4,
  MeshCount = 5,
  CameraRevision = 6,
  SpatialRevision = 7,
  Shutdown = 8,
}
```

Suggested representation:

```ts
const control = new Int32Array(sharedBuffer, controlOffset, 16);
```

Use atomics only for:

- Publishing a new request
- Publishing a completed result
- Selecting front/back buffers
- Sleeping and waking the worker
- Shutdown

Do not use atomics for every entity field.

---

## Visibility input projection

Do not expose the complete rich Shado entity record unless the kernel needs it.

Create a compact visibility projection:

```ts
interface VisibilityEntityInput {
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;

  meshIndex: number;
  regionIndex: number;
  visibilityFlags: number;
  lodProfile: number;
}
```

A compact SoA representation is preferable for SIMD and cache behavior:

```text
centerX[N]
centerY[N]
centerZ[N]
radius[N]
meshIndex[N]
regionIndex[N]
visibilityFlags[N]
lodProfile[N]
```

Optional fields can be added later:

```text
aabbMinX/Y/Z
aabbMaxX/Y/Z
portalCell
sector
pvsCluster
maxDrawDistance
lodBias
importance
occlusionState
```

Do not copy the projection every frame when only a few entities change. Maintain it incrementally when entities move, resize, change mesh, or cross regions.

---

## Camera input

Double-buffer the camera and visibility-query state.

```ts
interface VisibilityCameraInput {
  viewProjection: Float32Array; // 16 floats
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  nearDistance: number;
  farDistance: number;
  regionIndex: number;
  layerMask: number;
}
```

The main thread writes the inactive camera slot and then publishes its index:

```ts
writeCamera(cameraBuffers[next], camera);

Atomics.store(
  control,
  VisibilityControl.PublishedInputBuffer,
  next,
);

Atomics.add(
  control,
  VisibilityControl.RequestedGeneration,
  1,
);

Atomics.notify(
  control,
  VisibilityControl.RequestedGeneration,
  1,
);
```

The worker snapshots the published index before processing. It should never read a camera slot that the main thread is still modifying.

---

## Output layout

The worker should not return one global visible list and then force every mesh renderer to reject unrelated entities.

Generate compact lists partitioned by mesh and optionally LOD.

```text
drawIds:
[mesh0-lod0][mesh0-lod1][mesh1-lod0][mesh1-lod1]...

drawRanges:
mesh0-lod0 → offset, count
mesh0-lod1 → offset, count
mesh1-lod0 → offset, count
mesh1-lod1 → offset, count
```

Example:

```ts
interface DrawRange {
  offset: number;
  count: number;
}

const drawIds = new Uint32Array(...);
const drawOffsets = new Uint32Array(meshCount * lodCount);
const drawCounts = new Uint32Array(meshCount * lodCount);
```

The Babylon renderer then submits only its assigned range:

```ts
renderer.drawOffset = drawOffsets[bucket];
renderer.drawCount = drawCounts[bucket];
```

Shader lookup:

```glsl
uint drawIndex = uDrawOffset + uint(gl_InstanceID);
uint entityIndex = drawIds[drawIndex];
```

This removes the pattern where every mesh variant submits the complete visible population and discards mismatches in the vertex shader.

---

## Worker algorithm

Start with a simple CPU/WASM pipeline.

```text
1. Read requested generation.
2. Snapshot camera-buffer index.
3. Snapshot entity count and spatial revision.
4. Select inactive output buffer.
5. Reset per-bucket counts.
6. Iterate candidate entities.
7. Reject disabled entities.
8. Apply region/PVS filter.
9. Apply distance filter.
10. Apply frustum test.
11. Select LOD.
12. Append entity index to mesh/LOD bucket.
13. Generate offsets and contiguous drawIds.
14. Compare with previous output if change tracking is enabled.
15. Publish output-buffer index.
16. Publish completed generation.
```

Pseudocode:

```ts
function buildVisibility(input: VisibilityInput): void {
  bucketCounts.fill(0);

  for (let entityIndex = 0; entityIndex < entityCount; entityIndex++) {
    if (!isEnabled(entityIndex)) continue;
    if (!passesRegionVisibility(entityIndex, cameraRegion)) continue;
    if (!passesDistance(entityIndex, cameraPosition)) continue;
    if (!sphereInFrustum(entityIndex, frustumPlanes)) continue;

    const lod = selectLod(entityIndex, cameraPosition);
    const mesh = meshIndex[entityIndex];
    const bucket = mesh * lodCount + lod;

    visibleScratch[entityIndex] = 1;
    selectedBucket[entityIndex] = bucket;
    bucketCounts[bucket]++;
  }

  prefixSum(bucketCounts, bucketOffsets);
  bucketWriteHeads.set(bucketOffsets);

  for (let entityIndex = 0; entityIndex < entityCount; entityIndex++) {
    if (!visibleScratch[entityIndex]) continue;

    const bucket = selectedBucket[entityIndex];
    drawIds[bucketWriteHeads[bucket]++] = entityIndex;
  }

  publishRanges(bucketOffsets, bucketCounts);
}
```

A two-pass bucket build avoids per-bucket dynamic allocations. For smaller mesh counts, maintaining fixed-capacity bucket slices is another viable option.

---

## Candidate reduction

A complete O(N) visibility pass may be acceptable initially, especially in a worker. It should not be the final design for a large MMO world.

### Stage 1: all entities

```text
camera → test all live render entities
```

Use this to validate correctness and establish benchmark baselines.

### Stage 2: region buckets

Maintain entity indices by world region, zone, BSP leaf, sector, or grid cell.

```text
camera region
    ↓
potentially visible regions
    ↓
candidate entity indices
    ↓
frustum/distance tests
```

This fits the existing EQ-inspired region/PVS direction.

### Stage 3: spatial hierarchy

Add one of:

- Uniform grid
- Loose octree
- BVH
- Hierarchical grid
- Region-local BVHs

For an MMO with largely static world partitioning and dynamic actors, a hybrid is attractive:

```text
zone/region/PVS
    → coarse candidate cells
    → local actor lists
    → frustum and distance tests
```

Avoid rebuilding a global BVH for every moving actor. Use region or cell membership updates when actors cross boundaries.

---

## Publication protocol

The renderer must consume only complete output generations.

### Worker

```ts
const nextOutput = 1 - Atomics.load(
  control,
  VisibilityControl.PublishedOutputBuffer,
);

buildVisibilityInto(nextOutput);

Atomics.store(
  control,
  VisibilityControl.PublishedOutputBuffer,
  nextOutput,
);

Atomics.store(
  control,
  VisibilityControl.CompletedGeneration,
  requestedGeneration,
);

Atomics.notify(
  control,
  VisibilityControl.CompletedGeneration,
);
```

### Main thread

```ts
function acquireLatestVisibility(): VisibilitySnapshot | null {
  const completed = Atomics.load(
    control,
    VisibilityControl.CompletedGeneration,
  );

  if (completed === consumedGeneration) {
    return null;
  }

  const outputBuffer = Atomics.load(
    control,
    VisibilityControl.PublishedOutputBuffer,
  );

  consumedGeneration = completed;
  return visibilityOutputs[outputBuffer];
}
```

Never call `Atomics.wait()` on the browser main thread.

The render frame should behave as:

```ts
const visibility = acquireLatestVisibility();

if (visibility) {
  applyDrawRanges(visibility);
  uploadDrawListChanges(visibility);
}

applySynchronousEntityUpdates();
commitGpuChanges();
scene.render();
```

When no new result exists, render using the previous completed visibility generation.

---

## Request cadence

Do not necessarily request a full visibility rebuild on every display frame.

Useful triggers include:

- Camera moved beyond a position threshold
- Camera rotated beyond an angular threshold
- Projection changed
- Region/PVS cluster changed
- Entity spatial revision changed
- Visibility or mesh membership changed
- A maximum refresh interval elapsed

Example:

```ts
const visibilityNeedsRefresh =
  cameraMovedEnough ||
  cameraRotatedEnough ||
  cameraRegionChanged ||
  spatialRevision !== lastPublishedSpatialRevision ||
  now - lastRequestTime > maxVisibilityAgeMs;
```

A reasonable starting point:

```text
rendering:           60–144 Hz
visibility requests: 20–60 Hz
```

Fast camera motion may justify one request per frame. Stationary views can reuse the same result for many frames.

---

## Handling late results

The worker may complete generation `G` after the main thread has already requested `G+1`.

Do not queue unlimited visibility jobs. Coalesce them.

The worker should process the latest requested generation:

```ts
while (running) {
  waitForRequest();

  const requested = Atomics.load(
    control,
    VisibilityControl.RequestedGeneration,
  );

  buildVisibility(requested);

  const newerRequest = Atomics.load(
    control,
    VisibilityControl.RequestedGeneration,
  );

  if (newerRequest !== requested) {
    continue;
  }
}
```

A visibility result based on a slightly older camera is usually still usable. When the camera teleports or crosses a hard zone boundary, the main thread may temporarily use a conservative fallback:

- Expand the previous visible set
- Render the current and previous region
- Temporarily disable aggressive occlusion
- Perform one synchronous coarse visibility pass

---

## Entity lifecycle synchronization

Creation and swap-removal remain main-thread operations. The worker must receive a coherent visibility projection.

Use a spatial revision counter:

```ts
Atomics.add(control, VisibilityControl.SpatialRevision, 1);
```

For updates to visibility inputs:

1. Main thread updates the projection arrays.
2. Main thread completes all swap-removal remapping.
3. Main thread publishes the new `EntityCount`.
4. Main thread increments `SpatialRevision`.
5. Main thread requests a visibility generation.

Because the worker may be reading while the main thread modifies projection records, choose one of these models.

### Preferred initial model: double-buffer projection arrays

```text
visibilityInputA
visibilityInputB
```

Main thread writes changed values into the inactive projection and publishes it.

This is simple but may require copying unchanged fields or maintaining mirrored mutations.

### More advanced model: stable projection with structural pause

Allow normal numeric position updates in place, but coordinate structural operations:

- Creation
- Swap-removal
- Capacity growth
- Projection reallocation

Use a coarse structural revision or lock. These operations are relatively rare compared with position updates.

### Practical compromise

Use stable, preallocated SAB capacity and avoid resizing during gameplay:

```text
reserve maximum actors for zone
```

Then:

- Position and bounds updates happen in place.
- Entity count is atomically published.
- Removed slots are rewritten before publication.
- Worker jobs operate on a generation snapshot.
- Structural mutations trigger a new visibility request.

If tiny races in remote-actor position are visually harmless, exact per-record synchronization is unnecessary. The next visibility pass corrects them.

---

## Change tracking

The worker should report changes separately from the complete result.

Useful outputs:

```ts
interface VisibilityChanges {
  rangesChanged: boolean;
  drawIdsChanged: boolean;
  visibilityChangedIndices: Uint32Array;
  lodChangedIndices: Uint32Array;
  membershipChangedIndices: Uint32Array;
}
```

At minimum, calculate a revision for each draw bucket:

```ts
bucketRevision[bucket]++;
```

Only upload draw-list ranges whose content changed.

For large outputs, compare at fixed-size pages:

```text
drawIds page size: 256 or 1024 indices
dirty pages: bitset
```

The main thread can merge adjacent dirty pages into GPU upload ranges.

---

## Integration with Shado

The visibility worker should be a distinct subsystem rather than hidden inside `ShadoDynamicEntityRenderer`.

Suggested components:

```text
src/visibility/
├── VisibilitySharedLayout.ts
├── VisibilityProjection.ts
├── VisibilityController.ts
├── VisibilityWorker.ts
├── VisibilityWasmBridge.ts
├── VisibilityDrawLists.ts
└── kernels/
    ├── Frustum.ts
    ├── Distance.ts
    ├── RegionPvs.ts
    └── Lod.ts
```

### `VisibilityController`

Main-thread owner responsible for:

- SAB allocation
- Worker lifetime
- Publishing camera state
- Publishing spatial revisions
- Acquiring completed outputs
- Mapping draw ranges to renderers

### `VisibilityProjection`

Maintains compact culling inputs corresponding to Shado entities.

```ts
projection.updateBounds(entityIndex, bounds);
projection.updateMesh(entityIndex, meshIndex);
projection.swapRemove(removedIndex, movedIndex);
```

### `VisibilityDrawLists`

Owns the double-buffered output arrays:

- `drawIds`
- `drawOffsets`
- `drawCounts`
- LOD assignments
- Dirty-page metadata

### `ShadoDynamicEntityRenderer`

Should consume:

```ts
renderer.setDrawRange(offset, count);
```

It should not:

- Rebuild visibility
- Commit the complete container
- Submit all visible entities for every mesh variant
- Reject unrelated mesh variants in the vertex shader

---

## Minimal implementation sequence

### Phase 1: worker-generated global draw list

- Add visibility projection
- Add camera snapshot
- Add persistent worker and SAB
- Perform sphere-frustum and distance tests
- Return one compact `drawIds` list
- Render the most recent generation
- Benchmark worker overhead and latency

This validates the asynchronous publication model.

### Phase 1 proof status

`ShadoEntityVisibilityWorker` now implements the Phase 1 boundary:

- A persistent worker owns the O(N) WASM visibility pass.
- Entity positions and radii live in a fixed-capacity `SharedArrayBuffer`.
- Normal movement updates touch only changed projection rows.
- A request copies only six frustum planes and byte-per-cell policy flags.
- At most one request runs and one latest request remains pending.
- The main thread polls complete generations and never waits for the worker.
- Output indices and reason flags are double-buffered in shared memory.
- Worker execution time and generation age are exposed for measurement.

Example:

```ts
const visibility = await ShadoEntityVisibilityWorker.create(world, {
  capacity: maximumActorsForZone,
});

// Populate once. Keep this projection current with incremental setEntity calls.
visibility.projection.load(actors, defaultRadius);

// Render/update loop: O(planes + cells), not O(total actors).
visibility.request(planes, worldFrame.cellFlags, {
  camera: [camera.x, camera.y, camera.z],
  maxDistance: 1800,
});

const latest = visibility.acquireLatest();
if (latest) {
  container.applyVisibilityReduction(latest.visibleIndices, latest.flags);
}
// If latest is null, keep rendering the previously acquired generation.
```

The browser proof runs 100,000 entities through the real embedded WASM reducer
inside Chromium's worker while asserting that request publication remains below
10 ms. Cross-origin isolation is required for the shared projection.

Packaged world objects use this path automatically:

```ts
const coordinator = await ShadoWorldVisibilityCoordinator.create(world);
// coordinator.worldObjectVisibilityMode === 'worker' when the host is isolated
```

`reduceWorldObjects()` performs one synchronous bootstrap reduction, then
publishes future requests and returns the most recent completed worker
generation without waiting. Use `{ entityVisibilityWorker: 'disabled' }` only
for diagnostics or compatibility testing. Use `'required'` when a host should
fail startup instead of silently using the synchronous fallback.

### Sandbox and Requiem client defaults

The sandbox play route now requires this worker for packaged worlds. Its
`WorldObjectRenderer` consumes `reduceWorldObjects()` output directly; the old
JavaScript O(N) oracle remains only in live-authoring mode, where unpublished
stamp edits must be visible immediately.

The Requiem client uses one scene-wide `RequiemEntityVisibility` instance for
all active `ShadoEntityPool`s:

- Actor slots are stable inside a 65,536-row shared projection.
- Acquire, release, transform, and coarse-visibility changes update only their
  affected rows.
- Camera/frustum requests are coalesced at a maximum of 30 Hz.
- The worker performs distance, frustum, enabled, and phase filtering.
- A completed global list is partitioned into per-pool compact lists before
  applying it to each Shado instance container.
- Startup uses the existing synchronous pool cull until the first worker
  generation completes.
- Runtime startup failure, worker failure, or capacity overflow keeps the
  synchronous path active instead of hiding actors.
- Zone/cache disposal terminates the shared worker and detaches its pools.

The client deployment and standalone sandbox dev/test host send
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, so `SharedArrayBuffer` is
available out of the box. The packaged world layer uses `'required'` in both
hosts; Requiem's dynamic actor manager intentionally retains its synchronous
fallback as a safety boundary.

### Phase 2: per-mesh ranges

- Bucket visible entities by mesh index
- Generate `drawOffsets` and `drawCounts`
- Add `uDrawOffset`
- Submit only the relevant range per renderer
- Remove mesh-index rejection from the vertex shader

This is likely the highest immediate rendering win.

### Phase 3: LOD ranges

- Add LOD selection
- Bucket by mesh and LOD
- Add renderer bindings for each LOD
- Track LOD membership changes

### Phase 4: region/PVS candidates

- Integrate EQ region or BSP-derived visibility
- Maintain candidate region lists
- Cull actors outside potentially visible regions before frustum tests

### Phase 5: partial draw-list uploads

- Add dirty pages
- Merge adjacent dirty ranges
- Upload only changed `drawIds` spans
- Keep complete output rebuild inside the worker if it remains cheap

A complete worker rebuild can coexist with partial main-thread GPU uploads.

---

## What not to move yet

Do not initially put these in the visibility worker:

- Movement interpolation
- Network delta application
- Local-player state
- Entity allocation
- Swap-removal ownership
- Babylon mesh creation
- Material mutation
- GPU resource management
- Quest or combat logic
- Animation state-machine progression
- General simulation ticking

These may move later based on profiling, but they should not be coupled to the first visibility-worker implementation.

---

## Correctness considerations

### Conservative culling

Visibility errors should prefer false positives over false negatives.

Use:

- Bounding spheres expanded for interpolation
- A small frustum margin
- LOD hysteresis
- Distance hysteresis
- Temporary visibility retention for recently visible actors

Example:

```text
enter visible at distance < 100
leave visible at distance > 110
```

This prevents flicker when an entity or camera sits near a threshold.

### Interpolated movement

Bounds must account for movement between visibility updates.

Options:

- Expand radius by maximum movement over visibility latency
- Use a swept sphere/AABB between current and target position
- Use current rendered position in the projection
- Retain recently visible movers for one or two generations

### Picking

Picking should use the draw list corresponding to the rendered generation.

Keep:

```text
renderedVisibilityGeneration
```

Associate picking results with that generation where needed.

### Teleports and zone changes

On major camera discontinuities:

- Mark the previous result stale
- Request a new generation immediately
- Optionally perform a conservative synchronous fallback
- Avoid displaying a completely empty frame

---

## Performance targets

Measure independently:

- Main-thread visibility request cost
- Worker wake-up latency
- WASM visibility execution time
- Result publication time
- Draw-list upload bytes
- Main-thread draw-list application time
- GPU instance count
- Vertex invocation count
- End-to-end visibility age

Suggested scenarios:

```text
entities:        10k, 100k, 500k
visible ratio:   1%, 10%, 50%
mesh variants:   1, 8, 32
camera:          static, walking, rapid rotation, teleport
updates:         static, 1%, 10%, 100% moving bounds
regions:         no PVS, coarse regions, dense PVS
```

Primary acceptance criteria:

1. The main thread never waits for the worker.
2. Normal frame time contains no O(total-world-entities) visibility pass.
3. Each mesh renderer submits only its own visible draw range.
4. Late worker results do not stall or corrupt rendering.
5. Visibility generation age remains bounded during normal camera movement.
6. Structural entity changes cannot produce invalid indices.
7. GPU draw-list upload volume tracks changed ranges rather than capacity.
8. Remote entity movement does not require per-record atomic operations.

---

## Decision summary

For the current Shado architecture:

```text
Keep synchronous:
    sparse movement reducer
    entity lifecycle
    network delta application
    local prediction
    Babylon and GPU operations

Offload:
    visibility
    culling
    LOD
    region/PVS filtering
    per-mesh draw-list construction
```

This gives the highest-value worker boundary with the least disruption.

It preserves the existing reducer's strong active-set behavior while addressing the work that still scales with total world size and mesh-variant count. It also establishes the SAB generation and worker infrastructure without forcing the complete game simulation into an asynchronous ownership model.
