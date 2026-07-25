import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '../..')
const babylonLiteRuntime = path.resolve(
  new URL('.', import.meta.url).pathname,
  '../../client/src/bjs/core-runtime.ts',
)

// https://vite.dev/config/
export default defineConfig({
  publicDir: path.resolve(new URL('.', import.meta.url).pathname, '../../client/public'),
  plugins: [react()],
  resolve: {
    dedupe: ['@babylonjs/core', '@knervous/shado'],
    alias: [
      // Redirect only the package root. Babylon's explicit feature subpaths
      // must continue resolving normally.
      { find: /^@babylonjs\/core$/, replacement: babylonLiteRuntime },
      {
        find: '@bjs',
        replacement: path.resolve(
          new URL('.', import.meta.url).pathname,
          '../../client/src/bjs/index.ts',
        ),
      },
      {
        find: '@game',
        replacement: path.resolve(
          new URL('.', import.meta.url).pathname,
          '../../client/src/Game',
        ),
      },
      {
        find: '@requiem',
        replacement: path.resolve(
          new URL('.', import.meta.url).pathname,
          '../../client/src',
        ),
      },
      {
        find: '@libra',
        replacement: path.resolve(new URL('.', import.meta.url).pathname, './src'),
      },
    ],
  },
  optimizeDeps: {
    exclude: ['@knervous/shado'],
  },
  // Exposes the repo root to client code (raw-rig-viewer.ts) so it can fetch
  // source GLBs directly via Vite's /@fs/ dev-only static serving, without
  // duplicating pipeline output into client/public.
  define: {
    __REPO_ROOT__: JSON.stringify(repoRoot),
  },
  server: {
    fs: { allow: [repoRoot] },
    proxy: {
      '/libra': {
        target: process.env.VITE_LIBRA_PROXY_TARGET ?? 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
    },
  },
})
