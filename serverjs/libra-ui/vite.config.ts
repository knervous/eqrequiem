import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  server: {
    proxy: {
      '/libra': {
        target: process.env.VITE_LIBRA_PROXY_TARGET ?? 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
    },
  },
})
