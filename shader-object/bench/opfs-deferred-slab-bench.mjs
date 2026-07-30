#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

const actors = option('actors', 10_000_000);
const strideBytes = option('stride-bytes', 16);
const slabBytes = option('slab-bytes', 4 * 1024 * 1024);
const residentSlabs = option('resident-slabs', 4);
const port = option('port', 4179);
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npm', ['run', 'start', '--', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: new URL('../sandbox', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', chunk => {
  serverLog += String(chunk);
});
server.stderr.on('data', chunk => {
  serverLog += String(chunk);
});

let browser;
try {
  await waitForServer(`${origin}/test`);
  browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage();
  await page.goto(`${origin}/test`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(
    async ({ actors, strideBytes, slabBytes, residentSlabs }) => {
      const { DeferredStorageSlabStore } = await import('/@id/@knervous/shado/storage');
      const percentile = (values, fraction) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
      };
      const fileName = `bench-${Date.now()}-${Math.random().toString(16).slice(2)}.slabs`;
      const options = {
        directory: ['shado-bench'],
        fileName,
        initialByteLength: actors * strideBytes,
        slabByteLength: slabBytes,
        recordStrideBytes: strideBytes,
        maxResidentSlabs: residentSlabs,
        preferSharedArrayBuffer: true,
      };

      const openStart = performance.now();
      const store = await DeferredStorageSlabStore.open(options);
      const openMs = performance.now() - openStart;
      const mapModifySamples = [];
      const sentinels = new Map();
      try {
        for (let slabIndex = 0; slabIndex < store.slabCount; slabIndex++) {
          const start = performance.now();
          const slab = await store.mapSlab(slabIndex);
          const actorIndex = slabIndex * store.recordsPerSlab;
          const words = new Uint32Array(strideBytes / 4);
          words[0] = actorIndex;
          words[1] = slabIndex ^ 0x5a5a5a5a;
          slab.writeRecords(0, words);
          sentinels.set(slabIndex, [...words]);
          slab.release();
          mapModifySamples.push(performance.now() - start);
        }
        const flushStart = performance.now();
        await store.flush();
        const finalFlushMs = performance.now() - flushStart;

        const cacheSamples = [];
        const lastIndex = store.slabCount - 1;
        for (let iteration = 0; iteration < 50; iteration++) {
          const start = performance.now();
          const slab = await store.mapSlab(lastIndex);
          slab.release();
          cacheSamples.push(performance.now() - start);
        }
        const firstStats = store.stats;
        const residentByteLength = store.residentByteLength;
        await store.close();

        const reopenStart = performance.now();
        const reopened = await DeferredStorageSlabStore.open({
          ...options,
          initialByteLength: 0,
        });
        const reopenMs = performance.now() - reopenStart;
        try {
          const verifyIndices = [
            ...new Set([0, Math.floor(reopened.slabCount / 2), reopened.slabCount - 1]),
          ];
          const verified = [];
          for (const slabIndex of verifyIndices) {
            const slab = await reopened.mapSlab(slabIndex);
            const actual = [...new Uint32Array(slab.recordBytes(0).buffer, 0, strideBytes / 4)];
            slab.release();
            verified.push({
              slabIndex,
              matches: actual.every((word, index) => word === sentinels.get(slabIndex)[index]),
            });
          }
          const changedBytes = store.slabCount * strideBytes;
          return {
            actors,
            strideBytes,
            logicalMiB: store.logicalByteLength / 1024 / 1024,
            slabMiB: slabBytes / 1024 / 1024,
            slabCount: store.slabCount,
            maxResidentSlabs: residentSlabs,
            residentMiB: residentByteLength / 1024 / 1024,
            logicalToResidentRatio: store.logicalByteLength / residentByteLength,
            crossOriginIsolated,
            sharedArrayBufferMap: crossOriginIsolated,
            openMs,
            mapModifyEvictMs: {
              p50: percentile(mapModifySamples, 0.5),
              p95: percentile(mapModifySamples, 0.95),
              max: Math.max(...mapModifySamples),
            },
            cachedMapMs: {
              p50: percentile(cacheSamples, 0.5),
              p95: percentile(cacheSamples, 0.95),
            },
            finalFlushMs,
            changedRowBytes: changedBytes,
            flushedBytes: firstStats.bytesWritten,
            dirtyPageWriteAmplification: firstStats.bytesWritten / changedBytes,
            writebackBatchReduction: store.slabCount / Math.max(1, firstStats.writebackBatches),
            durabilitySyncReduction: store.slabCount / Math.max(1, firstStats.syncs),
            stats: firstStats,
            reopenMs,
            verified,
          };
        } finally {
          await reopened.destroy();
        }
      } catch (error) {
        await store.destroy();
        throw error;
      }
    },
    { actors, strideBytes, slabBytes, residentSlabs }
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.verified.some(entry => !entry.matches)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

async function waitForServer(url) {
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
