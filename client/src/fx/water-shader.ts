import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { ZONE_SHADER_LIGHTING_UNIFORMS } from "./zone-shader-lighting";

export const REQUIEM_WATER_SHADER = "requiemWater";

export const waterVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute color: vec4f;

uniform world: mat4x4f;
uniform worldViewProjection: mat4x4f;
uniform uTime: f32;
uniform uWaveStrength: f32;

varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vWaveHeight: f32;
varying vVertexLighting: vec3f;

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
  let p = vertexInputs.uv * 8.0;
  let a = wave(p, vec2f(0.94, 0.34), 0.52, 0.82, 0.19);
  let b = wave(p, vec2f(-0.38, 0.92), 0.91, -0.61, 0.085);
  let c = wave(p, vec2f(0.71, -0.70), 1.67, 0.43, 0.036);
  let combined = (a + b + c) * uniforms.uWaveStrength;

  var displaced = vertexInputs.position;
  displaced += normalize(vertexInputs.normal) * combined.x;
  let localNormal = normalize(
    vertexInputs.normal + vec3f(-combined.y, 0.0, -combined.z)
  );
  let worldPosition = uniforms.world * vec4f(displaced, 1.0);

  vertexOutputs.position = uniforms.worldViewProjection * vec4f(displaced, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize((uniforms.world * vec4f(localNormal, 0.0)).xyz);
  vertexOutputs.vWaveHeight = combined.x;
  vertexOutputs.vVertexLighting = vertexInputs.color.rgb;
}
`;

export const waterFragmentWGSL = /* wgsl */ `
varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vWaveHeight: f32;
varying vVertexLighting: vec3f;

uniform uTime: f32;
uniform uEyePosition: vec3f;
uniform uZoneLightDirection: vec3f;
uniform uZoneLightColor: vec3f;
uniform uZoneAmbientColor: vec3f;
uniform uZonePlayerLightPosition: vec3f;
uniform uZonePlayerLightColor: vec3f;
uniform uZonePlayerLightRange: f32;
uniform uDeepColor: vec3f;
uniform uShallowColor: vec3f;
uniform uOpacity: f32;
uniform uRippleStrength: f32;
uniform uVertexLightingStrength: f32;

fn waterPlayerLight(position: vec3f, normal: vec3f) -> vec3f {
  let delta = uniforms.uZonePlayerLightPosition - position;
  let lightDistance = length(delta);
  let direction = delta / max(lightDistance, 0.0001);
  let attenuation = pow(
    clamp(1.0 - lightDistance / max(uniforms.uZonePlayerLightRange, 0.0001), 0.0, 1.0),
    2.0
  );
  return uniforms.uZonePlayerLightColor
    * attenuation
    * max(dot(normal, direction), 0.0);
}

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
  let lightDirection = normalize(uniforms.uZoneLightDirection);
  let sunAmount = pow(max(dot(reflect(-lightDirection, normal), viewDirection), 0.0), 72.0);
  let diffuse = 0.28 + max(dot(normal, lightDirection), 0.0) * 0.72;
  let heightMix = smoothstep(-0.22, 0.24, fragmentInputs.vWaveHeight);
  var color = mix(uniforms.uDeepColor, uniforms.uShallowColor, heightMix * 0.62 + 0.18);
  let bakedLighting = mix(
    vec3f(1.0),
    clamp(fragmentInputs.vVertexLighting, vec3f(0.1), vec3f(1.0)),
    uniforms.uVertexLightingStrength
  );
  color *= bakedLighting;
  color = mix(color, vec3f(0.31, 0.46, 0.54), fresnel * 0.58);
  color *= uniforms.uZoneAmbientColor + uniforms.uZoneLightColor * diffuse;
  color += uniforms.uZoneLightColor * sunAmount * 0.72;
  color += waterPlayerLight(fragmentInputs.vWorldPosition, normal);
  color += (rippleA + rippleB) * 0.006;

  fragmentOutputs.color = vec4f(color, clamp(uniforms.uOpacity + fresnel * 0.12, 0.0, 1.0));
}
`;

export type WaterMaterialOptions = {
  waveStrength?: number;
  rippleStrength?: number;
  opacity?: number;
  useVertexLighting?: boolean;
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
      attributes: ["position", "normal", "uv", "color"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uTime",
        "uWaveStrength",
        "uRippleStrength",
        "uVertexLightingStrength",
        "uEyePosition",
        ...ZONE_SHADER_LIGHTING_UNIFORMS,
        "uDeepColor",
        "uShallowColor",
        "uOpacity",
      ],
      needAlphaBlending: false,
      shaderLanguage: BABYLON.ShaderLanguage.WGSL,
    },
  );
  material.backFaceCulling = false;
  material.setFloat("uTime", 0);
  material.setFloat("uWaveStrength", options.waveStrength ?? 1);
  material.setFloat("uRippleStrength", options.rippleStrength ?? 0.035);
  material.setFloat(
    "uVertexLightingStrength",
    options.useVertexLighting ? 1 : 0,
  );
  material.setFloat("uOpacity", options.opacity ?? 1);
  material.setVector3("uEyePosition", BABYLON.Vector3.Zero());
  material.setColor3("uDeepColor", new BABYLON.Color3(0.018, 0.095, 0.12));
  material.setColor3("uShallowColor", new BABYLON.Color3(0.075, 0.27, 0.29));
  return material;
}
