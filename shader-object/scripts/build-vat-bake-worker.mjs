import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [path.join(root, 'src/workers/vat-bake-worker-entry.ts')],
  outfile: path.join(root, 'sandbox/public/shado/vat-bake-worker.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: process.env.DEBUG_VAT_WORKER !== '1',
  sourcemap: false,
  legalComments: 'none',
  define: {
    __DEV__: 'false',
    'process.env.NODE_ENV': '"production"',
  },
});
