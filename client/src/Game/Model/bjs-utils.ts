import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { FileSystem } from '@game/FileSystem/filesystem';
import { BabylonTextureCache } from './bjs-texture-cache';

const pending = {};
export async function swapMaterialTexture(
  material: BJS.Material,
  newTextureName: string,
  flipY: boolean = false,
): Promise<BJS.Texture | null> {
  // First try to find in the scene
  const fileName = material.metadata?.gltf?.extras?.file;
  if (!fileName) {
    // console.warn(
    //   '[ImageSwap] swapMaterialTexture: material.metadata.gltf.extras.file is missing',
    //   material,
    //   newTextureName,
    // );
    return null;
  }
  // console.log('Got through swapMaterialTexture', fileName, newTextureName);
  const cacheKey = newTextureName;

  if (pending[cacheKey]) {
    return null;
  }
  const cached =
    BabylonTextureCache.get(cacheKey);
  if (cached && (material.getScene().getTextureByName(cacheKey))) {
    applyToMaterial(material, cached, flipY);
    return cached;
  }
  pending[cacheKey] = true;

  const bytes = await FileSystem.getFileBytes(
    `eqrequiem/textures/${fileName}`,
    `${newTextureName}.webp`,
  );

  if (!bytes) {
    console.warn('[ImageSwap] Failed to load texture:', newTextureName);
    return null;
  }
  const blob = new Blob([bytes], { type: 'image/webp' });
  const url = URL.createObjectURL(blob);
  const scene = (material as any).getScene() as BJS.Scene;
  const newTex = await new Promise<BJS.Texture>((res, rej) => {
    const newTex = new BABYLON.Texture(
      url,
      scene,
      true,
      false,
      undefined,
      () => {
        URL.revokeObjectURL(url);
        res(newTex);
      },
      (msg, ex) => {
        rej();
        URL.revokeObjectURL(url);
        console.error('Texture load error:', msg, ex);
      },
    );
    newTex.name = cacheKey;
    BabylonTextureCache.set(cacheKey, newTex);
    applyToMaterial(material, newTex, flipY);
    pending[cacheKey] = false;
  });

  return newTex;
}

/** Assigns the newly loaded texture to the correct slot on Standard vs PBR materials */
function applyToMaterial(
  material: BJS.Material,
  tex: BJS.Texture,
  flipY: boolean = false,
): void {
  if (material instanceof BABYLON.StandardMaterial) {
    material.diffuseTexture = tex;
    if (flipY) {
      material.diffuseTexture.vScale = -1;
      material.diffuseTexture.vOffset = 1;
    }
  } else if (material instanceof BABYLON.PBRMaterial) {
    material.albedoTexture = tex;
    tex.hasAlpha = true;
    if (flipY) {
      material.albedoTexture.vScale = -1;
      material.albedoTexture.vOffset = 1;
    }
  } else {
    console.warn(
      'swapMaterialTexture: unhandled material type, texture is loaded but not assigned automatically.',
    );
  }
}
