import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

test("grass uses native WGSL vertex wind and a single static patch", async () => {
  const [shader, geometry] = await Promise.all([
    readSource("src/fx/grass-shader.ts"),
    readSource("src/fx/grass-geometry.ts"),
  ]);
  assert.match(shader, /ShadersStoreWGSL/);
  assert.match(shader, /ShaderLanguage\.WGSL/);
  assert.match(shader, /tipWeight/);
  assert.match(shader, /uWindStrength/);
  assert.match(geometry, /new BABYLON\.Mesh/);
  assert.doesNotMatch(geometry, /createInstance|thinInstance/);
});

test("water uses bounded directional waves and analytic normal slopes", async () => {
  const shader = await readSource("src/fx/water-shader.ts");
  assert.match(shader, /ShadersStoreWGSL/);
  assert.match(shader, /ShaderLanguage\.WGSL/);
  assert.equal((shader.match(/let [abc] = wave/g) ?? []).length, 3);
  assert.match(shader, /localNormal/);
  assert.match(shader, /fresnel/);
  assert.doesNotMatch(shader, /RenderTargetTexture|ReflectionProbe|ComputeShader/);
});

test("zone geometry consumes shader metadata instead of legacy frame swapping", async () => {
  const [zoneManager, zoneFx] = await Promise.all([
    readSource("src/Game/Zone/zone-manager.ts"),
    readSource("src/fx/zone-geometry-fx.ts"),
  ]);
  assert.match(zoneManager, /ZoneGeometryFx\.attach/);
  assert.doesNotMatch(zoneManager, /swapMaterialTexture|registerAnimatedTextures/);
  assert.match(zoneFx, /eltania\?\.extraShader/);
  assert.match(zoneFx, /createGrassForSurface/);
  assert.match(zoneFx, /surface\.material = waterMaterial/);
});
