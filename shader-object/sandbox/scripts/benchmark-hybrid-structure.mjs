#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const assetRoot = path.resolve(import.meta.dirname, '../public/shado/supermesh');
const manifest = JSON.parse(await fs.readFile(path.join(assetRoot, 'supermesh-manifest.json'), 'utf8'));
const glb = zlib.gunzipSync(await fs.readFile(path.join(assetRoot, 'NM_M_supermesh.static.glb.gz')));
const jsonLength = glb.readUInt32LE(12);
if (glb.toString('ascii', 16, 20) !== 'JSON') throw new Error('GLB does not begin with a JSON chunk');
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
const primitives = gltf.meshes.flatMap(mesh => mesh.primitives);
const primitiveVertices = primitives.map(primitive =>
  gltf.accessors[primitive.attributes.POSITION].count);
const modules = manifest.modules.map(module => ({
  ...module,
  vertices: primitiveVertices
    .slice(module.primitiveStart, module.primitiveStart + module.primitiveCount)
    .reduce((sum, count) => sum + count, 0),
}));
const variationCounts = manifest.slotOrder.map(slot =>
  modules.filter(module => module.slot === slot).length);
const sourceModuleVertices = modules.reduce((sum, module) => sum + module.vertices, 0);
const counts = [1, 10, 100, 1_000, 2_000];

const rows = counts.map(actors => {
  let submittedVertices = 0;
  const populated = new Set();
  for (let actor = 0; actor < actors; actor++) {
    for (let slot = 0; slot < variationCounts.length; slot++) {
      const variations = variationCounts[slot];
      const variation = variations ? (actor * (slot * 2 + 3) + slot) % variations : 0;
      const module = modules.find(candidate =>
        candidate.slotIndex === slot && candidate.variation === variation);
      if (!module) throw new Error(`No module for slot ${slot}, variation ${variation}`);
      submittedVertices += module.vertices;
      populated.add(module.name);
    }
  }
  const baselineSupermeshVertices = actors * sourceModuleVertices;
  return {
    actors,
    populatedModuleBuckets: populated.size,
    baselineSupermeshVertices,
    submittedVertices,
    avoidedHiddenVertices: baselineSupermeshVertices - submittedVertices,
    vertexWorkReduction: baselineSupermeshVertices / submittedVertices,
  };
});

const report = {
  passed: sourceModuleVertices === 8_532 && modules.length === 26,
  path: 'hybrid-module-buckets/shared-pose-uniform',
  animation: {
    libraries: 1,
    clips: manifest.animation.clips.length,
    vatGzipBytes: manifest.animation.vatGzipBytes,
    duplicatedAnimationLibraries: 0,
    deformationReuse: 'shared-uniform; per-submitted-actor-vertex DQ skinning remains',
  },
  geometry: {
    modules: modules.length,
    slots: manifest.slotOrder.length,
    sourceModuleVertices,
    storedOutfitPermutations: manifest.composition.storedGeneratedPermutations,
    possibleDynamicCombinations: manifest.composition.possibleCombinations,
  },
  rows,
};

const output = path.join(assetRoot, 'hybrid-structural-report.json');
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
