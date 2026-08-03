import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractShadoWorldFxRegions } from "../../shader-object/dist/world/index.js";

const clientRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function fixtureWorld(pattern) {
  return {
    regions: {
      id: ["market-light-rays"],
      name: ["Market light rays"],
      kind: ["fx"],
      enabled: [1],
      centerX: [12],
      centerY: [8],
      centerZ: [-24],
      sizeX: [20],
      sizeY: [12],
      sizeZ: [16],
      phaseMask: [0xffffffff],
      tags: [["exterior", "daylight"]],
      metadata: [{ fx: pattern }],
    },
  };
}

test("Shado fx regions preserve cold effect data and expose reducer anchors", () => {
  const pattern = {
    version: 1,
    effect: "light-rays",
    placement: "volume",
    culling: {
      profile: "mid-atmosphere",
      maxDistance: 360,
      fadeDistance: 64,
      updateHz: 10,
    },
    budget: {
      qualityTier: "high",
      maximumInstances: 24,
      maximumDraws: 1,
    },
    parameters: {
      density: 0.18,
      sunFacingOnly: true,
    },
  };
  const [fx] = extractShadoWorldFxRegions(fixtureWorld(pattern));
  assert.equal(fx.id, "market-light-rays");
  assert.equal(fx.pattern.effect, "light-rays");
  assert.deepEqual(fx.center, [12, 8, -24]);
  assert.equal(fx.radius, Math.hypot(20, 12, 16) * 0.5);
  assert.notEqual(fx.pattern.parameters, pattern.parameters);
});

test("invalid authored culling data fails package activation", () => {
  assert.throws(
    () =>
      extractShadoWorldFxRegions(
        fixtureWorld({
          version: 1,
          effect: "grass",
          placement: "surface",
          culling: {
            profile: "near-detail",
            maxDistance: -1,
          },
        }),
      ),
    /maxDistance must be positive/,
  );
});

test("client batches geometry and FX through Shado spatial visibility", async () => {
  const [visibility, zoneFx, grassShader, grassStreamer, worldLayer] =
    await Promise.all([
      readFile(path.join(clientRoot, "src/fx/scene-fx-visibility.ts"), "utf8"),
      readFile(path.join(clientRoot, "src/fx/zone-geometry-fx.ts"), "utf8"),
      readFile(path.join(clientRoot, "src/fx/grass-shader.ts"), "utf8"),
      readFile(path.join(clientRoot, "src/fx/grass-cell-streamer.ts"), "utf8"),
      readFile(
        path.join(clientRoot, "src/Game/Zone/shado-world-scene-layer.ts"),
        "utf8",
      ),
    ]);
  assert.match(visibility, /SCENE_FX_CULL_PROFILES/);
  assert.match(visibility, /coordinator\.reduceWorld/);
  assert.match(visibility, /coordinator\.reduceEntities/);
  assert.match(visibility, /visibility\.flags\[index\]/);
  assert.doesNotMatch(visibility, /new Set\(visibility\.visibleIndices\)/);
  assert.match(visibility, /if \(!mesh\.hasThinInstances\)/);
  assert.match(zoneFx, /already compact primitive\/cell batches/);
  assert.match(zoneFx, /profile: "near-detail"/);
  assert.match(zoneFx, /createGrassCellsForSurface/);
  assert.match(zoneFx, /PromotedGrassCellStreamer/);
  assert.match(zoneFx, /cellSize: 24/);
  assert.match(grassShader, /uFadeStart/);
  assert.match(grassShader, /grassDitherHash/);
  assert.match(grassShader, /distanceToFocus >= uniforms\.uFadeEnd/);
  assert.match(grassStreamer, /GRASS_LOAD_RADIUS/);
  assert.match(grassStreamer, /visibility\.registerMesh/);
  assert.match(worldLayer, /compactGeometry/);
  assert.match(worldLayer, /coordinator\.reduceWorld/);
  assert.match(worldLayer, /ShadoVisibilityBits\.Visible/);
  assert.match(worldLayer, /world\.lighting\?\.mode === "baked"/);
  assert.match(worldLayer, /extras\?\.boundary === true/);
  assert.match(worldLayer, /shadoAlwaysDisabled === true/);
  assert.match(worldLayer, /renderMesh\.setEnabled\(false\)/);
  assert.doesNotMatch(worldLayer, /worldSources\.every/);
});
