// ASC_SOURCE (AssemblyScript)
export const ASC_SOURCE = `

/* Imports provided by your generator: */
// @unmanaged class VATObjectHeader { /* generated */ }
// export const OFFSET_VATObject_bones: i32;
// export const OFFSET_VATObject_poseBaseF: i32;
// export const OFFSET_VATObject_poseStrideF: i32;
// export const OFFSET_VATObject_poseCount: i32;
// export const OFFSET_VATObject_poseCapacity: i32;
// export const OFFSET_VATObject_jointTocBasePtr: i32;
// export const OFFSET_VATObject_rotSegBasePtr: i32;
// export const OFFSET_VATObject_posSegBasePtr: i32;
// export const OFFSET_VATObject_jointsPerClip: i32;
// export const OFFSET_VATObject_clipCount: i32;
// export const OFFSET_VATObject_clipOffsetsPtr: i32;
// export const OFFSET_VATObject_clipRotIndexPtr: i32;
// export const OFFSET_VATObject_clipPosIndexPtr: i32;
// export const OFFSET_VATObject_clipDurationsPtr: i32;
// export const SIZEOF_VATObjectHeader: i32;

@inline function H(base: usize): VATObjectHeader {
  return changetype<VATObjectHeader>(base);
}

// Scalar i32/u32/f32 fields (we rely on offsets emitted by the schema)
@inline function get_i32(base: usize, off: i32): i32 { return load<i32>(base + <usize>off); }
@inline function set_i32(base: usize, off: i32, v: i32): void { store<i32>(base + <usize>off, v); }

@inline function get_u32(base: usize, off: i32): u32 { return load<u32>(base + <usize>off); }
@inline function set_u32(base: usize, off: i32, v: u32): void { store<u32>(base + <usize>off, v); }

@inline function get_f32(base: usize, off: i32): f32 { return load<f32>(base + <usize>off); }
@inline function set_f32(base: usize, off: i32, v: f32): void { store<f32>(base + <usize>off, v); }

// Convenience short-hands for VATBuilder fields
@inline function fld_bones(base: usize): i32 { return get_i32(base, OFFSET_VATObject_bones); }
@inline function fld_poseBaseF(base: usize): i32 { return get_i32(base, OFFSET_VATObject_poseBaseF); } // float index
@inline function fld_poseStrideF(base: usize): i32 { return get_i32(base, OFFSET_VATObject_poseStrideF); }
@inline function fld_poseCount(base: usize): i32 { return get_i32(base, OFFSET_VATObject_poseCount); }
@inline function set_poseCount(base: usize, v: i32): void { set_i32(base, OFFSET_VATObject_poseCount, v); }

@inline function fld_jointTocPtr(base: usize): usize { return <usize>get_u32(base, OFFSET_VATObject_jointTocBasePtr); }
@inline function fld_rotSegPtr(base: usize): usize { return <usize>get_u32(base, OFFSET_VATObject_rotSegBasePtr); }
@inline function fld_posSegPtr(base: usize): usize { return <usize>get_u32(base, OFFSET_VATObject_posSegBasePtr); }
@inline function fld_clipOffsetsPtr(base: usize): usize { return <usize>get_u32(base, OFFSET_VATObject_clipOffsetsPtr); }
@inline function fld_clipRotIndexPtr(base: usize): usize { return <usize>get_u32(base, OFFSET_VATObject_clipRotIndexPtr); }
@inline function fld_clipPosIndexPtr(base: usize): usize { return <usize>get_u32(base, OFFSET_VATObject_clipPosIndexPtr); }
@inline function fld_clipDurationsPtr(base: usize): usize { return <usize>get_u32(base, OFFSET_VATObject_clipDurationsPtr); }
@inline function fld_clipCount(base: usize): i32 { return get_i32(base, OFFSET_VATObject_clipCount); }
@inline function fld_jointsPerClip(base: usize): i32 { return get_i32(base, OFFSET_VATObject_jointsPerClip); }

// Pose cache addressing: poseBaseF is a FLOAT INDEX; convert to bytes.
@inline function poseByteOffset(base: usize, poseIndex: i32): usize {
  const baseF = fld_poseBaseF(base);
  const strideF = fld_poseStrideF(base);
  const byteF = (baseF + poseIndex * strideF) << 2;
  return base + <usize>byteF;
}

// Helpers to read request arrays passed from JS
@inline function load_i32_at(p: usize, i: i32): i32 { return load<i32>(p + <usize>(i << 2)); }
@inline function load_f32_at(p: usize, i: i32): f32 { return load<f32>(p + <usize>(i << 2)); }

@inline function writeDQ(out: usize, jointIndex: i32, realX:f32, realY:f32, realZ:f32, realW:f32, dualX:f32, dualY:f32, dualZ:f32, dualW:f32): void {
  // per joint: two contiguous vec4s
  const strideBoneBytes = 8 * 4; // 8 floats => 32 bytes
  const base = out + <usize>(jointIndex * strideBoneBytes);

  // real
  store<f32>(base + 0, realX);
  store<f32>(base + 4, realY);
  store<f32>(base + 8, realZ);
  store<f32>(base + 12, realW);

  // dual
  store<f32>(base + 16, dualX);
  store<f32>(base + 20, dualY);
  store<f32>(base + 24, dualZ);
  store<f32>(base + 28, dualW);
}

// ────────────────────────────────────────────────────────────────────────────
// Curve sampling stubs — fill these with your packed format logic.
// All addressing info lives in the header (pointers + clip tables).
// ────────────────────────────────────────────────────────────────────────────

@inline function sampleBoneDQ_forClip(
  base: usize,
  clipId: i32,
  timeSec: f32,
  joint: i32,
  // out params:
  outReal: usize, // pointer to 4*f32
  outDual: usize  // pointer to 4*f32
): void {
  // TODO: decode via:
  //  - fld_clipOffsetsPtr / fld_clipRotIndexPtr / fld_clipPosIndexPtr
  //  - fld_rotSegPtr / fld_posSegPtr / fld_jointTocPtr
  //  - packed segment format (RotSeg/PosSeg)
  //
  // For now, write identity (neutral pose).
  store<f32>(outReal +  0, 0.0); store<f32>(outReal +  4, 0.0); store<f32>(outReal +  8, 0.0); store<f32>(outReal + 12, 1.0);
  store<f32>(outDual +  0, 0.0); store<f32>(outDual +  4, 0.0); store<f32>(outDual +  8, 0.0); store<f32>(outDual + 12, 0.0);
}

// For performance: scratch on the stack per bone (two vec4)
@inline function sampleBoneToDQ(
  base: usize,
  clipId: i32,
  t: f32,
  joint: i32,
  outDQ: usize,          // where DQ (2*vec4) should be written
): void {
  // Stack scratch for two vec4s (real+dual), 8 floats total
  // We'll just compute pointers relative to outDQ and let writeDQ store there.
  // NOTE: writeDQ will write two vec4s starting at outDQ + joint*strideBoneBytes,
  // so here we just compute the values and call writeDQ.
  let rx:f32=0, ry:f32=0, rz:f32=0, rw:f32=1;
  let dx:f32=0, dy:f32=0, dz:f32=0, dw:f32=0;

  // Fill via sampler:
  // (We pass pointers only to keep interface uniform; here we kept locals.)
  // If you switch to pointer-based temp, do:
  //   const realPtr = outDQ; const dualPtr = outDQ + 16;
  // and call sampleBoneDQ_forClip(base, clipId, t, joint, realPtr, dualPtr).
  // We’ll keep locals for now.
  // TODO: replace with actual packed curve sampling.
  // (Identity is already set.)

  // Store to output (joint-local)
  writeDQ(outDQ, joint, rx, ry, rz, rw, dx, dy, dz, dw);
}

// ────────────────────────────────────────────────────────────────────────────
// Exported entry: evaluate N poses (clips+times) into arena
// Signature matches your JS ops decoration: base is prepended automatically.
// JS passes idsPtr (i32[]), timePtr (f32[]), count.
// ────────────────────────────────────────────────────────────────────────────

export function evalPosesIntoArena(base: usize, idsPtr: usize, timePtr: usize, count: i32): void {
  // Header-driven addressing
  const bones = fld_bones(base);
  if (bones <= 0) {
    set_poseCount(base, 0);
    return;
  }

  // For each request k, compute destination pose byte address and fill bones
  for (let k = 0; k < count; k++) {
    const clipId = load_i32_at(idsPtr,  k);
    const t      = load_f32_at(timePtr, k);
    const poseOut = poseByteOffset(base, k); // byte address to start of pose k

    // Walk all joints; sample DQ and write
    for (let j = 0; j < bones; j++) {
      sampleBoneToDQ(base, clipId, t, j, poseOut);
    }
  }

  // Update GPU-visible poseCount in header
  set_poseCount(base, count);
}



`;
