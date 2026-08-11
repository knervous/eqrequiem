#!/usr/bin/env node

/** Promote only the supported-bough Talios stone pine sanity revision. */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { preprocessZoneObjectGlb } from "./promote-zone-object-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const id = "tree1";
const sourceFile = path.join(root, "assets/src/world/objects/talioscrownward/exports/talios-crownward-stonepine-v1.glb");
const objectRoot = path.join(root, "client/public/eqrequiem/objects");
const runtimeFile = path.join(objectRoot, id, "final.glb.gz");
const manifestFile = path.join(objectRoot, "manifest.json");
const baselineFile = path.join(root, "client/public/eqrequiem/worlds/legacy-baseline.manifest.json");
const backupRoot = path.join(root, "assets/generated/object-replacements/talios-tree-texture-v2/backup/talios-pine-sanity-v3/runtime");
const reportFile = path.join(root, "assets/src/world/objects/talioscrownward/talios-pine-sanity-promotion-v3.json");

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

function validate(bytes, label, runtime = false) {
  const document = parseGlb(bytes, label);
  const primitives = (document.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (primitives.length !== 2) throw new Error(`${label} requires exactly two primitives`);
  for (const primitive of primitives) {
    if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(primitive.indices)) throw new Error(`${label} has invalid triangle geometry`);
    for (const attribute of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
      if (!Number.isInteger(primitive.attributes?.[attribute])) throw new Error(`${label} lacks ${attribute}`);
    }
    const pbr = document.materials?.[primitive.material]?.pbrMetallicRoughness;
    if (!pbr?.baseColorTexture || !pbr.metallicRoughnessTexture || !document.materials[primitive.material].normalTexture) {
      throw new Error(`${label} lacks complete PBR textures`);
    }
  }
  if ((document.images ?? []).length !== 6) throw new Error(`${label} must embed six texture maps`);
  if (runtime && document.asset?.extras?.requiemRuntimeContract !== "babylon-rhs-y-up-v3") {
    throw new Error(`${label} lacks the Babylon runtime contract`);
  }
}

async function writeAtomic(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

async function backup(file, relative) {
  const destination = path.join(backupRoot, relative);
  try {
    await fs.access(destination);
  } catch {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(file, destination);
  }
}

async function main() {
  const source = await fs.readFile(sourceFile);
  validate(source, "Talios stone pine source");
  const runtime = preprocessZoneObjectGlb(source, id);
  validate(runtime, "Talios stone pine runtime", true);
  const compressed = gzipSync(runtime, { level: 9 });
  if (!gunzipSync(compressed).equals(runtime)) throw new Error("Talios stone pine gzip round trip failed");

  const beforeManifestBytes = await fs.readFile(manifestFile);
  const manifest = JSON.parse(beforeManifestBytes);
  const beforeObjects = new Map(manifest.objects.map((object) => [object.id, object]));
  if (!beforeObjects.has(id)) throw new Error("tree1 is missing from the object manifest");

  await backup(manifestFile, "objects/manifest.json");
  await backup(baselineFile, "worlds/legacy-baseline.manifest.json");
  await backup(runtimeFile, "objects/tree1/final.glb.gz");

  manifest.objects = manifest.objects.map((object) => object.id === id ? {
    ...object,
    source: "/eqrequiem/objects/tree1/final.glb.gz",
    sourceSha256: sha256(source),
    contentSha256: sha256(runtime),
    compressedSha256: sha256(compressed),
    bytes: runtime.byteLength,
    compressedBytes: compressed.byteLength,
    authoring: "talios-pine-supported-boughs-v3",
  } : object);
  manifest.objects.sort((a, b) => a.id.localeCompare(b.id));

  const changedManifestIds = manifest.objects
    .filter((object) => JSON.stringify(object) !== JSON.stringify(beforeObjects.get(object.id)))
    .map((object) => object.id);
  if (changedManifestIds.length !== 1 || changedManifestIds[0] !== id) {
    throw new Error(`Unexpected manifest scope: ${changedManifestIds.join(", ")}`);
  }

  await writeAtomic(runtimeFile, compressed);
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
    kind: "eltania.talios-pine-sanity-runtime-promotion",
    version: 3,
    zone: "talioscrownward",
    status: "promoted-client-runtime",
    promotedAt: new Date().toISOString(),
    scope: [id],
    changedManifestIds,
    untouchedManifestObjects: manifest.objects.length - 1,
    runtimeContract: "babylon-rhs-y-up-v3",
    authoring: "talios-pine-supported-boughs-v3",
    backups: path.relative(root, backupRoot),
    object: {
      id,
      source: path.relative(root, sourceFile),
      runtime: "/eqrequiem/objects/tree1/final.glb.gz",
      previousManifestRecord: beforeObjects.get(id),
      sourceSha256: sha256(source),
      contentSha256: sha256(runtime),
      compressedSha256: sha256(compressed),
      bytes: runtime.byteLength,
      compressedBytes: compressed.byteLength,
    },
    manifest: { path: path.relative(root, manifestFile), sha256: sha256(manifestBytes), bytes: manifestBytes.byteLength },
  };
  await writeAtomic(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Promoted Talios tree1 only; ${report.untouchedManifestObjects} catalog records were untouched.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
