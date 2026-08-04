# Handoff: benchmark the phase 3 pose-palette gain

Phase 3 ("WebGPU active pose palette" in
[shado-vat-storage-and-webgpu-fetch-optimization.md](shado-vat-storage-and-webgpu-fetch-optimization.md))
is implemented and rendering correctly. **It has not been timed.** That is the
next job.

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
/supermesh-scale?renderer=babylonjs&model=nm-m-supermesh&mode=benchmark&path=supermesh&counts=1000,5000,10000&palette=0
/supermesh-scale?renderer=babylonjs&model=nm-m-supermesh&mode=benchmark&path=supermesh&counts=1000,5000,10000
```

For the EQ showcase, `?renderer=babylonjs&palette=1` against `&palette=0`.

Read the **GPU/queue ms** column. Frame time is vsync-capped until the GPU
saturates, so it only separates the two at the top counts.

Run it in a **real browser window**. The harness no longer fails under a
throttled host — it spins for a wall-clock window and samples what arrives — but
a throttled host reports `host-paced` or `no samples`, and those rows are
excluded from the fps limits and peak throughput on purpose. The embedded
review browser only renders while being driven, so it cannot produce these runs.

The dev server writes each completed run to
`sandbox/benchmark-results/supermesh-latest.json`, **overwriting it** — copy the
file between runs or the second clobbers the first.

## Confirm the palette actually engaged before trusting a number

A silent fallback to the atlas path renders identically. Check the compiled
shader, not the render:

```js
const m = BABYLON.EngineStore.LastCreatedScene.meshes
  .find(x => x.material?.name?.startsWith('ShadoMaterial_'));
const src = m.material.getEffect()._vertexSourceCode;
src.includes('uShadoPosePalette');      // must be true
src.includes('textureLoad(uDQAtlas');   // must be false
```

`container.getPosePaletteStats()` should report `resolved` equal to the visible
actor count (it reads 0 before the first frame).

## What to expect, and what would disprove it

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

Capacity is fixed at attach time (`vatPosePaletteCapacity`, default 4096).
Actors past it pin to slot 0 — wrong pose, not a crash. The supermesh route
passes the sweep max; the EQ showcase does not, so its "Add 10,000" button will
overflow the default.

## Existing recordings are stale

Everything in `sandbox/benchmark-results/` and the published
`hybrid-preskin-performance-report.json` predates the hybrid world-bake fix, the
per-actor pose fix, and phase 3. See the "Benchmark data is stale" section in
`sandbox/SUPERMESH_SCALABILITY.md`. Do not diff new numbers against them —
re-run each path.

## Not implemented

Phase 4 (influence-count LOD) and phase 5 (pose sorting / phase cohorts).
Phase 5 is what would let the `cached` pre-skin path serve per-actor poses.
