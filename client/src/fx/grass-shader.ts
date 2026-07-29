import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

export const REQUIEM_GRASS_SHADER = "requiemGrass";

export const grassVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;

uniform world: mat4x4f;
uniform worldViewProjection: mat4x4f;
uniform uTime: f32;
uniform uWindDirection: vec2f;
uniform uWindStrength: f32;

varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vBladeVariation: f32;

fn grassHash(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let root = floor(vertexInputs.position.xz * 2.0) * 0.5;
  let variation = grassHash(root);
  let tipWeight = vertexInputs.uv.y * vertexInputs.uv.y;
  let windDirection = normalize(uniforms.uWindDirection + vec2f(0.0001, 0.0001));
  let broadWave = sin(
    dot(root, windDirection * 0.34)
      + uniforms.uTime * (1.35 + variation * 0.22)
  );
  let gust = sin(
    dot(root, vec2f(-0.21, 0.27))
      - uniforms.uTime * 0.73
      + variation * 6.2831853
  );
  let bend = windDirection
    * (broadWave * 0.72 + gust * 0.28)
    * uniforms.uWindStrength
    * tipWeight;

  var localPosition = vertexInputs.position;
  localPosition.x += bend.x;
  localPosition.z += bend.y;
  localPosition.y -= length(bend) * 0.075 * tipWeight;

  let worldPosition = uniforms.world * vec4f(localPosition, 1.0);
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(localPosition, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize((uniforms.world * vec4f(vertexInputs.normal, 0.0)).xyz);
  vertexOutputs.vBladeVariation = variation;
}
`;

export const grassFragmentWGSL = /* wgsl */ `
varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vBladeVariation: f32;

uniform uBaseColor: vec3f;
uniform uTipColor: vec3f;
uniform uSunDirection: vec3f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let centered = abs(fragmentInputs.vUV.x - 0.5) * 2.0;
  let bladeHalfWidth = mix(0.92, 0.055, fragmentInputs.vUV.y);
  if (centered > bladeHalfWidth || fragmentInputs.vUV.y < 0.015) {
    discard;
  }

  let normal = normalize(fragmentInputs.vWorldNormal);
  let wrappedDiffuse = clamp(
    (dot(normal, normalize(uniforms.uSunDirection)) + 0.45) / 1.45,
    0.0,
    1.0
  );
  let rootShade = mix(0.48, 1.0, smoothstep(0.0, 0.38, fragmentInputs.vUV.y));
  let variation = mix(0.78, 1.15, fragmentInputs.vBladeVariation);
  let color = mix(
    uniforms.uBaseColor,
    uniforms.uTipColor,
    fragmentInputs.vUV.y * 0.72
  ) * mix(0.58, 1.0, wrappedDiffuse) * rootShade * variation;

  fragmentOutputs.color = vec4f(color, 1.0);
}
`;

export function registerGrassShader(): void {
  const store = BABYLON.ShaderStore.ShadersStoreWGSL;
  store[`${REQUIEM_GRASS_SHADER}VertexShader`] = grassVertexWGSL;
  store[`${REQUIEM_GRASS_SHADER}FragmentShader`] = grassFragmentWGSL;
}

export type GrassMaterialOptions = {
  windDirection?: BJS.Vector2;
  windStrength?: number;
  baseColor?: BJS.Color3;
  tipColor?: BJS.Color3;
};

export function createGrassMaterial(
  scene: BJS.Scene,
  options: GrassMaterialOptions = {},
): BJS.ShaderMaterial {
  registerGrassShader();
  const material = new BABYLON.ShaderMaterial(
    "RequiemGrassMaterial",
    scene,
    {
      vertex: REQUIEM_GRASS_SHADER,
      fragment: REQUIEM_GRASS_SHADER,
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uTime",
        "uWindDirection",
        "uWindStrength",
        "uBaseColor",
        "uTipColor",
        "uSunDirection",
      ],
      shaderLanguage: BABYLON.ShaderLanguage.WGSL,
    },
  );
  material.backFaceCulling = false;
  material.setFloat("uTime", 0);
  material.setVector2(
    "uWindDirection",
    options.windDirection ?? new BABYLON.Vector2(0.82, 0.36),
  );
  material.setFloat("uWindStrength", options.windStrength ?? 0.23);
  material.setColor3(
    "uBaseColor",
    options.baseColor ?? new BABYLON.Color3(0.075, 0.19, 0.055),
  );
  material.setColor3(
    "uTipColor",
    options.tipColor ?? new BABYLON.Color3(0.31, 0.46, 0.12),
  );
  material.setVector3("uSunDirection", new BABYLON.Vector3(0.35, 0.86, 0.38));
  return material;
}
