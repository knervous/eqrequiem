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
const outputDir = path.join(rootPath, '../basis');
await fs.ensureDir(outputDir);

// your regexes
const charFileRegex      = /^([a-z]{3})([a-z]{2})(\d{2})(\d{2})\.dds$/;
const clkRegex           = /clk\d{4}\.dds/i;        // “robe” files
const helmRegex   = /^(helm|chain).*\.dds/i;

// Recursively collect **all** DDS files matching a regex
async function collectExtraFiles(regex) {
  let out = [];
  const set = new Set();
  async function walk(dir) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && regex.test(ent.name) && !set.has(ent.name)) {
        out.push(full);
        set.add(ent.name);
      }
    }
  }
  await walk(rootPath);
  return out;
}

//— startup: prebuild the two extras lists once —//
const allClkFiles         = await collectExtraFiles(clkRegex);
const allHelmFiles = await collectExtraFiles(helmRegex);

//— now collect your normal char‐files —//
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
      const basename = entry.name;
      if (!seenBasenames.has(basename)) {
        seenBasenames.add(basename);
        files.push(fullPath);
      }
    }
  }
  return files;
}

const ddsFiles = await collectDDSFiles(rootPath);
for (const filePath of ddsFiles) {
  const m = path.basename(filePath).match(charFileRegex);
  if (!m) continue;
  const [, model, piece, variation, texNum] = m;
  const varNum = parseInt(variation, 10);
  const texIdx = parseInt(texNum, 10);
  if (isNaN(varNum) || isNaN(texIdx)) {
    console.warn(`Skipping invalid file: ${filePath}`);
    continue;
  }
  models[model] ??= {};
  models[model][piece]  ??= {};
  models[model][piece][varNum] ??= [];
  models[model][piece][varNum].push({ texIdx, filePath });
}

// Helper: flat, ordered list **plus** extras
function filePathsForModel(modelName) {
  const arr = [];

  // (a) all the char‐files you already collected
  for (const piece of Object.keys(models[modelName] || {})) {
    for (const variation of Object.keys(models[modelName][piece])) {
      for (const { filePath } of models[modelName][piece][variation]) {
        arr.push(filePath);
      }
    }
  }

  // // (b) if they wear robes, append all CLK files
  // if (wearsRobe(modelName)) {
  //   arr.push(...allClkFiles);
  // }

  // // (c) if they’re a PC model, append all helm-leather
  // if (pcModels.includes(modelName)) {
  //   arr.push(...allHelmFiles);
  // }

  // (d) dedupe in case of overlap
  return Array.from(new Set(arr));
}


// Generic extra‐processor for “clk” and “helm”
async function processExtra(label, fileList) {
  if (fileList.length === 0) {
    console.log(`No files for extra "${label}", skipping.`);
    return;
  }
  console.log(`Processing ${fileList.length} images for extra "${label}"…`);

  const pngPaths = [];
  const pathNames = [];

  // (1) DDS → PNG
  for (const filePath of fileList) {
    const img = await convertToSharp(await fs.readFile(filePath), path.basename(filePath));
    const resized = img.resize({ width:128, height:128, fit:"fill" }).removeAlpha();
    const base = path.basename(filePath, ".dds");
    const png = path.join(outputDir, `${label}-${base}.png`);
    await resized.png().toFile(png);
    pngPaths.push(png);
    pathNames.push(base);
  }

  // (2) basisu → .basis
  try {
    execSync(
      `npx basisu ${pngPaths.join(" ")} ` +
      `-output_file ${path.join(outputDir, `${label}.basis`)} ` +
      `-tex_type 2darray`
    );
  } catch (err) {
    console.warn(`basisu failed for extra "${label}": ${err.message}`);
  }

  // (3) cleanup PNGs
  await Promise.all(pngPaths.map(p => fs.remove(p)));

  // (4) write JSON list
  await fs.writeJson(
    path.join(outputDir, `${label}.json`),
    pathNames,
    { spaces: 2 }
  );
  console.log(`Wrote ${label}.json`);
}

// Process the extras first
await processExtra("clk",  allClkFiles);
await processExtra("helm", allHelmFiles);

// … then your existing processModel & main loop untouched …
async function processModel(modelName) {
  if (!modelName.startsWith('hum')) {
   // return
  }
  const srcList = filePathsForModel(modelName);
  if (srcList.length === 0) {
    console.log(`No files for model "${modelName}", skipping.`);
    return;
  }
  console.log(`Processing ${srcList.length} images for model "${modelName}"…`);

  const modelOutputDir = outputDir;
  await fs.ensureDir(modelOutputDir);

  const maxWidth  = 128;
  const maxHeight = 128;
  const pngPaths  = [];
  const pathList  = [];

  // 1) DDS → PNG
  for (const filePath of srcList) {
    const sharpImage = await convertToSharp(
      await fs.readFile(filePath),
      path.basename(filePath)
    );
    const resized = sharpImage.resize({
      width:  maxWidth,
      height: maxHeight,
      fit:   "fill",
    }).removeAlpha();

    const base = path.basename(filePath, ".dds");
    const png  = path.join(modelOutputDir, `${base}.png`);
    const relative = path.relative('.', png);
    await resized.png().toFile(relative);
    pngPaths.push(relative);
    pathList.push(base);
  }

  // 2) basisu → .basis
  if (pngPaths.length) {
    try {
      execSync(
        `npx basisu ${pngPaths.join(" ")} ` +
        `-output_file ${modelOutputDir}/${modelName}.basis ` +
        `-tex_type 2darray`
      );
    } catch (err) {
      console.warn(`basisu failed for ${modelName}: ${err.message}`);
    }
    // 3) cleanup PNGs
    await Promise.all(pngPaths.map(p => fs.remove(p)));
  }

  // 4) write JSON list
  await fs.writeJson(
    path.join(modelOutputDir, `${modelName}.json`),
    pathList,
    { spaces: 2 }
  );
  console.log(`Wrote ${modelName}.json`);
}

(async () => {
  try {
    const limit = pLimit(8);
    await Promise.all(
      Object.keys(models).map(name => limit(() => processModel(name)))
    );
    console.log("All .basis and .json files under 'basis/'.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
