#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import {
  field,
  gpuStruct,
  ShadoActor,
  ShadoInstanceContainer,
} from '../../dist/index.js';

class ResidencyActor extends ShadoActor {
  initialize() {
    super.initialize();
    this.bodyVariation = 0;
    this.handVariation = 0;
    this.pantsVariation = 0;
    this.legVariation = 0;
    this.hairVariation = 0;
    this.eyeVariation = 0;
  }
}
field('f32')(ResidencyActor.prototype, 'bodyVariation');
field('f32')(ResidencyActor.prototype, 'handVariation');
field('f32')(ResidencyActor.prototype, 'pantsVariation');
field('f32')(ResidencyActor.prototype, 'legVariation');
field('f32')(ResidencyActor.prototype, 'hairVariation');
field('f32')(ResidencyActor.prototype, 'eyeVariation');
gpuStruct({ name: 'SupermeshResidencyActor' })(ResidencyActor);

class ResidencyContainer extends ShadoInstanceContainer {}

const option = name => {
  const entry = process.argv.find(value => value.startsWith(`--${name}=`));
  return entry?.slice(name.length + 3);
};
const maximum = Math.max(1, Math.min(1_000_000, Math.round(Number(option('max') ?? 100_000))));
const candidates = [1_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]
  .filter(value => value <= maximum);
if (candidates.at(-1) !== maximum) candidates.push(maximum);

const engine = new NullEngine();
await ResidencyContainer.initialize(engine, {
  backend: 'datatex',
  extra: ResidencyActor,
  wasm: false,
});
const container = new ResidencyContainer(engine);
const actorStrideBytes = container.getStructArrayStrideBytes('instances');
const rows = [];
let allocated = 0;

try {
  for (const count of candidates) {
    globalThis.gc?.();
    const before = process.memoryUsage();
    const started = performance.now();
    container.addInstances(count - allocated, undefined, {
      playRandomAnimation: false,
      rebuildNameplates: false,
    });
    allocated = count;
    const elapsedMs = performance.now() - started;
    globalThis.gc?.();
    const after = process.memoryUsage();
    rows.push({
      actors: count,
      appendMs: elapsedMs,
      appendActorsPerSecond: (count - (rows.at(-1)?.actors ?? 0)) * 1000 / elapsedMs,
      actorStrideBytes,
      activeActorBytes: count * actorStrideBytes,
      arenaCapacityBytes: container.prepareUnifiedForUpload().byteLength,
      heapUsedBytes: after.heapUsed,
      heapDeltaBytes: after.heapUsed - before.heapUsed,
      rssBytes: after.rss,
      externalBytes: after.external,
    });
  }
  const report = {
    passed: container.instanceCount === maximum,
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      gcExposed: typeof globalThis.gc === 'function',
    },
    actorStrideBytes,
    maximumTestedActors: maximum,
    rows,
  };
  const output = path.resolve(import.meta.dirname, '../public/shado/supermesh/cpu-residency-report.json');
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  container.dispose();
  engine.dispose();
}
