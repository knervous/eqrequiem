#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { parseGlb, serializeGlb } from './material-ai/glb-material-palette.mjs'
import { addPbrChannels, geometrySummary } from './object-replacement-pipeline.mjs'
import { renderGlbReferenceSheet } from './render-glb-reference.mjs'
import { GlbMultiviewRenderer, HUNYUAN_MULTIVIEWS } from './capture-glb-multiview.mjs'

const execFileAsync = promisify(execFile)
const gunzipAsync = promisify(gunzip)
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const outputRoot = path.join(repoRoot, 'assets/generated/object-replacements/qeynos2-hunyuan-clean-room-all')
const auditFile = path.join(repoRoot, 'assets/generated/object-replacements/qeynos2-object-rest-audit.json')
const reportFile = path.join(outputRoot, 'report.json')
const hunyuan = (process.env.HUNYUAN_URL ?? 'http://192.168.2.139:7860').replace(/\/$/, '')
const blender = '/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender'
const shapeClient = path.join(repoRoot, 'assets/pipeline/generate_hunyuan_shape_lan.mjs')
const directCleanup = path.join(repoRoot, 'assets/pipeline/author_hunyuan_direct_cleanup.py')
const validator = path.join(repoRoot, 'assets/pipeline/validate_stablegen_object.py')
const ALL_STAGES = ['snapshots', 'shape', 'paint', 'validate']
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/')
}

async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  await fs.writeFile(temporary, value)
  await fs.rename(temporary, file)
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function fileExists(file) {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

async function withRetries(label, action, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      console.warn(`${label}: transient failure ${attempt}/${attempts}, retrying: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 5000))
    }
  }
  throw lastError
}

function semanticName(id) {
  const exact = {
    barrel3: 'closed coopered oak storage barrel with forged iron hoops',
    barrel4: 'closed coopered oak storage barrel with a distinct hoop arrangement',
    barrelonside: 'closed coopered oak barrel resting on its side',
    barstool2: 'round-seat timber tavern stool with braced legs',
    bed2: 'simple single timber bed with linen mattress and wool blanket',
    bed3: 'single medieval timber bed with raised headboard, mattress, and blanket',
    bed4: 'solid timber bed with low posts, linen mattress, and blanket',
    bench: 'backless timber city bench with trestle legs',
    bunk1: 'two-level timber bunk bed with mattresses and fixed ladder',
    cart: 'two-wheel timber hand cart with iron-rimmed wheels',
    chair: 'slat-back timber dining chair with four braced legs',
    chair2: 'plain high-back timber chair with reinforced legs',
    chair2d: 'rustic ladder-back timber chair with woven seat',
    chair3: 'compact medieval timber chair with arched back',
    chest1: 'closed timber storage chest with curved lid and iron straps',
    conftable: 'long heavy timber meeting table with trestle braces',
    crystal3: 'tall faceted amber crystal mounted in an aged-bronze base',
    drawer1: 'small timber bedside chest with drawers and iron pulls',
    dresser: 'waist-high timber dresser with drawers, doors, and iron pulls',
    hlamp: 'compact forged-iron brazier lamp with a protected warm flame',
    lightpole: 'timber street-light post with forged-iron arm and lantern',
    pawhook: 'hanging forged-iron cargo chain and practical hook',
    post: 'single square-hewn timber structural post with grounded foot',
    recttable: 'rectangular plank-top timber dining table with braced legs',
    roundtable: 'round plank-top tavern table with pedestal and four feet',
    roundtabled: 'round timber side table with splayed legs',
    rug2: 'flat woven wool rug with a restrained ochre border pattern',
    rug3: 'flat woven wool rug with a muted red geometric border',
    rug4: 'flat woven wool rug with a moss and umber diamond pattern',
    smalltable: 'small square plank-top side table with braced legs',
    squaretable: 'square heavy timber tavern table with trestle supports',
    torch2: 'forged-iron wall torch with square socket and restrained flame',
    torchpoint: 'forged-iron wall torch with pointed bracket and restrained flame',
    tree1: 'mature broad-canopy deciduous city tree with branching trunk',
    tree6: 'tall mature deciduous city tree with irregular broad crown',
    urn1: 'round-bellied fired-clay urn with two handles and narrow neck',
    urn2: 'tall weathered terracotta amphora with handles and stable foot',
    urn3: 'squat fired-clay storage jar with broad shoulder and lid',
  }
  if (exact[id]) return exact[id]
  if (/^crate/.test(id)) return 'closed cubic timber shipping crate with fitted plank lid and reinforced corners'
  return id.replace(/([a-z])([0-9])/g, '$1 $2')
}

function artDirection(id) {
  return {
    prompt: [
      semanticName(id),
      'realistic high-fantasy role-playing game prop',
      'coherent practical medieval construction',
      'aged natural materials',
      'subtle believable wear and dirt',
      'restrained color palette',
      'physically based game materials',
      'readable low-poly silhouette',
      'no modern manufactured details',
    ].join(', '),
    negativePrompt: [
      'text', 'letters', 'logo', 'watermark', 'character', 'creature', 'duplicate object',
      'floating fragments', 'melted geometry', 'extreme perspective', 'plastic toy',
      'neon colors', 'science fiction', 'modern hardware',
    ].join(', '),
  }
}

function targetTriangles(id) {
  if (/^rug/.test(id)) return 2000
  if (/^tree/.test(id)) return 12000
  if (/torch|lamp|pole|hook|crystal|^post$|^urn/.test(id)) return 6000
  if (/bed|bunk|cart|chair|stool|bench|table|drawer|dresser/.test(id)) return 12000
  return 8000
}

function integrityProfile(id) {
  if (/^rug/.test(id)) return 'planar'
  if (/torch|lamp|pole|hook|crystal|^post$/.test(id)) return 'slender'
  if (/barrel|bed|bunk|cart|chair|stool|bench|table|drawer|dresser/.test(id)) return 'beveled-furniture'
  return 'general'
}

function pbrProfile(id) {
  if (/^rug|bed|bunk/.test(id)) return { normalStrength: 1.25, normalScale: 0.8, roughness: 0.92, roughnessVariation: 0.06 }
  if (/crystal/.test(id)) return { normalStrength: 0.7, normalScale: 0.65, roughness: 0.42, roughnessVariation: 0.05 }
  if (/torch|lamp|pole|hook/.test(id)) return { normalStrength: 1.35, normalScale: 0.9, roughness: 0.7, roughnessVariation: 0.08 }
  if (/^urn/.test(id)) return { normalStrength: 1.45, normalScale: 0.9, roughness: 0.88, roughnessVariation: 0.09 }
  if (/^tree/.test(id)) return { normalStrength: 1.8, normalScale: 1, roughness: 0.9, roughnessVariation: 0.1 }
  return { normalStrength: 1.6, normalScale: 0.9, roughness: 0.84, roughnessVariation: 0.08 }
}

function correctionLimit(id) {
  if (id === 'cratea') return 1.12
  if (/^crate/.test(id)) return 1.5
  if (/^rug/.test(id)) return 1.35
  if (/barrel|chest/.test(id)) return 1.15
  if (/^tree/.test(id)) return 2
  if (/bench|cart|conftable|roundtable/.test(id)) return 1.6
  if (/torch|lamp|pole|hook|crystal|^post$/.test(id)) return 4
  return 1.35
}

function axisCorrection(id, cleanup) {
  const normalization = cleanup.placementNormalization ?? {}
  return /^rug/.test(id)
    ? normalization.maximumRelativeFootprintScale ?? Infinity
    : normalization.maximumRelativeAxisScale ?? Infinity
}

function shapeFamily(id) {
  if (/^barrel[34]$/.test(id)) return 'upright-barrel'
  if (/^rug[234]$/.test(id)) return 'floor-rug'
  return null
}

async function checkedFetch(url, init = {}, timeoutMs = 45 * 60 * 1000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${(await response.text()).slice(0, 2000)}`)
  return response
}

async function currentMode() {
  return (await checkedFetch(`${hunyuan}/mode`, {}, 30000)).json()
}

async function ensureMode(requestedMode) {
  const flag = requestedMode === 'shape' ? 'shape_loaded' : 'paint_loaded'
  const deadline = Date.now() + 15 * 60 * 1000
  let mode
  for (;;) {
    try {
      mode = await currentMode()
      break
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
  if (mode.mode === requestedMode && mode[flag]) return mode
  try {
    await checkedFetch(`${hunyuan}/mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: requestedMode }),
    }, 60000)
  } catch (error) {
    // The server may finish a synchronous model swap after the initiating
    // HTTP request exceeds its client deadline. Poll authoritative state.
    console.warn(`${requestedMode} mode request timed out; polling worker state`)
  }
  for (;;) {
    try {
      mode = await currentMode()
      if (mode.mode === requestedMode && mode[flag]) return mode
    } catch (error) {
      // Mode swaps unload and reload large pipelines. The single-worker API
      // can miss a probe deadline while that synchronous operation owns it.
      if (Date.now() >= deadline) throw error
    }
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${requestedMode}: ${JSON.stringify(mode)}`)
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

async function modelBytes(endpoint, payload) {
  const response = await checkedFetch(`${hunyuan}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const contentType = response.headers.get('content-type') ?? ''
  let bytes
  if (!contentType.includes('application/json')) {
    bytes = Buffer.from(await response.arrayBuffer())
  } else {
    const result = await response.json()
    if (result.model_base64) bytes = Buffer.from(result.model_base64, 'base64')
    else if (result.uid) {
      const deadline = Date.now() + 45 * 60 * 1000
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const status = await (await checkedFetch(`${hunyuan}/status/${result.uid}`, {}, 30000)).json()
        if (status.status === 'completed' && status.model_base64) {
          bytes = Buffer.from(status.model_base64, 'base64')
          break
        }
        if (!['processing', 'queued'].includes(status.status)) throw new Error(`${endpoint} job failed: ${JSON.stringify(status)}`)
        if (Date.now() >= deadline) throw new Error(`${endpoint} job ${result.uid} timed out`)
      }
    } else throw new Error(`Unexpected ${endpoint} response: ${JSON.stringify(result).slice(0, 2000)}`)
  }
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`${endpoint} response is not a binary GLB (${bytes.length} bytes)`)
  }
  return bytes
}

async function validateWithBlender(file, report, profile) {
  await execFileAsync(blender, [
    '--background', '--factory-startup', '--python', validator, '--', file, report, profile,
  ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 })
  return readJson(report)
}

async function snapshotComplete(item) {
  try {
    const report = await readJson(item.snapshotReport)
    if (report.source.sha256 !== item.sourceSha256) return null
    const reportProjection = report.projection ?? 'canonical-horizontal-four-side'
    if (reportProjection !== item.snapshotProjection) return null
    for (const view of HUNYUAN_MULTIVIEWS) {
      const row = report.snapshots.find((snapshot) => snapshot.view === view)
      if (!row) return null
      const bytes = await fs.readFile(path.join(repoRoot, row.file))
      if (sha256(bytes) !== row.sha256) return null
    }
    return report
  } catch {
    return null
  }
}

async function captureSnapshots(items, temporaryRoot, report) {
  const renderer = new GlbMultiviewRenderer({ outputRoot, width: 768, height: 768 })
  await renderer.start()
  try {
    for (const [index, item] of items.entries()) {
      if (process.argv.includes('--resume')) {
        const previous = await snapshotComplete(item)
        if (previous) {
          item.snapshots = previous.snapshots
          console.log(`[snapshot ${index + 1}/${items.length}] ${item.id}: resume`)
          continue
        }
      }
      console.log(`[snapshot ${index + 1}/${items.length}] ${item.id}: ROF2 left/front/back/right`)
      const sourceBytes = await fs.readFile(item.sourceFile)
      const glbBytes = item.sourceFile.toLowerCase().endsWith('.gz') ? await gunzipAsync(sourceBytes) : sourceBytes
      const temporaryGlb = path.join(temporaryRoot, `${item.id}.glb`)
      await fs.writeFile(temporaryGlb, glbBytes)
      const rendered = await renderer.render(temporaryGlb, item.snapshotRoot, {
        raised: item.snapshotProjection === 'raised-planar-four-side',
      })
      item.snapshots = rendered.snapshots.map((snapshot) => ({ ...snapshot, file: relative(snapshot.file) }))
      const snapshotReport = {
        kind: 'requiem.rof2-object-multiview',
        version: 1,
        id: item.id,
        source: { file: item.sourceFile, sha256: item.sourceSha256 },
        geometry: rendered.geometry,
        projection: item.snapshotProjection,
        views: HUNYUAN_MULTIVIEWS,
        snapshots: item.snapshots,
        completedAt: new Date().toISOString(),
      }
      await atomicWrite(item.snapshotReport, `${JSON.stringify(snapshotReport, null, 2)}\n`)
      await fs.rm(temporaryGlb, { force: true })
      report.progress.snapshots = index + 1
      await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`)
    }
  } finally {
    await renderer.close()
  }
}

function snapshotPath(item, view) {
  const row = item.snapshots.find((snapshot) => snapshot.view === view)
  if (!row) throw new Error(`${item.id} is missing ${view} snapshot`)
  return path.join(repoRoot, row.file)
}

async function paintReference(item) {
  const front = snapshotPath(item, 'front')
  const region = item.id === 'lightpole' ? 'top' : (item.id === 'pawhook' ? 'bottom' : null)
  if (!region) return front
  const { data, info } = await sharp(front)
    .trim({ background: '#ffffff', threshold: 10 })
    .png()
    .toBuffer({ resolveWithObject: true })
  const detailHeight = Math.max(1, Math.round(info.height * 0.42))
  const top = region === 'top' ? 0 : info.height - detailHeight
  const detail = await sharp(data)
    .extract({ left: 0, top, width: info.width, height: detailHeight })
    .resize(768, 768, {
      fit: 'contain',
      background: { r: 112, g: 112, b: 108, alpha: 1 },
    })
    .png()
    .toBuffer()
  await atomicWrite(item.paintReferenceFile, detail)
  return item.paintReferenceFile
}

async function reusableShape(item) {
  try {
    const [bytes, cleanup, integrity, source] = await Promise.all([
      fs.readFile(item.shapeFile), readJson(item.cleanupReport), readJson(item.shapeIntegrityReport),
      readJson(item.shapeSourceReport),
    ])
    const geometry = geometrySummary(parseGlb(bytes))
    const target = targetTriangles(item.id)
    const eligibleConditioning = Boolean(
      cleanup.familyDonor
      || source.operation === 'hunyuan-generated-family-donor-fallback'
      || source.request?.multiview,
    )
    if (
      cleanup.triangles?.target !== target
      || !integrity.passed
      || !eligibleConditioning
      || axisCorrection(item.id, cleanup) > correctionLimit(item.id)
    ) return null
    if (geometry.triangleCount < Math.floor(target * 0.98) || geometry.triangleCount > Math.ceil(target * 1.005)) return null
    return { geometry, cleanup, integrity }
  } catch {
    return null
  }
}

async function generateShapes(items, report) {
  await ensureMode('shape')
  for (const [index, item] of items.entries()) {
    const target = targetTriangles(item.id)
    const profile = integrityProfile(item.id)
    if (process.argv.includes('--resume')) {
      const previous = await reusableShape(item)
      if (previous) {
        item.shape = previous
        console.log(`[shape ${index + 1}/${items.length}] ${item.id}: resume (${previous.geometry.triangleCount} tris)`)
        continue
      }
    }
    console.log(`[shape ${index + 1}/${items.length}] ${item.id}: multiview -> ${target} tris`)
    try {
      const direction = artDirection(item.id)
      const commonArguments = [
        '--server', hunyuan,
        '--prompt', direction.prompt,
        '--negative-prompt', direction.negativePrompt,
        '--output', item.shapeFile,
        '--report', item.shapeSourceReport,
        '--octree-resolution', '256',
        '--steps', '5',
        '--guidance-scale', '5.5',
        '--target-triangles', String(target),
        '--placement-size', JSON.stringify(item.placementSize),
        '--switch-mode', 'false',
      ]
      try {
        await withRetries(`${item.id} shape`, () => execFileAsync(process.execPath, [shapeClient,
          '--multiview-left', snapshotPath(item, 'left'),
          '--multiview-front', snapshotPath(item, 'front'),
          '--multiview-back', snapshotPath(item, 'back'),
          '--multiview-right', snapshotPath(item, 'right'),
          ...commonArguments,
        ], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, timeout: 45 * 60 * 1000 }), 3)
      } catch (multiviewError) {
        if (!/^rug/.test(item.id)) throw multiviewError
        console.warn(`${item.id}: multiview failed for planar input; using raised primary-view Shape fallback`)
        await withRetries(`${item.id} planar primary-view shape`, () => execFileAsync(process.execPath, [shapeClient,
          '--image', snapshotPath(item, 'front'),
          ...commonArguments,
        ], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, timeout: 45 * 60 * 1000 }), 3)
      }
      let cleanup = await readJson(item.cleanupReport)
      if (!/^rug/.test(item.id) && axisCorrection(item.id, cleanup) > correctionLimit(item.id)) {
        console.warn(
          `${item.id}: axis correction ${axisCorrection(item.id, cleanup).toFixed(3)} exceeds `
          + `${correctionLimit(item.id).toFixed(3)}; retrying Shape from primary view`,
        )
        await withRetries(`${item.id} primary-view disparity retry`, () => execFileAsync(process.execPath, [shapeClient,
          '--image', snapshotPath(item, 'front'),
          ...commonArguments,
        ], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, timeout: 45 * 60 * 1000 }), 3)
        cleanup = await readJson(item.cleanupReport)
      }
      const integrity = await validateWithBlender(item.shapeFile, item.shapeIntegrityReport, profile)
      const bytes = await fs.readFile(item.shapeFile)
      item.shape = {
        geometry: geometrySummary(parseGlb(bytes)),
        cleanup,
        integrity,
      }
    } catch (error) {
      item.failure = { stage: 'shape', message: error.message }
      report.failures.push({ id: item.id, ...item.failure })
      console.error(`[shape ${index + 1}/${items.length}] ${item.id}: ERROR ${error.message}`)
    }
    report.progress.shape = index + 1
    await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`)
  }
  for (const item of items) {
    const family = shapeFamily(item.id)
    if (
      !family
      || !item.shape
      || axisCorrection(item.id, item.shape.cleanup) <= correctionLimit(item.id)
    ) continue
    const donor = items.find((candidate) => (
      candidate.id !== item.id
      && shapeFamily(candidate.id) === family
      && candidate.shape?.integrity?.passed
      && axisCorrection(candidate.id, candidate.shape.cleanup) <= correctionLimit(candidate.id)
    ))
    if (!donor) continue
    console.warn(`${item.id}: using validated generated ${family} shape donor ${donor.id}`)
    const donorRaw = donor.shapeFile.replace(/\.glb$/i, '.raw.glb')
    if (await fileExists(donorRaw)) {
      await execFileAsync(blender, [
        '--background', '--factory-startup', '--python', directCleanup, '--',
        '--input', donorRaw,
        '--output', item.shapeFile,
        '--report', item.cleanupReport,
        '--target-triangles', String(targetTriangles(item.id)),
        '--placement-size', JSON.stringify(item.placementSize),
      ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 })
    } else {
      await atomicWrite(item.shapeFile, await fs.readFile(donor.shapeFile))
      await atomicWrite(item.cleanupReport, `${JSON.stringify(donor.shape.cleanup, null, 2)}\n`)
    }
    const donorBytes = await fs.readFile(item.shapeFile)
    const donorShapeBytes = await fs.readFile(donor.shapeFile)
    const cleanup = {
      ...await readJson(item.cleanupReport),
      kind: 'requiem.hunyuan-generated-family-donor-shape',
      output: item.shapeFile,
      familyDonor: {
        family,
        id: donor.id,
        file: relative(donor.shapeFile),
        sha256: sha256(donorShapeBytes),
        conditionedOutputSha256: sha256(donorBytes),
        reason: 'asset-specific Shape exceeded the bounded axis-correction disparity gate',
      },
    }
    await atomicWrite(item.cleanupReport, `${JSON.stringify(cleanup, null, 2)}\n`)
    const source = {
      schemaVersion: 1,
      operation: 'hunyuan-generated-family-donor-fallback',
      completedAt: new Date().toISOString(),
      server: hunyuan,
      target: {
        id: item.id,
        snapshots: Object.fromEntries(HUNYUAN_MULTIVIEWS.map((view) => [view, relative(snapshotPath(item, view))])),
        prompt: artDirection(item.id),
      },
      donor: cleanup.familyDonor,
      response: { output: relative(item.shapeFile), outputSha256: sha256(donorBytes), validBinaryGlb: true },
    }
    await atomicWrite(item.shapeSourceReport, `${JSON.stringify(source, null, 2)}\n`)
    const integrity = await validateWithBlender(
      item.shapeFile,
      item.shapeIntegrityReport,
      integrityProfile(item.id),
    )
    item.shape = { geometry: geometrySummary(parseGlb(donorBytes)), cleanup, integrity }
  }
}

async function reusablePaint(item) {
  try {
    const [bytes, shapeBytes, source, integrity] = await Promise.all([
      fs.readFile(item.finalFile),
      fs.readFile(item.shapeFile),
      readJson(item.paintSourceReport),
      readJson(item.finalIntegrityReport),
    ])
    const geometry = geometrySummary(parseGlb(bytes))
    if (
      !source.response?.validBinaryGlb
      || source.request?.meshSha256 !== sha256(shapeBytes)
      || !integrity.passed
      || !geometry.everyPrimitiveTextured
      || !geometry.everyPrimitiveNormalMapped
      || !geometry.everyPrimitiveMetallicRoughnessMapped
    ) return null
    return { geometry, source, integrity }
  } catch {
    return null
  }
}

async function paintShapes(items, report) {
  await ensureMode('paint')
  for (const [index, item] of items.entries()) {
    if (!item.shape || !(await fileExists(item.shapeFile))) {
      console.warn(`[paint ${index + 1}/${items.length}] ${item.id}: skip, no valid shape`)
      continue
    }
    if (process.argv.includes('--resume')) {
      const previous = await reusablePaint(item)
      if (previous) {
        item.paint = previous
        console.log(`[paint ${index + 1}/${items.length}] ${item.id}: resume`)
        continue
      }
    }
    console.log(`[paint ${index + 1}/${items.length}] ${item.id}: realistic high-fantasy materials`)
    const startedAt = new Date().toISOString()
    try {
      const primaryPaintReference = await paintReference(item)
      const [mesh, primaryImage, ...canonicalViews] = await Promise.all([
      fs.readFile(item.shapeFile),
      fs.readFile(primaryPaintReference),
      ...HUNYUAN_MULTIVIEWS.map((view) => fs.readFile(snapshotPath(item, view))),
    ])
    const viewBytes = Object.fromEntries(
      HUNYUAN_MULTIVIEWS.map((view, viewIndex) => [view, canonicalViews[viewIndex]]),
    )
    const direction = artDirection(item.id)
    const payload = {
      mesh: mesh.toString('base64'),
      image: primaryImage.toString('base64'),
      multiview: Object.fromEntries(Object.entries(viewBytes).map(([view, bytes]) => [view, bytes.toString('base64')])),
      prompt: direction.prompt,
      positive_prompt: direction.prompt,
      negative_prompt: direction.negativePrompt,
      face_count: targetTriangles(item.id),
      texture: true,
      type: 'glb',
    }
    const paintedBytes = await withRetries(`${item.id} paint`, () => modelBytes('paint', payload), 3)
    await atomicWrite(item.paintRawFile, paintedBytes)
    const bytes = serializeGlb(await addPbrChannels(parseGlb(paintedBytes), pbrProfile(item.id)))
    await atomicWrite(item.finalFile, bytes)
    const integrity = await validateWithBlender(item.finalFile, item.finalIntegrityReport, integrityProfile(item.id))
    const geometry = geometrySummary(parseGlb(bytes))
    const source = {
      kind: 'requiem.hunyuan-reference-guided-paint',
      version: 1,
      startedAt,
      completedAt: new Date().toISOString(),
      server: hunyuan,
      request: {
        mesh: relative(item.shapeFile),
        meshSha256: sha256(mesh),
        image: relative(primaryPaintReference),
        imageDerivedFrom: primaryPaintReference === snapshotPath(item, 'front')
          ? null
          : relative(snapshotPath(item, 'front')),
        multiview: Object.fromEntries(Object.entries(viewBytes).map(([view, value]) => [view, {
          file: relative(snapshotPath(item, view)), sha256: sha256(value),
        }])),
        prompt: direction.prompt,
        negativePrompt: direction.negativePrompt,
        faceCount: targetTriangles(item.id),
      },
      response: {
        rawPaintOutput: relative(item.paintRawFile),
        rawPaintBytes: paintedBytes.length,
        rawPaintSha256: sha256(paintedBytes),
        output: relative(item.finalFile),
        bytes: bytes.length,
        sha256: sha256(bytes),
        validBinaryGlb: true,
        geometry,
      },
    }
    await atomicWrite(item.paintSourceReport, `${JSON.stringify(source, null, 2)}\n`)
    item.paint = { geometry, source, integrity }
    } catch (error) {
      item.failure = { stage: 'paint', message: error.message }
      report.failures.push({ id: item.id, ...item.failure })
      console.error(`[paint ${index + 1}/${items.length}] ${item.id}: ERROR ${error.message}`)
    }
    report.progress.paint = index + 1
    await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`)
  }
}

function resultFor(item) {
  const target = targetTriangles(item.id)
  const shapeGeometry = item.shape?.geometry
  const finalGeometry = item.paint?.geometry
  const checks = {
    fourRof2Views: item.snapshots?.length === 4,
    shapeTriangleBudget: Boolean(shapeGeometry)
      && shapeGeometry.triangleCount >= Math.floor(target * 0.98)
      && shapeGeometry.triangleCount <= Math.ceil(target * 1.005),
    shapeIntegrity: item.shape?.integrity?.passed === true,
    boundedShapeAxisCorrection: Boolean(item.shape?.cleanup)
      && axisCorrection(item.id, item.shape.cleanup) <= correctionLimit(item.id),
    finalIntegrity: item.paint?.integrity?.passed === true,
    finalTextured: finalGeometry?.everyPrimitiveTextured === true,
    finalNormalMapped: finalGeometry?.everyPrimitiveNormalMapped === true,
    finalMetallicRoughnessMapped: finalGeometry?.everyPrimitiveMetallicRoughnessMapped === true,
    positiveFinalBounds: finalGeometry?.size?.every((value) => Number.isFinite(value) && value > 0) === true,
  }
  return {
    id: item.id,
    policy: 'owner-authorized-rof2-multiview-reference-guided-regeneration',
    targetTriangles: target,
    placementSize: item.placementSize,
    prompt: artDirection(item.id),
    snapshots: relative(item.snapshotRoot),
    shape: relative(item.shapeFile),
    shapeGeometry,
    final: item.paint ? relative(item.finalFile) : null,
    finalGeometry,
    integrity: relative(item.finalIntegrityReport),
    checks,
    failure: item.failure ?? null,
    passed: Object.values(checks).every(Boolean),
  }
}

async function renderBatches(results) {
  const rendered = []
  for (let index = 0; index < results.length; index += 4) {
    const batch = results.slice(index, index + 4)
    const number = String(index / 4 + 1).padStart(2, '0')
    const output = path.join(outputRoot, `painted-review-${number}.png`)
    await renderGlbReferenceSheet({
      glbs: batch.map((result) => ({
        label: `${result.id}: ${result.passed ? 'TECH PASS' : 'REJECT'}`,
        path: path.join(repoRoot, result.final),
      })),
      output,
      width: 1800,
      height: 1800,
      frontAxis: '-xz-high',
      focus: 'full',
    })
    rendered.push(relative(output))
  }
  return rendered
}

async function loadItems(audit) {
  const excluded = new Set(audit.excludedStateful.map(({ id }) => id))
  const requested = option('ids')?.split(',').filter(Boolean) ?? null
  const maximum = Number(option('max-assets') ?? Infinity)
  const items = []
  for (const row of audit.objects) {
    if (excluded.has(row.id) || (requested && !requested.includes(row.id))) continue
    const descriptionFile = path.join(repoRoot, row.description
      ?? `assets/generated/eq-catalog/objects/${row.id}/description.json`)
    const description = await readJson(descriptionFile)
    const sourceFile = path.resolve(description.source.file)
    const sourceBytes = await fs.readFile(sourceFile)
    const directory = path.join(outputRoot, row.id)
    items.push({
      id: row.id,
      placementSize: description.geometry.size,
      sourceFile,
      sourceSha256: sha256(sourceBytes),
      snapshotProjection: /^rug/.test(row.id)
        ? 'raised-planar-four-side'
        : 'canonical-horizontal-four-side',
      directory,
      snapshotRoot: path.join(directory, 'rof2-multiview'),
      snapshotReport: path.join(directory, 'rof2-multiview.json'),
      shapeFile: path.join(directory, 'shape.glb'),
      shapeSourceReport: path.join(directory, 'shape-source.json'),
      cleanupReport: path.join(directory, 'shape.direct-cleanup.json'),
      shapeIntegrityReport: path.join(directory, 'shape-integrity.json'),
      paintRawFile: path.join(directory, 'paint.raw.glb'),
      paintReferenceFile: path.join(directory, 'paint-reference.png'),
      finalFile: path.join(directory, 'final.glb'),
      paintSourceReport: path.join(directory, 'paint-source.json'),
      finalIntegrityReport: path.join(directory, 'integrity.json'),
    })
  }
  items.sort((left, right) => left.id.localeCompare(right.id))
  items.splice(maximum)
  return { items, excluded: [...excluded].sort() }
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true })
  const stages = (option('stages') ?? ALL_STAGES.join(',')).split(',').filter(Boolean)
  const unknown = stages.filter((stage) => !ALL_STAGES.includes(stage))
  if (unknown.length) throw new Error(`Unknown stages: ${unknown.join(', ')}`)
  const audit = await readJson(auditFile)
  const { items, excluded } = await loadItems(audit)
  const report = {
    kind: 'requiem.qeynos2-hunyuan-rof2-multiview-batch',
    version: 2,
    state: 'running',
    server: hunyuan,
    policy: 'owner-authorized-rof2-multiview-reference-guided-regeneration',
    stages,
    requestedAssets: items.length,
    excludedStateful: excluded,
    progress: { snapshots: 0, shape: 0, paint: 0 },
    failures: [],
    results: [],
    reviews: [],
    startedAt: new Date().toISOString(),
  }
  await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`)
  const temporaryRoot = await fs.mkdtemp(path.join(outputRoot, '.rof2-multiview-'))
  try {
    if (stages.includes('snapshots')) await captureSnapshots(items, temporaryRoot, report)
    else if (stages.some((stage) => ['shape', 'paint', 'validate'].includes(stage))) {
      for (const item of items) {
        const previous = await snapshotComplete(item)
        if (!previous) throw new Error(`${item.id} has no valid multiview snapshot checkpoint`)
        item.snapshots = previous.snapshots
      }
    }
    if (stages.includes('shape')) await generateShapes(items, report)
    else if (stages.some((stage) => ['paint', 'validate'].includes(stage))) {
      for (const item of items) {
        const previous = await reusableShape(item)
        if (!previous) throw new Error(`${item.id} has no valid shape checkpoint`)
        item.shape = previous
      }
    }
    if (stages.includes('paint')) await paintShapes(items, report)
    else if (stages.includes('validate')) {
      for (const item of items) item.paint = await reusablePaint(item)
    }
    report.results = items.map(resultFor)
    if (stages.includes('validate')) report.reviews = await renderBatches(report.results.filter((result) => result.final))
    report.counts = {
      passed: report.results.filter(({ passed }) => passed).length,
      rejected: report.results.filter(({ passed }) => !passed).length,
    }
    report.state = report.results.every(({ passed }) => passed)
      ? 'technical-pass-awaiting-owner-image-review'
      : 'completed-with-rejections'
    report.completedAt = new Date().toISOString()
    await atomicWrite(reportFile, `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify({ report: relative(reportFile), state: report.state, ...report.counts }, null, 2))
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  process.exitCode = 1
})
