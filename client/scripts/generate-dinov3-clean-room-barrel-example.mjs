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
const outputRoot = path.join(
  repoRoot,
  "assets/generated/object-replacements/qeynos2-dinov3-clean-room-barrel-example",
);
const endpoint = "http://127.0.0.1:8188";
const python = path.join(repoRoot, "trellis-mac/.venv-arm64/bin/python");
const generator = path.join(repoRoot, "trellis-mac/generate.py");
const blender = "/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender";
const author = path.join(repoRoot, "assets/pipeline/author_clean_first_pass_object.py");
const validator = path.join(repoRoot, "assets/pipeline/validate_stablegen_object.py");
const segmenter = path.join(repoRoot, "assets/pipeline/remove_concept_background.py");
const remesher = path.join(repoRoot, "assets/pipeline/blender_voxel_remesh.py");
const proceduralBuilder = path.join(repoRoot, "assets/pipeline/build_procedural_object_candidates.py");
const execFileAsync = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function atomicWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, file);
}

async function generateConcept() {
  const positive = [
    "original clean-room game asset concept",
    "single upright coopered medieval fantasy storage barrel",
    "believable bulging oak stave construction",
    "closed fitted wooden lid",
    "four broad dark forged iron hoops visibly raised from the wood",
    "subtle asymmetry and hand-built wear",
    "distinct original proportions and construction details",
    "three-quarter orthographic product view",
    "entire object centered and filling 72 percent of frame",
    "soft neutral studio lighting",
    "uniform light gray background",
    "no floor and no cast shadow",
  ].join(", ");
  const negative = [
    "legacy game screenshot", "EverQuest", "copied design", "scene", "room",
    "ground", "horizon", "shadow", "open barrel", "bucket", "keg tap",
    "duplicate", "cropped", "floating parts", "broken hoops", "text", "logo",
    "watermark", "front view", "extreme perspective",
  ].join(", ");
  const seed = 731942;
  const workflow = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "RealVisXL_V5.0_fp16.safetensors" } },
    "2": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: "sdxl_lightning_8step_lora.safetensors", strength_model: 1, strength_clip: 1 } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["2", 1] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["2", 1] } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 768, batch_size: 1 } },
    "10": { class_type: "KSampler", inputs: { model: ["2", 0], seed, steps: 8, cfg: 1.5, sampler_name: "dpmpp_2s_ancestral", scheduler: "sgm_uniform", positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0], denoise: 1 } },
    "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["1", 2] } },
    "12": { class_type: "SaveImage", inputs: { images: ["11", 0], filename_prefix: "requiem/dinov3-clean-room-barrel" } },
  };
  const queuedResponse = await fetch(`${endpoint}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!queuedResponse.ok) throw new Error(`ComfyUI rejected concept (${queuedResponse.status})`);
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
  if (!image) throw new Error("Clean-room barrel concept timed out");
  const view = new URL(`${endpoint}/view`);
  view.searchParams.set("filename", image.filename);
  view.searchParams.set("subfolder", image.subfolder ?? "");
  view.searchParams.set("type", image.type ?? "output");
  const downloaded = await fetch(view);
  if (!downloaded.ok) throw new Error("Could not download barrel concept");
  const raw = path.join(outputRoot, "concept-raw.png");
  const transparent = path.join(outputRoot, "concept.png");
  const segmentation = path.join(outputRoot, "concept.segmentation.json");
  await atomicWrite(raw, Buffer.from(await downloaded.arrayBuffer()));
  await execFileAsync(python, [segmenter, raw, transparent, segmentation], {
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    raw,
    transparent,
    promptId: queued.prompt_id,
    prompt: positive,
    negative,
    promptSha256: sha256(Buffer.from(positive)),
    seed,
    conditioning: "text-only-no-legacy-pixels",
    segmentation: JSON.parse(await fs.readFile(segmentation, "utf8")),
  };
}

async function main() {
  const conceptOnly = process.argv.includes("--concept-only");
  const retryExistingConcept = process.argv.includes("--retry-existing-concept");
  await fs.mkdir(outputRoot, { recursive: true });
  await Promise.all([
    fs.access(python), fs.access(generator), fs.access(blender), fs.access(author),
    fs.access(validator), fs.access(segmenter), fs.access(remesher),
    fs.access(proceduralBuilder),
  ]);
  const stats = await fetch(`${endpoint}/system_stats`, { signal: AbortSignal.timeout(3000) });
  if (!stats.ok) throw new Error("Local ComfyUI is not ready");

  console.log(retryExistingConcept
    ? "[dinov3-barrel] reusing independent text-only concept for controlled retry"
    : "[dinov3-barrel] generating independent text-only concept");
  const concept = retryExistingConcept
    ? {
        raw: path.join(outputRoot, "concept-raw.png"),
        transparent: path.join(outputRoot, "concept.png"),
        promptId: null,
        prompt: "original clean-room text-only barrel concept; see concept.json",
        negative: "see concept.json",
        promptSha256: JSON.parse(await fs.readFile(path.join(outputRoot, "concept.json"), "utf8")).promptSha256,
        seed: 731942,
        conditioning: "text-only-no-legacy-pixels",
        segmentation: JSON.parse(await fs.readFile(path.join(outputRoot, "concept.segmentation.json"), "utf8")),
      }
    : await generateConcept();
  if (conceptOnly) {
    const conceptReport = path.join(outputRoot, "concept.json");
    await atomicWrite(conceptReport, `${JSON.stringify({
      conditioning: concept.conditioning,
      file: path.relative(repoRoot, concept.transparent).replaceAll(path.sep, "/"),
      sha256: sha256(await fs.readFile(concept.transparent)),
      prompt: concept.prompt,
      negative: concept.negative,
      promptSha256: concept.promptSha256,
      seed: concept.seed,
      segmentation: concept.segmentation,
    }, null, 2)}\n`);
    console.log(JSON.stringify({ concept: path.relative(repoRoot, concept.transparent) }, null, 2));
    return;
  }
  const trellisBase = path.join(outputRoot, "trellis-geometry");
  console.log("[dinov3-barrel] generating TRELLIS.2/DINOv3 geometry");
  await execFileAsync(python, [
    generator, concept.transparent,
    "--seed", "137",
    "--output", trellisBase,
    "--pipeline-type", "512",
    "--target-faces", "50000",
    "--steps", "12",
    "--conditioning-background", "neutral-gray",
    "--no-texture",
  ], {
    cwd: path.dirname(generator),
    env: {
      ...process.env,
      DEVELOPER_DIR: "/Library/Developer/CommandLineTools",
      MTL_CAPTURE_ENABLED: process.env.MTL_CAPTURE_ENABLED ?? "1",
      PYTORCH_ENABLE_MPS_FALLBACK: "1",
      TRELLIS_SKIP_REMBG: "1",
    },
    maxBuffer: 64 * 1024 * 1024,
  });

  const generated = `${trellisBase}.glb`;
  const generatedGeometry = geometrySummary(parseGlb(await fs.readFile(generated)));
  const generatedSize = generatedGeometry.size;
  const generatedHorizontalRatio = Math.min(generatedSize[0], generatedSize[2])
    / Math.max(generatedSize[0], generatedSize[2]);
  if (generatedHorizontalRatio < 0.55) {
    const rejected = {
      passed: false,
      reason: "generated-depth-collapse",
      minimumHorizontalAspectRatio: 0.55,
      measuredHorizontalAspectRatio: generatedHorizontalRatio,
      geometry: generatedGeometry,
    };
    await atomicWrite(
      path.join(outputRoot, "generation-rejection.json"),
      `${JSON.stringify(rejected, null, 2)}\n`,
    );
    throw new Error(
      `TRELLIS geometry rejected before scaling: horizontal aspect ${generatedHorizontalRatio.toFixed(3)} < 0.55`,
    );
  }
  const final = path.join(outputRoot, "final.glb");
  const cleanupReport = path.join(outputRoot, "material-authoring.json");
  const placementSize = JSON.parse(await fs.readFile(
    path.join(repoRoot, "assets/generated/eq-catalog/objects/barrel4/description.json"),
    "utf8",
  )).geometry.size;
  console.log("[dinov3-barrel] authoring independent UV-aligned material");
  await execFileAsync(blender, [
    "--background", "--factory-startup", "--python", author, "--",
    generated, final, "barrel4", "16000", cleanupReport,
    JSON.stringify(placementSize),
    "independent-text-concept-trellis2-dinov3-generated-no-legacy-assets",
  ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });

  let document = parseGlb(await fs.readFile(final));
  document = await addPbrChannels(document, {
    normalStrength: 1.25,
    normalScale: 0.8,
    roughness: 0.82,
    roughnessVariation: 0.1,
  });
  await atomicWrite(final, serializeGlb(document));
  const integrityFile = path.join(outputRoot, "integrity.json");
  await execFileAsync(blender, [
    "--background", "--factory-startup", "--python", validator, "--",
    final, integrityFile, "beveled-furniture",
  ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });

  const snapshot = path.join(outputRoot, "image-validation.png");
  await renderGlbReferenceSheet({
    glbs: [{ label: "Clean-room DINOv3/TRELLIS.2 barrel", path: final }],
    output: snapshot,
    width: 1200,
    height: 1200,
    frontAxis: "-xz-high",
  });
  const finalBytes = await fs.readFile(final);
  const report = {
    kind: "requiem.dinov3-clean-room-object-example",
    version: 1,
    id: "barrel4",
    passed: false,
    visualVerdict: "envelope-only-semantic-detail-not-promotable",
    cleanRoom: {
      conditioning: concept.conditioning,
      concept: path.relative(repoRoot, concept.transparent).replaceAll(path.sep, "/"),
      conceptSha256: sha256(await fs.readFile(concept.transparent)),
      promptSha256: concept.promptSha256,
      conceptSeed: concept.seed,
      trellisSeed: 137,
      noLegacyPixelsMeshesUvsOrTextures: true,
    },
    generation: {
      backend: "microsoft/TRELLIS.2-4B",
      conditioningModel: "facebook/dinov3-vitl16-pretrain-lvd1689m",
      pipelineType: "512",
      samplerSteps: 12,
      geometryFacesBeforeMaterialAuthoring: generatedGeometry.triangleCount,
      conditioningBackground: "neutral-gray",
      blenderVoxelRemesh: false,
      nativeVoxelMaterialDiscarded: true,
    },
    final: {
      file: path.relative(repoRoot, final).replaceAll(path.sep, "/"),
      sha256: sha256(finalBytes),
      geometry: geometrySummary(parseGlb(finalBytes)),
      snapshot: path.relative(repoRoot, snapshot).replaceAll(path.sep, "/"),
      snapshotSha256: sha256(await fs.readFile(snapshot)),
      integrity: JSON.parse(await fs.readFile(integrityFile, "utf8")),
      materialAuthoring: JSON.parse(await fs.readFile(cleanupReport, "utf8")),
    },
    generatedAt: new Date().toISOString(),
  };
  const reportFile = path.join(outputRoot, "report.json");
  await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  console.log("[dinov3-barrel] building automatic class-conditioned clean-room retopology");
  const enhanced = path.join(outputRoot, "final-enhanced.glb");
  const enhancementFile = path.join(outputRoot, "enhancement.json");
  const enhancedIntegrityFile = path.join(outputRoot, "integrity-enhanced.json");
  const enhancedSnapshot = path.join(outputRoot, "image-validation-enhanced.png");
  await execFileAsync(blender, [
    "--background", "--factory-startup", "--python", proceduralBuilder, "--",
    "barrel3", enhanced, enhancementFile,
  ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });
  await execFileAsync(blender, [
    "--background", "--factory-startup", "--python", validator, "--",
    enhanced, enhancedIntegrityFile, "beveled-furniture",
  ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });
  await renderGlbReferenceSheet({
    glbs: [{ label: "DINOv3 envelope + automatic clean-room retopology", path: enhanced }],
    output: enhancedSnapshot,
    width: 1200,
    height: 1200,
    frontAxis: "-xz-high",
  });
  const enhancedBytes = await fs.readFile(enhanced);
  const enhancedGeometry = geometrySummary(parseGlb(enhancedBytes));
  const enhancedIntegrity = JSON.parse(await fs.readFile(enhancedIntegrityFile, "utf8"));
  const placementFitPassed = enhancedGeometry.size.every(
    (dimension, index) => dimension <= placementSize[index] * 1.001,
  );
  const enhancedReport = {
    kind: "requiem.dinov3-clean-room-object-example",
    version: 2,
    id: "barrel4",
    passed: placementFitPassed && enhancedIntegrity.passed,
    promotion: "not-performed",
    cleanRoom: report.cleanRoom,
    generation: {
      ...report.generation,
      envelopeFile: path.relative(repoRoot, generated).replaceAll(path.sep, "/"),
      envelopeSha256: sha256(await fs.readFile(generated)),
      envelopeGeometry: generatedGeometry,
      horizontalAspectRatio: generatedHorizontalRatio,
      minimumHorizontalAspectRatio: 0.55,
    },
    enhancement: {
      policy: "automatic-class-conditioned-clean-room-retopology-v1",
      report: JSON.parse(await fs.readFile(enhancementFile, "utf8")),
      semanticParts: [
        "bulged-stave-body", "modeled-stave-seams", "inset-lid",
        "raised-iron-hoops", "modeled-rivets",
      ],
      standalonePbrMaterials: ["oak", "forged-iron", "stave-groove"],
      nativeVoxelMaterialDiscarded: true,
    },
    final: {
      file: path.relative(repoRoot, enhanced).replaceAll(path.sep, "/"),
      sha256: sha256(enhancedBytes),
      geometry: enhancedGeometry,
      placementEnvelope: placementSize,
      placementFitPassed,
      integrity: enhancedIntegrity,
      snapshot: path.relative(repoRoot, enhancedSnapshot).replaceAll(path.sep, "/"),
      snapshotSha256: sha256(await fs.readFile(enhancedSnapshot)),
    },
    generatedAt: new Date().toISOString(),
  };
  const enhancedReportFile = path.join(outputRoot, "report-enhanced.json");
  await atomicWrite(enhancedReportFile, `${JSON.stringify(enhancedReport, null, 2)}\n`);
  console.log(JSON.stringify({
    envelopeReport: path.relative(repoRoot, reportFile),
    enhancedReport: path.relative(repoRoot, enhancedReportFile),
    final: enhancedReport.final.file,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
