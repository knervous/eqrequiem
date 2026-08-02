import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readSource = (relativePath) =>
  readFile(path.join(clientRoot, relativePath), "utf8");

test("FX proving ground is isolated from the game bootstrap", async () => {
  const [html, source] = await Promise.all([
    readSource("fx/index.html"),
    readSource("src/fx/proving-ground.ts"),
  ]);
  assert.match(html, /src\/fx\/proving-ground\.ts/);
  assert.doesNotMatch(source, /src\/main|Game\/|UI\/|LocalBackend|React/);
  assert.match(source, /WebGPUEngine/);
});

test("grass uses native WGSL wind, coarse daylight, and spatial thin-instance cells", async () => {
  const [shader, surfaceShader, geometry, streamer, lighting] =
    await Promise.all([
      readSource("src/fx/grass-shader.ts"),
      readSource("src/fx/grass-surface-shader.ts"),
      readSource("src/fx/grass-geometry.ts"),
      readSource("src/fx/grass-cell-streamer.ts"),
      readSource("src/fx/zone-shader-lighting.ts"),
    ]);
  assert.match(shader, /ShadersStoreWGSL/);
  assert.match(shader, /ShaderLanguage\.WGSL/);
  assert.match(shader, /tipWeight/);
  assert.match(shader, /uWindStrength/);
  assert.match(shader, /uZoneDaylightFactor/);
  assert.match(shader, /uColorVariance/);
  assert.match(shader, /#52743B/);
  assert.doesNotMatch(shader, /grassPlayerLight/);
  assert.doesNotMatch(shader, /overheadLight/);
  assert.match(shader, /uFadeStart/);
  assert.match(shader, /uFadeInStart/);
  assert.match(shader, /uDensityFadeStart/);
  assert.match(shader, /uFocusPosition/);
  assert.match(shader, /distanceToFocus >= uniforms\.uFadeEnd/);
  assert.match(shader, /attribute grassData/);
  assert.match(shader, /vBladeAccent/);
  assert.match(geometry, /new BABYLON\.Mesh/);
  assert.match(geometry, /createGrassCrossGeometry/);
  assert.match(geometry, /createGrassClumpGeometry/);
  assert.match(geometry, /Irregular multi-blade tuft/);
  assert.match(geometry, /createGrassCellsFromPackage/);
  assert.match(geometry, /PROMOTED_GRASS_BLADES_PER_CELL = 1_024/);
  assert.match(geometry, /PROMOTED_GRASS_STRATA_SIDE = 32/);
  assert.match(geometry, /PROMOTED_GRASS_HEIGHT_SCALE = 1\.75/);
  assert.match(geometry, /heightVariation = 0\.68/);
  assert.match(geometry, /widthVariation = 0\.78/);
  assert.match(geometry, /const coverage = grass\.coverage/);
  assert.match(geometry, /bladeCount \+= countSetBits/);
  assert.match(geometry, /word >>> \(local & 31\)/);
  assert.match(geometry, /column \+ 0\.15 \+ random\(\) \* 0\.7/);
  assert.doesNotMatch(geometry, /Math\.sqrt\(random\(\)\) \* spread/);
  assert.match(geometry, /cellSize \?\? 24/);
  assert.match(geometry, /thinInstanceSetBuffer\("matrix"/);
  assert.match(geometry, /thinInstanceSetBuffer\("grassData"/);
  assert.match(geometry, /makeGeometryUnique\(\)/);
  assert.match(geometry, /thinInstanceCount = instanceCount/);
  assert.match(geometry, /thinInstanceRefreshBoundingInfo\(true\)/);
  assert.match(geometry, /windBoundsPadding \?\? 0\.4/);
  assert.match(geometry, /reConstruct\(minimum, maximum\)/);
  assert.match(geometry, /doNotSyncBoundingInfo = true/);
  assert.match(streamer, /GRASS_NEAR_LOAD_RADIUS = 168/);
  assert.match(streamer, /GRASS_NEAR_UNLOAD_RADIUS = 216/);
  assert.match(streamer, /GRASS_LOAD_RADIUS = 288/);
  assert.match(streamer, /GRASS_UNLOAD_RADIUS = 336/);
  assert.match(streamer, /GRASS_NEAR_ENABLE_RADIUS = 140/);
  assert.match(streamer, /GRASS_FAR_ENABLE_RADIUS = 272/);
  assert.match(streamer, /sampleRate: 0\.22/);
  assert.match(streamer, /createGrassCellFromPackage/);
  assert.match(streamer, /this\.lastCellX/);
  assert.match(streamer, /mesh\.dispose\(false, false\)/);
  assert.match(surfaceShader, /textureSample/);
  assert.match(surfaceShader, /vLighting/);
  assert.match(surfaceShader, /uVertexTintStrength/);
  assert.match(surfaceShader, /grassSurfacePlayerLight/);
  assert.match(surfaceShader, /uZoneAmbientColor/);
  assert.match(surfaceShader, /sourceLuma \* 6\.0/);
  assert.match(surfaceShader, /uTerrainBaseColor/);
  assert.match(surfaceShader, /uTerrainHighlightColor/);
  assert.doesNotMatch(surfaceShader, /base \* uniforms\.uColorLift/);
  assert.match(surfaceShader, /ShaderLanguage\.WGSL/);
  assert.match(lighting, /DirectionalLight/);
  assert.match(lighting, /HemisphericLight/);
  assert.match(lighting, /playerLight/);
  assert.match(lighting, /lightDirection\.y > 0\.025 \? 1 : 0\.38/);
  assert.match(lighting, /setFloat\(\s*"uZoneDaylightFactor"/);
  assert.match(lighting, /setVector3\("uZoneLightDirection"/);
});

test("water uses bounded directional waves and analytic normal slopes", async () => {
  const shader = await readSource("src/fx/water-shader.ts");
  assert.match(shader, /ShadersStoreWGSL/);
  assert.match(shader, /ShaderLanguage\.WGSL/);
  assert.equal((shader.match(/let [abc] = wave/g) ?? []).length, 3);
  assert.match(shader, /localNormal/);
  assert.match(shader, /fresnel/);
  assert.match(shader, /waterPlayerLight/);
  assert.match(shader, /uZoneLightColor/);
  assert.match(shader, /uVertexLightingStrength/);
  assert.match(shader, /vVertexLighting/);
  assert.doesNotMatch(
    shader,
    /RenderTargetTexture|ReflectionProbe|ComputeShader/,
  );
});

test("zone geometry consumes shader metadata instead of legacy frame swapping", async () => {
  const [zoneManager, zoneFx] = await Promise.all([
    readSource("src/Game/Zone/zone-manager.ts"),
    readSource("src/fx/zone-geometry-fx.ts"),
  ]);
  assert.match(zoneManager, /ZoneGeometryFx\.attach/);
  assert.match(zoneManager, /playerEntity\?\.getAbsolutePosition\(\)/);
  assert.doesNotMatch(
    zoneManager,
    /swapMaterialTexture|registerAnimatedTextures/,
  );
  assert.match(zoneFx, /eltania\?\.extraShader/);
  assert.match(zoneFx, /createGrassCellsForSurface/);
  assert.match(zoneFx, /if \(world\.grass\)/);
  assert.match(zoneFx, /PromotedGrassCellStreamer/);
  assert.match(zoneFx, /maxDistance: GRASS_NEAR_ENABLE_RADIUS/);
  assert.match(zoneFx, /RequiemGrassMaterial:far/);
  assert.match(zoneFx, /fadeEnd: 250/);
  assert.match(zoneFx, /createGrassSurfaceMaterial/);
  assert.match(zoneFx, /vertexColors === "material-tint"/);
  assert.match(zoneFx, /vertexColors === "baked-irradiance"/);
  assert.match(zoneFx, /bindZoneShaderLighting/);
  assert.match(zoneFx, /surface\.material = waterMaterial/);
});
