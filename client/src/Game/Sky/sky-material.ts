import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

export type RequiemSkyLayer = "dome" | "cloudLow" | "cloudHigh" | "horizon";

export type RequiemSkyPalette = {
  low: BJS.Color3;
  mid: BJS.Color3;
  high: BJS.Color3;
  zenith: BJS.Color3;
  cloud: BJS.Color3;
  horizon: BJS.Color3;
  stars: number;
  cloudLowOpacity: number;
  cloudHighOpacity: number;
};

export type RequiemCloudVisualState = {
  offset: BJS.Vector2;
  scale: number;
  textureScale: number;
  coverage: number;
  softness: number;
  detail: number;
  warp: number;
  stretch: number;
  lightStrength: number;
};

export type RequiemAtmosphereState = {
  starElapsedSeconds: number;
  starRotationRadians: number;
  sunDirection: BJS.Vector3;
  haze: number;
  sunGlow: number;
};

export type RequiemSkyTextures = {
  cloudField: BJS.BaseTexture;
  starField: BJS.BaseTexture;
};

const layerIds: Record<RequiemSkyLayer, number> = {
  dome: 0,
  cloudLow: 1,
  cloudHigh: 2,
  horizon: 3,
};

BABYLON.Effect.ShadersStore["requiemSkyVertexShader"] = `
precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;

varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

BABYLON.Effect.ShadersStore["requiemSkyFragmentShader"] = `
precision highp float;

varying vec3 vDirection;

uniform float uLayer;
uniform vec3 uLowColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;
uniform vec3 uZenithColor;
uniform vec3 uCloudColor;
uniform vec3 uHorizonColor;
uniform vec2 uCloudOffset;
uniform float uStarStrength;
uniform float uCloudOpacity;
uniform float uCloudScale;
uniform float uCloudTextureScale;
uniform float uCloudCoverage;
uniform float uCloudSoftness;
uniform float uCloudDetail;
uniform float uCloudWarp;
uniform float uCloudStretch;
uniform float uCloudLightStrength;
uniform float uStarElapsedSeconds;
uniform float uStarRotationRadians;
uniform vec3 uSunDirection;
uniform float uHaze;
uniform float uSunGlow;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);

  return mix(
    mix(
      mix(hash31(cell + vec3(0.0, 0.0, 0.0)), hash31(cell + vec3(1.0, 0.0, 0.0)), local.x),
      mix(hash31(cell + vec3(0.0, 1.0, 0.0)), hash31(cell + vec3(1.0, 1.0, 0.0)), local.x),
      local.y
    ),
    mix(
      mix(hash31(cell + vec3(0.0, 0.0, 1.0)), hash31(cell + vec3(1.0, 0.0, 1.0)), local.x),
      mix(hash31(cell + vec3(0.0, 1.0, 1.0)), hash31(cell + vec3(1.0, 1.0, 1.0)), local.x),
      local.y
    ),
    local.z
  );
}

float fbm(vec3 p) {
  float result = 0.0;
  float amplitude = 0.53;
  for (int octave = 0; octave < 4; octave++) {
    result += amplitude * noise3(p);
    p = p * 2.03 + vec3(17.1, 9.2, 13.7);
    amplitude *= 0.48;
  }
  return result;
}

float fbmDetail(vec3 p, float detailAmount) {
  float broad = fbm(p);
  float detail = fbm(p * 2.73 + vec3(5.4, 1.2, 8.6));
  return mix(broad, detail, detailAmount);
}

vec2 sphericalUV(vec3 direction) {
  return vec2(
    atan(direction.z, direction.x) / 6.28318530718 + 0.5,
    asin(clamp(direction.y, -1.0, 1.0)) / 3.14159265359 + 0.5
  );
}

vec2 cloudSphericalUV(vec3 direction) {
  return vec2(
    atan(direction.z, direction.x) / 6.28318530718 + 0.5,
    clamp(
      asin(clamp(direction.y, 0.0, 1.0)) / 1.57079632679,
      0.0,
      1.0
    )
  );
}

uniform sampler2D uCloudTexture;
uniform sampler2D uStarTexture;

vec3 skyGradient(float elevation) {
  // Follow the original two-stage low→mid→high blend, but overlap each eased
  // range so neither a color stop nor its derivative creates a visible band.
  vec3 lowerSky = mix(
    uLowColor,
    uMidColor,
    smoothstep(-0.08, 0.42, elevation)
  );
  vec3 upperSky = mix(
    uHighColor,
    uZenithColor,
    smoothstep(0.52, 1.02, elevation)
  );
  return mix(
    lowerSky,
    upperSky,
    smoothstep(0.20, 0.78, elevation)
  );
}

void main() {
  vec3 direction = normalize(vDirection);

  if (uLayer < 0.5) {
    // Elevation zero is the true horizon. The previous 0.5 remap placed the
    // mid/high palette at eye level and made the horizon overlay read as a
    // separate stripe.
    float elevation = clamp(direction.y, 0.0, 1.0);
    vec3 gradient = skyGradient(elevation);
    float broadVariation = fbm(direction * 3.2 + vec3(2.7, 8.3, 4.1));
    float variationFade = smoothstep(0.02, 0.32, elevation);
    gradient *= mix(
      1.0,
      mix(0.94, 1.025, broadVariation),
      variationFade
    );

    float starCos = cos(uStarRotationRadians);
    float starSin = sin(uStarRotationRadians);
    vec3 starDirection = direction;
    starDirection.xz = mat2(starCos, -starSin, starSin, starCos) * direction.xz;
    vec3 starCell = floor(starDirection * 760.0);
    float starSeed = hash31(starCell);
    float star = step(0.99835, starSeed);
    float twinkle = mix(
      0.72,
      1.18,
      0.5 + 0.5 * sin(uStarElapsedSeconds * mix(0.7, 1.9, starSeed) + starSeed * 91.0)
    );
    float horizonFade = smoothstep(-0.03, 0.25, direction.y);
    vec3 starColor = mix(vec3(0.68, 0.78, 1.0), vec3(1.0, 0.84, 0.62), hash31(starCell + 19.7));
    vec3 generatedStars = texture2D(
      uStarTexture,
      sphericalUV(starDirection)
    ).rgb;
    float sunFacing = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunHalo = pow(sunFacing, 48.0) * 0.22 + pow(sunFacing, 512.0) * 1.25;
    float horizonHaze = 1.0 - smoothstep(0.0, 0.48, abs(direction.y));
    horizonHaze = horizonHaze * horizonHaze * (3.0 - 2.0 * horizonHaze);
    gradient = mix(gradient, uHorizonColor, horizonHaze * uHaze * 0.24);
    gl_FragColor = vec4(
      gradient
        + starColor * star * twinkle * uStarStrength * horizonFade
        + generatedStars * uStarStrength * horizonFade * twinkle * 1.35
        + uHorizonColor * sunHalo * uSunGlow,
      1.0
    );
    return;
  }

  if (uLayer < 2.5) {
    bool lowLayer = uLayer < 1.5;
    float layerPhase = lowLayer ? 0.0 : 11.7;
    vec3 shapedDirection = direction;
    if (!lowLayer) {
      shapedDirection = normalize(vec3(
        direction.x * uCloudStretch,
        direction.y * 0.72,
        direction.z / max(0.25, uCloudStretch)
      ));
    }
    vec3 cloudPosition =
      shapedDirection * uCloudScale
      + vec3(uCloudOffset.x, layerPhase, uCloudOffset.y);
    vec3 warp = vec3(
      noise3(cloudPosition * 0.47 + 3.1),
      noise3(cloudPosition * 0.43 + 9.7),
      noise3(cloudPosition * 0.51 + 17.3)
    ) - 0.5;
    cloudPosition += warp * uCloudWarp;
    float broad = fbm(cloudPosition);
    float density = fbmDetail(cloudPosition, uCloudDetail);
    // Texture tiling is deliberately independent from procedural noise scale.
    // Integer azimuth tiling keeps the spherical seam closed, while the lower
    // elevation frequency gives the authored cloud fronts a world-sized read.
    vec2 cloudUV = fract(
      cloudSphericalUV(shapedDirection)
        * vec2(uCloudTextureScale, uCloudTextureScale * 0.58)
        + uCloudOffset * 0.14
        + vec2(layerPhase * 0.017)
    );
    vec3 generatedCloudColor = texture2D(uCloudTexture, cloudUV).rgb;
    float generatedCloud = smoothstep(
      0.16,
      0.58,
      dot(generatedCloudColor, vec3(0.2126, 0.7152, 0.0722))
    );
    density = mix(density, generatedCloud, lowLayer ? 0.72 : 0.56);
    if (!lowLayer) {
      float strands = fbm(vec3(
        cloudPosition.x * 0.42,
        cloudPosition.y * 1.8,
        cloudPosition.z * 0.32
      ) + vec3(4.0, 0.0, 13.0));
      density = mix(density, density * strands * 1.42, 0.58);
    }
    float cloud = smoothstep(
      uCloudCoverage - max(0.018, uCloudSoftness * 0.5),
      uCloudCoverage + max(0.018, uCloudSoftness * 0.5),
      density
    );
    float skyFade = smoothstep(-0.10, 0.16, direction.y);
    float alpha = cloud * uCloudOpacity * skyFade;
    float sunFacing = max(dot(direction, normalize(uSunDirection)), 0.0);
    float silverLining =
      pow(sunFacing, lowLayer ? 18.0 : 10.0)
      * (1.0 - cloud)
      * uCloudLightStrength;
    float authoredShade = mix(0.82, 1.08, generatedCloud);
    float shade =
      mix(lowLayer ? 0.58 : 0.74, 1.06, broad)
      * mix(1.0, authoredShade, lowLayer ? 0.38 : 0.24);
    vec3 litCloud = uCloudColor * shade;
    litCloud += mix(uCloudColor, vec3(1.0, 0.93, 0.78), 0.58) * silverLining;
    gl_FragColor = vec4(litCloud, alpha);
    return;
  }

  float horizonDistance = abs(direction.y);
  float band = 1.0 - smoothstep(0.0, 0.125, horizonDistance);
  band = band * band * (3.0 - 2.0 * band);
  gl_FragColor = vec4(
    uHorizonColor,
    band * mix(0.10, 0.22, clamp(uHaze, 0.0, 1.0))
  );
}
`;

export const createRequiemSkyMaterial = (
  name: string,
  scene: BJS.Scene,
  layer: RequiemSkyLayer,
  textures: RequiemSkyTextures,
): BJS.ShaderMaterial => {
  const transparent = layer !== "dome";
  const material = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: "requiemSky", fragment: "requiemSky" },
    {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        "uLayer",
        "uLowColor",
        "uMidColor",
        "uHighColor",
        "uZenithColor",
        "uCloudColor",
        "uHorizonColor",
        "uCloudOffset",
        "uStarStrength",
        "uCloudOpacity",
        "uCloudScale",
        "uCloudTextureScale",
        "uCloudCoverage",
        "uCloudSoftness",
        "uCloudDetail",
        "uCloudWarp",
        "uCloudStretch",
        "uCloudLightStrength",
        "uStarElapsedSeconds",
        "uStarRotationRadians",
        "uSunDirection",
        "uHaze",
        "uSunGlow",
      ],
      samplers: ["uCloudTexture", "uStarTexture"],
      needAlphaBlending: transparent,
      shaderLanguage: BABYLON.ShaderLanguage.GLSL,
    },
  );

  material.backFaceCulling = false;
  material.disableDepthWrite = transparent;
  if (transparent) {
    material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  }
  material.setFloat("uLayer", layerIds[layer]);
  material.setVector2("uCloudOffset", BABYLON.Vector2.Zero());
  material.setFloat("uStarStrength", 0);
  material.setFloat("uCloudOpacity", 0);
  material.setFloat("uCloudScale", 3);
  material.setFloat("uCloudTextureScale", 1);
  material.setFloat("uCloudCoverage", 0.5);
  material.setFloat("uCloudSoftness", 0.2);
  material.setFloat("uCloudDetail", 0.3);
  material.setFloat("uCloudWarp", 0.2);
  material.setFloat("uCloudStretch", 1);
  material.setFloat("uCloudLightStrength", 0.4);
  material.setFloat("uStarElapsedSeconds", 0);
  material.setFloat("uStarRotationRadians", 0);
  material.setVector3("uSunDirection", BABYLON.Vector3.Up());
  material.setFloat("uHaze", 0.2);
  material.setFloat("uSunGlow", 0);
  material.setTexture("uCloudTexture", textures.cloudField);
  material.setTexture("uStarTexture", textures.starField);
  return material;
};

export const setRequiemSkyPalette = (
  material: BJS.ShaderMaterial,
  palette: RequiemSkyPalette,
  layer: RequiemSkyLayer,
): void => {
  material.setColor3("uLowColor", palette.low);
  material.setColor3("uMidColor", palette.mid);
  material.setColor3("uHighColor", palette.high);
  material.setColor3("uZenithColor", palette.zenith);
  material.setColor3("uCloudColor", palette.cloud);
  material.setColor3("uHorizonColor", palette.horizon);
  material.setFloat("uStarStrength", palette.stars);
  material.setFloat(
    "uCloudOpacity",
    layer === "cloudLow"
      ? palette.cloudLowOpacity
      : layer === "cloudHigh"
        ? palette.cloudHighOpacity
        : 0,
  );
};

export const setRequiemCloudState = (
  material: BJS.ShaderMaterial,
  state: RequiemCloudVisualState,
): void => {
  material.setVector2("uCloudOffset", state.offset);
  material.setFloat("uCloudScale", state.scale);
  material.setFloat("uCloudTextureScale", state.textureScale);
  material.setFloat("uCloudCoverage", state.coverage);
  material.setFloat("uCloudSoftness", state.softness);
  material.setFloat("uCloudDetail", state.detail);
  material.setFloat("uCloudWarp", state.warp);
  material.setFloat("uCloudStretch", state.stretch);
  material.setFloat("uCloudLightStrength", state.lightStrength);
};

export const setRequiemAtmosphereState = (
  material: BJS.ShaderMaterial,
  state: RequiemAtmosphereState,
): void => {
  material.setFloat("uStarElapsedSeconds", state.starElapsedSeconds);
  material.setFloat("uStarRotationRadians", state.starRotationRadians);
  material.setVector3("uSunDirection", state.sunDirection);
  material.setFloat("uHaze", state.haze);
  material.setFloat("uSunGlow", state.sunGlow);
};
