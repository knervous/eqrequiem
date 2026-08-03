#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const publicWorldRoot = path.join(
  repoRoot,
  "client/public/eqrequiem/worlds",
);
const sandboxWorldRoot = path.join(
  repoRoot,
  "shader-object/sandbox/public/shado/worlds",
);
const baselineFile = path.join(
  publicWorldRoot,
  "legacy-baseline.manifest.json",
);
const packerFile = path.join(
  repoRoot,
  "shader-object/dist/preprocess/index.js",
);
const worldFile = path.join(repoRoot, "shader-object/dist/world/index.js");
const runtimeWorldPrefix = "/eqrequiem/worlds";

const cliArgs = process.argv.slice(2);
const zone = (
  cliArgs.find((argument) => !argument.startsWith("--")) ?? "qeynos2"
).toLowerCase();
const bakeLighting = !cliArgs.includes("--skip-lighting-bake");
const reuseLightingField = cliArgs.includes("--reuse-lighting-field");
if (!/^[a-z0-9_]+$/.test(zone)) {
  throw new Error(`Invalid zone short name '${zone}'`);
}
if (!bakeLighting && reuseLightingField) {
  throw new Error(
    "--reuse-lighting-field cannot be combined with --skip-lighting-bake",
  );
}

const previewFile = path.join(
  publicWorldRoot,
  `${zone}.authoring-preview.glb`,
);
const authoringFile = path.join(
  sandboxWorldRoot,
  `${zone}.authoring.json`,
);
const validationRoot = path.join(
  repoRoot,
  "assets/src/world/zones",
  zone,
);

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function relativeFile(file) {
  const relative = path.relative(repoRoot, file);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Runtime artifact is outside the repository: ${file}`);
  }
  return relative.split(path.sep).join("/");
}

function descriptor(file, bytes) {
  return {
    path: relativeFile(file),
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
  };
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
          ),
        );
      }
    });
  });
}

function parseGlb(bytes, label) {
  ensure(
    bytes.byteLength >= 20 &&
      bytes.toString("ascii", 0, 4) === "glTF" &&
      bytes.readUInt32LE(4) === 2 &&
      bytes.readUInt32LE(8) === bytes.byteLength,
    `${label} is not a valid GLB`,
  );
  const chunks = [];
  let offset = 12;
  while (offset < bytes.byteLength) {
    ensure(offset + 8 <= bytes.byteLength, `${label} has a truncated chunk`);
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    ensure(end <= bytes.byteLength, `${label} has a truncated chunk payload`);
    chunks.push({ type, bytes: Buffer.from(bytes.subarray(offset + 8, end)) });
    offset = end;
  }
  const json = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  ensure(json, `${label} has no JSON chunk`);
  return {
    document: JSON.parse(json.bytes.toString("utf8").trimEnd()),
    chunks,
  };
}

function rebuildGlb(document, sourceChunks) {
  const json = Buffer.from(JSON.stringify(document));
  const paddedJsonLength = (json.byteLength + 3) & ~3;
  const jsonPayload = Buffer.alloc(paddedJsonLength, 0x20);
  json.copy(jsonPayload);
  const chunks = sourceChunks.map((chunk) =>
    chunk.type === 0x4e4f534a ? { ...chunk, bytes: jsonPayload } : chunk,
  );
  const totalLength =
    12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.bytes.byteLength, 0);
  const output = Buffer.alloc(totalLength);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.bytes.byteLength, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.bytes.copy(output, offset + 8);
    offset += 8 + chunk.bytes.byteLength;
  }
  return output;
}

function stampRuntimeContract(source) {
  const parsed = parseGlb(source, `${zone} authoring preview`);
  ensure(parsed.document.scenes?.length, `${zone} preview has no scene`);
  ensure(parsed.document.meshes?.length, `${zone} preview has no meshes`);
  parsed.document.asset.extras = {
    ...parsed.document.asset.extras,
    requiemRuntimeContract: "babylon-rhs-y-up-v4",
    runtimeHandedness: "right",
    exporterReflectionRemoved: true,
    canonicalZoneMirrorXApplied: true,
    authoredZonePromotion: true,
  };
  return rebuildGlb(parsed.document, parsed.chunks);
}

async function latestPassingValidation() {
  const entries = await fs.readdir(validationRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".validation.json")) continue;
    const file = path.join(validationRoot, entry.name);
    const stat = await fs.stat(file);
    candidates.push({ file, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  ensure(candidates.length, `${zone} has no authoring validation report`);
  const selected = candidates[0].file;
  const report = JSON.parse(await fs.readFile(selected, "utf8"));
  ensure(report.zone === zone, `${relativeFile(selected)} targets another zone`);
  ensure(
    report.status === "pass" && (report.failures?.length ?? 0) === 0,
    `${relativeFile(selected)} is not passing`,
  );
  ensure(
    (report.checks?.length ?? 0) > 0 &&
      report.checks.every((check) => check.passed === true),
    `${relativeFile(selected)} contains a failed authoring check`,
  );
  return { file: selected, report };
}

async function atomicPublish(bytes, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const next = `${target}.next-${process.pid}`;
  await fs.writeFile(next, bytes);
  await fs.rename(next, target);
}

function packStats(result) {
  return {
    primitives: result.primitiveCount,
    triangles: result.triangleCount,
    clusters: result.clusterCount,
    renderChunks: result.renderChunkCount,
    cells: result.cellCount,
    portals: result.portalCount,
    regions: result.regionCount,
    objectPrototypes: result.objectPrototypeCount,
    objectStamps: result.objectStampCount,
    grassCells: result.grassCellCount,
    grassPlacements: result.grassPlacementCount,
    tiles: result.tileCount,
    collisionVertices: result.collisionVertexCount,
    collisionTriangles: result.collisionTriangleCount,
    collisionSourceTriangles: result.collisionSourceTriangleCount,
    collisionChunks: result.collisionChunkCount,
    lightingStatus: result.lightingStatus,
    lightingUv2ReadyChunks: result.lightingUv2ReadyChunkCount,
  };
}

const validation = await latestPassingValidation();
const validatedRuntimeLighting = validation.report.runtimeLighting ?? null;
if (validatedRuntimeLighting) {
  ensure(
    ["dynamic", "hybrid", "baked"].includes(validatedRuntimeLighting.mode) &&
      ["material-tint", "baked-irradiance"].includes(
        validatedRuntimeLighting.vertexColors,
      ) &&
      !(
        validatedRuntimeLighting.mode === "baked" &&
        validatedRuntimeLighting.vertexColors !== "baked-irradiance"
      ),
    `${relativeFile(validation.file)} has invalid runtimeLighting authority`,
  );
}
const runtimeLighting = !bakeLighting
  ? { mode: "dynamic", vertexColors: "material-tint" }
  : (validatedRuntimeLighting ?? {
      mode: "hybrid",
      vertexColors: "baked-irradiance",
    });
const shouldBakeLighting =
  bakeLighting && runtimeLighting.vertexColors === "baked-irradiance";
const [preview, authoring, baseline, { packShadoWorld }, worldModule] =
  await Promise.all([
    fs.readFile(previewFile),
    fs.readFile(authoringFile),
    fs.readFile(baselineFile, "utf8").then(JSON.parse),
    import(pathToFileURL(packerFile).href),
    import(pathToFileURL(worldFile).href),
  ]);

ensure(
  baseline.kind === "requiem.legacy-zone-baseline" && baseline.version === 4,
  "Unsupported Requiem world baseline manifest",
);
const worldEntry = [...baseline.zones, ...baseline.clientScenes].find(
  (entry) => entry.shortName === zone,
);
ensure(worldEntry?.status === "ready", `${zone} is not a ready Requiem world`);

const runtimeScene = stampRuntimeContract(preview);
const compressedRuntimeScene = gzipSync(runtimeScene, { level: 9 });
const stagingRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), `requiem-${zone}-authoring-promotion-`),
);

try {
  const packingInput = path.join(stagingRoot, `${zone}.packing-source.glb`);
  const stagedAuthoring = path.join(stagingRoot, `${zone}.authoring.json`);
  const stagedScene = path.join(stagingRoot, `${zone}.glb.gz`);
  const stagedSpatial = path.join(stagingRoot, `${zone}.spatial.json.gz`);
  const stagedCollision = path.join(stagingRoot, `${zone}.collision.bin.gz`);
  const stagedLighting = path.join(stagingRoot, `${zone}.lighting-plan.json.gz`);
  await Promise.all([
    fs.writeFile(packingInput, runtimeScene),
    fs.writeFile(stagedAuthoring, authoring),
    fs.writeFile(stagedScene, compressedRuntimeScene),
  ]);

  const result = await packShadoWorld({
    name: zone,
    input: packingInput,
    outFile: stagedSpatial,
    collisionOutFile: stagedCollision,
    lightingPlanOutFile: stagedLighting,
    runtimeSource: `${runtimeWorldPrefix}/${zone}.glb.gz`,
    authoringInput: stagedAuthoring,
    // Blender exports from this pipeline are already in canonical game space.
    // Import with the same handedness as the runtime and preserve mirror-x as
    // migration-origin metadata without reflecting the geometry again.
    inputHandedness: "right",
    inputTransform: "identity",
    sourceTransform: "mirror-x",
    runtimeLighting,
    // Spatially bounded render cells. Streaming residency remains a separate
    // payload concern rather than overloading this render-culling grid.
    tileSize: 32,
    // Finer continuous regions make room/wall occlusion useful while render
    // chunks remain independently material/primitive bounded.
    visibilityRegionSize: 64,
    visibilityMaxDistance: 1280,
    maxClusterTriangles: 128,
    grass: {
      cellSize: 24,
      density: 1.15,
      maxPlacements: 48_000,
      maxPlacementsPerPrimitive: 18_000,
    },
  });

  const [sceneBytes, spatialBytes, collisionBytes, lightingBytes, authoringBytes] =
    await Promise.all([
      fs.readFile(stagedScene),
      fs.readFile(stagedSpatial),
      fs.readFile(stagedCollision),
      fs.readFile(stagedLighting),
      fs.readFile(stagedAuthoring),
    ]);
  const spatial = JSON.parse(gunzipSync(spatialBytes).toString("utf8"));
  worldModule.validateShadoWorldPackage(spatial);
  ensure(spatial.name === zone, "Packed spatial package has the wrong zone");
  ensure(
    spatial.sourceTransform === "mirror-x" &&
      spatial.source === `${runtimeWorldPrefix}/${zone}.glb.gz`,
    "Packed spatial package has the wrong runtime contract",
  );

  const publicTargets = {
    scene: path.join(publicWorldRoot, `${zone}.glb.gz`),
    spatial: path.join(publicWorldRoot, `${zone}.spatial.json.gz`),
    collision: path.join(publicWorldRoot, `${zone}.collision.bin.gz`),
    lighting: path.join(publicWorldRoot, `${zone}.lighting-plan.json.gz`),
  };
  const sandboxTargets = {
    authoring: path.join(sandboxWorldRoot, `${zone}.authoring.json`),
    scene: path.join(sandboxWorldRoot, `${zone}.glb.gz`),
    spatial: path.join(sandboxWorldRoot, `${zone}.spatial.json.gz`),
    collision: path.join(sandboxWorldRoot, `${zone}.collision.bin.gz`),
    lighting: path.join(sandboxWorldRoot, `${zone}.lighting-plan.json.gz`),
  };

  worldEntry.authoring = descriptor(sandboxTargets.authoring, authoringBytes);
  worldEntry.runtime.scene = descriptor(publicTargets.scene, sceneBytes);
  worldEntry.runtime.spatial = descriptor(publicTargets.spatial, spatialBytes);
  worldEntry.runtime.collision = descriptor(
    publicTargets.collision,
    collisionBytes,
  );
  worldEntry.runtime.lightingPlan = descriptor(
    publicTargets.lighting,
    lightingBytes,
  );
  worldEntry.stats = packStats(result);

  const manifestBytes = Buffer.from(`${JSON.stringify(baseline, null, 2)}\n`);
  await Promise.all([
    atomicPublish(authoringBytes, sandboxTargets.authoring),
    atomicPublish(sceneBytes, sandboxTargets.scene),
    atomicPublish(spatialBytes, sandboxTargets.spatial),
    atomicPublish(collisionBytes, sandboxTargets.collision),
    atomicPublish(lightingBytes, sandboxTargets.lighting),
    atomicPublish(sceneBytes, publicTargets.scene),
    atomicPublish(spatialBytes, publicTargets.spatial),
    atomicPublish(collisionBytes, publicTargets.collision),
    atomicPublish(lightingBytes, publicTargets.lighting),
  ]);
  await atomicPublish(manifestBytes, baselineFile);

  if (shouldBakeLighting) {
    // Publishing fresh authored geometry invalidates every geometry-indexed
    // lighting stream. Finish the promotion by rebuilding COLOR_0 and object
    // irradiance, then let the baker restamp the manifest descriptors.
    const lightingArgs = [
      path.join(repoRoot, "client/scripts/lighting/bake-zone-lighting.mjs"),
      "--zone",
      zone,
      "--promote",
    ];
    if (reuseLightingField) lightingArgs.push("--reuse-field");
    await run(process.execPath, lightingArgs);
  } else {
    console.info(
      `${zone} declares ${runtimeLighting.mode}/${runtimeLighting.vertexColors}; ` +
        "obsolete vertex-light baking is not part of this promotion.",
    );
  }

  console.log(
    `Promoted authored ${zone} into the Requiem client: ` +
      `${result.renderChunkCount} spatial render batches, ${result.triangleCount} triangles, ` +
      `${result.collisionTriangleCount} collision triangles, ` +
      `${result.grassPlacementCount} grass placements in ${result.grassCellCount} cells, ` +
      `${sceneBytes.byteLength} compressed scene bytes; ` +
      `${path.basename(validation.file)} passed ${validation.report.checks.length} checks; ` +
      `lighting ${shouldBakeLighting ? "rebaked and promoted" : `${runtimeLighting.mode}/${runtimeLighting.vertexColors}`}.`,
  );
} finally {
  await fs.rm(stagingRoot, { recursive: true, force: true });
}
