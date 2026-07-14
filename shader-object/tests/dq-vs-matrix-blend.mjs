import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';

function decompose(matrix) {
  const scale = new Vector3();
  const rotation = new Quaternion();
  const translation = new Vector3();
  matrix.decompose(scale, rotation, translation);
  rotation.normalize();
  return { scale, rotation, translation };
}

function matToDQ(matrix) {
  const { scale, rotation, translation } = decompose(matrix);
  const tx = translation.x;
  const ty = translation.y;
  const tz = translation.z;
  const { x, y, z, w } = rotation;
  const dw = -0.5 * (tx * x + ty * y + tz * z);
  const dx = 0.5 * (tx * w + ty * z - tz * y);
  const dy = 0.5 * (-tx * z + ty * w + tz * x);
  const dz = 0.5 * (tx * y - ty * x + tz * w);
  return { rotation, dual: new Quaternion(dx, dy, dz, dw), scale };
}

function dqNormalizeConsistent(qr, qd) {
  const n2 = Math.max(qr.lengthSquared(), 1e-20);
  const invn = 1 / Math.sqrt(n2);
  qr = qr.scale(invn);
  qd = qd.scale(invn);
  const dot = qr.x * qd.x + qr.y * qd.y + qr.z * qd.z + qr.w * qd.w;
  qd = new Quaternion(
    qd.x - qr.x * dot,
    qd.y - qr.y * dot,
    qd.z - qr.z * dot,
    qd.w - qr.w * dot
  );
  return { qr, qd };
}

function dqHemisphereAlign(qr, qd, ref) {
  if (qr.x * ref.x + qr.y * ref.y + qr.z * ref.z + qr.w * ref.w < 0) {
    qr = qr.scale(-1);
    qd = qd.scale(-1);
  }
  return { qr, qd };
}

function dqTransformPoint(qr, qd, p) {
  const r = new Vector3(qr.x, qr.y, qr.z);
  const w = qr.w;
  const dotRP = r.dot(p);
  const dotRR = r.dot(r);
  const crossRP = Vector3.Cross(r, p);
  const rp = new Vector3(
    r.x * 2 * dotRP + (w * w - dotRR) * p.x + 2 * w * crossRP.x,
    r.y * 2 * dotRP + (w * w - dotRR) * p.y + 2 * w * crossRP.y,
    r.z * 2 * dotRP + (w * w - dotRR) * p.z + 2 * w * crossRP.z
  );
  const qdVec = new Vector3(qd.x, qd.y, qd.z);
  const crossRQD = Vector3.Cross(r, qdVec);
  const t = new Vector3(
    2 * (qd.x * w - r.x * qd.w + crossRQD.x),
    2 * (qd.y * w - r.y * qd.w + crossRQD.y),
    2 * (qd.z * w - r.z * qd.w + crossRQD.z)
  );
  return rp.addInPlace(t);
}

function randomQuaternion() {
  const q = new Quaternion(Math.random(), Math.random(), Math.random(), Math.random());
  q.normalize();
  return q;
}

function randomVector(range = 1) {
  return new Vector3(
    (Math.random() * 2 - 1) * range,
    (Math.random() * 2 - 1) * range,
    (Math.random() * 2 - 1) * range
  );
}

function randomScale(range = 1) {
  return new Vector3(
    0.5 + Math.random() * range,
    0.5 + Math.random() * range,
    0.5 + Math.random() * range
  );
}

function compose(scale, rotation, translation) {
  return Matrix.Compose(scale, rotation, translation);
}

function blendDQ(bones, weights, point) {
  let rSum = new Quaternion(0, 0, 0, 0);
  let dSum = new Quaternion(0, 0, 0, 0);
  let logScaleSum = new Vector3(0, 0, 0);
  let scaleSignSum = new Vector3(0, 0, 0);
  for (let i = 0; i < bones.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    let { rotation, dual, scale } = bones[i];
    if (rSum.lengthSquared() > 0) {
      const aligned = dqHemisphereAlign(rotation, dual, rSum);
      rotation = aligned.qr;
      dual = aligned.qd;
    }
    rSum = rSum.add(rotation.scale(w));
    dSum = dSum.add(dual.scale(w));
    const sx = Math.max(Math.abs(scale.x), 1e-6);
    const sy = Math.max(Math.abs(scale.y), 1e-6);
    const sz = Math.max(Math.abs(scale.z), 1e-6);
    logScaleSum = logScaleSum.add(new Vector3(Math.log(sx), Math.log(sy), Math.log(sz)).scale(w));
    scaleSignSum = scaleSignSum.add(
      new Vector3(Math.sign(scale.x) || 1, Math.sign(scale.y) || 1, Math.sign(scale.z) || 1).scale(w)
    );
  }
  let norm = dqNormalizeConsistent(rSum, dSum);
  const expScale = new Vector3(Math.exp(logScaleSum.x), Math.exp(logScaleSum.y), Math.exp(logScaleSum.z));
  const sign = new Vector3(
    Math.sign(scaleSignSum.x) || 1,
    Math.sign(scaleSignSum.y) || 1,
    Math.sign(scaleSignSum.z) || 1
  );
  const scaledPoint = new Vector3(
    point.x * expScale.x * sign.x,
    point.y * expScale.y * sign.y,
    point.z * expScale.z * sign.z
  );
  return dqTransformPoint(norm.qr, norm.qd, scaledPoint);
}

function blendMatrix(matrices, weights, point) {
  let result = new Vector3(0, 0, 0);
  for (let i = 0; i < matrices.length; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    const transformed = Vector3.TransformCoordinates(point, matrices[i]);
    result = result.add(transformed.scale(w));
  }
  return result;
}

const iterations = 1000;
let worst = 0;
for (let iter = 0; iter < iterations; iter++) {
  const point = randomVector(1);
  const bones = [];
  const matrices = [];
  const weights = [Math.random(), Math.random()];
  const sumW = weights[0] + weights[1];
  weights[0] /= sumW;
  weights[1] /= sumW;
  for (let i = 0; i < 2; i++) {
    const scale = randomScale();
    const rotation = randomQuaternion();
    const translation = randomVector(5);
    const m = compose(scale, rotation, translation);
    matrices.push(m);
    bones.push(matToDQ(m));
  }
  const dqPos = blendDQ(bones, weights, point);
  const matPos = blendMatrix(matrices, weights, point);
  const diff = dqPos.subtract(matPos);
  const err = diff.length();
  worst = Math.max(worst, err);
  if (err > 1e-2) {
    console.log('Large error', err, 'point', point.toString());
    console.log('DQ', dqPos.toString());
    console.log('Mat', matPos.toString());
    break;
  }
}
console.log('Worst error', worst);
