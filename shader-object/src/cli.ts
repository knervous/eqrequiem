#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { precompileAssemblyScript, type AscPrecompileConfig } from './asc/index.js';
import {
  packShadoModel,
  preprocessShadoWrappers,
  writeShadoModelManifest,
  type ShadoModelManifestConfig,
  type ShadoModelPackConfig,
  type WrapperPreprocessConfig,
} from './preprocess/index.js';

type ShadoConfig = {
  asc?: AscPrecompileConfig | AscPrecompileConfig[];
  wrappers?: WrapperPreprocessConfig | WrapperPreprocessConfig[];
  models?: ShadoModelPackConfig | ShadoModelPackConfig[];
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

  if (invocation.kind === 'manifest') {
    if (!config.modelManifest) throw new Error(`No modelManifest entry found in ${configPath}`);
    const outFile = await writeShadoModelManifest(config.modelManifest);
    console.log(`wrote ${outFile}`);
    return;
  }

  usage();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function asArray<T>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeInvocation():
  | { kind: 'asc' }
  | { kind: 'wrappers' }
  | { kind: 'gpu' }
  | { kind: 'models' }
  | { kind: 'manifest' } {
  const bin = path.basename(process.argv[1] ?? '');
  if (bin === 'shado-preprocess-asc') return { kind: 'asc' };
  if (bin === 'shado-preprocess-wrappers') return { kind: 'wrappers' };
  if (bin === 'shado-preprocess-gpu') return { kind: 'gpu' };
  if (bin === 'shado-pack-model') return { kind: 'models' };

  const [, , group, command, subject] = process.argv;
  if (group === 'asc' && command === 'build') return { kind: 'asc' };
  if (group === 'wrappers' && command === 'build') return { kind: 'wrappers' };
  if (group === 'gpu' && command === 'build') return { kind: 'gpu' };
  if (group === 'pack' && (command === 'model' || command === 'models')) return { kind: 'models' };
  if (group === 'manifest' && (command === 'model' || command === 'models' || subject === 'models')) {
    return { kind: 'manifest' };
  }
  usage();
}
