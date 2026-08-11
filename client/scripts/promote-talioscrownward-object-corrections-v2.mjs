#!/usr/bin/env node

/** Promote the owner-approved Talios construction-correction v2 candidates. */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { preprocessZoneObjectGlb } from "./promote-zone-object-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const exportRoot = path.join(repoRoot, "assets/src/world/objects/talioscrownward/exports");
const objectRoot = path.join(repoRoot, "client/public/eqrequiem/objects");
const manifestFile = path.join(objectRoot, "manifest.json");
const baselineFile = path.join(repoRoot, "client/public/eqrequiem/worlds/legacy-baseline.manifest.json");
const promotionId = "talioscrownward-object-correction-promotion-v2";
const backupRoot = path.join(repoRoot, "assets/generated/object-replacements", promotionId, "backup");
const reportFile = path.join(repoRoot, "assets/src/world/objects/talioscrownward", `${promotionId}.json`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const corrections = {
  chair: "talios-crownward-harbor-side-chair-v2.glb",
  chair2: "talios-crownward-crownward-highback-v2.glb",
  chair2d: "talios-crownward-archive-armchair-v2.glb",
  chair3: "talios-crownward-dock-stool-v2.glb",
  barstool2: "talios-crownward-tavern-barstool-v2.glb",
  roundtable: "talios-crownward-guild-round-table-v2.glb",
  roundtabled: "talios-crownward-archive-round-table-v2.glb",
  squaretable: "talios-crownward-crownward-square-table-v2.glb",
  bed2: "talios-crownward-archive-bed-v2.glb",
  bunk1: "talios-crownward-harbor-bunk-v2.glb",
  bed4: "talios-crownward-saltwright-bed-v2.glb",
  bed3: "talios-crownward-watch-bed-v2.glb",
  rug4: "talios-crownward-civic-rug-four-v2.glb",
  torchpoint: "talios-crownward-wall-torch-v2.glb",
  hlamp: "talios-crownward-harbor-lamp-v2.glb",
  torch2: "talios-crownward-gate-torch-v2.glb",
  templelife: "talios-crownward-reliquary-life-v2.glb",
  templelifeb: "talios-crownward-reliquary-life-b-v2.glb",
  crystal3: "talios-crownward-crownward-crystal-v2.glb",
};
const libraryOnlyIds = new Set(["templelife", "templelifeb"]);

function glbDocument(bytes, label) {
  if (bytes.byteLength < 20 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.byteLength) throw new Error(`${label} is not a valid GLB`);
  let offset = 12;
  let document;
  while (offset < bytes.byteLength) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.byteLength) throw new Error(`${label} has a truncated chunk`);
    if (type === 0x4e4f534a) document = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString("utf8").trimEnd());
    offset += 8 + length;
  }
  if (!document?.scenes?.length) throw new Error(`${label} has no scene`);
  return document;
}

function validate(bytes, id) {
  const document = glbDocument(bytes, id);
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(primitive.indices)) throw new Error(`${id} has non-indexed triangle geometry`);
    for (const semantic of ["POSITION", "NORMAL", "TEXCOORD_0"]) if (!Number.isInteger(primitive.attributes?.[semantic])) throw new Error(`${id} is missing ${semantic}`);
    const material = document.materials?.[primitive.material];
    if (!material?.pbrMetallicRoughness?.baseColorTexture || !material.pbrMetallicRoughness.metallicRoughnessTexture || !material.normalTexture) throw new Error(`${id} has an incomplete PBR binding`);
  }
}

async function exists(file) { return fs.access(file).then(() => true).catch(() => false); }
async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, data);
  await fs.rename(temporary, file);
}
async function backup(file, relative) {
  if (!(await exists(file))) return;
  const target = path.join(backupRoot, relative);
  if (await exists(target)) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(file, target);
}

async function promote() {
  if (Object.keys(corrections).length !== 19) throw new Error("Expected exactly 19 Talios v2 corrections");
  const prepared = [];
  for (const [id, filename] of Object.entries(corrections).sort(([a], [b]) => a.localeCompare(b))) {
    const source = await fs.readFile(path.join(exportRoot, filename));
    validate(source, id);
    const runtime = preprocessZoneObjectGlb(source, id);
    validate(runtime, `${id} runtime`);
    prepared.push({ id, filename, source, runtime, compressed: gzipSync(runtime, { level: 9 }) });
  }
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  const manifestIds = new Set(manifest.objects.map((item) => item.id));
  const missing = Object.keys(corrections).filter((id) => !libraryOnlyIds.has(id) && !manifestIds.has(id));
  if (missing.length) throw new Error(`Runtime manifest is missing: ${missing.join(", ")}`);

  await backup(manifestFile, "objects/manifest.json");
  await backup(baselineFile, "worlds/legacy-baseline.manifest.json");
  for (const item of prepared) await backup(path.join(objectRoot, item.id, "final.glb.gz"), path.join("objects", item.id, "final.glb.gz"));

  const byId = new Map(prepared.map((item) => [item.id, item]));
  manifest.objects = manifest.objects.map((item) => {
    const replacement = byId.get(item.id);
    if (!replacement) return item;
    return {
      ...item,
      source: `/eqrequiem/objects/${replacement.id}/final.glb.gz`,
      sourceSha256: sha256(replacement.source),
      contentSha256: sha256(replacement.runtime),
      compressedSha256: sha256(replacement.compressed),
      bytes: replacement.runtime.byteLength,
      compressedBytes: replacement.compressed.byteLength,
      authoring: "talioscrownward-construction-correction-v2",
    };
  });
  for (const item of prepared) await writeAtomic(path.join(objectRoot, item.id, "final.glb.gz"), item.compressed);
  await writeAtomic(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const baseline = JSON.parse(await fs.readFile(baselineFile, "utf8"));
  const manifestBytes = await fs.readFile(manifestFile);
  baseline.objectAssets.manifest = { path: "client/public/eqrequiem/objects/manifest.json", sha256: sha256(manifestBytes), bytes: manifestBytes.byteLength };
  await writeAtomic(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);

  const report = {
    kind: "eltania.talioscrownward-object-correction-promotion",
    version: 2,
    zone: "talioscrownward",
    status: "promoted-client-runtime",
    promotedAt: new Date().toISOString(),
    sourceAudit: "assets/src/world/objects/talioscrownward/talioscrownward-object-sanity-audit-v2.json",
    backups: path.relative(repoRoot, backupRoot),
    objects: prepared.map((item) => ({ id: item.id, output: path.relative(repoRoot, path.join(exportRoot, item.filename)), runtime: `/eqrequiem/objects/${item.id}/final.glb.gz`, sourceSha256: sha256(item.source), contentSha256: sha256(item.runtime), compressedSha256: sha256(item.compressed), bytes: item.runtime.byteLength, compressedBytes: item.compressed.byteLength, placement: libraryOnlyIds.has(item.id) ? "library-only-stateful" : "existing-talios-prototype" })),
  };
  await writeAtomic(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Promoted ${prepared.length} Talios Crownward v2 construction corrections.`);
}

promote().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
