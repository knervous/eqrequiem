# shado

Low-level struct, arena, WASM, and Babylon.js GPU buffer bridge.

`shado` is not a game engine. It defines structured data once and maps it across
TypeScript overlay logic, AssemblyScript reducers, Babylon shaders/buffers, and
render plugins.

## Install

```bash
npm i shado @babylonjs/core
```

Runtime AssemblyScript compilation is optional. Install compiler peers only if
you use `wasm: "runtime"` or `shado/asc`:

```bash
npm i -D assemblyscript binaryen
```

## Basic Usage

```ts
import { Shado, gpuStruct, field } from "shado";

@gpuStruct({ name: "ActorPool", useWasm: false })
class ActorPool extends Shado {
  @field("mat4") transform!: Float32Array;
  @field("vec4") color!: Float32Array;
  @field({ arrayOf: "vec3" }) velocities!: Float32Array;
}

await ActorPool.initialize(engine, { wasm: false, backend: "datatex" });

const pool = new ActorPool(engine);
pool.color = new Float32Array([1, 0, 0, 1]);
pool.setVarArray("velocities", [0, 1, 0, 1, 0, 0]);
```

## Precompiled WASM

```ts
await ActorPool.initialize(engine, {
  wasm: { mode: "precompiled", module: await WebAssembly.compile(bytes) },
});
```

## AssemblyScript CLI

```bash
shado asc build --config ./shado.config.mjs
```

```ts
// shado.config.mjs
export default {
  asc: {
    inputPaths: ["assembly/index.ts"],
    outFile: "dist/shado.wasm",
    textFile: "dist/shado.wat",
    simd: true,
  },
};
```

## Package Entrypoints

- `shado`: core schema, arena, backings, decorators, Babylon material helpers.
- `shado/babylon`: Babylon peer resolution helpers and type re-exports.
- `shado/asc`: optional runtime/precompile AssemblyScript helpers.
- `shado/msdf`: MSDF shader registration and nameplate data helpers.

