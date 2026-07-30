#!/usr/bin/env node
// Babylon Lite's actual storage-buffer + compatibility-bridge comparison:
// packed full upload vs whole-row scatter vs shaped position/scale scatter.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

async function waitForOrigin(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const actorCount = option('actors', 100_000);
const iterations = option('iterations', 20);
const changedRows = Math.max(1, Math.floor(actorCount * 0.01));
const port = option('port', 4183);
const origin = `http://127.0.0.1:${port}`;
const sandboxDirectory = path.resolve(import.meta.dirname, '../sandbox');
const vite = spawn('npm', ['run', 'start', '--', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: sandboxDirectory,
  stdio: ['ignore', 'ignore', 'inherit'],
});
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--enable-unsafe-webgpu'],
});

try {
  await waitForOrigin(`${origin}/vite.svg`);
  const page = await browser.newPage();
  await page.goto(`${origin}/vite.svg`);
  const result = await page.evaluate(
    async ({ actorCount, changedRows, iterations }) => {
      const lite = await import('/@id/@babylonjs/lite');
      const { BabylonLiteComputeScatterExecutor } = await import('/@id/@knervous/shado/lite');
      const canvas = new OffscreenCanvas(16, 16);
      const engine = await lite.createEngine(canvas);
      const median = values => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
      };
      const fullData = new Uint32Array(actorCount * 4);
      const createDestination = label => lite.createStorageBuffer(engine, fullData, label);
      const destinations = {
        full: createDestination('Lite full benchmark'),
        row: createDestination('Lite row scatter benchmark'),
        shaped: createDestination('Lite shaped scatter benchmark'),
      };
      const rowData = new Uint32Array(changedRows * 5);
      const shapedData = new Uint32Array(changedRows * 3);
      for (let index = 0; index < changedRows; index++) {
        const slot = (17 + index * 7919) % actorCount;
        rowData[index * 5] = slot;
        shapedData[index * 3] = slot;
      }
      const rowBatch = {
        shapeName: 'row',
        destinationStrideWords: 4,
        destinationOffsetWords: 0,
        copyWords: 4,
        changedRows,
        data: rowData,
      };
      const shapedBatch = {
        shapeName: 'positionScale',
        destinationStrideWords: 4,
        destinationOffsetWords: 0,
        copyWords: 2,
        changedRows,
        data: shapedData,
      };
      const rowExecutor = new BabylonLiteComputeScatterExecutor(
        engine,
        {
          destinationStrideWords: 4,
          destinationOffsetWords: 0,
          copyWords: 4,
        },
        'LiteRowScatterBenchmark',
        true
      );
      const shapedExecutor = new BabylonLiteComputeScatterExecutor(
        engine,
        {
          destinationStrideWords: 4,
          destinationOffsetWords: 0,
          copyWords: 2,
        },
        'LiteShapedScatterBenchmark',
        true
      );

      async function measure(kind) {
        const enqueueSamples = [];
        const completionSamples = [];
        const gpuSamples = [];
        for (let iteration = 0; iteration < iterations + 5; iteration++) {
          const started = performance.now();
          const encoder = engine._device.createCommandEncoder({
            label: `Lite ${kind} benchmark frame`,
          });
          engine._currentEncoder = encoder;
          if (kind === 'full') {
            fullData[0] = iteration + 1;
            lite.updateStorageBuffer(engine, destinations.full, fullData);
          } else {
            const batch = kind === 'row' ? rowBatch : shapedBatch;
            const recordWords = batch.copyWords + 1;
            for (let index = 0; index < changedRows; index++) {
              batch.data[index * recordWords + 1] =
                ((iteration + 1) * 65537 + batch.data[index * recordWords]) >>> 0;
            }
            const executor = kind === 'row' ? rowExecutor : shapedExecutor;
            executor.dispatch(batch, destinations[kind]);
          }
          const enqueued = performance.now();
          engine._currentEncoder = undefined;
          engine._device.queue.submit([encoder.finish()]);
          await engine._device.queue.onSubmittedWorkDone();
          await new Promise(resolve => setTimeout(resolve, 0));
          const completed = performance.now();
          if (iteration >= 5) {
            enqueueSamples.push(enqueued - started);
            completionSamples.push(completed - started);
            const executor = kind === 'row' ? rowExecutor : shapedExecutor;
            if (kind !== 'full' && executor.gpuTimeMs > 0) {
              gpuSamples.push(executor.gpuTimeMs);
            }
          }
        }
        return {
          kind,
          enqueueMs: median(enqueueSamples),
          completionMs: median(completionSamples),
          gpuMs: median(gpuSamples),
          uploadedBytes:
            kind === 'full'
              ? fullData.byteLength
              : (kind === 'row' ? rowData.byteLength : shapedData.byteLength) + 16,
          uploadCalls: kind === 'full' ? 1 : 2,
        };
      }

      const rows = [await measure('full'), await measure('row'), await measure('shaped')];
      rowExecutor.dispose();
      shapedExecutor.dispose();
      for (const destination of Object.values(destinations)) {
        lite.disposeStorageBuffer(destination);
      }
      lite.disposeEngine(engine);
      return { rows };
    },
    { actorCount, changedRows, iterations }
  );

  console.log(
    `\nBabylon Lite: ${actorCount.toLocaleString()} actors, ` +
      `${changedRows.toLocaleString()} changed rows, ${iterations} measured iterations`
  );
  console.log(
    'pipeline'.padEnd(17),
    'enqueue p50'.padStart(13),
    'complete p50'.padStart(14),
    'scatter GPU'.padStart(13),
    'MiB'.padStart(9),
    'calls'.padStart(7)
  );
  const labels = {
    full: 'packed full',
    row: 'row scatter',
    shaped: 'shaped scatter',
  };
  for (const row of result.rows) {
    console.log(
      labels[row.kind].padEnd(17),
      `${row.enqueueMs.toFixed(3)}ms`.padStart(13),
      `${row.completionMs.toFixed(3)}ms`.padStart(14),
      `${row.gpuMs.toFixed(3)}ms`.padStart(13),
      (row.uploadedBytes / (1024 * 1024)).toFixed(3).padStart(9),
      String(row.uploadCalls).padStart(7)
    );
  }
} finally {
  await browser.close();
  vite.kill('SIGTERM');
}
