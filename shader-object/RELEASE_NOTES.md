# Release notes

## 1.1.0 — 2026-07-29

- Added a renderer-neutral core and adapter boundary with explicit
  `@knervous/shado/core`, `@knervous/shado/renderer`, and
  `@knervous/shado/lite` entry points. The typed renderer gate dynamically
  selects Babylon Lite or full Babylon.js without eagerly loading both
  renderer graphs.
- Added the native Babylon Lite WebGPU path, including packed storage buffers,
  shader registration, thin-instance containers, and VAT materials built only
  on public Lite APIs.
- Moved per-instance visibility, compact visible indices, dirty state, and
  culling data into structure-of-arrays sidecars. Storage-buffer and
  data-texture uploads now scale with dirty pages and visible instances without
  replacing `Mesh.render` or invoking private draw methods.
- Added the world packaging and runtime APIs: spatial compilation, compressed
  artifacts, collision acceleration data, authored regions and portals,
  lighting plans, validation, visibility reducers, worker culling, and the
  `shado pack world` CLI workflow.
- Added world authoring and runtime examples to the sandbox, including the
  region editor, streamed render chunks, object rendering, collision queries,
  lighting plans, and 10k/20k/100k visibility scenarios.
- Hardened WebGPU uploads and shaders for padded layouts, packed float values,
  visibility indirection, VAT sampling, and MSDF nameplates. Native
  thin-instance accessors now preserve decorated fields and synchronize hosted
  visibility state.
- Improved compressed runtime fetch validation and model/world preprocessing,
  including clear failures for HTML fallbacks or invalid gzip payloads.
- Preserved the 1.0 public surface while widening renderer support. Legacy
  showcase UI aliases, the protected struct index map, no-argument shader
  include registration, and the published `ShadoActor` packed layout remain
  available.
- Validated the release with 138 Jest tests, nine Chromium browser scenarios,
  declaration/API comparison against published 1.0.5, package and sandbox
  production builds, clean installs, and packed-package checks.

## 1.0.4 — 2026-07-20

- Replaced showcase shader source rewriting with typed, named
  `ShadoInstanceGLSLHooks`. Armor, weapon filtering, and custom actor material
  behavior now compose through dedicated shader strategies. The five-module
  Playground demonstrates decorated packed actor classes, published controls,
  container specialization, shader extension, application wiring, and UI. Its
  schema registrations use the decorators' callable form so Babylon
  Playground can parse them without experimental decorator support.
- Reworked the online Babylon Playground into a commented developer
  integration example with explicit scene, asset, worker, nameplate, controller,
  UI, public-command, and disposal setup. Added product-neutral
  `createShadoVatShowcase*` API aliases and kept the local sandbox on that same
  public path.
- Bridged the npm and global Babylon shader stores before showcase
  initialization. Dynamically generated actor and MSDF shaders now compile in
  Babylon Playground instead of producing repeated `src/Shaders/*.fx` 404s.
- Made instance picking follow the transformed bounds of the displayed mesh
  instead of a fixed sphere at the actor root. Canonical Babylon assets such as
  Dude and HVGirl remain targetable after large native-unit normalization.
- Fixed WebGPU validation when rendering armor-enabled VAT pools. Shado now
  activates Babylon's `DrawWrapper` instead of a raw effect and compacts atlas
  page, weapon variant, and four armor layers into one vertex metadata stream,
  keeping both four- and eight-weight rigs within WebGPU's eight-buffer floor.
- Reworked the shared sandbox/Playground overlay into two full-height panels:
  a compact Shado-first roster and a dedicated selected-instance editor. The
  editor now uses names, named animations, playback speed, position, facing,
  scale, and published controls instead of exposing packed quaternion, VAT,
  glyph, and visibility internals. Selected actors receive a pulsing 3D ring.
- Split showcase catalogs, actor/container classes, and public controller types
  out of the runtime orchestration module so the local sandbox and online
  Playground continue to consume one maintainable implementation.
- Added `@shadoPublish` metadata and the `instance.published` facade for safe,
  described public controls over packed internal fields. Friendly enum values
  can now drive numeric GPU state, including complete EQ armor families and
  right-hand socket weapon selection in the showcase.
- Replaced procedural EQ armor tints with the four material families used by
  Requiem: armorless, leather, chain, and plate. Playable-race texture arrays
  are selected per instance while preserving a single VAT-backed draw pool.
- Centered nameplates from their visible glyph bounds and assigned stable
  `ModelName N` labels to canonical Babylon Playground models.
- Corrected VAT baking for GLBs with non-identity coordinate roots: merged
  vertices are transformed once and bone palettes are converted into the same
  merged world-space basis in both browser and headless-worker bake paths.
- Added solid `baseColorFactor` material support to the atlas path so dropped
  GLBs without embedded color textures retain their authored colors.
- Restored dual-quaternion spatial blending and kept Babylon's finalized,
  matrix-indexed skinning palette. This prevents hierarchical limb distortion
  on compact rigs while retaining support for GLB coordinate-root bones.
- Multi-skin GLBs now bake the skeleton actually bound to the visible body mesh
  instead of assuming the first skeleton in the file owns every mesh.
- Made headless VAT baking preserve uniform animated bone scale. The worker now
  detects required scale (including HOM's 1.6016 palette scale), emits the
  scale texel, and rejects anisotropic rigs that rigid DQ cannot represent.
- Scale validation now uses a relative anisotropy tolerance and also runs for
  dropped GLBs. Large uniformly-scaled Blender rigs such as HVGirl (~100x) no
  longer lose scale or fail because of sub-0.01% floating-point axis drift.

- Added a shared animated-GLB drop zone to the sandbox and Babylon Playground
  overlay. Dropped files are validated, auto-scaled, animation-filtered,
  headlessly VAT-baked, and registered as normal roster pools with culling,
  shuffling, random instances, and MSDF nameplates.
- Renamed the published package and all consumer imports to the scoped npm
  package `@knervous/shado`. The `shado` CLI name is unchanged.
- Added responsive runtime VAT baking with an inline Web Worker and bundled
  scalar, SIMD128, and relaxed-SIMD AssemblyScript/WASM
  matrix-to-dual-quaternion packing kernels. Runtime validation automatically
  falls back through the compatible tiers.
- Added a fully headless Babylon `NullEngine` bake worker so GLB loading,
  skeleton sampling, and atlas packing can run concurrently without rendering
  intermediate frames or submitting commands to the visible WebGPU scene.
- Added separately-authored head geometry to the roster bake input and kept
  fantasy nameplates stable while animation clips are shuffled.
- Added a rigid-rig fast path that skips the scale-detection sampling pass and
  reduced per-frame Babylon allocations during skeleton capture.
- Added a shared Shado roster showcase for the local Vite sandbox and Babylon
  Playground, including 26 playable-race variants, four NPCs, deterministic
  fantasy names, armor tint permutations, textured terrain, and a panoramic
  procedural sky.
- Added numerical parity coverage between the WASM kernel and Babylon matrix
  decomposition for translated and compound-rotated transforms.
- Fixed padded struct-array strides in generated AssemblyScript. The showcase
  actor is 192 bytes in both the TypeScript arena and SIMD culling kernel, so
  large crowds no longer corrupt transforms/animation vectors or report a
  `NaN` visible count after baking and shuffling.
- Updated the showcase shuffle to randomize crowd position and facing as well
  as motion, lowered the plane by one world unit, and replaced the tiled path
  pattern with lower-contrast procedural moss, soil, and stone terrain.
- Corrected runtime VAT sampling to preserve Babylon's finalized skinning
  palette, the validated DQ blend, and the animation evaluation order.
  Ambient crowds now select anatomically safe
  standing/locomotion clips while retaining the broader baked action library,
  and held EQ weapon geometry is normalized to a consistent display length.

## 1.0.0 — 2026-07-18

Shado reaches its first stable major release. Version 1.0 formalizes
the packed schema/arena API and includes the Babylon rendering and asset
preprocessing work that had accumulated during the 0.x prototypes.

### Highlights

- Packed GPU structs shared by TypeScript, shader layouts, and optional
  AssemblyScript reducers.
- Data-texture and storage backing support for Babylon.js.
- DQ/VAT actor instancing with pre-baked float16 and float32 animation data.
- Lean dynamic-entity rendering with batched updates, motion, culling, sorting,
  expiration, picking, and texture atlases.
- Browser-safe loading of compressed model, VAT, shader, and WASM artifacts.
- MSDF nameplate data and rendering helpers.
- A preprocessing CLI for models, wrappers, manifests, shaders, and reducers.
- Babylon.js 9 peer support with WebGL and WebGPU sandbox coverage.
- Node 24 and Apple Silicon installs no longer pull in the unused native
  `headless-gl`/ANGLE toolchain; GPU validation runs in the Babylon browser
  sandbox where the production WebGL/WebGPU paths are available.

### Breaking changes from 0.7.x

- The canonical npm package and import specifier is `@knervous/shado`.
- Consumers should import optional features from explicit subpaths such as
  `@knervous/shado/render`, `@knervous/shado/msdf`, and
  `@knervous/shado/preprocess/runtime`.
- Treat exported binary layouts, manifest version 1, and public entry points as
  the 1.x compatibility baseline. Internal source paths remain unsupported.

The CLI executable remains `shado` for concise command lines and existing
automation compatibility.

### Sandbox audit

The sandbox covers the current feature set: Babylon.js 9, WebGL/WebGPU backend
selection, packed model loading, float16/float32 DQ VAT, optional precompiled
WASM, frustum culling, asynchronous picking, MSDF nameplates, and lean entity
rendering. Its local dependency now uses the canonical package name and
preserves the package symlink so the app and source share one Babylon instance.

### Release checklist

1. Use a supported Node LTS release.
2. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`.
3. Run `npm ci && npm run build` in `sandbox/`.
4. Run `npm run pack:check` and inspect the archive before publishing.
5. Publish with `npm publish` from this directory.

Declaration generation is pinned to TypeScript 5.7 because the declaration
plugin bundled by the current `tsup` release is not yet compatible with
TypeScript 7. This pin also keeps release builds working on Node 24.
