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

## NM_M supermesh scalability benchmark

Sync the generated humanoid assets, start the sandbox, and open the benchmark
route with the full Babylon.js renderer:

```bash
npm run sync:supermesh
npm run dev
```

Open the actor editor at:

```text
http://localhost:5173/supermesh-scale?renderer=babylonjs&model=nm-m-supermesh&mode=explore
```

Set `path=hybrid` to render the same catalog as independent module buckets.
Every bucket receives only the actors selecting that part, while all buckets
share one packed actor arena, VAT texture, clock, clip, and phase:

```text
http://localhost:5173/supermesh-scale?renderer=babylonjs&model=nm-m-supermesh&path=hybrid&mode=explore
```

The manifest stores six common body-part slots and each slot's available module
variations. It stores no permutation table. The GUI discovers that catalog and
maps it onto six Shado published fields statically defined for this exact NM_M
actor schema. Its 3,125 possible combinations are composed only when actors are
spawned. The target selector edits one live actor; actors can be cloned,
randomized, composed deterministically, removed, or resized as a population.
The current target is restored by the URL fields `count`, `target`, `clip`,
`bd`, `hn`, `pt`, `lg`, `hr`, and `ey`.

The route loads the complete NM_M translation: all 329 clips and 17,381 frames.
The `clip` query accepts every runtime name in the published index. The atlas is
delivered as a gzip binary plus gzip extras index rather than base64 JSON.

Set `mode=benchmark` to add actors progressively, measure steady frame and GPU
times, stop after two levels exceed 50 ms p95, and expose the JSON result as
`window.__shadoSupermeshScale`.
The development server also saves the completed result to
`benchmark-results/supermesh-latest.json`.

Useful query parameters:

- `path=bat|bat-thin|supermesh|hybrid|cached` (`bat*` paths are local captured-implementation benchmarks)
- `quality=full|medium|low|rigid`
- `counts=1,10,25,50,100,200,400,800`
- `warmup=20`
- `frames=60`

## Vercel

Create a Vercel project with `shader-object/sandbox` as its Root Directory.
Keep **Include source files outside of the Root Directory** enabled so the
linked parent `@knervous/shado` package is available during installation.
The included `vercel.json` builds `dist`, restores SPA deep links, and supplies
the cross-origin-isolation headers required by Shado's shared-memory paths.
The exact-model share URL is:

```text
/?renderer=babylonjs&model=nm-m-supermesh&mode=explore
```

The non-rendering residency benchmark can be run separately:

```bash
npm run benchmark:supermesh-residency -- --max=1000000
```
