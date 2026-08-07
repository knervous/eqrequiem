// File: client/e2e/build-harness.mjs
//
// Bundles the Playwright harness pages with esbuild. The harnesses only pull in
// dependency-light modules, so this stays fast and needs no dev server, backend
// or game assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '..');
const outDir = path.join(here, '.artifacts');

fs.rmSync(outDir, { force: true, recursive: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  absWorkingDir: clientRoot,
  entryPoints: [
    path.join(here, 'harness/gamepad-harness.ts'),
    path.join(here, 'harness/controls-harness.tsx'),
  ],
  outdir: outDir,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  sourcemap: 'inline',
  logLevel: 'warning',
  alias: {
    '@game': path.join(clientRoot, 'src/Game'),
    '@ui': path.join(clientRoot, 'src/UI'),
    '@': path.join(clientRoot, 'src'),
  },
});

for (const page of ['gamepad.html', 'controls.html']) {
  fs.copyFileSync(path.join(here, 'harness', page), path.join(outDir, page));
}

console.log(`[e2e] harness built -> ${path.relative(clientRoot, outDir)}`);
