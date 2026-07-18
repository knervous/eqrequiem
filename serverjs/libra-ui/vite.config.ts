import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '../..')

// https://vite.dev/config/
export default defineConfig({
  publicDir: path.resolve(new URL('.', import.meta.url).pathname, '../../client/public'),
  plugins: [react()],
  resolve: {
    dedupe: ['@babylonjs/core', 'shader-object'],
    alias: {
      '@': path.resolve(new URL('.', import.meta.url).pathname, './src'),
      '@game': path.resolve(new URL('.', import.meta.url).pathname, '../../client/src/Game'),
      '@requiem': path.resolve(new URL('.', import.meta.url).pathname, '../../client/src'),
    },
  },
  optimizeDeps: {
    exclude: ['shader-object'],
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
