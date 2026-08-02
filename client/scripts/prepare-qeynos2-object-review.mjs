#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const zoneFile = path.join(repoRoot, "assets/reference/everquest_rof2/zones/qeynos2.json");
const catalogRoot = path.join(repoRoot, "assets/generated/eq-catalog");
const catalogFile = path.join(catalogRoot, "manifest.json");
const priorPromotionFile = path.join(
  repoRoot,
  "assets/generated/object-replacements/qeynos2-object-pass-01/promotion.json",
);
const manifestRoot = path.join(repoRoot, "assets/src/world/objects/replacements");
const auditFile = path.join(
  repoRoot,
  "assets/generated/object-replacements/qeynos2-object-rest-audit.json",
);
const reviewIndexFile = path.join(
  repoRoot,
  "assets/generated/object-replacements/qeynos2-object-review-index.json",
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (file) => path.relative(repoRoot, file).replaceAll(path.sep, "/");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function pbrFor(id, category = "") {
  if (id.startsWith("rug")) {
    return { normalStrength: 0.8, normalScale: 0.6, roughness: 0.92, roughnessVariation: 0.05 };
  }
  if (id.startsWith("crystal")) {
    return { normalStrength: 0.55, normalScale: 0.45, roughness: 0.34, roughnessVariation: 0.04 };
  }
  if (/lamp|torch|hook|post|pole/.test(id) || category.includes("metal")) {
    return { normalStrength: 1.05, normalScale: 0.65, roughness: 0.7, roughnessVariation: 0.08 };
  }
  if (id.startsWith("tree")) {
    return { normalStrength: 1.2, normalScale: 0.75, roughness: 0.9, roughnessVariation: 0.06 };
  }
  return { normalStrength: 1.1, normalScale: 0.7, roughness: 0.86, roughnessVariation: 0.08 };
}

function evidenceFor(description, final = false) {
  const snapshots = final ? description.finalValidation?.snapshots : description.snapshots;
  return snapshots?.find((item) => item.view === "threeQuarter") ?? snapshots?.[0] ?? null;
}

function targetFacesFor(id) {
  if (id.startsWith("rug")) return 2000;
  if (id.startsWith("tree")) return 12000;
  if (/flag/.test(id)) return 6000;
  if (/torch|lamp|pole|hook|crystal/.test(id)) return 6000;
  if (/bed|bunk|cart/.test(id)) return 12000;
  if (/chair|stool|bench|table|drawer|dresser/.test(id)) return 12000;
  return 8000;
}

function parseGlbJson(bytes, label) {
  const source = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  if (source.length < 20 || source.toString("ascii", 0, 4) !== "glTF") {
    throw new Error(`${label} is not a binary glTF`);
  }
  let offset = 12;
  while (offset + 8 <= source.length) {
    const length = source.readUInt32LE(offset);
    const type = source.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      return JSON.parse(source.subarray(start, start + length).toString("utf8").trim());
    }
    offset = start + length;
  }
  throw new Error(`${label} has no glTF JSON chunk`);
}

async function legacyMotionProfile(description) {
  const sourceFile = description.source?.file;
  if (!sourceFile) throw new Error(`${description.id} has no local RoF2 source file`);
  const json = parseGlbJson(await fs.readFile(sourceFile), sourceFile);
  const animations = json.animations?.length ?? 0;
  const morphTargets = (json.meshes ?? []).reduce(
    (total, mesh) => total + (mesh.primitives ?? []).reduce(
      (primitiveTotal, primitive) => primitiveTotal + (primitive.targets?.length ?? 0),
      0,
    ),
    0,
  );
  return { animations, morphTargets, static: animations === 0 && morphTargets === 0 };
}

function promptFor(id) {
  const label = id
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace("barrelonside", "barrel lying on its side")
    .replace("templelifeb", "tall tapered Temple of Life monument")
    .replace("templelife", "round Temple of Life floor medallion")
    .replace("qeyflag", "Qeynos city flag on a timber pole");
  return `original clean-room low-poly medieval fantasy ${label}, follow only the new game's independent text art bible, invent a distinct coherent silhouette and construction details, retain only the approximate placement envelope and grounded orientation, clean game-ready topology, realistic physically based materials, isolated object, no background`;
}

function batch(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size));
}

async function main() {
  const [zone, catalog, priorPromotion] = await Promise.all([
    readJson(zoneFile),
    readJson(catalogFile),
    readJson(priorPromotionFile),
  ]);
  const catalogById = new Map(
    catalog.assets.filter((asset) => asset.kind === "object").map((asset) => [asset.id, asset]),
  );
  const promoted = new Set(priorPromotion.promoted.map((asset) => asset.id));
  const rows = [];

  for (const [id, placements] of Object.entries(zone.objects)) {
    if (promoted.has(id)) {
      rows.push({ id, placements: placements.length, state: "promoted", passId: "qeynos2-object-pass-01" });
      continue;
    }
    const catalogAsset = catalogById.get(id);
    if (!catalogAsset?.description) {
      rows.push({ id, placements: placements.length, state: "blocked", reason: "catalog description missing" });
      continue;
    }
    const descriptionFile = path.join(catalogRoot, catalogAsset.description);
    const descriptionBytes = await fs.readFile(descriptionFile);
    const description = JSON.parse(descriptionBytes);
    let motion;
    try {
      motion = await legacyMotionProfile(description);
    } catch (error) {
      rows.push({
        id,
        placements: placements.length,
        category: catalogAsset.category,
        state: "blocked",
        reason: `static-object eligibility could not be established: ${error.message}`,
        description: relative(descriptionFile),
        descriptionSha256: sha256(descriptionBytes),
      });
      continue;
    }
    if (!motion.static) {
      rows.push({
        id,
        placements: placements.length,
        category: catalogAsset.category,
        state: "excluded-stateful",
        reason: "Legacy object contains animation or morph state and is outside the static clean-room replacement pass.",
        motion,
        description: relative(descriptionFile),
        descriptionSha256: sha256(descriptionBytes),
      });
      continue;
    }
    const sourceEvidence = evidenceFor(description, false);
    if (!sourceEvidence) {
      rows.push({
        id,
        placements: placements.length,
        category: catalogAsset.category,
        state: "blocked",
        reason: "immutable local RoF2 source snapshot missing",
        description: relative(descriptionFile),
        descriptionSha256: sha256(descriptionBytes),
      });
      continue;
    }
    rows.push({
      id,
      placements: placements.length,
      category: catalogAsset.category,
      state: "first-pass-cleanup-queued",
      description: relative(descriptionFile),
      descriptionSha256: sha256(descriptionBytes),
      sourceEvidence,
      targetFaces: targetFacesFor(id),
      sourcePlanar: description.geometry.size[1] <= Math.max(description.geometry.size[0], description.geometry.size[2]) * 1e-4,
    });
  }

  const queued = rows
    .filter((row) => row.state === "first-pass-cleanup-queued")
    .sort((a, b) => `${a.category}/${a.id}`.localeCompare(`${b.category}/${b.id}`));
  const batches = batch(queued, 4);
  for (let index = 0; index < batches.length; index++) {
    const number = String(index + 1).padStart(2, "0");
    const passId = `qeynos2-object-pass-02-${number}`;
    const manifestFile = path.join(manifestRoot, `qeynos2-pass-02-${number}.json`);
    const manifest = {
      kind: "requiem.object-replacements",
      version: 1,
      passId,
      zone: "qeynos2",
      description: "Automated cleanup and independent material authoring over generated first-pass Qeynos2 static-object meshes. Animated and stateful objects are ineligible.",
      generationPolicy: {
        requiredCandidateKind: "generated-first-pass-clean",
        source: "generated-shape-glb-automated-cleanup",
        legacyImageConditioning: false,
        fallbackCandidateKinds: [],
        designMode: "clean-room-generated-first-pass-refinement",
        excludes: ["animated", "morph-targeted", "stateful"],
      },
      firstPassCleanup: {
        automatic: true,
        sourcePolicy: "generated-shape-plus-numeric-placement-envelope-no-rof2-geometry-pixels-uvs-or-textures",
        meshAuthor: "assets/pipeline/author_clean_first_pass_object.py",
        integrityValidator: "assets/pipeline/validate_stablegen_object.py",
        materialPolicy: "independent-deterministic-procedural-v1",
        pbrCompletion: "derived-normal-and-metallic-roughness-v1",
        imageValidation: "client/scripts/render-glb-reference.mjs",
      },
      assets: batches[index].map((row) => ({
        id: row.id,
        candidate: {
          kind: "generated-first-pass-clean",
          file: `assets/src/world/objects/replacements/first-pass-clean/${row.id}/final.glb`,
        },
        pbr: pbrFor(row.id, row.category),
        validation: {
          maximumTriangles: row.targetFaces,
          maximumShapeLogError: row.sourcePlanar ? 0.47 : 0.3,
        },
        review: {
          decision: "pending",
          reason: "Generated first-pass candidate requires automated mesh cleanup, new UV/material authoring, checksum pinning, validation, and owner image approval.",
          evidence: [
            { file: `assets/generated/eq-catalog/${row.sourceEvidence.file}`, sha256: row.sourceEvidence.sha256 },
            {
              file: `assets/generated/object-replacements/${passId}/first-pass-clean-image-validation.png`,
              sha256: "GENERATED_BY_FIRST_PASS_CLEANUP",
            },
          ],
        },
      })),
    };
    await writeJson(manifestFile, manifest);
    for (const row of batches[index]) {
      row.passId = passId;
      row.manifest = relative(manifestFile);
    }
  }

  const audit = {
    kind: "requiem.qeynos2-object-replacement-audit",
    version: 1,
    zone: "qeynos2",
    source: relative(zoneFile),
    catalog: relative(catalogFile),
    counts: {
      prototypes: rows.length,
      placements: rows.reduce((total, row) => total + row.placements, 0),
      promoted: rows.filter((row) => row.state === "promoted").length,
      firstPassCleanupQueued: queued.length,
      excludedStateful: rows.filter((row) => row.state === "excluded-stateful").length,
      blocked: rows.filter((row) => row.state === "blocked").length,
      reviewBatches: batches.length,
    },
    blocked: rows.filter((row) => row.state === "blocked"),
    excludedStateful: rows.filter((row) => row.state === "excluded-stateful"),
    batches: batches.map((items, index) => ({
      passId: `qeynos2-object-pass-02-${String(index + 1).padStart(2, "0")}`,
      ids: items.map((item) => item.id),
    })),
    policy: {
      requiredCandidateKind: "generated-first-pass-clean",
      rejectedCandidateKind: "catalog-final",
      designMode: "clean-room-generated-first-pass-refinement",
      excludes: ["animated", "morph-targeted", "stateful"],
      note: "The four pass-01 payloads remain promoted by explicit owner approval. Unpromoted static prototypes use generated first-pass shapes, numeric placement envelopes, automated cleanup, independent materials, and owner image review.",
    },
    objects: rows.map(({ sourceEvidence, ...row }) => row),
    generatedAt: new Date().toISOString(),
  };
  await writeJson(auditFile, audit);
  await writeJson(reviewIndexFile, {
    kind: "requiem.qeynos2-object-review-index",
    version: 1,
    state: "first-pass-cleanup-required",
    audit: relative(auditFile),
    policy: audit.policy,
    counts: audit.counts,
    batches: audit.batches.map((item, index) => ({
      ...item,
      manifest: `assets/src/world/objects/replacements/qeynos2-pass-02-${String(index + 1).padStart(2, "0")}.json`,
      nextCommand: "node client/scripts/clean-qeynos2-first-pass-objects.mjs",
    })),
    supersededArtifacts: "Prior catalog-final review sheets are retained only as rejection evidence and are not promotion-eligible.",
    generatedAt: new Date().toISOString(),
  });
  console.log(JSON.stringify({ audit: relative(auditFile), counts: audit.counts, blocked: audit.blocked }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
