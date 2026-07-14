import type { StorageBuffer, RawTexture } from '../../babylon';

export type DQClipInput = {
  name: string;
  bones: number; // B
  framesOut: number; // Fₒ
  fpsOut: number;
  // frame-major, each bone = 2*vec4 = 8 floats (real then dual)
  dq: Float32Array; // length = framesOut * bones * 8
};

// SSBO atlas (WebGPU)
export type ClipTOC_SSBO = {
  name: string;
  bones: number;
  framesOut: number;
  fpsOut: number;
  baseF: number; // float index in the big buffer
  frameStrideF: number; // B * 8
};

export type SSBOAtlas = {
  buffer: StorageBuffer; // WebGPU only
  totalFloats: number;
  clips: ClipTOC_SSBO[];
};

// Texture atlas (WebGL2)
export type ClipTOC_Tex2D = {
  name: string;
  bones: number;
  framesOut: number;
  fpsOut: number;
  rowBase: number; // starting Y row for this clip
  rowWidthTex: number; // 2 * bones (two texels per bone)
  atlasWidthTex: number; // 2 * Bmax
};

export type Tex2DAtlas = {
  texture: RawTexture; // RGBA16F or RGBA32F
  widthTex: number;
  heightTex: number;
  clips: ClipTOC_Tex2D[];
};
