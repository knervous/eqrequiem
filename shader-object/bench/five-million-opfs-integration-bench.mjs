#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

const actors = option('actors', 5_000_000);
const hot = option('hot', 1_000_000);
const visible = option('visible', 8_000);
const frames = option('frames', 120);
const warmup = option('warmup', 30);
const cullHz = option('cull-hz', 15);
const targetFps = option('target-fps', 60);
const port = option('port', 4180);
const requireTarget = process.argv.includes('--require-target');
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
  browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const url = new URL('/test', origin);
  url.searchParams.set('renderer', 'babylonjs');
  url.searchParams.set('backend', 'webgl2');
  url.searchParams.set('scenario', 'five-million-opfs-integration');
  url.searchParams.set('count', String(actors));
  url.searchParams.set('hot', String(hot));
  url.searchParams.set('visible', String(visible));
  url.searchParams.set('frames', String(frames));
  url.searchParams.set('warmup', String(warmup));
  url.searchParams.set('cullHz', String(cullHz));
  url.searchParams.set('targetFps', String(targetFps));
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const state = await page.waitForFunction(
    () => {
      const value = globalThis.__shadoBrowserTest;
      return value?.status === 'passed' || value?.status === 'failed' ? value : undefined;
    },
    undefined,
    { timeout: 300_000 }
  );
  const result = await state.jsonValue();
  if (result.status === 'failed') throw new Error(result.error);
  console.log(JSON.stringify(result.result, null, 2));
  if (requireTarget && !result.result.sustained60Fps) process.exitCode = 1;
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
