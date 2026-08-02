import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { ZONE_SHADER_LIGHTING_UNIFORMS } from "./zone-shader-lighting";

export const REQUIEM_GRASS_SHADER = "requiemGrass";

export const grassVertexWGSL = /* wgsl */ `
attribute position: vec3f;
attribute uv: vec2f;
#ifdef INSTANCES
attribute world0: vec4f;
attribute world1: vec4f;
attribute world2: vec4f;
attribute world3: vec4f;
attribute grassData: vec4f;
#endif

uniform world: mat4x4f;
uniform viewProjection: mat4x4f;
uniform uTime: f32;
uniform uWindDirection: vec2f;
uniform uWindStrength: f32;
uniform uFocusPosition: vec3f;
uniform uFadeInStart: f32;
uniform uFadeInEnd: f32;
uniform uFadeStart: f32;
uniform uFadeEnd: f32;
uniform uDensityFadeStart: f32;
uniform uDensityFadeEnd: f32;
uniform uMinimumDensity: f32;

varying vUV: vec2f;
varying vVisibility: f32;
varying vRandomPhase: f32;
varying vBladeAccent: f32;

fn grassHash(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var instanceWorld = mat4x4f(
    vec4f(1.0, 0.0, 0.0, 0.0),
    vec4f(0.0, 1.0, 0.0, 0.0),
    vec4f(0.0, 0.0, 1.0, 0.0),
    vec4f(0.0, 0.0, 0.0, 1.0)
  );
  var randomPhase = grassHash(floor(vertexInputs.position.xz * 2.0) * 0.5);
  var stiffness = 0.5;
  var accent = grassHash(vertexInputs.position.xz + vec2f(19.7, -7.3));
#ifdef INSTANCES
  instanceWorld = mat4x4f(
    vertexInputs.world0,
    vertexInputs.world1,
    vertexInputs.world2,
    vertexInputs.world3
  );
  randomPhase = vertexInputs.grassData.x;
  stiffness = vertexInputs.grassData.y;
  accent = vertexInputs.grassData.w;
#endif
  let rootPosition = uniforms.world * instanceWorld[3];
  let root = rootPosition.xz;
  let distanceToFocus = distance(root, uniforms.uFocusPosition.xz);
  let fadeIn = smoothstep(
    uniforms.uFadeInStart,
    uniforms.uFadeInEnd,
    distanceToFocus
  );
  let fadeOut = 1.0 - smoothstep(
    uniforms.uFadeStart,
    uniforms.uFadeEnd,
    distanceToFocus
  );
  let visibility = fadeIn * fadeOut;
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.vVisibility = visibility;
  vertexOutputs.vRandomPhase = randomPhase;
  vertexOutputs.vBladeAccent = accent;
  let densityDistance = smoothstep(
    uniforms.uDensityFadeStart,
    uniforms.uDensityFadeEnd,
    distanceToFocus
  );
  let densityThreshold = mix(1.0, uniforms.uMinimumDensity, densityDistance);
  if (
    distanceToFocus <= uniforms.uFadeInStart ||
    distanceToFocus >= uniforms.uFadeEnd ||
    randomPhase > densityThreshold
  ) {
    vertexOutputs.position = vec4f(2.0, 2.0, 2.0, 1.0);
    return vertexOutputs;
  }

  let tipWeight = vertexInputs.uv.y * vertexInputs.uv.y;
  let windDirection = normalize(uniforms.uWindDirection + vec2f(0.0001, 0.0001));
  let broadWave = sin(
    dot(root, windDirection * 0.34)
      + uniforms.uTime * (1.35 + randomPhase * 0.22)
  );
  let gust = sin(
    dot(root, vec2f(-0.21, 0.27))
      - uniforms.uTime * 0.73
      + randomPhase * 6.2831853
  );
  let flexibility = mix(1.2, 0.38, stiffness);
  let windWave = 0.56 + (broadWave * 0.68 + gust * 0.32) * 0.44;
  let perpendicularWind = vec2f(-windDirection.y, windDirection.x);
  var bend = windDirection
    * windWave
    * uniforms.uWindStrength
    * flexibility
    * tipWeight;
  bend += perpendicularWind
    * gust
    * uniforms.uWindStrength
    * 0.1
    * flexibility
    * tipWeight;

  let instancePosition = instanceWorld * vec4f(vertexInputs.position, 1.0);
  var worldPosition = uniforms.world * instancePosition;
  worldPosition.x += bend.x;
  worldPosition.z += bend.y;
  worldPosition.y -= length(bend) * 0.075 * tipWeight;

  vertexOutputs.position = uniforms.viewProjection * worldPosition;
}
`;

export const grassFragmentWGSL = /* wgsl */ `
varying vUV: vec2f;
varying vVisibility: f32;
varying vRandomPhase: f32;
varying vBladeAccent: f32;

uniform uBaseColor: vec3f;
uniform uColorVariance: f32;
uniform uZoneDaylightFactor: f32;

fn grassDitherHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(91.7, 271.9))) * 43758.5453);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let centered = abs(fragmentInputs.vUV.x - 0.5) * 2.0;
  let bladeHalfWidth = mix(0.92, 0.055, fragmentInputs.vUV.y);
  if (centered > bladeHalfWidth || fragmentInputs.vUV.y < 0.015) {
    discard;
  }
  if (
    grassDitherHash(
      vec2f(
        fragmentInputs.vRandomPhase * 31.7,
        fragmentInputs.vRandomPhase * 67.3
      )
    ) > fragmentInputs.vVisibility
  ) {
    discard;
  }

  let rootShade = mix(0.78, 1.0, smoothstep(0.0, 0.42, fragmentInputs.vUV.y));
  let signedVariation = fragmentInputs.vBladeAccent * 2.0 - 1.0;
  let brightness = 1.0 + signedVariation * uniforms.uColorVariance;
  let subtleHue = vec3f(
    1.0 - signedVariation * uniforms.uColorVariance * 0.22,
    1.0 + signedVariation * uniforms.uColorVariance * 0.16,
    1.0 - signedVariation * uniforms.uColorVariance * 0.12
  );
  let tipLift = mix(0.94, 1.04, smoothstep(0.1, 1.0, fragmentInputs.vUV.y));
  let color = uniforms.uBaseColor
    * subtleHue
    * brightness
    * rootShade
    * tipLift
    * uniforms.uZoneDaylightFactor;

  fragmentOutputs.color = vec4f(color, 1.0);
}
`;

export function registerGrassShader(): void {
  const store = BABYLON.ShaderStore.ShadersStoreWGSL;
  store[`${REQUIEM_GRASS_SHADER}VertexShader`] = grassVertexWGSL;
  store[`${REQUIEM_GRASS_SHADER}FragmentShader`] = grassFragmentWGSL;
}

export type GrassMaterialOptions = {
  name?: string;
  windDirection?: BJS.Vector2;
  windStrength?: number;
  baseColor?: BJS.Color3;
  colorVariance?: number;
  fadeInStart?: number;
  fadeInEnd?: number;
  fadeStart?: number;
  fadeEnd?: number;
  densityFadeStart?: number;
  densityFadeEnd?: number;
  minimumDensity?: number;
};

export function createGrassMaterial(
  scene: BJS.Scene,
  options: GrassMaterialOptions = {},
): BJS.ShaderMaterial {
  registerGrassShader();
  const material = new BABYLON.ShaderMaterial(
    options.name ?? "RequiemGrassMaterial",
    scene,
    {
      vertex: REQUIEM_GRASS_SHADER,
      fragment: REQUIEM_GRASS_SHADER,
    },
    {
      attributes: ["position", "uv", "grassData"],
      uniforms: [
        "world",
        "viewProjection",
        "uTime",
        "uWindDirection",
        "uWindStrength",
        "uFocusPosition",
        "uFadeInStart",
        "uFadeInEnd",
        "uFadeStart",
        "uFadeEnd",
        "uDensityFadeStart",
        "uDensityFadeEnd",
        "uMinimumDensity",
        "uBaseColor",
        "uColorVariance",
        ...ZONE_SHADER_LIGHTING_UNIFORMS,
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
    // Midpoint of the grass surface's base/highlight palette. Blade-level
    // variance stays bounded around this value so cards blend into terrain.
    options.baseColor ?? BABYLON.Color3.FromHexString("#52743B"),
  );
  material.setFloat("uColorVariance", options.colorVariance ?? 0.12);
  material.setVector3("uFocusPosition", BABYLON.Vector3.Zero());
  material.setFloat("uFadeInStart", options.fadeInStart ?? -1);
  material.setFloat("uFadeInEnd", options.fadeInEnd ?? 0);
  material.setFloat("uFadeStart", options.fadeStart ?? 104);
  material.setFloat("uFadeEnd", options.fadeEnd ?? 132);
  material.setFloat("uDensityFadeStart", options.densityFadeStart ?? 58);
  material.setFloat("uDensityFadeEnd", options.densityFadeEnd ?? 118);
  material.setFloat("uMinimumDensity", options.minimumDensity ?? 0.42);
  material.needAlphaBlending = () => false;
  return material;
}
