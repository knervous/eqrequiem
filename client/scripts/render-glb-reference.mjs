#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const scriptPath = fileURLToPath(import.meta.url)
const clientRoot = path.resolve(path.dirname(scriptPath), '..')
const repoRoot = path.resolve(clientRoot, '..')

function parseArguments(argv) {
  const options = {
    output: path.join(repoRoot, 'assets/reference/render.png'),
    width: 1600,
    height: 1200,
    pose: 'pos',
    poseFraction: 0,
    frontAxis: '-z',
    auditSamples: 0,
    maxSpanRatio: 2,
    maxEdgeRatio: 25,
    maxP99EdgeRatio: 4,
    glbs: [],
  }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--output') options.output = argv[++index]
    else if (value === '--width') options.width = Number(argv[++index])
    else if (value === '--height') options.height = Number(argv[++index])
    else if (value === '--pose') options.pose = argv[++index]
    else if (value === '--pose-fraction') options.poseFraction = Number(argv[++index])
    else if (value === '--front-axis') options.frontAxis = argv[++index]
    else if (value === '--audit-animation-samples') options.auditSamples = Number(argv[++index])
    else if (value === '--max-span-ratio') options.maxSpanRatio = Number(argv[++index])
    else if (value === '--max-edge-ratio') options.maxEdgeRatio = Number(argv[++index])
    else if (value === '--max-p99-edge-ratio') options.maxP99EdgeRatio = Number(argv[++index])
    else if (value === '--fail-on-animation-deform') options.failOnAnimationDeform = true
    else if (value === '--input-json') options.glbs.push(...JSON.parse(argv[++index]))
    else if (value === '--help') options.help = true
    else options.glbs.push(value)
  }
  return options
}

function usage() {
  return `Usage: node scripts/render-glb-reference.mjs [options] <model.glb...>

Options:
  --input-json '["male.glb", "female.glb"]'
  --output reference.png
  --pose pos
  --pose-fraction 0.5
  --front-axis -z|+z|-x|+x
  --audit-animation-samples 9 --max-span-ratio 2 --max-edge-ratio 25
  --max-p99-edge-ratio 4
  --fail-on-animation-deform
  --width 1600 --height 1200`
}

async function launchChrome(url, width, height) {
  const chrome = process.env.CHROME_PATH ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eqrequiem-reference-'))
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

  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    }, sessionId)
    await send('Page.navigate', { url }, sessionId)

    const deadline = Date.now() + 60000
    let renderState
    while (Date.now() < deadline) {
      const evaluation = await send('Runtime.evaluate', {
        expression: 'window.__REFERENCE_RENDER_STATE__ ?? null',
        returnByValue: true,
      }, sessionId)
      renderState = evaluation.result.value
      if (renderState?.status === 'ready') break
      if (renderState?.status === 'error') throw new Error(renderState.error)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (renderState?.status !== 'ready') throw new Error('Timed out waiting for the Babylon render')
    await new Promise((resolve) => setTimeout(resolve, 250))
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    }, sessionId)
    return { png: Buffer.from(screenshot.data, 'base64'), renderState }
  } finally {
    await send('Browser.close').catch(() => {})
    socket.close()
    await Promise.race([
      childExit,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
    await fs.rm(profile, { recursive: true, force: true })
  }
}

export async function renderGlbReferenceSheet(options) {
  const specs = options.glbs.map((entry) => {
    if (typeof entry === 'string') {
      const glb = path.resolve(entry)
      return { label: path.basename(glb, path.extname(glb)), glbs: [glb] }
    }
    const glbs = (entry.glbs ?? [entry.path]).map((glb) => path.resolve(glb))
    return { label: entry.label ?? path.basename(glbs[0], path.extname(glbs[0])), glbs }
  })
  if (!specs.length) throw new Error('At least one GLB path is required')
  for (const spec of specs) for (const glb of spec.glbs) await fs.access(glb)
  const output = path.resolve(options.output)
  await fs.mkdir(path.dirname(output), { recursive: true })

  const server = await createServer({
    root: clientRoot,
    configFile: false,
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [repoRoot] } },
  })
  await server.listen()
  try {
    const address = server.httpServer.address()
    const models = specs.map((spec) => ({
      label: spec.label,
      urls: spec.glbs.map((glb) => `/@fs/${glb}`),
    }))
    const query = new URLSearchParams({
      models: JSON.stringify(models),
      pose: options.pose ?? 'pos',
      poseFraction: String(options.poseFraction ?? 0),
      frontAxis: options.frontAxis ?? '-z',
      auditSamples: String(options.auditSamples ?? 0),
      maxSpanRatio: String(options.maxSpanRatio ?? 2),
      maxEdgeRatio: String(options.maxEdgeRatio ?? 25),
      maxP99EdgeRatio: String(options.maxP99EdgeRatio ?? 4),
    })
    const url = `http://127.0.0.1:${address.port}/scripts/glb-reference-renderer/index.html?${query}`
    const result = await launchChrome(url, options.width ?? 1600, options.height ?? 1200)
    await fs.writeFile(output, result.png)
    const manifest = {
      schemaVersion: 1,
      output,
      inputs: specs,
      pose: options.pose ?? 'pos',
      poseFraction: options.poseFraction ?? 0,
      frontAxis: options.frontAxis ?? '-z',
      width: options.width ?? 1600,
      height: options.height ?? 1200,
      animationAudit: {
        samples: options.auditSamples ?? 0,
        maxSpanRatio: options.maxSpanRatio ?? 2,
        maxEdgeRatio: options.maxEdgeRatio ?? 25,
        maxP99EdgeRatio: options.maxP99EdgeRatio ?? 4,
      },
      render: result.renderState,
    }
    await fs.writeFile(output.replace(/\.png$/i, '.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest
  } finally {
    await server.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const options = parseArguments(process.argv.slice(2))
  if (options.help || !options.glbs.length) {
    console.log(usage())
    process.exitCode = options.help ? 0 : 1
  } else {
    renderGlbReferenceSheet(options)
      .then((manifest) => {
        console.log(JSON.stringify(manifest, null, 2))
        const failures = manifest.render.animationAudit?.failedClipCount ?? 0
        if (options.failOnAnimationDeform && failures) {
          throw new Error(`${failures} animation clips exceeded the deformation envelope`)
        }
      })
      .catch((error) => {
        console.error(error)
        process.exitCode = 1
      })
  }
}
