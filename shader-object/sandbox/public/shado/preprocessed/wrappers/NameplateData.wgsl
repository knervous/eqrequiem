const NameplateData_STRIDE_F : i32 = 0;


struct NameplateDataHeader {
  _dummy: f32,
};
const NameplateData_HEADER_FLOATS : i32 = 0;
const NameplateData_STRIDE_F : i32 = 0;

// Arena (data) SSBO
var<storage, read> nameplateDataBuf : array<f32>;
// Params SSBO (packed i32 per the indices below)
var<storage, read> nameplateDataParams : array<i32>;

// Param indices (generated)
const uNameplateData_HeaderBase_I : i32 = 0;
const uNameplateData_glyphUv4Base_I   : i32 = 1;
const uNameplateData_glyphUv4Stride_I : i32 = 2;
const uNameplateData_glyphUv4Count_I  : i32 = 3;
const uNameplateData_glyphPlane4Base_I   : i32 = 4;
const uNameplateData_glyphPlane4Stride_I : i32 = 5;
const uNameplateData_glyphPlane4Count_I  : i32 = 6;
const uNameplateData_glyphAdvanceBase_I   : i32 = 7;
const uNameplateData_glyphAdvanceStride_I : i32 = 8;
const uNameplateData_glyphAdvanceCount_I  : i32 = 9;
const uNameplateData_glyphGidBase_I   : i32 = 10;
const uNameplateData_glyphGidStride_I : i32 = 11;
const uNameplateData_glyphGidCount_I  : i32 = 12;
const uNameplateData_glyphOfs2Base_I   : i32 = 13;
const uNameplateData_glyphOfs2Stride_I : i32 = 14;
const uNameplateData_glyphOfs2Count_I  : i32 = 15;
const uNameplateData_glyphOwnerBase_I   : i32 = 16;
const uNameplateData_glyphOwnerStride_I : i32 = 17;
const uNameplateData_glyphOwnerCount_I  : i32 = 18;

// Low-level fetch from arena
fn NameplateData_fetch(i:i32)->f32 { return nameplateDataBuf[i]; }
fn NameplateData_fetch4(i:i32)->vec4f {
  return vec4f(nameplateDataBuf[i+0], nameplateDataBuf[i+1], nameplateDataBuf[i+2], nameplateDataBuf[i+3]);
}

// Param getters
fn uNameplateData_HeaderBase()->i32 { return nameplateDataParams[uNameplateData_HeaderBase_I]; }


fn uNameplateData_glyphUv4Base()  -> i32 { return nameplateDataParams[uNameplateData_glyphUv4Base_I]; }
fn uNameplateData_glyphUv4Stride()-> i32 { return nameplateDataParams[uNameplateData_glyphUv4Stride_I]; }
fn uNameplateData_glyphUv4Count() -> i32 { return nameplateDataParams[uNameplateData_glyphUv4Count_I]; }

fn uNameplateData_glyphPlane4Base()  -> i32 { return nameplateDataParams[uNameplateData_glyphPlane4Base_I]; }
fn uNameplateData_glyphPlane4Stride()-> i32 { return nameplateDataParams[uNameplateData_glyphPlane4Stride_I]; }
fn uNameplateData_glyphPlane4Count() -> i32 { return nameplateDataParams[uNameplateData_glyphPlane4Count_I]; }

fn uNameplateData_glyphAdvanceBase()  -> i32 { return nameplateDataParams[uNameplateData_glyphAdvanceBase_I]; }
fn uNameplateData_glyphAdvanceStride()-> i32 { return nameplateDataParams[uNameplateData_glyphAdvanceStride_I]; }
fn uNameplateData_glyphAdvanceCount() -> i32 { return nameplateDataParams[uNameplateData_glyphAdvanceCount_I]; }

fn uNameplateData_glyphGidBase()  -> i32 { return nameplateDataParams[uNameplateData_glyphGidBase_I]; }
fn uNameplateData_glyphGidStride()-> i32 { return nameplateDataParams[uNameplateData_glyphGidStride_I]; }
fn uNameplateData_glyphGidCount() -> i32 { return nameplateDataParams[uNameplateData_glyphGidCount_I]; }

fn uNameplateData_glyphOfs2Base()  -> i32 { return nameplateDataParams[uNameplateData_glyphOfs2Base_I]; }
fn uNameplateData_glyphOfs2Stride()-> i32 { return nameplateDataParams[uNameplateData_glyphOfs2Stride_I]; }
fn uNameplateData_glyphOfs2Count() -> i32 { return nameplateDataParams[uNameplateData_glyphOfs2Count_I]; }

fn uNameplateData_glyphOwnerBase()  -> i32 { return nameplateDataParams[uNameplateData_glyphOwnerBase_I]; }
fn uNameplateData_glyphOwnerStride()-> i32 { return nameplateDataParams[uNameplateData_glyphOwnerStride_I]; }
fn uNameplateData_glyphOwnerCount() -> i32 { return nameplateDataParams[uNameplateData_glyphOwnerCount_I]; }




// Var-array getters (unchanged API, but pull bases/strides/counts from params SSBO)

fn NameplateData_glyphUv4_get(j:i32)->vec4f {
  let b = uNameplateData_glyphUv4Base() + j * uNameplateData_glyphUv4Stride();
  return NameplateData_fetch4(b);
}
fn NameplateData_glyphUv4_count()->i32 { return uNameplateData_glyphUv4Count(); }

fn NameplateData_glyphPlane4_get(j:i32)->vec4f {
  let b = uNameplateData_glyphPlane4Base() + j * uNameplateData_glyphPlane4Stride();
  return NameplateData_fetch4(b);
}
fn NameplateData_glyphPlane4_count()->i32 { return uNameplateData_glyphPlane4Count(); }

fn NameplateData_glyphAdvance_get(j:i32)->f32 {
  let b = uNameplateData_glyphAdvanceBase() + j * uNameplateData_glyphAdvanceStride();
  return NameplateData_fetch(b);
}
fn NameplateData_glyphAdvance_count()->i32 { return uNameplateData_glyphAdvanceCount(); }

fn NameplateData_glyphGid_get(j:i32)->u32 {
  let b = uNameplateData_glyphGidBase() + j * uNameplateData_glyphGidStride();
  return u32(NameplateData_fetch(b));
}
fn NameplateData_glyphGid_count()->i32 { return uNameplateData_glyphGidCount(); }

fn NameplateData_glyphOfs2_get(j:i32)->vec2f {
  let b = uNameplateData_glyphOfs2Base() + j * uNameplateData_glyphOfs2Stride();
  return vec2f(NameplateData_fetch(b+0), NameplateData_fetch(b+1));
}
fn NameplateData_glyphOfs2_count()->i32 { return uNameplateData_glyphOfs2Count(); }

fn NameplateData_glyphOwner_get(j:i32)->u32 {
  let b = uNameplateData_glyphOwnerBase() + j * uNameplateData_glyphOwnerStride();
  return u32(NameplateData_fetch(b));
}
fn NameplateData_glyphOwner_count()->i32 { return uNameplateData_glyphOwnerCount(); }

// Struct-array getters (same idea)


// Header loader
fn NameplateData_loadHeader()->NameplateDataHeader {
  let base = uNameplateData_HeaderBase();
  var h: NameplateDataHeader;

  return h;
}

