import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const clientRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("zone metadata is offline lighting authority, not runtime PointLights", async () => {
  const [
    zoneManager,
    baker,
    objectLayer,
    objectCache,
    entityMaterial,
    entityPool,
  ] = await Promise.all([
    readFile(path.join(clientRoot, "src/Game/Zone/zone-manager.ts"), "utf8"),
    readFile(
      path.join(clientRoot, "scripts/lighting/bake-zone-lighting.mjs"),
      "utf8",
    ),
    readFile(
      path.join(clientRoot, "src/Game/Zone/shado-world-object-layer.ts"),
      "utf8",
    ),
    readFile(path.join(clientRoot, "src/Game/Model/object-cache.ts"), "utf8"),
    readFile(
      path.join(clientRoot, "src/Game/Model/entity-material.ts"),
      "utf8",
    ),
    readFile(
      path.join(clientRoot, "src/Game/Model/shado-entity-pool.ts"),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(
    zoneManager,
    /LightManager|loadLights|updateLights|LightContainer/,
  );
  assert.doesNotMatch(zoneManager, /metadata\.lights/);
  assert.match(zoneManager, /skyManager\.createSky/);
  assert.match(baker, /assets\/reference\/everquest_rof2\/zones/);
  assert.match(baker, /mode: "hybrid", vertexColors: "baked-irradiance"/);
  assert.match(objectLayer, /batch\.colors/);
  assert.match(objectCache, /thinInstanceSetBuffer\("color", colorData, 4/);
  assert.match(entityMaterial, /actor\.padding1 > 0\.5/);
  assert.match(entityMaterial, /finalWorld \* vec4\(normal, 0\.0\)/);
  assert.match(entityMaterial, /uShadoPlayerLightPosition/);
  assert.match(entityMaterial, /bindActorLighting\(scene, effect\)/);
  assert.match(entityPool, /actor\.lightingMode = ShadoLightingMode\.Lambert/);
  await assert.rejects(
    access(path.join(clientRoot, "src/Game/Lights/light-manager.ts")),
  );
});

test("authored promotion honors validated hybrid metadata-light authority", async () => {
  const [promoter, spatialBytes] = await Promise.all([
    readFile(
      path.join(clientRoot, "scripts/promote-authored-zone.mjs"),
      "utf8",
    ),
    readFile(
      path.join(clientRoot, "public/eqrequiem/worlds/qeynos2.spatial.json.gz"),
    ),
  ]);
  assert.match(promoter, /bake-zone-lighting\.mjs/);
  assert.match(promoter, /"--promote"/);
  assert.match(promoter, /validation\.report\.runtimeLighting/);
  assert.match(promoter, /shouldBakeLighting/);
  assert.match(promoter, /reuseLightingField/);
  assert.match(promoter, /"--reuse-field"/);

  const spatial = JSON.parse(gunzipSync(spatialBytes).toString("utf8"));
  assert.deepEqual(spatial.lighting, {
    mode: "hybrid",
    vertexColors: "baked-irradiance",
  });
  for (const channel of [
    "irradianceR",
    "irradianceG",
    "irradianceB",
    "irradianceA",
  ]) {
    assert.equal(
      spatial.objects.stamps[channel].length,
      spatial.objects.stamps.id.length,
    );
  }
});
