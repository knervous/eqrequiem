import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'
import type { Connect } from 'vite'
import { babylonLiteVat2dPlugin } from './vite/babylon-lite-vat-2d'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const catalogObjects = path.resolve(__dirname, '../../assets/generated/eq-catalog/objects')

const serveCatalogObject = async (
  req: Connect.IncomingMessage,
  res: import('node:http').ServerResponse,
  next: Connect.NextFunction,
) => {
  const requestPath = decodeURIComponent(req.url?.split(/[?#]/, 1)[0] ?? '')
    .replace(/^\/+|\/+$/g, '')
  const parts = requestPath.split('/')
  const nestedAsset = parts.length === 2 ? parts[1].toLowerCase() : undefined
  const model = (parts.length === 2 ? parts[0] : requestPath)
    .replace(/\.glb(?:\.gz)?$/i, '')
  if (!/^[a-z0-9_-]+$/i.test(model)) return next()
  if (nestedAsset && nestedAsset !== 'final.glb' && nestedAsset !== 'shape.glb') return next()
  const directory = path.join(catalogObjects, model)
  const candidates = nestedAsset === 'shape.glb'
    ? ['shape.glb']
    : ['final.glb', 'shape.glb']
  for (const file of candidates) {
    try {
      const bytes = await fs.readFile(path.join(directory, file))
      res.statusCode = 200
      res.setHeader('Content-Type', 'model/gltf-binary')
      res.setHeader('Content-Length', bytes.byteLength)
      res.end(bytes)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return next(error)
    }
  }
  next()
}

const catalogObjectPlugin = {
  name: 'shado-catalog-object-preview',
  configureServer(server: { middlewares: Connect.Server }) {
    server.middlewares.use('/eqrequiem/objects', serveCatalogObject)
  },
  configurePreviewServer(server: { middlewares: Connect.Server }) {
    server.middlewares.use('/eqrequiem/objects', serveCatalogObject)
  },
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), catalogObjectPlugin, babylonLiteVat2dPlugin],
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
