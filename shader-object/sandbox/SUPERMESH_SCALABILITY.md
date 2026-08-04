# NM_M supermesh scalability limits

## Test workload

- 26 interchangeable mesh modules in six appearance slots
- 8,532 vertices in the complete supermesh
- 1,772 vertices in an average selected outfit
- 4.81x vertex-work amplification per visible actor
- 107 bones, 329 clips, and 17,381 shared half-DQ VAT frames
- complete VAT tiled into a 642x5794 texture using three frame columns
- 144-byte aligned Shado actor record, including six published part-selection fields

The sandbox benchmark uses full interpolated VAT by default. Hidden modules
are moved outside the clip volume only after skinning, so the full 8,532
vertices are processed for every visible actor. This is deliberately the
worst case for the proposed design.

## Limits already established

The Apple M2 Pro CPU-residency sweep reached 1,000,000 Shado actors. The final
append added 500,000 actors in 1.00 second. At one million actors:

- active packed actor records: 144,000,000 bytes
- Node heap used: 209,823,936 bytes
- process RSS: 887,422,976 bytes
- resident actors are viable, but should not all be GPU-visible

Backend ceilings are calculated at runtime from the active Babylon engine:

- WebGL data texture: `2048 * maxTextureSize * 16 / 144` actors
- WebGPU storage: `maxStorageBufferBindingSize / 144` actors
- visible-index data texture: `2048 * maxTextureSize * 4` actors
- current module code: 16 variations per slot
- current shader: six selectable slots (96 encoded modules)
- actor fields can be extended to eight slots (128 encoded modules)
- two-texel DQ VAT: `maxTextureSize / 2` bones at one tile
- frame-grid VAT capacity: `dqFramesX * floor(maxTextureSize / dqTilesX)` frames,
  with width bounded by `dqFramesX * dqWidthBones * dqStrideTexels`

For a common 16,384-pixel maximum texture size, the mathematical WebGL actor
ceiling is 3,728,270 actors and the visible-index ceiling is 134,217,728. That
actor texture would occupy roughly 512 MiB, making memory the practical limit.
A 128 MiB WebGPU storage binding holds about 932,067 actors; a 256 MiB binding
holds about 1,864,135.

## Decision rule

Use one supermesh family while its measured p95 stays within the frame budget
and vertex amplification remains bounded. The current 4.81x amplification is
reasonable for a small family but should not grow linearly across a complete
species catalog. Split large catalogs by equipment/body family, while keeping
the skeleton and VAT shared globally. This preserves the animation
deduplication without forcing every actor to skin every possible module.

## Hybrid module path

The opt-in `path=hybrid` route preserves the same dynamic six-field actor
composition but emits one compact actor list per discovered module. Unselected
module vertices do not enter the VAT shader. All module materials reference the
same VATBuilder, so body-part separation does not duplicate the 329-clip
animation library, and each actor animates from its own clip and phase (see
defect 5).

This first hybrid stage reuses animation storage and pose state but still runs
DQ deformation for every submitted actor vertex. A WebGPU compute pre-skin
cache can be layered onto these module/cohort buckets independently after the
draw-overhead versus avoided-vertex crossover is measured.

## Fidelity defects found while reviewing the demo

Three separate problems made the sandbox look wrong, none of them in the
scaling work itself.

1. **Hybrid modules skinned in the wrong basis.** `Mesh.MergeMeshes` writes its
   sources in world space, so the merged supermesh path silently got the basis
   the DQ-VAT palette is baked in. Hybrid modules keep their own draw owner and
   never went through that merge, so they were skinned as pre-transform
   vertices — and NM_M's `Armature` node carries a -X mirror, which tore every
   module apart along its bones. `bakeWorldTransformIntoVertices` now runs on
   every module owner (and on the non-merged `attachMeshes` path, which had the
   same latent hole).

2. **Atlas packing destroyed colour under transparent texels.** Page
   composition ran `putImageData` into a sprite canvas and then `drawImage`d it
   onto the page. Canvas storage is premultiplied, so every texel with
   alpha < 255 came back with its RGB scaled toward the transparent page, and
   alpha-0 texels came back pure black. The atlas now blits sprite rows
   straight into the page buffer and extrudes the bleed band by clamping in
   that buffer.

3. **UE2k4 dye combiners were never applied.** NM_M base textures carry a dye
   mask in alpha, not opacity: the glTF extras hold a `CO_AlphaBlend_With_Mask`
   combiner reading `mix(base, base * dye, base.a)`. Combined with (2) this is
   what made every actor a black silhouette. The sandbox now folds the combiner
   into each base texture before Shado packs it.

Defect (2) affects any Shado asset whose textures carry meaningful colour under
transparent texels — it is not specific to this catalog.

4. **The eye module had no material at all.** `NM_M_EY_N_1.glb` ships with no
   material, texture or sampler — the reference viewer resolves eyes at runtime
   from `materialRegistry.js` plus a loose PNG under the face texture directory,
   so the supermesh assembled a null material and the eyes rendered as flat
   white. `build-supermesh.mjs` now resolves materials for material-less
   primitives from that same registry and embeds the texture, writing the usual
   `UE2k4_MaterialTree` extras so the dye combiner in (3) applies to them too.
   `NM_M_EY_N_1_SD` names a texture the capture never shipped (only eye textures
   2, 3, 4 and 14 exist), so `pipeline.json` carries an explicit
   `moduleMaterialOverrides` entry pointing the module at `NM_M_EY_N_4_SD`.

5. **The hybrid path forced one pose on every actor.** `attachHybridModules`
   always bound a cohort animation uniform, which sets `SHADO_VAT_SHARED_POSE`
   and makes every actor read the same animation vec4 — the whole population
   moved in lockstep. The vertex path already supported per-instance animation
   (`inst.animationBuffer`); nothing but that unconditional binding stopped it.
   Poses are now `per-actor` by default and `setInstanceClip` drives each actor
   independently. `webgpu-preskin` still requires `poses: 'shared'` — it
   deforms the module library once per pose and rigid-instances the result, so
   a cohort is only meaningful when its actors hold the same pose; asking for
   `per-actor` there now throws instead of silently synchronizing.

### Benchmark data is stale

Everything under `benchmark-results/` and the published
`hybrid-preskin-performance-report.json` was captured before the fixes above
and no longer describes this code. Two effects, in opposite directions:

- `hybrid` and `cached` were measured while defect (1) had geometry exploding
  across the screen, which inflated their fragment cost.
- `hybrid` was measured with one shared pose. It now does per-actor DQ skinning,
  which is strictly more GPU work, so its numbers should get *worse* — and the
  `cached` margin over it should widen, this time for an honest reason.

The `cached` path is unchanged by defect (5) and still holds one pose by
design, so any comparison against it is a shared-pose best case. Re-run the
sweep in a real browser window before quoting any of it:

```text
/supermesh-scale?renderer=babylonjs&model=nm-m-supermesh&mode=benchmark&path=hybrid
```

The harness no longer waits on a frame quota — it spins for a wall-clock window
and samples what the host delivers, so a throttled browser reports `host-paced`
or `no samples` instead of failing, and per-frame GPU cost stays readable even
at a fraction of a frame per second. Frame-rate figures from such a host still
describe the browser rather than the renderer. The
structural benchmark (`npm run benchmark:hybrid-structure`) needs no GPU and is
current: 22 populated buckets, 4.775x vertex-work reduction, unchanged by the
pose fix.

### Still open

- Shado's fragment shader has its alpha discard commented out, so alpha-cutout
  textures render their transparent regions opaque. It shows on hair as hard
  black wedges around the silhouette. Unrelated to the modular work, but it is
  now the most visible artifact on these actors.
- The timing sweep in this document predates the fixes above. The atlas and
  dye work is load-time only, but the hybrid world-bake changes what the vertex
  shader consumes, so the sweep should be re-run before its numbers are quoted
  again.
