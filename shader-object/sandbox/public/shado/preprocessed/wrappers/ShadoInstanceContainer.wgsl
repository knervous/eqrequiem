const ShadoInstanceContainer_STRIDE_F : i32 = 4;
const ShadoInstanceContainer_visibleCount_OFF : i32 = 0;
const ShadoInstanceContainer_instancesPtr_OFF : i32 = 1;
const ShadoInstanceContainer_instancesCount_OFF : i32 = 2;


struct ShadoInstanceContainerHeader {
  visibleCount: u32,
  instancesPtr: u32,
  instancesCount: u32,
};
const ShadoInstanceContainer_HEADER_FLOATS : i32 = 4;
const ShadoInstanceContainer_STRIDE_F : i32 = 4;
const ShadoInstanceContainer_visibleCount_OFF : i32 = 0;
const ShadoInstanceContainer_instancesPtr_OFF : i32 = 1;
const ShadoInstanceContainer_instancesCount_OFF : i32 = 2;

// Arena (data) SSBO
var<storage, read> shadoInstanceContainerBuf : array<f32>;
// Params SSBO (packed i32 per the indices below)
var<storage, read> shadoInstanceContainerParams : array<i32>;

// Param indices (generated)
const uShadoInstanceContainer_HeaderBase_I : i32 = 0;
const uShadoInstanceContainer_cameraFrustumBase_I   : i32 = 1;
const uShadoInstanceContainer_cameraFrustumStride_I : i32 = 2;
const uShadoInstanceContainer_cameraFrustumCount_I  : i32 = 3;
const uShadoInstanceContainer_instancesBase_I   : i32 = 4;
const uShadoInstanceContainer_instancesStride_I : i32 = 5;
const uShadoInstanceContainer_instancesCount_I  : i32 = 6;

// Low-level fetch from arena
fn ShadoInstanceContainer_fetch(i:i32)->f32 { return shadoInstanceContainerBuf[i]; }
fn ShadoInstanceContainer_fetch4(i:i32)->vec4f {
  return vec4f(shadoInstanceContainerBuf[i+0], shadoInstanceContainerBuf[i+1], shadoInstanceContainerBuf[i+2], shadoInstanceContainerBuf[i+3]);
}

// Param getters
fn uShadoInstanceContainer_HeaderBase()->i32 { return shadoInstanceContainerParams[uShadoInstanceContainer_HeaderBase_I]; }


fn uShadoInstanceContainer_cameraFrustumBase()  -> i32 { return shadoInstanceContainerParams[uShadoInstanceContainer_cameraFrustumBase_I]; }
fn uShadoInstanceContainer_cameraFrustumStride()-> i32 { return shadoInstanceContainerParams[uShadoInstanceContainer_cameraFrustumStride_I]; }
fn uShadoInstanceContainer_cameraFrustumCount() -> i32 { return shadoInstanceContainerParams[uShadoInstanceContainer_cameraFrustumCount_I]; }



fn uShadoInstanceContainer_instancesBase()  -> i32 { return shadoInstanceContainerParams[uShadoInstanceContainer_instancesBase_I]; }
fn uShadoInstanceContainer_instancesStride()-> i32 { return shadoInstanceContainerParams[uShadoInstanceContainer_instancesStride_I]; }
fn uShadoInstanceContainer_instancesCount() -> i32 { return shadoInstanceContainerParams[uShadoInstanceContainer_instancesCount_I]; }


// Var-array getters (unchanged API, but pull bases/strides/counts from params SSBO)

fn ShadoInstanceContainer_cameraFrustum_get(j:i32)->vec4f {
  let b = uShadoInstanceContainer_cameraFrustumBase() + j * uShadoInstanceContainer_cameraFrustumStride();
  return ShadoInstanceContainer_fetch4(b);
}
fn ShadoInstanceContainer_cameraFrustum_count()->i32 { return uShadoInstanceContainer_cameraFrustumCount(); }

// Struct-array getters (same idea)

fn ShadoInstanceContainer_instances_get(j:i32)->TestClassHeader {
  let base = uShadoInstanceContainer_instancesBase() + j * uShadoInstanceContainer_instancesStride();
  var h: TestClassHeader;
  h.translation = ShadoInstanceContainer_fetch4(base + 0);
  h.color = ShadoInstanceContainer_fetch4(base + 4);
  h.visibleIndex = i32(ShadoInstanceContainer_fetch(base + 8));
  h.nameIndex = u32(ShadoInstanceContainer_fetch(base + 9));
  h.nameWorldPerEM = ShadoInstanceContainer_fetch(base + 10);
  h.nameLiftWorld = ShadoInstanceContainer_fetch(base + 11);
  h.nameplateColor = ShadoInstanceContainer_fetch4(base + 12);
  h.animationBuffer = ShadoInstanceContainer_fetch4(base + 16);
  h.visibleFlag = i32(ShadoInstanceContainer_fetch(base + 20));
  h.padding1 = ShadoInstanceContainer_fetch(base + 21);
  h.padding2 = ShadoInstanceContainer_fetch(base + 22);
  h.padding3 = ShadoInstanceContainer_fetch(base + 23);
  h.testValue = ShadoInstanceContainer_fetch4(base + 24);
  return h;
}
fn ShadoInstanceContainer_instances_count()->i32 { return uShadoInstanceContainer_instancesCount(); }

// Header loader
fn ShadoInstanceContainer_loadHeader()->ShadoInstanceContainerHeader {
  let base = uShadoInstanceContainer_HeaderBase();
  var h: ShadoInstanceContainerHeader;
  h.visibleCount = u32(ShadoInstanceContainer_fetch(base + 0));
  h.instancesPtr = u32(ShadoInstanceContainer_fetch(base + 1));
  h.instancesCount = u32(ShadoInstanceContainer_fetch(base + 2));
  return h;
}

