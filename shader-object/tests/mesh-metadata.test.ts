import { Mesh, NullEngine, Scene, VertexBuffer } from '@babylonjs/core';
import { compactShadoVertexMetadata } from '../src/extensions/ShadoInstanceContainer/mesh-data';

describe('compactShadoVertexMetadata', () => {
  it('packs page, weapon, and four armor layers into one WebGPU-safe stream', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = new Mesh('metadata', scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, new Float32Array([0, 0, 0, 1, 0, 0]), false, 3);
    mesh.setVerticesData(VertexBuffer.ColorKind, new Float32Array(8).fill(1), false, 4);
    mesh.setVerticesData('aPage', new Float32Array([3, 4]), false, 1);
    mesh.setVerticesData('aPart', new Float32Array([2, 1]), false, 1);
    mesh.setVerticesData('aWeapon', new Float32Array([2, 0]), false, 1);
    mesh.setVerticesData('aEqLayers', new Float32Array([
      -1, 1, 5, 163,
      0, 2, 10, 20,
    ]), false, 4);

    compactShadoVertexMetadata(mesh);

    expect(Array.from(mesh.getVerticesData('aMeta')!)).toEqual([
      3, 2, 512, 41990,
      4, 0, 769, 5387,
    ]);
    for (const removed of ['aPage', 'aPart', 'aWeapon', 'aEqLayers', VertexBuffer.ColorKind]) {
      expect(mesh.isVerticesDataPresent(removed)).toBe(false);
    }

    mesh.dispose();
    scene.dispose();
    engine.dispose();
  });
});
