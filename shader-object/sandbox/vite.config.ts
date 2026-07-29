import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'
import { babylonLiteVat2dPlugin } from './vite/babylon-lite-vat-2d'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), babylonLiteVat2dPlugin],
  resolve: {
    // Source exports are ideal for local HMR, but production must exercise the
    // transpiled package artifact. Rolldown otherwise preserves decorators in
    // linked node_modules and emits invalid browser JavaScript.
    conditions: command === 'build' ? [] : ['source'],
    alias: command === 'build'
      ? []
      : [
          {
            find: '@knervous/shado/preprocess/runtime',
            replacement: path.resolve(__dirname, '../src/preprocess/runtime.ts'),
          },
          {
            find: '@knervous/shado/msdf',
            replacement: path.resolve(__dirname, '../src/msdf/index.ts'),
          },
          {
            find: '@knervous/shado/render',
            replacement: path.resolve(__dirname, '../src/render/index.ts'),
          },
          {
            find: '@knervous/shado/world',
            replacement: path.resolve(__dirname, '../src/world/index.ts'),
          },
          {
            find: '@knervous/shado/showcase',
            replacement: path.resolve(__dirname, '../src/showcase/index.ts'),
          },
          {
            find: '@knervous/shado/renderer',
            replacement: path.resolve(__dirname, '../src/renderer/index.ts'),
          },
          {
            find: '@knervous/shado/lite',
            replacement: path.resolve(__dirname, '../src/lite/index.ts'),
          },
          {
            find: '@knervous/shado/core',
            replacement: path.resolve(__dirname, '../src/core/index.ts'),
          },
          {
            find: /^@knervous\/shado$/,
            replacement: path.resolve(__dirname, '../src/index.ts'),
          },
        ],
    preserveSymlinks: true,
    dedupe: ['@babylonjs/core', 'react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['@knervous/shado', '@babylonjs/lite'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
}))
