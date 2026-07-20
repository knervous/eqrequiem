# Shado Sandbox

React + Vite Babylon.js sandbox for exercising the local `@knervous/shado`
package.

## Development

```bash
npm install
npm run dev
```

The sandbox depends on the parent package as `@knervous/shado: "file:.."`. Vite and
TypeScript use the package `source` export condition, so edits in `../src`
are consumed directly without running `npm run dev` or `npm run build` in the
parent package first. Symlink preservation ensures both projects resolve the
same Babylon.js installation.

## What It Shows

- Babylon.js 9 scene setup
- `ShadoInstanceContainer` actor instancing
- DQ/VAT mesh rendering
- WASM-backed frustum culling
- MSDF nameplate rendering backed by `NameplateData` and `@knervous/shado/msdf`
- Lean dynamic-entity rendering, movement, picking, and batched mutations
- Drag-and-drop ingestion and worker/WASM VAT baking for animated GLB files

Open `http://localhost:5173/` after starting the dev server.
