#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/loaders/glTF/index.js";
import {
  decodeShadoWorldCollision,
  ShadoCollisionFlags,
  ShadoWorldReducer,
  validateShadoWorldPackage,
} from "../../shader-object/dist/world/index.js";

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
    const [compressed, spatialCompressed, collisionCompressed] = await Promise.all([
      fs.readFile(path.join(repoRoot, world.runtime.scene.path)),
      fs.readFile(path.join(repoRoot, world.runtime.spatial.path)),
      fs.readFile(path.join(repoRoot, world.runtime.collision.path)),
    ]);
    const spatial = JSON.parse(gunzipSync(spatialCompressed).toString("utf8"));
    validateShadoWorldPackage(spatial);
    const collision = decodeShadoWorldCollision(
      gunzipSync(collisionCompressed),
      spatial.collision,
    );
    auditChunkedCollision(world, spatial, collision);
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
      const visibility = spatial.visibility;
      assert.equal(
        visibility?.version,
        1,
        "qeynos2: continuous visibility topology is missing",
      );
      assert.equal(
        visibility.mode,
        "distance-flood",
        "qeynos2: heightless blocker PVS is still active",
      );
      assert.equal(
        visibility.occluderCount,
        0,
        "qeynos2: distance-flood mode must fail open for unauthored occluders",
      );
      assert.equal(
        visibility.size,
        64,
        "qeynos2: visibility-region size differs from the first-pass policy",
      );
      assert.equal(
        visibility.maxDistance,
        1280,
        "qeynos2: ordinary-region PVS envelope differs from policy",
      );
      assert.equal(
        spatial.pvs,
        undefined,
        "qeynos2: legacy all-visible render-cell PVS is still packaged",
      );
      auditLocalVisibilityFlood(visibility, 3);
      assert.ok(
        nearestRejectedRenderCellDistance(spatial, 168, -240) >= 1200,
        "qeynos2: temple background is rejected inside the outdoor PVS envelope",
      );
      const visibilityRegionCount = visibility.width * visibility.height;
      const regionPairRatio =
        visibility.visibleRegionPairs /
        (visibilityRegionCount * visibilityRegionCount);
      assert.ok(
        regionPairRatio <= 0.45,
        `qeynos2: regional PVS retains ${(regionPairRatio * 100).toFixed(1)}% of pairs`,
      );
      const persistentCells = new Set(visibility.persistentCells);
      const geometryCandidateCounts = Array.from(
        { length: visibilityRegionCount },
        (_, cameraRegion) =>
          visibility.cellRegion.reduce(
            (count, targetRegion, cell) =>
              count +
              Number(
                persistentCells.has(cell) ||
                  visibilityRegionVisible(
                    visibility,
                    cameraRegion,
                    targetRegion,
                  ),
              ),
            0,
          ),
      ).sort((a, b) => a - b);
      const medianGeometryCandidateRatio =
        geometryCandidateCounts[Math.floor(visibilityRegionCount / 2)] /
        spatial.cells.kind.length;
      assert.ok(
        medianGeometryCandidateRatio <= 0.70,
        `qeynos2: median PVS retains ${(medianGeometryCandidateRatio * 100).toFixed(1)}% of render cells`,
      );
      await auditQeynos2WasmVisibility(spatial);
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

function auditChunkedCollision(world, spatial, collision) {
  assert.equal(spatial.collision.format, "shado-collision-v2");
  assert.equal(collision.chunkSize, 256, `${world.shortName}: physics chunk size changed`);
  assert.equal(collision.chunks.length, spatial.collision.chunkCount);
  assert.equal(collision.sourceTriangleCount, spatial.collision.sourceTriangleCount);
  assert.equal(collision.vertexCount, spatial.collision.vertexCount);
  assert.equal(collision.triangleCount, spatial.collision.triangleCount);
  assert.equal(world.stats.collisionChunks, collision.chunks.length);
  assert.equal(world.stats.collisionSourceTriangles, collision.sourceTriangleCount);
  assert.equal(world.stats.collisionTriangles, collision.triangleCount);
  assert.ok(
    collision.triangleCount >= collision.sourceTriangleCount,
    `${world.shortName}: boundary duplication lost source collision triangles`,
  );
  const keys = new Set();
  for (const chunk of collision.chunks) {
    const key = `${chunk.x},${chunk.z}`;
    assert.ok(!keys.has(key), `${world.shortName}: duplicate physics chunk ${key}`);
    keys.add(key);
    assert.ok(
      chunk.flags & ShadoCollisionFlags.PlayerSolid,
      `${world.shortName}: physics chunk ${key} does not block the player`,
    );
    const minX = chunk.x * collision.chunkSize;
    const maxX = minX + collision.chunkSize;
    const minZ = chunk.z * collision.chunkSize;
    const maxZ = minZ + collision.chunkSize;
    assert.ok(
      chunk.bounds.max[0] >= minX &&
        chunk.bounds.min[0] <= maxX &&
        chunk.bounds.max[2] >= minZ &&
        chunk.bounds.min[2] <= maxZ,
      `${world.shortName}: physics chunk ${key} has no geometry intersecting its XZ region`,
    );
  }
}

function visibilityRegionVisible(visibility, from, to) {
  const word =
    visibility.pvs.words[from * visibility.pvs.wordsPerRow + (to >>> 5)] >>> 0;
  return (word & (1 << (to & 31))) !== 0;
}

function nearestRejectedRenderCellDistance(spatial, cameraX, cameraZ) {
  const visibility = spatial.visibility;
  const cameraXIndex = Math.floor(
    (cameraX - visibility.originX) / visibility.size,
  );
  const cameraZIndex = Math.floor(
    (cameraZ - visibility.originZ) / visibility.size,
  );
  const cameraRegion = cameraZIndex * visibility.width + cameraXIndex;
  let nearest = Infinity;
  spatial.tiles.x.forEach((tileX, cell) => {
    if (
      visibilityRegionVisible(
        visibility,
        cameraRegion,
        visibility.cellRegion[cell],
      )
    ) return;
    const centerX = spatial.tiles.originX + (tileX + 0.5) * spatial.tiles.size;
    const centerZ =
      spatial.tiles.originZ +
      (spatial.tiles.z[cell] + 0.5) * spatial.tiles.size;
    nearest = Math.min(
      nearest,
      Math.hypot(centerX - cameraX, centerZ - cameraZ),
    );
  });
  return nearest;
}

function auditLocalVisibilityFlood(visibility, radius) {
  for (let from = 0; from < visibility.width * visibility.height; from++) {
    const fromX = from % visibility.width;
    const fromZ = Math.floor(from / visibility.width);
    for (let deltaZ = -radius; deltaZ <= radius; deltaZ++) {
      const toZ = fromZ + deltaZ;
      if (toZ < 0 || toZ >= visibility.height) continue;
      for (let deltaX = -radius; deltaX <= radius; deltaX++) {
        const toX = fromX + deltaX;
        if (toX < 0 || toX >= visibility.width) continue;
        const to = toZ * visibility.width + toX;
        assert.ok(
          visibilityRegionVisible(visibility, from, to),
          `qeynos2: local PVS flood misses ${from} -> ${to}`,
        );
      }
    }
  }
}

async function auditQeynos2WasmVisibility(spatial) {
  const reducer = await ShadoWorldReducer.create(spatial);
  const visibility = spatial.visibility;
  const regionCount = visibility.width * visibility.height;
  const persistentCells = new Set(visibility.persistentCells);
  const planes = boundsFrustumPlanes({
    min: [
      Math.min(spatial.bounds.min[0], visibility.originX),
      spatial.bounds.min[1],
      Math.min(spatial.bounds.min[2], visibility.originZ),
    ],
    max: [
      Math.max(
        spatial.bounds.max[0],
        visibility.originX + visibility.width * visibility.size,
      ),
      spatial.bounds.max[1],
      Math.max(
        spatial.bounds.max[2],
        visibility.originZ + visibility.height * visibility.size,
      ),
    ],
  });
  const sampledCameraRegions = [
    0,
    Math.floor(regionCount / 2),
    regionCount - 1,
  ];
  let residentPointers;

  for (const cameraRegion of sampledCameraRegions) {
    const reduced = reducer.reduceWorld({
      planes,
      cameraCell: -1,
      cameraRegion,
    });
    const expectedClusters = spatial.clusters.cellId
      .map((cell, cluster) => ({ cell, cluster }))
      .filter(
        ({ cell }) =>
          persistentCells.has(cell) ||
          visibilityRegionVisible(
            visibility,
            cameraRegion,
            visibility.cellRegion[cell],
          ),
      )
      .map(({ cluster }) => cluster)
      .sort((a, b) => a - b);
    assert.deepEqual(
      Array.from(reduced.visibleClusters).sort((a, b) => a - b),
      expectedClusters,
      `qeynos2: WASM cluster PVS differs for camera region ${cameraRegion}`,
    );
    const expectedPackets = [
      ...new Set(
        expectedClusters.map(
          (cluster) => spatial.clusters.materialPacket[cluster],
        ),
      ),
    ].sort((a, b) => a - b);
    assert.deepEqual(
      Array.from(reduced.visiblePackets).sort((a, b) => a - b),
      expectedPackets,
      `qeynos2: WASM packet PVS differs for camera region ${cameraRegion}`,
    );
    const pointers = [
      reduced.visibleClustersSlice.ptr,
      reduced.visiblePacketsSlice.ptr,
      reduced.clusterFlagsSlice.ptr,
      reduced.cellFlagsSlice.ptr,
      reduced.regionFlagsSlice.ptr,
      reduced.packetFlagsSlice.ptr,
    ];
    if (residentPointers) {
      assert.deepEqual(
        pointers,
        residentPointers,
        "qeynos2: WASM visibility output pointers are not persistent",
      );
    } else {
      residentPointers = pointers;
    }
  }

  const cameraRegion = Math.floor(regionCount / 2);
  const reduced = reducer.reduceWorld({
    planes,
    cameraCell: -1,
    cameraRegion,
  });
  const regionEntities = reducer.reduceEntities({
    count: regionCount,
    positionX: Array.from(
      { length: regionCount },
      (_, region) =>
        visibility.originX +
        ((region % visibility.width) + 0.5) * visibility.size,
    ),
    positionY: new Float32Array(regionCount).fill(
      (spatial.bounds.min[1] + spatial.bounds.max[1]) * 0.5,
    ),
    positionZ: Array.from(
      { length: regionCount },
      (_, region) =>
        visibility.originZ +
        (Math.floor(region / visibility.width) + 0.5) * visibility.size,
    ),
    radius: new Float32Array(regionCount),
    planesPtr: reduced.planesPtr,
    cellFlagsPtr: reduced.regionFlagsSlice.ptr,
    camera: [0, 0, 0],
    outsideWorldVisible: false,
  });
  const expectedRegions = Array.from(
    { length: regionCount },
    (_, region) => region,
  ).filter((region) =>
    visibilityRegionVisible(visibility, cameraRegion, region),
  );
  assert.deepEqual(
    Array.from(regionEntities.visibleIndices),
    expectedRegions,
    "qeynos2: WASM entity-region PVS differs from the packaged bitset",
  );

  const stamps = spatial.objects?.stamps;
  if (stamps?.id.length) {
    const objects = reducer.reduceEntities({
      count: stamps.id.length,
      positionX: stamps.positionX,
      positionY: stamps.positionY,
      positionZ: stamps.positionZ,
      radius: stamps.radius,
      planesPtr: reduced.planesPtr,
      cellFlagsPtr: reduced.regionFlagsSlice.ptr,
      camera: [0, 0, 0],
      outsideWorldVisible: false,
    });
    const expectedObjects = stamps.id
      .map((_, object) => object)
      .filter((object) => {
        const regionX = Math.floor(
          (stamps.positionX[object] - visibility.originX) / visibility.size,
        );
        const regionZ = Math.floor(
          (stamps.positionZ[object] - visibility.originZ) / visibility.size,
        );
        if (
          regionX < 0 ||
          regionX >= visibility.width ||
          regionZ < 0 ||
          regionZ >= visibility.height
        ) {
          return false;
        }
        return visibilityRegionVisible(
          visibility,
          cameraRegion,
          regionZ * visibility.width + regionX,
        );
      });
    assert.deepEqual(
      Array.from(objects.visibleIndices),
      expectedObjects,
      "qeynos2: WASM object-region PVS differs from exact stamp placement",
    );
  }
}

function boundsFrustumPlanes(bounds) {
  const margin = 1;
  return new Float32Array([
    1,
    0,
    0,
    -bounds.min[0] + margin,
    -1,
    0,
    0,
    bounds.max[0] + margin,
    0,
    1,
    0,
    -bounds.min[1] + margin,
    0,
    -1,
    0,
    bounds.max[1] + margin,
    0,
    0,
    1,
    -bounds.min[2] + margin,
    0,
    0,
    -1,
    bounds.max[2] + margin,
  ]);
}
