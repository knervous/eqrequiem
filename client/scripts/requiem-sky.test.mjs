import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  advanceSkyHour,
  DEFAULT_SKY_MOTION_SETTINGS,
  normalizeSkyMotionSettings,
} from "../src/Game/Sky/sky-motion.ts";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(clientRoot, "..");
const manifestPath = path.join(
  clientRoot,
  "public/eqrequiem/sky/requiem-sky.json",
);
const reportPath = path.join(
  repoRoot,
  "assets/generated/world/sky/requiem-sky.build.json",
);
const supportedZonesPath = path.join(
  clientRoot,
  "src/Game/Constants/supportedZones.ts",
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const supportedZonesSource = await readFile(supportedZonesPath, "utf8");
const skyManagerSource = await readFile(
  path.join(clientRoot, "src/Game/Sky/sky-manager.ts"),
  "utf8",
);
const zoneManagerSource = await readFile(
  path.join(clientRoot, "src/Game/Zone/zone-manager.ts"),
  "utf8",
);
const skyMaterialSource = await readFile(
  path.join(clientRoot, "src/Game/Sky/sky-material.ts"),
  "utf8",
);
const devSkySource = await readFile(
  path.join(clientRoot, "src/UI/components/game/dev/dev-sky.tsx"),
  "utf8",
);

const supportedZoneNames = new Set(
  [...supportedZonesSource.matchAll(
    /(?:["']shortName["']|shortName)\s*:\s*["']([^"']+)["']/g,
  )].map((match) => match[1]),
);

const requiredBiomes = [
  "temperate",
  "forest",
  "desert",
  "swamp",
  "tundra",
  "volcanic",
  "coastal",
  "planar",
];

test("sky manifest has the production semantic and biome contract", () => {
  assert.equal(manifest.version, 2);
  assert.equal(manifest.defaultBiome, "temperate");
  assert.ok(manifest.biomeTransitionMs >= 250);
  assert.ok(manifest.biomeTransitionMs <= 2000);
  assert.deepEqual(Object.keys(manifest.biomes), requiredBiomes);

  const layerNames = Object.values(manifest.layers);
  assert.equal(new Set(layerNames).size, layerNames.length);
  assert.equal(manifest.environment.visibleSkyContributesDiffuse, false);
});

test("low and high clouds have independent production controls", () => {
  const low = manifest.clouds.low;
  const high = manifest.clouds.high;
  const crossProduct = low.rate[0] * high.rate[1] - low.rate[1] * high.rate[0];

  assert.notEqual(crossProduct, 0);
  assert.ok(low.warp > high.warp, "low cumulus should carry stronger domain warp");
  assert.ok(high.stretch > low.stretch, "high cirrus should be more stretched");

  for (const cloud of [low, high]) {
    assert.ok(cloud.scale > 0);
    assert.ok(cloud.coverage > 0 && cloud.coverage < 1);
    assert.ok(cloud.softness > 0);
    assert.ok(cloud.detail >= 0 && cloud.detail <= 1);
    assert.ok(cloud.lightStrength >= 0);
  }
});

test("sky motion defaults are gentle, continuous, and independently bounded", () => {
  assert.ok(DEFAULT_SKY_MOTION_SETTINGS.dayLengthSeconds >= 3600);
  assert.ok(DEFAULT_SKY_MOTION_SETTINGS.cloudLowRate < 1);
  assert.ok(DEFAULT_SKY_MOTION_SETTINGS.cloudHighRate < 1);

  const oneFrame = advanceSkyHour(
    12,
    1000 / 60,
    DEFAULT_SKY_MOTION_SETTINGS,
  );
  const oneSecond = advanceSkyHour(
    12,
    1000,
    DEFAULT_SKY_MOTION_SETTINGS,
  );
  assert.ok(oneFrame > 12);
  assert.ok(oneFrame < oneSecond);

  const bounded = normalizeSkyMotionSettings(
    { ...DEFAULT_SKY_MOTION_SETTINGS },
    {
      celestialRate: 999,
      cloudLowRate: -999,
      starTwinkleRate: -1,
    },
  );
  assert.equal(bounded.celestialRate, 8);
  assert.equal(bounded.cloudLowRate, -4);
  assert.equal(bounded.starTwinkleRate, 0);
});

test("runtime uses frame-continuous celestial, cloud, and star motion controls", () => {
  assert.ok(skyManagerSource.includes("advanceSkyHour("));
  assert.ok(!skyManagerSource.includes("worldTick():"));
  assert.ok(!zoneManagerSource.includes("worldTickElapsedMs"));
  assert.ok(skyMaterialSource.includes("uStarRotationRadians"));
  for (const setting of [
    "dayLengthSeconds",
    "celestialRate",
    "cloudLowRate",
    "cloudHighRate",
    "starDriftRate",
    "starTwinkleRate",
  ]) {
    assert.ok(devSkySource.includes(setting), `missing HUD control '${setting}'`);
  }
});

test("biome controls are bounded and every mapped zone and preset exists", () => {
  for (const [name, biome] of Object.entries(manifest.biomes)) {
    assert.equal(biome.skyTint.length, 3, `${name}.skyTint`);
    assert.equal(biome.horizonTint.length, 3, `${name}.horizonTint`);
    assert.equal(biome.cloudTint.length, 3, `${name}.cloudTint`);
    assert.equal(biome.sunTint.length, 3, `${name}.sunTint`);
    assert.equal(biome.fogTint.length, 3, `${name}.fogTint`);
    assert.ok(biome.saturation > 0 && biome.saturation <= 2, name);
    assert.ok(biome.exposure > 0 && biome.exposure <= 2, name);
    assert.ok(biome.haze >= 0 && biome.haze <= 1, name);
    assert.ok(biome.fogStartMultiplier > 0, name);
    assert.ok(biome.fogEndMultiplier > 0, name);

    for (const cloud of Object.values(biome.clouds)) {
      assert.ok(cloud.coverageOffset >= -0.5 && cloud.coverageOffset <= 0.5);
      assert.ok(cloud.opacityMultiplier > 0 && cloud.opacityMultiplier <= 2);
      assert.ok(cloud.speedMultiplier > 0 && cloud.speedMultiplier <= 3);
      assert.ok(cloud.scaleMultiplier > 0 && cloud.scaleMultiplier <= 2);
    }
  }

  for (const [zoneName, biomeName] of Object.entries(manifest.zoneBiomes)) {
    assert.ok(supportedZoneNames.has(zoneName), `unknown zone '${zoneName}'`);
    assert.ok(manifest.biomes[biomeName], `unknown biome '${biomeName}'`);
  }
});

test("Blender build report and compressed runtime geometry match manifest v2", async () => {
  assert.equal(report.assetVersion, manifest.version);
  assert.deepEqual(report.biomes, requiredBiomes);
  assert.equal(report.geometryContract.reflectionLighting, "separate");

  const expectedReviewCount = manifest.keyframes.length + requiredBiomes.length;
  assert.equal(report.reviews.length, expectedReviewCount);
  await Promise.all(
    report.reviews.map((reviewPath) =>
      readFile(path.join(repoRoot, reviewPath)),
    ),
  );

  const gzipBytes = await readFile(
    path.join(clientRoot, "public/eqrequiem/sky/requiem-sky.glb.gz"),
  );
  assert.equal(gzipBytes[0], 0x1f);
  assert.equal(gzipBytes[1], 0x8b);

  const glbBytes = gunzipSync(gzipBytes);
  assert.equal(glbBytes.toString("ascii", 0, 4), "glTF");
  const jsonChunkLength = glbBytes.readUInt32LE(12);
  assert.equal(glbBytes.readUInt32LE(16), 0x4e4f534a);
  const gltf = JSON.parse(
    glbBytes.toString("utf8", 20, 20 + jsonChunkLength).trimEnd(),
  );
  const exportedNodeNames = new Set(gltf.nodes.map((node) => node.name));
  for (const semanticName of Object.values(manifest.layers)) {
    assert.ok(
      exportedNodeNames.has(semanticName),
      `missing exported semantic node '${semanticName}'`,
    );
  }
});
