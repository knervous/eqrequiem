#!/usr/bin/env node
// Real WebGPU queue upload benchmark. Measures CPU enqueue and completion time
// separately so call-count overhead is visible.

import { chromium } from '@playwright/test';
import { createServer } from 'node:http';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

const actorCount = option('actors', 100_000);
const iterations = option('iterations', 20);
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage();
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<!doctype html><title>Shado WebGPU upload benchmark</title>');
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Could not create the benchmark HTTP origin');
}
await page.goto(`http://127.0.0.1:${address.port}`);

try {
  const result = await page.evaluate(
    async ({ actorCount, iterations }) => {
      const gpu = navigator.gpu;
      if (!gpu) throw new Error('WebGPU is unavailable');
      const adapter = await gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter is available');
      const device = await adapter.requestDevice();
      const median = values => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      };

      async function measure({ label, targetBytes, writes }) {
        const buffer = device.createBuffer({
          size: Math.max(4, targetBytes),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const enqueueSamples = [];
        const completionSamples = [];
        for (let iteration = 0; iteration < iterations + 4; iteration++) {
          const start = performance.now();
          writes(device.queue, buffer, iteration);
          const enqueued = performance.now();
          await device.queue.onSubmittedWorkDone();
          const completed = performance.now();
          if (iteration >= 4) {
            enqueueSamples.push(enqueued - start);
            completionSamples.push(completed - start);
          }
        }
        buffer.destroy();
        return {
          label,
          enqueueMs: median(enqueueSamples),
          completionMs: median(completionSamples),
        };
      }

      const legacyBytes = actorCount * 112;
      const packedTransformBytes = actorCount * 16;
      const changedRows = Math.max(1, Math.floor(actorCount * 0.01));
      const legacyData = new Uint8Array(legacyBytes);
      const packedData = new Uint8Array(packedTransformBytes);
      const clusteredData = new Uint8Array(changedRows * 16);
      const randomRow = new Uint8Array(16);
      const rowScatterData = new Uint8Array(changedRows * 20);
      const shapedScatterData = new Uint8Array(changedRows * 12);
      const randomOffsets = Array.from(
        { length: changedRows },
        (_, index) => ((17 + index * 7919) % actorCount) * 16
      );

      const rows = [];
      rows.push(
        await measure({
          label: 'legacy full AoS',
          targetBytes: legacyBytes,
          writes(queue, buffer, iteration) {
            legacyData[0] = iteration;
            queue.writeBuffer(buffer, 0, legacyData);
          },
        })
      );
      rows.push(
        await measure({
          label: 'packed full transform',
          targetBytes: packedTransformBytes,
          writes(queue, buffer, iteration) {
            packedData[0] = iteration;
            queue.writeBuffer(buffer, 0, packedData);
          },
        })
      );
      rows.push(
        await measure({
          label: 'packed 1% clustered',
          targetBytes: packedTransformBytes,
          writes(queue, buffer, iteration) {
            clusteredData[0] = iteration;
            queue.writeBuffer(buffer, 0, clusteredData);
          },
        })
      );
      rows.push(
        await measure({
          label: 'packed 1% random direct',
          targetBytes: packedTransformBytes,
          writes(queue, buffer, iteration) {
            randomRow[0] = iteration;
            for (const offset of randomOffsets) {
              queue.writeBuffer(buffer, offset, randomRow);
            }
          },
        })
      );
      rows.push(
        await measure({
          label: 'packed 1% row scatter',
          targetBytes: rowScatterData.byteLength,
          writes(queue, buffer, iteration) {
            rowScatterData[0] = iteration;
            queue.writeBuffer(buffer, 0, rowScatterData);
          },
        })
      );
      rows.push(
        await measure({
          label: 'packed 1% shaped scatter',
          targetBytes: shapedScatterData.byteLength,
          writes(queue, buffer, iteration) {
            shapedScatterData[0] = iteration;
            queue.writeBuffer(buffer, 0, shapedScatterData);
          },
        })
      );

      return {
        adapter: adapter.info,
        rows: rows.map((row, index) => ({
          ...row,
          uploadedBytes: [
            legacyBytes,
            packedTransformBytes,
            clusteredData.byteLength,
            randomRow.byteLength * changedRows,
            rowScatterData.byteLength,
            shapedScatterData.byteLength,
          ][index],
          calls: [1, 1, 1, changedRows, 1, 1][index],
        })),
      };
    },
    { actorCount, iterations }
  );

  console.log(`\n${actorCount.toLocaleString()} actors, ${iterations} measured iterations`);
  if (result.adapter?.description) {
    console.log(`adapter: ${result.adapter.description}`);
  }
  console.log(
    'upload plan'.padEnd(29),
    'enqueue p50'.padStart(13),
    'complete p50'.padStart(14),
    'MiB'.padStart(9),
    'calls'.padStart(8)
  );
  for (const row of result.rows) {
    console.log(
      row.label.padEnd(29),
      `${row.enqueueMs.toFixed(3)}ms`.padStart(13),
      `${row.completionMs.toFixed(3)}ms`.padStart(14),
      (row.uploadedBytes / (1024 * 1024)).toFixed(3).padStart(9),
      String(row.calls).padStart(8)
    );
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
