import type * as BJS from "@babylonjs/core";

import BABYLON from "@bjs";

export function textureFromBakedVertexDataHalfFloat(vertexData16: Uint16Array, skeleton: BJS.Skeleton, scene: BJS.Scene): BJS.RawTexture {
  if (!skeleton) {
    throw new Error("No skeleton provided.");
  }

  // same width/height logic as the float version:
  const boneCount = skeleton.bones.length;
  const width     = (boneCount + 1) * 4;
  const height    = vertexData16.length / (width * 4);

  // create an RGBA texture backed by half-floats
  const tex = BABYLON.RawTexture.CreateRGBATexture(
    vertexData16,
    width,
    height,
    scene,
    false,                                  // no mipmaps
    false,                                  // don't invert Y
    BABYLON.Texture.NEAREST_NEAREST,        // sampling
    BABYLON.Constants.TEXTURETYPE_HALF_FLOAT,
  );

  tex.name = "VAT16_" + skeleton.name;
  return tex;
}
