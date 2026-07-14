// ─────────────────── DQMath (WGSL) ───────────────────
const EPS:f32 = 1e-8;

fn dqFixSign(a:vec4f, b:vec4f)->vec4f {
  return dot(a,b) < 0.0 ? -b : b;
}

fn dqNormalize(real:vec4f, dual:vec4f)->struct{r:vec4f,d:vec4f}{
  let rn = normalize(real);
  // Make dual orthogonal to real to keep screw motion valid
  let dorth = dual - dot(rn, dual)*rn;
  return .{ r: rn, d: dorth };
}

fn dqBlend4(
  r0:vec4f,d0:vec4f, w0:f32,
  r1:vec4f,d1:vec4f, w1:f32,
  r2:vec4f,d2:vec4f, w2:f32,
  r3:vec4f,d3:vec4f, w3:f32
)->struct{r:vec4f,d:vec4f}{
  var b1r = dqFixSign(r0, r1);
  var b2r = dqFixSign(r0, r2);
  var b3r = dqFixSign(r0, r3);
  let r = r0*w0 + b1r*w1 + b2r*w2 + b3r*w3;
  let d = d0*w0 + d1*w1 + d2*w2 + d3*w3;
  return dqNormalize(r,d);
}

// Rotate + translate point p by a dual quaternion (r,d).
fn dqTransform(r:vec4f, d:vec4f, p:vec3f)->vec3f {
  // rotation via r * (0,p) * conj(r)
  let qv = r.xyz;
  let t  = 2.0 * ( d.xyz * r.w - qv * d.w + cross(qv, d.xyz) ); // translation
  // quaternion rotate p by r
  let uv  = cross(qv, p);
  let uuv = cross(qv, uv);
  let pRot = p + (uv * (2.0*r.w) + uuv * 2.0);
  return pRot + t;
}