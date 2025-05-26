#!/usr/bin/env node

import fs from "fs-extra";
import path from "path";
import sharp from "sharp";
import pLimit from "p-limit";
import m from "maxrects-packer";
import { convertToWebP } from "./convert.js";
const MaxRectsPacker = m.MaxRectsPacker;

// Root folder for your .dds files (defaults to CWD or pass as first arg)
const rootPath = process.argv[2] || process.cwd();
console.log(`Using root path: ${rootPath}`);

// Output folder for atlases
const outputDir = path.join(rootPath, "atlas");

// Ensure output directory exists
await fs.ensureDir(outputDir);

const prefixes = {
  Face: "he",
  Chest: "ch",
  Arms: "ua",
  Wrists: "fa",
  Legs: "lg",
  Hands: "hn",
  Feet: "ft",
  Helm: "he",
  Head: "hd",
};

// Regex to match e.g. "humhe0107.dds" =>
//   model="hum", piece="he", variation="01", tex="07"
const charFileRegex = /^([a-z]{3})([a-z]{2})(\d{2})(\d{2})\.dds$/;

// 1) Recursively scan & group by model → piece → variation → [textureNumbers]
const models = {};
const seenBasenames = new Set();

// Recursive function to collect DDS files, deduplicating by basename
async function collectDDSFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recurse into subdirectories
      files.push(...(await collectDDSFiles(fullPath)));
    } else if (entry.isFile() && charFileRegex.test(entry.name)) {
      const basename = path.basename(fullPath);
      if (!seenBasenames.has(basename)) {
        seenBasenames.add(basename);
        files.push(fullPath);
      }
    }
  }

  return files;
}

// Scan and group files
const ddsFiles = await collectDDSFiles(rootPath);
for (const filePath of ddsFiles) {
  const file = path.basename(filePath);
  const m = file.match(charFileRegex);
  if (!m) continue;

  const [, model, piece, variation, texNum] = m;
  const varNum = parseInt(variation, 10);
  const texIdx = parseInt(texNum, 10);
  if (isNaN(varNum) || isNaN(texIdx)) {
    console.warn(`Skipping invalid file: ${file}`);
    continue;
  }

  // Validate piece prefix exists in prefixes map
  const prefixExists = Object.values(prefixes).includes(piece);
  if (!prefixExists) {
    console.log(`Invalid piece prefix "${piece}" in file "${file}" does not exist in prefixes map.`);
  }

  models[model] ??= {};
  models[model][piece] ??= {};
  models[model][piece][varNum] ??= [];
  models[model][piece][varNum].push({ texIdx, filePath });
}

// Helper: build full file‐path list for one model
function filePathsForModel(modelName) {
  const arr = [];
  for (const piece in models[modelName]) {
    for (const variation in models[modelName][piece]) {
      for (const { filePath } of models[modelName][piece][variation]) {
        arr.push(filePath);
      }
    }
  }
  return arr;
}

// 2) Build one or more atlases + JSON for a given model
async function buildAtlasForModel(modelName) {
  const srcList = filePathsForModel(modelName);
  if (srcList.length === 0) {
    console.log(`⚠️  No files for model ${modelName}, skipping.`);
    return;
  }

  console.log(`🗂 Packing ${srcList.length} sprites for model "${modelName}"…`);

  // Load all images, convert DDS to WebP in memory, and get metadata
  const images = await Promise.all(
    srcList.map(async (filePath) => {
      const ddsBuffer = await fs.readFile(filePath);
      const webpBuffer = await convertToWebP(
        ddsBuffer,
        path.basename(filePath),
      );
      const img = sharp(webpBuffer);
      const meta = await img.metadata();
      return {
        path: filePath,
        width: meta.width,
        height: meta.height,
        buffer: webpBuffer,
      };
    }),
  );

  // Create a packer (max 2048×2048, no padding—adjust if you need margins)
  const packer = new MaxRectsPacker(2048, 2048, 0, { smart: true, pot: true });
  images.forEach((img) => packer.add(img.width, img.height, img));

  // For each bin (page) output an atlas + JSON
  for (let i = 0; i < packer.bins.length; i++) {
    const bin = packer.bins[i];
    // Create blank transparent canvas
    let canvas = sharp({
      create: {
        width: bin.width,
        height: bin.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });

    // Composite all sprites into it
    const composites = bin.rects.map((r) => ({
      input: r.data.buffer,
      left: r.x,
      top: r.y,
    }));
    canvas = canvas.composite(composites);

    // Export to WebP
    const outBuf = await canvas.webp({ quality: 90 }).toBuffer();
    const suffix = packer.bins.length > 1 ? `_${i}` : "";
    const base = `${modelName}${suffix}`;

    await fs.writeFile(path.join(outputDir, `${base}.webp`), outBuf);

    // Build JSON map in the requested format
    const coords = {};
    for (const r of bin.rects) {
      const fileName = path.basename(r.data.path);
      const m = fileName.match(charFileRegex);
      if (!m) continue;
      const [, , piece, variation, texNum] = m;
      const varNum = parseInt(variation, 10);
      const texIdx = parseInt(texNum, 10);

      // Initialize nested structure
      coords[piece] = coords[piece] || {
        variations: {},
      };
      coords[piece].variations[varNum] = coords[piece].variations[varNum] || {
        textures: {},
      };
      coords[piece].variations[varNum].textures[texIdx] = {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      };
    }
    await fs.writeJson(path.join(outputDir, `${base}.json`), coords, {
      spaces: 2,
    });

    console.log(`✅ Generated ${base}.webp + ${base}.json in atlas folder`);
  }
}

// 3) Run through all models with concurrency limit
(async () => {
  try {
    const limit = pLimit(2);
    const jobs = Object.keys(models).map((model) =>
      limit(() => buildAtlasForModel(model)),
    );
    await Promise.all(jobs);
    console.log("🎉 All atlases generated in atlas folder.");
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
})();