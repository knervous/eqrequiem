import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { FileSystem } from "@game/FileSystem/filesystem";
import { BabylonTextureCache } from "./bjs-texture-cache";


export async function swapMaterialTexture(
  material: BJS.Material,
  newTextureName: string,
  flipY: boolean = false,
): Promise<BJS.Texture | null> {

  // First try to find in the scene
  const fileName = material.metadata?.gltf?.extras?.file;
  if (!fileName) {
    console.warn(
      '[ImageSwap] swapMaterialTexture: material.metadata.gltf.extras.file is missing',
      material,
    );
    return null;
  }

  const cacheKey = `${fileName}-${newTextureName}`;


  const cached = BabylonTextureCache.get(cacheKey);
  if (cached) {
    applyToMaterial(material, cached, flipY);
    return cached;
  }


  const bytes = await FileSystem.getFileBytes(
    `eqrequiem/textures/${fileName}`,
    `${newTextureName}.webp`,
  );
  if (!bytes) {
    console.warn('[ImageSwap] Failed to load texture:', newTextureName);
    return null;
  } 
  const blob = new Blob([bytes], { type: "image/webp" });
  const url = URL.createObjectURL(blob);
  const scene = (material as any).getScene() as BJS.Scene;

  const newTex = new BABYLON.Texture(
    url,
    scene,
    true,
    false,
    undefined,
    () => {
      URL.revokeObjectURL(url);
    },
    (msg, ex) => {
      console.error("Texture load error:", msg, ex);
    },
  );
  newTex.name = cacheKey;
  BabylonTextureCache.set(cacheKey, newTex);
  applyToMaterial(material, newTex, flipY);
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
      "swapMaterialTexture: unhandled material type, texture is loaded but not assigned automatically.",
    );
  }
}
export function createNameplate(scene: BJS.Scene, node: BJS.Mesh, lines: string[], size = 32) {
  const temp = new BABYLON.DynamicTexture(
    'DynamicTexture',
    size,
    scene,
  );
  const tmpctx = temp.getContext();
  tmpctx.font = `${size}px Arial`;
  const textWidth = lines.reduce((acc, val) => {
    const newTextWidth = tmpctx.measureText(val).width;
    if (newTextWidth > acc) {
      return newTextWidth;
    }
    return acc;
  }, 0);

  temp.dispose();

  const dynamicTexture = new BABYLON.DynamicTexture(
    'DynamicTexture',
    { width: textWidth + 4, height: (size * 4) + lines.length * size * 2 }, // Added padding for stroke
    scene,
  );

  const ctx = dynamicTexture.getContext();
  ctx.font = `${size}px Arial`;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white'; // White border color
  ctx.lineWidth = 1; // Small border thickness

  const { width: canvasWidth } = dynamicTexture.getSize();
  const lineHeight = size;

  for (let i = 0; i < lines.length; i++) {
    const txt = lines[i];
    const lineWidth = ctx.measureText(txt).width;
    const x = (canvasWidth - lineWidth) / 2;
    const y = lineHeight * (i + 1);
    ctx.strokeText(txt, x, y); // Draw white outline
    ctx.fillText(txt, x, y); // Draw filled text
  }

  dynamicTexture.update();

  const plane = BABYLON.MeshBuilder.CreatePlane(
    'namePlate',
    { width: (textWidth + 4) / (size * 2), height: 2 + lines.length }, // Adjusted for padding
    scene,
  );
  plane.addLODLevel(500, null);
  plane.isPickable = false;
  plane.position.y = Math.abs(
    node.getBoundingInfo().boundingBox.minimum.y - 1.2,
  );
  plane.billboardMode = BABYLON.ParticleSystem.BILLBOARDMODE_ALL;
  plane.parent = node;
  const material = new BABYLON.StandardMaterial(
    'nameplate',
    scene,
  );
  plane.material = material;
  material.diffuseTexture = dynamicTexture;
  material.diffuseTexture.hasAlpha = true;
  material.useAlphaFromDiffuseTexture = true;
  material.emissiveColor = new BABYLON.Color3(0.2, 0.4, 0.8); // Nice blue hue
  material.diffuseColor = new BABYLON.Color3(0, 0, 0); // Disable diffuse lighting
  material.specularColor = new BABYLON.Color3(0, 0, 0); // Disable specular highlights
  material.disableLighting = true; // Ensure consistent color
  plane.scaling.x *= -1;
}

