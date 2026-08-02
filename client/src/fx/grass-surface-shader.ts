import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { ZONE_SHADER_LIGHTING_UNIFORMS } from "./zone-shader-lighting";

export const REQUIEM_GRASS_SURFACE_SHADER = "requiemGrassSurface";

const grassSurfaceVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute color: vec4f;

uniform world: mat4x4f;
uniform worldViewProjection: mat4x4f;

varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vLighting: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let worldPosition = uniforms.world * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.position =
    uniforms.worldViewProjection * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize(
    (uniforms.world * vec4f(vertexInputs.normal, 0.0)).xyz
  );
  vertexOutputs.vLighting = vertexInputs.color.rgb;
}
`;

const grassSurfaceFragmentWGSL = /* wgsl */ `
var uBaseTextureSampler: sampler;
var uBaseTexture: texture_2d<f32>;

varying vUV: vec2f;
varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vLighting: vec3f;

uniform uTime: f32;
uniform uTerrainBaseColor: vec3f;
uniform uTerrainHighlightColor: vec3f;
uniform uWindDirection: vec2f;
uniform uVertexTintStrength: f32;
uniform uZoneLightDirection: vec3f;
uniform uZoneLightColor: vec3f;
uniform uZoneAmbientColor: vec3f;
uniform uZonePlayerLightPosition: vec3f;
uniform uZonePlayerLightColor: vec3f;
uniform uZonePlayerLightRange: f32;

fn grassSurfacePlayerLight(position: vec3f, normal: vec3f) -> vec3f {
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

fn grassSurfaceHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn grassSurfaceNoise(p: vec2f) -> f32 {
  let cell = floor(p);
  let local = fract(p);
  let blend = local * local * (vec2f(3.0) - 2.0 * local);
  let a = grassSurfaceHash(cell);
  let b = grassSurfaceHash(cell + vec2f(1.0, 0.0));
  let c = grassSurfaceHash(cell + vec2f(0.0, 1.0));
  let d = grassSurfaceHash(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let base = textureSample(
    uBaseTexture,
    uBaseTextureSampler,
    fragmentInputs.vUV
  ).rgb;
  let fineVariation = grassSurfaceNoise(fragmentInputs.vWorldPosition.xz * 0.72);
  let broadVariation = grassSurfaceNoise(
    fragmentInputs.vWorldPosition.xz * 0.095 + vec2f(37.2, -18.7)
  );
  let upward = clamp(fragmentInputs.vWorldNormal.y * 0.5 + 0.5, 0.45, 1.0);
  let livingVariation = 0.9 + fineVariation * 0.08 + broadVariation * 0.1;
  // The retained Qeynos grass albedo is intentionally very dark and nearly
  // monochrome. Use it as bounded micro-detail rather than multiplying it
  // directly into the terrain response, which made the whole ground black.
  let sourceLuma = dot(base, vec3f(0.2126, 0.7152, 0.0722));
  let terrainDetail = clamp(
    sourceLuma * 6.0 + fineVariation * 0.14 + broadVariation * 0.12,
    0.0,
    1.0
  );
  let terrainAlbedo = mix(
    uniforms.uTerrainBaseColor,
    uniforms.uTerrainHighlightColor,
    terrainDetail
  );
  let materialTint = mix(
    vec3f(1.0),
    clamp(fragmentInputs.vLighting, vec3f(0.18), vec3f(1.0)),
    uniforms.uVertexTintStrength
  );
  let normal = normalize(fragmentInputs.vWorldNormal);
  let skyDiffuse = 0.3
    + max(dot(normal, normalize(uniforms.uZoneLightDirection)), 0.0) * 0.7;
  let worldLighting = uniforms.uZoneAmbientColor
    + uniforms.uZoneLightColor * skyDiffuse
    + grassSurfacePlayerLight(fragmentInputs.vWorldPosition, normal);
  let color = terrainAlbedo
    * livingVariation
    * materialTint
    * worldLighting
    * upward;
  fragmentOutputs.color = vec4f(color, 1.0);
}
`;

function registerGrassSurfaceShader(): void {
  const store = BABYLON.ShaderStore.ShadersStoreWGSL;
  store[`${REQUIEM_GRASS_SURFACE_SHADER}VertexShader`] = grassSurfaceVertexWGSL;
  store[`${REQUIEM_GRASS_SURFACE_SHADER}FragmentShader`] =
    grassSurfaceFragmentWGSL;
}

export function createGrassSurfaceMaterial(
  scene: BJS.Scene,
  baseTexture: BJS.BaseTexture,
  useVertexTint = true,
): BJS.ShaderMaterial {
  registerGrassSurfaceShader();
  const material = new BABYLON.ShaderMaterial(
    "RequiemGrassSurfaceMaterial",
    scene,
    {
      vertex: REQUIEM_GRASS_SURFACE_SHADER,
      fragment: REQUIEM_GRASS_SURFACE_SHADER,
    },
    {
      attributes: ["position", "normal", "uv", "color"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uTime",
        "uTerrainBaseColor",
        "uTerrainHighlightColor",
        "uWindDirection",
        "uVertexTintStrength",
        ...ZONE_SHADER_LIGHTING_UNIFORMS,
      ],
      samplers: ["uBaseTexture"],
      shaderLanguage: BABYLON.ShaderLanguage.WGSL,
    },
  );
  material.backFaceCulling = false;
  material.setTexture("uBaseTexture", baseTexture);
  material.setFloat("uTime", 0);
  material.setColor3(
    "uTerrainBaseColor",
    BABYLON.Color3.FromHexString("#3C612B"),
  );
  material.setColor3(
    "uTerrainHighlightColor",
    BABYLON.Color3.FromHexString("#69864A"),
  );
  material.setVector2("uWindDirection", new BABYLON.Vector2(0.82, 0.36));
  material.setFloat("uVertexTintStrength", useVertexTint ? 1 : 0);
  return material;
}
