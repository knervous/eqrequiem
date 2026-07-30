import { NullEngine } from '@babylonjs/core';

import { ShadoActor } from '../src/extensions/ShadoActor';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer';
import { ShadoLiteInstanceContainer } from '../src/lite/ShadoLiteInstanceContainer';

describe('bulk instance append', () => {
  it('uses one structural mutation while preserving full-container actor behavior', async () => {
    const engine = new NullEngine();
    await ShadoInstanceContainer.initialize(engine, {
      wasm: false,
      extra: ShadoActor,
    });
    const actors = new ShadoInstanceContainer<ShadoActor>(engine);
    actors.reserveInstances(10_000);
    const version = (actors as any)._structVersion;

    const created = actors.addInstances(10_000, undefined, {
      playRandomAnimation: false,
      rebuildNameplates: false,
    });

    expect(created).toHaveLength(10_000);
    expect(actors.children).toHaveLength(10_000);
    expect(actors.instanceCount).toBe(10_000);
    expect((actors as any)._structVersion).toBe(version + 1);
    expect((actors as any)._structArrayCount.instances).toBe(10_000);
    expect((actors as any)._instanceSoA.dirtyActorBounds).toEqual({
      start: 0,
      end: 10_000,
    });
    expect(created[9_999].translation[3]).toBe(1);

    actors.dispose();
    engine.dispose();
  });

  it('uses the same one-mutation append pattern in Babylon Lite', async () => {
    const engine = new NullEngine();
    (engine as any)._isWebGPU = true;
    await ShadoLiteInstanceContainer.initialize(engine, {
      wasm: false,
      backend: 'storage',
      extra: ShadoActor,
    });
    const actors = new ShadoLiteInstanceContainer<ShadoActor>(engine);
    actors.reserveInstances(10_000);
    const version = (actors as any)._structVersion;

    const created = actors.addInstances(10_000);

    expect(created).toHaveLength(10_000);
    expect(actors.children).toHaveLength(10_000);
    expect(actors.instanceCount).toBe(10_000);
    expect(actors.getVisibleCount()).toBe(10_000);
    expect(actors.visibleActorIndices[0]).toBe(0);
    expect(actors.visibleActorIndices[9_999]).toBe(9_999);
    expect((actors as any)._structVersion).toBe(version + 1);
    expect((actors as any)._structArrayCount.instances).toBe(10_000);
    expect(created[9_999].translation[3]).toBe(1);

    actors.dispose();
    engine.dispose();
  });
});
