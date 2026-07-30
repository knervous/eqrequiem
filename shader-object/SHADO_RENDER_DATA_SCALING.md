# Shado render-data scaling strategy

Status: first Phase 1-3 actor prototype implemented, WebGPU-first  
Scope: actor/entity state, GPU projection, dirty synchronization, and generated
shader readers

## Decision

Keep Shado's object API, but stop requiring one physical layout to serve
TypeScript authoring, WASM simulation, GPU rendering, networking, and every
render pass.

The next render ABI should be:

1. CPU/WASM component stores in SoA form for reducers and bulk iteration.
2. A separate, generated GPU projection split into a few update-frequency
   streams.
3. Packed `u32` words within each stream, decoded to logical WGSL types by
   generated field readers.
4. Element-granular dirty tracking with an adaptive direct-write,
   delta/scatter, or full-stream upload.
5. Pass-specific shader reads. Do not reconstruct a complete actor header when
   a pass only consumes transform, animation, or label data.

This is SoA between components and a small packed AoS within a component
stream. Pure scalar-plane SoA on the GPU would consume too many bindings and
turn one actor lookup into many unrelated reads. A general archetype ECS
rewrite is not required to prove the render gains.

## Verified baseline

The repository already has useful pieces:

- `ShadoInstanceSoA` owns visibility, dirty, culling, and compact visible-index
  sidecars.
- `DirtyPageTracker` coalesces sparse 4 KiB pages and limits upload calls.
- `StorageBacking` uploads exact dirty ranges on WebGPU and uploads zero bytes
  on a clean frame.
- GPU synchronization is frame-owned, so multiple mesh variants do not
  multiply commits.
- Visible actors are compacted and the main actor draw does not submit every
  actor to every mesh variant.

The remaining costs come from the physical ABI:

- `ShadoActor` has a 28-word / 112-byte float-word record.
- `EqShowcaseActor` is padded to 48 words / 192 bytes.
- A write to one field can promote a 4 KiB page containing unrelated actor
  fields.
- Random writes rapidly touch enough pages to trigger the whole-arena
  fallback.
- `*_instances_get()` currently creates the complete header. The generated
  vertex shader therefore loads fields which the active pass never reads.
- Transform, animation, appearance, label, compatibility visibility, and
  subclass data share one update and upload domain.
- Actor visibility is represented by the compact visible list, the SoA flag
  plane, and compatibility fields such as `visibleFlag`/`visibleIndex`.
- The data-texture fallback re-encodes dirty ranges but uploads the complete
  texture because the current renderer abstraction has no partial texture
  update.

On 2026-07-29, this command:

```bash
node --experimental-vm-modules bench/scalability-bench.mjs \
  --entities 100000 --frames 15
```

reported an 11.6 MB arena and about 11,360 KiB uploaded per sampled moving
frame, including the scenario labelled 1% movers. That benchmark assigns 1% new
destinations each frame, so movers can accumulate; lazy reducer allocation also
causes one structural upload after its current warm-up. Those details should be
fixed in the benchmark, but the result still demonstrates the page/AoS
amplification this proposal targets.

## Prototype snapshot

The first implementation slice now provides:

- a renderer-neutral `ActorRenderProjection` with lossless split-f32 and
  16-byte packed transform codecs;
- a separate 4-byte RGBA8 appearance stream;
- exact contiguous ranges, shape-aware slot-indexed scatter payloads, and
  compact full-stream fallback plans;
- bounds-checked, struct-span-specialized compute-scatter WGSL with unrolled
  stores;
- a full-Babylon WebGPU publisher using public `ComputeShader` and
  `StorageBuffer` APIs, with asynchronous warm-up and safe readiness fallback;
- an opt-in Babylon Lite material path using public storage-buffer APIs plus
  one contained, feature-detected bridge for compute encoding;
- generated WGSL that reads only transform, appearance, and visible-index
  streams;
- parity/error-bound, idle, field-isolation, sparse, dense, and 100k-row tests.

The legacy actor arena remains canonical and the default Lite material path is
unchanged. Opt-in Lite projection now consumes the same adaptive scatter
batches as full Babylon. Lite does not expose generic public compute or native
storage-buffer handles, so `BabylonLiteComputeScatterExecutor` contains a
feature-detected dependency on the runtime `_device`, `_currentEncoder`, and
`_buffer` fields. It updates Lite's CPU recovery mirror after each scatter and
rebuilds its pipelines after a device change. If those fields are absent, it
uploads the complete affected projected stream. `computeScatter: false`
explicitly retains that previous fallback.

Full Babylon now compares whole-row scatter with batches matching the encoded
struct spans. Packed position/scale and rotation are independent two-word
spans; split-f32 translation and rotation are independent four-word spans.
Each selected batch uploads its delta plus a 16-byte live-count buffer and
dispatches a 64-thread-workgroup kernel. If multiple fields change on the same
rows and duplicate slot indices would cost more, the planner emits one
whole-row batch instead. Resident-buffer growth automatically rebinds
registered materials.

On 2026-07-29, the deterministic 100k-row projection benchmark (eight measured
iterations) reported:

| Scenario     | Projection plan             | Host p50 |     Upload | Versus legacy bytes |
| ------------ | --------------------------- | -------: | ---------: | ------------------: |
| 1% clustered | packed direct               | 0.156 ms |  0.015 MiB |        700x smaller |
| 1% random    | packed shaped scatter       | 0.252 ms |  0.011 MiB |        933x smaller |
| 1% random    | packed Lite forced fallback | 0.145 ms |  1.526 MiB |          7x smaller |
| 100% dense   | packed full stream          | 4.801 ms |  1.526 MiB |          7x smaller |
| control      | legacy 112-byte arena copy  | 0.210 ms | 10.681 MiB |                  1x |

Host timing deliberately exposes the dense encoding cost instead of treating
byte reduction as a frame-time result. A system-Chromium WebGPU queue benchmark
over 30 measured iterations reported 2.200 ms p50 completion for the 10.681 MiB
legacy write, 0.500 ms for the 1.526 MiB packed full-transform write, and
0.100 ms for one-write clustered, row-scatter, and shaped-scatter uploads. The
1,000-call random direct control took 0.600 ms despite transferring only
0.015 MiB, which supports keeping a write-count threshold.

The latest target-channel timestamp-query run used 1,000 deterministic random
rows and a 100k-instance projected-transform vertex consumer. GPU readback
verified both the selected span and untouched words. Whole-row scatter
transferred 0.019 MiB; position/scale-shaped scatter transferred 0.011 MiB,
40% less. Both kernels took about 0.010 ms GPU time. End-to-end queue completion
was 2.300 ms for packed full, 1.700 ms for row scatter, and 1.900 ms for shaped
scatter in this short run. Consumer work and run-to-run noise dominate that
small difference, so the result proves a deterministic bandwidth reduction
without a measured compute penalty, not a frame-time promotion. Continue
sampling on target hardware and inside real actor/VAT frames before changing
defaults.

The Lite-native benchmark records all paths into the same frame-style command
submission. At 100k actors and 1,000 random position/scale changes, shaped
scatter completed at 0.605 ms versus 0.740 ms for whole-row scatter and
0.730 ms for a packed full upload. At one million actors and 10,000 changes, it
completed at 0.975 ms versus 1.295 ms and 3.470 ms respectively. Shaped scatter
transferred 0.011 MiB at 100k and 0.114 MiB at one million; its measured compute
duration was 0.010-0.013 ms. These are single-adapter samples, but unlike the
byte result they show the expected scale dependence and should be repeated on
target hardware.

### Million-actor integration snapshot

The sandbox now has a sustained integration route and promotion runner:

```bash
npm run benchmark:million-integration
```

It keeps one million actors resident in a 16-byte packed transform stream,
runs a cell-first SharedArrayBuffer/WASM visibility worker, uploads only compact
visible IDs, and draws the real 1,614-vertex barbarian mesh against its
preprocessed 27-bone half-float DQ VAT. A spatial epoch rebuilds cell bins only
when positions or count change. Camera/cell/policy epochs suppress duplicate
work and cap visibility requests at 15 Hz without blocking rendering; frames
consume the latest complete double-buffered result.

On the 2026-07-29 Apple `metal-3` adapter run, 20,000 visible actors produced
32.28 million indexed VAT vertex invocations per frame. Full-quality VAT passed
the 60 FPS promotion gate with 12.06 ms p95 timestamp-query VAT duration.
Recurring visibility was 1.27 ms p50 after a roughly 31 ms one-time hierarchy
build. Only 20,000 candidate rows and 320 KiB of position/bounds data entered
WASM per request instead of one million rows and 16 MB. Compact-only publication
also avoided the one-million-byte entity-indexed flag copy. Compared with the
previous 11.75 ms p50 full-scan result, the 1.27 ms recurring pass was about
9.3x faster for this candidate shape.

VAT now has compile-time `full`, `medium`, `low`, and `rigid` tiers. Medium
retains weighted influences but samples one animation frame; low samples the
dominant influence at one frame; rigid uses the rest mesh. In the same short
adapter samples, medium passed at 25,000 visible actors with 12.04 ms p95 GPU
time in a 60-frame sample; a later 120-frame sample stayed within GPU/work
budgets but had two skipped headless callbacks. Low passed the complete
120-frame gate at 28,000 visible actors with 12.26 ms p95 GPU time and one
missed refresh (0.83%).

This makes the performance contract explicit: one million is the resident and
culling population, while visible mesh count determines the VAT vertex and
raster workload. Both values are reported and configurable. The crossover is
adapter-specific and is not a universal actor limit.

For populations that should not remain resident, the
[OPFS deferred storage slab proof](./OPFS_DEFERRED_STORAGE_SLABS.md) adds a
cold tier beneath this architecture. Fixed packed-row slabs page into a
bounded typed-array cache and retain the arena-style access/dirty API. OPFS is
not used as a GPU backing or searched during a frame; a spatial index predicts
the slabs that feed the hot ECS/WASM/projection working set.

The five-million cold-backed sandbox gate now proves this split end to end.
Five million OPFS rows remain behind a 16 MiB four-slab cache; one million
prefetched hot rows feed WASM visibility and the packed GPU/VAT path. Mapped
SharedArrayBuffer slabs upload directly to the GPU buffer, and measured frames
assert zero OPFS operations. On the 2026-07-30 Apple `metal-3` sample, 8,000
visible full-quality VAT actors sustained 60.03 FPS mean with 11.47 ms p95
complete frame work and 9.67 ms p95 VAT GPU time.

## Target architecture

### 1. Stable entity handles

Use an indirection-table index plus generation as the stable internal handle:

```ts
type EntityHandle = {
  index: number;
  generation: number;
};
```

`handleToDense[]` maps a live handle to its component row and
`denseToHandle[]` identifies the owner of each row. Swap-remove remains valid
for render pools: update those two mappings when the last row moves, while the
moved entity's external handle remains stable. Generation rejects stale handles
after destruction and reuse.

Shado actor objects become ergonomic views over component stores. They are not
the physical render record.

### 2. CPU/WASM component stores

Start with sparse-set stores rather than a general archetype ECS:

```text
TransformStore
  x[], y[], z[], scale[]
  qx[], qy[], qz[], qw[]

AnimationStore
  clipId[], phase[], speed[], epoch[]

AppearanceStore
  color[], material/armor/weapon IDs[], optional tints[]

VisibilityStore
  flags[], cullingReason[], visibleIndices[]

NameplateStore (optional and sparse)
  nameIndex[], color[], worldPerEM[], lift[]
```

Reasons to keep the CPU representation at `f32` initially:

- Reducers can iterate one property without pulling cold fields through cache.
- Position precision remains independent of the render encoding.
- Quantization is paid only for changed render values.
- The existing WASM culling and reducer path can migrate one component at a
  time.

Each mutable component owns:

- a dirty bitset,
- an optional changed-index queue,
- a monotonically increasing epoch,
- structural and value versions.

The one-byte actor dirty sidecar can remain as a compatibility aggregate, but
it should not decide which GPU streams or fields are uploaded.

### 3. GPU component streams

Use raw `array<u32>` storage so encoding controls the physical stride without
WGSL host-shareable struct padding.

Recommended first projection:

| Stream        | First format                                                    |     Bytes/actor | Update behavior |
| ------------- | --------------------------------------------------------------- | --------------: | --------------- |
| Transform     | position/scale as four `u16`; quaternion as four SNORM16 values |              16 | hot             |
| Animation     | clip/phase plus speed/epoch as two words                        |               8 | command-driven  |
| Appearance    | RGBA8 color plus packed IDs/flags                               |               8 | cold            |
| Label         | name index, RGBA8 color, two packed half values                 |              12 | optional/cold   |
| Visible index | source slot as `u32`                                            | 4/visible actor | per cull result |

The core actor draw becomes 32 bytes/actor across its resident streams instead
of 112 bytes for `ShadoActor` or 192 bytes for `EqShowcaseActor`. The nameplate
pass binds the label stream only when enabled. Unused showcase tint fields do
not enter the projection unless a shader strategy declares a read.

Do not split this into one GPU buffer per scalar. Four or five logical streams
preserve update isolation while staying conservative about storage-buffer
binding limits.

## Encoding choices

### Position and scale

Use cell-relative UNORM16 position only when a batch has a declared origin and
extent:

```wgsl
let xy = unpack2x16unorm(transformWords[base + 0u]);
let zs = unpack2x16unorm(transformWords[base + 1u]);
let position = cellOrigin + vec3f(xy, zs.x) * cellExtent;
let scale = mix(scaleMin, scaleMax, zs.y);
```

For one axis:

```text
resolution = extent / 65535
maximum rounding error = extent / (2 * 65535)
```

Choose cell extent from an explicit visual/gameplay error budget. For example,
if maximum actor-position error is 0.02 world units, one quantization domain
may span at most 2,621.4 world units on that axis. Prefer existing world
cells/chunks as quantization domains; do not quantize against the bounds of a
moving crowd each frame.

Keep an unquantized `position-f32` codec as the control and for actors outside
bounded domains. The schema compiler should be able to select either codec
without changing logical shader code.

### Rotation

Use two SNORM16 words first:

```wgsl
let q01 = unpack2x16snorm(transformWords[base + 2u]);
let q23 = unpack2x16snorm(transformWords[base + 3u]);
let rotation = normalize(vec4f(q01, q23));
```

This halves quaternion storage with simple, portable decoding. A 32-bit
"smallest three" quaternion is a later experiment, not the initial ABI: it
saves four more bytes but adds branches/bit work and needs measured angular and
GPU-time wins.

### Colors and tints

Use RGBA8 UNORM in one word:

```wgsl
let color = unpack4x8unorm(appearanceWords[base]);
```

This is the clearest high-confidence packing win. If an application needs HDR
tints, give those fields an explicit RGB9E5, packed-half, or `f32` codec rather
than silently clipping them.

### Animation

Replace per-actor `[from, to, phase, fps]` with a clip table:

```text
actor word 0: clipId:u16 | phase:u16
actor word 1: speed:f16 | epoch/flags:u16

clip table: from, to, fps, and immutable clip metadata
```

The current actor animation values are command-driven while frame advancement
already occurs in the shader from global time. A clip ID removes repeated
range metadata and makes animation eight bytes per actor. `unpack2x16float`
can decode packed speed without enabling WGSL's optional `f16` arithmetic
type.

### IDs and flags

Store discrete state as integers, not numeric floats:

```text
appearance word:
  armorId:u8 | weaponId:u8 | materialVariant:u8 | renderFlags:u8
```

Use a full `u32` where cardinality requires it. Visibility, selection,
highlighting, phase, and culling reason are bits in component planes, not
independent padded scalar fields.

The compact visible-index list is canonical for the main draw. A GPU flags
stream exists only for passes which render a different population, such as
glyphs that must test their owner. `visibleIndex` should be derived from the
dense slot, and compatibility `visibleFlag` should be a facade over
`VisibilityStore`, not another durable render word.

## Upload strategy

No single upload method wins for contiguous, random sparse, and dense changes.
Choose per stream and per commit.

### Mode A: direct coalesced writes

For a small number of contiguous runs:

1. Encode dirty component rows into the stream's persistent CPU mirror.
2. Coalesce adjacent rows and short clean gaps.
3. Call `StorageBuffer.update()` once per selected run.

Track dirty rows, not 4 KiB pages. WebGPU writes are four-byte aligned, so a
16-byte transform row or 8-byte appearance row is already legal.

Use this mode for commands that update ranges, spawn bursts, and clustered
world cells.

### Mode B: compact delta plus compute scatter

For many random dirty rows:

1. Compare changed encoded words against generated struct spans.
2. Cost whole-row records against one batch per changed span.
3. Gather the selected `{slot, packed span}` records into contiguous deltas.
4. Upload each delta in one write.
5. Dispatch a specialized compute pass per batch into the resident stream.
6. Consume the stream in the later render pass without CPU readback.

For 1,000 random packed position/scale updates at a 16-byte transform stride,
the transfer is approximately 12 KiB: 8 KiB of values plus 4 KiB of indices.
A complete-row delta would be 20 KiB. If position and rotation both change on
the same 1,000 rows, one 20 KiB row batch is cheaper than two 12 KiB shaped
batches, so the planner selects the row form. This avoids both 1,000 queue
writes and multi-megabyte page promotion.

The scatter path is a WebGPU optimization. It should be introduced only after
direct stream uploads establish a correct baseline, because it adds a compute
dispatch and resource-transition cost.

### Mode C: full stream write

For dense changes, upload only the affected stream:

```text
100,000 packed transforms: 1.53 MiB
100,000 current ShadoActor records: 10.68 MiB
100,000 current EqShowcaseActor records: 18.31 MiB
```

The crossover must be calibrated from measured write-call and byte costs:

```text
estimated cost = writeCalls * fixedWriteCost + bytes / effectiveBandwidth
```

Do not preserve the current universal "50% of 4 KiB pages" policy as the new
threshold. Record results by renderer, browser, and adapter class, then choose
conservative defaults with overrides.

### Mode D: GPU-owned high-churn state

If most actors move every frame, stop uploading their resolved transforms:

- upload destination/velocity/teleport commands,
- integrate transforms in compute,
- cull and compact visible indices in compute,
- write indirect draw arguments,
- render without reading counts back to the CPU.

This is a later pipeline, since Babylon's current Shado integration schedules
draw counts through `forcedInstanceCount`. Proving packed streams and compute
scatter does not depend on indirect drawing.

### Structural growth

Allocate each stream geometrically. On growth:

- create the larger GPU buffer,
- copy the existing resident prefix GPU-to-GPU when the adapter supports it,
- upload only newly initialized rows,
- retire the old resource after submitted work is safe.

The current active-range structural upload remains a correct fallback until the
renderer adapter exposes buffer copy.

## Shader language changes

### Separate logical type from storage codec

The current `@field('vec4')` syntax conflates the public type with physical GPU
storage. Add a projected-layout form:

```ts
@renderStruct({ name: 'ActorRender', layout: 'projected' })
class ActorRender {
  @renderField({
    logical: 'vec3f',
    stream: 'transform',
    codec: 'position-unorm16x3',
    domain: 'world-cell',
    update: 'hot',
  })
  position!: Float32Array;

  @renderField({
    logical: 'quatf',
    stream: 'transform',
    codec: 'quat-snorm16x4',
    update: 'hot',
  })
  rotation!: Float32Array;

  @renderField({
    logical: 'rgba',
    stream: 'appearance',
    codec: 'rgba8unorm',
    update: 'cold',
  })
  color!: Float32Array;
}
```

This is an additive API. Existing `gpuStruct` retains its 1.x float-word ABI.

A codec registry owns all representations:

```ts
type RenderCodec = {
  logicalType: string;
  words: number;
  encodeCpu: (logical: unknown, context: EncodeContext) => Uint32Array;
  emitWGSLDecode: (wordExpr: string, contextExpr: string) => string;
  emitGLSLDecode?: (wordExpr: string, contextExpr: string) => string;
  validate: (logical: unknown, context: EncodeContext) => void;
};
```

Do not accept arbitrary per-field shader snippets as codecs. Named,
versioned codecs allow CPU/WASM/shader parity tests and a stable layout
manifest.

### Generate references and field readers

Replace complete-header reconstruction:

```wgsl
let inst = ShadoInstanceContainer_instances_get(sourceIndex);
let translation = inst.translation;
let animation = inst.animationBuffer;
```

with pass-specific readers:

```wgsl
let actor = ActorRender_ref(sourceIndex);
let transform = ActorRender_transform(actor, worldCell);
let animation = ActorRender_animation(actor, clipTable);
let appearance = ActorRender_appearance(actor);
```

The compiler emits only the stream bindings and word loads used by that
pipeline variant. A non-VAT pass need not read animation. A main actor pass
need not bind label data. A nameplate pass need not reconstruct equipment and
animation.

### Make hook reads explicit

Raw typed hooks are useful extension points, but source strings prevent
reliable usage analysis. Add declared reads:

```ts
const equipmentStrategy = defineShadoStrategy({
  reads: ['appearance.armorId', 'appearance.weaponId'],
  wgsl: {
    vertexInstance: `...`,
  },
  glsl: {
    vertexInstance: `...`,
  },
});
```

During migration, built-in strategies use declared reads and legacy hooks
conservatively bind the legacy record. Later, a small shader IR can generate
WGSL and GLSL from one strategy, but a full custom shading language is not
needed for the first performance proof.

### Version the render ABI

Generated manifests should include:

- logical schema name/version,
- projection version and hash,
- stream names, word strides, and capacity,
- field-to-stream/word mapping,
- codec name/version,
- required context tables,
- WGSL feature requirements,
- WebGL fallback availability.

Fail initialization on CPU/shader manifest mismatch. Do not infer compatibility
from schema names alone.

## WebGPU-first render pipeline

Implement in this order:

```text
commands
  -> CPU/WASM SoA stores
  -> per-component dirty rows
  -> generated packed mirrors
  -> direct writes | delta/scatter | full-stream write
  -> optional GPU cull/compact
  -> visible-index indirection
  -> pass-specific WGSL readers
  -> Babylon Lite/Babylon.js public draw path
```

Use WGSL packing/unpacking built-ins first. They decode dense words to `f32`
without requiring the optional `shader-f16` feature. Native `f16` arithmetic
is a separate experiment and must be capability-gated.

Storage-buffer indirection remains preferable to instance vertex attributes
while draw order is compacted independently from actor slots. Repacking every
visible actor into an instance vertex buffer would trade shader indirection for
more CPU gathering and upload bytes.

## Measurement plan

### Repair the current benchmark

Before comparing layouts:

- initialize reducers and all lazy WASM scratch storage before warm-up;
- distinguish "fixed 1% active movers" from "1% new destinations/frame";
- use deterministic update indices and destinations;
- test clustered and random dirty distributions;
- report active bytes separately from reserved capacity;
- report dirty actors, dirty rows by stream, coalesced runs, upload mode,
  writes, logical bytes, encoded bytes, and uploaded bytes;
- add the 112-byte actor and 192-byte showcase actor paths; the current
  benchmark covers only 112-byte `ShadoEntity2D`;
- add browser WebGPU timing around encode, queue writes, scatter compute,
  vertex work, and total frame. `NullEngine` bytes are a proxy, not a GPU
  performance result.

### Required scenarios

For 10k, 20k, and 100k actors:

| Axis               | Values                                             |
| ------------------ | -------------------------------------------------- |
| Changed transforms | idle, fixed 1%, fixed 10%, 100%                    |
| Distribution       | contiguous, clustered cells, deterministic random  |
| Visible population | 10%, 50%, 100%                                     |
| Mesh variants      | 1, 8                                               |
| Features           | rigid, VAT, VAT + equipment, VAT + nameplates      |
| Projection         | current f32 AoS, split f32 streams, packed streams |
| Upload             | direct, scatter, full affected stream              |

### Initial acceptance gates

- Idle frame: zero actor/visibility upload bytes.
- Core resident projection: at most 32 bytes/actor, excluding optional label
  data and immutable tables.
- 100k, fixed 1% random transforms with scatter: at most 32 KiB transferred
  and at most two queue writes for transform deltas.
- 100k, 100% transforms: at most 1.6 MB transferred for the transform stream.
- A cold appearance change never uploads transform or animation rows.
- Main/VAT/nameplate pipelines bind and read only declared streams.
- Position and rotation error remain within declared codec budgets.
- Packed rendering must improve a browser GPU metric (GPU duration, frame
  time, or demonstrated bandwidth headroom) by at least 10% in a bandwidth
  stress case before becoming the default.
- One-million-resident integration: sustain the requested refresh cadence with
  at most 1% missed refreshes, keep p95 complete CPU/GPU frame work within the
  frame budget, and report the independent visible/VAT vertex population.
- WebGL behavior remains unchanged until the WebGPU gates pass.

## Migration plan

### Phase 0: benchmark and attribution

Touch:

- `bench/scalability-bench.mjs`
- `bench/README.md`
- `GPUUploadStats` and backing instrumentation

Deliver deterministic actor benchmarks and stream-independent baseline data.

### Phase 1: split f32 projection

Add CPU component dirty sets and separate uncompressed transform, animation,
appearance, and label storage buffers. Generate field readers and migrate one
non-VAT actor shader.

This phase proves that stream isolation and pass-specific loading win before
quantization affects parity.

### Phase 2: packed codecs

Add and parity-test:

1. `rgba8unorm`
2. packed integer IDs/flags
3. `quat-snorm16x4`
4. clip-table animation
5. cell-relative `position-unorm16x3`

Compare each codec independently to split-f32 controls.

### Phase 3: adaptive sparse upload

Add precise dirty-row runs and the compact delta/compute-scatter path. Calibrate
the crossover against full affected-stream writes.

### Phase 4: built-in pipeline migration

Migrate VAT, equipment, MSDF nameplates, dynamic entities, and picking to
declared stream reads. Remove duplicate compatibility visibility words from
the projected ABI while retaining public 1.x facades.

### Phase 5: GPU-driven high churn

Prototype command upload, compute integration/culling/compaction, and indirect
draws. Keep the CPU/WASM path for low-churn and WebGL operation.

### Phase 6: WebGL evaluation

Only after measured WebGPU wins:

- emit matching GLSL decoders from the codec registry;
- evaluate `RGBA16UI`/`RGBA32UI` or normalized integer data textures;
- extend the renderer adapter with partial texture-region upload;
- compare packed texture upload and shader cost to the legacy RGBA32F path;
- keep legacy float data textures where integer texture/binding behavior or
  partial updates do not win.

WebGL should share logical schemas and codec parity tests, not constrain the
first WebGPU physical layout.

## Risks and controls

| Risk                                             | Control                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| Decode ALU outweighs memory savings              | Add codecs one at a time and require browser GPU wins                      |
| Quantization causes jitter or cell-boundary pops | Stable cell domains, explicit error budgets, f32 escape codec              |
| Too many storage bindings                        | A few component streams, dead binding elimination, device-limit validation |
| Random sparse writes create too many calls       | Delta/compute scatter and measured adaptive thresholds                     |
| CPU encoder becomes the bottleneck               | Encode changed rows only; add WASM/SIMD encoder after profiling            |
| GPU-owned state complicates picking/readback     | Keep stable handles; read back only explicit queries asynchronously        |
| 1.x ABI consumers break                          | Add projected layouts beside `gpuStruct`; retain legacy facade and backend |
| Renderer abstraction blocks copies/compute       | Extend the small adapter explicitly; use no private mesh draw methods      |

## Primary references

- [WGSL data packing and unpacking built-ins](https://www.w3.org/TR/WGSL/#pack-builtin-functions)
- [WGSL `f16` extension and `shader-f16` feature](https://www.w3.org/TR/WGSL/#extension-f16)
- [WebGPU `GPUQueue.writeBuffer`](https://www.w3.org/TR/webgpu/#dom-gpuqueue-writebuffer)
- [WebGPU indirect drawing](https://www.w3.org/TR/webgpu/#render-commands)
- [Babylon.js WGSL and storage-buffer integration](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md)
