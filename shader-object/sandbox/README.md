# Shado Sandbox

React + Vite Babylon.js sandbox for exercising the local `shado` package.

## Development

```bash
npm install
npm run dev
```

The sandbox depends on the parent package as `shado: "file:.."`. Vite and
TypeScript use the package `source` export condition, so edits in `../src`
are consumed directly without running `npm run dev` or `npm run build` in the
parent package first.

## What It Shows

- Babylon.js 9 scene setup
- `ShadoInstanceContainer` actor instancing
- DQ/VAT mesh rendering
- WASM-backed frustum culling
- MSDF nameplate rendering backed by `NameplateData` and `shado/msdf`

Open `http://localhost:5173/` after starting the dev server.
