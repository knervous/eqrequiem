import { NullEngine, Scene, Vector3 } from '@babylonjs/core';

import { EqShowcaseActor, EqShowcaseContainer } from '../src/showcase/EqShowcaseActors';
import { SHOWCASE_CULLING_WASM_BASE64 } from '../src/showcase/showcase-culling-wasm.generated';

describe('bundled showcase culling WASM', () => {
  const bytes = Uint8Array.from(Buffer.from(SHOWCASE_CULLING_WASM_BASE64, 'base64'));

  it('exports the SoA entry point consumed by the runtime', () => {
    expect(WebAssembly.validate(bytes)).toBe(true);
    const exports = WebAssembly.Module.exports(new WebAssembly.Module(bytes)).map(
      entry => entry.name
    );
    expect(exports).toContain('frustumMarkSoA');
    expect(exports).not.toContain('frustumMarkAoS');
  });

  it('binds the precompiled module to the real showcase actor shape', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const initialized = await EqShowcaseContainer.initialize(engine, {
      backend: 'datatex',
      wasm: { mode: 'precompiled', module: bytes },
      extra: EqShowcaseActor,
    });
    expect(initialized).toBe(true);

    const actors = new EqShowcaseContainer(engine);
    expect(actors.activeCullingMode).toBe('wasm-simd');
    const [actor] = actors.addInstances(1, undefined, {
      playRandomAnimation: false,
      rebuildNameplates: false,
    });
    actor.translation.set([0, 0, 0, 1]);
    actor.emitHeaderDirty();

    expect(() =>
      actors.frustumCull(
        {
          getScene: () => scene,
          globalPosition: Vector3.Zero(),
          position: Vector3.Zero(),
        } as any,
        1,
        1000
      )
    ).not.toThrow();
    expect(actors.getVisibleCount()).toBeLessThanOrEqual(1);

    actors.dispose();
    scene.dispose();
    engine.dispose();
  });

  it('keeps a reserved SoA writable when its actor arena grows WASM memory', async () => {
    const engine = new NullEngine();
    await EqShowcaseContainer.initialize(engine, {
      backend: 'datatex',
      wasm: { mode: 'precompiled', module: bytes },
      extra: EqShowcaseActor,
    });
    const pool = new EqShowcaseContainer(engine);
    pool.reserveInstances(32_768);
    const memoryBeforeActorGrowth = pool.getWasmMemory()!.buffer;

    // Grow only the actor arena. The sidecar retains sufficient logical
    // capacity, which is the fast path used near one million showcase actors.
    pool.reserveStructArray('instances', 32_769);
    expect(pool.getWasmMemory()!.buffer).not.toBe(memoryBeforeActorGrowth);
    expect(() =>
      pool.addInstances(256, undefined, {
        playRandomAnimation: false,
        rebuildNameplates: false,
      })
    ).not.toThrow();
    expect(pool.instanceCount).toBe(256);
    expect(pool.actorDirtyFlags[255]).toBe(1);
    expect(pool.children[255].translation[3]).toBe(1);

    pool.dispose();
    engine.dispose();
  });
});
