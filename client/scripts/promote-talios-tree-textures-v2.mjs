#!/usr/bin/env node

/** Promote only the approved Talios stone pine, salt oak, and quay poplar. */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { preprocessZoneObjectGlb } from "./promote-zone-object-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const exportRoot = path.join(repoRoot, "assets/src/world/objects/talioscrownward/exports");
const objectRoot = path.join(repoRoot, "client/public/eqrequiem/objects");
const manifestFile = path.join(objectRoot, "manifest.json");
const baselineFile = path.join(repoRoot, "client/public/eqrequiem/worlds/legacy-baseline.manifest.json");
const promotionId = "talios-tree-texture-promotion-v2";
const backupRoot = path.join(repoRoot, "assets/generated/object-replacements/talios-tree-texture-v2/backup/runtime");
const reportFile = path.join(repoRoot, `assets/src/world/objects/talioscrownward/${promotionId}.json`);

const assets = [
  { id: "tree1", source: "talios-crownward-stonepine-v1.glb", species: "stone-pine", placement: "existing-talios-prototype" },
  { id: "tree6", source: "talios-crownward-saltoak-v1.glb", species: "salt-oak", placement: "existing-talios-prototype" },
  { id: "talios-crownward-quaypoplar-v1", source: "talios-crownward-quaypoplar-v1.glb", species: "quay-poplar", placement: "library-only" },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseGlb(bytes, label) {
  if (bytes.byteLength < 20 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.byteLength) {
    throw new Error(`${label} is not a valid GLB`);
  }
  let offset = 12;
  let document;
  while (offset < bytes.byteLength) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.byteLength) throw new Error(`${label} has a truncated chunk`);
    if (type === 0x4e4f534a) document = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString("utf8").trimEnd());
    offset += 8 + length;
  }
  if (!document) throw new Error(`${label} has no JSON chunk`);
  return document;
}

function validateTreeGlb(bytes, item, runtime = false) {
  const document = parseGlb(bytes, `${item.id}${runtime ? " runtime" : " source"}`);
  const primitives = (document.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (primitives.length !== 2) throw new Error(`${item.id} requires exactly two tree primitives`);
  for (const primitive of primitives) {
    if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(primitive.indices)) throw new Error(`${item.id} has non-indexed triangle geometry`);
    for (const attribute of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
      if (!Number.isInteger(primitive.attributes?.[attribute])) throw new Error(`${item.id} has no ${attribute}`);
    }
    const material = document.materials?.[primitive.material];
    if (!material?.pbrMetallicRoughness?.baseColorTexture || !material.pbrMetallicRoughness.metallicRoughnessTexture || !material.normalTexture) {
      throw new Error(`${item.id} primitive lacks base color, normal, or ORM texture`);
    }
  }
  if ((document.images ?? []).length !== 6) throw new Error(`${item.id} must embed six prepared tree maps`);
  if (runtime && document.asset?.extras?.requiemRuntimeContract !== "babylon-rhs-y-up-v3") {
    throw new Error(`${item.id} runtime contract was not applied`);
  }
  return document;
}

async function exists(file) {
  return fs.access(file).then(() => true).catch(() => false);
}

async function writeAtomic(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

async function backup(file, relative) {
  if (!(await exists(file))) return false;
  const destination = path.join(backupRoot, relative);
  if (!(await exists(destination))) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(file, destination);
  }
  return true;
}

async function promote() {
  const originalManifestBytes = await fs.readFile(manifestFile);
  const manifest = JSON.parse(originalManifestBytes);
  const previousById = new Map(manifest.objects.map((object) => [object.id, object]));
  const prepared = [];

  for (const item of assets) {
    const sourcePath = path.join(exportRoot, item.source);
    const source = await fs.readFile(sourcePath);
    validateTreeGlb(source, item);
    const runtime = preprocessZoneObjectGlb(source, item.id);
    validateTreeGlb(runtime, item, true);
    const compressed = gzipSync(runtime, { level: 9 });
    if (!gunzipSync(compressed).equals(runtime)) throw new Error(`${item.id} gzip round trip failed`);
    prepared.push({ ...item, sourcePath, source, runtime, compressed });
  }

  await backup(manifestFile, "objects/manifest.json");
  await backup(baselineFile, "worlds/legacy-baseline.manifest.json");
  for (const item of prepared) {
    await backup(path.join(objectRoot, item.id, "final.glb.gz"), path.join("objects", item.id, "final.glb.gz"));
  }

  const promotedById = new Map(prepared.map((item) => [item.id, item]));
  manifest.objects = manifest.objects.map((object) => {
    const item = promotedById.get(object.id);
    return item ? manifestRecord(item, object) : object;
  });
  for (const item of prepared) {
    if (!previousById.has(item.id)) manifest.objects.push(manifestRecord(item));
  }
  manifest.objects.sort((a, b) => a.id.localeCompare(b.id));

  for (const item of prepared) {
    await writeAtomic(path.join(objectRoot, item.id, "final.glb.gz"), item.compressed);
  }
  await writeAtomic(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const manifestBytes = await fs.readFile(manifestFile);
  const baseline = JSON.parse(await fs.readFile(baselineFile, "utf8"));
  baseline.objectAssets.manifest = {
    path: "client/public/eqrequiem/objects/manifest.json",
    sha256: sha256(manifestBytes),
    bytes: manifestBytes.byteLength,
  };
  await writeAtomic(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);

  const report = {
    kind: "eltania.talios-tree-texture-runtime-promotion",
    version: 2,
    zone: "talioscrownward",
    status: "promoted-client-runtime",
    promotedAt: new Date().toISOString(),
    scope: assets.map((item) => item.id),
    untouchedManifestObjects: manifest.objects.length - assets.length,
    runtimeContract: "babylon-rhs-y-up-v3",
    authoring: "imagegen-talios-species-tree-texture-v2",
    backups: path.relative(repoRoot, backupRoot),
    objects: prepared.map((item) => ({
      id: item.id,
      species: item.species,
      placement: item.placement,
      source: path.relative(repoRoot, item.sourcePath),
      runtime: `/eqrequiem/objects/${item.id}/final.glb.gz`,
      previousManifestRecord: previousById.get(item.id) ?? null,
      sourceSha256: sha256(item.source),
      contentSha256: sha256(item.runtime),
      compressedSha256: sha256(item.compressed),
      bytes: item.runtime.byteLength,
      compressedBytes: item.compressed.byteLength,
    })),
    manifest: { path: path.relative(repoRoot, manifestFile), sha256: sha256(manifestBytes), bytes: manifestBytes.byteLength },
  };
  await writeAtomic(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Promoted ${prepared.length} Talios tree assets without touching ${report.untouchedManifestObjects} other manifest records.`);
}

function manifestRecord(item, previous = {}) {
  return {
    ...previous,
    id: item.id,
    source: `/eqrequiem/objects/${item.id}/final.glb.gz`,
    sourceSha256: sha256(item.source),
    contentSha256: sha256(item.runtime),
    compressedSha256: sha256(item.compressed),
    bytes: item.runtime.byteLength,
    compressedBytes: item.compressed.byteLength,
    authoring: "talios-tree-species-pbr-v2",
  };
}

promote().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
