import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

export const REQUIEM_WATER_SHADER = "requiemWater";

export const waterVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;

uniform world: mat4x4f;
uniform worldViewProjection: mat4x4f;
uniform uTime: f32;
uniform uWaveStrength: f32;

varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vWaveHeight: f32;

fn wave(
  position: vec2f,
  direction: vec2f,
  frequency: f32,
  speed: f32,
  amplitude: f32
) -> vec3f {
  let phase = dot(position, normalize(direction)) * frequency + uniforms.uTime * speed;
  let height = sin(phase) * amplitude;
  let slope = cos(phase) * amplitude * frequency;
  return vec3f(height, slope * direction.x, slope * direction.y);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let p = vertexInputs.position.xz;
  let a = wave(p, vec2f(0.94, 0.34), 0.52, 0.82, 0.19);
  let b = wave(p, vec2f(-0.38, 0.92), 0.91, -0.61, 0.085);
  let c = wave(p, vec2f(0.71, -0.70), 1.67, 0.43, 0.036);
  let combined = (a + b + c) * uniforms.uWaveStrength;

  var displaced = vertexInputs.position;
  displaced.y += combined.x;
  let localNormal = normalize(vec3f(-combined.y, 1.0, -combined.z));
  let worldPosition = uniforms.world * vec4f(displaced, 1.0);

  vertexOutputs.position = uniforms.worldViewProjection * vec4f(displaced, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize((uniforms.world * vec4f(localNormal, 0.0)).xyz);
  vertexOutputs.vWaveHeight = combined.x;
}
`;

export const waterFragmentWGSL = /* wgsl */ `
varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vWaveHeight: f32;

uniform uTime: f32;
uniform uEyePosition: vec3f;
uniform uSunDirection: vec3f;
uniform uDeepColor: vec3f;
uniform uShallowColor: vec3f;
uniform uOpacity: f32;
uniform uRippleStrength: f32;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let worldXZ = fragmentInputs.vWorldPosition.xz;
  let rippleA = sin(dot(worldXZ, vec2f(1.73, 2.31)) + uniforms.uTime * 1.17);
  let rippleB = sin(dot(worldXZ, vec2f(-3.11, 1.27)) - uniforms.uTime * 0.83);
  let rippleSlope = vec2f(
    cos(dot(worldXZ, vec2f(1.73, 2.31)) + uniforms.uTime * 1.17) * 1.73,
    cos(dot(worldXZ, vec2f(-3.11, 1.27)) - uniforms.uTime * 0.83) * 1.27
  ) * uniforms.uRippleStrength;
  let normal = normalize(fragmentInputs.vWorldNormal + vec3f(-rippleSlope.x, 0.0, -rippleSlope.y));
  let viewDirection = normalize(uniforms.uEyePosition - fragmentInputs.vWorldPosition);
  let fresnel = pow(1.0 - clamp(dot(viewDirection, normal), 0.0, 1.0), 4.0);
  let sunAmount = pow(max(dot(reflect(-normalize(uniforms.uSunDirection), normal), viewDirection), 0.0), 72.0);
  let heightMix = smoothstep(-0.22, 0.24, fragmentInputs.vWaveHeight);
  var color = mix(uniforms.uDeepColor, uniforms.uShallowColor, heightMix * 0.62 + 0.18);
  color = mix(color, vec3f(0.31, 0.46, 0.54), fresnel * 0.58);
  color += vec3f(0.76, 0.72, 0.58) * sunAmount * 0.72;
  color += (rippleA + rippleB) * 0.006;

  fragmentOutputs.color = vec4f(color, clamp(uniforms.uOpacity + fresnel * 0.12, 0.0, 1.0));
}
`;

export type WaterMaterialOptions = {
  waveStrength?: number;
  rippleStrength?: number;
  opacity?: number;
};

export function registerWaterShader(): void {
  const store = BABYLON.ShaderStore.ShadersStoreWGSL;
  store[`${REQUIEM_WATER_SHADER}VertexShader`] = waterVertexWGSL;
  store[`${REQUIEM_WATER_SHADER}FragmentShader`] = waterFragmentWGSL;
}

export function createWaterMaterial(
  scene: BJS.Scene,
  options: WaterMaterialOptions = {},
): BJS.ShaderMaterial {
  registerWaterShader();
  const material = new BABYLON.ShaderMaterial(
    "RequiemWaterMaterial",
    scene,
    {
      vertex: REQUIEM_WATER_SHADER,
      fragment: REQUIEM_WATER_SHADER,
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uTime",
        "uWaveStrength",
        "uRippleStrength",
        "uEyePosition",
        "uSunDirection",
        "uDeepColor",
        "uShallowColor",
        "uOpacity",
      ],
      needAlphaBlending: true,
      shaderLanguage: BABYLON.ShaderLanguage.WGSL,
    },
  );
  material.backFaceCulling = false;
  material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  material.setFloat("uTime", 0);
  material.setFloat("uWaveStrength", options.waveStrength ?? 1);
  material.setFloat("uRippleStrength", options.rippleStrength ?? 0.035);
  material.setFloat("uOpacity", options.opacity ?? 0.84);
  material.setVector3("uEyePosition", BABYLON.Vector3.Zero());
  material.setVector3("uSunDirection", new BABYLON.Vector3(0.35, 0.86, 0.38));
  material.setColor3("uDeepColor", new BABYLON.Color3(0.018, 0.095, 0.12));
  material.setColor3("uShallowColor", new BABYLON.Color3(0.075, 0.27, 0.29));
  return material;
}
