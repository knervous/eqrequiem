#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import sharp from 'sharp'

const gunzip = promisify(zlib.gunzip)
const repoRoot = path.resolve(import.meta.dirname, '../..')
const clientRoot = path.join(repoRoot, 'client')
const views = ['front', 'threeQuarter', 'side', 'back']

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const bodyInput = path.resolve(option('body') ?? '')
const headInput = path.resolve(option('head') ?? '')
const outputRoot = path.resolve(option('output') ?? '')
const pose = option('pose', 'pos')
const headVariation = option('head-variation', '00')
const width = Number(option('width', '1024'))
const height = Number(option('height', '1024'))
if (!option('body') || !option('head') || !option('output')) {
  throw new Error(
    'Usage: capture-eq-character-reference.mjs --body body.glb.gz ' +
    '--head head.glb.gz --output output-directory [--pose pos]',
  )
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

async function materializeGlb(input, output) {
  const bytes = await fs.readFile(input)
  const glb = input.toLowerCase().endsWith('.gz') ? await gunzip(bytes) : bytes
  await fs.writeFile(output, glb)
  return { input, output, sha256: sha256(glb), bytes: glb.length }
}

class BrowserRenderer {
  constructor() {
    this.nextId = 1
    this.pending = new Map()
  }

  async start() {
    this.server = await createServer({
      root: clientRoot,
      configFile: false,
      logLevel: 'error',
      optimizeDeps: { noDiscovery: true },
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
        fs: { allow: [repoRoot, outputRoot, await fs.realpath(os.tmpdir())] },
      },
    })
    await this.server.listen()
    const chromePath = process.env.CHROME_PATH
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    this.profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eq-character-chrome-'))
    this.chrome = spawn(chromePath, [
      '--headless=new',
      `--window-size=${width},${height}`,
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.profile}`,
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    this.chromeExit = new Promise((resolve) => this.chrome.once('exit', resolve))
    let stderr = ''
    const websocketUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Chrome did not expose DevTools:\n${stderr}`)),
        15000,
      )
      this.chrome.stderr.on('data', (chunk) => {
        stderr += chunk
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) {
          clearTimeout(timeout)
          resolve(match[1])
        }
      })
      this.chrome.once('error', reject)
      this.chrome.once('exit', (code) =>
        reject(new Error(`Chrome exited early (${code}):\n${stderr}`)))
    })
    this.socket = new WebSocket(websocketUrl)
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id || !this.pending.has(message.id)) return
      const pending = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' })
    const attached = await this.send('Target.attachToTarget', { targetId, flatten: true })
    this.sessionId = attached.sessionId
    await this.send('Page.enable', {}, this.sessionId)
    await this.send('Runtime.enable', {}, this.sessionId)
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    }, this.sessionId)
    const address = this.server.httpServer.address()
    const url = `http://127.0.0.1:${address.port}/scripts/eq-character-reference-renderer/index.html`
    await this.send('Page.navigate', { url }, this.sessionId)
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      const state = await this.evaluate('window.__EQ_CHARACTER_RENDERER_STATE__ ?? null')
      if (state?.status === 'ready') return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for EQ character renderer')
  }

  send(method, params = {}, sessionId = null) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, this.sessionId)
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description
        ?? JSON.stringify(result.exceptionDetails),
      )
    }
    return result.result.value
  }

  async close() {
    if (this.socket) {
      await this.send('Browser.close').catch(() => {})
      this.socket.close()
    }
    if (this.chrome) {
      await Promise.race([
        this.chromeExit,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ])
      if (this.chrome.exitCode === null) this.chrome.kill('SIGKILL')
    }
    if (this.profile) await fs.rm(this.profile, { recursive: true, force: true })
    if (this.server) await this.server.close()
  }
}

await fs.mkdir(path.join(outputRoot, 'source'), { recursive: true })
await fs.mkdir(path.join(outputRoot, 'snapshots'), { recursive: true })
const body = await materializeGlb(bodyInput, path.join(outputRoot, 'source', 'body.glb'))
const head = await materializeGlb(headInput, path.join(outputRoot, 'source', 'head.glb'))
const renderer = new BrowserRenderer()
let report
try {
  await renderer.start()
  const geometry = await renderer.evaluate(
    `window.__EQ_CHARACTER_RENDERER__.load(${JSON.stringify({
      bodyUrl: `/@fs/${body.output}`,
      headUrl: `/@fs/${head.output}`,
      pose,
    })})`,
  )
  const snapshots = []
  for (const view of views) {
    const camera = await renderer.evaluate(
      `window.__EQ_CHARACTER_RENDERER__.setView(${JSON.stringify(view)})`,
    )
    await new Promise((resolve) => setTimeout(resolve, 150))
    const result = await renderer.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    }, renderer.sessionId)
    const bytes = Buffer.from(result.data, 'base64')
    const file = path.join(outputRoot, 'snapshots', `${view}.png`)
    await fs.writeFile(file, bytes)
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    let foreground = 0
    for (let index = 0; index < data.length; index += info.channels) {
      if (data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245) {
        foreground++
      }
    }
    snapshots.push({
      view,
      file,
      sha256: sha256(bytes),
      foregroundFraction: foreground / (info.width * info.height),
      camera,
    })
  }
  const tiles = await Promise.all(snapshots.map(async ({ file }) => ({
    input: await sharp(file).resize(512, 512, { fit: 'contain', background: '#ffffff' }).png().toBuffer(),
  })))
  const contactSheet = path.join(outputRoot, 'contact-sheet.png')
  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' },
  }).composite(tiles.map((tile, index) => ({
    input: tile.input,
    left: (index % 2) * 512,
    top: Math.floor(index / 2) * 512,
  }))).png().toFile(contactSheet)
  report = {
    schemaVersion: 1,
    race: { id: 7, name: 'Half Elf', gender: 0, model: 'ham' },
    assembly: {
      body,
      head: { ...head, variation: headVariation },
      contract: 'separate skinned EQ body/head exports evaluated on matching pos skeletons',
    },
    pose,
    geometry,
    snapshots,
    contactSheet,
    generatedAt: new Date().toISOString(),
  }
  await fs.writeFile(
    path.join(outputRoot, 'capture-manifest.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
} finally {
  await renderer.close()
}
console.log(JSON.stringify(report, null, 2))
