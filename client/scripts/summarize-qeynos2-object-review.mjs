#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const auditFile = path.join(repoRoot, "assets/generated/object-replacements/qeynos2-object-rest-audit.json");
const outputRoot = path.dirname(auditFile);
const indexFile = path.join(outputRoot, "qeynos2-object-review-index.json");

const relative = (file) => path.relative(repoRoot, file).replaceAll(path.sep, "/");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

async function stackReviewSheets(files, output) {
  const width = 840;
  const images = [];
  let height = 0;
  for (const file of files) {
    const input = await sharp(file).resize({ width }).png().toBuffer();
    const metadata = await sharp(input).metadata();
    images.push({ input, left: 0, top: height });
    height += metadata.height;
  }
  await sharp({ create: { width, height, channels: 3, background: "#151813" } })
    .composite(images)
    .png()
    .toFile(output);
}

async function main() {
  const audit = await readJson(auditFile);
  const reviewed = [];
  const sheets = [];
  for (const batch of audit.batches) {
    const root = path.join(repoRoot, "assets/generated/object-replacements", batch.passId);
    const report = await readJson(path.join(root, "report.json"));
    const manifest = await readJson(path.join(repoRoot, report.manifest));
    const decisionById = new Map(manifest.assets.map((asset) => [asset.id, asset.review]));
    sheets.push(path.join(root, "four-asset-image-validation.png"));
    for (const asset of report.assets) {
      const failedChecks = Object.entries(asset.checks)
        .filter(([name, passed]) => name !== "visualApproval" && !passed)
        .map(([name]) => name);
      const review = decisionById.get(asset.id);
      const state = failedChecks.length
        ? "automated-rejected"
        : review.decision === "rejected"
          ? "visual-rejected"
          : review.decision;
      reviewed.push({
        id: asset.id,
        passId: batch.passId,
        state,
        failedChecks,
        reviewReason: review.reason,
        validation: asset.validation,
      });
    }
  }

  const pages = [];
  for (let index = 0; index < sheets.length; index += 3) {
    const page = path.join(outputRoot, `qeynos2-object-review-mobile-${String(index / 3 + 1).padStart(2, "0")}.png`);
    await stackReviewSheets(sheets.slice(index, index + 3), page);
    pages.push(relative(page));
  }
  const index = {
    kind: "requiem.qeynos2-object-review-index",
    version: 1,
    audit: relative(auditFile),
    counts: {
      promoted: audit.counts.promoted,
      pending: reviewed.filter((item) => item.state === "pending").length,
      automatedRejected: reviewed.filter((item) => item.state === "automated-rejected").length,
      visualRejected: reviewed.filter((item) => item.state === "visual-rejected").length,
      blocked: audit.counts.blocked,
    },
    blocked: audit.blocked.map(({ id, reason, placements }) => ({ id, reason, placements })),
    mobileReviewPages: pages,
    objects: reviewed,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  console.log(JSON.stringify({ index: relative(indexFile), counts: index.counts, mobileReviewPages: pages }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
