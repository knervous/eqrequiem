#!/usr/bin/env node

/**
 * Promote the approved Talios Crownward object-transform passes without
 * returning to catalog source geometry. Existing prototype IDs deliberately
 * keep their public URLs, so every stamp in the shipped Talios spatial world
 * resolves the transformed payload immediately after this promotion.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { preprocessZoneObjectGlb } from "./promote-zone-object-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const exportRoot = path.join(
  repoRoot,
  "assets/src/world/objects/talioscrownward/exports",
);
const objectRoot = path.join(repoRoot, "client/public/eqrequiem/objects");
const zoneRoot = path.join(repoRoot, "assets/src/world/objects/talioscrownward");
const manifestFile = path.join(objectRoot, "manifest.json");
const baselineFile = path.join(
  repoRoot,
  "client/public/eqrequiem/worlds/legacy-baseline.manifest.json",
);
const promotionId = "talioscrownward-object-transform-promotion-v1";
const backupRoot = path.join(
  repoRoot,
  "assets/generated/object-replacements",
  promotionId,
  "backup",
);
const reportFile = path.join(zoneRoot, `${promotionId}.json`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const currentPrototypeAssets = {
  cart: "talios-crownward-supply-cart-v1.glb",
  cratea: "talios-crownward-reinforcedcrate-v1.glb",
  barrel3: "talios-crownward-saltbarrel-v1.glb",
  chest1: "talios-crownward-ledgerchest-v1.glb",
  tree1: "talios-crownward-stonepine-v1.glb",
  tree6: "talios-crownward-saltoak-v1.glb",
  chair: "talios-crownward-harbor-side-chair-v1.glb",
  chair2: "talios-crownward-crownward-highback-v1.glb",
  chair2d: "talios-crownward-archive-armchair-v1.glb",
  chair3: "talios-crownward-dock-stool-v1.glb",
  barstool2: "talios-crownward-tavern-barstool-v1.glb",
  bench: "talios-crownward-crownward-street-bench-v1.glb",
  roundtable: "talios-crownward-guild-round-table-v1.glb",
  roundtabled: "talios-crownward-archive-round-table-v1.glb",
  recttable: "talios-crownward-quayside-rect-table-v1.glb",
  squaretable: "talios-crownward-crownward-square-table-v1.glb",
  smalltable: "talios-crownward-lantern-side-table-v1.glb",
  conftable: "talios-crownward-council-conference-table-v1.glb",
  drawer1: "talios-crownward-ledger-drawer-v1.glb",
  dresser: "talios-crownward-salt-oak-dresser-v1.glb",
  crated: "talios-crownward-harbor-crate-d-v1.glb",
  cratef: "talios-crownward-harbor-crate-f-v1.glb",
  cratee: "talios-crownward-harbor-crate-e-v1.glb",
  crateb: "talios-crownward-harbor-crate-b-v1.glb",
  cratec: "talios-crownward-harbor-crate-c-v1.glb",
  crateg: "talios-crownward-harbor-crate-g-v1.glb",
  barrel4: "talios-crownward-tide-barrel-v1.glb",
  barrelonside: "talios-crownward-stowed-cask-v1.glb",
  urn1: "talios-crownward-civic-urn-one-v1.glb",
  urn2: "talios-crownward-civic-urn-two-v1.glb",
  urn3: "talios-crownward-civic-urn-three-v1.glb",
  bed4: "talios-crownward-saltwright-bed-v1.glb",
  bunk1: "talios-crownward-harbor-bunk-v1.glb",
  bed2: "talios-crownward-archive-bed-v1.glb",
  bed3: "talios-crownward-watch-bed-v1.glb",
  rug3: "talios-crownward-civic-rug-three-v1.glb",
  rug4: "talios-crownward-civic-rug-four-v1.glb",
  rug2: "talios-crownward-civic-rug-two-v1.glb",
  torchpoint: "talios-crownward-wall-torch-v1.glb",
  hlamp: "talios-crownward-harbor-lamp-v1.glb",
  torch2: "talios-crownward-gate-torch-v1.glb",
  lightpole: "talios-crownward-crownward-light-pole-v1.glb",
  qeyflag: "talios-crownward-crownward-standard-v1.glb",
  post: "talios-crownward-civic-post-v1.glb",
  crystal3: "talios-crownward-crownward-crystal-v1.glb",
  pawhook: "talios-crownward-archive-wall-hook-v1.glb",
};

// These have no current Talios spatial prototype. They are still client-
// addressable as approved library objects and remain intentionally unstamped.
const libraryAssets = {
  "talios-crownward-quaysidebench-v1": "talios-crownward-quaysidebench-v1.glb",
  "talios-crownward-quaypoplar-v1": "talios-crownward-quaypoplar-v1.glb",
  "talios-crownward-crownwardnoticesign-v1": "talios-crownward-crownwardnoticesign-v1.glb",
  "talios-crownward-crownwardlamppost-v1": "talios-crownward-crownwardlamppost-v1.glb",
  "talios-crownward-crownwardgatedoor-v1": "talios-crownward-crownwardgatedoor-v1.glb",
  "talios-crownward-reliquary-life-v1": "talios-crownward-reliquary-life-v1.glb",
  "talios-crownward-reliquary-life-b-v1": "talios-crownward-reliquary-life-b-v1.glb",
};

function parseGlb(bytes, label) {
  if (
    bytes.byteLength < 20 ||
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.byteLength
  ) throw new Error(`${label} is not a valid GLB`);
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

function identity(value, expected, label) {
  if (value && JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`${label} is not identity rooted`);
}

function validateAuthoredGlb(bytes, id) {
  const doc = parseGlb(bytes, id);
  if (!doc.scenes?.length || !doc.meshes?.length) throw new Error(`${id} needs a scene and mesh`);
  for (const scene of doc.scenes) for (const index of scene.nodes ?? []) {
    const root = doc.nodes?.[index];
    if (!root) throw new Error(`${id} has a missing scene root`);
    identity(root.translation, [0, 0, 0], id);
    identity(root.rotation, [0, 0, 0, 1], id);
    identity(root.scale, [1, 1, 1], id);
  }
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives ?? []) {
    if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(primitive.indices)) throw new Error(`${id} has non-indexed non-triangle geometry`);
    for (const attribute of ["POSITION", "NORMAL", "TEXCOORD_0"]) if (!Number.isInteger(primitive.attributes?.[attribute])) throw new Error(`${id} has no ${attribute}`);
    const material = doc.materials?.[primitive.material];
    if (!material?.pbrMetallicRoughness?.baseColorTexture || !material.pbrMetallicRoughness.metallicRoughnessTexture || !material.normalTexture) throw new Error(`${id} primitive lacks a complete PBR texture set`);
  }
  if (/qeynos2|qeynos/i.test(JSON.stringify(doc))) throw new Error(`${id} carries legacy Qeynos metadata`);
  return doc;
}

async function exists(file) { return fs.access(file).then(() => true).catch(() => false); }
async function writeAtomic(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}
async function backup(file, relative) {
  if (!(await exists(file))) return;
  const destination = path.join(backupRoot, relative);
  if (await exists(destination)) return;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(file, destination);
}

async function promote() {
  const assets = new Map([...Object.entries(currentPrototypeAssets), ...Object.entries(libraryAssets)]);
  if (assets.size !== 53) throw new Error(`Expected 53 Talios outputs, found ${assets.size}`);
  const prepared = [];
  for (const [id, output] of [...assets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sourcePath = path.join(exportRoot, output);
    const source = await fs.readFile(sourcePath);
    validateAuthoredGlb(source, id);
    const runtime = preprocessZoneObjectGlb(source, id);
    validateAuthoredGlb(runtime, `${id} runtime`);
    prepared.push({ id, output, source, runtime, compressed: gzipSync(runtime, { level: 9 }) });
  }

  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  const manifestIds = new Set(manifest.objects.map((object) => object.id));
  const missing = Object.keys(currentPrototypeAssets).filter((id) => !manifestIds.has(id));
  if (missing.length) throw new Error(`Runtime manifest is missing Talios prototype IDs: ${missing.join(", ")}`);

  await backup(manifestFile, "objects/manifest.json");
  await backup(baselineFile, "worlds/legacy-baseline.manifest.json");
  for (const item of prepared) await backup(path.join(objectRoot, item.id, "final.glb.gz"), path.join("objects", item.id, "final.glb.gz"));

  const byId = new Map(prepared.map((item) => [item.id, item]));
  manifest.objects = manifest.objects.map((object) => {
    const item = byId.get(object.id);
    if (!item) return object;
    return {
      ...object,
      source: `/eqrequiem/objects/${item.id}/final.glb.gz`,
      sourceSha256: sha256(item.source),
      contentSha256: sha256(item.runtime),
      compressedSha256: sha256(item.compressed),
      bytes: item.runtime.byteLength,
      compressedBytes: item.compressed.byteLength,
      authoring: "talioscrownward-approved-transform-v1",
    };
  });

  for (const item of prepared) await writeAtomic(path.join(objectRoot, item.id, "final.glb.gz"), item.compressed);
  await writeAtomic(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const baseline = JSON.parse(await fs.readFile(baselineFile, "utf8"));
  baseline.objectAssets.manifest = {
    path: "client/public/eqrequiem/objects/manifest.json",
    sha256: sha256(await fs.readFile(manifestFile)),
    bytes: (await fs.stat(manifestFile)).size,
  };
  await writeAtomic(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);

  const report = {
    kind: "eltania.talioscrownward-object-runtime-promotion",
    version: 1,
    zone: "talioscrownward",
    status: "promoted-client-runtime",
    promotedAt: new Date().toISOString(),
    runtimeContract: "babylon-rhs-y-up-v3",
    replacedPrototypeCount: Object.keys(currentPrototypeAssets).length,
    libraryOnlyCount: Object.keys(libraryAssets).length,
    backups: path.relative(repoRoot, backupRoot),
    objects: prepared.map((item) => ({
      id: item.id,
      output: path.relative(repoRoot, path.join(exportRoot, item.output)),
      runtime: `/eqrequiem/objects/${item.id}/final.glb.gz`,
      sourceSha256: sha256(item.source),
      contentSha256: sha256(item.runtime),
      compressedSha256: sha256(item.compressed),
      bytes: item.runtime.byteLength,
      compressedBytes: item.compressed.byteLength,
      placement: Object.hasOwn(currentPrototypeAssets, item.id) ? "existing-talios-prototype" : "library-only",
    })),
  };
  await writeAtomic(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Promoted ${prepared.length} Talios Crownward objects: ${Object.keys(currentPrototypeAssets).length} existing prototype replacements, ${Object.keys(libraryAssets).length} library-only assets.`);
}

promote().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
