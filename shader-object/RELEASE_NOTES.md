# Release notes

## 1.0.0 — 2026-07-18

Shader Object reaches its first stable major release. Version 1.0 formalizes
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

- The canonical npm package and import specifier is `shader-object`. The old
  local sandbox alias `shado` was never the published package name and has been
  removed from examples.
- Consumers should import optional features from explicit subpaths such as
  `shader-object/render`, `shader-object/msdf`, and
  `shader-object/preprocess/runtime`.
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
