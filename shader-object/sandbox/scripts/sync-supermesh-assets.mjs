#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const sandboxRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(sandboxRoot, '../..');
const sourceRoot = path.join(repositoryRoot, 'NM_M_Humanoid/supermesh-playground');
const outputRoot = path.join(sandboxRoot, 'public/shado/supermesh');

await fs.mkdir(outputRoot, { recursive: true });
await fs.rm(path.join(outputRoot, 'NM_M_supermesh.static.glb'), { force: true });
await Promise.all([
  fs.copyFile(
    path.join(sourceRoot, 'build/NM_M_supermesh.static.glb.gz'),
    path.join(outputRoot, 'NM_M_supermesh.static.glb.gz'),
  ),
  fs.copyFile(
    path.join(sourceRoot, 'build/supermesh-manifest.json'),
    path.join(outputRoot, 'supermesh-manifest.json'),
  ),
  fs.copyFile(
    path.join(sourceRoot, 'build/supermesh-audit.json'),
    path.join(outputRoot, 'supermesh-audit.json'),
  ),
  fs.copyFile(
    path.join(repositoryRoot, 'NM_M_Humanoid/shado-viability/build/NM_M.full.vat16.index.json.gz'),
    path.join(outputRoot, 'NM_M.full.vat16.index.json.gz'),
  ),
  fs.copyFile(
    path.join(repositoryRoot, 'NM_M_Humanoid/shado-viability/build/NM_M.full.vat16.bin.gz'),
    path.join(outputRoot, 'NM_M.full.vat16.bin.gz'),
  ),
]);

await fs.rm(path.join(outputRoot, 'NM_M_demo_01.vat16.json.gz'), { force: true });
await fs.rm(path.join(outputRoot, 'NM_M.full.vat16.json.gz'), { force: true });

console.log(`Synced supermesh benchmark assets to ${path.relative(repositoryRoot, outputRoot)}`);
