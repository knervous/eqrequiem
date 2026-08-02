#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  addLegacyFitRoot,
  geometrySummary,
  shapeProfileCheck,
} from "./object-replacement-pipeline.mjs";
import {
  accessorValues,
  appendMaterialChannels,
  baseColorBindings,
  embeddedImage,
  parseGlb,
  serializeGlb,
} from "./material-ai/glb-material-palette.mjs";
import { renderGlbReferenceSheet } from "./render-glb-reference.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outputRoot = path.join(
  repoRoot,
  "assets/generated/object-replacements/qeynos2-spar3d-clean-room-barrel-example",
);
const priorConceptRoot = path.join(
  repoRoot,
  "assets/generated/object-replacements/qeynos2-dinov3-clean-room-barrel-example",
);
const sparRoot = path.join(repoRoot, "SPAR3D");
const python = path.join(sparRoot, ".venv-arm64/bin/python");
const generator = path.join(sparRoot, "run.py");
const segmenter = path.join(repoRoot, "assets/pipeline/remove_concept_background.py");
const validator = path.join(repoRoot, "assets/pipeline/validate_stablegen_object.py");
const blender = "/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender";
const endpoint = "http://127.0.0.1:8188";
const execFileAsync = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const conceptSpecs = [
  {
    seed: 731943,
    view: "eye-level three-quarter orthographic product view, camera centered at barrel mid-height",
  },
  {
    seed: 731944,
    view: "near eye-level front three-quarter product view, only a narrow top surface visible",
  },
  {
    seed: 731945,
    view: "eye-level opposite three-quarter orthographic product view, restrained perspective",
  },
];

async function atomicWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

async function comfyConcept(index, spec) {
  const positive = [
    "original clean-room game asset concept",
    "single upright closed medieval fantasy coopered storage barrel",
    "solid fitted wooden lid clearly spanning the entire top with no hole or cavity",
    "believable bulging oak stave construction",
    "four broad raised dark forged iron hoops",
    "subtle handmade asymmetry and wear",
    spec.view,
    "entire object centered and filling 72 percent of frame",
    "soft neutral studio lighting",
    "uniform light gray background",
    "no floor and no cast shadow",
  ].join(", ");
  const negative = [
    "legacy game screenshot", "EverQuest", "copied design", "open barrel", "empty barrel",
    "hole", "cavity", "bucket", "interior", "keg tap", "scene", "room", "ground",
    "horizon", "shadow", "duplicate", "cropped", "floating parts", "text", "logo",
    "watermark", "high camera angle", "looking down into barrel", "extreme perspective",
  ].join(", ");
  const workflow = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "RealVisXL_V5.0_fp16.safetensors" } },
    "2": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: "sdxl_lightning_8step_lora.safetensors", strength_model: 1, strength_clip: 1 } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["2", 1] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["2", 1] } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 768, batch_size: 1 } },
    "10": { class_type: "KSampler", inputs: { model: ["2", 0], seed: spec.seed, steps: 8, cfg: 1.5, sampler_name: "dpmpp_2s_ancestral", scheduler: "sgm_uniform", positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0], denoise: 1 } },
    "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["1", 2] } },
    "12": { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: `requiem/spar3d-barrel-${index}` } },
  };
  const queuedResponse = await fetch(`${endpoint}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!queuedResponse.ok) throw new Error(`ComfyUI rejected concept ${index} (${queuedResponse.status})`);
  const queued = await queuedResponse.json();
  if (!queued.prompt_id) throw new Error(`Invalid ComfyUI response: ${JSON.stringify(queued.node_errors ?? queued)}`);
  let image;
  for (let attempt = 0; attempt < 900; attempt++) {
    const response = await fetch(`${endpoint}/history/${queued.prompt_id}`);
    if (response.ok) {
      const history = await response.json();
      image = history[queued.prompt_id]?.outputs?.["12"]?.images?.[0];
      if (image) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!image) throw new Error(`Clean-room concept ${index} timed out`);
  const view = new URL(`${endpoint}/view`);
  view.searchParams.set("filename", image.filename);
  view.searchParams.set("subfolder", image.subfolder ?? "");
  view.searchParams.set("type", image.type ?? "output");
  const downloaded = await fetch(view);
  if (!downloaded.ok) throw new Error(`Could not download concept ${index}`);
  const raw = path.join(outputRoot, `concept-${index}-raw.png`);
  const transparent = path.join(outputRoot, `concept-${index}.png`);
  const segmentation = path.join(outputRoot, `concept-${index}.segmentation.json`);
  await atomicWrite(raw, Buffer.from(await downloaded.arrayBuffer()));
  await execFileAsync(python, [segmenter, raw, transparent, segmentation], {
    cwd: repoRoot,
    env: { ...process.env, NO_ALBUMENTATIONS_UPDATE: "1" },
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    index,
    file: transparent,
    raw,
    seed: spec.seed,
    positive,
    negative,
    promptId: queued.prompt_id,
    segmentation: JSON.parse(await fs.readFile(segmentation, "utf8")),
  };
}

function capMetrics(document) {
  const positions = [];
  for (const mesh of document.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = primitive.attributes?.POSITION;
      if (Number.isInteger(accessor)) positions.push(...accessorValues(document, accessor));
    }
  }
  const geometry = geometrySummary(document);
  const [minX, minY, minZ] = geometry.bounds.min;
  const [maxX, maxY, maxZ] = geometry.bounds.max;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const radiusX = (maxX - minX) / 2;
  const radiusZ = (maxZ - minZ) / 2;
  const height = maxY - minY;
  const center = positions.filter(([x, , z]) =>
    Math.hypot((x - centerX) / radiusX, (z - centerZ) / radiusZ) <= 0.16,
  );
  const centerTopRelative = center.length
    ? (Math.max(...center.map(([, y]) => y)) - minY) / height
    : 0;
  const centerHighVertices = center.filter(([, y]) => (y - minY) / height >= 0.78).length;
  const relativeHeights = center
    .map(([, y]) => (y - minY) / height)
    .sort((a, b) => a - b);
  const centerP75Relative = relativeHeights.length
    ? relativeHeights[Math.floor((relativeHeights.length - 1) * 0.75)]
    : 0;
  const centerHighFraction = centerHighVertices / Math.max(1, center.length);
  return {
    centerVertices: center.length,
    centerHighVertices,
    centerHighFraction,
    centerP75Relative,
    centerTopRelative,
  };
}

async function completeBarrelPbr(document) {
  const binding = baseColorBindings(document)[0];
  if (!binding) throw new Error("SPAR3D candidate has no embedded base color");
  const { data, info } = await sharp(embeddedImage(document, binding.imageIndex))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const map = Buffer.alloc(info.width * info.height * 3);
  let metallicPixels = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel++) {
    const source = pixel * info.channels;
    const target = pixel * 3;
    const r = data[source] / 255;
    const g = data[source + 1] / 255;
    const b = data[source + 2] / 255;
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const coolDarkMetal = luminance < 0.43 && b >= r * 0.70 && b >= g * 0.72;
    if (coolDarkMetal) metallicPixels++;
    map[target] = 255;
    map[target + 1] = Math.round((coolDarkMetal ? 0.42 : 0.79 + (0.5 - luminance) * 0.08) * 255);
    map[target + 2] = coolDarkMetal ? 230 : 0;
  }
  const encoded = await sharp(map, {
    raw: { width: info.width, height: info.height, channels: 3 },
  }).webp({ lossless: true, effort: 6 }).toBuffer();
  const completed = appendMaterialChannels(document, [{
    imageName: binding.imageName,
    metallicRoughness: { bytes: encoded, mimeType: "image/webp" },
  }]);
  completed.json.extensionsUsed = [
    ...new Set([...(completed.json.extensionsUsed ?? []), "EXT_texture_webp"]),
  ];
  return {
    document: completed,
    metallicPixelFraction: metallicPixels / (info.width * info.height),
  };
}

async function main() {
  const reuse = process.argv.includes("--reuse");
  await fs.mkdir(outputRoot, { recursive: true });
  await Promise.all([
    fs.access(python), fs.access(generator), fs.access(segmenter), fs.access(validator),
    fs.access(blender), fs.access(path.join(outputRoot, "0/mesh.glb")),
  ]);
  const description = JSON.parse(await fs.readFile(
    path.join(repoRoot, "assets/generated/eq-catalog/objects/barrel4/description.json"),
    "utf8",
  ));

  const concepts = [{
    index: 0,
    file: path.join(priorConceptRoot, "concept.png"),
    raw: path.join(priorConceptRoot, "concept-raw.png"),
    seed: 731942,
    positive: "original independent text-only barrel concept retained from the bounded DINO/TRELLIS experiment",
    negative: "see prior concept report",
    promptId: null,
    segmentation: JSON.parse(await fs.readFile(path.join(priorConceptRoot, "concept.segmentation.json"), "utf8")),
  }];
  const retryConcepts = [];
  for (let offset = 0; offset < conceptSpecs.length; offset++) {
    const index = offset + 1;
    if (reuse) {
      retryConcepts.push({
        index,
        file: path.join(outputRoot, `concept-${index}.png`),
        raw: path.join(outputRoot, `concept-${index}-raw.png`),
        seed: conceptSpecs[offset].seed,
        positive: "see report from original run",
        negative: "see report from original run",
        promptId: null,
        segmentation: JSON.parse(await fs.readFile(path.join(outputRoot, `concept-${index}.segmentation.json`), "utf8")),
      });
    } else {
      console.log(`[spar3d-barrel] generating clean-room concept ${index}/3`);
      retryConcepts.push(await comfyConcept(index, conceptSpecs[offset]));
    }
  }
  concepts.push(...retryConcepts);

  const retryOutput = path.join(outputRoot, "raw-retries");
  if (!reuse) {
    console.log("[spar3d-barrel] reconstructing three retries in one resident model batch");
    await execFileAsync(python, [
      generator,
      ...retryConcepts.map((item) => item.file),
      "--device", "mps",
      "--output-dir", retryOutput,
      "--texture-resolution", "1024",
    ], {
      cwd: sparRoot,
      env: {
        ...process.env,
        PYTORCH_ENABLE_MPS_FALLBACK: "1",
        DYLD_LIBRARY_PATH: "/opt/homebrew/opt/libomp/lib",
        NO_ALBUMENTATIONS_UPDATE: "1",
      },
      maxBuffer: 64 * 1024 * 1024,
    });
  }

  const candidates = [];
  for (const concept of concepts) {
    const generated = concept.index === 0
      ? path.join(outputRoot, "0/mesh.glb")
      : path.join(retryOutput, String(concept.index - 1), "mesh.glb");
    const sourceBytes = await fs.readFile(generated);
    const sourceDocument = parseGlb(sourceBytes);
    const geometry = geometrySummary(sourceDocument);
    const cap = capMetrics(sourceDocument);
    const horizontalAspectRatio = Math.min(geometry.size[0], geometry.size[2])
      / Math.max(geometry.size[0], geometry.size[2]);
    const profile = shapeProfileCheck(description.geometry.size, geometry.size, 0.47);
    const pbr = await completeBarrelPbr(sourceDocument);
    const fitted = addLegacyFitRoot(
      pbr.document,
      "barrel4",
      description.geometry.bounds,
      geometry.bounds,
    );
    const final = path.join(outputRoot, `candidate-${concept.index}-final.glb`);
    const finalBytes = serializeGlb(fitted.document);
    await atomicWrite(final, finalBytes);
    const checks = {
      indexedFiniteGeometry: geometry.indexedTriangles && geometry.finiteGeometry,
      fullHorizontalVolume: horizontalAspectRatio >= 0.65,
      placementShapeProfile: profile.passed,
      closedTopCenter:
        cap.centerHighFraction >= 0.35 && cap.centerP75Relative >= 0.82,
      triangleBudget: geometry.triangleCount <= 60000,
      embeddedBaseColor: geometry.everyPrimitiveTextured,
      embeddedOpenGlNormal: geometry.everyPrimitiveNormalMapped,
      embeddedMetallicRoughness: geometrySummary(parseGlb(finalBytes)).everyPrimitiveMetallicRoughnessMapped,
    };
    candidates.push({
      index: concept.index,
      concept: relative(concept.file),
      conceptSha256: sha256(await fs.readFile(concept.file)),
      promptSeed: concept.seed,
      prompt: concept.positive,
      negative: concept.negative,
      segmentation: concept.segmentation,
      generated: relative(generated),
      generatedSha256: sha256(sourceBytes),
      final: relative(final),
      finalSha256: sha256(finalBytes),
      geometry,
      horizontalAspectRatio,
      cap,
      shapeProfile: profile,
      fit: { scale: fitted.scale, translation: fitted.translation },
      pbr: { metallicPixelFraction: pbr.metallicPixelFraction },
      checks,
      passed: Object.values(checks).every(Boolean),
      score: cap.centerTopRelative - Math.max(...profile.logErrors) * 0.25,
    });
  }

  const passing = candidates.filter((item) => item.passed).sort((a, b) => b.score - a.score);
  const winner = passing[0] ?? null;
  const review = path.join(outputRoot, "four-candidate-image-validation.png");
  await renderGlbReferenceSheet({
    glbs: candidates.map((item) => ({
      label: `Candidate ${item.index + 1}: ${item.passed ? "PASS" : "REJECT"}`,
      path: path.join(repoRoot, item.final),
    })),
    output: review,
    width: 1800,
    height: 1800,
    frontAxis: "-xz-high",
  });

  let integrity = null;
  if (winner) {
    const integrityFile = path.join(outputRoot, "integrity-selected.json");
    await execFileAsync(blender, [
      "--background", "--factory-startup", "--python", validator, "--",
      path.join(repoRoot, winner.final), integrityFile, "beveled-furniture",
    ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });
    integrity = JSON.parse(await fs.readFile(integrityFile, "utf8"));
    winner.checks.blenderIntegrity = integrity.passed;
    winner.passed = Object.values(winner.checks).every(Boolean);
  }

  const report = {
    kind: "requiem.spar3d-clean-room-object-example",
    version: 1,
    id: "barrel4",
    passed: Boolean(winner?.passed),
    promotion: "not-performed",
    cleanRoom: {
      conditioning: "text-only-generated-concepts-no-legacy-pixels-meshes-uvs-or-textures",
      noLegacyPixelsMeshesUvsOrTextures: true,
    },
    generation: {
      backend: "stabilityai/stable-point-aware-3d",
      sourceRevision: "fdc311b16809e6a8adc2f5a3407ebb3db1a95bd1",
      device: "mps",
      textureResolution: 1024,
      remesh: "none",
      candidateCount: candidates.length,
      selection: "bounded-metric-selection-v1",
    },
    candidates,
    selectedCandidate: winner?.index ?? null,
    selectedFinal: winner?.final ?? null,
    selectedIntegrity: integrity,
    review: relative(review),
    reviewSha256: sha256(await fs.readFile(review)),
    generatedAt: new Date().toISOString(),
  };
  const reportFile = path.join(outputRoot, "report.json");
  await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: relative(reportFile), passed: report.passed, selected: report.selectedFinal }, null, 2));
  if (!report.passed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
