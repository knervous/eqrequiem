@unmanaged
class TestClassHeader {
  translation_x:f32; translation_y:f32; translation_z:f32; translation_w:f32;
  color_x:f32; color_y:f32; color_z:f32; color_w:f32;
  visibleIndex: i32;
  nameIndex: u32;
  nameWorldPerEM: f32;
  nameLiftWorld: f32;
  nameplateColor_x:f32; nameplateColor_y:f32; nameplateColor_z:f32; nameplateColor_w:f32;
  animationBuffer_x:f32; animationBuffer_y:f32; animationBuffer_z:f32; animationBuffer_w:f32;
  visibleFlag: i32;
  padding1: f32;
  padding2: f32;
  padding3: f32;
  testValue_x:f32; testValue_y:f32; testValue_z:f32; testValue_w:f32;
}
export const OFFSET_TestClass_translation: i32 = 0;
export const OFFSET_TestClass_color: i32 = 16;
export const OFFSET_TestClass_visibleIndex: i32 = 32;
export const OFFSET_TestClass_nameIndex: i32 = 36;
export const OFFSET_TestClass_nameWorldPerEM: i32 = 40;
export const OFFSET_TestClass_nameLiftWorld: i32 = 44;
export const OFFSET_TestClass_nameplateColor: i32 = 48;
export const OFFSET_TestClass_animationBuffer: i32 = 64;
export const OFFSET_TestClass_visibleFlag: i32 = 80;
export const OFFSET_TestClass_padding1: i32 = 84;
export const OFFSET_TestClass_padding2: i32 = 88;
export const OFFSET_TestClass_padding3: i32 = 92;
export const OFFSET_TestClass_testValue: i32 = 96;
export const SIZEOF_TestClassHeader: i32 = 112;

@unmanaged
class ShadoInstanceContainerHeader {
  visibleCount: u32;
  instancesPtr: u32;
  instancesCount: u32;
  __pad0: f32;
}
export const OFFSET_ShadoInstanceContainer_visibleCount: i32 = 0;
export const OFFSET_ShadoInstanceContainer_instancesPtr: i32 = 4;
export const OFFSET_ShadoInstanceContainer_instancesCount: i32 = 8;

@inline
function instancePtr_TestClass(h: ShadoInstanceContainerHeader, i: i32): usize {
  return h.instancesPtr + usize(i) * SIZEOF_TestClassHeader;
}

@inline
function instanceRef_TestClass(h: ShadoInstanceContainerHeader, i: i32): TestClassHeader {
  return changetype<TestClassHeader>(instancePtr_TestClass(h, i));
}


export const SIZEOF_ShadoInstanceContainerHeader: i32 = 12;

