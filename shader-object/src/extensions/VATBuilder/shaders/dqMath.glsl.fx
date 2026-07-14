// ─────────────────── DQMath (GLSL) ───────────────────
vec4 dqFixSign(vec4 a, vec4 b) { return dot(a,b) < 0.0 ? -b : b; }

struct DQ { vec4 r; vec4 d; };

DQ dqNormalizeDQ(vec4 r, vec4 d) {
  vec4 rn = normalize(r);
  vec4 dorth = d - dot(rn, d) * rn;
  DQ outDQ; outDQ.r = rn; outDQ.d = dorth; return outDQ;
}

DQ dqBlend4(vec4 r0, vec4 d0, float w0,
            vec4 r1, vec4 d1, float w1,
            vec4 r2, vec4 d2, float w2,
            vec4 r3, vec4 d3, float w3) {
  vec4 b1r = dqFixSign(r0, r1);
  vec4 b2r = dqFixSign(r0, r2);
  vec4 b3r = dqFixSign(r0, r3);
  vec4 r = r0*w0 + b1r*w1 + b2r*w2 + b3r*w3;
  vec4 d = d0*w0 + d1*w1 + d2*w2 + d3*w3;
  return dqNormalizeDQ(r,d);
}

vec3 dqTransform(vec4 r, vec4 d, vec3 p) {
  vec3 qv = r.xyz;
  vec3 t  = 2.0 * ( d.xyz * r.w - qv * d.w + cross(qv, d.xyz) );
  vec3 uv  = cross(qv, p);
  vec3 uuv = cross(qv, uv);
  vec3 pRot = p + (uv * (2.0*r.w) + uuv * 2.0);
  return pRot + t;
}