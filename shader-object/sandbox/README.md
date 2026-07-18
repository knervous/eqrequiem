# Shader Object Sandbox

React + Vite Babylon.js sandbox for exercising the local `shader-object`
package.

## Development

```bash
npm install
npm run dev
```

The sandbox depends on the parent package as `shader-object: "file:.."`. Vite and
TypeScript use the package `source` export condition, so edits in `../src`
are consumed directly without running `npm run dev` or `npm run build` in the
parent package first. Symlink preservation ensures both projects resolve the
same Babylon.js installation.

## What It Shows

- Babylon.js 9 scene setup
- `ShadoInstanceContainer` actor instancing
- DQ/VAT mesh rendering
- WASM-backed frustum culling
- MSDF nameplate rendering backed by `NameplateData` and `shader-object/msdf`
- Lean dynamic-entity rendering, movement, picking, and batched mutations

Open `http://localhost:5173/` after starting the dev server.
