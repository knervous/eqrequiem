import { Mesh, Matrix, NullEngine, Scene, VertexBuffer } from '@babylonjs/core';
import { blit, extrude } from '../src/extensions/AtlasBuilder/AtlasBuilder';
import { bakeWorldTransformIntoVertices } from '../src/extensions/ShadoInstanceContainer/mesh-data';

function page(size: number) {
  return new Uint8ClampedArray(size * size * 4);
}

function texel(buffer: Uint8ClampedArray, size: number, x: number, y: number) {
  const offset = (y * size + x) * 4;
  return Array.from(buffer.subarray(offset, offset + 4));
}

describe('atlas page composition', () => {
  it('preserves colour under fully transparent texels', () => {
    // The regression: page composition used to run through a 2D canvas, whose
    // premultiplied storage rewrote every alpha-0 texel to black. UE-style
    // assets carry a dye mask in alpha, so whole garments packed as black.
    const sprite = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        41, 56, 82, 0,
        90, 20, 30, 128,
      ]),
    } as ImageData;

    const buffer = page(4);
    blit(buffer, 4, sprite, 1, 1);

    expect(texel(buffer, 4, 1, 1)).toEqual([41, 56, 82, 0]);
    expect(texel(buffer, 4, 2, 1)).toEqual([90, 20, 30, 128]);
  });

  it('places each sprite row at its own page offset', () => {
    const sprite = {
      width: 1,
      height: 2,
      data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]),
    } as ImageData;

    const buffer = page(4);
    blit(buffer, 4, sprite, 2, 1);

    expect(texel(buffer, 4, 2, 1)).toEqual([1, 2, 3, 4]);
    expect(texel(buffer, 4, 2, 2)).toEqual([5, 6, 7, 8]);
    expect(texel(buffer, 4, 2, 0)).toEqual([0, 0, 0, 0]);
  });

  it('bleeds the rect edge outward without touching its interior', () => {
    const buffer = page(5);
    const sprite = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 0]),
    } as ImageData;
    blit(buffer, 5, sprite, 2, 2);

    extrude(buffer, 5, 2, 2, 1, 1, 1);

    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) {
      expect(texel(buffer, 5, x, y)).toEqual([10, 20, 30, 0]);
    }
    expect(texel(buffer, 5, 2, 2)).toEqual([10, 20, 30, 0]);
    // Outside the bleed band stays untouched.
    expect(texel(buffer, 5, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('clamps the bleed band to the page bounds', () => {
    const buffer = page(3);
    const sprite = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([7, 7, 7, 255]),
    } as ImageData;
    blit(buffer, 3, sprite, 0, 0);

    expect(() => extrude(buffer, 3, 0, 0, 1, 1, 2)).not.toThrow();
    expect(texel(buffer, 3, 2, 2)).toEqual([7, 7, 7, 255]);
  });
});

describe('bakeWorldTransformIntoVertices', () => {
  it('moves a parented mesh into world space and leaves an identity matrix', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new Mesh('root', scene);
    // The NM_M armature carries exactly this mirror; unbaked module vertices
    // were skinned in their own mirror image and tore apart at every bone.
    root.scaling.set(-1, 1, 1);
    const mesh = new Mesh('module', scene);
    mesh.parent = root;
    mesh.position.set(0, 2, 0);
    mesh.setVerticesData(VertexBuffer.PositionKind, new Float32Array([1, 0, 0, 0, 0, 3]), false, 3);
    mesh.setVerticesData(VertexBuffer.NormalKind, new Float32Array([1, 0, 0, 0, 0, 1]), false, 3);

    bakeWorldTransformIntoVertices(mesh);

    expect(Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!)).toEqual([-1, 2, 0, 0, 2, 3]);
    expect(Array.from(mesh.getVerticesData(VertexBuffer.NormalKind)!)).toEqual([-1, 0, 0, 0, 0, 1]);
    expect(mesh.parent).toBeNull();
    expect(mesh.computeWorldMatrix(true).equals(Matrix.Identity())).toBe(true);

    scene.dispose();
    engine.dispose();
  });

  it('leaves an already world-space mesh untouched', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = new Mesh('module', scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, new Float32Array([1, 2, 3]), false, 3);

    bakeWorldTransformIntoVertices(mesh);

    expect(Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!)).toEqual([1, 2, 3]);
    expect(mesh.computeWorldMatrix(true).equals(Matrix.Identity())).toBe(true);

    scene.dispose();
    engine.dispose();
  });
});
