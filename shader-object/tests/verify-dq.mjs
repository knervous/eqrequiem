import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

function composeMatrix(scale, rotation, translation) {
  return Matrix.Compose(scale, rotation, translation);
}

function matrixToDQ(matrix) {
  const scale = new Vector3();
  const rotation = new Quaternion();
  const translation = new Vector3();
  matrix.decompose(scale, rotation, translation);
  rotation.normalize();

  const tx = translation.x;
  const ty = translation.y;
  const tz = translation.z;
  const { x, y, z, w } = rotation;

  const dw = -0.5 * (tx * x + ty * y + tz * z);
  const dx = 0.5 * (tx * w + ty * z - tz * y);
  const dy = 0.5 * (-tx * z + ty * w + tz * x);
  const dz = 0.5 * (tx * y - ty * x + tz * w);

  return {
    rotation,
    dual: new Quaternion(dx, dy, dz, dw),
    uniformScale: (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3,
  };
}

function dqTransformPoint(qr, qd, point) {
  const r = new Vector3(qr.x, qr.y, qr.z);
  const w = qr.w;

  const dotRP = r.x * point.x + r.y * point.y + r.z * point.z;
  const dotRR = r.x * r.x + r.y * r.y + r.z * r.z;

  const crossRP = Vector3.Cross(r, point);

  const rp = new Vector3(
    r.x * 2 * dotRP + (w * w - dotRR) * point.x + 2 * w * crossRP.x,
    r.y * 2 * dotRP + (w * w - dotRR) * point.y + 2 * w * crossRP.y,
    r.z * 2 * dotRP + (w * w - dotRR) * point.z + 2 * w * crossRP.z
  );

  const rqd = Vector3.Cross(r, new Vector3(qd.x, qd.y, qd.z));
  const t = new Vector3(
    2 * (qd.x * w - r.x * qd.w + rqd.x),
    2 * (qd.y * w - r.y * qd.w + rqd.y),
    2 * (qd.z * w - r.z * qd.w + rqd.z)
  );

  return rp.add(t);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randomQuaternion() {
  const x = rand(-1, 1);
  const y = rand(-1, 1);
  const z = rand(-1, 1);
  const w = rand(-1, 1);
  const q = new Quaternion(x, y, z, w);
  q.normalize();
  return q;
}

function randomVector(range = 5) {
  return new Vector3(rand(-range, range), rand(-range, range), rand(-range, range));
}

function nearlyEqual(a, b, eps = 1e-4) {
  return Math.abs(a - b) <= eps;
}

let maxDiff = 0;
const iterations = 1000;
for (let i = 0; i < iterations; i++) {
  const bindRot = randomQuaternion();
  const bindPos = randomVector();
  const bindScale = new Vector3(rand(0.5, 1.5), rand(0.5, 1.5), rand(0.5, 1.5));
  const currentRot = randomQuaternion();
  const currentPos = randomVector();
  const currentScale = new Vector3(rand(0.5, 1.5), rand(0.5, 1.5), rand(0.5, 1.5));

  const bindMatrix = composeMatrix(bindScale, bindRot, bindPos);
  const currentMatrix = composeMatrix(currentScale, currentRot, currentPos);
  const bindInv = bindMatrix.clone();
  bindInv.invert();
  const skinMatrix = bindInv.multiply(currentMatrix);

  const { rotation, dual } = matrixToDQ(skinMatrix);

  const point = randomVector();

  const dqResult = dqTransformPoint(rotation, dual, point.clone());
  const matResult = Vector3.TransformCoordinates(point.clone(), skinMatrix);

  const diffX = Math.abs(dqResult.x - matResult.x);
  const diffY = Math.abs(dqResult.y - matResult.y);
  const diffZ = Math.abs(dqResult.z - matResult.z);

  maxDiff = Math.max(maxDiff, diffX, diffY, diffZ);

  if (!nearlyEqual(dqResult.x, matResult.x) || !nearlyEqual(dqResult.y, matResult.y) || !nearlyEqual(dqResult.z, matResult.z)) {
    console.error('Mismatch at iteration', i);
    console.log('Bind scale:', bindScale.toString());
    console.log('Current scale:', currentScale.toString());
    console.log('DQ result:', dqResult.toString());
    console.log('Matrix result:', matResult.toString());
    process.exit(1);
  }
}

console.log('All tests passed. Max diff:', maxDiff);
