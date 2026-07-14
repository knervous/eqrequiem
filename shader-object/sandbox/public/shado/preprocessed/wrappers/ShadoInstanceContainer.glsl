const int ShadoInstanceContainer_STRIDE_F = 4;
const int ShadoInstanceContainer_visibleCount_OFF = 0;
const int ShadoInstanceContainer_instancesPtr_OFF = 1;
const int ShadoInstanceContainer_instancesCount_OFF = 2;

struct ShadoInstanceContainerHeader {
  uint visibleCount;
  uint instancesPtr;
  uint instancesCount;
};
const int ShadoInstanceContainer_HEADER_FLOATS = 4;

#ifdef WEBGPU_NEXT
layout(set = 1, binding = 12) readonly buffer ShadoInstanceContainerBuf { float data[]; } shadoInstanceContainerBuf;
float ShadoInstanceContainer_fetch(int i) { return shadoInstanceContainerBuf.data[i]; }
// NOTE: On storage buffers we synthesize fetch4() from 4 scalar loads.
// (Still far fewer lines in the generated helpers; GPU may coalesce).
vec4 ShadoInstanceContainer_fetch4(int i4) {
  return vec4(ShadoInstanceContainer_fetch(i4+0), ShadoInstanceContainer_fetch(i4+1), ShadoInstanceContainer_fetch(i4+2), ShadoInstanceContainer_fetch(i4+3));
}
#else
uniform highp sampler2D uShadoInstanceContainerBufTex;
uniform int uShadoInstanceContainerBufTexWidth;   // width in TEXELS (not floats)

// Scalar read from RGBA32F at float index 'li'
float ShadoInstanceContainer_fetch(int li) {
  int t = li >> 2;           // texel index
  int c = li & 3;            // channel 0..3
  int x = t % uShadoInstanceContainerBufTexWidth;
  int y = t / uShadoInstanceContainerBufTexWidth;
  vec4 v = texelFetch(uShadoInstanceContainerBufTex, ivec2(x,y), 0);
  return c == 0 ? v.r : (c == 1 ? v.g : (c == 2 ? v.b : v.a));
}

// Aligned vec4 read: li4 MUST be a multiple of 4 (float index)
vec4 ShadoInstanceContainer_fetch4(int li4) {
  int t = li4 >> 2;          // texel index
  int x = t % uShadoInstanceContainerBufTexWidth;
  int y = t / uShadoInstanceContainerBufTexWidth;
  return texelFetch(uShadoInstanceContainerBufTex, ivec2(x,y), 0);
}
#endif

uniform int uShadoInstanceContainerHeaderBase;

uniform int uShadoInstanceContainer_cameraFrustumBase;
uniform int uShadoInstanceContainer_cameraFrustumStride;
uniform int uShadoInstanceContainer_cameraFrustumCount;

uniform int uShadoInstanceContainer_instancesBase;
uniform int uShadoInstanceContainer_instancesStride;  // = 28
uniform int uShadoInstanceContainer_instancesCount;


vec4 ShadoInstanceContainer_cameraFrustum_get(int j) {
  int base = uShadoInstanceContainer_cameraFrustumBase + j * uShadoInstanceContainer_cameraFrustumStride;
  return ShadoInstanceContainer_fetch4(base);
}
int ShadoInstanceContainer_cameraFrustum_count() { return uShadoInstanceContainer_cameraFrustumCount; }


TestClassHeader ShadoInstanceContainer_instances_get(int j) {
  int base = uShadoInstanceContainer_instancesBase + j * uShadoInstanceContainer_instancesStride;
  TestClassHeader h;

  h.translation = ShadoInstanceContainer_fetch4(base + 0);
  h.color = ShadoInstanceContainer_fetch4(base + 4);
  h.visibleIndex = int(ShadoInstanceContainer_fetch(base + 8));
  h.nameIndex = uint(ShadoInstanceContainer_fetch(base + 9));
  h.nameWorldPerEM = ShadoInstanceContainer_fetch(base + 10);
  h.nameLiftWorld = ShadoInstanceContainer_fetch(base + 11);
  h.nameplateColor = ShadoInstanceContainer_fetch4(base + 12);
  h.animationBuffer = ShadoInstanceContainer_fetch4(base + 16);
  h.visibleFlag = int(ShadoInstanceContainer_fetch(base + 20));
  h.padding1 = ShadoInstanceContainer_fetch(base + 21);
  h.padding2 = ShadoInstanceContainer_fetch(base + 22);
  h.padding3 = ShadoInstanceContainer_fetch(base + 23);
  h.testValue = ShadoInstanceContainer_fetch4(base + 24);
  return h;
}

int ShadoInstanceContainer_instances_count() { return uShadoInstanceContainer_instancesCount; }


ShadoInstanceContainerHeader ShadoInstanceContainer_loadHeader() {
  int base = uShadoInstanceContainerHeaderBase;
  ShadoInstanceContainerHeader h;

  h.visibleCount = uint(ShadoInstanceContainer_fetch(base + 0));
  h.instancesPtr = uint(ShadoInstanceContainer_fetch(base + 1));
  h.instancesCount = uint(ShadoInstanceContainer_fetch(base + 2));
  return h;
}

