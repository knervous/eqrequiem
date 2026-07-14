import * as BABYLON from '@babylonjs/core';

import { NameplateData } from '../extensions/NameplateData';
import type { ShadoInstanceContainer } from '../extensions/ShadoInstanceContainer/ShadoInstanceContainer';

export { NameplateData };

export type MSDFNameplateFontAsset = {
  textures: BABYLON.BaseTexture[];
  _font?: {
    common?: { scaleW?: number; scaleH?: number };
    distanceField?: { distanceRange?: number };
  };
};

export type MSDFNameplateLayerOptions = {
  debug?: boolean;
  debugMode?: 'none' | 'solid' | 'atlas';
  debugColor?: [number, number, number, number];
  alphaCutoff?: number;
  distanceRange?: number;
  /**
   * Whether MSDF nameplates should be depth-tested against the 3D scene.
   * Defaults to true so actors occlude labels while labels still draw after opaque geometry.
   */
  depthTest?: boolean;
  meshName?: string;
  renderingGroupId?: number;
  thickness?: number;
};

type ShadoBufferOwner = {
  commit(): void;
  bind(effect: BABYLON.Effect): void;
  bindMaterial?(material: BABYLON.ShaderMaterial): void;
  commitAndBind(effect: BABYLON.Effect): void;
  getSchema(): {
    name: string;
    fields?: ReadonlyArray<{ name: string }>;
    structArrays?: Record<string, { schema: { name: string } }>;
  };
};

function getDefaultRenderingGroupId(actors: ShadoBufferOwner): number {
  const bindings = (actors as any)._bindings;
  const firstMesh = bindings?.keys?.().next?.().value as BABYLON.AbstractMesh | undefined;
  return firstMesh?.renderingGroupId ?? 0;
}

function getShaderIO(owner: ShadoBufferOwner, engine: BABYLON.AbstractEngine) {
  return (
    owner.constructor as unknown as {
      shaderIO(engine: BABYLON.AbstractEngine): { uniforms: string[]; samplers: string[] };
    }
  ).shaderIO(engine);
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function getNameplateDebugSnapshot(
  actors: ShadoInstanceContainer<any> & ShadoBufferOwner,
  nameplates: NameplateData & ShadoBufferOwner,
  material: BABYLON.ShaderMaterial,
  fontAsset: MSDFNameplateFontAsset,
  uniforms: string[],
  samplers: string[],
  subMesh?: BABYLON.SubMesh
) {
  const effect = subMesh?.effect ?? material.getEffect();
  const texture = fontAsset.textures[0];
  const missingUniforms = effect?.isReady()
    ? uniforms.filter(name => !effect.getUniform(name)).slice(0, 12)
    : [];
  const missingSamplers = effect?.isReady()
    ? samplers.filter(name => !effect.getSamplers().includes(name)).slice(0, 12)
    : [];

  return {
    glyphCount: nameplates.glyphCount(),
    actorInstances: (actors as any).instanceCount,
    actorVisible: (actors as any).visibleCount,
    names: (nameplates as any).nameCount?.(),
    materialReady: material.isReady(),
    effectReady: effect?.isReady() ?? false,
    fontTextureReady: texture?.isReady?.() ?? false,
    fontAtlasSize: getFontAtlasSize(fontAsset),
    fontDistanceRange: getFontDistanceRange(fontAsset, {}),
    glyphSegments: {
      glyphGid: (nameplates as any)._varSeg?.glyphGid,
      glyphOwner: (nameplates as any)._varSeg?.glyphOwner,
      glyphOfs2: (nameplates as any)._varSeg?.glyphOfs2,
    },
    missingUniforms,
    missingSamplers,
  };
}

function getFontAtlasSize(fontAsset: MSDFNameplateFontAsset): { width: number; height: number } {
  const textureSize = fontAsset.textures[0]?.getSize?.();
  const fontCommon = fontAsset._font?.common;
  return {
    width: textureSize?.width || fontCommon?.scaleW || 1,
    height: textureSize?.height || fontCommon?.scaleH || 1,
  };
}

function getFontDistanceRange(
  fontAsset: MSDFNameplateFontAsset,
  options: MSDFNameplateLayerOptions
): number {
  return options.distanceRange ?? fontAsset._font?.distanceField?.distanceRange ?? 4;
}

export type MSDFTextShaderOptions = {
  shaderName?: string;
  actorStructName?: string;
  containerStructName?: string;
  nameplateStructName?: string;
  useActorBillboardFlag?: boolean;
};

function normalizeOptions(
  shaderNameOrOptions?: string | MSDFTextShaderOptions
): Required<MSDFTextShaderOptions> {
  const options =
    typeof shaderNameOrOptions === 'string'
      ? { shaderName: shaderNameOrOptions }
      : (shaderNameOrOptions ?? {});
  return {
    shaderName: options.shaderName ?? 'shadoMsdfText',
    actorStructName: options.actorStructName ?? 'ShadoActor',
    containerStructName: options.containerStructName ?? 'ShadoInstanceContainer',
    nameplateStructName: options.nameplateStructName ?? 'NameplateData',
    useActorBillboardFlag: options.useActorBillboardFlag ?? false,
  };
}

function applySchemaNames(source: string, options: Required<MSDFTextShaderOptions>): string {
  return source
    .replaceAll(
      '/*SHADO_MSDF_BILLBOARD_FLAG_GLSL*/',
      options.useActorBillboardFlag
        ? 'float billboardFlag = ShadoInstanceContainer_fetch(ownerBase + ShadoActor_billboardFlag_OFF);'
        : 'float billboardFlag = 1.0;'
    )
    .replaceAll(
      '/*SHADO_MSDF_BILLBOARD_FLAG_WGSL*/',
      options.useActorBillboardFlag
        ? 'let billboardFlag = ShadoInstanceContainer_fetch(ownerBase + ShadoActor_billboardFlag_OFF);'
        : 'let billboardFlag = 1.0;'
    )
    .replaceAll('ShadoActor', options.actorStructName)
    .replaceAll('ShadoInstanceContainer', options.containerStructName)
    .replaceAll('NameplateData', options.nameplateStructName);
}

export const MSDF_TEXT_VERTEX_GLSL_TEMPLATE = /* glsl */ `
precision highp float;

attribute vec2 corner;

uniform mat4 worldViewProjection;
uniform mat4 view;
uniform float uThickness;

#include<ShadoActor>
#include<ShadoActorOffsets>
#include<ShadoInstanceContainerStorage>
#include<NameplateDataStorage>

varying vec2 vUV;
varying float vThickness;
varying vec4 vNameColor;

vec3 shadoMsdfCamRight() { return vec3(view[0][0], view[1][0], view[2][0]); }
vec3 shadoMsdfCamUp() { return vec3(view[0][1], view[1][1], view[2][1]); }

void main() {
  int glyphIndex = gl_InstanceID;
  if (glyphIndex < 0 || glyphIndex >= NameplateData_glyphGid_count()) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vNameColor = vec4(0.0);
    vUV = vec2(0.0);
    vThickness = 0.0;
    return;
  }

  int gid = int(NameplateData_glyphGid_get(glyphIndex));
  vec2 ofsEM = NameplateData_glyphOfs2_get(glyphIndex);
  int owner = int(NameplateData_glyphOwner_get(glyphIndex));
  if (gid < 0 || gid >= NameplateData_glyphUv4_count() || owner < 0 || owner >= uShadoInstanceContainer_instancesCount) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vNameColor = vec4(0.0);
    vUV = vec2(0.0);
    vThickness = 0.0;
    return;
  }

  int ownerBase = uShadoInstanceContainer_instancesBase + owner * uShadoInstanceContainer_instancesStride;
  int ownerVisible = int(ShadoInstanceContainer_fetch(ownerBase + ShadoActor_visibleFlag_OFF));
  if (ownerVisible == 0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vNameColor = vec4(0.0);
    vUV = vec2(0.0);
    vThickness = 0.0;
    return;
  }

  vec4 translation = ShadoInstanceContainer_fetch4(ownerBase + ShadoActor_translation_OFF);
  float worldPerEM = ShadoInstanceContainer_fetch(ownerBase + ShadoActor_nameWorldPerEM_OFF);
  float nameLiftWorld = ShadoInstanceContainer_fetch(ownerBase + ShadoActor_nameLiftWorld_OFF);
  /*SHADO_MSDF_BILLBOARD_FLAG_GLSL*/
  vNameColor = ShadoInstanceContainer_fetch4(ownerBase + ShadoActor_nameplateColor_OFF);

  vec4 planeEM = NameplateData_glyphPlane4_get(gid);
  vec4 uv = NameplateData_glyphUv4_get(gid);

  bool invalid =
    abs(translation.x) > 10000.0 || abs(translation.y) > 10000.0 || abs(translation.z) > 10000.0 ||
    translation.w <= 0.0 || translation.w > 1000.0 ||
    worldPerEM <= 0.0 || worldPerEM > 10.0 ||
    abs(nameLiftWorld) > 1000.0 ||
    abs(ofsEM.x) > 128.0 || abs(ofsEM.y) > 128.0 ||
    abs(planeEM.x) > 8.0 || abs(planeEM.y) > 8.0 || abs(planeEM.z) > 8.0 || abs(planeEM.w) > 8.0 ||
    uv.z <= 0.0 || uv.w <= 0.0 || uv.x < -0.001 || uv.y < -0.001 || uv.x + uv.z > 1.001 || uv.y + uv.w > 1.001 ||
    vNameColor.a <= 0.0;
  if (invalid) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vNameColor = vec4(0.0);
    vUV = vec2(0.0);
    vThickness = 0.0;
    return;
  }

  float worldScale = clamp(worldPerEM * translation.w, 0.001, 2.0);
  vec2 planePos = mix(planeEM.xy, planeEM.zw, corner) * worldScale;
  float billboardMix = step(0.5, billboardFlag);
  vec3 labelRight = mix(vec3(1.0, 0.0, 0.0), shadoMsdfCamRight(), billboardMix);
  vec3 labelUp = mix(vec3(0.0, 0.0, 1.0), shadoMsdfCamUp(), billboardMix);

  vec3 worldPos = translation.xyz
    + labelRight * (ofsEM.x * worldScale + planePos.x)
    + labelUp * (translation.w + nameLiftWorld * translation.w + planePos.y + ofsEM.y * worldScale);

  vUV = vec2(uv.x + corner.x * uv.z, uv.y + (1.0 - corner.y) * uv.w);
  vThickness = uThickness;
  gl_Position = worldViewProjection * vec4(worldPos, 1.0);
}
`;

export const MSDF_TEXT_FRAGMENT_GLSL_TEMPLATE = /* glsl */ `
precision highp float;

uniform sampler2D uFontAtlas;
uniform vec2 uFontAtlasSize;
uniform float uDistanceRange;
uniform float uAlphaCutoff;
uniform int uDebugMode;
uniform vec4 uDebugColor;

varying vec2 vUV;
varying float vThickness;
varying vec4 vNameColor;

float shadoMsdfMedian(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  if (uDebugMode == 1) {
    gl_FragColor = vec4(uDebugColor.rgb, uDebugColor.a);
    return;
  }

  vec4 atlasSample = texture2D(uFontAtlas, vUV);
  vec3 msdf = atlasSample.rgb;
  if (uDebugMode == 2) {
    gl_FragColor = vec4(msdf, 1.0);
    return;
  }

  float sd = shadoMsdfMedian(msdf.r, msdf.g, msdf.b) - 0.5 + vThickness;
  float alpha = clamp(sd / max(fwidth(sd), 0.0001) + 0.5, 0.0, 1.0) * atlasSample.a;
  if (alpha <= uAlphaCutoff) discard;
  gl_FragColor = vec4(vNameColor.rgb, alpha * vNameColor.a);
}
`;

export const MSDF_TEXT_VERTEX_WGSL_TEMPLATE = /* wgsl */ `
attribute position : vec3f;
attribute corner : vec2f;
varying vUV : vec2f;
varying vThickness : f32;
varying vNameColor : vec4f;
uniform view: mat4x4f;
uniform worldViewProjection: mat4x4f;

#include<sceneUboDeclaration>
#include<ShadoActor>
#include<ShadoActorOffsets>
#include<ShadoInstanceContainerStorage>
#include<NameplateDataStorage>

fn shadoMsdfCamRight(view: mat4x4f) -> vec3f { return vec3f(view[0].x, view[1].x, view[2].x); }
fn shadoMsdfCamUp(view: mat4x4f) -> vec3f { return vec3f(view[0].y, view[1].y, view[2].y); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let glyphIndex = i32(vertexInputs.instanceIndex);
  if (glyphIndex < 0 || glyphIndex >= NameplateData_glyphGid_count()) {
    vertexOutputs.position = vec4f(2.0, 2.0, 0.0, 1.0);
    vertexOutputs.vNameColor = vec4f(0.0);
    vertexOutputs.vUV = vec2f(0.0);
    vertexOutputs.vThickness = 0.0;
    return vertexOutputs;
  }

  let gid = i32(NameplateData_glyphGid_get(glyphIndex));
  let ofsEM = NameplateData_glyphOfs2_get(glyphIndex);
  let owner = i32(NameplateData_glyphOwner_get(glyphIndex));
  if (gid < 0 || gid >= NameplateData_glyphUv4_count() || owner < 0 || owner >= uShadoInstanceContainer_instancesCount()) {
    vertexOutputs.position = vec4f(2.0, 2.0, 0.0, 1.0);
    vertexOutputs.vNameColor = vec4f(0.0);
    vertexOutputs.vUV = vec2f(0.0);
    vertexOutputs.vThickness = 0.0;
    return vertexOutputs;
  }

  let ownerBase = uShadoInstanceContainer_instancesBase() + owner * uShadoInstanceContainer_instancesStride();
  let ownerVisible = i32(ShadoInstanceContainer_fetch(ownerBase + ShadoActor_visibleFlag_OFF));
  if (ownerVisible == 0) {
    vertexOutputs.position = vec4f(2.0, 2.0, 0.0, 1.0);
    vertexOutputs.vNameColor = vec4f(0.0);
    vertexOutputs.vUV = vec2f(0.0);
    vertexOutputs.vThickness = 0.0;
    return vertexOutputs;
  }

  let translation = ShadoInstanceContainer_fetch4(ownerBase + ShadoActor_translation_OFF);
  let worldPerEM = ShadoInstanceContainer_fetch(ownerBase + ShadoActor_nameWorldPerEM_OFF);
  let nameLiftWorld = ShadoInstanceContainer_fetch(ownerBase + ShadoActor_nameLiftWorld_OFF);
  /*SHADO_MSDF_BILLBOARD_FLAG_WGSL*/
  vertexOutputs.vNameColor = ShadoInstanceContainer_fetch4(ownerBase + ShadoActor_nameplateColor_OFF);

  let planeEM = NameplateData_glyphPlane4_get(gid);
  let uv = NameplateData_glyphUv4_get(gid);

  if (
    abs(translation.x) > 10000.0 || abs(translation.y) > 10000.0 || abs(translation.z) > 10000.0 ||
    translation.w <= 0.0 || translation.w > 1000.0 ||
    worldPerEM <= 0.0 || worldPerEM > 10.0 ||
    abs(nameLiftWorld) > 1000.0 ||
    abs(ofsEM.x) > 128.0 || abs(ofsEM.y) > 128.0 ||
    abs(planeEM.x) > 8.0 || abs(planeEM.y) > 8.0 || abs(planeEM.z) > 8.0 || abs(planeEM.w) > 8.0 ||
    uv.z <= 0.0 || uv.w <= 0.0 || uv.x < -0.001 || uv.y < -0.001 || uv.x + uv.z > 1.001 || uv.y + uv.w > 1.001 ||
    vertexOutputs.vNameColor.a <= 0.0
  ) {
    vertexOutputs.position = vec4f(2.0, 2.0, 0.0, 1.0);
    vertexOutputs.vNameColor = vec4f(0.0);
    vertexOutputs.vUV = vec2f(0.0);
    vertexOutputs.vThickness = 0.0;
    return vertexOutputs;
  }

  let worldScale = clamp(worldPerEM * translation.w, 0.001, 2.0);
  let planePos = mix(planeEM.xy, planeEM.zw, vertexInputs.corner) * worldScale;
  let billboardMix = step(0.5, billboardFlag);
  let labelRight = mix(vec3f(1.0, 0.0, 0.0), shadoMsdfCamRight(uniforms.view), billboardMix);
  let labelUp = mix(vec3f(0.0, 0.0, 1.0), shadoMsdfCamUp(uniforms.view), billboardMix);

  let worldPos = translation.xyz
    + labelRight * (ofsEM.x * worldScale + planePos.x)
    + labelUp * (translation.w + nameLiftWorld * translation.w + planePos.y + ofsEM.y * worldScale);

  vertexOutputs.vUV = vec2f(uv.x + vertexInputs.corner.x * uv.z, uv.y + (1.0 - vertexInputs.corner.y) * uv.w);
  vertexOutputs.vThickness = 0.0;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(worldPos, 1.0);
}
`;

export const MSDF_TEXT_FRAGMENT_WGSL_TEMPLATE = /* wgsl */ `
var uFontAtlasSampler : sampler;
var uFontAtlas : texture_2d<f32>;
uniform uFontAtlasSize: vec2f;
uniform uDistanceRange: f32;
uniform uAlphaCutoff: f32;
uniform uDebugMode: i32;
uniform uDebugColor: vec4f;

fn shadoMsdfMedian(a: f32, b: f32, c: f32) -> f32 {
  return max(min(a, b), min(max(a, b), c));
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  if (uniforms.uDebugMode == 1) {
    fragmentOutputs.color = uniforms.uDebugColor;
    return fragmentOutputs;
  }

  let atlasSample = textureSample(uFontAtlas, uFontAtlasSampler, fragmentInputs.vUV);
  let msdf = atlasSample.rgb;
  if (uniforms.uDebugMode == 2) {
    fragmentOutputs.color = vec4f(msdf, 1.0);
    return fragmentOutputs;
  }

  let sd = shadoMsdfMedian(msdf.r, msdf.g, msdf.b) - 0.5 + fragmentInputs.vThickness;
  let alpha = clamp(sd / max(fwidth(sd), 0.0001) + 0.5, 0.0, 1.0) * atlasSample.a;
  if (alpha <= uniforms.uAlphaCutoff) { discard; }
  fragmentOutputs.color = vec4f(fragmentInputs.vNameColor.rgb, alpha * fragmentInputs.vNameColor.a);
}
`;

export const MSDF_TEXT_VERTEX_GLSL = applySchemaNames(
  MSDF_TEXT_VERTEX_GLSL_TEMPLATE,
  normalizeOptions()
);
export const MSDF_TEXT_FRAGMENT_GLSL = MSDF_TEXT_FRAGMENT_GLSL_TEMPLATE;
export const MSDF_TEXT_VERTEX_WGSL = applySchemaNames(
  MSDF_TEXT_VERTEX_WGSL_TEMPLATE,
  normalizeOptions()
);
export const MSDF_TEXT_FRAGMENT_WGSL = MSDF_TEXT_FRAGMENT_WGSL_TEMPLATE;

export function makeMSDFTextShaders(options: MSDFTextShaderOptions = {}): {
  vertexGLSL: string;
  fragmentGLSL: string;
  vertexWGSL: string;
  fragmentWGSL: string;
} {
  const normalized = normalizeOptions(options);
  return {
    vertexGLSL: applySchemaNames(MSDF_TEXT_VERTEX_GLSL_TEMPLATE, normalized),
    fragmentGLSL: applySchemaNames(MSDF_TEXT_FRAGMENT_GLSL_TEMPLATE, normalized),
    vertexWGSL: applySchemaNames(MSDF_TEXT_VERTEX_WGSL_TEMPLATE, normalized),
    fragmentWGSL: applySchemaNames(MSDF_TEXT_FRAGMENT_WGSL_TEMPLATE, normalized),
  };
}

export function registerMSDFTextShaders(
  BABYLON: typeof import('@babylonjs/core'),
  shaderNameOrOptions: string | MSDFTextShaderOptions = 'shadoMsdfText'
): { vertex: string; fragment: string } {
  const options = normalizeOptions(shaderNameOrOptions);
  const shaderName = options.shaderName;
  const shaders = makeMSDFTextShaders(options);
  const vertexKey = `${shaderName}VertexShader`;
  const fragmentKey = `${shaderName}FragmentShader`;
  (BABYLON.Effect as any).ShadersStore[vertexKey] = shaders.vertexGLSL;
  (BABYLON.Effect as any).ShadersStore[fragmentKey] = shaders.fragmentGLSL;
  const shaderStore = (BABYLON as any).ShaderStore;
  if (shaderStore?.ShadersStoreWGSL) {
    shaderStore.ShadersStoreWGSL[vertexKey] = shaders.vertexWGSL;
    shaderStore.ShadersStoreWGSL[fragmentKey] = shaders.fragmentWGSL;
  }
  return { vertex: shaderName, fragment: shaderName };
}

export function createMSDFNameplateLayer(
  scene: BABYLON.Scene,
  actors: ShadoInstanceContainer<any> & ShadoBufferOwner,
  nameplates: NameplateData & ShadoBufferOwner,
  fontAsset: MSDFNameplateFontAsset,
  options: MSDFNameplateLayerOptions = {}
): BABYLON.Mesh {
  const engine = scene.getEngine();
  const actorSchema = actors.getSchema().structArrays?.instances?.schema;
  const actorStructName = actorSchema?.name ?? 'ShadoActor';
  const useActorBillboardFlag =
    actorSchema?.fields?.some(field => field.name === 'billboardFlag') ?? false;
  const containerStructName = actors.getSchema().name;
  const nameplateStructName = nameplates.getSchema().name;
  const shaderName = `shadoMsdfText_${containerStructName}_${actorStructName}_${nameplateStructName}`;
  const shader = registerMSDFTextShaders(BABYLON, {
    shaderName,
    actorStructName,
    containerStructName,
    nameplateStructName,
    useActorBillboardFlag,
  });
  const actorShaderIO = getShaderIO(actors, engine);
  const nameplateShaderIO = getShaderIO(nameplates, engine);
  const uniforms = Array.from(
    new Set([
      'worldViewProjection',
      'view',
      'uThickness',
      'uAlphaCutoff',
      'uFontAtlasSize',
      'uDistanceRange',
      'uDebugMode',
      'uDebugColor',
      ...actorShaderIO.uniforms,
      ...nameplateShaderIO.uniforms,
    ])
  );
  const samplers = Array.from(
    new Set(['uFontAtlas', ...actorShaderIO.samplers, ...nameplateShaderIO.samplers])
  );
  const mesh = new BABYLON.Mesh(
    options.meshName ?? `msdf-nameplates-${scene.meshes.length}`,
    scene
  );

  const vertexData = new BABYLON.VertexData();
  vertexData.positions = [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ];
  vertexData.indices = [0, 1, 2, 2, 1, 3];
  vertexData.applyToMesh(mesh, false);
  mesh.setVerticesData('corner', [0, 0, 1, 0, 0, 1, 1, 1], false, 2);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.isPickable = false;
  mesh.renderingGroupId = options.renderingGroupId ?? getDefaultRenderingGroupId(actors);
  mesh.isVisible = false;

  const material = new BABYLON.ShaderMaterial('shado-msdf-nameplates', scene, shader, {
    attributes: ['position', 'corner'],
    uniforms,
    samplers,
    shaderLanguage: BABYLON.ShaderLanguage.GLSL,
  });
  material.backFaceCulling = false;
  material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  material.disableDepthWrite = true;
  material.forceDepthWrite = false;
  material.needDepthPrePass = false;
  material.needAlphaBlending = () => true;
  if (options.debug) {
    material.onCompiled = effect => {
      console.debug('[shado/msdf] material compiled', {
        mesh: mesh.name,
        shaderName,
        uniformsInEffect: effect.getUniformNames(),
        samplersInEffect: effect.getSamplers(),
      });
    };
    material.onError = (effect, errors) => {
      console.warn('[shado/msdf] material compile failed', {
        mesh: mesh.name,
        shaderName,
        errors,
        vertex: effect?._vertexSourceCode,
        fragment: effect?._fragmentSourceCode,
      });
    };
  }
  material.setTexture('uFontAtlas', fontAsset.textures[0]);
  mesh.material = material;

  const debugState = {
    mesh,
    material,
    shaderName,
    actorSchema: actors.getSchema(),
    nameplateSchema: nameplates.getSchema(),
    actorShaderIO,
    nameplateShaderIO,
    uniforms,
    samplers,
  };
  if (options.debug) {
    ((globalThis as any).__shadoMsdfNameplates ??= []).push(debugState);
    console.debug('[shado/msdf] layer created', {
      mesh: mesh.name,
      shaderName,
      actorStructName,
      containerStructName,
      nameplateStructName,
      renderingGroupId: mesh.renderingGroupId,
      uniforms,
      samplers,
      snapshot: getNameplateDebugSnapshot(
        actors,
        nameplates,
        material,
        fontAsset,
        uniforms,
        samplers
      ),
    });
  }

  let lastSkipReason = '';
  let lastDebugAt = 0;
  let loggedFirstDraw = false;
  const logRenderState = (reason: string) => {
    if (!options.debug) return;
    const now = nowMs();
    if (reason === lastSkipReason && now - lastDebugAt < 2000) return;
    lastSkipReason = reason;
    lastDebugAt = now;
    console.debug('[shado/msdf] render state', {
      mesh: mesh.name,
      reason,
      snapshot: getNameplateDebugSnapshot(
        actors,
        nameplates,
        material,
        fontAsset,
        uniforms,
        samplers,
        mesh.subMeshes[0]
      ),
    });
  };

  const updateInstanceCount = () => {
    const glyphCount = nameplates.glyphCount();
    if (glyphCount <= 0) {
      mesh.forcedInstanceCount = 0;
      mesh.isVisible = false;
      logRenderState('no glyphs');
      return;
    }

    mesh.isVisible = true;
    mesh.forcedInstanceCount = 0;
  };

  const beforeRenderObserver = scene.onBeforeRenderObservable.add(updateInstanceCount);

  mesh.render = (subMesh: any, enableAlphaMode: boolean): any => {
    const glyphCount = nameplates.glyphCount();
    if (glyphCount <= 0) {
      logRenderState('no glyphs');
      return mesh;
    }

    actors.commit();
    nameplates.commit();
    actors.bindMaterial?.(material);
    nameplates.bindMaterial?.(material);
    material.setTexture('uFontAtlas', fontAsset.textures[0]);

    if (!material.isReadyForSubMesh(mesh, subMesh)) {
      logRenderState('material not ready');
      return mesh;
    }

    const effect = subMesh?.effect ?? material.getEffect();
    if (!effect?.isReady()) {
      logRenderState('effect not ready');
      return mesh;
    }

    const drawWrapper = (material as any)._storeEffectOnSubMeshes
      ? subMesh._drawWrapper
      : (material as any)._getDrawWrapper();
    if (!drawWrapper) {
      logRenderState('missing draw wrapper');
      return mesh;
    }
    (material as any)._preBind(drawWrapper, (mesh as any)._internalMeshDataInfo?._effectiveSideOrientation);

    effect.setMatrix('worldViewProjection', mesh.getWorldMatrix().multiply(scene.getTransformMatrix()));
    effect.setMatrix('view', scene.getViewMatrix());
    effect.setFloat('uThickness', options.thickness ?? 0.0);
    effect.setFloat('uAlphaCutoff', options.alphaCutoff ?? 0.001);
    const fontTexture = fontAsset.textures[0];
    const fontAtlasSize = getFontAtlasSize(fontAsset);
    effect.setFloat2('uFontAtlasSize', fontAtlasSize.width, fontAtlasSize.height);
    effect.setFloat('uDistanceRange', getFontDistanceRange(fontAsset, options));
    effect.setInt(
      'uDebugMode',
      options.debugMode === 'solid' ? 1 : options.debugMode === 'atlas' ? 2 : 0
    );
    const debugColor = options.debugColor ?? [1, 0, 1, 0.35];
    effect.setFloat4(
      'uDebugColor',
      debugColor[0],
      debugColor[1],
      debugColor[2],
      debugColor[3]
    );

    mesh._bind(subMesh, effect, BABYLON.Material.TriangleFillMode);
    if (enableAlphaMode && material.needAlphaBlending()) {
      engine.setAlphaMode(material.alphaMode);
    }

    effect.setTexture('uFontAtlas', fontTexture);
    actors.bind(effect);
    nameplates.bind(effect);

    const restoreDepthState = {
      depthBuffer: engine.getDepthBuffer(),
      depthWrite: engine.getDepthWrite(),
    };
    engine.setDepthBuffer(options.depthTest ?? true);
    engine.setDepthWrite(false);

    (mesh as any)._draw(subMesh, BABYLON.Material.TriangleFillMode, glyphCount);
    material.unbind();
    engine.setDepthBuffer(restoreDepthState.depthBuffer);
    engine.setDepthWrite(restoreDepthState.depthWrite);

    if (options.debug && subMesh && !loggedFirstDraw) {
      loggedFirstDraw = true;
      console.debug('[shado/msdf] first instanced draw ready', {
        mesh: mesh.name,
        glyphCount,
        indexStart: subMesh.indexStart,
        indexCount: subMesh.indexCount,
        forcedInstanceCount: mesh.forcedInstanceCount,
        alphaMode: engine.getAlphaMode(),
        depthTest: engine.getDepthBuffer(),
        depthWrite: engine.getDepthWrite(),
        snapshot: getNameplateDebugSnapshot(
          actors,
          nameplates,
          material,
          fontAsset,
          uniforms,
          samplers,
          subMesh
        ),
      });
    }

    return mesh;
  };

  mesh.onDisposeObservable.add(() => {
    scene.onBeforeRenderObservable.remove(beforeRenderObserver);
    material.dispose();
  });

  return mesh;
}

export const createMsdfNameplateLayer = createMSDFNameplateLayer;
