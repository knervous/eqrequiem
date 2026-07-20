import { describe, expect, test } from '@jest/globals';

import {
  detectVatMatrixScale,
  packVatMatrices,
  selectVatKernel,
  type VATKernelFlavor,
} from '../src/extensions/VATBuilder/VATWorker';
import {
  conjugateSkeletonPalette,
  matrixToDualQuaternion,
} from '../src/extensions/VATBuilder/VATBuilder';
import { BABYLON } from '../src/babylon';

async function expectKernelToMatchBabylon(
  matrix: InstanceType<typeof BABYLON.Matrix>,
  kernel: 'auto' | VATKernelFlavor = 'auto',
) {
  const packed = await packVatMatrices({
    matrices: Float32Array.from(matrix.m),
    frames: 1,
    bones: 1,
    dqWidthBones: 1,
    tilesX: 1,
    strideTexels: 2,
    useHalf: false,
    worker: false,
    kernel,
  }) as Float32Array;
  const expected = matrixToDualQuaternion(matrix);
  const components = [
    expected.qr.x, expected.qr.y, expected.qr.z, expected.qr.w,
    expected.qd.x, expected.qd.y, expected.qd.z, expected.qd.w,
  ];
  components.forEach((value, index) => expect(packed[index]).toBeCloseTo(value, 5));
}

describe('VAT AssemblyScript packing kernel', () => {
  test('detects required uniform bone scale and rejects anisotropic scale', () => {
    const uniform = BABYLON.Matrix.Compose(
      new BABYLON.Vector3(1.6016, 1.6016, 1.6016),
      BABYLON.Quaternion.Identity(),
      BABYLON.Vector3.Zero(),
    );
    expect(detectVatMatrixScale(Float32Array.from(uniform.m))).toEqual({
      hasScale: true,
      hasAnisotropic: false,
    });

    // Blender-exported HVGirl is nominally 100x uniform, but accumulated
    // matrix noise makes the three measured axes differ by ~0.0068.
    const noisyLargeUniform = BABYLON.Matrix.Identity();
    noisyLargeUniform.m[0] = 99.996513;
    noisyLargeUniform.m[5] = 100.000203;
    noisyLargeUniform.m[10] = 100.003309;
    expect(detectVatMatrixScale(Float32Array.from(noisyLargeUniform.m))).toEqual({
      hasScale: true,
      hasAnisotropic: false,
    });

    const anisotropic = BABYLON.Matrix.Compose(
      new BABYLON.Vector3(1, 1.25, 1),
      BABYLON.Quaternion.Identity(),
      BABYLON.Vector3.Zero(),
    );
    expect(detectVatMatrixScale(Float32Array.from(anisotropic.m))).toEqual({
      hasScale: true,
      hasAnisotropic: true,
    });
  });

  test('converts a palette into the world space baked by Mesh.MergeMeshes', () => {
    // Mirrors the reflected 90-degree COLLADA root found in BrainStem.glb.
    const basis = BABYLON.Matrix.FromArray([
      -1, 0, 0, 0,
      0, 0, -1, 0,
      0, 1, 0, 0,
      0, 0, 0, 1,
    ]);
    const skin = BABYLON.Matrix.Compose(
      BABYLON.Vector3.One(),
      BABYLON.Quaternion.RotationYawPitchRoll(0.4, -0.7, 0.2),
      new BABYLON.Vector3(1.25, -0.5, 2.75),
    );
    const converted = BABYLON.Matrix.FromArray(
      conjugateSkeletonPalette(Float32Array.from(skin.m), 1, basis),
    );
    const point = new BABYLON.Vector3(0.3, 1.1, -0.8);
    const mergedPoint = BABYLON.Vector3.TransformCoordinates(point, basis);
    const expected = BABYLON.Vector3.TransformCoordinates(
      BABYLON.Vector3.TransformCoordinates(point, skin),
      basis,
    );
    const actual = BABYLON.Vector3.TransformCoordinates(mergedPoint, converted);
    expect(BABYLON.Vector3.Distance(actual, expected)).toBeLessThan(1e-6);
  });

  test('packs a translated identity skin matrix into a dual quaternion', async () => {
    const matrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      2, 4, 6, 1,
    ]);
    const packed = await packVatMatrices({
      matrices: matrix,
      frames: 1,
      bones: 1,
      dqWidthBones: 1,
      tilesX: 1,
      strideTexels: 2,
      useHalf: false,
      worker: false,
    });
    expect(packed).toBeInstanceOf(Float32Array);
    const expected = [0, 0, 0, 1, 1, 2, 3, 0];
    Array.from(packed as Float32Array).forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index], 6);
    });
  });

  test('matches Babylon decomposition for rotated and translated matrices', async () => {
    const cases = [
      BABYLON.Quaternion.RotationYawPitchRoll(0.7, 0, 0),
      BABYLON.Quaternion.RotationYawPitchRoll(0, -0.45, 0),
      BABYLON.Quaternion.RotationYawPitchRoll(0, 0, 1.1),
      BABYLON.Quaternion.RotationYawPitchRoll(-0.8, 0.35, -0.2),
    ];
    const supported = (['scalar', 'simd', 'relaxed-simd'] as const)
      .filter(kernel => {
        try { selectVatKernel(kernel); return true; } catch { return false; }
      });
    for (const kernel of supported) {
      for (const rotation of cases) {
        const matrix = BABYLON.Matrix.Compose(
          BABYLON.Vector3.One(),
          rotation,
          new BABYLON.Vector3(2.5, -1.25, 4.75),
        );
        await expectKernelToMatchBabylon(matrix, kernel);
      }
    }
  });
});
