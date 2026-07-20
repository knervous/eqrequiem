import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react({ tsDecorators: true })],
  resolve: {
    // Source exports are ideal for local HMR, but production must exercise the
    // transpiled package artifact. Rolldown otherwise preserves decorators in
    // linked node_modules and emits invalid browser JavaScript.
    conditions: command === 'build' ? [] : ['source'],
    preserveSymlinks: true,
    dedupe: ['@babylonjs/core', 'react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['@knervous/shado'],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
}))
