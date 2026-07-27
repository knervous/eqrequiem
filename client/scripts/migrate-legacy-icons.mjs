#!/usr/bin/env node

import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  createPassthroughMasters,
  loadCollectionManifest,
  naturalSheetNumber,
  repackSheets,
  sliceSheet,
  verifyRepackedSheet,
  writeCollectionManifest,
} from './icon-ai/sprite-pipeline.mjs';
import { generateMasters } from './icon-ai/sdcpp-client.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultSource = path.join(repositoryRoot, '.cache', 'icon-ai', 'legacy-sheets');
const defaultOutput = path.join(repositoryRoot, 'artifacts', 'generated-icons', 'legacy-sheet-migration');

function usage() {
  console.log(`Local legacy fantasy-icon sprite migration

Usage:
  node scripts/migrate-legacy-icons.mjs slice [--input DIR] [--output DIR]
  node scripts/migrate-legacy-icons.mjs download [--input DIR] [--last-sheet N]
  node scripts/migrate-legacy-icons.mjs generate [--output DIR] [--limit N] [--strength 0.34]
  node scripts/migrate-legacy-icons.mjs passthrough [--output DIR]
  node scripts/migrate-legacy-icons.mjs repack [--input DIR] [--output DIR]
    [--format png|webp] [--from masters|slices]
  node scripts/migrate-legacy-icons.mjs verify [--input DIR] [--output DIR]

Workflow:
  1. Put dragitemN.webp/png sheets in --input.
  2. Run slice to produce stable per-slot PNGs and sprite-manifest.json.
  3. Run generate with a loopback sd-server configured by SDCPP_URL.
  4. Run repack to create original-layout dragitemN sprite maps.

Download explicitly acquires the existing dragitem sheets; it never downloads model weights.
Passthrough creates 64×64 non-AI masters for geometry testing only.
Use "--from slices --format png" for a visually lossless atlas geometry check.`);
}

function parseArguments(argv) {
  const [command = 'help', ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

async function sourceSheets(inputDirectory) {
  const entries = await readdir(inputDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && naturalSheetNumber(entry.name) !== null)
    .map((entry) => path.join(inputDirectory, entry.name))
    .sort((a, b) => naturalSheetNumber(a) - naturalSheetNumber(b));
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function downloadLegacySheets({
  inputDirectory,
  baseUrl,
  lastSheet = null,
  maximumSheet = 512,
  blockSize = 16,
}) {
  const root = new URL(baseUrl);
  if (root.protocol !== 'https:') throw new Error('Legacy sheet base URL must use HTTPS');
  await mkdir(inputDirectory, { recursive: true });
  let downloaded = 0;
  let discovered = 0;
  for (let start = 1; start <= (lastSheet ?? maximumSheet); start += blockSize) {
    const end = Math.min(start + blockSize - 1, lastSheet ?? maximumSheet);
    const block = await Promise.all(
      Array.from({ length: end - start + 1 }, async (_, offset) => {
        const sheetNumber = start + offset;
        const fileName = `dragitem${sheetNumber}.webp`;
        const outputPath = path.join(inputDirectory, fileName);
        if (await pathExists(outputPath)) return { found: true, downloaded: false, fileName };
        const url = new URL(fileName, root);
        const response = await fetch(url);
        if (response.status === 404) return { found: false, downloaded: false, fileName };
        if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
        const data = Buffer.from(await response.arrayBuffer());
        const metadata = await sharp(data).metadata();
        if (metadata.width !== 256 || metadata.height !== 256) {
          throw new Error(`${fileName} has unexpected ${metadata.width}×${metadata.height} geometry`);
        }
        await writeFile(outputPath, data);
        return { found: true, downloaded: true, fileName };
      }),
    );
    const foundInBlock = block.filter((result) => result.found).length;
    discovered += foundInBlock;
    downloaded += block.filter((result) => result.downloaded).length;
    for (const result of block.filter((candidate) => candidate.downloaded)) {
      console.log(`downloaded ${result.fileName}`);
    }
    if (lastSheet === null && discovered > 0 && foundInBlock === 0) break;
  }
  return { downloaded, discovered };
}

async function run() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const inputDirectory = path.resolve(options.input ?? defaultSource);
  const outputRoot = path.resolve(options.output ?? defaultOutput);

  if (command === 'help' || command === '--help') {
    usage();
    return;
  }
  if (command === 'download') {
    const result = await downloadLegacySheets({
      inputDirectory,
      baseUrl:
        options['base-url'] ??
        'https://eqrequiem.blob.core.windows.net/requiem/uifiles/default/',
      lastSheet: options['last-sheet'] ? Number(options['last-sheet']) : null,
    });
    console.log(`discovered ${result.discovered} sheets; downloaded ${result.downloaded}`);
    return;
  }
  if (command === 'slice') {
    const sheets = await sourceSheets(inputDirectory);
    if (sheets.length === 0) throw new Error(`No dragitem sheets found in ${inputDirectory}`);
    await mkdir(outputRoot, { recursive: true });
    const manifests = [];
    for (const sheetPath of sheets) {
      manifests.push(await sliceSheet({ sheetPath, outputRoot }));
      console.log(`sliced ${path.basename(sheetPath)}`);
    }
    const { manifestPath } = await writeCollectionManifest({ outputRoot, sheets: manifests });
    console.log(`manifest ${manifestPath}`);
    return;
  }
  const manifest = await loadCollectionManifest(outputRoot);
  if (command === 'passthrough') {
    const completed = await createPassthroughMasters({ outputRoot, manifest });
    console.log(`created ${completed} passthrough masters`);
    return;
  }
  if (command === 'generate') {
    const completed = await generateMasters({
      outputRoot,
      manifest,
      limit: options.limit ? Number(options.limit) : Infinity,
      strength: options.strength ? Number(options.strength) : 0.34,
    });
    console.log(`completed or resumed ${completed} generated masters`);
    return;
  }
  if (command === 'repack') {
    const results = await repackSheets({
      outputRoot,
      sourceDirectory: inputDirectory,
      manifest,
      format: options.format ?? 'webp',
      from: options.from ?? 'masters',
    });
    for (const result of results) console.log(`repacked ${result.outputPath}`);
    return;
  }
  if (command === 'verify') {
    let failed = false;
    for (const sheet of manifest.sheets) {
      const repackedPath = path.join(outputRoot, 'repacked', `${sheet.sheetId}.png`);
      const comparison = await verifyRepackedSheet({
        outputRoot,
        sheet,
        repackedPath,
      });
      console.log(
        `${sheet.sheetId}: equal=${comparison.equal} ` +
          `differingBytes=${comparison.differingBytes} maxDelta=${comparison.maximumDelta} ` +
          `paddingAlpha=${comparison.paddingAlphaMaximum}`,
      );
      failed ||= !comparison.equal;
    }
    if (failed) process.exitCode = 1;
    return;
  }
  usage();
  throw new Error(`Unknown command: ${command}`);
}

run().catch((error) => {
  console.error(`icon migration failed: ${error.message}`);
  process.exitCode = 1;
});
