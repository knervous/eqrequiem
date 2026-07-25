# Shado

Shado is a packed-data and rendering toolkit for Babylon Lite and Babylon.js. Define a
GPU struct once, then use the same layout for TypeScript objects, packed arenas,
AssemblyScript reducers, Babylon shader inputs, and instanced rendering.

It is intentionally a library rather than a game engine. The higher-level
rendering helpers are optional and the core schema/arena APIs can be used on
their own.

## Install

```bash
npm install @knervous/shado @babylonjs/lite
```

Babylon Lite is the preferred WebGPU renderer. Install full Babylon.js for
WebGL fallback or features that are not yet available in Lite:

```bash
npm install @babylonjs/core
npm install @babylonjs/loaders @babylonjs/serializers
npm install --save-dev assemblyscript binaryen
```

Babylon loaders are needed for model preprocessing and scene-loader examples.
AssemblyScript and Binaryen are only needed for runtime compilation or the
`@knervous/shado/asc` APIs; precompiled reducers do not require them at runtime.

## Define a packed struct

```ts
import { Shado, field, gpuStruct } from '@knervous/shado';

@gpuStruct({ name: 'ActorPool', useWasm: false })
class ActorPool extends Shado {
  @field('mat4') transform!: Float32Array;
  @field('vec4') color!: Float32Array;
  @field({ arrayOf: 'vec3' }) velocities!: Float32Array;
}

await ActorPool.initialize(engine, {
  backend: engine.isWebGPU ? 'storage' : 'datatex',
  wasm: false,
});

const pool = new ActorPool(engine);
pool.color = new Float32Array([1, 0.4, 0.1, 1]);
pool.setVarArray('velocities', [0, 1, 0, 1, 0, 0]);
```

Use `storage` with native WGSL on WebGPU. Keep `datatex` as the WebGL fallback
or for a deliberately GLSL-authored compatibility material.

## Babylon Lite

The native Lite path uses only public storage, shader-material, scene callback,
and thin-instance APIs. It does not replace mesh functions or call private draw
methods.

```ts
import {
  ShadoActor,
  ShadoLiteInstanceContainer,
  createShadoLiteMaterial,
} from '@knervous/shado/lite';

await ShadoLiteInstanceContainer.initialize(engine, {
  extra: ShadoActor,
  backend: 'storage',
  wasm: false,
});

const actors = new ShadoLiteInstanceContainer<ShadoActor>(engine);
actors.addInstances(1_000);
createShadoLiteMaterial(engine, scene, mesh, actors);
```

Assign the material before adding `mesh` to a Lite scene. Use
`@knervous/shado/renderer` to select Lite or full Babylon.js before importing
renderer-specific features. See [BABYLON_RENDERER_STRATEGY.md](./BABYLON_RENDERER_STRATEGY.md)
for the application loading contract.

## Published controls

`@shadoPublish` puts a friendly, validated facade in front of packed numeric
fields without changing their GPU layout. Enum values map to zero-based field
indices by default, while labels, descriptions, groups, and sockets remain
available to inspectors and generated UI.

```ts
import { field, gpuStruct, ShadoActor, shadoPublish } from '@knervous/shado';

@gpuStruct({ name: 'Character' })
class Character extends ShadoActor {
  @shadoPublish({
    name: 'armor',
    label: 'Armor set',
    description: 'One material family across the whole actor.',
    values: ['armorless', 'leather', 'chain', 'plate'],
  })
  @field('f32')
  armorClass!: number;

  @shadoPublish({
    name: 'mainHand',
    socket: 'r_point',
    values: ['none', 'sword', 'staff'],
  })
  @field('f32')
  weaponClass!: number;
}

actor.published.armor = 'chain'; // armorClass becomes 2
actor.published.mainHand = 'sword'; // weaponClass becomes 1
console.table(actor.published.$describe());
```

Use `$get(name)`, `$set(name, value)`, `$describe()`, or `toJSON()` when the
property name is dynamic. Invalid enum values throw before touching packed
state. Advanced adapters can provide `fromInternal` and `toInternal`.

## Precompiled WASM

```ts
await ActorPool.initialize(engine, {
  backend: engine.isWebGPU ? 'storage' : 'datatex',
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
import { deserializeShadoModel } from '@knervous/shado/preprocess/runtime';

const model = await deserializeShadoModel(
  {
    manifestUrl: 'https://example.com/shado/models.json',
    modelName: 'actor',
  },
  { animation: true, vat: 'auto' }
);
```

## Responsive runtime VAT baking

For source GLBs that must be compiled in the browser, the reusable headless
bake worker loads each GLB into a Babylon `NullEngine`, samples its skeleton,
and packs its VAT without touching the render scene or UI thread. The roster
showcase runs three independent bake workers concurrently and transfers the
source GLB and finished atlas buffers instead of cloning them.

The matrix decomposition, dual-quaternion packing, atlas layout, and float16
conversion use a bundled AssemblyScript WASM kernel. Runtime validation selects
relaxed-SIMD, fixed-width SIMD128, or the scalar compatibility kernel in that
order. Pass `kernel: 'scalar'`, `'simd'`, or `'relaxed-simd'` to
`packVatMatrices` when profiling a specific variant; normal baking should leave
selection automatic.

```ts
const packedVat = await bakeVatWithHeadlessWorker(
  '/shado/vat-bake-worker.js',
  await (await fetch('/models/human.glb')).arrayBuffer(),
  { useHalf: true, detectScale: false }
);
```

The lower-level instance-container path remains available when the source is
already loaded in the render scene. It samples there with regular task yields,
then transfers packing work to a worker:

```ts
await actors.attachMeshes(scene, meshes, skeleton, {
  vat: 'bake',
  vatOptions: {
    execution: 'worker',
    yieldEveryFrames: 6,
    useHalfDQ: true,
    detectScale: false, // only for rigs known to contain rigid bone transforms
    animationGroups,
  },
});
```

Use `detectScale: true` (the default) for unknown content. Disable it only when
the source rig is known to contain rigid bone transforms.

## Custom actor materials

`ShadoInstanceContainer` owns the generated instancing and DQ/VAT shader.
Applications can add material behavior at typed, stable insertion points by
overriding `getGLSLHooks()`; generated source remains an implementation detail.

```ts
import {
  ShadoActor,
  ShadoInstanceContainer,
  field,
  gpuStruct,
  type ShadoInstanceGLSLHooks,
} from '@knervous/shado';

@gpuStruct({ name: 'ExampleActor' })
class ExampleActor extends ShadoActor {
  @field('f32') heat!: number;
}

const HEAT_MATERIAL: ShadoInstanceGLSLHooks = {
  vertexInstance: `shadoColor.rgb *= mix(vec3(1.0), vec3(1.2, 0.5, 0.2), inst.heat);`,
};

class ExampleActors extends ShadoInstanceContainer<ExampleActor> {
  protected override getGLSLHooks() {
    return HEAT_MATERIAL;
  }
}
```

Hooks are available for vertex/fragment declarations, per-instance vertex
setup, post-position logic, and final surface composition. Keeping each shader
strategy in its own module makes it composable and avoids source
search-and-replace.

## Package entry points

- `@knervous/shado` — schemas, arenas, backings, decorators, Babylon helpers, and
  actor instancing.
- `@knervous/shado/babylon` — Babylon peer exports and resolution helpers.
- `@knervous/shado/core` — renderer-neutral schemas, arenas, and packed runtime.
- `@knervous/shado/lite` — native Babylon Lite storage and instanced rendering.
- `@knervous/shado/renderer` — typed renderer and feature gates.
- `@knervous/shado/asc` — optional AssemblyScript compilation helpers.
- `@knervous/shado/msdf` — MSDF shader registration and nameplate helpers.
- `@knervous/shado/render` — lean dynamic-entity containers, renderers, atlases,
  reducers, and picking.
- `@knervous/shado/preprocess` — Node-side model and shader preprocessing.
- `@knervous/shado/preprocess/runtime` — browser-safe artifact loading and
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
