import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { babylonLiteVat2dPlugin } from './vite/babylon-lite-vat-2d'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function supermeshScaleReportPlugin() {
  return {
    name: 'shado-supermesh-scale-report',
    configureServer(server: any) {
      server.middlewares.use('/__nm_m_bat.exr', (_request: any, response: any) => {
        const source = path.resolve(
          __dirname,
          '../../NM_M_Humanoid/capture/assets/3d/NM_M/NM_M_BAT.exr',
        )
        response.setHeader('Content-Type', 'image/x-exr')
        response.setHeader('Content-Length', fsSync.statSync(source).size)
        fsSync.createReadStream(source).pipe(response)
      })
      server.middlewares.use('/__shado_supermesh_report', (request: any, response: any) => {
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.end('POST required')
          return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        request.on('data', (chunk: Buffer) => {
          bytes += chunk.byteLength
          if (bytes <= 2 * 1024 * 1024) chunks.push(chunk)
        })
        request.on('end', async () => {
          try {
            if (bytes > 2 * 1024 * 1024) throw new Error('Benchmark report is too large')
            const report = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const outputRoot = path.resolve(__dirname, 'benchmark-results')
            await fs.mkdir(outputRoot, { recursive: true })
            // The pose palette is the only difference between two otherwise
            // identical runs, so it belongs in the filename — without it the
            // second run of a comparison overwrites the first.
            const palette = report.backend?.posePalette?.compiledPalette
              ? '-palette' : ''
            const suffix = `${report.backend?.renderPath ?? 'supermesh'}-${report.backend?.vatQuality ?? 'unknown'}-${report.backend?.backend?.startsWith('WebGPU') ? 'webgpu' : 'webgl2'}${palette}`
            const json = `${JSON.stringify(report, null, 2)}\n`
            await Promise.all([
              fs.writeFile(path.join(outputRoot, `supermesh-${suffix}.json`), json),
              fs.writeFile(path.join(outputRoot, 'supermesh-latest.json'), json),
            ])
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ saved: true }))
          } catch (error) {
            response.statusCode = 400
            response.end(error instanceof Error ? error.message : String(error))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), babylonLiteVat2dPlugin, supermeshScaleReportPlugin()],
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
            find: '@knervous/shado/svat',
            replacement: path.resolve(__dirname, '../src/svat/index.ts'),
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
            find: '@knervous/shado/storage',
            replacement: path.resolve(__dirname, '../src/storage/index.ts'),
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
