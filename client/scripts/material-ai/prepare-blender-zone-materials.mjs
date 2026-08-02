#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  centeredBannerCompositionMetrics,
  paletteRoot,
  periodicSeamMetrics,
  readPaletteManifest,
  resizeRuntimeDataTexture,
  resizeRuntimeTexture,
  runtimeMaterialEntry,
} from "./zone-material-palette.mjs";

const PRIMARY_TEXTURE_SIZE = 512;
const BULK_TEXTURE_SIZE = 256;

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const zone = (process.argv[2] ?? "qeynos2").toLowerCase();
if (!/^[a-z0-9_]+$/.test(zone)) throw new Error(`Invalid zone '${zone}'`);

const loaded = await readPaletteManifest(repoRoot, zone);
if (!loaded?.manifest.enabled) throw new Error(`${zone} palette is disabled`);
const approved = loaded.manifest.materials.filter(
  (entry) => entry.enabled !== false && entry.status === "production-candidate",
);
if (approved.length !== loaded.manifest.materials.length) {
  throw new Error(`${zone} wholesale cache requires every material approved`);
}
const entries = approved.filter((entry) => !entry.authoringOnly);

const root = paletteRoot(repoRoot, zone);
const cacheRoot = path.join(os.tmpdir(), "eqrequiem-zone-material-cache", zone);
await fs.mkdir(cacheRoot, { recursive: true });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function runtimeBytes(relativeFile, kind, textureSize) {
  const input = await fs.readFile(path.join(root, relativeFile));
  const metadata = await sharp(input).metadata();
  if (metadata.width === textureSize && metadata.height === textureSize) {
    return input;
  }
  return kind === "base"
    ? resizeRuntimeTexture(input, textureSize)
    : resizeRuntimeDataTexture(input, textureSize, {
        tangentNormal: kind === "normal",
      });
}

function seamFailure(entry, kind, metrics) {
  const repeatedX = entry.tileability?.includes("x");
  const repeatedY = entry.tileability?.includes("y");
  return (
    (repeatedX &&
      (metrics.edgeRmseX > loaded.manifest.maxEdgeRmse ||
        metrics.gradientRmseX > loaded.manifest.maxGradientRmse)) ||
    (repeatedY &&
      (metrics.edgeRmseY > loaded.manifest.maxEdgeRmse ||
        metrics.gradientRmseY > loaded.manifest.maxGradientRmse))
  );
}

async function validateCompositionContract(entry, bytes) {
  const contract = entry.compositionContract;
  if (!contract) return null;
  if (contract.kind !== "centered-banner-on-masonry-v1") {
    throw new Error(
      `${entry.id} has unknown composition contract '${contract.kind}'`,
    );
  }
  const metrics = await centeredBannerCompositionMetrics(bytes);
  if (
    metrics.centerSaturation < contract.minimumCenterSaturation ||
    metrics.sideSaturation > contract.maximumSideSaturation ||
    metrics.saturationDelta < contract.minimumSaturationDelta
  ) {
    throw new Error(
      `${entry.id} reopened its gate-atlas composition disparity: ` +
        JSON.stringify(metrics),
    );
  }
  return metrics;
}

let cursor = 0;
const prepared = new Array(entries.length);
async function worker() {
  while (cursor < entries.length) {
    const index = cursor++;
    const entry = entries[index];
    const selected = runtimeMaterialEntry(loaded.manifest, entry);
    const textureSize = entry.id.startsWith("legacy-")
      ? BULK_TEXTURE_SIZE
      : PRIMARY_TEXTURE_SIZE;
    const files = {
      base: selected.output,
      normal: selected.pbr?.normal,
      metallicRoughness: selected.pbr?.metallicRoughness,
    };
    if (!files.normal || !files.metallicRoughness) {
      throw new Error(`${entry.id} has no complete portable PBR channels`);
    }
    const output = {};
    for (const [kind, relativeFile] of Object.entries(files)) {
      const bytes = await runtimeBytes(relativeFile, kind, textureSize);
      const metadata = await sharp(bytes).metadata();
      if (
        metadata.format !== "webp" ||
        metadata.width !== textureSize ||
        metadata.height !== textureSize
      ) {
        throw new Error(
          `${entry.id} ${kind} cache is not ${textureSize}px WebP`,
        );
      }
      const metrics = await periodicSeamMetrics(bytes);
      if (seamFailure(entry, kind, metrics)) {
        throw new Error(
          `${entry.id} ${kind} cache reopened a repeat seam: ` +
            JSON.stringify(metrics),
        );
      }
      const file = path.join(cacheRoot, `${entry.id}-${kind}.webp`);
      await fs.writeFile(file, bytes);
      output[kind] = {
        file,
        sha256: digest(bytes),
        seamMetrics: metrics,
        compositionMetrics:
          kind === "base"
            ? await validateCompositionContract(selected, bytes)
            : null,
      };
    }
    prepared[index] = {
      id: entry.id,
      runtimeMaterialId: selected.id,
      normalScale: selected.pbr.normalScale ?? 1,
      textureSize,
      ...output,
    };
  }
}

await Promise.all(Array.from({ length: 4 }, () => worker()));
const index = {
  schema: "requiem.blender-zone-material-cache",
  version: 2,
  zone,
  primaryTextureSize: PRIMARY_TEXTURE_SIZE,
  bulkTextureSize: BULK_TEXTURE_SIZE,
  materials: prepared,
};
const indexFile = path.join(cacheRoot, "manifest.json");
await fs.writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
console.log(
  `Prepared ${prepared.length} complete PBR materials (${BULK_TEXTURE_SIZE}px bulk, ${PRIMARY_TEXTURE_SIZE}px key surfaces) for Blender MCP at ${indexFile}`,
);
