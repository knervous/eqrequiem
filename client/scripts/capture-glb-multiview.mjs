import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createServer } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientRoot = path.resolve(here, '..')
const repoRoot = path.resolve(clientRoot, '..')
export const HUNYUAN_MULTIVIEWS = ['left', 'front', 'back', 'right']
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export class GlbMultiviewRenderer {
  constructor({ outputRoot, width = 768, height = 768 } = {}) {
    this.outputRoot = path.resolve(outputRoot ?? repoRoot)
    this.width = width
    this.height = height
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
        fs: { allow: [repoRoot, this.outputRoot, await fs.realpath(os.tmpdir())] },
      },
    })
    await this.server.listen()
    this.profile = await fs.mkdtemp(path.join(os.tmpdir(), 'qeynos2-multiview-chrome-'))
    const chromePath = process.env.CHROME_PATH
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    this.chrome = spawn(chromePath, [
      '--headless=new',
      `--window-size=${this.width},${this.height}`,
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
      const timeout = setTimeout(() => reject(new Error(`Chrome did not expose DevTools:\n${stderr}`)), 15000)
      this.chrome.stderr.on('data', (chunk) => {
        stderr += chunk
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) {
          clearTimeout(timeout)
          resolve(match[1])
        }
      })
      this.chrome.once('error', reject)
      this.chrome.once('exit', (code) => reject(new Error(`Chrome exited early (${code}):\n${stderr}`)))
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
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true })
    this.sessionId = sessionId
    await this.send('Page.enable', {}, sessionId)
    await this.send('Runtime.enable', {}, sessionId)
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId)
    const address = this.server.httpServer.address()
    await this.send('Page.navigate', {
      url: `http://127.0.0.1:${address.port}/scripts/eq-catalog-renderer/index.html`,
    }, sessionId)
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      const state = await this.evaluate('window.__EQ_CATALOG_RENDERER_STATE__ ?? null')
      if (state?.status === 'ready') return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for the multiview renderer')
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
      throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails))
    }
    return result.result.value
  }

  async render(glbPath, outputDir, { raised = false } = {}) {
    await fs.mkdir(outputDir, { recursive: true })
    const geometry = await this.evaluate(
      `window.__EQ_CATALOG_RENDERER__.load(${JSON.stringify(`/@fs/${path.resolve(glbPath)}`)})`,
    )
    const snapshots = []
    for (const view of HUNYUAN_MULTIVIEWS) {
      const rendererView = raised ? `${view}Top` : view
      await this.evaluate(`window.__EQ_CATALOG_RENDERER__.setView(${JSON.stringify(rendererView)})`)
      await new Promise((resolve) => setTimeout(resolve, 120))
      const screenshot = await this.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      }, this.sessionId)
      const bytes = Buffer.from(screenshot.data, 'base64')
      const file = path.join(outputDir, `${view}.png`)
      await fs.writeFile(file, bytes)
      const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      let foreground = 0
      for (let index = 0; index < data.length; index += info.channels) {
        if (data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245) foreground++
      }
      snapshots.push({
        view,
        rendererView,
        file,
        sha256: sha256(bytes),
        foregroundFraction: foreground / (info.width * info.height),
      })
    }
    await this.evaluate('window.__EQ_CATALOG_RENDERER__.disposeCurrent()')
    return { geometry, snapshots }
  }

  async close() {
    if (this.socket) {
      await this.send('Browser.close').catch(() => {})
      this.socket.close()
    }
    if (this.chrome) {
      await Promise.race([this.chromeExit, new Promise((resolve) => setTimeout(resolve, 3000))])
      if (this.chrome.exitCode === null) this.chrome.kill('SIGKILL')
    }
    if (this.profile) await fs.rm(this.profile, { recursive: true, force: true })
    if (this.server) await this.server.close()
  }
}
