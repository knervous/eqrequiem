#!/usr/bin/env node
// Deterministic screenshots of the live Libra /models Shado/VAT runtime.
// This drives the exact render path a reviewer sees, so animation and
// skeleton problems that only exist in the VAT pipeline show up here.
//
// Usage: node scripts/render-shado-runtime.mjs --model hum --clip Walk \
//   --phases 0,0.25,0.5,0.75 --view front --output-dir /tmp/shots

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const scriptPath = fileURLToPath(import.meta.url)
const libraRoot = path.resolve(path.dirname(scriptPath), '..')

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const model = option('model', 'hum')
const clip = option('clip', 'Walk')
const sweep = Number(option('sweep', 0))
const phases = sweep > 0
  ? Array.from({ length: sweep }, (_, index) => Number((index / sweep).toFixed(4)))
  : option('phases', '0,0.25,0.5,0.75').split(',').map(Number)
// Whole playback cycles to skip first: cycle 0 uses the shader's first-pass
// frame mapping, later cycles use the loop-corrected mapping.
const cycleOffset = Number(option('cycle', 0))
const view = option('view', 'front')
const outputDir = path.resolve(option('output-dir', '.'))
const width = Number(option('width', 900))
const height = Number(option('height', 900))

async function launchChrome(url) {
  const chrome = process.env.CHROME_PATH ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'libra-shado-'))
  const child = spawn(chrome, [
    '--headless=new',
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--hide-scrollbars',
    '--use-angle=metal',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const childExit = new Promise((resolve) => child.once('exit', resolve))

  let stderr = ''
  const websocketUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Chrome did not expose DevTools:\n${stderr}`)), 15000)
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timeout)
        resolve(match[1])
      }
    })
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`Chrome exited early (${code}):\n${stderr}`)))
  })

  const socket = new WebSocket(websocketUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 1
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  const close = async () => {
    await send('Browser.close').catch(() => {})
    socket.close()
    await Promise.race([childExit, new Promise((resolve) => setTimeout(resolve, 3000))])
    if (child.exitCode === null) child.kill('SIGKILL')
    await fs.rm(profile, { recursive: true, force: true })
  }
  return { send, close }
}

async function evaluate(send, sessionId, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId)
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ??
      JSON.stringify(result.exceptionDetails))
  }
  return result.result.value
}

const server = await createServer({
  configFile: path.join(libraRoot, 'vite.config.ts'),
  root: libraRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
})
await server.listen()
await fs.mkdir(outputDir, { recursive: true })
const { send, close } = await launchChrome('about:blank')
try {
  const address = server.httpServer.address()
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, sessionId)
  await send('Page.navigate', { url: `http://127.0.0.1:${address.port}/models` }, sessionId)

  const deadline = Date.now() + 90000
  let ready = false
  while (Date.now() < deadline) {
    ready = await evaluate(send, sessionId, 'Boolean(window.__libraViewer)')
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error('Timed out waiting for the Libra viewer')

  if (model !== 'hum') {
    await evaluate(send, sessionId, `window.__libraSetModel(${JSON.stringify(model)})`)
    const modelDeadline = Date.now() + 90000
    ready = false
    while (Date.now() < modelDeadline) {
      ready = await evaluate(send, sessionId, 'Boolean(window.__libraViewer)')
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!ready) throw new Error(`Timed out switching the viewer to ${model}`)
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  const setup = await evaluate(send, sessionId, `(() => {
    const viewer = window.__libraViewer
    const scene = viewer.mesh.getScene()
    scene.getEngine().stopRenderLoop()
    viewer.playAnimation(${JSON.stringify(clip)})
    const camera = scene.activeCamera
    // The installed runtime faces legacy +X, so the camera sits at alpha 0
    // for a front view and at alpha pi/2 for the character's profile.
    camera.alpha = ${view === 'side' ? 'Math.PI / 2' : '0'}
    camera.beta = Math.PI / 2.15
    camera.radius = 9
    camera.target.set(0, 3, 0)
    const animation = viewer.animations.find((entry) => entry.name === ${JSON.stringify(clip)})
    window.__shotAt = (phase, cycle) => {
      const frames = animation.to - animation.from + 1
      const fps = animation.fps ?? 30
      viewer.mesh.bakedVertexAnimationManager.time = (cycle + phase) * frames / fps
      scene.render()
      return viewer.mesh.bakedVertexAnimationManager.time
    }
    return { from: animation.from, to: animation.to, fps: animation.fps }
  })()`)
  console.log(`clip ${clip}:`, JSON.stringify(setup))

  for (const phase of phases) {
    await evaluate(send, sessionId, `window.__shotAt(${phase}, ${cycleOffset})`)
    await new Promise((resolve) => setTimeout(resolve, 120))
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    }, sessionId)
    const file = path.join(outputDir, `${model}_${clip}_c${cycleOffset}_${phase}_${view}.png`)
    await fs.writeFile(file, Buffer.from(screenshot.data, 'base64'))
    console.log('wrote', file)
  }
} finally {
  await close()
  await server.close()
}
