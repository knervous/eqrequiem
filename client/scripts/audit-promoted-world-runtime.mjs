#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/loaders/glTF/index.js";
import { validateShadoWorldPackage } from "../../shader-object/dist/world/index.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const baselinePath = path.join(
  repoRoot,
  "client/public/eqrequiem/worlds/legacy-baseline.manifest.json",
);
const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
const worlds = [...baseline.zones, ...baseline.clientScenes].filter(
  (world) => world.status === "ready",
);

assert.equal(baseline.sourceTransform, "mirror-x");
assert.ok(worlds.length > 0, "The promoted runtime world set is empty");

const engine = new NullEngine({
  renderWidth: 64,
  renderHeight: 64,
  textureSize: 64,
});
const failures = [];
let auditedTriangles = 0;
let auditedMeshes = 0;

for (const world of worlds) {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  let container;
  try {
    const [compressed, spatialCompressed] = await Promise.all([
      fs.readFile(path.join(repoRoot, world.runtime.scene.path)),
      fs.readFile(path.join(repoRoot, world.runtime.spatial.path)),
    ]);
    const spatial = JSON.parse(gunzipSync(spatialCompressed).toString("utf8"));
    validateShadoWorldPackage(spatial);
    assert.equal(
      spatial.sourceTransform,
      "mirror-x",
      `${world.shortName}: spatial source transform is not canonical`,
    );
    const bytes = gunzipSync(compressed);
    container = await LoadAssetContainerAsync(
      `data:application/octet-stream;base64,${bytes.toString("base64")}`,
      scene,
      { pluginExtension: ".glb" },
    );
    container.addAllToScene();

    const renderMeshes = container.meshes.filter(
      (mesh) => (mesh.getIndices()?.length ?? 0) > 0,
    );
    assert.equal(
      renderMeshes.length,
      world.stats.primitives,
      `${world.shortName}: source primitive count differs from the baseline`,
    );
    assert.equal(
      spatial.renderChunks.primitive.length,
      world.stats.renderChunks,
      `${world.shortName}: spatial render-batch count differs from the baseline`,
    );
    const indexCount = renderMeshes.reduce(
      (count, mesh) => count + mesh.getIndices().length,
      0,
    );
    assert.equal(
      indexCount,
      world.stats.triangles * 3,
      `${world.shortName}: runtime triangle stream differs from the baseline`,
    );
    for (const mesh of renderMeshes) {
      const determinant = mesh.computeWorldMatrix(true).determinant();
      assert.ok(
        Number.isFinite(determinant) && determinant > 0,
        `${world.shortName}/${mesh.name}: invalid determinant ${determinant}`,
      );
    }
    if (spatial.lighting) {
      for (
        let chunk = 0;
        chunk < spatial.renderChunks.primitive.length;
        chunk++
      ) {
        const first = spatial.renderChunks.firstClusterRef[chunk];
        const count = spatial.renderChunks.clusterRefCount[chunk];
        const cells = new Set(
          spatial.renderChunkClusters
            .slice(first, first + count)
            .map((cluster) => spatial.clusters.cellId[cluster]),
        );
        assert.equal(
          cells.size,
          1,
          `${world.shortName}: render batch ${chunk} crosses spatial cells`,
        );
      }
    }
    if (world.shortName === "qeynos2") {
      assert.deepEqual(
        spatial.lighting,
        { mode: "hybrid", vertexColors: "baked-irradiance" },
        "qeynos2: runtime lighting authority is not metadata-baked irradiance with dynamic sky/player lighting",
      );
      assert.ok(
        renderMeshes.every(
          (mesh) => (mesh.getVerticesData("color")?.length ?? 0) > 0,
        ),
        "qeynos2: baked geometry irradiance stream is incomplete",
      );
      for (const channel of [
        spatial.objects?.stamps.irradianceR,
        spatial.objects?.stamps.irradianceG,
        spatial.objects?.stamps.irradianceB,
        spatial.objects?.stamps.irradianceA,
      ]) {
        assert.equal(
          channel?.length,
          spatial.objects.stamps.id.length,
          "qeynos2: baked object irradiance channel is incomplete",
        );
      }
      assert.equal(
        spatial.tiles.size,
        32,
        "qeynos2: render-cell size differs from the postprocess policy",
      );
      assert.equal(
        spatial.grass?.version,
        1,
        "qeynos2: promoted grass package is missing",
      );
      assert.equal(
        spatial.grass.cellSize,
        24,
        "qeynos2: grass cell size differs from the proximity policy",
      );
      assert.equal(
        spatial.grass.placements.positionX.length,
        world.stats.grassPlacements,
        "qeynos2: grass placement count differs from the baseline",
      );
      assert.equal(
        spatial.grass.cells.x.length,
        world.stats.grassCells,
        "qeynos2: grass cell count differs from the baseline",
      );
    }
    const runtimeBounds = boundsOfMeshes(renderMeshes);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(
        Math.abs(runtimeBounds.min[axis] - spatial.bounds.min[axis]) < 1e-4 &&
          Math.abs(runtimeBounds.max[axis] - spatial.bounds.max[axis]) < 1e-4,
        `${world.shortName}: runtime scene and spatial bounds differ on axis ${axis}`,
      );
    }
    auditedTriangles += indexCount / 3;
    auditedMeshes += renderMeshes.length;
  } catch (error) {
    failures.push(`${world.shortName}: ${error.message}`);
  } finally {
    container?.dispose();
    scene.dispose();
  }
}
engine.dispose();

assert.deepEqual(
  failures,
  [],
  `Promoted runtime audit failed:\n${failures.join("\n")}`,
);
console.log(
  `Audited ${worlds.length} promoted worlds in Babylon right-handed runtime: ` +
    `${auditedMeshes} meshes, ${auditedTriangles} triangles, canonical bounds aligned, ` +
    `all determinants +1.`,
);

function boundsOfMeshes(meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    const positions = mesh.getVerticesData("position");
    const matrix = mesh.computeWorldMatrix(true).m;
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index];
      const y = positions[index + 1];
      const z = positions[index + 2];
      const world = [
        x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12],
        x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13],
        x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14],
      ];
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], world[axis]);
        max[axis] = Math.max(max[axis], world[axis]);
      }
    }
  }
  return { min, max };
}
