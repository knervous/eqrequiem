#!/usr/bin/env node

import fs from "fs-extra";
import path from "path";
import pLimit from "p-limit";
import { execSync } from "child_process";
import { convertToSharp } from "./convert.js";

// (1) Root folder for your .dds files (defaults to CWD or pass as first arg)
const rootPath = process.argv[2] || process.cwd();
console.log(`Using root path: ${rootPath}`);

// (2) Output folder for “tex” (where .basis and .json will go)
const outputDir = path.join(rootPath, "basis");
await fs.ensureDir(outputDir);

const charFileRegex = /^([a-z]{3})([a-z]{2})(\d{2})(\d{2})\.dds$/;
const models = {};
const seenBasenames = new Set();

async function collectDDSFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await collectDDSFiles(fullPath));
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

// Scan & group DDS files
const ddsFiles = await collectDDSFiles(rootPath);
for (const filePath of ddsFiles) {
  const fileName = path.basename(filePath);
  const m = fileName.match(charFileRegex);
  if (!m) continue;

  const [, model, piece, variation, texNum] = m;
  const varNum = parseInt(variation, 10);
  const texIdx = parseInt(texNum, 10);
  if (isNaN(varNum) || isNaN(texIdx)) {
    console.warn(`Skipping invalid file: ${fileName}`);
    continue;
  }

  models[model] ??= {};
  models[model][piece] ??= {};
  models[model][piece][varNum] ??= [];
  models[model][piece][varNum].push({ texIdx, filePath });
}

// Helper: build a flat, ordered list of file‐paths for a given model
function filePathsForModel(modelName) {
  const arr = [];
  for (const piece of Object.keys(models[modelName] || {})) {
    for (const variation of Object.keys(models[modelName][piece])) {
      for (const { filePath } of models[modelName][piece][variation]) {
        arr.push(filePath);
      }
    }
  }
  return arr;
}

// (6) Process one model: decode each DDS → PNG → Basis, concatenate into .basis
async function processModel(modelName) {
  const srcList = filePathsForModel(modelName);
  if (srcList.length === 0) {
    console.log(`No files for model "${modelName}", skipping.`);
    return;
  }

  console.log(`Processing ${srcList.length} images for model "${modelName}"…`);

  const modelOutputDir = outputDir;
  await fs.ensureDir(modelOutputDir);

  // Hardcode dimensions to match desired output (adjust if needed)
  const maxWidth = 128;
  const maxHeight = 128;

  const pathList = [];
  const pngPaths = [];

  // 1. Convert all DDS files to PNGs
  for (const filePath of srcList) {
    const sharpImage = await convertToSharp(await fs.readFile(filePath), path.basename(filePath));
    const resizedImage = sharpImage.resize({
      width: maxWidth,
      height: maxHeight,
      fit: "fill",
    }).removeAlpha();

    const fileName = path.basename(filePath, ".dds");
    const pngPath = path.join(modelOutputDir, `${fileName}.png`);
    await resizedImage.png().toFile(pngPath);
    pngPaths.push(pngPath);
    pathList.push(fileName);
  }

  // 2. Run npx basisu with all PNGs for this model
  if (pngPaths.length > 0) {
    const basisOutputDir = modelOutputDir;
    const basisCommand = `npx basisu ${pngPaths.join(" ")} -output_file ${basisOutputDir}/${modelName}.basis  -tex_type 2darray`;
    try {
      execSync(basisCommand);
    } catch (error) {
      console.warn(`Failed to convert PNGs to basis for model ${modelName}: ${error.message}`);
    }


    // 3. Clean up all PNGs
    for (const pngPath of pngPaths) {
      await fs.remove(pngPath);
    }
  }

  // 4. Write the JSON file (array of strings)
  const jsonPath = path.join(modelOutputDir, `${modelName}.json`);
  await fs.writeJson(jsonPath, pathList, { spaces: 2 });
  console.log(`Generated JSON (paths only): ${jsonPath}`);
}

(async () => {
  try {
    const limit = pLimit(2);
    const jobs = Object.keys(models).map((model) =>
      limit(() => processModel(model))
    );
    await Promise.all(jobs);
    console.log("All Basis blocks and JSON files generated under 'basis/'.");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
})();