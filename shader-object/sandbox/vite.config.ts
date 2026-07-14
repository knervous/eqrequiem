import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({ tsDecorators: true })],
  resolve: {
    conditions: ['source'],
    dedupe: ['@babylonjs/core', 'react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['shado'],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
})
