#!/usr/bin/env node

import { NullEngine } from '@babylonjs/core';

import { ShadoActor, ShadoInstanceContainer } from '../dist/index.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

const actorCount = Math.max(1, Math.floor(option('actors', 100_000)));
const iterations = Math.max(1, Math.floor(option('iterations', 5)));
const warmup = Math.max(0, Math.floor(option('warmup', 1)));
const engine = new NullEngine();
await ShadoInstanceContainer.initialize(engine, {
  backend: 'datatex',
  wasm: false,
  extra: ShadoActor,
});

function run(mode) {
  const actors = new ShadoInstanceContainer(engine);
  actors.reserveInstances(actorCount);
  const startedAt = performance.now();
  if (mode === 'single') {
    for (let i = 0; i < actorCount; i++) {
      actors.addInstance(true, undefined, false);
    }
  } else {
    actors.addInstances(actorCount, undefined, {
      playRandomAnimation: false,
      rebuildNameplates: false,
    });
  }
  const elapsed = performance.now() - startedAt;
  if (actors.instanceCount !== actorCount) {
    throw new Error(`${mode} append produced ${actors.instanceCount} actors`);
  }
  actors.dispose();
  return elapsed;
}

for (let i = 0; i < warmup; i++) {
  run('single');
  run('batch');
}

const samples = { single: [], batch: [] };
for (let i = 0; i < iterations; i++) {
  // Alternate order to keep either path from consistently receiving the
  // colder allocator/cache state.
  const order = i % 2 ? ['batch', 'single'] : ['single', 'batch'];
  for (const mode of order) samples[mode].push(run(mode));
}

const singleP50 = percentile(samples.single, 0.5);
const batchP50 = percentile(samples.batch, 0.5);
console.log(
  `\n${actorCount.toLocaleString()} actors, ${iterations} measured iterations, pre-reserved capacity`
);
console.log('append path              p50       p95    relative');
console.log(
  `single actor sync     ${singleP50.toFixed(3).padStart(8)}ms ${percentile(
    samples.single,
    0.95
  )
    .toFixed(3)
    .padStart(8)}ms     1.00x`
);
console.log(
  `batched struct append ${batchP50.toFixed(3).padStart(8)}ms ${percentile(
    samples.batch,
    0.95
  )
    .toFixed(3)
    .padStart(8)}ms ${`${(singleP50 / batchP50).toFixed(2)}x`.padStart(9)}`
);
console.log(
  '\nThis isolates object creation, initialization, sidecar growth, and structural/header bookkeeping. Sandbox scale additions additionally yield to the browser frame budget.'
);

engine.dispose();
