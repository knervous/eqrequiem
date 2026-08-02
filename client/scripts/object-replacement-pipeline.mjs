#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import sharp from "sharp";
import {
  appendMaterialChannels,
  baseColorBindings,
  embeddedImage,
  parseGlb,
  serializeGlb,
} from "./material-ai/glb-material-palette.mjs";
import { derivePbrChannels } from "./material-ai/zone-material-pipeline.mjs";
import { preprocessZoneObjectGlb } from "./promote-zone-object-assets.mjs";
import { renderGlbReferenceSheet } from "./render-glb-reference.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const defaultManifest = path.join(
  repoRoot,
  "assets/src/world/objects/replacements/qeynos2-pass-01.json",
);
const catalogFile = path.join(
  repoRoot,
  "assets/generated/eq-catalog/manifest.json",
);
const runtimeRoot = path.join(
  repoRoot,
  "client/public/eqrequiem/objects",
);
const runtimeManifestFile = path.join(runtimeRoot, "manifest.json");
const baselineFile = path.join(
  repoRoot,
  "client/public/eqrequiem/worlds/legacy-baseline.manifest.json",
);

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const execFileAsync = promisify(execFile);

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArguments(argv) {
  const options = { command: "validate", manifest: defaultManifest };
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const name = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) options[name] = true;
    else {
      options[name] = value;
      index++;
    }
  }
  options.command = positional[0] ?? options.command;
  options.manifest = path.resolve(options.manifest);
  return options;
}

function relativeToRepo(file) {
  const relative = path.relative(repoRoot, file).replaceAll(path.sep, "/");
  ensure(relative && !relative.startsWith("../"), `${file} is outside the repository`);
  return relative;
}

function resolveRepoFile(file, label) {
  ensure(typeof file === "string" && file.length, `${label} is missing`);
  const resolved = path.resolve(repoRoot, file);
  relativeToRepo(resolved);
  return resolved;
}

async function atomicWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

async function readReplacementManifest(file) {
  const bytes = await fs.readFile(file);
  const manifest = JSON.parse(bytes);
  ensure(
    manifest.kind === "requiem.object-replacements" && manifest.version === 1,
    "Replacement manifest contract changed",
  );
  ensure(/^[a-z0-9][a-z0-9-]*$/.test(manifest.passId), "Invalid passId");
  ensure(Array.isArray(manifest.assets) && manifest.assets.length, "No replacement assets");
  ensure(
    new Set(manifest.assets.map((asset) => asset.id)).size === manifest.assets.length,
    "Replacement asset IDs must be unique",
  );
  return { manifest, bytes };
}

async function readCatalog() {
  const bytes = await fs.readFile(catalogFile);
  const catalog = JSON.parse(bytes);
  return {
    bytes,
    assets: new Map(
      catalog.assets
        .filter((asset) => asset.kind === "object")
        .map((asset) => [asset.id, asset]),
    ),
  };
}

function geometrySummary(document) {
  const { json } = document;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  let triangleCount = 0;
  let vertexCount = 0;
  let primitiveCount = 0;
  let texturedPrimitives = 0;
  let normalMappedPrimitives = 0;
  let metallicRoughnessMappedPrimitives = 0;
  let indexedTriangles = true;
  let finiteGeometry = true;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount++;
      const position = json.accessors?.[primitive.attributes?.POSITION];
      const indices = json.accessors?.[primitive.indices];
      if (
        (primitive.mode ?? 4) !== 4 ||
        !indices ||
        indices.type !== "SCALAR" ||
        indices.count % 3 !== 0
      ) indexedTriangles = false;
      else triangleCount += indices.count / 3;
      if (!position || position.type !== "VEC3" || !position.count) {
        finiteGeometry = false;
        continue;
      }
      vertexCount += position.count;
      for (let axis = 0; axis < 3; axis++) {
        const low = position.min?.[axis];
        const high = position.max?.[axis];
        if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) {
          finiteGeometry = false;
          continue;
        }
        minimum[axis] = Math.min(minimum[axis], low);
        maximum[axis] = Math.max(maximum[axis], high);
      }
      const material = json.materials?.[primitive.material];
      if (material?.pbrMetallicRoughness?.baseColorTexture) texturedPrimitives++;
      if (material?.normalTexture) normalMappedPrimitives++;
      if (material?.pbrMetallicRoughness?.metallicRoughnessTexture) {
        metallicRoughnessMappedPrimitives++;
      }
    }
  }
  if (!primitiveCount || minimum.some((value) => !Number.isFinite(value))) {
    finiteGeometry = false;
  }
  const size = finiteGeometry
    ? maximum.map((value, axis) => value - minimum[axis])
    : [0, 0, 0];
  return {
    bounds: { min: minimum, max: maximum },
    size,
    meshCount: json.meshes?.length ?? 0,
    primitiveCount,
    vertexCount,
    triangleCount,
    materialCount: json.materials?.length ?? 0,
    imageCount: json.images?.length ?? 0,
    textureCount: json.textures?.length ?? 0,
    indexedTriangles,
    finiteGeometry,
    everyPrimitiveTextured: texturedPrimitives === primitiveCount,
    everyPrimitiveNormalMapped: normalMappedPrimitives === primitiveCount,
    everyPrimitiveMetallicRoughnessMapped:
      metallicRoughnessMappedPrimitives === primitiveCount,
  };
}

function shapeProfile(size) {
  ensure(size.every((value) => Number.isFinite(value) && value > 0), "Invalid bounds size");
  return [size[0] / size[1], size[2] / size[1]];
}

function shapeProfileCheck(sourceSize, candidateSize, maximumLogError = 0.47) {
  const sourcePlanar = sourceSize[1] <= Math.max(sourceSize[0], sourceSize[2]) * 1e-4;
  if (sourcePlanar) {
    ensure(
      sourceSize[0] > 0 && sourceSize[2] > 0 && candidateSize.every((value) => Number.isFinite(value) && value > 0),
      "Invalid planar bounds size",
    );
    const sourceAspect = sourceSize[0] / sourceSize[2];
    const candidateAspect = candidateSize[0] / candidateSize[2];
    const aspectLogError = Math.abs(Math.log(candidateAspect / sourceAspect));
    const thicknessRatio = candidateSize[1] / Math.max(candidateSize[0], candidateSize[2]);
    return {
      passed: aspectLogError <= maximumLogError && thicknessRatio <= 0.08,
      planar: true,
      source: [sourceAspect, 0],
      candidate: [candidateAspect, thicknessRatio],
      logErrors: [aspectLogError, thicknessRatio],
      maximumLogError,
      maximumThicknessRatio: 0.08,
    };
  }
  const source = shapeProfile(sourceSize);
  const candidate = shapeProfile(candidateSize);
  const errors = source.map((value, index) =>
    Math.abs(Math.log(candidate[index] / value)));
  return {
    passed: Math.max(...errors) <= maximumLogError,
    source,
    candidate,
    logErrors: errors,
    maximumLogError,
  };
}

function addLegacyFitRoot(document, id, sourceBounds, candidateBounds) {
  const json = structuredClone(document.json);
  json.nodes ??= [];
  const sourceSize = sourceBounds.max.map((value, axis) => value - sourceBounds.min[axis]);
  const candidateSize = candidateBounds.max.map(
    (value, axis) => value - candidateBounds.min[axis],
  );
  const sourcePlanar = sourceSize[1] <= Math.max(sourceSize[0], sourceSize[2]) * 1e-4;
  const scale = sourcePlanar
    ? Math.sqrt((sourceSize[0] * sourceSize[2]) / (candidateSize[0] * candidateSize[2]))
    : sourceSize[1] / candidateSize[1];
  ensure(Number.isFinite(scale) && scale > 0, `${id} cannot be fit to legacy height`);
  const sourceCenter = sourceBounds.min.map(
    (value, axis) => (value + sourceBounds.max[axis]) / 2,
  );
  const candidateCenter = candidateBounds.min.map(
    (value, axis) => (value + candidateBounds.max[axis]) / 2,
  );
  const translation = [
    sourceCenter[0] - candidateCenter[0] * scale,
    sourceBounds.min[1] - candidateBounds.min[1] * scale,
    sourceCenter[2] - candidateCenter[2] * scale,
  ];
  let wrappedScenes = 0;
  for (const scene of json.scenes ?? []) {
    const children = [...(scene.nodes ?? [])];
    if (!children.length) continue;
    const wrapper = json.nodes.length;
    json.nodes.push({
      name: `REQUiem_${id}_legacy_fit`,
      children,
      translation,
      scale: [scale, scale, scale],
      extras: {
        requiemObjectFit: "legacy-y-height-grounded-v1",
        sourceBounds,
        candidateBounds,
      },
    });
    scene.nodes = [wrapper];
    wrappedScenes++;
  }
  ensure(wrappedScenes > 0, `${id} has no populated scene roots`);
  return { document: { json, binary: document.binary }, scale, translation };
}

function addPlacementEnvelopeCalibration(
  document,
  id,
  sourceSize,
  candidateBounds,
  maximumLogError,
) {
  const json = structuredClone(document.json);
  json.nodes ??= [];
  const candidateSize = candidateBounds.max.map(
    (value, axis) => value - candidateBounds.min[axis],
  );
  const sourceProfile = shapeProfile(sourceSize);
  const candidateProfile = shapeProfile(candidateSize);
  const scale = [1, 1, 1];
  const targetError = maximumLogError * 0.8;
  for (const [profileIndex, axis] of [[0, 0], [1, 2]]) {
    const signedError = Math.log(candidateProfile[profileIndex] / sourceProfile[profileIndex]);
    if (Math.abs(signedError) <= maximumLogError) continue;
    const desiredError = Math.sign(signedError) * targetError;
    scale[axis] = Math.exp(desiredError - signedError);
  }
  const changed = scale.some((value) => Math.abs(value - 1) > 1e-8);
  if (changed) {
    ensure(
      scale.every((value) => value >= 2 / 3 && value <= 1.5),
      `${id} requires excessive placement-envelope calibration`,
    );
    const center = candidateBounds.min.map(
      (value, axis) => (value + candidateBounds.max[axis]) / 2,
    );
    let wrappedScenes = 0;
    for (const scene of json.scenes ?? []) {
      const children = [...(scene.nodes ?? [])];
      if (!children.length) continue;
      const wrapper = json.nodes.length;
      json.nodes.push({
        name: `REQUiem_${id}_placement_envelope`,
        children,
        translation: center.map((value, axis) => value * (1 - scale[axis])),
        scale,
        extras: {
          requiemPlacementEnvelope: "bounded-thematic-fit-v1",
          sourceSize,
          candidateSize,
          maximumLogError,
        },
      });
      scene.nodes = [wrapper];
      wrappedScenes++;
    }
    ensure(wrappedScenes > 0, `${id} has no populated scene roots for envelope calibration`);
  }
  const effectiveBounds = {
    min: candidateBounds.min.map((value, axis) => {
      const center = (candidateBounds.min[axis] + candidateBounds.max[axis]) / 2;
      return center + (value - center) * scale[axis];
    }),
    max: candidateBounds.max.map((value, axis) => {
      const center = (candidateBounds.min[axis] + candidateBounds.max[axis]) / 2;
      return center + (value - center) * scale[axis];
    }),
  };
  const effectiveSize = effectiveBounds.max.map(
    (value, axis) => value - effectiveBounds.min[axis],
  );
  return {
    document: { json, binary: document.binary },
    changed,
    scale,
    effectiveBounds,
    effectiveSize,
  };
}

async function addPbrChannels(document, pbr = {}) {
  let updated = document;
  const imageNames = [...new Set(baseColorBindings(document).map((binding) => binding.imageName))];
  ensure(imageNames.length, "Candidate has no embedded base-color binding");
  for (const imageName of imageNames) {
    const bindings = baseColorBindings(updated).filter(
      (item) => item.imageName.toLowerCase() === imageName.toLowerCase(),
    );
    const binding = bindings[0];
    ensure(binding, `Base-color binding '${imageName}' disappeared`);
    const needsNormal = bindings.some(
      (item) => !updated.json.materials?.[item.materialIndex]?.normalTexture,
    );
    const needsMetallicRoughness = bindings.some(
      (item) =>
        !updated.json.materials?.[item.materialIndex]?.pbrMetallicRoughness
          ?.metallicRoughnessTexture,
    );
    if (!needsNormal && !needsMetallicRoughness) continue;
    const baseColor = embeddedImage(updated, binding.imageIndex);
    const metadata = await sharp(baseColor).metadata();
    ensure(metadata.width && metadata.height, `${imageName} base color dimensions are invalid`);
    const maps = await derivePbrChannels(baseColor, {
      normalStrength: pbr.normalStrength ?? 1.6,
      roughness: pbr.roughness ?? 0.86,
      roughnessVariation: pbr.roughnessVariation ?? 0.08,
    });
    updated = appendMaterialChannels(updated, [{
      imageName,
      normal: needsNormal
        ? { bytes: maps.normal, mimeType: "image/webp", scale: pbr.normalScale ?? 1 }
        : undefined,
      metallicRoughness: needsMetallicRoughness
        ? { bytes: maps.metallicRoughness, mimeType: "image/webp" }
        : undefined,
    }]);
  }
  updated.json.extensionsUsed = [
    ...new Set([...(updated.json.extensionsUsed ?? []), "EXT_texture_webp"]),
  ];
  return updated;
}

async function verifyEvidence(review) {
  ensure(["approved", "pending", "rejected"].includes(review?.decision), "Review decision is missing");
  ensure(typeof review.reason === "string" && review.reason.length, "Review reason is missing");
  const evidence = [];
  for (const item of review.evidence ?? []) {
    const file = resolveRepoFile(item.file, "Review evidence file");
    const bytes = await fs.readFile(file);
    const actual = sha256(bytes);
    ensure(actual === item.sha256, `Review evidence checksum changed: ${item.file}`);
    evidence.push({ file: relativeToRepo(file), sha256: actual, bytes: bytes.byteLength });
  }
  ensure(evidence.length >= 2, "Review requires legacy and candidate image evidence");
  return evidence;
}

async function candidateFor(asset, catalogAsset) {
  if (asset.candidate.kind === "catalog-final") {
    ensure(catalogAsset.glb, `${asset.id} has no catalog final.glb`);
    return resolveRepoFile(
      path.join("assets/generated/eq-catalog", catalogAsset.glb),
      `${asset.id} catalog final`,
    );
  }
  ensure(
    typeof asset.candidate.kind === "string" && asset.candidate.kind.length,
    `${asset.id} candidate kind is unsupported`,
  );
  ensure(
    typeof asset.candidate.file === "string" && asset.candidate.file.endsWith("final.glb"),
    `${asset.id} candidate must name an explicit final.glb`,
  );
  return resolveRepoFile(asset.candidate.file, `${asset.id} ${asset.candidate.kind} final`);
}

async function validateAsset(asset, catalog, passRoot) {
  ensure(/^[a-z0-9][a-z0-9_-]*$/.test(asset.id), `Invalid object ID '${asset.id}'`);
  const catalogAsset = catalog.assets.get(asset.id);
  ensure(catalogAsset, `Catalog has no object '${asset.id}'`);
  const descriptionFile = resolveRepoFile(
    path.join("assets/generated/eq-catalog", catalogAsset.description),
    `${asset.id} description`,
  );
  const descriptionBytes = await fs.readFile(descriptionFile);
  const description = JSON.parse(descriptionBytes);
  ensure(description.id === asset.id, `${asset.id} description ID changed`);
  ensure(description.geometry?.bounds, `${asset.id} description has no source bounds`);
  const candidateFile = await candidateFor(asset, catalogAsset);
  const candidateBytes = await fs.readFile(candidateFile);
  if (asset.candidate.kind === "stablegen") {
    ensure(asset.candidate.sha256, `${asset.id} StableGen candidate is not checksum-pinned`);
  }
  if (asset.candidate.sha256) {
    ensure(
      sha256(candidateBytes) === asset.candidate.sha256,
      `${asset.id} candidate checksum changed`,
    );
  }
  if (asset.candidate.kind === "catalog-final") {
    ensure(
      description.generated?.final?.sha256 === sha256(candidateBytes),
      `${asset.id} final.glb is not linked to its description`,
    );
    ensure(description.finalValidation?.passed, `${asset.id} catalog validation failed`);
  }
  const sourceDocument = parseGlb(candidateBytes);
  const sourceGeometry = geometrySummary(sourceDocument);
  const profile = shapeProfileCheck(
    description.geometry.size,
    sourceGeometry.size,
    asset.validation?.maximumShapeLogError ?? 0.47,
  );
  const evidence = await verifyEvidence(asset.review);
  const withPbr = await addPbrChannels(sourceDocument, asset.pbr);
  const fitted = addLegacyFitRoot(
    withPbr,
    asset.id,
    description.geometry.bounds,
    sourceGeometry.bounds,
  );
  const authoringBytes = serializeGlb(fitted.document);
  const runtimeBytes = preprocessZoneObjectGlb(authoringBytes, asset.id);
  const runtimeGeometry = geometrySummary(parseGlb(runtimeBytes));
  const checks = {
    catalogDescriptionLinked: true,
    candidateChecksumPinned: true,
    indexedTriangles: runtimeGeometry.indexedTriangles,
    finiteGeometry: runtimeGeometry.finiteGeometry,
    everyPrimitiveTextured: runtimeGeometry.everyPrimitiveTextured,
    everyPrimitiveNormalMapped: runtimeGeometry.everyPrimitiveNormalMapped,
    everyPrimitiveMetallicRoughnessMapped:
      runtimeGeometry.everyPrimitiveMetallicRoughnessMapped,
    triangleBudget:
      runtimeGeometry.triangleCount <=
      (asset.validation?.maximumTriangles ?? Math.max(6000, description.geometry.triangleCount * 4)),
    shapeProfile: profile.passed,
    visualApproval: asset.review.decision === "approved",
  };
  const passed = Object.values(checks).every(Boolean);
  const outputDirectory = path.join(passRoot, asset.id);
  await fs.mkdir(outputDirectory, { recursive: true });
  const candidateOutput = path.join(outputDirectory, "final.glb");
  const validation = {
    kind: "requiem.object-replacement-validation",
    version: 1,
    id: asset.id,
    route: asset.candidate.kind,
    candidate: relativeToRepo(candidateFile),
    candidateSha256: sha256(candidateBytes),
    description: relativeToRepo(descriptionFile),
    descriptionSha256: sha256(descriptionBytes),
    output: relativeToRepo(candidateOutput),
    outputSha256: sha256(authoringBytes),
    runtimeContentSha256: sha256(runtimeBytes),
    sourceGeometry,
    runtimeGeometry,
    legacyGeometry: description.geometry,
    fit: { scale: fitted.scale, translation: fitted.translation },
    shapeProfile: profile,
    review: { ...asset.review, evidence },
    checks,
    passed,
    validatedAt: new Date().toISOString(),
  };
  await atomicWrite(candidateOutput, authoringBytes);
  await atomicWrite(
    path.join(outputDirectory, "validation.json"),
    `${JSON.stringify(validation, null, 2)}\n`,
  );
  return { asset, validation, authoringBytes, runtimeBytes };
}

async function validatePass(options) {
  const { manifest, bytes: manifestBytes } = await readReplacementManifest(options.manifest);
  const catalog = await readCatalog();
  const passRoot = path.join(
    repoRoot,
    "assets/generated/object-replacements",
    manifest.passId,
  );
  const results = [];
  if (manifest.generationPolicy?.requiredCandidateKind) {
    for (const asset of manifest.assets) {
      ensure(
        asset.candidate.kind === manifest.generationPolicy.requiredCandidateKind,
        `${asset.id} violates required candidate route '${manifest.generationPolicy.requiredCandidateKind}'`,
      );
    }
  }
  for (const asset of manifest.assets) {
    results.push(await validateAsset(asset, catalog, passRoot));
  }
  const report = {
    kind: "requiem.object-replacement-pass",
    version: 1,
    passId: manifest.passId,
    manifest: relativeToRepo(options.manifest),
    manifestSha256: sha256(manifestBytes),
    catalogSha256: sha256(catalog.bytes),
    assets: results.map(({ validation }) => ({
      id: validation.id,
      route: validation.route,
      passed: validation.passed,
      checks: validation.checks,
      output: validation.output,
      validation: `assets/generated/object-replacements/${manifest.passId}/${validation.id}/validation.json`,
    })),
    passed: results.filter(({ validation }) => validation.passed).length,
    pending: results.filter(({ asset }) => asset.review.decision === "pending").length,
    rejected: results.filter(({ asset }) => asset.review.decision === "rejected").length,
    automatedRejected: results.filter(({ validation }) =>
      Object.entries(validation.checks)
        .filter(([name]) => name !== "visualApproval")
        .some(([, passed]) => !passed)).length,
    generatedAt: new Date().toISOString(),
  };
  await atomicWrite(
    path.join(passRoot, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return { manifest, manifestBytes, passRoot, results, report };
}

function labelSvg(width, height, text, color = "#e8dfcc") {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="100%" height="100%" fill="#151813"/>` +
    `<text x="16" y="${Math.round(height * 0.68)}" fill="${color}" ` +
    `font-family="Arial, sans-serif" font-size="20" font-weight="700">${escaped}</text></svg>`,
  );
}

async function renderReview(pass) {
  const panel = 420;
  const label = 52;
  const columns = pass.results.length;
  const composites = [];
  for (let index = 0; index < pass.results.length; index++) {
    const { asset, validation } = pass.results[index];
    const source = resolveRepoFile(asset.review.evidence[0].file, "Legacy review image");
    const candidate = resolveRepoFile(asset.review.evidence[1].file, "Candidate review image");
    const nonVisualPassed = Object.entries(validation.checks)
      .filter(([name]) => name !== "visualApproval")
      .every(([, passed]) => passed);
    const pending = asset.review.decision === "pending" && nonVisualPassed;
    const status = validation.passed ? "PASS" : pending ? "PENDING" : "REJECT";
    const color = validation.passed ? "#a9d18e" : pending ? "#e7c66b" : "#ed8d83";
    composites.push(
      { input: labelSvg(panel, label, `${asset.id}  ${status}`, color), left: index * panel, top: 0 },
      { input: await sharp(source).resize(panel, panel, { fit: "contain", background: "#f2f2f0" }).png().toBuffer(), left: index * panel, top: label },
      { input: labelSvg(panel, label, "LOCAL RoF2 EQ SOURCE", "#b6b9ad"), left: index * panel, top: label + panel },
      { input: await sharp(candidate).resize(panel, panel, { fit: "contain", background: "#f2f2f0" }).png().toBuffer(), left: index * panel, top: label * 2 + panel },
      { input: labelSvg(panel, label, "GENERATED CANDIDATE", "#b6b9ad"), left: index * panel, top: label * 2 + panel * 2 },
    );
  }
  const output = path.join(pass.passRoot, "four-asset-image-validation.png");
  await sharp({
    create: {
      width: columns * panel,
      height: panel * 2 + label * 3,
      channels: 3,
      background: "#151813",
    },
  }).composite(composites).png().toFile(output);
  return output;
}

async function probeStableGen(pass) {
  const clone = resolveRepoFile(pass.manifest.stablegen.clone, "StableGen clone");
  const required = [
    "stablegen/texturing/generator.py",
    "stablegen/texturing/rendering.py",
    "stablegen/texturing/game_export.py",
  ];
  for (const file of required) await fs.access(path.join(clone, file));
  const jobs = [];
  for (const job of pass.manifest.stablegen.jobs ?? []) {
    const asset = pass.manifest.assets.find((item) => item.id === job.id);
    ensure(asset, `StableGen job '${job.id}' is not in this review pass`);
    ensure(asset.candidate.kind === "stablegen", `${job.id} must use the StableGen candidate route`);
    ensure(asset.candidate.file === job.expectedFinal, `${job.id} StableGen output and candidate paths differ`);
    const input = resolveRepoFile(job.referenceImage, `${job.id} StableGen reference`);
    await fs.access(input);
    jobs.push({
      id: job.id,
      reviewReferenceImage: relativeToRepo(input),
      generationInputPolicy: "text-only-no-legacy-pixels",
      expectedFinal: job.expectedFinal,
      targetFaces: job.targetFaces,
      prompt: job.prompt,
      settings: pass.manifest.stablegen.settings,
    });
  }
  const endpoint = pass.manifest.stablegen.server ?? "http://127.0.0.1:8188";
  let serverOnline = false;
  let trellis2Available = false;
  let serverError = null;
  try {
    const response = await fetch(`${endpoint}/system_stats`, {
      signal: AbortSignal.timeout(1500),
    });
    serverOnline = response.ok;
    if (serverOnline) {
      const trellisResponse = await fetch(`${endpoint}/object_info/Trellis2ImageToShape`, {
        signal: AbortSignal.timeout(1500),
      });
      trellis2Available = trellisResponse.ok &&
        Object.keys(await trellisResponse.json()).length > 0;
    }
  } catch (error) {
    serverError = error.message;
  }
  let openGeometry = null;
  let openGeometryReady = false;
  let openGeometryError = null;
  if (pass.manifest.stablegen.geometryBackend?.primaryModel === "VAST-AI/TripoSG") {
    const backend = pass.manifest.stablegen.geometryBackend;
    try {
      const geometryClone = resolveRepoFile(backend.clone, "Open geometry clone");
      const python = resolveRepoFile(backend.python, "Open geometry Python");
      const generator = resolveRepoFile(backend.generator, "Open geometry generator");
      const weights = resolveRepoFile(backend.weights, "Open geometry weights");
      await Promise.all([
        fs.access(path.join(geometryClone, "triposg")),
        fs.access(python),
        fs.access(generator),
        fs.access(path.join(weights, "model_index.json")),
      ]);
      const result = await execFileAsync(python, ["-c", [
        "import json, torch",
        "print(json.dumps({'torch': torch.__version__, 'mps': bool(torch.backends.mps.is_available())}))",
      ].join("\n")], { cwd: geometryClone });
      const runtime = JSON.parse(result.stdout.trim());
      openGeometryReady = runtime.mps;
      openGeometry = {
        model: backend.primaryModel,
        clone: relativeToRepo(geometryClone),
        python: relativeToRepo(python),
        generator: relativeToRepo(generator),
        weights: relativeToRepo(weights),
        device: backend.device,
        precision: backend.precision,
        runtime,
      };
    } catch (error) {
      openGeometryError = error.message;
    }
  }
  let macAdapter = null;
  let macPython = null;
  let macAdapterReady = false;
  let macRuntime = null;
  let huggingFaceAuthenticated = false;
  let dinov3Accessible = false;
  let dinov3AccessError = null;
  let macAdapterError = null;
  if (pass.manifest.stablegen.macAdapter) {
    macAdapter = resolveRepoFile(
      pass.manifest.stablegen.macAdapter,
      "StableGen Mac adapter",
    );
    try {
      await fs.access(path.join(macAdapter, "generate.py"));
      const python = pass.manifest.stablegen.macPython
        ? resolveRepoFile(pass.manifest.stablegen.macPython, "StableGen Mac Python")
        : path.join(macAdapter, ".venv/bin/python");
      await fs.access(python);
      macPython = python;
      const runtimeResult = await execFileAsync(python, ["-c", [
        "import json, platform, torch, transformers",
        "from transformers import DINOv3ViTModel",
        "version = tuple(int(x) for x in torch.__version__.split('+')[0].split('.')[:2])",
        "print(json.dumps({'machine': platform.machine(), 'torch': torch.__version__, 'transformers': transformers.__version__, 'mps': bool(torch.backends.mps.is_available()), 'compatible': platform.machine() == 'arm64' and version >= (2, 4)}))",
      ].join("\n")]);
      macRuntime = JSON.parse(runtimeResult.stdout.trim());
      macAdapterReady = macRuntime.compatible && macRuntime.mps;
      const result = await execFileAsync(python, ["-c", [
        "import json",
        "from huggingface_hub import get_token, hf_hub_download",
        "token = get_token()",
        "result = {'authenticated': bool(token), 'accessible': False, 'error': None}",
        "if token:",
        "    try:",
        "        hf_hub_download('facebook/dinov3-vitl16-pretrain-lvd1689m', 'config.json', token=token)",
        "        result['accessible'] = True",
        "    except Exception as error:",
        "        message = str(error)",
        "        result['error'] = 'pending-review' if 'awaiting a review' in message else error.__class__.__name__",
        "print(json.dumps(result))",
      ].join("\n")]);
      const access = JSON.parse(result.stdout.trim());
      huggingFaceAuthenticated = access.authenticated;
      dinov3Accessible = access.accessible;
      dinov3AccessError = access.error;
    } catch (error) {
      macAdapterError = error.message;
    }
  }
  const report = {
    kind: "requiem.stablegen-object-batch",
    version: 1,
    clone: relativeToRepo(clone),
    cloneReady: true,
    server: endpoint,
    serverOnline,
    trellis2Available,
    openGeometry,
    openGeometryReady,
    openGeometryError,
    macAdapter: macAdapter ? relativeToRepo(macAdapter) : null,
    macPython: macPython ? relativeToRepo(macPython) : null,
    macAdapterReady,
    macRuntime,
    huggingFaceAuthenticated,
    dinov3Accessible,
    dinov3AccessError,
    ready: serverOnline && (openGeometryReady || trellis2Available ||
      (macAdapterReady && huggingFaceAuthenticated && dinov3Accessible)),
    serverError,
    macAdapterError,
    jobs,
    automationStages: pass.manifest.stablegen.geometryBackend?.primaryModel ===
      "microsoft/TRELLIS.2-4B"
      ? [
        "comfyui-sdxl-text-only-clean-room-concept",
        "assets/pipeline/remove_concept_background.py",
        "trellis-mac/generate.py",
        "trellis-native-pbr-bake",
        "assets/pipeline/validate_stablegen_object.py",
        "client/scripts/render-glb-reference.mjs",
      ]
      : [
        "assets/pipeline/generate_triposg_open.py",
        "object.bake_textures",
        "object.export_game_engine",
      ],
    generatedAt: new Date().toISOString(),
  };
  await atomicWrite(
    path.join(pass.passRoot, "stablegen-batch.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function uploadComfyImage(endpoint, file, name) {
  const bytes = await fs.readFile(file);
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/png" }), name);
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await fetch(`${endpoint}/upload/image`, { method: "POST", body: form });
  ensure(response.ok, `ComfyUI image upload failed (${response.status})`);
  return (await response.json()).name;
}

async function alphaFromFlatBackground(input, output) {
  const python = path.join(repoRoot, "trellis-mac/.venv-arm64/bin/python");
  const segmenter = path.join(repoRoot, "assets/pipeline/remove_concept_background.py");
  const report = `${output}.segmentation.json`;
  await execFileAsync(python, [segmenter, input, output, report], {
    cwd: repoRoot,
    maxBuffer: 4 * 1024 * 1024,
  });
  return { file: relativeToRepo(report), ...JSON.parse(await fs.readFile(report, "utf8")) };
}

async function generateCleanRoomConcept(pass, job) {
  const endpoint = pass.manifest.stablegen.server ?? "http://127.0.0.1:8188";
  const conceptDirectory = path.join(pass.passRoot, "stablegen-concepts");
  await fs.mkdir(conceptDirectory, { recursive: true });
  const prefix = `requiem/${pass.manifest.passId}/${job.id}`;
  const seed = Number.parseInt(sha256(Buffer.from(`${pass.manifest.passId}/${job.id}`)).slice(0, 12), 16);
  const positive = `${job.prompt}, single centered object fully visible, original product design, three-quarter orthographic-like game asset view, flat uniform light gray background, no floor, no horizon, no cast shadow`;
  const negative = "people, room, scenery, floor, horizon, cast shadow, text, letters, numbers, logo, watermark, duplicate object, cropped object, exact copy, malformed geometry";
  const workflow = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "RealVisXL_V5.0_fp16.safetensors" } },
    "2": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: "sdxl_lightning_8step_lora.safetensors", strength_model: 1.0, strength_clip: 1.0 } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["2", 1] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["2", 1] } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 768, batch_size: 1 } },
    "10": { class_type: "KSampler", inputs: { model: ["2", 0], seed, steps: 8, cfg: 1.5, sampler_name: "dpmpp_2s_ancestral", scheduler: "sgm_uniform", positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0], denoise: 1.0 } },
    "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["1", 2] } },
    "12": { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: prefix } },
  };
  const response = await fetch(`${endpoint}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  ensure(response.ok, `ComfyUI concept prompt failed (${response.status})`);
  const queued = await response.json();
  ensure(queued.prompt_id, `ComfyUI rejected ${job.id} concept workflow: ${JSON.stringify(queued.node_errors ?? {})}`);
  let history = null;
  for (let attempt = 0; attempt < 900; attempt++) {
    const current = await fetch(`${endpoint}/history/${queued.prompt_id}`);
    if (current.ok) {
      const payload = await current.json();
      if (payload[queued.prompt_id]) {
        history = payload[queued.prompt_id];
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  ensure(history, `${job.id} clean-room concept timed out`);
  const image = history.outputs?.["12"]?.images?.[0];
  ensure(image?.filename, `${job.id} clean-room concept produced no image`);
  const view = new URL(`${endpoint}/view`);
  view.searchParams.set("filename", image.filename);
  view.searchParams.set("subfolder", image.subfolder ?? "");
  view.searchParams.set("type", image.type ?? "output");
  const generated = await fetch(view);
  ensure(generated.ok, `${job.id} clean-room concept download failed`);
  const raw = path.join(conceptDirectory, `${job.id}-raw.png`);
  const transparent = path.join(conceptDirectory, `${job.id}.png`);
  await atomicWrite(raw, Buffer.from(await generated.arrayBuffer()));
  const segmentation = await alphaFromFlatBackground(raw, transparent);
  return {
    file: transparent,
    raw: relativeToRepo(raw),
    sha256: sha256(await fs.readFile(transparent)),
    promptId: queued.prompt_id,
    seed,
    conditioning: "text-only-no-legacy-pixels",
    promptSha256: sha256(Buffer.from(positive)),
    segmentation,
  };
}

async function generateStableGenMacBatch(pass, probe) {
  ensure(probe.macAdapterReady, "StableGen Apple-Silicon adapter is not installed");
  ensure(
    probe.huggingFaceAuthenticated && probe.dinov3Accessible,
    "StableGen requires HuggingFace authentication and accepted access to gated DINOv3",
  );
  const adapter = resolveRepoFile(probe.macAdapter, "StableGen Mac adapter");
  const python = resolveRepoFile(probe.macPython, "StableGen Mac Python");
  const blender = pass.manifest.stablegen.blender;
  ensure(typeof blender === "string" && path.isAbsolute(blender), "StableGen Blender executable is missing");
  await fs.access(blender);
  const blenderValidator = resolveRepoFile(
    pass.manifest.stablegen.blenderValidator,
    "StableGen Blender validator",
  );
  const catalog = await readCatalog();
  const generated = [];
  for (const job of probe.jobs) {
    const final = resolveRepoFile(job.expectedFinal, `${job.id} StableGen output`);
    const snapshot = path.join(pass.passRoot, "stablegen-candidates", `${job.id}.png`);
    const attemptsFile = path.join(
      pass.passRoot,
      "stablegen-attempts",
      job.id,
      "attempts.json",
    );
    ensure(final.toLowerCase().endsWith(".glb"), `${job.id} output must end in .glb`);
    await fs.mkdir(path.dirname(final), { recursive: true });
    const catalogAsset = catalog.assets.get(job.id);
    ensure(catalogAsset?.description, `${job.id} has no immutable source description`);
    const description = JSON.parse(await fs.readFile(
      resolveRepoFile(path.join("assets/generated/eq-catalog", catalogAsset.description), `${job.id} source description`),
      "utf8",
    ));
    const asset = pass.manifest.assets.find(({ id }) => id === job.id);
    try {
      const checkpoint = JSON.parse(await fs.readFile(attemptsFile, "utf8"));
      const prior = checkpoint.attempts?.find(
        ({ seed, passed }) => seed === checkpoint.selectedSeed && passed,
      );
      ensure(prior, `${job.id} checkpoint has no passing selected attempt`);
      ensure(
        prior.cleanRoomConcept?.conditioning === "text-only-no-legacy-pixels",
        `${job.id} checkpoint used legacy image conditioning`,
      );
      ensure(prior.voxelRemesh, `${job.id} checkpoint predates voxel conditioning`);
      ensure(prior.visualCompleteness, `${job.id} checkpoint predates visual completeness checks`);
      const bytes = await fs.readFile(final);
      ensure(sha256(bytes) === prior.sha256, `${job.id} checkpoint checksum changed`);
      const snapshotBytes = await fs.readFile(snapshot);
      const integrityFile = resolveRepoFile(prior.blenderIntegrity, `${job.id} Blender checkpoint`);
      const integrity = JSON.parse(await fs.readFile(integrityFile, "utf8"));
      ensure(integrity.passed, `${job.id} checkpoint integrity failed`);
      const remesh = JSON.parse(await fs.readFile(
        resolveRepoFile(prior.voxelRemesh, `${job.id} voxel-remesh checkpoint`),
        "utf8",
      ));
      ensure(
        remesh.passed && remesh.targetTriangles === job.targetFaces,
        `${job.id} checkpoint voxel-remesh settings changed`,
      );
      const visual = JSON.parse(await fs.readFile(
        resolveRepoFile(prior.visualCompleteness, `${job.id} visual checkpoint`),
        "utf8",
      ));
      ensure(visual.passed, `${job.id} checkpoint visual completeness failed`);
      const geometry = geometrySummary(parseGlb(bytes));
      const effectiveSize = prior.placementEnvelopeCalibration?.effectiveSize ?? geometry.size;
      const profile = shapeProfileCheck(
        description.geometry.size,
        effectiveSize,
        asset.validation?.maximumShapeLogError ?? 0.3,
      );
      ensure(profile.passed, `${job.id} checkpoint shape profile failed`);
      generated.push({
        id: job.id,
        final: relativeToRepo(final),
        sha256: sha256(bytes),
        bytes: bytes.byteLength,
        geometry: { ...geometry, size: effectiveSize },
        selectedSeed: checkpoint.selectedSeed,
        attempts: checkpoint.attempts,
        cleanRoomConcept: prior.cleanRoomConcept,
        placementEnvelopeCalibration: prior.placementEnvelopeCalibration ?? null,
        shapeProfile: profile,
        blenderIntegrity: prior.blenderIntegrity,
        blenderIntegrityChecks: integrity.checks,
        voxelRemesh: prior.voxelRemesh,
        voxelRemeshMetrics: remesh.triangles,
        visualCompleteness: prior.visualCompleteness,
        visualCompletenessMetrics: visual.metrics,
        snapshot: relativeToRepo(snapshot),
        snapshotSha256: sha256(snapshotBytes),
        resumedFromCheckpoint: true,
      });
      continue;
    } catch {}

    const concept = await generateCleanRoomConcept(pass, job);
    const input = concept.file;
    const seeds = job.settings?.candidateSeeds ?? [job.settings?.seed ?? 42];
    const attempts = [];
    let selected = null;
    const writeAttempts = () => atomicWrite(
      attemptsFile,
      `${JSON.stringify({ id: job.id, selectedSeed: selected?.seed ?? null, attempts }, null, 2)}\n`,
    );
    for (const seed of seeds) {
      const attemptRoot = path.join(
        pass.passRoot,
        "stablegen-attempts",
        job.id,
        `seed-${seed}`,
      );
      const attemptBase = path.join(attemptRoot, "candidate");
      const attemptGlb = `${attemptBase}.glb`;
      const remeshFile = `${attemptBase}_remesh.json`;
      const integrityFile = path.join(attemptRoot, "blender-integrity.json");
      await fs.mkdir(attemptRoot, { recursive: true });
      try {
        await execFileAsync(
          python,
          [
            path.join(adapter, "generate.py"),
            input,
            "--seed",
            String(seed),
            "--output",
            attemptBase,
            "--pipeline-type",
            job.settings?.pipelineType ?? "512",
            "--texture-size",
            String(job.settings?.bakeResolution ?? 1024),
            "--target-faces",
            String(job.targetFaces ?? job.settings?.decimationFaces ?? 6000),
            "--blender",
            blender,
            "--remesh-script",
            path.join(repoRoot, "assets/pipeline/blender_voxel_remesh.py"),
            "--voxel-fraction",
            String(job.settings?.voxelFraction ?? 0.015),
          ],
          {
            cwd: adapter,
            env: {
              ...process.env,
              DEVELOPER_DIR: "/Library/Developer/CommandLineTools",
              MTL_CAPTURE_ENABLED: process.env.MTL_CAPTURE_ENABLED ?? "1",
              PYTORCH_ENABLE_MPS_FALLBACK: "1",
              TRELLIS_SKIP_REMBG: "1",
            },
            maxBuffer: 32 * 1024 * 1024,
          },
        );
        let bytes = await fs.readFile(attemptGlb);
        const sourceDocument = parseGlb(bytes);
        const sourceGeometry = geometrySummary(sourceDocument);
        const calibration = addPlacementEnvelopeCalibration(
          sourceDocument,
          job.id,
          description.geometry.size,
          sourceGeometry.bounds,
          asset.validation?.maximumShapeLogError ?? 0.3,
        );
        if (calibration.changed) {
          bytes = serializeGlb(calibration.document);
          await atomicWrite(attemptGlb, bytes);
        }
        const geometry = {
          ...sourceGeometry,
          accessorBounds: sourceGeometry.bounds,
          bounds: calibration.effectiveBounds,
          size: calibration.effectiveSize,
        };
        ensure(geometry.indexedTriangles && geometry.finiteGeometry, "invalid indexed geometry");
        ensure(
          geometry.triangleCount <= (job.targetFaces ?? job.settings?.decimationFaces ?? 6000),
          "StableGen triangle budget failed",
        );
        await execFileAsync(
          blender,
          ["--background", "--factory-startup", "--python", blenderValidator, "--", attemptGlb, integrityFile],
          { maxBuffer: 16 * 1024 * 1024 },
        );
        const integrity = JSON.parse(await fs.readFile(integrityFile, "utf8"));
        ensure(integrity.passed, "Blender integrity checks failed");
        const remesh = JSON.parse(await fs.readFile(remeshFile, "utf8"));
        ensure(remesh.passed, "Blender voxel-remesh conditioning failed");
        const profile = shapeProfileCheck(
          description.geometry.size,
          geometry.size,
          asset.validation?.maximumShapeLogError ?? 0.3,
        );
        ensure(profile.passed, "legacy shape profile failed");
        const attemptSnapshot = path.join(attemptRoot, "candidate.png");
        const visualFile = path.join(attemptRoot, "snapshot-completeness.json");
        await renderGlbReferenceSheet({
          glbs: [{ label: `${job.id}-seed-${seed}`, path: attemptGlb }],
          output: attemptSnapshot,
          width: 800,
          height: 800,
          frontAxis: "-xz-high",
          focus: "full",
        });
        await execFileAsync(
          python,
          [
            path.join(repoRoot, "assets/pipeline/validate_candidate_snapshot.py"),
            attemptSnapshot,
            `${concept.file}.segmentation.json`,
            visualFile,
          ],
          { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024 },
        );
        const visual = JSON.parse(await fs.readFile(visualFile, "utf8"));
        ensure(visual.passed, "visual completeness checks failed");
        const placementEnvelopeCalibration = {
          changed: calibration.changed,
          scale: calibration.scale,
          effectiveBounds: calibration.effectiveBounds,
          effectiveSize: calibration.effectiveSize,
        };
        selected = {
          seed,
          bytes,
          geometry,
          integrity,
          integrityFile,
          profile,
          remesh,
          remeshFile,
          visual,
          visualFile,
          placementEnvelopeCalibration,
        };
        attempts.push({
          seed,
          passed: true,
          glb: relativeToRepo(attemptGlb),
          sha256: sha256(bytes),
          blenderIntegrity: relativeToRepo(integrityFile),
          voxelRemesh: relativeToRepo(remeshFile),
          voxelRemeshMetrics: remesh.triangles,
          visualCompleteness: relativeToRepo(visualFile),
          visualCompletenessMetrics: visual.metrics,
          shapeProfile: profile,
          placementEnvelopeCalibration,
          cleanRoomConcept: { ...concept, file: relativeToRepo(concept.file) },
        });
        await writeAttempts();
        break;
      } catch (error) {
        let integrity = null;
        try {
          integrity = JSON.parse(await fs.readFile(integrityFile, "utf8"));
        } catch {}
        attempts.push({
          seed,
          passed: false,
          error: error.message,
          blenderIntegrity: integrity ? relativeToRepo(integrityFile) : null,
          blenderIntegrityChecks: integrity?.checks ?? null,
          cleanRoomConcept: { ...concept, file: relativeToRepo(concept.file) },
        });
        await writeAttempts();
      }
    }
    await writeAttempts();
    ensure(selected, `${job.id} failed every bounded StableGen seed attempt`);
    await atomicWrite(final, selected.bytes);
    const bytes = selected.bytes;
    const geometry = selected.geometry;
    await renderGlbReferenceSheet({
      glbs: [{ label: job.id, path: final }],
      output: snapshot,
      width: 800,
      height: 800,
      frontAxis: "-xz-high",
      focus: "full",
    });
    const snapshotBytes = await fs.readFile(snapshot);
    generated.push({
      id: job.id,
      final: relativeToRepo(final),
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      geometry,
      selectedSeed: selected.seed,
      attempts,
      cleanRoomConcept: { ...concept, file: relativeToRepo(concept.file) },
      placementEnvelopeCalibration: selected.placementEnvelopeCalibration,
      shapeProfile: selected.profile,
      blenderIntegrity: relativeToRepo(selected.integrityFile),
      blenderIntegrityChecks: selected.integrity.checks,
      voxelRemesh: relativeToRepo(selected.remeshFile),
      voxelRemeshMetrics: selected.remesh.triangles,
      visualCompleteness: relativeToRepo(selected.visualFile),
      visualCompletenessMetrics: selected.visual.metrics,
      snapshot: relativeToRepo(snapshot),
      snapshotSha256: sha256(snapshotBytes),
    });
  }
  const pinnedManifest = structuredClone(pass.manifest);
  for (const item of generated) {
    const asset = pinnedManifest.assets.find(({ id }) => id === item.id);
    ensure(asset?.candidate.kind === "stablegen", `${item.id} is not a StableGen candidate`);
    ensure(asset.candidate.file === item.final, `${item.id} StableGen output path changed`);
    asset.candidate.sha256 = item.sha256;
    asset.review.evidence[1] = {
      file: item.snapshot,
      sha256: item.snapshotSha256,
    };
  }
  ensure(pass.manifestFile, "StableGen generation requires a writable manifest path");
  await atomicWrite(pass.manifestFile, `${JSON.stringify(pinnedManifest, null, 2)}\n`);
  const report = {
    ...probe,
    generated,
    manifestPinned: relativeToRepo(pass.manifestFile),
    completedAt: new Date().toISOString(),
  };
  await atomicWrite(
    path.join(pass.passRoot, "stablegen-generation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function generateLegacyPbrBatch(manifest, passRoot) {
  const generated = [];
  for (const asset of manifest.assets.filter(({ candidate }) => candidate.kind === "legacy-pbr")) {
    const source = resolveRepoFile(asset.candidate.source, `${asset.id} extracted EQ source`);
    const stored = await fs.readFile(source);
    ensure(
      !asset.candidate.sourceSha256 || sha256(stored) === asset.candidate.sourceSha256,
      `${asset.id} extracted EQ source checksum changed`,
    );
    const sourceBytes = source.toLowerCase().endsWith(".gz") ? gunzipSync(stored) : stored;
    const sourceDocument = parseGlb(sourceBytes);
    const sourceGeometry = geometrySummary(sourceDocument);
    const updated = await addPbrChannels(sourceDocument, asset.pbr);
    const finalBytes = serializeGlb(updated);
    const final = resolveRepoFile(asset.candidate.file, `${asset.id} legacy PBR final`);
    await atomicWrite(final, finalBytes);
    const finalGeometry = geometrySummary(parseGlb(finalBytes));
    ensure(
      JSON.stringify(sourceGeometry.bounds) === JSON.stringify(finalGeometry.bounds) &&
        sourceGeometry.triangleCount === finalGeometry.triangleCount,
      `${asset.id} legacy PBR generation changed geometry`,
    );
    ensure(
      finalGeometry.everyPrimitiveTextured &&
        finalGeometry.everyPrimitiveNormalMapped &&
        finalGeometry.everyPrimitiveMetallicRoughnessMapped,
      `${asset.id} legacy PBR generation left incomplete material channels`,
    );
    generated.push({
      id: asset.id,
      source: relativeToRepo(source),
      sourceSha256: sha256(stored),
      final: relativeToRepo(final),
      sha256: sha256(finalBytes),
      bytes: finalBytes.byteLength,
      geometry: finalGeometry,
    });
  }
  ensure(generated.length, "Manifest has no legacy-pbr candidates");
  const report = {
    kind: "requiem.legacy-pbr-object-batch",
    version: 1,
    passId: manifest.passId,
    generated,
    generatedAt: new Date().toISOString(),
  };
  await atomicWrite(
    path.join(passRoot, "legacy-pbr-generation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function backupPromotion(pass, selected) {
  const backupRoot = path.join(pass.passRoot, "backup");
  try {
    await fs.access(path.join(backupRoot, "manifest.json"));
    return backupRoot;
  } catch {}
  await fs.mkdir(backupRoot, { recursive: true });
  await fs.copyFile(runtimeManifestFile, path.join(backupRoot, "manifest.json"));
  await fs.copyFile(baselineFile, path.join(backupRoot, "legacy-baseline.manifest.json"));
  for (const { asset } of selected) {
    const source = path.join(runtimeRoot, asset.id, "final.glb.gz");
    const destination = path.join(backupRoot, asset.id, "final.glb.gz");
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  return backupRoot;
}

async function promotePass(pass) {
  const selected = pass.results.filter(({ validation }) => validation.passed);
  ensure(selected.length, "No replacement asset passed promotion gates");
  const oldManifestBytes = await fs.readFile(runtimeManifestFile);
  const runtimeManifest = JSON.parse(oldManifestBytes);
  ensure(
    runtimeManifest.kind === "requiem.object-assets" && runtimeManifest.version === 3,
    "Runtime object manifest contract changed",
  );
  const baseline = JSON.parse(await fs.readFile(baselineFile));
  ensure(
    baseline.objectAssets?.status === "ready" &&
      baseline.objectAssets.objects === runtimeManifest.objects.length &&
      baseline.objectAssets.manifest?.path ===
        "client/public/eqrequiem/objects/manifest.json",
    "Legacy baseline object descriptor contract changed",
  );
  const priorBaselineDescriptorMatched =
    baseline.objectAssets.manifest.sha256 === sha256(oldManifestBytes) &&
    baseline.objectAssets.manifest.bytes === oldManifestBytes.byteLength;
  const runtimeObjects = new Map(runtimeManifest.objects.map((object) => [object.id, object]));
  for (const result of selected) {
    ensure(runtimeObjects.has(result.asset.id), `${result.asset.id} is not a current runtime object`);
  }
  const backupRoot = await backupPromotion(pass, selected);
  for (const result of selected) {
    const compressed = gzipSync(result.runtimeBytes, { level: 9 });
    const file = path.join(runtimeRoot, result.asset.id, "final.glb.gz");
    await atomicWrite(file, compressed);
    const previous = runtimeObjects.get(result.asset.id);
    runtimeObjects.set(result.asset.id, {
      ...previous,
      sourceSha256: result.validation.candidateSha256,
      contentSha256: sha256(result.runtimeBytes),
      compressedSha256: sha256(compressed),
      bytes: result.runtimeBytes.byteLength,
      compressedBytes: compressed.byteLength,
      replacement: {
        passId: pass.manifest.passId,
        route: result.validation.route,
        candidate: result.validation.candidate,
        candidateSha256: result.validation.candidateSha256,
        generatedFinal: result.validation.output,
        generatedFinalSha256: result.validation.outputSha256,
        validation: `assets/generated/object-replacements/${pass.manifest.passId}/${result.asset.id}/validation.json`,
        priorSourceSha256: previous.sourceSha256,
        priorContentSha256: previous.contentSha256,
        legacyFit: result.validation.fit,
      },
    });
  }
  runtimeManifest.objects = runtimeManifest.objects.map((object) => runtimeObjects.get(object.id));
  runtimeManifest.replacementPasses = [
    ...(runtimeManifest.replacementPasses ?? []).filter(
      (item) => item.passId !== pass.manifest.passId,
    ),
    {
      passId: pass.manifest.passId,
      manifest: relativeToRepo(pass.manifestFile ?? defaultManifest),
      manifestSha256: sha256(pass.manifestBytes),
      promoted: selected.map(({ asset }) => asset.id),
      backup: relativeToRepo(backupRoot),
    },
  ];
  const newManifestBytes = Buffer.from(`${JSON.stringify(runtimeManifest, null, 2)}\n`);
  await atomicWrite(runtimeManifestFile, newManifestBytes);
  baseline.objectAssets.manifest.sha256 = sha256(newManifestBytes);
  baseline.objectAssets.manifest.bytes = newManifestBytes.byteLength;
  await atomicWrite(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
  const promotion = {
    kind: "requiem.object-replacement-promotion",
    version: 1,
    passId: pass.manifest.passId,
    promoted: selected.map(({ asset, validation, runtimeBytes }) => ({
      id: asset.id,
      route: validation.route,
      runtime: `client/public/eqrequiem/objects/${asset.id}/final.glb.gz`,
      contentSha256: sha256(runtimeBytes),
    })),
    rejected: pass.results
      .filter(({ validation }) => !validation.passed)
      .map(({ asset, validation }) => ({ id: asset.id, checks: validation.checks })),
    backup: relativeToRepo(backupRoot),
    runtimeManifestSha256: sha256(newManifestBytes),
    priorBaselineDescriptorMatched,
    promotedAt: new Date().toISOString(),
  };
  await atomicWrite(
    path.join(pass.passRoot, "promotion.json"),
    `${JSON.stringify(promotion, null, 2)}\n`,
  );
  return promotion;
}

function usage() {
  return `Usage: node client/scripts/object-replacement-pipeline.mjs <command> [options]

Commands:
  validate          Validate and build fitted, PBR-complete candidates
  review            Validate and write a four-asset legacy/replacement contact sheet
  legacy-pbr-generate  Preserve extracted EQ geometry/diffuse and add complete PBR maps
  stablegen-probe   Stage source inputs and probe the TRELLIS.2 backend; outputs need not exist
  stablegen-generate  Generate GLBs, render evidence, and checksum-pin the manifest
  promote           Validate, then promote only assets passing every gate
  all               Validate, render review, probe StableGen, and promote passing assets

Options:
  --manifest <file> Replacement review manifest`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "help" || options.help) {
    console.log(usage());
  } else if (options.command === "legacy-pbr-generate") {
    const { manifest } = await readReplacementManifest(options.manifest);
    const passRoot = path.join(repoRoot, "assets/generated/object-replacements", manifest.passId);
    const legacyPbr = await generateLegacyPbrBatch(manifest, passRoot);
    console.log(JSON.stringify({ legacyPbr }, null, 2));
  } else if (["stablegen-probe", "stablegen-generate"].includes(options.command)) {
    const { manifest, bytes: manifestBytes } = await readReplacementManifest(options.manifest);
    const passRoot = path.join(repoRoot, "assets/generated/object-replacements", manifest.passId);
    const pass = { manifest, manifestBytes, manifestFile: options.manifest, passRoot };
    let stablegen = await probeStableGen(pass);
    if (options.command === "stablegen-generate") {
      stablegen = await generateStableGenMacBatch(pass, stablegen);
    }
    console.log(JSON.stringify({ stablegen }, null, 2));
  } else {
    const pass = await validatePass(options);
    pass.manifestFile = options.manifest;
    let review = null;
    let stablegen = null;
    let promotion = null;
    if (["review", "all"].includes(options.command)) review = await renderReview(pass);
    if (["stablegen-probe", "all"].includes(options.command)) stablegen = await probeStableGen(pass);
    if (options.command === "promote") promotion = await promotePass(pass);
    if (options.command === "all" && pass.report.passed) promotion = await promotePass(pass);
    ensure(
      ["validate", "review", "stablegen-probe", "stablegen-generate", "promote", "all"].includes(options.command),
      `Unknown command '${options.command}'`,
    );
    console.log(JSON.stringify({
      report: relativeToRepo(path.join(pass.passRoot, "report.json")),
      passed: pass.report.passed,
      pending: pass.report.pending,
      rejected: pass.report.rejected,
      review: review ? relativeToRepo(review) : null,
      stablegen,
      promotion,
    }, null, 2));
  }
}

export {
  addPbrChannels,
  addLegacyFitRoot,
  addPlacementEnvelopeCalibration,
  generateLegacyPbrBatch,
  geometrySummary,
  generateStableGenMacBatch,
  probeStableGen,
  promotePass,
  renderReview,
  shapeProfileCheck,
  validatePass,
};
