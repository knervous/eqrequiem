import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { ZONE_SHADER_LIGHTING_UNIFORMS } from "./zone-shader-lighting";

export const REQUIEM_TERRAIN_SURFACE_SHADER = "requiemTerrainSurface";

export type EltaniaTerrainLayer = {
  albedo: BJS.BaseTexture;
  metallicRoughness: BJS.BaseTexture;
};

export type EltaniaTerrainSurfaceOptions = {
  grass: EltaniaTerrainLayer;
  dirt: EltaniaTerrainLayer;
  rock: EltaniaTerrainLayer;
  controlMap0: BJS.BaseTexture;
  worldMin: readonly [number, number];
  worldMax: readonly [number, number];
  scales: {
    grass: number;
    dirt: number;
    rock: number;
    macro: number;
  };
  rockSlopeStart: number;
  rockSlopeEnd: number;
  triplanarSlopeStart: number;
  triplanarSlopeEnd: number;
  useVertexTint?: boolean;
};

const terrainVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute normal: vec3f;
attribute color: vec4f;

uniform world: mat4x4f;
uniform worldViewProjection: mat4x4f;

varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vLighting: vec3f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let worldPosition = uniforms.world * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize((uniforms.world * vec4f(vertexInputs.normal, 0.0)).xyz);
  vertexOutputs.vLighting = vertexInputs.color.rgb;
}
`;

const terrainFragmentWGSL = /* wgsl */ `
var uGrassAlbedoSampler: sampler;
var uGrassAlbedo: texture_2d<f32>;
var uGrassMrSampler: sampler;
var uGrassMr: texture_2d<f32>;
var uDirtAlbedoSampler: sampler;
var uDirtAlbedo: texture_2d<f32>;
var uDirtMrSampler: sampler;
var uDirtMr: texture_2d<f32>;
var uRockAlbedoSampler: sampler;
var uRockAlbedo: texture_2d<f32>;
var uRockMrSampler: sampler;
var uRockMr: texture_2d<f32>;
var uControlMap0Sampler: sampler;
var uControlMap0: texture_2d<f32>;

varying vWorldPosition: vec3f;
varying vWorldNormal: vec3f;
varying vLighting: vec3f;

uniform uWorldMin: vec2f;
uniform uWorldMax: vec2f;
uniform uLayerScales: vec4f;
uniform uSlopeRules: vec4f;
uniform uVertexTintStrength: f32;
uniform uTerrainDebug: f32;
uniform uZoneLightDirection: vec3f;
uniform uZoneLightColor: vec3f;
uniform uZoneAmbientColor: vec3f;
uniform uZonePlayerLightPosition: vec3f;
uniform uZonePlayerLightColor: vec3f;
uniform uZonePlayerLightRange: f32;
uniform uZoneFogColor: vec3f;
uniform uZoneFogStart: f32;
uniform uZoneFogEnd: f32;
uniform uZoneCameraPosition: vec3f;

fn terrainHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn terrainNoise(p: vec2f) -> f32 {
  let cell = floor(p);
  let local = fract(p);
  let blend = local * local * (vec2f(3.0) - 2.0 * local);
  let a = terrainHash(cell);
  let b = terrainHash(cell + vec2f(1.0, 0.0));
  let c = terrainHash(cell + vec2f(0.0, 1.0));
  let d = terrainHash(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

fn triplanarWeights(normal: vec3f) -> vec3f {
  let shaped = pow(abs(normal), vec3f(6.0));
  return shaped / max(shaped.x + shaped.y + shaped.z, 0.0001);
}

fn sampleRockAlbedo(position: vec3f, normal: vec3f, scale: f32) -> vec3f {
  let weights = triplanarWeights(normal);
  let x = textureSample(uRockAlbedo, uRockAlbedoSampler, position.zy * scale).rgb;
  let y = textureSample(uRockAlbedo, uRockAlbedoSampler, position.xz * scale).rgb;
  let z = textureSample(uRockAlbedo, uRockAlbedoSampler, position.xy * scale).rgb;
  return x * weights.x + y * weights.y + z * weights.z;
}

fn sampleRockRoughness(position: vec3f, normal: vec3f, scale: f32) -> f32 {
  let weights = triplanarWeights(normal);
  let x = textureSample(uRockMr, uRockMrSampler, position.zy * scale).g;
  let y = textureSample(uRockMr, uRockMrSampler, position.xz * scale).g;
  let z = textureSample(uRockMr, uRockMrSampler, position.xy * scale).g;
  return x * weights.x + y * weights.y + z * weights.z;
}

fn terrainPlayerLight(position: vec3f, normal: vec3f) -> vec3f {
  let delta = uniforms.uZonePlayerLightPosition - position;
  let lightDistance = length(delta);
  let direction = delta / max(lightDistance, 0.0001);
  let attenuation = pow(clamp(1.0 - lightDistance / max(uniforms.uZonePlayerLightRange, 0.0001), 0.0, 1.0), 2.0);
  return uniforms.uZonePlayerLightColor * attenuation * max(dot(normal, direction), 0.0);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let position = fragmentInputs.vWorldPosition;
  let normal = normalize(fragmentInputs.vWorldNormal);
  let flatness = abs(normal.y);
  let steepness = 1.0 - flatness;
  let macroVariation = terrainNoise(position.xz * uniforms.uLayerScales.w);
  let controlUv = clamp(
    (position.xz - uniforms.uWorldMin) / max(uniforms.uWorldMax - uniforms.uWorldMin, vec2f(0.001)),
    vec2f(0.0),
    vec2f(1.0)
  );
  let control = textureSample(uControlMap0, uControlMap0Sampler, controlUv);
  let noisySteepness = steepness + (macroVariation - 0.5) * 0.16;
  let rockSlope = smoothstep(uniforms.uSlopeRules.x, uniforms.uSlopeRules.y, noisySteepness);
  let path = control.r;

  var grassWeight = max(0.0, (1.0 - rockSlope) * (1.0 - path * 0.94) * (0.72 + macroVariation * 0.34 + control.g * 0.52));
  var dirtWeight = max(0.0, 0.08 + path * 2.4 + (1.0 - abs(2.0 * rockSlope - 1.0)) * (0.15 + macroVariation * 0.18));
  var rockWeight = max(0.0, rockSlope * (0.78 + macroVariation * 0.38 + control.b * 0.72));
  let weightSum = max(grassWeight + dirtWeight + rockWeight, 0.0001);
  grassWeight = grassWeight / weightSum;
  dirtWeight = dirtWeight / weightSum;
  rockWeight = rockWeight / weightSum;

  let grassUv = position.xz * uniforms.uLayerScales.x;
  let dirtUv = position.xz * uniforms.uLayerScales.y;
  let rockUv = position.xz * uniforms.uLayerScales.z;
  let grassColor = textureSample(uGrassAlbedo, uGrassAlbedoSampler, grassUv).rgb;
  let dirtColor = textureSample(uDirtAlbedo, uDirtAlbedoSampler, dirtUv).rgb;
  let rockPlanar = textureSample(uRockAlbedo, uRockAlbedoSampler, rockUv).rgb;
  let rockTriplanar = sampleRockAlbedo(position, normal, uniforms.uLayerScales.z);
  let projectionBlend = smoothstep(uniforms.uSlopeRules.z, uniforms.uSlopeRules.w, noisySteepness);
  let rockColor = mix(rockPlanar, rockTriplanar, projectionBlend);

  let grassRoughness = textureSample(uGrassMr, uGrassMrSampler, grassUv).g;
  let dirtRoughness = textureSample(uDirtMr, uDirtMrSampler, dirtUv).g;
  let rockPlanarRoughness = textureSample(uRockMr, uRockMrSampler, rockUv).g;
  let rockTriRoughness = sampleRockRoughness(position, normal, uniforms.uLayerScales.z);
  let rockRoughness = mix(rockPlanarRoughness, rockTriRoughness, projectionBlend);
  let wetness = control.a;
  let roughness = clamp(
    grassRoughness * grassWeight + dirtRoughness * dirtWeight + rockRoughness * rockWeight - wetness * 0.13,
    0.22,
    1.0
  );
  let macroTint = 0.86 + macroVariation * 0.22;
  var terrainAlbedo = (grassColor * grassWeight + dirtColor * dirtWeight + rockColor * rockWeight) * macroTint;
  terrainAlbedo = mix(terrainAlbedo, terrainAlbedo * vec3f(0.62, 0.7, 0.66), wetness * 0.22);

  if (uniforms.uTerrainDebug > 0.5 && uniforms.uTerrainDebug < 1.5) {
    terrainAlbedo = vec3f(grassWeight);
  } else if (uniforms.uTerrainDebug < 2.5 && uniforms.uTerrainDebug > 1.5) {
    terrainAlbedo = vec3f(dirtWeight);
  } else if (uniforms.uTerrainDebug < 3.5 && uniforms.uTerrainDebug > 2.5) {
    terrainAlbedo = vec3f(rockWeight);
  } else if (uniforms.uTerrainDebug < 4.5 && uniforms.uTerrainDebug > 3.5) {
    terrainAlbedo = vec3f(steepness);
  } else if (uniforms.uTerrainDebug < 5.5 && uniforms.uTerrainDebug > 4.5) {
    terrainAlbedo = vec3f(wetness);
  } else if (uniforms.uTerrainDebug > 5.5) {
    terrainAlbedo = vec3f(path);
  }

  let materialTint = mix(vec3f(1.0), clamp(fragmentInputs.vLighting, vec3f(0.18), vec3f(1.0)), uniforms.uVertexTintStrength);
  let lightDirection = normalize(uniforms.uZoneLightDirection);
  let diffuse = 0.28 + max(dot(normal, lightDirection), 0.0) * 0.72;
  let worldLighting = uniforms.uZoneAmbientColor + uniforms.uZoneLightColor * diffuse + terrainPlayerLight(position, normal);
  let viewDirection = normalize(uniforms.uZoneCameraPosition - position);
  let halfDirection = normalize(lightDirection + viewDirection);
  let specular = pow(max(dot(normal, halfDirection), 0.0), mix(72.0, 8.0, roughness)) * (1.0 - roughness) * 0.15;
  var color = terrainAlbedo * materialTint * worldLighting + uniforms.uZoneLightColor * specular;
  let fogDistance = length(uniforms.uZoneCameraPosition - position);
  let fogAmount = smoothstep(uniforms.uZoneFogStart, max(uniforms.uZoneFogStart + 0.001, uniforms.uZoneFogEnd), fogDistance);
  color = mix(color, uniforms.uZoneFogColor, fogAmount);
  fragmentOutputs.color = vec4f(color, 1.0);
}
`;

function registerTerrainShader(): void {
  const store = BABYLON.ShaderStore.ShadersStoreWGSL;
  store[`${REQUIEM_TERRAIN_SURFACE_SHADER}VertexShader`] = terrainVertexWGSL;
  store[`${REQUIEM_TERRAIN_SURFACE_SHADER}FragmentShader`] = terrainFragmentWGSL;
}

export function createTerrainSurfaceMaterial(
  scene: BJS.Scene,
  options: EltaniaTerrainSurfaceOptions,
): BJS.ShaderMaterial {
  registerTerrainShader();
  const material = new BABYLON.ShaderMaterial(
    "EltaniaTerrainMaterial:GrassDirtRock",
    scene,
    { vertex: REQUIEM_TERRAIN_SURFACE_SHADER, fragment: REQUIEM_TERRAIN_SURFACE_SHADER },
    {
      attributes: ["position", "normal", "color"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uWorldMin",
        "uWorldMax",
        "uLayerScales",
        "uSlopeRules",
        "uVertexTintStrength",
        "uTerrainDebug",
        "uZoneFogColor",
        "uZoneFogStart",
        "uZoneFogEnd",
        "uZoneCameraPosition",
        ...ZONE_SHADER_LIGHTING_UNIFORMS,
      ],
      samplers: [
        "uGrassAlbedo",
        "uGrassMr",
        "uDirtAlbedo",
        "uDirtMr",
        "uRockAlbedo",
        "uRockMr",
        "uControlMap0",
      ],
      shaderLanguage: BABYLON.ShaderLanguage.WGSL,
    },
  );
  material.backFaceCulling = false;
  material.metadata = { ...material.metadata, requiemZoneAtmosphere: true, eltaniaTerrain: "grass-dirt-rock" };
  material.setTexture("uGrassAlbedo", options.grass.albedo);
  material.setTexture("uGrassMr", options.grass.metallicRoughness);
  material.setTexture("uDirtAlbedo", options.dirt.albedo);
  material.setTexture("uDirtMr", options.dirt.metallicRoughness);
  material.setTexture("uRockAlbedo", options.rock.albedo);
  material.setTexture("uRockMr", options.rock.metallicRoughness);
  material.setTexture("uControlMap0", options.controlMap0);
  material.setVector2("uWorldMin", new BABYLON.Vector2(...options.worldMin));
  material.setVector2("uWorldMax", new BABYLON.Vector2(...options.worldMax));
  material.setVector4("uLayerScales", new BABYLON.Vector4(options.scales.grass, options.scales.dirt, options.scales.rock, options.scales.macro));
  material.setVector4("uSlopeRules", new BABYLON.Vector4(options.rockSlopeStart, options.rockSlopeEnd, options.triplanarSlopeStart, options.triplanarSlopeEnd));
  material.setFloat("uVertexTintStrength", options.useVertexTint === false ? 0 : 1);
  material.setFloat("uTerrainDebug", 0);
  return material;
}
