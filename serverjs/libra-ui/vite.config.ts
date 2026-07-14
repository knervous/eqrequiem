import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(new URL('.', import.meta.url).pathname, './src'),
    },
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
