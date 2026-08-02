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
import {
  createPocContactSheet,
  generateMasters,
  generateNewMasters,
  summarizeGenerationFailures,
} from './icon-ai/sdcpp-client.mjs';
import { IconContextDatabase } from './icon-ai/icon-context.mjs';
import { SdCppServer } from './icon-ai/sdcpp-server.mjs';
import {
  assertPromotable,
  auditGeneratedCollection,
  promoteGeneratedCollection,
} from './icon-ai/production-assets.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultSource = path.join(repositoryRoot, '.cache', 'icon-ai', 'legacy-sheets');
const defaultOutput = path.join(repositoryRoot, 'artifacts', 'generated-icons', 'legacy-sheet-migration');
const defaultContextDatabase = path.join(repositoryRoot, 'serverjs', 'data', 'game_content.sqlite');
const defaultPublicItems = path.join(repositoryRoot, 'client', 'public', 'eltania', 'items');

function usage() {
  console.log(`Local legacy fantasy-icon sprite migration

Usage:
  node scripts/migrate-legacy-icons.mjs slice [--input DIR] [--output DIR]
  node scripts/migrate-legacy-icons.mjs download [--input DIR] [--last-sheet N]
  node scripts/migrate-legacy-icons.mjs generate [--output DIR] [--database FILE] [--limit N]
    [--size 256|384|512] [--master-size 64|128|256|512] [--steps N] [--ids ID,ID]
  node scripts/migrate-legacy-icons.mjs vary [--output DIR] [--limit N] [--strength 0.34]
  node scripts/migrate-legacy-icons.mjs poc [--output DIR] [--limit N] [--strength 0.34]
    [--size 384] [--master-size 256] [--steps 12] [--force true|false]
  node scripts/migrate-legacy-icons.mjs all [--output DIR] [--database FILE]
    [--size 384] [--master-size 256] [--steps 12] [--seed-offset N]
    [--passes N] [--allow-partial true|false]
  node scripts/migrate-legacy-icons.mjs passthrough [--output DIR]
  node scripts/migrate-legacy-icons.mjs repack [--input DIR] [--output DIR]
    [--format png|webp] [--from masters|slices]
  node scripts/migrate-legacy-icons.mjs verify [--input DIR] [--output DIR]
  node scripts/migrate-legacy-icons.mjs audit [--output DIR] [--master-size 256]
  node scripts/migrate-legacy-icons.mjs promote [--output DIR] [--public DIR] [--version v1]
    [--allow-partial true|false]

Workflow:
  1. Put dragitemN.webp/png sheets in --input.
  2. Run slice to produce stable per-slot PNGs and sprite-manifest.json.
  3. Run generate with a loopback sd-server configured by SDCPP_URL.
  4. Run repack to create original-layout dragitemN sprite maps.

Download explicitly acquires the existing dragitem sheets; it never downloads model weights.
Passthrough creates 256×256 non-AI masters for geometry testing only.
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

function integerOption(options, key, fallback, { minimum, maximum, allowed = null }) {
  if (options[key] === undefined) return fallback;
  const value = Number(options[key]);
  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum ||
    (allowed && !allowed.includes(value))
  ) {
    const expected = allowed
      ? allowed.join('|')
      : `an integer from ${minimum} to ${maximum}`;
    throw new Error(`Invalid --${key}=${options[key]}; expected ${expected}`);
  }
  return value;
}

function booleanOption(options, key, fallback = false) {
  if (options[key] === undefined) return fallback;
  if (options[key] === 'true') return true;
  if (options[key] === 'false') return false;
  throw new Error(`Invalid --${key}=${options[key]}; expected true|false`);
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
  if (command === 'audit') {
    const audit = await auditGeneratedCollection({
      outputRoot,
      manifest,
      masterSize: options['master-size'] ? Number(options['master-size']) : 256,
    });
    console.log(
      `valid=${audit.valid.length} failed=${audit.failures.length} ` +
        `blank=${audit.blank} total=${audit.total} recipe=${audit.recipeVersion}`,
    );
    assertPromotable(audit);
    return;
  }
  if (command === 'promote') {
    const result = await promoteGeneratedCollection({
      outputRoot,
      manifest,
      publicItemsRoot: path.resolve(options.public ?? defaultPublicItems),
      version: options.version ?? 'v1',
      masterSize: options['master-size'] ? Number(options['master-size']) : 256,
      allowPartial: booleanOption(options, 'allow-partial'),
    });
    console.log(`promoted ${result.iconCount} icons atomically to ${result.targetRoot}`);
    return;
  }
  if (command === 'passthrough') {
    const completed = await createPassthroughMasters({ outputRoot, manifest });
    console.log(`created ${completed} passthrough masters`);
    return;
  }
  if (command === 'generate' || command === 'vary' || command === 'poc' || command === 'all') {
    if (
      command === 'all' &&
      (options.ids !== undefined ||
        options.limit !== undefined ||
        options.force !== undefined)
    ) {
      throw new Error(
        'The all command always resumes the closed collection; use poc with --ids to force slots',
      );
    }
    const externalServer = Boolean(process.env.SDCPP_URL);
    const server =
      (command === 'poc' || command === 'all') && !externalServer
        ? new SdCppServer({ quiet: command === 'all' })
        : null;
    const ids = options.ids
      ? new Set(options.ids.split(',').map((id) => id.trim()).filter(Boolean))
      : null;
    if (ids) {
      const availableIds = new Set(
        manifest.sheets.flatMap((sheet) =>
          sheet.entries.filter((entry) => !entry.blank).map((entry) => entry.id),
        ),
      );
      const unknownIds = [...ids].filter((id) => !availableIds.has(id));
      if (unknownIds.length > 0) {
        throw new Error(`Unknown or blank icon IDs: ${unknownIds.join(', ')}`);
      }
    }
    const force = booleanOption(options, 'force');
    const allowPartial = booleanOption(options, 'allow-partial');
    if (allowPartial && command !== 'all') {
      throw new Error('--allow-partial true is supported only by all or promote');
    }
    if (force && !ids) {
      throw new Error('--force true requires an explicit closed --ids list');
    }
    let completed;
    let contextDatabase;
    try {
      const common = {
        outputRoot,
        manifest,
        limit: integerOption(
          options,
          'limit',
          command === 'poc' ? (ids?.size ?? 4) : Number.MAX_SAFE_INTEGER,
          { minimum: 1, maximum: 6_396 },
        ),
        generationSize: options.size
          ? integerOption(options, 'size', 384, {
              minimum: 256,
              maximum: 1024,
              allowed: [256, 384, 512, 768, 1024],
            })
          : command === 'poc'
            ? 384
            : command === 'all'
              ? 384
              : 512,
        masterSize: integerOption(options, 'master-size', 256, {
          minimum: 64,
          maximum: 1024,
          allowed: [64, 128, 256, 512, 1024],
        }),
        steps: options.steps
          ? integerOption(options, 'steps', 12, { minimum: 1, maximum: 150 })
          : command === 'poc'
            ? 12
            : command === 'all'
              ? 12
              : 24,
        ids,
        force,
      };
      if (server) {
        console.log('starting loopback sd.cpp server and loading the local checkpoint');
        await server.start();
        process.env.SDCPP_URL = server.baseUrl;
      } else if (externalServer && (command === 'poc' || command === 'all')) {
        console.log(`using external sd.cpp server at ${process.env.SDCPP_URL}`);
      }
      if (command === 'vary') {
        completed = await generateMasters({
          ...common,
          strength: options.strength ? Number(options.strength) : 0.34,
        });
      } else {
        contextDatabase = new IconContextDatabase(
          path.resolve(options.database ?? defaultContextDatabase),
        );
        if (command === 'all') {
          const firstSeedOffset = integerOption(options, 'seed-offset', 0, {
            minimum: 0,
            maximum: 1_000_000,
          });
          const passes = integerOption(options, 'passes', 4, {
            minimum: 1,
            maximum: 100,
          });
          for (let pass = 0; pass < passes; pass += 1) {
            const seedOffset = firstSeedOffset + pass * 5;
            console.log(`generation pass ${pass + 1}/${passes}, seed offset ${seedOffset}`);
            completed = await generateNewMasters({
              ...common,
              contextDatabase,
              continueOnError: true,
              seedOffset,
              verboseRejections: false,
            });
            if (completed.failures.length === 0) break;
            console.warn(
              `${completed.failures.length} icons remain after pass ${pass + 1}; ` +
                'continuing with a fresh deterministic seed range',
            );
          }
        } else {
          completed = await generateNewMasters({
            ...common,
            contextDatabase,
            continueOnError: command === 'poc',
            seedOffset: integerOption(options, 'seed-offset', 0, {
              minimum: 0,
              maximum: 1_000_000,
            }),
          });
        }
      }
    } finally {
      contextDatabase?.close();
      if (server) await server.stop();
    }
    const completedCount =
      typeof completed === 'number' ? completed : completed.completed;
    console.log(`completed or resumed ${completedCount} generated masters`);
    if (typeof completed !== 'number' && completed.failures.length > 0) {
      const failurePath = path.join(outputRoot, 'generation-failures.json');
      await writeFile(
        failurePath,
        `${JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            seedOffset: options['seed-offset'] ? Number(options['seed-offset']) : 0,
            summary: summarizeGenerationFailures(completed.failures),
            failures: completed.failures,
          },
          null,
          2,
        )}\n`,
      );
      if ((command === 'all' || command === 'poc') && !(command === 'all' && allowPartial)) {
        throw new Error(
          `${completed.failures.length} icons failed transparent-output validation; ` +
            `details saved to ${failurePath}`,
        );
      }
      console.warn(
        `${completed.failures.length} icons remain unresolved; ` +
          'publishing the accepted first-pass set because partial promotion was requested',
      );
    }
    if (command === 'poc') {
      const contactSheet = await createPocContactSheet({
        outputRoot,
        manifest,
        limit: options.limit ? Number(options.limit) : (ids?.size ?? 4),
        ids,
        masterSize: options['master-size'] ? Number(options['master-size']) : 256,
      });
      console.log(`POC contact sheet ${contactSheet}`);
    }
    if (command === 'all') {
      const results = await repackSheets({
        outputRoot,
        sourceDirectory: inputDirectory,
        manifest,
        format: 'webp',
        from: 'masters',
      });
      console.log(`repacked ${results.length} generated sprite maps`);
      const result = await promoteGeneratedCollection({
        outputRoot,
        manifest,
        publicItemsRoot: path.resolve(options.public ?? defaultPublicItems),
        version: options.version ?? 'v1',
        masterSize: options['master-size'] ? Number(options['master-size']) : 256,
        allowPartial,
      });
      console.log(`promoted ${result.iconCount} icons atomically to ${result.targetRoot}`);
    }
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
