import { Mesh, NullEngine, Ray, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { pickShadoInstanceWithRay } from '../src/render/ShadoAsyncPicking';

describe('Shado instance picking', () => {
  it('targets normalized GLBs using their displayed mesh bounds', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = new Mesh('native-units-model', scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, [
      -1, 0, -0.1,
      1, 0, -0.1,
      -1, 100, 0.1,
      1, 100, 0.1,
    ]);
    mesh.setIndices([0, 1, 2, 1, 3, 2]);

    // A source authored 100 units tall is normalized to five world units.
    // Its visible center is therefore y=2.5, far from the root pivot at y=0.
    const actor = {
      translation: new Float32Array([0, 0, 0, 0.05]),
      rotation: new Float32Array([0, 0, 0, 1]),
      visibleFlag: 1,
    };
    const container = { children: [actor] } as any;
    const ray = new Ray(new Vector3(0, 2.5, -10), Vector3.Forward());

    const picked = pickShadoInstanceWithRay(mesh, container, ray);
    expect(picked?.instance).toBe(actor);

    // Explicit radii retain the legacy pivot-centered behavior.
    expect(pickShadoInstanceWithRay(mesh, container, ray, { radius: 0.25 })).toBeNull();

    scene.dispose();
    engine.dispose();
  });
});
