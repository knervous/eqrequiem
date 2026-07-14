import * as BABYLON from '@babylonjs/core';

// DQ encoding: matrix -> dual quaternion
function matrixToDQ(m: BABYLON.Matrix) {
  const S = new BABYLON.Vector3();
  const R = new BABYLON.Quaternion();
  const T = new BABYLON.Vector3();
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
    qr: new BABYLON.Quaternion(x, y, z, w),
    qd: new BABYLON.Quaternion(dx, dy, dz, dw),
    scale: S
  };
}

// DQ transform point
function dqTransformPoint(qr: BABYLON.Quaternion, qd: BABYLON.Quaternion, p: BABYLON.Vector3): BABYLON.Vector3 {
  const qv = new BABYLON.Vector3(qr.x, qr.y, qr.z);
  const qw = qr.w;
  
  // Translation
  const t = new BABYLON.Vector3(
    2.0 * (qd.x * qw - qv.x * qd.w + (qv.y * qd.z - qv.z * qd.y)),
    2.0 * (qd.y * qw - qv.y * qd.w + (qv.z * qd.x - qv.x * qd.z)),
    2.0 * (qd.z * qw - qv.z * qd.w + (qv.x * qd.y - qv.y * qd.x))
  );
  
  // Rotation: p' = p + 2w(q × p) + 2(q × (q × p))
  const uv = BABYLON.Vector3.Cross(qv, p);
  const uuv = BABYLON.Vector3.Cross(qv, uv);
  const pRot = p.add(uv.scale(2.0 * qw)).add(uuv.scale(2.0));
  
  return pRot.add(t);
}

// Test with a simple transform
export function testDQTransform() {
  console.log('\n=== DQ Transform Test ===\n');
  
  // Create a simple transform matrix: rotate 45° around Y, translate by (1, 2, 3)
  const matrix = BABYLON.Matrix.Compose(
    new BABYLON.Vector3(1, 1, 1), // scale
    BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), Math.PI / 4), // 45° rotation
    new BABYLON.Vector3(1, 2, 3) // translation
  );
  
  // Test point
  const testPoint = new BABYLON.Vector3(1, 0, 0);
  
  // Transform with matrix
  const matrixResult = BABYLON.Vector3.TransformCoordinates(testPoint, matrix);
  console.log('Matrix transform result:', matrixResult.asArray());
  
  // Transform with DQ
  const { qr, qd, scale } = matrixToDQ(matrix);
  console.log('Extracted qr:', qr.asArray());
  console.log('Extracted qd:', qd.asArray());
  console.log('Extracted scale:', scale.asArray());
  
  const dqResult = dqTransformPoint(qr, qd, testPoint);
  console.log('DQ transform result:', dqResult.asArray());
  
  // Calculate difference
  const diff = matrixResult.subtract(dqResult);
  const error = diff.length();
  console.log('Difference:', diff.asArray());
  console.log('Error magnitude:', error);
  
  if (error < 0.001) {
    console.log('✓ TEST PASSED: DQ matches matrix transform');
  } else {
    console.log('✗ TEST FAILED: DQ does not match matrix transform');
  }
  
  return error < 0.001;
}

// Test with skinning matrix (inverseBindMatrix × finalMatrix)
export function testSkinningDQ() {
  console.log('\n=== Skinning DQ Test ===\n');
  
  // Simulate a bone setup
  const bindMatrix = BABYLON.Matrix.Compose(
    new BABYLON.Vector3(1, 1, 1),
    BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), Math.PI / 6),
    new BABYLON.Vector3(0, 1, 0) // bone at Y=1
  );
  
  const currentMatrix = BABYLON.Matrix.Compose(
    new BABYLON.Vector3(1, 1, 1),
    BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), Math.PI / 3), // rotated more
    new BABYLON.Vector3(0, 1.5, 0) // moved up
  );
  
  const inverseBindMatrix = bindMatrix.clone();
  inverseBindMatrix.invert();
  
  const skinMatrix = inverseBindMatrix.multiply(currentMatrix);
  
  // Test point (vertex in mesh-local space)
  const vertex = new BABYLON.Vector3(0.5, 0, 0);
  
  // Transform with matrix skinning
  const matrixSkinned = BABYLON.Vector3.TransformCoordinates(vertex, skinMatrix);
  console.log('Matrix skinned vertex:', matrixSkinned.asArray());
  
  // Transform with DQ skinning
  const { qr, qd } = matrixToDQ(skinMatrix);
  const dqSkinned = dqTransformPoint(qr, qd, vertex);
  console.log('DQ skinned vertex:', dqSkinned.asArray());
  
  const diff = matrixSkinned.subtract(dqSkinned);
  const error = diff.length();
  console.log('Difference:', diff.asArray());
  console.log('Error magnitude:', error);
  
  if (error < 0.001) {
    console.log('✓ TEST PASSED: DQ skinning matches matrix skinning');
  } else {
    console.log('✗ TEST FAILED: DQ skinning does not match matrix skinning');
  }
  
  return error < 0.001;
}

// Test identity transform
export function testIdentityDQ() {
  console.log('\n=== Identity DQ Test ===\n');
  
  const identityMatrix = BABYLON.Matrix.Identity();
  const testPoint = new BABYLON.Vector3(1, 2, 3);
  
  const matrixResult = BABYLON.Vector3.TransformCoordinates(testPoint, identityMatrix);
  console.log('Matrix identity result:', matrixResult.asArray());
  
  const { qr, qd } = matrixToDQ(identityMatrix);
  console.log('Identity qr:', qr.asArray());
  console.log('Identity qd:', qd.asArray());
  
  const dqResult = dqTransformPoint(qr, qd, testPoint);
  console.log('DQ identity result:', dqResult.asArray());
  
  const diff = matrixResult.subtract(dqResult);
  const error = diff.length();
  console.log('Error magnitude:', error);
  
  if (error < 0.001) {
    console.log('✓ TEST PASSED: Identity DQ works correctly');
  } else {
    console.log('✗ TEST FAILED: Identity DQ is broken');
  }
  
  return error < 0.001;
}

export function runAllDQTests() {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║   Dual Quaternion Transform Tests  ║');
  console.log('╚════════════════════════════════════╝');
  
  const results = [
    testIdentityDQ(),
    testDQTransform(),
    testSkinningDQ()
  ];
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('\n' + '='.repeat(40));
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log('='.repeat(40) + '\n');
  
  return passed === total;
}
