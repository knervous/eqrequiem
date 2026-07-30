# Babylon renderer loading strategy

Shado supports Babylon Lite and full Babylon.js without requiring applications
to load both renderers. Select one renderer at the application boundary, then
load only that renderer's core and optional features.

## Import boundaries

- `@knervous/shado/core` contains renderer-neutral packed schemas, arenas, and
  sidecar state.
- `@knervous/shado/renderer` contains the renderer adapter contract and typed
  renderer gate.
- `@knervous/shado/lite` contains the Babylon Lite adapter, instance container,
  and material helpers.
- `@knervous/shado/babylon` contains the full Babylon.js adapter.

Avoid importing both renderer-specific subpaths from the same eager module.
Dynamic provider imports preserve renderer isolation and keep unused loaders,
effects, serializers, inspectors, and plugins out of the cold-start graph.

## Select a renderer once

```ts
import { createRendererGate } from '@knervous/shado/renderer';

type RendererId = 'babylon-lite' | 'babylonjs';
type RendererFeatures = {
  loaders: typeof import('@babylonjs/loaders');
};

const selected: RendererId = supportsWebGPU ? 'babylon-lite' : 'babylonjs';

const renderer = createRendererGate<RendererId, unknown, RendererFeatures>(
  {
    'babylon-lite': async () => {
      const core = await import('./renderers/babylon-lite.js');
      return {
        id: 'babylon-lite',
        core,
        capabilities: new Set<keyof RendererFeatures>(),
        features: {},
      };
    },
    babylonjs: async () => {
      const core = await import('./renderers/babylonjs.js');
      return {
        id: 'babylonjs',
        core,
        capabilities: new Set<keyof RendererFeatures>(['loaders']),
        features: {
          loaders: () => import('@babylonjs/loaders'),
        },
      };
    },
  },
  selected
);

const core = await renderer.loadCore();
if (await renderer.supports('loaders')) {
  await renderer.loadFeature('loaders');
}
```

Provider and feature modules are loaded once and cached. An unsupported feature
throws a descriptive error. Call `renderer.dispose()` when replacing the
application runtime; renderer selection is otherwise one-way for that gate.

## Install the matching adapter

Each renderer entry module should install its adapter before constructing Shado
data:

```ts
// renderers/babylon-lite.ts
import { installBabylonLiteShadoRenderer } from '@knervous/shado/lite';

export function install(engine: object) {
  return installBabylonLiteShadoRenderer(engine);
}
```

```ts
// renderers/babylonjs.ts
import { installBabylonShadoRenderer } from '@knervous/shado/babylon';

export function install(engine: object) {
  return installBabylonShadoRenderer(engine);
}
```

The compatibility initializer can still infer either supported engine, but
explicit installation at the renderer gate is the stable application contract.
Do not replace an installed adapter with a different renderer on the same
engine.

Babylon Lite integrations use public storage, shader-material, scene callback,
and thin-instance APIs. Shado does not replace mesh render methods or call
private draw methods. The optional projected compute-scatter path is the one
exception: until Lite publishes generic compute and native storage handles,
Shado contains a feature-detected bridge to the runtime device, frame encoder,
and storage buffer. Failure to resolve that bridge falls back to a full
affected projection-stream write.
