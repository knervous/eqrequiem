#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { parseGlb, serializeGlb } from './material-ai/glb-material-palette.mjs'
import { addPbrChannels, geometrySummary } from './object-replacement-pipeline.mjs'
import { GlbMultiviewRenderer, HUNYUAN_MULTIVIEWS } from './capture-glb-multiview.mjs'
import { renderGlbReferenceSheet } from './render-glb-reference.mjs'

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const sourceRoot = path.join(repoRoot, 'assets/generated/object-replacements/qeynos2-hunyuan-clean-room-all')
const outputRoot = path.join(sourceRoot, 'repaints/dark-fantasy-v2')
const conceptRoot = path.join(sourceRoot, 'repaints/dark-fantasy-concepts')
const hunyuan = (process.env.HUNYUAN_URL ?? 'http://192.168.2.139:7860').replace(/\/$/, '')
const blender = '/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender'
const validator = path.join(repoRoot, 'assets/pipeline/validate_stablegen_object.py')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const descriptions = {
  barrel3: 'closed coopered storage barrel with forged hoops',
  barrel4: 'closed coopered storage barrel with a distinct forged-hoop arrangement',
  barrelonside: 'closed coopered storage barrel resting on its side',
  barstool2: 'round-seat timber tavern stool with braced legs',
  bed2: 'simple single timber bed with linen mattress and wool blanket',
  bed3: 'single medieval timber bed with raised headboard, mattress, and blanket',
  bed4: 'solid timber bed with low posts, linen mattress, and blanket',
  bench: 'backless timber city bench with trestle legs',
  bunk1: 'two-level timber bunk bed with mattresses and fixed ladder',
  chair: 'practical medieval slat-back dining chair',
  chair2: 'plain high-back timber chair with reinforced legs',
  chair2d: 'rustic ladder-back timber chair with woven seat',
  chair3: 'compact medieval timber chair with arched back',
  chest1: 'closed timber storage chest with curved lid and iron straps',
  conftable: 'long heavy timber meeting table with trestle braces',
  cart: 'two-wheel timber hand cart with iron-rimmed wheels',
  cratea: 'closed cubic shipping crate with reinforced corners',
  crateb: 'closed cubic shipping crate with reinforced corners and fitted plank lid',
  cratec: 'closed cubic shipping crate with reinforced corners and fitted plank lid',
  crated: 'closed cubic shipping crate with reinforced corners and fitted plank lid',
  cratee: 'closed cubic shipping crate with reinforced corners and fitted plank lid',
  cratef: 'closed cubic shipping crate with reinforced corners and fitted plank lid',
  crateg: 'closed cubic shipping crate with reinforced corners and fitted plank lid',
  crystal3: 'tall faceted mineral crystal mounted in an aged metal base',
  drawer1: 'small timber bedside chest with drawers and iron pulls',
  dresser: 'waist-high timber dresser with drawers, doors, and iron pulls',
  hlamp: 'compact forged-iron brazier lamp with a protected warm flame',
  lightpole: 'street-light post with hooked arm and enclosed lantern',
  pawhook: 'hanging forged-iron cargo chain and practical hook',
  post: 'single square-hewn timber structural post with grounded foot',
  recttable: 'rectangular plank-top timber dining table with braced legs',
  roundtable: 'round plank-top tavern table with pedestal and four feet',
  roundtabled: 'round timber side table with splayed legs',
  rug2: 'flat woven wool floor rug with a restrained border pattern',
  rug3: 'flat woven wool floor rug with a geometric border',
  rug4: 'flat woven wool floor rug with a diamond border pattern',
  smalltable: 'small square plank-top side table with braced legs',
  squaretable: 'square heavy timber tavern table with trestle supports',
  torch2: 'forged-iron wall torch with square socket and restrained flame',
  torchpoint: 'forged-iron wall torch with pointed bracket and restrained flame',
  tree1: 'mature broad-canopy city tree with branching trunk',
  tree6: 'tall mature city tree with an irregular broad crown',
  urn1: 'round-bellied fired-clay urn with handles and narrow neck',
  urn2: 'tall weathered fired-clay amphora with handles and stable foot',
  urn3: 'squat fired-clay storage jar with broad shoulder and lid',
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

function pbrProfile(id) {
  if (/^rug|bed|bunk/.test(id)) return { normalStrength: 1.25, normalScale: 0.8, roughness: 0.94, roughnessVariation: 0.07 }
  if (/lamp|pole/.test(id)) return { normalStrength: 1.4, normalScale: 0.9, roughness: 0.76, roughnessVariation: 0.1 }
  if (/^urn/.test(id)) return { normalStrength: 1.5, normalScale: 0.9, roughness: 0.9, roughnessVariation: 0.1 }
  if (/^tree/.test(id)) return { normalStrength: 1.8, normalScale: 1, roughness: 0.92, roughnessVariation: 0.11 }
  return { normalStrength: 1.65, normalScale: 0.9, roughness: 0.87, roughnessVariation: 0.1 }
}

function integrityProfile(id) {
  if (/^rug/.test(id)) return 'planar'
  if (/torch|lamp|pole|hook|crystal|^post$/.test(id)) return 'slender'
  if (/barrel|bed|bunk|cart|chair|stool|bench|table|drawer|dresser/.test(id)) return 'beveled-furniture'
  return 'general'
}

function artDirection(id) {
  const prompt = [
    descriptions[id] ?? id,
    'original clean-room dark fantasy game prop repaint',
    'grim lived-in fortified medieval city',
    'smoke-darkened aged natural materials',
    'desaturated umber charcoal soot black deep moss and oxidized iron palette',
    'subtle cold gray highlights and restrained warm lantern light where appropriate',
    'layered grime rain streaks edge wear dirt accumulation and material-specific roughness',
    'realistic timber iron wool clay bark and foliage surface response',
    'physically based low-poly game asset texture',
    'cohesive grounded dark fantasy art direction',
    'preserve the supplied mesh silhouette and proportions exactly',
  ].join(', ')
  const negativePrompt = [
    'EverQuest', 'legacy EQ texture', 'copy original colors', 'bright orange wood', 'clean honey-colored wood',
    'saturated primary colors', 'cartoon', 'toy', 'plastic', 'glossy varnish', 'flat uniform color',
    'painted logo', 'text', 'letters', 'watermark', 'runes', 'blood', 'gore', 'skulls',
    'science fiction', 'modern hardware', 'new object', 'changed geometry', 'floating fragments',
  ].join(', ')
  return { prompt, negativePrompt }
}

function paintGeometryGate(id, sourceGeometry, finalGeometry) {
  const exact = sourceGeometry.triangleCount === finalGeometry.triangleCount
  const identicalBounds = JSON.stringify(sourceGeometry.bounds) === JSON.stringify(finalGeometry.bounds)
  const removed = sourceGeometry.triangleCount - finalGeometry.triangleCount
  const removedFraction = removed / Math.max(1, sourceGeometry.triangleCount)
  const maximumSanitationFraction = /^tree/.test(id) ? 0.01 : 0.005
  const boundedPaintSanitation = identicalBounds
    && removed >= 0
    && removedFraction <= maximumSanitationFraction
  return {
    exact,
    identicalBounds,
    removedTriangles: removed,
    removedFraction,
    maximumSanitationFraction,
    boundedPaintSanitation,
    accepted: exact || boundedPaintSanitation,
  }
}

async function checkedFetch(url, init = {}, timeoutMs = 45 * 60 * 1000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${(await response.text()).slice(0, 2000)}`)
  return response
}

async function ensurePaintMode() {
  const deadline = Date.now() + 15 * 60 * 1000
  let state
  try {
    state = await (await checkedFetch(`${hunyuan}/mode`, {}, 30000)).json()
  } catch {
    state = null
  }
  if (state?.mode !== 'paint' || !state.paint_loaded) {
    await checkedFetch(`${hunyuan}/mode`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'paint' }),
    }, 60000).catch(() => {})
  }
  while (Date.now() < deadline) {
    try {
      state = await (await checkedFetch(`${hunyuan}/mode`, {}, 30000)).json()
      if (state.mode === 'paint' && state.paint_loaded) return state
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error(`Timed out waiting for Paint mode: ${JSON.stringify(state)}`)
}

async function modelBytes(payload) {
  const response = await checkedFetch(`${hunyuan}/paint`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return Buffer.from(await response.arrayBuffer())
  const result = await response.json()
  if (result.model_base64) return Buffer.from(result.model_base64, 'base64')
  if (!result.uid) throw new Error(`Unexpected Paint response: ${JSON.stringify(result).slice(0, 2000)}`)
  const deadline = Date.now() + 45 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const status = await (await checkedFetch(`${hunyuan}/status/${result.uid}`, {}, 30000)).json()
    if (status.status === 'completed' && status.model_base64) return Buffer.from(status.model_base64, 'base64')
    if (!['processing', 'queued'].includes(status.status)) throw new Error(`Paint job failed: ${JSON.stringify(status)}`)
  }
  throw new Error(`Paint job ${result.uid} timed out`)
}

async function main() {
  const ids = (option('ids') ?? Object.keys(descriptions).join(',')).split(',').filter(Boolean)
  await fs.mkdir(outputRoot, { recursive: true })
  const repairIds = new Set(['barrelonside', 'chair2d', 'pawhook', 'torch2'])
  const useRepairs = process.argv.includes('--repairs')
  const items = ids.map((id) => {
    const directory = path.join(outputRoot, id)
    const repairedShape = useRepairs && ['barrelonside', 'torch2'].includes(id)
      ? path.join(directory, 'repair-shape.glb')
      : null
    return {
      id,
      source: repairedShape ?? path.join(sourceRoot, id, 'shape.glb'),
      concept: path.join(conceptRoot, `${id}${useRepairs && repairIds.has(id) ? '-repair' : ''}.png`),
      directory,
    }
  })

  // Shape-only renders provide spatial context without leaking legacy pixels or palettes.
  const renderer = new GlbMultiviewRenderer({ outputRoot, width: 768, height: 768 })
  await renderer.start()
  try {
    for (const item of items) {
      item.views = path.join(item.directory, 'neutral-multiview')
      await renderer.render(item.source, item.views, { raised: /^rug/.test(item.id) })
      console.log(`[neutral] ${item.id}`)
    }
  } finally {
    await renderer.close()
  }

  if (process.argv.includes('--prepare-only')) {
    console.log(JSON.stringify({ state: 'neutral-multiview-prepared', assets: items.length }, null, 2))
    return
  }

  await ensurePaintMode()
  const results = []
  for (const [index, item] of items.entries()) {
    const checkpoint = path.join(item.directory, 'repaint-source.json')
    if (process.argv.includes('--resume')) {
      try {
        const previous = JSON.parse(await fs.readFile(checkpoint, 'utf8'))
        await fs.access(path.join(item.directory, 'final.glb'))
        const previousIntegrity = JSON.parse(await fs.readFile(path.join(item.directory, 'integrity.json'), 'utf8'))
        const gate = paintGeometryGate(item.id, previous.sourceGeometry, previous.finalGeometry)
        if (previousIntegrity.passed === true && gate.accepted) {
          previous.geometryPreserved = gate.exact
          previous.paintGeometryGate = gate
          previous.passed = true
          await fs.writeFile(checkpoint, `${JSON.stringify(previous, null, 2)}\n`)
          results.push(previous)
          console.log(`[repaint ${index + 1}/${items.length}] ${item.id}: resume`)
          continue
        }
      } catch {}
    }
    console.log(`[repaint ${index + 1}/${items.length}] ${item.id}`)
    await fs.mkdir(item.directory, { recursive: true })
    const mesh = await fs.readFile(item.source)
    const sourceGeometry = geometrySummary(parseGlb(mesh))
    const viewBuffers = Object.fromEntries(await Promise.all(HUNYUAN_MULTIVIEWS.map(async (view) => [
      view, await fs.readFile(path.join(item.views, `${view}.png`)),
    ])))
    const direction = artDirection(item.id)
    const conceptFile = item.concept
    const concept = await fs.readFile(conceptFile)
    const payload = {
      mesh: mesh.toString('base64'),
      // A clean-room concept controls material language; neutral multiviews
      // retain shape/camera evidence without reintroducing legacy pixels.
      image: concept.toString('base64'),
      multiview: Object.fromEntries(Object.entries(viewBuffers).map(([view, bytes]) => [view, bytes.toString('base64')])),
      prompt: direction.prompt,
      positive_prompt: direction.prompt,
      negative_prompt: direction.negativePrompt,
      face_count: sourceGeometry.triangleCount,
      texture: true,
      type: 'glb',
    }
    const raw = await modelBytes(payload)
    if (raw.length < 20 || raw.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${item.id}: invalid Paint GLB`)
    await fs.writeFile(path.join(item.directory, 'paint.raw.glb'), raw)
    const final = serializeGlb(await addPbrChannels(parseGlb(raw), pbrProfile(item.id)))
    const finalFile = path.join(item.directory, 'final.glb')
    await fs.writeFile(finalFile, final)
    const integrityFile = path.join(item.directory, 'integrity.json')
    await execFileAsync(blender, [
      '--background', '--factory-startup', '--python', validator, '--', finalFile, integrityFile, integrityProfile(item.id),
    ], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 })
    const finalGeometry = geometrySummary(parseGlb(final))
    const geometryGate = paintGeometryGate(item.id, sourceGeometry, finalGeometry)
    const geometryPreserved = geometryGate.exact
    const record = {
      id: item.id,
      source: path.relative(repoRoot, item.source),
      sourceSha256: sha256(mesh),
      final: path.relative(repoRoot, finalFile),
      finalSha256: sha256(final),
      prompt: direction,
      concept: path.relative(repoRoot, conceptFile),
      conceptSha256: sha256(concept),
      conditioning: 'clean-room-dark-fantasy-concept-plus-generated-shape-neutral-multiview-no-rof2-pixels-or-palette',
      sourceGeometry,
      finalGeometry,
      geometryPreserved,
      paintGeometryGate: geometryGate,
      passed: geometryGate.accepted && JSON.parse(await fs.readFile(integrityFile, 'utf8')).passed,
    }
    await fs.writeFile(checkpoint, `${JSON.stringify(record, null, 2)}\n`)
    results.push(record)
  }

  const sheets = []
  for (let offset = 0; offset < items.length; offset += 4) {
    const number = String(offset / 4 + 1).padStart(2, '0')
    const output = path.join(outputRoot, `dark-fantasy-review-${number}.png`)
    await renderGlbReferenceSheet({
      glbs: items.slice(offset, offset + 4).map(({ id, directory }) => ({ label: id, path: path.join(directory, 'final.glb') })),
      output, width: 1800, height: 1800, frontAxis: '-xz-high', focus: 'full',
    })
    sheets.push(path.relative(repoRoot, output))
  }
  const report = {
    kind: 'requiem.qeynos2-dark-fantasy-repaint-review',
    version: 1,
    server: hunyuan,
    state: results.every(({ passed }) => passed) ? 'technical-pass-awaiting-owner-image-review' : 'completed-with-rejections',
    results,
    sheets,
    completedAt: new Date().toISOString(),
  }
  await fs.writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ state: report.state, sheets }, null, 2))
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  process.exitCode = 1
})
