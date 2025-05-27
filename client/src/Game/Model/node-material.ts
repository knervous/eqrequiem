import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import '@babylonjs/core';
const charFileRegex = /^([a-z]{3})([a-z]{2})(\d{2})(\d{2})$/;

function createVATShaderMaterial(
  scene: BJS.Scene,
  texture: BJS.Texture,
  vatTexture: BJS.Texture,
  atlasEntry: any,
  baseMaterial: BJS.Material | null,
): BJS.ShaderMaterial {
  // Validate inputs
  if (!texture || !vatTexture || !atlasEntry) {
    throw new Error("[createVATShaderMaterial] Missing texture, VAT texture, or atlas entry");
  }

  // Vertex shader
  const vertexShader = `
    precision highp float;

    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;

    uniform mat4 world;
    uniform mat4 viewProjection;
    uniform sampler2D vatTexture;
    uniform float frameTime;

    varying vec2 vUV;
    varying vec3 vNormal;

    void main() {
      // VAT UV: uv.x = vertex index, frameTime = frame index
      vec2 vatUV = vec2(uv.x, frameTime);
      vec3 vatPosition = texture2D(vatTexture, vatUV).rgb;

      // Transform position
      vec4 worldPos = world * vec4(vatPosition, 1.0);
      gl_Position = viewProjection * worldPos;

      // Pass UV and normal
      vUV = uv;
      vNormal = normal; // Static normal
    }
  `;

  // Fragment shader
  const fragmentShader = `
    precision highp float;

    varying vec2 vUV;
    varying vec3 vNormal;

    uniform sampler2D textureSampler;
    uniform vec2 uvScale;
    uniform vec2 uvOffset;
    uniform vec3 albedoColor;
    uniform float metallic;
    uniform float roughness;

    void main() {
      // Apply atlas UV transformation
      vec2 atlasUV = vUV * uvScale + uvOffset;
      vec3 color = texture2D(textureSampler, atlasUV).rgb;
      color *= albedoColor;

      // Simple PBR output
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  // Create ShaderMaterial
  const shaderMat = new BABYLON.ShaderMaterial(
    `vatShader_${baseMaterial?.name || 'unnamed'}`,
    scene,
    {
      vertexSource: vertexShader,
      fragmentSource: fragmentShader,
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "viewProjection",
        "vatTexture",
        "frameTime",
        "textureSampler",
        "uvScale",
        "uvOffset",
        "albedoColor",
        "metallic",
        "roughness",
      ],
      samplers: ["vatTexture", "textureSampler"],
    },
  );

  // Set textures
  shaderMat.setTexture("textureSampler", texture);
  shaderMat.setTexture("vatTexture", vatTexture);

  // Set UV scale and offset from atlasJson
  const w = texture.getSize().width || 1;
  const h = texture.getSize().height || 1;
  const uMin = atlasEntry.x / w;
  const vMin = atlasEntry.y / h;
  const uMax = (atlasEntry.x + atlasEntry.width) / w;
  const vMax = (atlasEntry.y + atlasEntry.height) / h;
  shaderMat.setVector2("uvScale", new BABYLON.Vector2(uMax - uMin, vMax - vMin));
  shaderMat.setVector2("uvOffset", new BABYLON.Vector2(uMin, vMin));

  // Set material properties
  if (baseMaterial instanceof BABYLON.PBRMaterial) {
    shaderMat.setColor3("albedoColor", baseMaterial.albedoColor);
    shaderMat.setFloat("metallic", baseMaterial.metallic ?? 0.0);
    shaderMat.setFloat("roughness", baseMaterial.roughness ?? 0.5);
  } else {
    shaderMat.setColor3("albedoColor", new BABYLON.Color3(1, 1, 1));
    shaderMat.setFloat("metallic", 0.0);
    shaderMat.setFloat("roughness", 0.5);
  }

  // Initialize frameTime
  shaderMat.setFloat("frameTime", 0.0);

  return shaderMat;
}

function createVATShaderMaterialThin(
  scene: BJS.Scene,
  texture: BJS.Texture,
  vatTexture: BJS.Texture,
  atlasEntry: any,
  baseMaterial: BJS.Material | null,
): BJS.ShaderMaterial {
  // Define vertex and fragment shaders
  const vertexShader = `
    precision highp float;

    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;

    uniform mat4 world;
    uniform mat4 viewProjection;
    uniform sampler2D vatTexture;
    uniform float frameTime;

    varying vec2 vUV;
    varying vec3 vNormal;

    void main() {
      // Construct VAT UV: uv.x = vertex index, frameTime = frame index
      vec2 vatUV = vec2(uv.x, frameTime);
      vec3 vatPosition = textureLod(vatTexture, vatUV, 0.0).rgb;

      // Transform position
      vec4 worldPos = world * vec4(vatPosition, 1.0);
      gl_Position = viewProjection * worldPos;

      // Pass UV and normal
      vUV = uv;
      vNormal = normal; // Static normal for simplicity
    }
  `;

  const fragmentShader = `
    precision highp float;

    varying vec2 vUV;
    varying vec3 vNormal;

    uniform sampler2D textureSampler;
    uniform vec2 uvScale;
    uniform vec2 uvOffset;
    uniform vec3 albedoColor;
    uniform float metallic;
    uniform float roughness;

    void main() {
      // Apply UV scale and offset for atlas
      vec2 atlasUV = vUV * uvScale + uvOffset;
      vec3 color = texture2D(textureSampler, atlasUV).rgb;
      color *= albedoColor;

      // Simple PBR approximation
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  // Create ShaderMaterial
  const shaderMat = new BABYLON.ShaderMaterial(
    `vatShader_${baseMaterial?.name || 'unnamed'}`,
    scene,
    {
      vertexSource: vertexShader,
      fragmentSource: fragmentShader,
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "viewProjection",
        "vatTexture",
        "frameTime",
        "textureSampler",
        "uvScale",
        "uvOffset",
        "albedoColor",
        "metallic",
        "roughness",
      ],
      samplers: ["vatTexture", "textureSampler"],
    },
  );

  // Set textures
  shaderMat.setTexture("textureSampler", texture);
  shaderMat.setTexture("vatTexture", vatTexture);

  // Set UV scale and offset from atlasJson
  const w = texture.getSize().width!;
  const h = texture.getSize().height!;
  const uMin = atlasEntry.x / w;
  const vMin = atlasEntry.y / h;
  const uMax = (atlasEntry.x + atlasEntry.width) / w;
  const vMax = (atlasEntry.y + atlasEntry.height) / h;
  shaderMat.setVector2("uvScale", new BABYLON.Vector2(uMax - uMin, vMax - vMin));
  shaderMat.setVector2("uvOffset", new BABYLON.Vector2(uMin, vMin));

  // Set material properties
  if (baseMaterial instanceof BABYLON.PBRMaterial) {
    shaderMat.setColor3("albedoColor", baseMaterial.albedoColor);
    shaderMat.setFloat("metallic", baseMaterial.metallic ?? 0.0);
    shaderMat.setFloat("roughness", baseMaterial.roughness ?? 0.5);
  } else {
    shaderMat.setColor3("albedoColor", new BABYLON.Color3(1, 1, 1));
    shaderMat.setFloat("metallic", 0.0);
    shaderMat.setFloat("roughness", 0.5);
  }

  // Initialize frameTime
  shaderMat.setFloat("frameTime", 0.0);

  return shaderMat;
}

// Apply NodeMaterials per submesh
export function applyNodeMaterialsPerSubmesh(
  mesh: BJS.Mesh,
  atlasJson: any,
  texture: BJS.Texture,
  vatTexture: BJS.Texture,
) {
  const scene = mesh.getScene();

  const subMaterials = new Array<BJS.Material>();
  mesh.subMeshes!.forEach((subMesh, i) => {
    const material = subMesh.getMaterial();
    if (!material) {
      console.warn(`[Player] Sub-mesh ${i} has no valid material`);
      return;
    }
    const match = material.name.match(charFileRegex);
    if (!match) {
      console.warn(`[Player] Sub-material name ${material.name} does not match expected format`);
      return;
    }

    const [,, piece, variation, texIdx] = match;
    const varNum = parseInt(variation, 10);
    const texNum = parseInt(texIdx, 10);

    const entry = atlasJson[piece]?.variations?.[varNum]?.textures?.[texNum];
    if (!entry) {
      console.warn(`[Player] No atlas entry found for ${piece}, variation ${varNum}, texture ${texNum}`);
      return;
    }

    const mat = createVATShaderMaterial(scene, texture, vatTexture, entry, material);
    mat.name = `${material.name}_vatMat_${i}`;
    subMaterials.push(mat);

    subMesh.getMaterial()!.dispose(false, true);
  });

  mesh.material?.dispose(true, true);
  const multi = new BABYLON.MultiMaterial("playerMulti", scene);
  multi.subMaterials = subMaterials;
  mesh.material = multi;

  // Enable thin instances
  //mesh.thinInstanceEnable = true;
}