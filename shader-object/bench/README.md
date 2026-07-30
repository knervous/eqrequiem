# Shado scalability benchmarks

## Instance addition

`instance-addition-bench.mjs` compares the former per-actor structural/header
bookkeeping with the bulk append used by both full and Lite instance
containers. Both paths pre-reserve capacity and skip animation/nameplate work,
so the result isolates actor creation, initialization, sidecar growth, and
append bookkeeping.

```bash
npm run benchmark:instance-addition -- --actors 100000 --iterations 5
```

The real showcase processes bulk appends inside an 8 ms browser-frame mutation
budget. Total addition time remains workload-dependent, but a 100k click no
longer has to be one uninterrupted main-thread task.

## Million-actor integration

`npm run benchmark:million-integration` runs the sandbox promotion workload:
one million 16-byte packed resident transforms, a SharedArrayBuffer-backed WASM
visibility reduction, compact visible-ID uploads, and the real 1,614-vertex
barbarian mesh consuming its preprocessed 27-bone half-float DQ VAT.

The default workload renders 20,000 visible actors. A spatial-revision rebuild
bins the 1M shared rows by world cell once; subsequent 15 Hz requests gather
only candidate-cell members and continue drawing the latest completed result.
Full entity-indexed reason flags are disabled for this compact-only pass. The
runner warms up for 30 frames and measures 120 frames. It reports p50/p95/p99
wall-frame, CPU, queue-completion, worker, request, and GPU VAT-pass timing. Add
`--require-target` to return a failing exit code unless the measured 60 FPS
promotion criterion passes.

```bash
npm run benchmark:million-integration
npm run benchmark:million-integration -- --visible 10000 --frames 240
npm run benchmark:million-integration -- --visible 25000 --vat-quality medium
npm run benchmark:million-integration -- --visible 28000 --vat-quality low
npm run benchmark:million-integration -- --require-target
```

`--vat-quality` accepts `full`, `medium`, `low`, or `rigid`. Full quality blends
all bone influences across two animation frames. Medium keeps weighted
influences but samples one frame. Low samples the dominant influence at one
frame. Rigid skips VAT transforms. These are pipeline tiers rather than
per-vertex runtime branches, so separate LOD draw bins can select separate
compiled paths.

Resident and visible counts are intentionally independent. One million actors
exercise culling and resident-state bandwidth; the compact visible count sets
the actual VAT vertex/raster budget. On an Apple `metal-3` adapter, 20,000
full-quality visible actors (32.28 million indexed VAT vertex invocations per
frame) measured 12.06 ms p95 GPU VAT time and passed the 60 FPS gate. Recurring
visibility was 1.27 ms p50 after a 31.1 ms one-time hierarchy build: 20,000 rows
and 320 KiB entered WASM instead of 1M rows and 16 MB, while the 1 MB full flag
publication was eliminated. The same full-scan worker previously measured
11.75 ms p50, making the recurring pass about 9.3x faster in this workload.
Medium quality passed at 25,000 visible actors with
12.04 ms p95 GPU time in a 60-frame sample; a later 120-frame sample remained
inside the GPU/work budgets but had two skipped headless-browser callbacks.
Low quality passed the complete 120-frame gate at 28,000 visible actors with
12.26 ms p95 GPU time and one missed refresh (0.83%). Treat these crossovers as
adapter-specific rather than universal actor limits.

## OPFS deferred slabs

`opfs-deferred-slab-bench.mjs` creates a large logical packed-actor file while
enforcing a small typed-array resident cap. It traverses every slab, writes
one row per slab, reports page-in/dirty-eviction latency and 4 KiB dirty-page
amplification, then closes/reopens and verifies distant sentinels.

```bash
npm run benchmark:opfs-slabs
npm run benchmark:opfs-slabs -- --actors 1000000 --resident-slabs 2
```

The default ten-million-row file is 152.6 MiB at 16 bytes per row while the
default four-slab cache is capped at 16 MiB. This is an IO/storage benchmark,
not a render FPS claim; deferred rows must still enter the bounded hot
ECS/WASM/projection set before they can be culled or drawn.

Sparse dirty evictions now accumulate bounded 4 KiB snapshots. The ten-million
row traversal combines 39 changed slabs into one writeback and one durability
sync instead of 39 sync cycles.

`five-million-opfs-integration-bench.mjs` proves the complete cold-to-live
shape: five million OPFS rows, one million prefetched hot rows, cell-first WASM
visibility, compact IDs, and the real full-quality VAT draw. Mapped slab views
upload directly to the GPU packed buffer and OPFS counters must remain
unchanged during measured frames.

```bash
npm run benchmark:five-million-opfs
npm run benchmark:five-million-opfs -- --visible 8000 --require-target
```

The current Apple `metal-3` promotion sample sustained 60.03 FPS mean with
8,000 visible actors, 11.47 ms p95 complete frame work, 9.67 ms p95 VAT GPU
time, no missed refreshes, and zero frame-path OPFS operations. Five million
initialized cold rows occupied 76.29 MiB logically while mapped residency
stayed at 16 MiB. At 20,000 visible, VAT vertex work—not OPFS—exceeded the
frame budget.

## Actor render projection

`actor-projection-bench.mjs` is the deterministic 100k-actor comparison for
the projected transform/appearance implementation. It compares the current
wide actor-arena full upload, lossless split-f32 streams, packed streams with
shape-aware slot-indexed compute-scatter payloads, and Babylon Lite's forced
fallback control.

```bash
npm run benchmark:actor-projection -- --actors 100000 --iterations 20
```

The CPU p50 is actual host-side copy/encode time. Upload bytes, calls, and
relative byte reduction come from the exact upload plans. Node does not submit
to a GPU, so the script intentionally does not present byte reduction as GPU
frame-time improvement.

`webgpu-upload-bench.mjs` complements it with real `GPUQueue.writeBuffer`
measurements in the system Chromium channel. It reports CPU enqueue and
queue-completion p50 separately, including the deliberately bad 1,000-call
random-direct control:

```bash
npm run benchmark:webgpu-upload -- --actors 100000 --iterations 20
```

The upload-only rows compare whole-transform and shaped position/scale scatter
payloads. They exclude compute dispatch; use the pipeline benchmark below for
that cost.

`webgpu-scatter-pipeline-bench.mjs` measures that complete path: delta
encoding, upload enqueue, command encoding, queue completion, compute-scatter
GPU duration, and the downstream render consumer's GPU duration. It runs full
packed upload, whole-row scatter, and struct-span-shaped scatter against the
same 100k-instance consumer.

```bash
npm run benchmark:webgpu-scatter -- --actors 100000 --iterations 10
```

When `timestamp-query` is unavailable, GPU-stage columns are zero while CPU
and queue-completion measurements remain valid.

`webgpu-lite-scatter-bench.mjs` runs the same three paths through Babylon
Lite's actual storage buffers and compute compatibility bridge. It records
each path into a frame-style command submission:

```bash
npm run benchmark:lite-scatter -- --actors 100000 --iterations 20
```

Use a larger actor count to expose the resident-stream bandwidth crossover:

```bash
npm run benchmark:lite-scatter -- --actors 1000000 --iterations 10
```

## Dynamic entities

`scalability-bench.mjs` exercises the dynamic-entity path at configurable
entity counts across the baseline scenarios from
[`SHADO_RENDER_DATA_SCALING.md`](../SHADO_RENDER_DATA_SCALING.md): static,
1% / 10% / 100% new destinations per frame, and one versus eight mesh
variants. Movers can accumulate while transitions are active; this is not yet
the strategy document's deterministic "fixed active movers" comparison.

```bash
npm run build
node --experimental-vm-modules bench/scalability-bench.mjs --entities 100000
```

Reported per stage (p50/p95/p99): reducer transition stepping and GPU
synchronization (encode + recorded upload bytes). Runs on `NullEngine`, so GPU
submission cost is out of scope; upload bytes and call counts are the proxies.
The current warm-up also precedes lazy reducer scratch allocation, which can
produce one later structural upload. Treat this script as a baseline until
Phase 0 of the strategy is implemented.

## Architecture invariants (enforced in `tests/scalability-invariants.test.ts`)

- An unchanged frame uploads zero entity bytes (`syncGpu` is dirty-guarded).
- One container synchronizes at most once per frame id, regardless of how many
  mesh-variant renderers draw it.
- One changed entity uploads at most a couple of 4 KiB pages, not the arena.
- Dense changes and structural growth fall back to one full upload.
- Draw IDs are partitioned into contiguous per-mesh ranges: submitted
  instances across variants total the visible entities, an empty variant
  submits nothing, and mesh membership moves are bucket swap-remove/append.
