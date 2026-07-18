# Shader Object (Shado)

Shader Object is a packed-data and rendering toolkit for Babylon.js. Define a
GPU struct once, then use the same layout for TypeScript objects, packed arenas,
AssemblyScript reducers, Babylon shader inputs, and instanced rendering.

It is intentionally a library rather than a game engine. The higher-level
rendering helpers are optional and the core schema/arena APIs can be used on
their own.

## Install

```bash
npm install shader-object @babylonjs/core
```

Install the optional peers required by the features you use:

```bash
npm install @babylonjs/loaders @babylonjs/serializers
npm install --save-dev assemblyscript binaryen
```

Babylon loaders are needed for model preprocessing and scene-loader examples.
AssemblyScript and Binaryen are only needed for runtime compilation or the
`shader-object/asc` APIs; precompiled reducers do not require them at runtime.

## Define a packed struct

```ts
import { Shado, field, gpuStruct } from 'shader-object';

@gpuStruct({ name: 'ActorPool', useWasm: false })
class ActorPool extends Shado {
  @field('mat4') transform!: Float32Array;
  @field('vec4') color!: Float32Array;
  @field({ arrayOf: 'vec3' }) velocities!: Float32Array;
}

await ActorPool.initialize(engine, { backend: 'datatex', wasm: false });

const pool = new ActorPool(engine);
pool.color = new Float32Array([1, 0.4, 0.1, 1]);
pool.setVarArray('velocities', [0, 1, 0, 1, 0, 0]);
```

`backend: 'datatex'` works on WebGL and WebGPU. Storage-backed layouts are also
available when the target renderer supports them.

## Precompiled WASM

```ts
await ActorPool.initialize(engine, {
  backend: 'datatex',
  wasm: {
    mode: 'precompiled',
    module: await fetch('/actor-pool.wasm').then(response => response.arrayBuffer()),
  },
});
```

## Model preprocessing

The CLI can package a Babylon-readable model, bake dual-quaternion VAT data,
emit schema wrappers, and build a manifest for runtime loading.

```bash
npx shado pack models --config ./shado.config.mjs
npx shado wrappers build --config ./shado.config.mjs
npx shado manifest models --config ./shado.config.mjs
```

At runtime, compressed artifacts can be fetched directly from a CDN or GitHub:

```ts
import { deserializeShadoModel } from 'shader-object/preprocess/runtime';

const model = await deserializeShadoModel(
  {
    manifestUrl: 'https://example.com/shado/models.json',
    modelName: 'actor',
  },
  { animation: true, vat: 'auto' }
);
```

## Package entry points

- `shader-object` — schemas, arenas, backings, decorators, Babylon helpers, and
  actor instancing.
- `shader-object/babylon` — Babylon peer exports and resolution helpers.
- `shader-object/asc` — optional AssemblyScript compilation helpers.
- `shader-object/msdf` — MSDF shader registration and nameplate helpers.
- `shader-object/render` — lean dynamic-entity containers, renderers, atlases,
  reducers, and picking.
- `shader-object/preprocess` — Node-side model and shader preprocessing.
- `shader-object/preprocess/runtime` — browser-safe artifact loading and
  decompression.

## Examples and development

- [`sandbox/`](./sandbox/) is the full React/Vite validation app. It covers
  WebGL/WebGPU, DQ/VAT actor rendering, preprocessed assets, WASM reducers,
  picking, MSDF nameplates, and lean dynamic entities.
- [`playground/`](./playground/) contains a paste-ready Babylon.js Playground
  example that imports the npm package and downloads its model/VAT artifacts
  from raw GitHub URLs.

```bash
npm install
npm run typecheck
npm test
npm run build

cd sandbox
npm install
npm run build
npm run dev
```

See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for the 1.0 release and upgrade notes.

## License

MIT
