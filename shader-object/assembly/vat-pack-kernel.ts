// AssemblyScript source for the VAT matrix -> dual-quaternion packing kernel.
// Built by scripts/build-vat-kernel.mjs; this file is not part of the TS graph.

@inline function readF32(ptr: usize, index: i32): f32 {
  return load<f32>(ptr + (<usize>index << 2));
}

@inline function writeF32(ptr: usize, index: i32, value: f32): void {
  store<f32>(ptr + (<usize>index << 2), value);
}

@inline function squared4(value: v128): v128 {
  if (ASC_FEATURE_RELAXED_SIMD) {
    return f32x4.relaxed_madd(value, value, f32x4.splat(0));
  }
  return f32x4.mul(value, value);
}

@inline function length3(value: v128): f32 {
  const squared = squared4(value);
  return Mathf.sqrt(
    f32x4.extract_lane(squared, 0) +
    f32x4.extract_lane(squared, 1) +
    f32x4.extract_lane(squared, 2)
  );
}

export function packDQ(input: usize, output: usize, count: i32, hasScale: i32): void {
  const stride: i32 = hasScale != 0 ? 12 : 8;
  for (let sample = 0; sample < count; sample++) {
    const base = sample * 16;
    let sx: f32, sy: f32, sz: f32;
    let m00: f32, m01: f32, m02: f32;
    let m10: f32, m11: f32, m12: f32;
    let m20: f32, m21: f32, m22: f32;
    let tx: f32, ty: f32, tz: f32;

    if (ASC_FEATURE_SIMD) {
      const byteBase = input + (<usize>base << 2);
      const column0 = v128.load(byteBase);
      const column1 = v128.load(byteBase + 16);
      const column2 = v128.load(byteBase + 32);
      const column3 = v128.load(byteBase + 48);
      sx = length3(column0); sy = length3(column1); sz = length3(column2);
      if (sx < 0.0000001) sx = 1; if (sy < 0.0000001) sy = 1; if (sz < 0.0000001) sz = 1;
      const c0 = f32x4.div(column0, f32x4.splat(sx));
      const c1 = f32x4.div(column1, f32x4.splat(sy));
      const c2 = f32x4.div(column2, f32x4.splat(sz));
      m00 = f32x4.extract_lane(c0, 0); m10 = f32x4.extract_lane(c0, 1); m20 = f32x4.extract_lane(c0, 2);
      m01 = f32x4.extract_lane(c1, 0); m11 = f32x4.extract_lane(c1, 1); m21 = f32x4.extract_lane(c1, 2);
      m02 = f32x4.extract_lane(c2, 0); m12 = f32x4.extract_lane(c2, 1); m22 = f32x4.extract_lane(c2, 2);
      tx = f32x4.extract_lane(column3, 0); ty = f32x4.extract_lane(column3, 1); tz = f32x4.extract_lane(column3, 2);
    } else {
      sx = Mathf.sqrt(readF32(input, base) * readF32(input, base) + readF32(input, base + 1) * readF32(input, base + 1) + readF32(input, base + 2) * readF32(input, base + 2));
      sy = Mathf.sqrt(readF32(input, base + 4) * readF32(input, base + 4) + readF32(input, base + 5) * readF32(input, base + 5) + readF32(input, base + 6) * readF32(input, base + 6));
      sz = Mathf.sqrt(readF32(input, base + 8) * readF32(input, base + 8) + readF32(input, base + 9) * readF32(input, base + 9) + readF32(input, base + 10) * readF32(input, base + 10));
      if (sx < 0.0000001) sx = 1; if (sy < 0.0000001) sy = 1; if (sz < 0.0000001) sz = 1;
      m00 = readF32(input, base) / sx; m01 = readF32(input, base + 4) / sy; m02 = readF32(input, base + 8) / sz;
      m10 = readF32(input, base + 1) / sx; m11 = readF32(input, base + 5) / sy; m12 = readF32(input, base + 9) / sz;
      m20 = readF32(input, base + 2) / sx; m21 = readF32(input, base + 6) / sy; m22 = readF32(input, base + 10) / sz;
      tx = readF32(input, base + 12); ty = readF32(input, base + 13); tz = readF32(input, base + 14);
    }
    let x: f32 = 0, y: f32 = 0, z: f32 = 0, w: f32 = 1;
    const trace = m00 + m11 + m22;
    if (trace > 0) {
      const q = Mathf.sqrt(trace + 1) * 2; w = 0.25 * q; x = (m21 - m12) / q; y = (m02 - m20) / q; z = (m10 - m01) / q;
    } else if (m00 > m11 && m00 > m22) {
      const q = Mathf.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / q; x = 0.25 * q; y = (m01 + m10) / q; z = (m02 + m20) / q;
    } else if (m11 > m22) {
      const q = Mathf.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / q; x = (m01 + m10) / q; y = 0.25 * q; z = (m12 + m21) / q;
    } else {
      const q = Mathf.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / q; x = (m02 + m20) / q; y = (m12 + m21) / q; z = 0.25 * q;
    }
    if (ASC_FEATURE_SIMD) {
      let quaternion = f32x4(x, y, z, w);
      const squared = squared4(quaternion);
      const qn = Mathf.sqrt(
        f32x4.extract_lane(squared, 0) + f32x4.extract_lane(squared, 1) +
        f32x4.extract_lane(squared, 2) + f32x4.extract_lane(squared, 3)
      );
      quaternion = f32x4.div(quaternion, f32x4.splat(qn));
      x = f32x4.extract_lane(quaternion, 0); y = f32x4.extract_lane(quaternion, 1);
      z = f32x4.extract_lane(quaternion, 2); w = f32x4.extract_lane(quaternion, 3);
    } else {
      const qn = Mathf.sqrt(x*x + y*y + z*z + w*w); x /= qn; y /= qn; z /= qn; w /= qn;
    }
    if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
    const half: f32 = 0.5;
    let dx: f32, dy: f32, dz: f32, dw: f32;
    if (ASC_FEATURE_SIMD) {
      const zero = f32x4.splat(0);
      const termX = f32x4(w, -z, y, -x);
      const termY = f32x4(z, w, -x, -y);
      const termZ = f32x4(-y, x, w, -z);
      let dual: v128;
      if (ASC_FEATURE_RELAXED_SIMD) {
        dual = f32x4.relaxed_madd(f32x4.splat(tx), termX, zero);
        dual = f32x4.relaxed_madd(f32x4.splat(ty), termY, dual);
        dual = f32x4.relaxed_madd(f32x4.splat(tz), termZ, dual);
      } else {
        dual = f32x4.mul(f32x4.splat(tx), termX);
        dual = f32x4.add(dual, f32x4.mul(f32x4.splat(ty), termY));
        dual = f32x4.add(dual, f32x4.mul(f32x4.splat(tz), termZ));
      }
      dual = f32x4.mul(dual, f32x4.splat(half));
      dx = f32x4.extract_lane(dual, 0); dy = f32x4.extract_lane(dual, 1);
      dz = f32x4.extract_lane(dual, 2); dw = f32x4.extract_lane(dual, 3);
    } else {
      dx = half * (tx*w + ty*z - tz*y); dy = half * (-tx*z + ty*w + tz*x);
      dz = half * (tx*y - ty*x + tz*w); dw = -half * (tx*x + ty*y + tz*z);
    }
    const out = sample * stride;
    if (ASC_FEATURE_SIMD) {
      const outputBase = output + (<usize>out << 2);
      v128.store(outputBase, f32x4(x, y, z, w));
      v128.store(outputBase + 16, f32x4(dx, dy, dz, dw));
    } else {
      writeF32(output, out, x); writeF32(output, out + 1, y); writeF32(output, out + 2, z); writeF32(output, out + 3, w);
      writeF32(output, out + 4, dx); writeF32(output, out + 5, dy); writeF32(output, out + 6, dz); writeF32(output, out + 7, dw);
    }
    if (hasScale != 0) { writeF32(output, out + 8, (Mathf.abs(sx) + Mathf.abs(sy) + Mathf.abs(sz)) / 3); writeF32(output, out + 9, 0); writeF32(output, out + 10, 0); writeF32(output, out + 11, 0); }
  }
}
