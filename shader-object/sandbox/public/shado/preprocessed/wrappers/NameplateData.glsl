const int NameplateData_STRIDE_F = 0;

struct NameplateDataHeader {
  float _dummy;
};
const int NameplateData_HEADER_FLOATS = 0;

#ifdef WEBGPU_NEXT
layout(set = 1, binding = 12) readonly buffer NameplateDataBuf { float data[]; } nameplateDataBuf;
float NameplateData_fetch(int i) { return nameplateDataBuf.data[i]; }
// NOTE: On storage buffers we synthesize fetch4() from 4 scalar loads.
// (Still far fewer lines in the generated helpers; GPU may coalesce).
vec4 NameplateData_fetch4(int i4) {
  return vec4(NameplateData_fetch(i4+0), NameplateData_fetch(i4+1), NameplateData_fetch(i4+2), NameplateData_fetch(i4+3));
}
#else
uniform highp sampler2D uNameplateDataBufTex;
uniform int uNameplateDataBufTexWidth;   // width in TEXELS (not floats)

// Scalar read from RGBA32F at float index 'li'
float NameplateData_fetch(int li) {
  int t = li >> 2;           // texel index
  int c = li & 3;            // channel 0..3
  int x = t % uNameplateDataBufTexWidth;
  int y = t / uNameplateDataBufTexWidth;
  vec4 v = texelFetch(uNameplateDataBufTex, ivec2(x,y), 0);
  return c == 0 ? v.r : (c == 1 ? v.g : (c == 2 ? v.b : v.a));
}

// Aligned vec4 read: li4 MUST be a multiple of 4 (float index)
vec4 NameplateData_fetch4(int li4) {
  int t = li4 >> 2;          // texel index
  int x = t % uNameplateDataBufTexWidth;
  int y = t / uNameplateDataBufTexWidth;
  return texelFetch(uNameplateDataBufTex, ivec2(x,y), 0);
}
#endif

uniform int uNameplateDataHeaderBase;

uniform int uNameplateData_glyphUv4Base;
uniform int uNameplateData_glyphUv4Stride;
uniform int uNameplateData_glyphUv4Count;

uniform int uNameplateData_glyphPlane4Base;
uniform int uNameplateData_glyphPlane4Stride;
uniform int uNameplateData_glyphPlane4Count;

uniform int uNameplateData_glyphAdvanceBase;
uniform int uNameplateData_glyphAdvanceStride;
uniform int uNameplateData_glyphAdvanceCount;

uniform int uNameplateData_glyphGidBase;
uniform int uNameplateData_glyphGidStride;
uniform int uNameplateData_glyphGidCount;

uniform int uNameplateData_glyphOfs2Base;
uniform int uNameplateData_glyphOfs2Stride;
uniform int uNameplateData_glyphOfs2Count;

uniform int uNameplateData_glyphOwnerBase;
uniform int uNameplateData_glyphOwnerStride;
uniform int uNameplateData_glyphOwnerCount;


vec4 NameplateData_glyphUv4_get(int j) {
  int base = uNameplateData_glyphUv4Base + j * uNameplateData_glyphUv4Stride;
  return NameplateData_fetch4(base);
}
int NameplateData_glyphUv4_count() { return uNameplateData_glyphUv4Count; }


vec4 NameplateData_glyphPlane4_get(int j) {
  int base = uNameplateData_glyphPlane4Base + j * uNameplateData_glyphPlane4Stride;
  return NameplateData_fetch4(base);
}
int NameplateData_glyphPlane4_count() { return uNameplateData_glyphPlane4Count; }


float NameplateData_glyphAdvance_get(int j) {
  int base = uNameplateData_glyphAdvanceBase + j * uNameplateData_glyphAdvanceStride;
  return NameplateData_fetch(base);
}
int NameplateData_glyphAdvance_count() { return uNameplateData_glyphAdvanceCount; }


float NameplateData_glyphGid_get(int j) {
  int base = uNameplateData_glyphGidBase + j * uNameplateData_glyphGidStride;
  return NameplateData_fetch(base);
}
int NameplateData_glyphGid_count() { return uNameplateData_glyphGidCount; }


vec2 NameplateData_glyphOfs2_get(int j) {
  int base = uNameplateData_glyphOfs2Base + j * uNameplateData_glyphOfs2Stride;
  // stride may be 2; base may not be 4-aligned → use scalar fallback
  return vec2(NameplateData_fetch(base+0), NameplateData_fetch(base+1));
}
int NameplateData_glyphOfs2_count() { return uNameplateData_glyphOfs2Count; }


float NameplateData_glyphOwner_get(int j) {
  int base = uNameplateData_glyphOwnerBase + j * uNameplateData_glyphOwnerStride;
  return NameplateData_fetch(base);
}
int NameplateData_glyphOwner_count() { return uNameplateData_glyphOwnerCount; }


NameplateDataHeader NameplateData_loadHeader() {
  int base = uNameplateDataHeaderBase;
  NameplateDataHeader h;

  return h;
}

