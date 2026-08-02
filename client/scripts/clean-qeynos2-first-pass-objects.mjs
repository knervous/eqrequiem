#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  addPbrChannels,
  geometrySummary,
} from "./object-replacement-pipeline.mjs";
import {
  parseGlb,
  serializeGlb,
} from "./material-ai/glb-material-palette.mjs";
import { renderGlbReferenceSheet } from "./render-glb-reference.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const replacementRoot = path.join(
  repoRoot,
  "assets/src/world/objects/replacements/first-pass-clean",
);
const generatedRoot = path.join(repoRoot, "assets/generated/object-replacements");
const blender = "/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender";
const authorScript = path.join(repoRoot, "assets/pipeline/author_clean_first_pass_object.py");
const validatorScript = path.join(repoRoot, "assets/pipeline/validate_stablegen_object.py");
const execFileAsync = promisify(execFile);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repoPath = (file) => path.relative(repoRoot, file).replaceAll(path.sep, "/");

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArguments(argv) {
  const options = { only: null, skipRender: false, resume: false };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--only") {
      options.only = new Set(argv[++index].split(",").filter(Boolean));
    } else if (argv[index] === "--skip-render") {
      options.skipRender = true;
    } else if (argv[index] === "--resume") {
      options.resume = true;
    } else {
      throw new Error(`Unknown option: ${argv[index]}`);
    }
  }
  return options;
}

function integrityProfile(id) {
  if (id.startsWith("rug")) return "planar";
  if (/(pole|post)/.test(id)) return "slender";
  if (/(barrel|bed|bunk|chair|stool|table|bench|drawer|dresser)/.test(id)) {
    return "beveled-furniture";
  }
  return "general";
}

function targetTriangles(id) {
  if (id.startsWith("rug")) return 2_000;
  if (id.startsWith("tree")) return 12_000;
  if (/(lamp|torch|pole|hook|post|crystal|urn)/.test(id)) return 6_000;
  if (/(bed|bunk|cart|chair|stool|table|bench|drawer|dresser)/.test(id)) {
    return 12_000;
  }
  return 8_000;
}

async function atomicWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

async function runBlender(arguments_) {
  return execFileAsync(blender, ["--background", ...arguments_], {
    cwd: repoRoot,
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function loadPasses() {
  const directory = path.join(repoRoot, "assets/src/world/objects/replacements");
  const names = (await fs.readdir(directory))
    .filter((name) => /^qeynos2-pass-02-\d\d\.json$/.test(name))
    .sort();
  ensure(names.length === 11, `Expected 11 Qeynos2 passes, found ${names.length}`);
  return Promise.all(names.map(async (name) => {
    const file = path.join(directory, name);
    const manifest = JSON.parse(await fs.readFile(file, "utf8"));
    return { file, manifest };
  }));
}

async function cleanAsset(pass, asset, resume = false) {
  const id = asset.id;
  // The one-time catalog pass used very small runtime ceilings intended for
  // already-authored low-poly originals. Reusing those here crushes dense
  // generated geometry, so this cleanup contract owns its family budgets.
  const target = targetTriangles(id);
  const source = path.join(repoRoot, `assets/generated/eq-catalog/objects/${id}/shape.glb`);
  const outputDirectory = path.join(replacementRoot, id);
  const output = path.join(outputDirectory, "final.glb");
  const cleanupReportFile = path.join(outputDirectory, "cleanup.json");
  const integrityReportFile = path.join(outputDirectory, "integrity.json");
  const description = JSON.parse(await fs.readFile(
    path.join(repoRoot, `assets/generated/eq-catalog/objects/${id}/description.json`),
    "utf8",
  ));
  ensure(description.id === id && Array.isArray(description.geometry?.size),
    `${id} has no numeric placement envelope`);
  await fs.access(source);
  await fs.mkdir(outputDirectory, { recursive: true });

  const profile = integrityProfile(id);
  if (resume) {
    try {
      const [cleanup, integrity, sourceBytes, outputBytes] = await Promise.all([
        fs.readFile(cleanupReportFile, "utf8").then(JSON.parse),
        fs.readFile(integrityReportFile, "utf8").then(JSON.parse),
        fs.readFile(source),
        fs.readFile(output),
      ]);
      const summary = geometrySummary(parseGlb(outputBytes));
      const reusable = cleanup.passed && integrity.passed &&
        cleanup.version === 2 && cleanup.targetTriangles === target &&
        integrity.profile === profile && cleanup.placementNormalization &&
        cleanup.sourcePolicy === "generated-shape-plus-numeric-placement-envelope-no-rof2-geometry-pixels-uvs-or-textures" &&
        summary.everyPrimitiveTextured && summary.everyPrimitiveNormalMapped &&
        summary.everyPrimitiveMetallicRoughnessMapped &&
        summary.size.every((value) => Number.isFinite(value) && value > 0);
      if (reusable) {
        process.stdout.write(`[first-pass-clean] ${id} reused validated output\n`);
        return {
          id, source, output, cleanup, integrity, profile,
          sourceSha256: sha256(sourceBytes),
          sha256: sha256(outputBytes),
        };
      }
    } catch {
      // Missing, stale, or malformed evidence is rebuilt below.
    }
  }

  await runBlender([
    "--python", authorScript, "--",
    source, output, id, String(target), cleanupReportFile,
    JSON.stringify(description.geometry.size),
  ]);
  const cleanup = JSON.parse(await fs.readFile(cleanupReportFile, "utf8"));
  ensure(cleanup.passed, `${id} cleanup did not pass`);
  ensure(
    cleanup.sourcePolicy === "generated-shape-plus-numeric-placement-envelope-no-rof2-geometry-pixels-uvs-or-textures",
    `${id} source isolation policy changed`,
  );

  const baseDocument = parseGlb(await fs.readFile(output));
  const completed = await addPbrChannels(baseDocument, asset.pbr);
  await atomicWrite(output, serializeGlb(completed));

  await runBlender([
    "--python", validatorScript, "--", output, integrityReportFile, profile,
  ]);
  const integrity = JSON.parse(await fs.readFile(integrityReportFile, "utf8"));
  ensure(integrity.passed, `${id} failed Blender integrity validation`);

  const sourceBytes = await fs.readFile(source);
  const outputBytes = await fs.readFile(output);
  return {
    id,
    source,
    output,
    sourceSha256: sha256(sourceBytes),
    sha256: sha256(outputBytes),
    cleanup,
    integrity,
    profile,
  };
}

async function renderPassSheet(pass, results) {
  const passRoot = path.join(generatedRoot, pass.manifest.passId);
  const output = path.join(passRoot, "first-pass-clean-image-validation.png");
  await renderGlbReferenceSheet({
    glbs: results.map((result) => ({
      label: `${result.id} — automated first-pass cleanup`,
      path: result.output,
    })),
    output,
    width: 1800,
    height: 1200,
    // A high three-quarter audit reveals planar surfaces, depth collapse, and
    // detached geometry that a straight-on sheet can conceal.
    frontAxis: "-xz-high",
  });
  return { file: output, sha256: sha256(await fs.readFile(output)) };
}

function updateManifest(pass, results, sheet) {
  const byId = new Map(results.map((result) => [result.id, result]));
  pass.manifest.description =
    "Automated cleanup and material-authoring pass over the generated first-pass Qeynos2 static-object meshes. No RoF2 mesh, UV, or texture is used by cleanup or material generation.";
  pass.manifest.generationPolicy = {
    requiredCandidateKind: "generated-first-pass-clean",
    source: "generated-shape-glb-automated-cleanup",
    legacyImageConditioning: false,
    fallbackCandidateKinds: [],
    designMode: "clean-room-generated-first-pass-refinement",
    excludes: ["animated", "morph-targeted", "stateful"],
  };
  pass.manifest.firstPassCleanup = {
    automatic: true,
    sourcePolicy: "generated-shape-plus-numeric-placement-envelope-no-rof2-geometry-pixels-uvs-or-textures",
    meshAuthor: "assets/pipeline/author_clean_first_pass_object.py",
    integrityValidator: "assets/pipeline/validate_stablegen_object.py",
    materialPolicy: "independent-deterministic-procedural-v1",
    pbrCompletion: "derived-normal-and-metallic-roughness-v1",
    imageValidation: "client/scripts/render-glb-reference.mjs",
  };
  delete pass.manifest.stablegen;

  for (const asset of pass.manifest.assets) {
    const result = byId.get(asset.id);
    if (!result) continue;
    asset.candidate = {
      kind: "generated-first-pass-clean",
      file: repoPath(result.output),
      sha256: result.sha256,
      source: {
        file: repoPath(result.source),
        sha256: result.sourceSha256,
      },
      automation: {
        cleanupMode: result.cleanup.cleanupMode,
        integrityProfile: result.profile,
        triangles: result.cleanup.triangles,
        materialFamily: result.cleanup.family,
        placementNormalization: result.cleanup.placementNormalization,
      },
    };
    asset.validation.maximumTriangles = result.cleanup.targetTriangles;
    asset.review = {
      decision: "pending",
      reason: "Generated first-pass mesh was cleaned, UV-authored, materially rebuilt, PBR-completed, integrity-validated, and rendered automatically. Owner image approval is required before promotion.",
      evidence: [
        asset.review.evidence[0],
        { file: repoPath(sheet.file), sha256: sheet.sha256 },
      ],
    };
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await Promise.all([fs.access(blender), fs.access(authorScript), fs.access(validatorScript)]);
  const passes = await loadPasses();
  const inventory = passes.flatMap((pass) =>
    pass.manifest.assets.map((asset) => ({ pass, asset })),
  );
  ensure(new Set(inventory.map(({ asset }) => asset.id)).size === inventory.length,
    "Qeynos2 pass inventory contains duplicate IDs");
  ensure(inventory.length === 41, `Expected 41 static objects, found ${inventory.length}`);

  const batchReport = [];
  for (const pass of passes) {
    const selected = pass.manifest.assets.filter((asset) =>
      !options.only || options.only.has(asset.id));
    if (!selected.length) continue;
    const results = [];
    for (const asset of selected) {
      process.stdout.write(`[first-pass-clean] ${asset.id}\n`);
      results.push(await cleanAsset(pass, asset, options.resume));
    }
    const sheet = options.skipRender
      ? null
      : await renderPassSheet(pass, results);
    if (!options.only && sheet) {
      updateManifest(pass, results, sheet);
      await atomicWrite(pass.file, `${JSON.stringify(pass.manifest, null, 2)}\n`);
    }
    batchReport.push({
      passId: pass.manifest.passId,
      sheet: sheet && repoPath(sheet.file),
      assets: results.map((result) => ({
        id: result.id,
        output: repoPath(result.output),
        sha256: result.sha256,
        cleanupMode: result.cleanup.cleanupMode,
        triangles: result.cleanup.triangles,
        integrityProfile: result.profile,
        placementNormalization: result.cleanup.placementNormalization,
      })),
    });
  }

  if (options.only) {
    ensure(options.only.size === batchReport.flatMap((batch) => batch.assets).length,
      "At least one --only ID was not found");
  }
  const report = {
    kind: "requiem.qeynos2-generated-first-pass-cleanup",
    version: 1,
    automatic: true,
    sourcePolicy: "generated-shape-plus-numeric-placement-envelope-no-rof2-geometry-pixels-uvs-or-textures",
    selected: batchReport.reduce((sum, batch) => sum + batch.assets.length, 0),
    completeInventory: !options.only,
    pendingOwnerPromotionApproval: !options.only,
    batches: batchReport,
    generatedAt: new Date().toISOString(),
  };
  const reportFile = path.join(generatedRoot, "qeynos2-first-pass-cleanup-report.json");
  await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: repoPath(reportFile), selected: report.selected }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
