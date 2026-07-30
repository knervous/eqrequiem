#!/usr/bin/env node
// Deterministic CPU preparation and upload-volume comparison for projected
// actor streams. GPU submission is deliberately not timed in Node.

import { ActorRenderProjection } from '../dist/index.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

const actorCount = option('actors', 100_000);
const iterations = option('iterations', 20);
const legacyActorStrideBytes = option('legacy-stride', 112);
const domain = {
  origin: [-64, -64, -64],
  extent: [128, 128, 128],
  scaleRange: [0, 8],
};

function actor(x) {
  return {
    translation: new Float32Array([x, -8.5, 31.75, 1.25]),
    rotation: new Float32Array([0, 0, 0, 1]),
    color: new Float32Array([0.2, 0.4, 0.6, 1]),
  };
}

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function indicesFor(fraction, shape) {
  const count = Math.max(1, Math.floor(actorCount * fraction));
  if (shape === 'clustered') {
    return Array.from({ length: count }, (_, index) => index);
  }
  // Deterministic full-period walk for the default 100k count.
  const indices = [];
  const seen = new Uint8Array(actorCount);
  let value = 17 % actorCount;
  while (indices.length < count) {
    if (!seen[value]) {
      seen[value] = 1;
      indices.push(value);
    }
    value = (value + 7919) % actorCount;
  }
  return indices;
}

function benchmarkLegacyFullUpload() {
  const words = Math.ceil((actorCount * legacyActorStrideBytes) / 4);
  const arena = new Uint32Array(words);
  const uploadShadow = new Uint32Array(words);
  const samples = [];
  for (let iteration = 0; iteration < iterations + 4; iteration++) {
    arena[iteration % words] = iteration;
    const start = performance.now();
    uploadShadow.set(arena);
    const elapsed = performance.now() - start;
    if (iteration >= 4) samples.push(elapsed);
  }
  return {
    cpuMs: median(samples),
    uploadedBytes: arena.byteLength,
    uploadCalls: 1,
  };
}

function benchmarkProjection({ encoding, allowScatter, dirtyIndices }) {
  const base = actor(12.25);
  const variantA = actor(13.25);
  const variantB = actor(14.25);
  const actors = Array.from({ length: actorCount }, () => base);
  const projection = new ActorRenderProjection({
    encoding,
    domain,
    uploadPolicy: { allowScatter, maxDirectRanges: 32 },
  });
  projection.sync(actors);
  const samples = [];
  let latest;
  for (let iteration = 0; iteration < iterations + 4; iteration++) {
    const variant = iteration % 2 ? variantA : variantB;
    for (const index of dirtyIndices) actors[index] = variant;
    const start = performance.now();
    latest = projection.sync(actors, { dirtyIndices });
    const elapsed = performance.now() - start;
    if (iteration >= 4) samples.push(elapsed);
  }
  return {
    cpuMs: median(samples),
    uploadedBytes: latest.uploadedBytes,
    uploadCalls: latest.uploadCalls,
    mode: latest.transform.mode,
  };
}

function mib(bytes) {
  return (bytes / (1024 * 1024)).toFixed(3);
}

function ratio(value) {
  return `${value.toFixed(2)}x`;
}

const legacy = benchmarkLegacyFullUpload();
console.log(
  `\n${actorCount.toLocaleString()} actors, ${iterations} measured iterations, ` +
    `${legacyActorStrideBytes}B legacy actor stride`
);
console.log(
  'scenario'.padEnd(24),
  'layout'.padEnd(22),
  'CPU p50'.padStart(10),
  'CPU vs legacy'.padStart(15),
  'upload MiB'.padStart(12),
  'byte reduction'.padStart(16),
  'calls'.padStart(7),
  'mode'.padStart(9)
);

for (const scenario of [
  { label: '1% clustered', fraction: 0.01, shape: 'clustered' },
  { label: '1% random', fraction: 0.01, shape: 'random' },
  { label: '10% random', fraction: 0.1, shape: 'random' },
  { label: '100% dense', fraction: 1, shape: 'clustered' },
]) {
  const dirtyIndices = indicesFor(scenario.fraction, scenario.shape);
  const rows = [
    ['legacy full AoS', { ...legacy, mode: 'full' }],
    [
      'split-f32 scatter',
      benchmarkProjection({
        encoding: 'split-f32',
        allowScatter: true,
        dirtyIndices,
      }),
    ],
    [
      'packed scatter',
      benchmarkProjection({
        encoding: 'packed',
        allowScatter: true,
        dirtyIndices,
      }),
    ],
    [
      'packed Lite fallback',
      benchmarkProjection({
        encoding: 'packed',
        allowScatter: false,
        dirtyIndices,
      }),
    ],
  ];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const [layout, result] = rows[rowIndex];
    console.log(
      (rowIndex === 0 ? scenario.label : '').padEnd(24),
      layout.padEnd(22),
      `${result.cpuMs.toFixed(3)}ms`.padStart(10),
      ratio(legacy.cpuMs / result.cpuMs).padStart(15),
      mib(result.uploadedBytes).padStart(12),
      ratio(legacy.uploadedBytes / Math.max(1, result.uploadedBytes)).padStart(16),
      String(result.uploadCalls).padStart(7),
      result.mode.padStart(9)
    );
  }
}

console.log(
  '\nCPU numbers cover host-side copy/encoding only. Upload byte ratios are ' +
    'deterministic; validate queue/GPU timing in the browser before promotion.'
);
