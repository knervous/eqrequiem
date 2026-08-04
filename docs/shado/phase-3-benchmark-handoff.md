# Handoff: benchmark the phase 3 pose-palette gain

Phase 3 ("WebGPU active pose palette" in
[shado-vat-storage-and-webgpu-fetch-optimization.md](shado-vat-storage-and-webgpu-fetch-optimization.md))
is implemented and rendering correctly.

**Timed 2026-08-04 — it holds. ~30% off frame time at 5k and 10k actors, and
the 30 fps limit moves from 1,000 to 5,000.** Numbers and method below; the
rest of this document is the procedure that produced them.

## Measured: supermesh, WebGPU, full VAT

Apple M-series, Chrome, 1200x904 at dpr 2. Recordings:
`sandbox/benchmark-results/supermesh-supermesh-full-webgpu{,-palette}.json`.
These are post-`drawIndex` numbers (see "Capacity is visible actors" below);
the first three rows reproduce the pre-change sweep within ~2%.

| actors | frame ms, atlas | frame ms, palette | delta | queue ms, atlas → palette |
| -----: | --------------: | ----------------: | ----: | ------------------------: |
|  1,000 |           16.67 |             16.67 |     — | 14.6 → 13.3 |
|  5,000 |           34.38 |             24.43 | −28.9% | 137.3 → 94.7 |
| 10,000 |           66.79 |             46.11 | −31.0% | 266.8 → 180.2 |
| 20,000 |          133.68 |             86.68 | −35.2% | 533.0 → 344.2 |

- 1,000 actors is vsync-capped in both arms and separates nothing, exactly as
  this document predicted. Read the 5k row and below.
- Run-to-run spread within an arm is ~2%, against a 29–35% effect. The margin
  widens with actor count, which is what a per-vertex saving should do.
- Peak vertex throughput: **1.28 G verts/s → 1.97 G verts/s (+54%)**. The
  ~1.2 G ceiling really was per-vertex atlas sampling.
- Largest count holding 30 fps p95: **1,000 → 5,000**. Neither arm reaches
  60 fps p95 beyond 1,000 at this resolution.
- Palette cost at 20k visible, from `getPosePaletteStats()`: 34.24 MB palette +
  8.56 MB scales + 0.64 MB requests = **43.4 MB**, 107 bones per slot,
  `resolved` 20000, `overflowed` 0.

Frame time and queue-completion time agree on the size of the gain, which is
the useful cross-check: GPU timestamp queries are unavailable on this WebGPU
backend, so `gpuTimingSource` reads `queue-completion-upper-bound` and the GPU
ms column is empty. Queue completion is an upper bound inflated by
back-pressure (140 ms against a 35 ms frame) — trust its *ratio*, not its
magnitude.

## Capacity is visible actors, not population

Slots are handed out in draw order, and the vertex shader's `instanceIndex`
counts that same visible list — so the shader uses its own draw index as the
slot and there is no per-actor slot table. That is what makes the palette usable
in a culled world:

| | slots | palette + scales |
| --- | ---: | ---: |
| 20k visible, any population | 20,000 | 43 MB |
| 1M actors, if slots were per-actor | 1,000,000 | 2.14 GB |

The second row is what the original slot table required, and it also breached
Chrome's 128 MiB storage-binding limit at ~78k slots — so before this, a
population above ~78k could not use the palette at all, however few were on
screen. Set `vatPosePaletteCapacity` to the peak *visible* count.

Overflow is no longer silent: `getPosePaletteStats()` reports `overflowed` and
`peakOverflowed`, and the showcase surfaces them on `stats.posePalette`. Visible
actors past capacity still draw a wrong pose — the stat is how you find out.

## Validated under movement and culling

The full Babylon.js showcase (`/?renderer=babylonjs&backend=webgpu&palette=1`),
20,003 actors with WASM-SIMD frustum culling and per-actor motion:

- `resolved` tracks the drawn set exactly — 8,559 of 20,003 visible resolved
  8,559 slots, `overflowed` 0. Cost follows what is on screen, not what exists.
- Compiled shader carries the palette and no slot table; the atlas fetch is gone.
- Both arms hold 60 fps (16.67 ms) at 8.5k visible, so **the showcase does not
  separate the two** — at this resolution it is not vertex-bound. Use the
  supermesh sweep for timing.
- Note the showcase's own culler keeps only ~200 actors on screen when a crowd
  is scattered over its default ~750 m spread; the 8.5k figure needed the actors
  packed into one view. `?models=hum,ogm,wol` pins the catalog so two runs are
  comparable, and `?paletteCapacity=` overrides the 20k default.

Slot mapping was checked directly in the supermesh explorer with animation rate
frozen and one distinct phase per actor, which makes the render deterministic:

- Palette and atlas paths produce the **same image**.
- Reversing the visible list (draw order no longer matches actor order) leaves
  every actor's pose attached to that actor.
- Culling to every other actor drops exactly those actors and leaves the rest
  unchanged.

## Two traps that will cost you a run

1. **`backend=webgpu` is required in the URL.** The sandbox reads the backend
   from `localStorage`, defaulting to WebGL2 — the URLs below originally
   omitted it, and in a clean browser profile they benchmark WebGL2, where the
   palette is compiled out and both arms are identical by construction. Every
   URL here now pins it.
2. **Chrome stops painting an occluded window**, and the sweep then records
   `no samples` at exactly the high counts that matter. Launch a dedicated
   instance that ignores occlusion:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=/tmp/chrome-bench --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --new-window "http://localhost:5173/supermesh-scale?renderer=babylonjs&backend=webgpu&model=nm-m-supermesh&mode=benchmark&path=supermesh&counts=1000,5000,10000"
```

## What landed

- `ShadoVatInstancePosePalette` resolves every visible actor's pose into a bone
  palette once per frame. The vertex shader then reads one already-interpolated
  DQ per influence instead of sampling the DQ atlas twice and blending.
- It sits on **`attachMeshes` and the shared WGSL vertex path**, not on the
  module path. `SHADO_VAT_POSE_PALETTE` is a define inside the single
  `generateWGSLPair()` every Shado instanced material compiles from, so
  `supermesh`, `hybrid`, and the EQ showcase all reach it the same way.
- Per-actor clip, phase, and speed are preserved. This caches *bones*, not
  skinned vertices, so it carries none of the pre-skin cache's one-pose
  constraint.
- Opt-in, WebGPU only. `vatPosePalette: true` on `attachMeshes`, or
  `vatPosePalette` in the showcase options.
- Slots are assigned by draw order, deliberately skipping the pose-key cache in
  `ShadoVatPoseCache`. That cache pays off when poses repeat; with independent
  phases nearly every key is unique and the Map lookups cost CPU for nothing.

## Run the comparison

Same route, same assets, palette off then on. **WebGPU — on WebGL2 the palette
is ignored and both runs are identical.**

```text
/supermesh-scale?renderer=babylonjs&backend=webgpu&model=nm-m-supermesh&mode=benchmark&path=supermesh&counts=1000,5000,10000&palette=0
/supermesh-scale?renderer=babylonjs&backend=webgpu&model=nm-m-supermesh&mode=benchmark&path=supermesh&counts=1000,5000,10000
```

For the EQ showcase, `?renderer=babylonjs&backend=webgpu&palette=1` against
`&palette=0`. **The showcase arm has not been run** — only the supermesh route
above has numbers.

Read the **GPU/queue ms** column. Frame time is vsync-capped until the GPU
saturates, so it only separates the two at the top counts.

Run it in a **real browser window**. The harness no longer fails under a
throttled host — it spins for a wall-clock window and samples what arrives — but
a throttled host reports `host-paced` or `no samples`, and those rows are
excluded from the fps limits and peak throughput on purpose. The embedded
review browser only renders while being driven, so it cannot produce these runs.

The dev server writes each completed run to
`sandbox/benchmark-results/supermesh-latest.json` and to a name built from the
path, quality, backend, and palette state, so the two arms of a comparison land
in separate files (`…-webgpu.json` and `…-webgpu-palette.json`). Re-running the
same arm still overwrites.

## Confirm the palette actually engaged before trusting a number

A silent fallback to the atlas path renders identically. Every recording now
carries `backend.posePalette`, which reads the compiled shader rather than the
requested option — `compiledPalette` true and `compiledAtlasFetch` false is the
proof that the palette ran, and it is what distinguishes the two files on disk.

To check a live session from the console:

```js
const m = BABYLON.EngineStore.LastCreatedScene.meshes
  .find(x => x.material?.name?.startsWith('ShadoMaterial_'));
const src = m.material.getEffect()._vertexSourceCode;
src.includes('uShadoPosePalette');      // must be true
src.includes('textureLoad(uDQAtlas');   // must be false
```

`container.getPosePaletteStats()` should report `resolved` equal to the visible
actor count (it reads 0 before the first frame).

## What was expected, and what happened

This was the prediction before the run. It survived: the measured ceiling moved
from 1.24 G to 1.78 G verts/s, and frame time fell ~30% — less than the halved
memory-operation count, which is what you would expect when atlas sampling is
the dominant cost but not the only one.

Supermesh saturates at ~1.2 G verts/s, and that ceiling is per-vertex atlas
sampling — exactly what the palette removes. At 10k actors:

```
today   : 4 influences x 2 atlas fetches = 683 M texture loads/frame
phase 3 : 4 palette reads                = 341 M storage reads/frame
                                         + 1.07 M compute resolves
```

Half the memory operations, moved from a 642x5794 atlas to a ~17 MiB hot
buffer, with frame interpolation done once per bone per pose instead of once per
bone-influence per vertex. If GPU ms does **not** move, the likely causes in
order: the palette silently fell back (check above); the workload is fragment-
or draw-bound at that resolution rather than vertex-bound; or the palette buffer
is large enough to miss cache, in which case try fewer actors.

## Sizing caveat

Capacity is still fixed at attach time (`vatPosePaletteCapacity`, default 4096)
and now counts peak *visible* actors. The supermesh route passes the sweep max;
the showcase defaults to 20,000 slots per pool and takes `?paletteCapacity=`.

## Existing recordings are stale

The two `supermesh-supermesh-full-webgpu*.json` recordings are current as of
2026-08-04. Everything else in `sandbox/benchmark-results/` and the published
`hybrid-preskin-performance-report.json` predates the hybrid world-bake fix, the
per-actor pose fix, and phase 3. See the "Benchmark data is stale" section in
`sandbox/SUPERMESH_SCALABILITY.md`. Do not diff new numbers against them —
re-run each path.

## Still open

- `bat`, `bat-thin`, `hybrid`, and `cached` remain stale; only `supermesh` was
  re-run.
- Request uploads now send only the used prefix, but the per-frame CPU loop
  still walks every visible actor in JS. At 20k visible that is the next thing
  to measure.
- Why the showcase's culler holds the drawn set near 200 for a scattered crowd
  was not chased down — it is not something the palette affects.
- No 60 fps p95 row exists in either arm past 1,000 actors at dpr 2. Whether
  that is fragment cost would take a run at a smaller canvas to answer, and
  would say how much of the remaining frame is still vertex work.

## Not implemented

Phase 4 (influence-count LOD) and phase 5 (pose sorting / phase cohorts).
Phase 5 is what would let the `cached` pre-skin path serve per-actor poses.
