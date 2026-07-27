#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  preprocessZoneSceneGlb,
  promoteZoneObjectAssets,
} from "./promote-zone-object-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const supportedZonesFile = path.join(
  repoRoot,
  "client/src/Game/Constants/supportedZones.ts",
);
const clientWorldScenesFile = path.join(
  repoRoot,
  "client/src/Game/Constants/client-world-scenes.ts",
);
const sourceRoot = path.join(
  repoRoot,
  "assets/reference/everquest_rof2/zones",
);
const sandboxRoot = path.join(
  repoRoot,
  "shader-object/sandbox/public/shado/worlds",
);
const publicWorldRoot = path.join(
  repoRoot,
  "client/public/eqrequiem/worlds",
);
const objectCatalogFile = path.join(
  repoRoot,
  "assets/generated/eq-catalog/manifest.json",
);
const baselineFile = path.join(
  publicWorldRoot,
  "legacy-baseline.manifest.json",
);
const runtimeWorldPrefix = "/eqrequiem/worlds";
const runtimeObjectPrefix = "/eqrequiem/objects";
const checkOnly = process.argv.includes("--check");
const dryRun = process.argv.includes("--dry-run");
const validFlags = new Set(["--check", "--dry-run"]);

for (const argument of process.argv.slice(2)) {
  if (!validFlags.has(argument)) {
    throw new Error(`Unknown baseline argument '${argument}'`);
  }
}
if (checkOnly && dryRun) {
  throw new Error("--check and --dry-run cannot be combined");
}

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
    throw new Error(`Baseline artifact is outside the repository: ${file}`);
  }
  return relative.split(path.sep).join("/");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function descriptor(file) {
  const bytes = await fs.readFile(file);
  return {
    path: relativeFile(file),
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
  };
}

async function glbDocument(file) {
  const stored = await fs.readFile(file);
  const bytes = file.toLowerCase().endsWith(".gz")
    ? gunzipSync(stored)
    : stored;
  ensure(
    bytes.byteLength >= 20 &&
      bytes.toString("ascii", 0, 4) === "glTF" &&
      bytes.readUInt32LE(4) === 2,
    `${relativeFile(file)} is not a GLB`,
  );
  const jsonLength = bytes.readUInt32LE(12);
  ensure(
    bytes.readUInt32LE(16) === 0x4e4f534a &&
      20 + jsonLength <= bytes.byteLength,
    `${relativeFile(file)} has no valid JSON chunk`,
  );
  return JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8").trimEnd(),
  );
}

async function sourceSceneFor(zone) {
  for (const extension of [".glb.gz", ".glb"]) {
    const file = path.join(sourceRoot, `${zone}${extension}`);
    if (await exists(file)) return file;
  }
  return undefined;
}

async function loadWorldRegistry() {
  const [zoneModule, sceneModule] = await Promise.all([
    import(pathToFileURL(supportedZonesFile).href),
    import(pathToFileURL(clientWorldScenesFile).href),
  ]);
  const supportedZones = Object.entries(zoneModule.supportedZones)
    .map(([id, zone]) => ({
      id: Number(id),
      shortName: zone.shortName.toLowerCase(),
      longName: zone.longName,
    }))
    .sort((a, b) => a.id - b.id);
  if (
    !supportedZones.length ||
    supportedZones.some(
      (zone) =>
        !Number.isInteger(zone.id) ||
        !zone.shortName ||
        !zone.longName,
    )
  ) {
    throw new Error("Supported-zone registry contains an invalid entry");
  }
  if (
    new Set(supportedZones.map((zone) => zone.id)).size !==
    supportedZones.length
  ) {
    throw new Error("Supported-zone registry contains duplicate IDs");
  }
  if (
    new Set(supportedZones.map((zone) => zone.shortName)).size !==
    supportedZones.length
  ) {
    throw new Error("Supported-zone registry contains duplicate short names");
  }
  const clientScenes = sceneModule.requiredClientWorldScenes.map(
    (scene) => ({
      ...scene,
      shortName: scene.shortName.toLowerCase(),
      excludeUnresolvedObjects: true,
    }),
  );
  if (
    clientScenes.some(
      (scene) => !scene.id || !scene.shortName || !scene.longName,
    )
  ) {
    throw new Error("Required client-world registry contains an invalid entry");
  }
  const worldNames = [
    ...supportedZones.map((zone) => zone.shortName),
    ...clientScenes.map((scene) => scene.shortName),
  ];
  if (new Set(worldNames).size !== worldNames.length) {
    throw new Error("World registries contain duplicate short names");
  }
  return { supportedZones, clientScenes };
}

async function inspectInputs(zones) {
  const catalog = JSON.parse(await fs.readFile(objectCatalogFile, "utf8"));
  const catalogObjects = new Map(
    catalog.assets
      .filter((asset) => asset.kind === "object")
      .map((asset) => [asset.id, asset]),
  );
  const inspected = [];
  const unresolvedReadyObjects = new Map();
  const excludedLegacyObjects = new Map();
  for (const zone of zones) {
    const source = await sourceSceneFor(zone.shortName);
    const metadataFile = path.join(
      sourceRoot,
      `${zone.shortName}.json`,
    );
    const authoringFile = path.join(
      sandboxRoot,
      `${zone.shortName}.authoring.json`,
    );
    const metadata = await exists(metadataFile)
      ? JSON.parse(await fs.readFile(metadataFile, "utf8"))
      : undefined;
    const authoring = await exists(authoringFile)
      ? JSON.parse(await fs.readFile(authoringFile, "utf8"))
      : undefined;
    const legacyObjectIds = Object.keys(metadata?.objects ?? {});
    const authoredObjectIds =
      authoring?.objects?.prototypes?.map((prototype) => prototype.id) ?? [];
    const objectIds = [...new Set([
      ...legacyObjectIds,
      ...authoredObjectIds,
    ])].sort();
    const unresolvedObjectIds = objectIds.filter((id) => {
      const asset = catalogObjects.get(id);
      return !asset?.source;
    });
    const unavailableObjectIds = [];
    for (const id of objectIds) {
      const sourceFile = catalogObjects.get(id)?.source;
      if (
        sourceFile &&
        (!path.isAbsolute(sourceFile) || !await exists(sourceFile))
      ) {
        unavailableObjectIds.push(id);
      }
    }
    if (unavailableObjectIds.length) {
      throw new Error(
        `Catalog object sources are unavailable: ${unavailableObjectIds.join(", ")}`,
      );
    }
    if (source && zone.excludeUnresolvedObjects) {
      for (const id of unresolvedObjectIds) {
        const usedBy = excludedLegacyObjects.get(id) ?? [];
        usedBy.push(zone.shortName);
        excludedLegacyObjects.set(id, usedBy);
      }
    } else if (source) {
      for (const id of unresolvedObjectIds) {
        const usedBy = unresolvedReadyObjects.get(id) ?? [];
        usedBy.push(zone.shortName);
        unresolvedReadyObjects.set(id, usedBy);
      }
    }
    inspected.push({
      ...zone,
      source,
      metadataFile: metadata ? metadataFile : undefined,
      authoringFile: authoring ? authoringFile : undefined,
      legacyObjectIds,
      objectIds,
      unresolvedObjectIds,
    });
  }
  return {
    zones: inspected,
    catalog,
    unresolvedReadyObjects,
    excludedLegacyObjects,
  };
}

function preflightSummary(inspected) {
  const supportedZones = inspected.zones.filter(
    (world) => world.registry === "supported-zone",
  );
  const clientScenes = inspected.zones.filter(
    (world) => world.registry === "client-scene",
  );
  const missingSources = supportedZones
    .filter((zone) => !zone.source)
    .map((zone) => zone.shortName);
  const missingMetadata = supportedZones
    .filter((zone) => !zone.metadataFile)
    .map((zone) => zone.shortName);
  return {
    supportedZones: supportedZones.length,
    packableZones: supportedZones.length - missingSources.length,
    missingSources,
    missingMetadata,
    clientScenes: clientScenes.map((scene) => ({
      id: scene.id,
      shortName: scene.shortName,
      source: scene.source ? relativeFile(scene.source) : null,
      metadata: scene.metadataFile
        ? relativeFile(scene.metadataFile)
        : null,
      excludedLegacyObjects: scene.unresolvedObjectIds,
    })),
    unresolvedReadyObjects: [...inspected.unresolvedReadyObjects]
      .map(([id, zones]) => ({ id, zones }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    excludedLegacyObjects: [...inspected.excludedLegacyObjects]
      .map(([id, worlds]) => ({ id, worlds }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function stableError(error, stagingRoot) {
  return (error instanceof Error ? error.message : String(error))
    .replaceAll(repoRoot, "<repo>")
    .replaceAll(stagingRoot, "<staging>");
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
    tiles: result.tileCount,
    collisionVertices: result.collisionVertexCount,
    collisionTriangles: result.collisionTriangleCount,
    lightingStatus: result.lightingStatus,
    lightingUv2ReadyChunks: result.lightingUv2ReadyChunkCount,
  };
}

async function stageZone(zone, stagingRoot, shado) {
  if (!zone.source) {
    return { zone, status: "missing-source" };
  }
  const sourceExtension = zone.source.toLowerCase().endsWith(".glb.gz")
    ? ".glb.gz"
    : ".glb";
  const authoring = path.join(
    stagingRoot,
    `${zone.shortName}.authoring.json`,
  );
  if (zone.authoringFile) {
    await fs.copyFile(zone.authoringFile, authoring);
  } else {
    const document = shado.createShadoWorldAuthoring(zone.shortName);
    await fs.writeFile(authoring, `${JSON.stringify(document, null, 2)}\n`);
  }
  let metadataInput = zone.metadataFile;
  if (
    zone.excludeUnresolvedObjects &&
    zone.unresolvedObjectIds.length
  ) {
    const excluded = new Set(zone.unresolvedObjectIds);
    const document = JSON.parse(await fs.readFile(authoring, "utf8"));
    const prototypes = document.objects?.prototypes ?? [];
    const stamps = document.objects?.stamps ?? [];
    const filteredPrototypes = prototypes.filter(
      (prototype) => !excluded.has(prototype.id),
    );
    const filteredStamps = stamps.filter(
      (stamp) => !excluded.has(stamp.prototype),
    );
    if (
      filteredPrototypes.length !== prototypes.length ||
      filteredStamps.length !== stamps.length
    ) {
      document.objects.prototypes = filteredPrototypes;
      document.objects.stamps = filteredStamps;
      document.revision++;
      await fs.writeFile(
        authoring,
        `${JSON.stringify(document, null, 2)}\n`,
      );
    }
    if (zone.metadataFile) {
      const metadata = JSON.parse(
        await fs.readFile(zone.metadataFile, "utf8"),
      );
      for (const id of excluded) delete metadata.objects?.[id];
      metadataInput = path.join(
        stagingRoot,
        `${zone.shortName}.legacy-filtered.json`,
      );
      await fs.writeFile(
        metadataInput,
        `${JSON.stringify(metadata)}\n`,
      );
    }
  }
  const spatial = path.join(
    stagingRoot,
    `${zone.shortName}.spatial.json.gz`,
  );
  const collision = path.join(
    stagingRoot,
    `${zone.shortName}.collision.bin.gz`,
  );
  const lightingPlan = path.join(
    stagingRoot,
    `${zone.shortName}.lighting-plan.json.gz`,
  );
  const scene = path.join(
    stagingRoot,
    `${zone.shortName}${sourceExtension}`,
  );
  try {
    const result = await shado.packShadoWorld({
      name: zone.shortName,
      input: zone.source,
      outFile: spatial,
      collisionOutFile: collision,
      lightingPlanOutFile: lightingPlan,
      runtimeSource:
        `${runtimeWorldPrefix}/${zone.shortName}${sourceExtension}`,
      copyInputTo: scene,
      authoringInput: authoring,
      metadataInput,
      objectSourcePrefix: runtimeObjectPrefix,
      sourceTransform: "mirror-x",
    });
    const copiedScene = await fs.readFile(scene);
    const runtimeScene = preprocessZoneSceneGlb(
      sourceExtension.endsWith(".gz")
        ? gunzipSync(copiedScene)
        : copiedScene,
      zone.shortName,
    );
    await fs.writeFile(
      scene,
      sourceExtension.endsWith(".gz")
        ? gzipSync(runtimeScene, { level: 9 })
        : runtimeScene,
    );
    return {
      zone,
      status: "ready",
      files: { authoring, scene, spatial, collision, lightingPlan },
      runtimeSource:
        `${runtimeWorldPrefix}/${zone.shortName}${sourceExtension}`,
      stats: packStats(result),
    };
  } catch (error) {
    return {
      zone,
      status: "pack-failed",
      error: stableError(error, stagingRoot),
    };
  }
}

async function promoteStagedZone(staged) {
  const sandboxFiles = Object.values(staged.files);
  for (const source of sandboxFiles) {
    await fs.copyFile(
      source,
      path.join(sandboxRoot, path.basename(source)),
    );
  }
  for (const source of [
    staged.files.scene,
    staged.files.spatial,
    staged.files.collision,
    staged.files.lightingPlan,
  ]) {
    await fs.copyFile(
      source,
      path.join(publicWorldRoot, path.basename(source)),
    );
  }
}

async function buildZoneManifest(staged) {
  const zone = staged.zone;
  const metadata = zone.metadataFile
    ? await descriptor(zone.metadataFile)
    : null;
  const warnings = [];
  if (!zone.metadataFile) warnings.push("missing-legacy-metadata");
  if (zone.unresolvedObjectIds.length) {
    warnings.push("unresolved-legacy-object-prototypes");
  }
  if (staged.status === "missing-source") {
    return {
      id: zone.id,
      shortName: zone.shortName,
      longName: zone.longName,
      status: staged.status,
      source: null,
      metadata,
      unresolvedObjectIds: zone.unresolvedObjectIds,
      warnings,
    };
  }
  const source = await descriptor(zone.source);
  if (staged.status === "pack-failed") {
    return {
      id: zone.id,
      shortName: zone.shortName,
      longName: zone.longName,
      status: staged.status,
      source,
      metadata,
      error: staged.error,
      warnings,
    };
  }
  const promoted = {
    authoring: path.join(
      sandboxRoot,
      path.basename(staged.files.authoring),
    ),
    scene: path.join(
      publicWorldRoot,
      path.basename(staged.files.scene),
    ),
    spatial: path.join(
      publicWorldRoot,
      path.basename(staged.files.spatial),
    ),
    collision: path.join(
      publicWorldRoot,
      path.basename(staged.files.collision),
    ),
    lightingPlan: path.join(
      publicWorldRoot,
      path.basename(staged.files.lightingPlan),
    ),
  };
  return {
    id: zone.id,
    shortName: zone.shortName,
    longName: zone.longName,
    status: staged.status,
    source,
    metadata,
    authoring: await descriptor(promoted.authoring),
    runtime: {
      source: staged.runtimeSource,
      scene: await descriptor(promoted.scene),
      spatial: await descriptor(promoted.spatial),
      collision: await descriptor(promoted.collision),
      lightingPlan: await descriptor(promoted.lightingPlan),
    },
    stats: staged.stats,
    ...(zone.excludeUnresolvedObjects &&
    zone.unresolvedObjectIds.length
      ? { excludedLegacyObjectIds: zone.unresolvedObjectIds }
      : {}),
    warnings,
  };
}

async function writeBaseline(zones, clientScenes, objectAssets) {
  const counts = {
    ready: zones.filter((zone) => zone.status === "ready").length,
    missingSource: zones.filter(
      (zone) => zone.status === "missing-source",
    ).length,
    packFailed: zones.filter(
      (zone) => zone.status === "pack-failed",
    ).length,
  };
  const baseline = {
    kind: "requiem.legacy-zone-baseline",
    version: 4,
    coordinateSystem: "babylon-y-up",
    sourceTransform: "mirror-x",
    runtimeSceneContract: "babylon-rhs-y-up-v4",
    supportedZoneRegistry:
      "client/src/Game/Constants/supportedZones.ts",
    requiredClientWorldRegistry:
      "client/src/Game/Constants/client-world-scenes.ts",
    sourceRoot: "assets/reference/everquest_rof2/zones",
    runtimeWorldPrefix,
    runtimeObjectPrefix,
    counts,
    zones,
    clientScenes,
    objectAssets,
  };
  await fs.writeFile(
    baselineFile,
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
  return baseline;
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function validateDescriptor(value, label) {
  ensure(value && typeof value.path === "string", `${label} has no path`);
  ensure(
    typeof value.sha256 === "string" && value.sha256.length === 64,
    `${label} has no SHA-256`,
  );
  ensure(
    Number.isInteger(value.bytes) && value.bytes >= 0,
    `${label} has an invalid byte count`,
  );
  const file = path.resolve(repoRoot, value.path);
  ensure(
    relativeFile(file) === value.path,
    `${label} has a non-canonical path`,
  );
  const actual = await descriptor(file);
  ensure(actual.bytes === value.bytes, `${label} byte count changed`);
  ensure(actual.sha256 === value.sha256, `${label} checksum changed`);
  return file;
}

async function checkBaseline(registry) {
  const baseline = JSON.parse(await fs.readFile(baselineFile, "utf8"));
  ensure(
      baseline.kind === "requiem.legacy-zone-baseline" &&
      baseline.version === 4,
    "Unsupported legacy-zone baseline manifest",
  );
  ensure(
      baseline.coordinateSystem === "babylon-y-up" &&
      baseline.sourceTransform === "mirror-x" &&
      baseline.runtimeSceneContract === "babylon-rhs-y-up-v4",
    "Legacy-zone baseline coordinate contract changed",
  );
  ensure(
    baseline.zones.length === registry.supportedZones.length,
    "Baseline does not contain every supported zone",
  );
  ensure(
    baseline.clientScenes.length === registry.clientScenes.length,
    "Baseline does not contain every required client scene",
  );
  const entries = [
    ...registry.supportedZones.map((expected, index) => ({
      expected,
      world: baseline.zones[index],
      registry: "Supported-zone",
    })),
    ...registry.clientScenes.map((expected, index) => ({
      expected,
      world: baseline.clientScenes[index],
      registry: "Required client-world",
    })),
  ];
  for (const entry of entries) {
    const expected = entry.expected;
    const zone = entry.world;
    ensure(
      zone.id === expected.id &&
        zone.shortName === expected.shortName &&
        zone.longName === expected.longName,
      `${entry.registry} registry changed at '${expected.shortName}'`,
    );
    const currentSource = await sourceSceneFor(zone.shortName);
    const currentMetadata = path.join(
      sourceRoot,
      `${zone.shortName}.json`,
    );
    if (zone.status === "missing-source") {
      ensure(
        !currentSource,
        `Source scene now exists for '${zone.shortName}'; rebuild the baseline`,
      );
      ensure(zone.source === null, `${zone.shortName} source must be null`);
    } else {
      ensure(
        currentSource,
        `Source scene disappeared for '${zone.shortName}'`,
      );
      ensure(
        relativeFile(currentSource) === zone.source.path,
        `Source scene selection changed for '${zone.shortName}'`,
      );
      await validateDescriptor(zone.source, `${zone.shortName} source`);
    }
    if (await exists(currentMetadata)) {
      ensure(
        zone.metadata,
        `Metadata now exists for '${zone.shortName}'; rebuild the baseline`,
      );
      ensure(
        relativeFile(currentMetadata) === zone.metadata.path,
        `Metadata selection changed for '${zone.shortName}'`,
      );
      await validateDescriptor(
        zone.metadata,
        `${zone.shortName} metadata`,
      );
    } else {
      ensure(
        zone.metadata === null,
        `Metadata disappeared for '${zone.shortName}'`,
      );
    }
    if (zone.status !== "ready") continue;
    await validateDescriptor(zone.authoring, `${zone.shortName} authoring`);
    const scene = await validateDescriptor(
      zone.runtime.scene,
      `${zone.shortName} runtime scene`,
    );
    const runtimeDocument = await glbDocument(scene);
    ensure(
      runtimeDocument.asset?.extras?.requiemRuntimeContract ===
        "babylon-rhs-y-up-v4" &&
        runtimeDocument.asset.extras.runtimeHandedness === "right" &&
        runtimeDocument.asset.extras.exporterReflectionRemoved === true &&
        runtimeDocument.asset.extras.canonicalZoneMirrorXApplied === true,
      `${zone.shortName} runtime scene contract changed`,
    );
    for (const runtimeScene of runtimeDocument.scenes ?? []) {
      for (const nodeIndex of runtimeScene.nodes ?? []) {
        ensure(
          runtimeDocument.nodes?.[nodeIndex]?.scale == null,
          `${zone.shortName} retained an exporter reflection root`,
        );
      }
    }
    ensure(
      path.basename(scene) === path.basename(zone.runtime.source),
      `${zone.shortName} runtime scene URL changed`,
    );
    const spatialFile = await validateDescriptor(
      zone.runtime.spatial,
      `${zone.shortName} spatial package`,
    );
    await validateDescriptor(
      zone.runtime.collision,
      `${zone.shortName} collision package`,
    );
    if (zone.runtime.lightingPlan) {
      await validateDescriptor(
        zone.runtime.lightingPlan,
        `${zone.shortName} lighting plan`,
      );
    }
    for (const [kind, artifact] of Object.entries({
      scene: zone.runtime.scene,
      spatial: zone.runtime.spatial,
      collision: zone.runtime.collision,
      ...(zone.runtime.lightingPlan
        ? { lightingPlan: zone.runtime.lightingPlan }
        : {}),
    })) {
      const sandboxFile = path.join(
        sandboxRoot,
        path.basename(artifact.path),
      );
      const sandboxArtifact = await descriptor(sandboxFile);
      ensure(
        sandboxArtifact.sha256 === artifact.sha256 &&
          sandboxArtifact.bytes === artifact.bytes,
        `${zone.shortName} sandbox ${kind} differs from its public artifact`,
      );
    }
    const world = JSON.parse(
      gunzipSync(await fs.readFile(spatialFile)).toString("utf8"),
    );
    ensure(
      world.kind === "shado.world.spatial" &&
        world.version === 5 &&
        world.name === zone.shortName &&
        world.coordinateSystem === "babylon-y-up" &&
        world.sourceTransform === "mirror-x" &&
        world.source === zone.runtime.source,
      `${zone.shortName} spatial package contract changed`,
    );
  }
  ensure(
    baseline.objectAssets?.status === "ready",
    "Baseline object promotion is not ready",
  );
  const actualCounts = {
    ready: baseline.zones.filter((zone) => zone.status === "ready").length,
    missingSource: baseline.zones.filter(
      (zone) => zone.status === "missing-source",
    ).length,
    packFailed: baseline.zones.filter(
      (zone) => zone.status === "pack-failed",
    ).length,
  };
  ensure(
    JSON.stringify(actualCounts) === JSON.stringify(baseline.counts),
    "Baseline status counts changed",
  );
  const objectManifestFile = await validateDescriptor(
    baseline.objectAssets.manifest,
    "Object asset manifest",
  );
  const objectManifest = JSON.parse(
    await fs.readFile(objectManifestFile, "utf8"),
  );
  ensure(
    objectManifest.kind === "requiem.object-assets" &&
      objectManifest.version === 3 &&
      objectManifest.coordinateSystem === "babylon-y-up" &&
      objectManifest.runtimeHandedness === "right" &&
      objectManifest.sourceTransform === "identity",
    "Object asset manifest contract changed",
  );
  ensure(
    objectManifest.sourceCatalog ===
      "assets/generated/eq-catalog/manifest.json",
    "Object source catalog path changed",
  );
  const catalogBytes = await fs.readFile(
    path.join(repoRoot, objectManifest.sourceCatalog),
  );
  ensure(
    sha256(catalogBytes) === objectManifest.sourceCatalogSha256,
    "Object source catalog checksum changed",
  );
  const readyWorlds = [
    ...baseline.zones,
    ...baseline.clientScenes,
  ]
    .filter((zone) => zone.status === "ready")
    .map((zone) => zone.shortName)
    .sort();
  ensure(
    JSON.stringify(objectManifest.zones) === JSON.stringify(readyWorlds),
    "Object asset manifest world set changed",
  );
  ensure(
    JSON.stringify(baseline.objectAssets.zones) ===
      JSON.stringify(readyWorlds),
    "Baseline object world set changed",
  );
  ensure(
    objectManifest.objects.length === baseline.objectAssets.objects,
    "Object asset manifest count changed",
  );
  for (const object of objectManifest.objects) {
    ensure(
      object.source ===
        `/eqrequiem/objects/${object.id}/final.glb.gz`,
      `Object '${object.id}' runtime URL changed`,
    );
    const file = path.join(
      repoRoot,
      "client/public",
      object.source.replace(/^\//, ""),
    );
    const compressed = await fs.readFile(file);
    ensure(
      compressed.byteLength === object.compressedBytes,
      `Object '${object.id}' byte count changed`,
    );
    ensure(
      sha256(compressed) === object.compressedSha256,
      `Object '${object.id}' checksum changed`,
    );
  }
  console.log(
    `Verified legacy baseline: ${baseline.counts.ready} ready, ` +
      `${baseline.counts.missingSource} missing source, ` +
      `${baseline.counts.packFailed} pack failed; ` +
      `${objectManifest.objects.length} object assets`,
  );
}

async function buildBaseline(inspected) {
  if (inspected.unresolvedReadyObjects.size) {
    const summary = [...inspected.unresolvedReadyObjects]
      .map(([id, zones]) => `${id} (${zones.join(", ")})`)
      .join("; ");
    throw new Error(
      `Packable zones reference objects absent from the catalog: ${summary}`,
    );
  }
  const preprocessModule = path.join(
    repoRoot,
    "shader-object/dist/preprocess/index.js",
  );
  const worldModule = path.join(
    repoRoot,
    "shader-object/dist/world/index.js",
  );
  if (!await exists(preprocessModule) || !await exists(worldModule)) {
    throw new Error(
      "Shader Object is not built; run `npm --prefix client run world:baseline`",
    );
  }
  const [{ packShadoWorld }, { createShadoWorldAuthoring }] =
    await Promise.all([
      import(pathToFileURL(preprocessModule).href),
      import(pathToFileURL(worldModule).href),
    ]);
  await fs.mkdir(sandboxRoot, { recursive: true });
  await fs.mkdir(publicWorldRoot, { recursive: true });
  const stagingRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "requiem-legacy-zone-baseline-"),
  );
  try {
    const stagedZones = [];
    for (const zone of inspected.zones) {
      if (!zone.source) {
        console.log(`missing ${zone.shortName}: no GLB source scene`);
      } else {
        console.log(`baking ${zone.shortName}`);
      }
      const staged = await stageZone(zone, stagingRoot, {
        packShadoWorld,
        createShadoWorldAuthoring,
      });
      if (staged.status === "pack-failed") {
        console.error(`failed ${zone.shortName}: ${staged.error}`);
      }
      stagedZones.push(staged);
    }
    const ready = stagedZones.filter((zone) => zone.status === "ready");
    for (const staged of ready) await promoteStagedZone(staged);

    let objectAssets;
    try {
      const promoted = await promoteZoneObjectAssets(
        ready.map((zone) => zone.zone.shortName),
      );
      objectAssets = {
        status: "ready",
        zones: promoted.manifest.zones,
        objects: promoted.manifest.objects.length,
        manifest: await descriptor(promoted.manifestFile),
      };
    } catch (error) {
      objectAssets = {
        status: "promotion-failed",
        error: stableError(error, stagingRoot),
      };
    }

    const zoneManifest = [];
    for (const staged of stagedZones) {
      zoneManifest.push(await buildZoneManifest(staged));
    }
    const baseline = await writeBaseline(
      zoneManifest.filter(
        (world) =>
          stagedZones.find(
            (staged) => staged.zone.shortName === world.shortName,
          )?.zone.registry === "supported-zone",
      ),
      zoneManifest.filter(
        (world) =>
          stagedZones.find(
            (staged) => staged.zone.shortName === world.shortName,
          )?.zone.registry === "client-scene",
      ),
      objectAssets,
    );
    console.log(
      `Wrote ${relativeFile(baselineFile)}: ` +
        `${baseline.counts.ready} ready, ` +
        `${baseline.counts.missingSource} missing source, ` +
        `${baseline.counts.packFailed} pack failed`,
    );
    if (objectAssets.status !== "ready") {
      throw new Error(
        "Legacy baseline object promotion failed; see the manifest",
      );
    }
    if (baseline.counts.packFailed) {
      console.warn(
        `${baseline.counts.packFailed} legacy zone source(s) did not satisfy ` +
          "the current world contract; their failures are baseline entries",
      );
    }
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

const registry = await loadWorldRegistry();
if (checkOnly) {
  await checkBaseline(registry);
} else {
  const inspected = await inspectInputs([
    ...registry.supportedZones.map((zone) => ({
      ...zone,
      registry: "supported-zone",
    })),
    ...registry.clientScenes.map((scene) => ({
      ...scene,
      registry: "client-scene",
    })),
  ]);
  const summary = preflightSummary(inspected);
  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `Legacy baseline preflight: ${summary.packableZones}/` +
        `${summary.supportedZones} zones have source scenes; ` +
        `${summary.missingMetadata.length} lack metadata`,
    );
    await buildBaseline(inspected);
  }
}
