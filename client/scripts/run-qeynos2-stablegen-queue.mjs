#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, "..");
const repoRoot = path.resolve(clientRoot, "..");
const pipeline = path.join(here, "object-replacement-pipeline.mjs");
const reportFile = path.join(
  repoRoot,
  "assets/generated/object-replacements/qeynos2-stablegen-queue-report.json",
);

async function run(command, manifest) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [pipeline, command, "--manifest", manifest],
    { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function main() {
  const probeOnly = process.argv.includes("--probe-only");
  const batches = Array.from({ length: 11 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      number,
      manifest: path.join(
        repoRoot,
        `assets/src/world/objects/replacements/qeynos2-pass-02-${number}.json`,
      ),
    };
  });
  const firstProbe = await run("stablegen-probe", batches[0].manifest);
  const backend = firstProbe.stablegen;
  if (!backend.ready) {
    const report = {
      kind: "requiem.qeynos2-stablegen-queue",
      version: 1,
      state: "blocked-open-backend",
      backend: {
        serverOnline: backend.serverOnline,
        trellis2Available: backend.trellis2Available,
        openGeometryReady: backend.openGeometryReady,
        openGeometry: backend.openGeometry,
        openGeometryError: backend.openGeometryError,
      },
      batches: 11,
      assets: 41,
      excludedStateful: 3,
      nextAction: "Start local ComfyUI and verify the repository-local TripoSG MPS runtime. No gated DINOv3 dependency is used.",
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = probeOnly ? 0 : 2;
    return;
  }
  if (probeOnly) {
    console.log(JSON.stringify({ state: "ready", backend }, null, 2));
    return;
  }
  if (backend.openGeometryReady) {
    const promotedBatches = [];
    for (const batch of batches) {
      const promotionFile = path.join(
        repoRoot,
        "assets/generated/object-replacements",
        `qeynos2-object-pass-02-${batch.number}`,
        "promotion.json",
      );
      try {
        const promotion = JSON.parse(await fs.readFile(promotionFile, "utf8"));
        promotedBatches.push({
          number: batch.number,
          passId: promotion.passId,
          ids: promotion.promoted.map(({ id }) => id),
        });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const promotedAssets = promotedBatches.reduce((total, batch) => total + batch.ids.length, 0);
    const nextBatch = batches.find((batch) =>
      !promotedBatches.some((promoted) => promoted.number === batch.number));
    const report = {
      kind: "requiem.qeynos2-stablegen-queue",
      version: 1,
      state: "ready-open-model-blender-material-pass",
      backend,
      batches: 11,
      assets: 41,
      excludedStateful: 3,
      promotedBatches,
      promotedAssets,
      remainingAssets: 41 - promotedAssets,
      nextBatch: nextBatch?.number ?? null,
      nextAction: nextBatch
        ? `Continue batch ${nextBatch.number} through TripoSG or deterministic Blender geometry, then run StableGen's sequential SDXL projection and bake in the isolated Blender MCP probe scene.`
        : "All static clean-room batches are promoted.",
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const completed = [];
  for (const batch of batches) {
    const generation = await run("stablegen-generate", batch.manifest);
    const review = await run("review", batch.manifest);
    completed.push({ number: batch.number, generation, review });
    await fs.writeFile(reportFile, `${JSON.stringify({
      kind: "requiem.qeynos2-stablegen-queue",
      version: 1,
      state: "running",
      completed,
      generatedAt: new Date().toISOString(),
    }, null, 2)}\n`);
  }
  const report = {
    kind: "requiem.qeynos2-stablegen-queue",
    version: 1,
    state: "awaiting-owner-review",
    completed,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: path.relative(repoRoot, reportFile), state: report.state }, null, 2));
}

main().catch(async (error) => {
  const report = {
    kind: "requiem.qeynos2-stablegen-queue",
    version: 1,
    state: "error",
    error: error.message,
    generatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
