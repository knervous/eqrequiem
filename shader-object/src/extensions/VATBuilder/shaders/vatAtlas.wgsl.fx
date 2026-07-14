// ─────────────────── VATAtlas (WGSL) ───────────────────
// Global SSBO atlas. Bind with engine.setStorageBuffer("dqAtlas", buf)
var<storage, read> dqAtlas : array<vec4f>;

fn fetch4(i:i32)->vec4f { return dqAtlas[i >> 2]; }

// Each bone record = 2*vec4 = 8 floats.
// baseF: float index to clip start; frameStrideF: B*8.
fn VAT_loadDQ_SSBO(baseF:i32, frameStrideF:i32, frame:i32, bone:i32)
  -> struct { real:vec4f, dual:vec4f } {
  let off = baseF + frame*frameStrideF + bone*8;
  return .{ real: fetch4(off+0), dual: fetch4(off+4) };
}
