#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { precompileAssemblyScript, type AscPrecompileConfig } from './asc/index.js';
import {
  packShadoModel,
  packShadoWorld,
  preprocessShadoWrappers,
  writeShadoModelManifest,
  type ShadoModelManifestConfig,
  type ShadoModelPackConfig,
  type ShadoWorldPackConfig,
  type WrapperPreprocessConfig,
} from './preprocess/index.js';
import {
  createShadoWorldAuthoring,
} from './world/index.js';

type ShadoConfig = {
  asc?: AscPrecompileConfig | AscPrecompileConfig[];
  wrappers?: WrapperPreprocessConfig | WrapperPreprocessConfig[];
  models?: ShadoModelPackConfig | ShadoModelPackConfig[];
  worlds?: ShadoWorldPackConfig | ShadoWorldPackConfig[];
  modelManifest?: ShadoModelManifestConfig;
};

function usage(): never {
  console.error(
    [
      'Usage:',
      '  shado asc build --config ./shado.config.mjs',
      '  shado wrappers build --config ./shado.config.mjs',
      '  shado gpu build --config ./shado.config.mjs',
      '  shado pack models --config ./shado.config.mjs',
      '  shado pack worlds --config ./shado.config.mjs',
      '  shado migrate worlds --input-dir ./zones --out-dir ./worlds [--metadata-dir ./zones] [--object-prefix /eqrequiem/objects] [--dry-run] [--overwrite]',
      '  shado manifest models --config ./shado.config.mjs',
      '  shado-preprocess-asc --config ./shado.config.mjs',
      '  shado-preprocess-wrappers --config ./shado.config.mjs',
      '  shado-preprocess-gpu --config ./shado.config.mjs',
      '  shado-pack-model --config ./shado.config.mjs',
      '',
      'Config shape:',
      '  export default {',
      '    asc: { inputPaths: ["assembly/index.ts"], outFile: "dist/shado.wasm" },',
      '    wrappers: { outDir: "dist/shado-wrappers", schemas: [{ module: "shado", export: "MyStruct" }] },',
      '    models: { name: "actor", outFile: "dist/actor.shado-model.json", import: { url: "./actor.glb" } }',
      '    worlds: { name: "zone", input: "./zone.glb.gz", outFile: "dist/zone.spatial.json.gz" }',
      '  }',
    ].join('\n')
  );
  process.exit(1);
}

function readArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadConfig(file: string): Promise<ShadoConfig> {
  const abs = path.resolve(process.cwd(), file);
  const mod = await import(pathToFileURL(abs).href);
  return (mod.default ?? mod) as ShadoConfig;
}

async function main() {
  const invocation = normalizeInvocation();
  if (invocation.kind === 'migrate-worlds') {
    await migrateWorldDirectory();
    return;
  }
  const configPath = readArg('--config') ?? readArg('-c') ?? 'shado.config.mjs';
  const config = await loadConfig(configPath);
  const configDir = path.dirname(path.resolve(process.cwd(), configPath));

  if (invocation.kind === 'asc') {
    const entries = asArray(config.asc);
    if (!entries.length) throw new Error(`No asc entries found in ${configPath}`);
    for (const entry of entries) {
      const result = await precompileAssemblyScript(entry);
      console.log(`wrote ${result.outFile}`);
      if (result.gzipFile) console.log(`wrote ${result.gzipFile}`);
      if (result.base64File) console.log(`wrote ${result.base64File}`);
      if (result.textFile) console.log(`wrote ${result.textFile}`);
    }
    return;
  }

  if (invocation.kind === 'wrappers' || invocation.kind === 'gpu') {
    const entries = asArray(config.wrappers);
    if (!entries.length) throw new Error(`No wrappers entries found in ${configPath}`);
    for (const entry of entries) {
      const result = await preprocessShadoWrappers(entry, {
        configDir,
        only: invocation.kind === 'gpu' ? 'gpu' : 'all',
      });
      console.log(`wrote ${result.files.length} wrapper files to ${result.outDir}`);
    }
    return;
  }

  if (invocation.kind === 'models') {
    const entries = asArray(config.models);
    if (!entries.length) throw new Error(`No models entries found in ${configPath}`);
    for (const entry of entries) {
      const result = await packShadoModel(entry);
      console.log(
        `wrote ${result.files.length} model artifact files for ${result.name} (${result.meshCount} meshes, VAT: ${result.vatVariants.join(', ') || 'none'})`
      );
    }
    return;
  }

  if (invocation.kind === 'worlds') {
    const entries = asArray(config.worlds);
    if (!entries.length) throw new Error(`No worlds entries found in ${configPath}`);
    for (const entry of entries) {
      const result = await packShadoWorld(entry);
      console.log(
        `wrote ${result.outFile} for ${result.name} (${result.triangleCount} triangles, ${result.clusterCount} clusters, ${result.renderChunkCount} render chunks, ${result.cellCount} cells, ${result.portalCount} portals, ${result.regionCount} authored regions)`
      );
    }
    return;
  }

  if (invocation.kind === 'manifest') {
    if (!config.modelManifest) throw new Error(`No modelManifest entry found in ${configPath}`);
    const outFile = await writeShadoModelManifest(config.modelManifest);
    console.log(`wrote ${outFile}`);
    return;
  }

  usage();
}

// Babylon's NullEngine can perform an import without leaving an active Node
// handle. Keep the CLI alive until the async command settles instead of letting
// Node exit early with no artifact and a misleading success status.
const commandKeepAlive = setInterval(() => undefined, 0x7fffffff);
void main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(commandKeepAlive));

function asArray<T>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeInvocation():
  | { kind: 'asc' }
  | { kind: 'wrappers' }
  | { kind: 'gpu' }
  | { kind: 'models' }
  | { kind: 'worlds' }
  | { kind: 'migrate-worlds' }
  | { kind: 'manifest' } {
  const bin = path.basename(process.argv[1] ?? '');
  if (bin === 'shado-preprocess-asc') return { kind: 'asc' };
  if (bin === 'shado-preprocess-wrappers') return { kind: 'wrappers' };
  if (bin === 'shado-preprocess-gpu') return { kind: 'gpu' };
  if (bin === 'shado-pack-model') return { kind: 'models' };
  if (bin === 'shado-pack-world') return { kind: 'worlds' };

  const [, , group, command, subject] = process.argv;
  if (group === 'asc' && command === 'build') return { kind: 'asc' };
  if (group === 'wrappers' && command === 'build') return { kind: 'wrappers' };
  if (group === 'gpu' && command === 'build') return { kind: 'gpu' };
  if (group === 'pack' && (command === 'model' || command === 'models')) return { kind: 'models' };
  if (group === 'pack' && (command === 'world' || command === 'worlds')) return { kind: 'worlds' };
  if (group === 'migrate' && (command === 'world' || command === 'worlds')) return { kind: 'migrate-worlds' };
  if (group === 'manifest' && (command === 'model' || command === 'models' || subject === 'models')) {
    return { kind: 'manifest' };
  }
  usage();
}

async function migrateWorldDirectory() {
  const inputArg = readArg('--input-dir');
  const outputArg = readArg('--out-dir');
  if (!inputArg || !outputArg) {
    throw new Error('World migration requires --input-dir and --out-dir');
  }
  const inputDir = path.resolve(process.cwd(), inputArg);
  const outDir = path.resolve(process.cwd(), outputArg);
  const dryRun = process.argv.includes('--dry-run');
  const overwrite = process.argv.includes('--overwrite');
  const runtimePrefix = (readArg('--runtime-prefix') ?? '/shado/worlds').replace(/\/$/, '');
  const metadataDir = path.resolve(process.cwd(), readArg('--metadata-dir') ?? inputArg);
  const objectSourcePrefix =
    (readArg('--object-prefix') ?? '/eqrequiem/objects').replace(/\/$/, '');
  const discoveredEntries = (await fs.readdir(inputDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /\.glb(?:\.gz)?$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entriesByName = new Map<string, (typeof discoveredEntries)[number]>();
  for (const entry of discoveredEntries) {
    const name = entry.name.replace(/\.glb(?:\.gz)?$/i, '');
    const existing = entriesByName.get(name);
    if (!existing || entry.name.toLowerCase().endsWith('.glb.gz')) {
      entriesByName.set(name, entry);
    }
  }
  const entries = [...entriesByName.values()];
  if (!entries.length) throw new Error(`No .glb or .glb.gz files found in ${inputDir}`);
  if (!dryRun) await fs.mkdir(outDir, { recursive: true });
  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of entries) {
    const name = entry.name.replace(/\.glb(?:\.gz)?$/i, '');
    try {
    const spatial = path.join(outDir, `${name}.spatial.json.gz`);
    const authoring = path.join(outDir, `${name}.authoring.json`);
    const metadata = path.join(metadataDir, `${name}.json`);
    const source = path.join(outDir, entry.name);
    if (
      !overwrite &&
      await exists(spatial) &&
      !await anySourceIsNewer(spatial, [
        path.join(inputDir, entry.name),
        metadata,
        authoring,
      ])
    ) {
      console.log(`skip ${name}: ${spatial} already exists`);
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`would migrate ${path.join(inputDir, entry.name)} -> ${spatial}`);
      continue;
    }
    if (!await exists(authoring)) {
      const document = createShadoWorldAuthoring(name);
      await fs.writeFile(authoring, `${JSON.stringify(document, null, 2)}\n`);
    }
    const result = await packShadoWorld({
      name,
      input: path.join(inputDir, entry.name),
      outFile: spatial,
      runtimeSource: `${runtimePrefix}/${entry.name}`,
      copyInputTo: source,
      authoringInput: authoring,
      metadataInput: await exists(metadata) ? metadata : undefined,
      objectSourcePrefix,
    });
    console.log(
      `migrated ${name}: ${result.triangleCount} triangles, ${result.clusterCount} clusters`
      + `, ${result.objectPrototypeCount} object models, ${result.objectStampCount} stamps`
      + `${await exists(metadata) ? `, metadata ${path.basename(metadata)}` : ''}`
    );
    written++;
    } catch (error) {
      failed++;
      console.error(
        `failed ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  console.log(
    `${dryRun ? 'planned' : 'completed'} ${dryRun ? entries.length : written} zone(s);`
    + ` skipped ${skipped}; failed ${failed}`
  );
}

async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function anySourceIsNewer(output: string, sources: string[]): Promise<boolean> {
  const outputTime = (await fs.stat(output)).mtimeMs;
  for (const source of sources) {
    if (!await exists(source)) continue;
    if ((await fs.stat(source)).mtimeMs > outputTime) return true;
  }
  return false;
}
