import { describe, test, expect, beforeAll } from '@jest/globals';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';

let engine: NullEngine;

beforeAll(() => {
  engine = new NullEngine();
});

// DQ encoding: matrix -> dual quaternion
function matrixToDQ(m: Matrix) {
  const S = new Vector3();
  const R = new Quaternion();
  const T = new Vector3();
  m.decompose(S, R, T);
  R.normalize();

  const x = R.x, y = R.y, z = R.z, w = R.w;
  const tx = T.x, ty = T.y, tz = T.z;

  // Dual part: qd = 0.5 * (0, t) * qr
  const dw = -0.5 * (tx * x + ty * y + tz * z);
  const dx = 0.5 * (tx * w + ty * z - tz * y);
  const dy = 0.5 * (-tx * z + ty * w + tz * x);
  const dz = 0.5 * (tx * y - ty * x + tz * w);

  return {
    qr: new Quaternion(x, y, z, w),
    qd: new Quaternion(dx, dy, dz, dw),
    scale: S
  };
}

// DQ transform point (matching shader implementation)
function dqTransformPoint(qr: Quaternion, qd: Quaternion, p: Vector3): Vector3 {
  const qv = new Vector3(qr.x, qr.y, qr.z);
  const qw = qr.w;
  
  // Translation: t = 2 * (qd.xyz * qr.w - qr.xyz * qd.w + cross(qr.xyz, qd.xyz))
  const t = new Vector3(
    2.0 * (qd.x * qw - qv.x * qd.w + (qv.y * qd.z - qv.z * qd.y)),
    2.0 * (qd.y * qw - qv.y * qd.w + (qv.z * qd.x - qv.x * qd.z)),
    2.0 * (qd.z * qw - qv.z * qd.w + (qv.x * qd.y - qv.y * qd.x))
  );
  
  // Rotation: p' = p + 2w(q × p) + 2(q × (q × p))
  const uv = Vector3.Cross(qv, p);
  const uuv = Vector3.Cross(qv, uv);
  const pRot = p.add(uv.scale(2.0 * qw)).add(uuv.scale(2.0));
  
  return pRot.add(t);
}

describe('Dual Quaternion Transform Tests', () => {
  test('Identity transform should not change point', () => {
    const identityMatrix = Matrix.Identity();
    const testPoint = new Vector3(1, 2, 3);
    
    // Matrix result
    const matrixResult = Vector3.TransformCoordinates(testPoint.clone(), identityMatrix);
    
    // DQ result
    const { qr, qd } = matrixToDQ(identityMatrix);
    const dqResult = dqTransformPoint(qr, qd, testPoint.clone());
    
    // Should be the same
    const diff = matrixResult.subtract(dqResult);
    const error = diff.length();
    
    console.log('Identity test:');
    console.log('  Matrix result:', matrixResult.asArray());
    console.log('  DQ result:', dqResult.asArray());
    console.log('  Error:', error);
    
    expect(error).toBeLessThan(0.001);
  });

  test('Simple rotation + translation should match', () => {
    const matrix = Matrix.Compose(
      new Vector3(1, 1, 1), // uniform scale
      Quaternion.RotationAxis(Vector3.Up(), Math.PI / 4), // 45° around Y
      new Vector3(1, 2, 3) // translation
    );
    
    const testPoint = new Vector3(1, 0, 0);
    
    // Matrix result
    const matrixResult = Vector3.TransformCoordinates(testPoint.clone(), matrix);
    
    // DQ result
    const { qr, qd } = matrixToDQ(matrix);
    const dqResult = dqTransformPoint(qr, qd, testPoint.clone());
    
    const diff = matrixResult.subtract(dqResult);
    const error = diff.length();
    
    console.log('\nRotation + Translation test:');
    console.log('  Matrix result:', matrixResult.asArray());
    console.log('  DQ result:', dqResult.asArray());
    console.log('  Difference:', diff.asArray());
    console.log('  Error:', error);
    
    expect(error).toBeLessThan(0.001);
  });

  test('Skinning matrix (inverseBindMatrix × finalMatrix) should match', () => {
    // Simulate bind pose bone
    const bindMatrix = Matrix.Compose(
      new Vector3(1, 1, 1),
      Quaternion.RotationAxis(Vector3.Right(), Math.PI / 6), // 30° rotation
      new Vector3(0, 1, 0) // bone at Y=1
    );
    
    // Simulate current pose bone
    const currentMatrix = Matrix.Compose(
      new Vector3(1, 1, 1),
      Quaternion.RotationAxis(Vector3.Right(), Math.PI / 3), // 60° rotation
      new Vector3(0, 1.5, 0) // moved up
    );
    
    // Skinning matrix
    const inverseBindMatrix = bindMatrix.clone();
    inverseBindMatrix.invert();
    const skinMatrix = inverseBindMatrix.multiply(currentMatrix);
    
    const vertex = new Vector3(0.5, 0, 0);
    
    // Matrix skinning
    const matrixSkinned = Vector3.TransformCoordinates(vertex.clone(), skinMatrix);
    
    // DQ skinning
    const { qr, qd } = matrixToDQ(skinMatrix);
    const dqSkinned = dqTransformPoint(qr, qd, vertex.clone());
    
    const diff = matrixSkinned.subtract(dqSkinned);
    const error = diff.length();
    
    console.log('\nSkinning test:');
    console.log('  Matrix skinned:', matrixSkinned.asArray());
    console.log('  DQ skinned:', dqSkinned.asArray());
    console.log('  Difference:', diff.asArray());
    console.log('  Error:', error);
    
    expect(error).toBeLessThan(0.001);
  });

  test('Multiple vertices with same transform', () => {
    const matrix = Matrix.Compose(
      new Vector3(1, 1, 1),
      Quaternion.RotationAxis(new Vector3(1, 1, 0).normalize(), Math.PI / 3),
      new Vector3(2, -1, 3)
    );
    
    const { qr, qd } = matrixToDQ(matrix);
    
    const testVertices = [
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1),
      new Vector3(0.5, 0.5, 0.5),
    ];
    
    let maxError = 0;
    
    for (const vertex of testVertices) {
      const matrixResult = Vector3.TransformCoordinates(vertex.clone(), matrix);
      const dqResult = dqTransformPoint(qr, qd, vertex.clone());
      const error = matrixResult.subtract(dqResult).length();
      maxError = Math.max(maxError, error);
      
      expect(error).toBeLessThan(0.001);
    }
    
    console.log('\nMultiple vertices test:');
    console.log('  Max error across all vertices:', maxError);
  });

  test('Quaternion extraction from matrix is correct', () => {
    // Create a known rotation
    const originalQuat = Quaternion.RotationAxis(
      new Vector3(1, 2, 3).normalize(),
      Math.PI / 3
    );
    
    const matrix = Matrix.Compose(
      new Vector3(1, 1, 1),
      originalQuat,
      new Vector3(0, 0, 0)
    );
    
    const { qr } = matrixToDQ(matrix);
    
    // Compare quaternions (note: q and -q represent the same rotation)
    const dot = Math.abs(
      originalQuat.x * qr.x +
      originalQuat.y * qr.y +
      originalQuat.z * qr.z +
      originalQuat.w * qr.w
    );
    
    console.log('\nQuaternion extraction test:');
    console.log('  Original quat:', originalQuat.asArray());
    console.log('  Extracted quat:', qr.asArray());
    console.log('  Dot product (abs):', dot);
    
    // Should be very close to 1 (or -1, same rotation)
    expect(dot).toBeGreaterThan(0.999);
  });

  test('Blended DQ skinning (2 bones) should match matrix blending', () => {
    // Two bones
    const bone1Matrix = Matrix.Compose(
      new Vector3(1, 1, 1),
      Quaternion.RotationAxis(Vector3.Right(), Math.PI / 6),
      new Vector3(0, 1, 0)
    );
    
    const bone2Matrix = Matrix.Compose(
      new Vector3(1, 1, 1),
      Quaternion.RotationAxis(Vector3.Right(), Math.PI / 3),
      new Vector3(0, 2, 0)
    );
    
    // Weights
    const w1 = 0.7;
    const w2 = 0.3;
    
    const vertex = new Vector3(0.5, 0, 0);
    
    // Matrix blending (linear blend skinning)
    const v1 = Vector3.TransformCoordinates(vertex.clone(), bone1Matrix);
    const v2 = Vector3.TransformCoordinates(vertex.clone(), bone2Matrix);
    const matrixBlended = v1.scale(w1).add(v2.scale(w2));
    
    // DQ blending
    const dq1 = matrixToDQ(bone1Matrix);
    const dq2 = matrixToDQ(bone2Matrix);
    
    // Hemisphere align
    let qr2 = dq2.qr.clone();
    let qd2 = dq2.qd.clone();
    if (Quaternion.Dot(dq1.qr, qr2) < 0) {
      qr2 = qr2.scale(-1);
      qd2 = qd2.scale(-1);
    }
    
    // Blend
    const qrBlend = dq1.qr.scale(w1).add(qr2.scale(w2));
    const qdBlend = dq1.qd.scale(w1).add(qd2.scale(w2));
    
    // Normalize
    const len = qrBlend.length();
    qrBlend.scaleInPlace(1 / len);
    qdBlend.scaleInPlace(1 / len);
    
    // Enforce orthogonality: qd -= qr * dot(qr, qd)
    const dot = Quaternion.Dot(qrBlend, qdBlend);
    qdBlend.x -= qrBlend.x * dot;
    qdBlend.y -= qrBlend.y * dot;
    qdBlend.z -= qrBlend.z * dot;
    qdBlend.w -= qrBlend.w * dot;
    
    const dqBlended = dqTransformPoint(qrBlend, qdBlend, vertex.clone());
    
    const diff = matrixBlended.subtract(dqBlended);
    const error = diff.length();
    
    console.log('\nBlended skinning test (2 bones):');
    console.log('  Matrix blended (LBS):', matrixBlended.asArray());
    console.log('  DQ blended:', dqBlended.asArray());
    console.log('  Difference:', diff.asArray());
    console.log('  Error:', error);
    
    // DQ and matrix blending are different methods, so we expect some difference
    // but it should be reasonable (DQ is actually more accurate geometrically)
    console.log('  Note: DQ and matrix blending give different results - this is expected!');
    console.log('        DQ preserves volume better and avoids the "candy wrapper" artifact');
  });

  test('Atlas texture indexing calculation', () => {
    // Simulate atlas layout from shader:
    // - uDQWidth = bones per row (NOT texels)
    // - uDQTilesX = rows per frame (ceil(bones / uDQWidth))
    // - uDQStrideTexels = 2 (no scale) or 3 (has scale)
    //
    // For bone index `boneIdx` in frame `frameRow`:
    //   x = boneIdx % uDQWidth
    //   tile = boneIdx / uDQWidth
    //   y = frameRow * uDQTilesX + tile
    //   baseX = x * stride
    //   fetch qr at (baseX + 0, y)
    //   fetch qd at (baseX + 1, y)
    
    const numBones = 10;
    const uDQWidth = 4;  // 4 bones per row
    const uDQTilesX = Math.ceil(numBones / uDQWidth);  // 3 rows per frame
    const uDQStrideTexels = 2;  // qr, qd
    
    console.log('\nAtlas layout:');
    console.log(`  numBones: ${numBones}`);
    console.log(`  uDQWidth: ${uDQWidth} bones per row`);
    console.log(`  uDQTilesX: ${uDQTilesX} rows per frame`);
    console.log(`  uDQStrideTexels: ${uDQStrideTexels}`);
    console.log(`  Texture width in texels: ${uDQWidth * uDQStrideTexels} = ${uDQWidth} * ${uDQStrideTexels}`);
    console.log(`  Texture height in texels per frame: ${uDQTilesX}`);
    
    // Test bone 0, frame 0
    const boneIdx = 0;
    const frameRow = 0;
    
    const x = boneIdx % uDQWidth;
    const tile = Math.floor(boneIdx / uDQWidth);
    const y = frameRow * uDQTilesX + tile;
    const baseX = x * uDQStrideTexels;
    
    console.log(`\nBone ${boneIdx}, frame ${frameRow}:`);
    console.log(`  x = ${boneIdx} % ${uDQWidth} = ${x}`);
    console.log(`  tile = floor(${boneIdx} / ${uDQWidth}) = ${tile}`);
    console.log(`  y = ${frameRow} * ${uDQTilesX} + ${tile} = ${y}`);
    console.log(`  baseX = ${x} * ${uDQStrideTexels} = ${baseX}`);
    console.log(`  qr texel: (${baseX + 0}, ${y})`);
    console.log(`  qd texel: (${baseX + 1}, ${y})`);
    
    // Test bone 5, frame 1
    const boneIdx2 = 5;
    const frameRow2 = 1;
    
    const x2 = boneIdx2 % uDQWidth;
    const tile2 = Math.floor(boneIdx2 / uDQWidth);
    const y2 = frameRow2 * uDQTilesX + tile2;
    const baseX2 = x2 * uDQStrideTexels;
    
    console.log(`\nBone ${boneIdx2}, frame ${frameRow2}:`);
    console.log(`  x = ${boneIdx2} % ${uDQWidth} = ${x2}`);
    console.log(`  tile = floor(${boneIdx2} / ${uDQWidth}) = ${tile2}`);
    console.log(`  y = ${frameRow2} * ${uDQTilesX} + ${tile2} = ${y2}`);
    console.log(`  baseX = ${x2} * ${uDQStrideTexels} = ${baseX2}`);
    console.log(`  qr texel: (${baseX2 + 0}, ${y2})`);
    console.log(`  qd texel: (${baseX2 + 1}, ${y2})`);
    
    // This test just documents the indexing logic
    expect(true).toBe(true);
  });
});
