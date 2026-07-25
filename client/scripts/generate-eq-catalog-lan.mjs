#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import * as ort from 'onnxruntime-node'
import { createServer } from 'vite'

const gunzipAsync = promisify(gunzip)
const scriptPath = fileURLToPath(import.meta.url)
const scriptsRoot = path.dirname(scriptPath)
const clientRoot = path.resolve(scriptsRoot, '..')
const repoRoot = path.resolve(clientRoot, '..')
const PIPELINE_VERSION = 2
const DEFAULT_INPUT = path.join(os.homedir(), 'Downloads', 'eqrequiem')
const DEFAULT_OUTPUT = path.join(repoRoot, 'assets', 'generated', 'eq-catalog')
const DEFAULT_ITEM_METADATA = path.join(
  repoRoot,
  'serverjs',
  'src',
  'backend',
  'generated',
  'offline-gear-catalog.ts',
)
const DEFAULT_CONTENT_DB = path.join(repoRoot, 'serverjs', 'data', 'game_content.sqlite')
const MODEL_URL = 'https://huggingface.co/onnxmodelzoo/mobilenetv2-12/resolve/main/mobilenetv2-12.onnx'
const MODEL_SHA256 = 'c0c3f76d93fa3fd6580652a45618618a220fced18babf65774ed169de0432ad5'
const LABELS_URL = 'https://raw.githubusercontent.com/pytorch/hub/master/imagenet_classes.txt'
const VIEWS = ['front', 'side', 'threeQuarter']
const ALL_STAGES = ['inventory', 'snapshot', 'classify', 'shape', 'paint', 'validate', 'manifest']

function usage() {
  return `Usage: node scripts/generate-eq-catalog-lan.mjs [options]

Generate modern GLBs for every EQ item and object reference. The run is
sequential, checkpointed, and safe to resume.

Options:
  --input-root DIR       EQ export root containing items/ and objects/
                         (default: ${DEFAULT_INPUT})
  --ref-dir DIR          Alias for --input-root
  --output-root DIR      Host output directory (default: ${DEFAULT_OUTPUT})
  --server URL           LAN Hunyuan service (default: HUNYUAN_URL or documented LAN host)
  --stages LIST          Comma list: ${ALL_STAGES.join(',')} (default: all)
  --only GLOB            Process IDs containing this case-insensitive text
  --kind items|objects   Restrict inventory to one source kind
  --limit N              Process at most N references after sorting
  --retry-failed         Retry assets with a recorded failed stage
  --force                Ignore successful checkpoints and rebuild selected stages
  --face-count N         Hard generated triangle ceiling (default: 6000)
  --triangle-ratio N     Generated/original triangle allowance (default: 1.5)
  --triangle-floor N     Minimum viable Hunyuan face target (default: 64)
  --shape-steps N        Hunyuan shape inference steps (default: 5)
  --octree-resolution N  Hunyuan shape octree resolution (default: 128)
  --guidance-scale N     Hunyuan guidance scale (default: 5.5)
  --request-timeout-min N (default: 45)
  --cache-dir DIR        ONNX model cache
  --item-metadata FILE   Generated offline item catalog or JSON array
  --content-db FILE      Authoritative EQ SQLite content database
  --prune-shapes         Delete shape.glb after final.glb is validated
  --dry-run              Inventory only; do not render, classify, or contact LAN
  --help

Examples:
  npm --prefix client run model:generate-eq-catalog -- --limit 2
  npm --prefix client run model:generate-eq-catalog -- --stages snapshot,classify
  npm --prefix client run model:generate-eq-catalog -- --stages shape,paint --retry-failed`
}

function parseArguments(argv) {
  const options = {
    inputRoot: DEFAULT_INPUT,
    outputRoot: DEFAULT_OUTPUT,
    server: process.env.HUNYUAN_URL ?? 'http://192.168.2.139:8080',
    stages: [...ALL_STAGES],
    only: null,
    kind: null,
    limit: Infinity,
    retryFailed: false,
    force: false,
    faceCount: 6000,
    triangleRatio: 1.5,
    triangleFloor: 64,
    shapeSteps: 5,
    octreeResolution: 128,
    guidanceScale: 5.5,
    requestTimeoutMinutes: 45,
    cacheDir: path.join(os.homedir(), 'Library', 'Caches', 'eqrequiem', 'onnx'),
    itemMetadata: DEFAULT_ITEM_METADATA,
    contentDb: DEFAULT_CONTENT_DB,
    pruneShapes: false,
    dryRun: false,
    help: false,
  }
  const take = (index, name) => {
    if (argv[index + 1] == null) throw new Error(`--${name} requires a value`)
    return argv[index + 1]
  }
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--input-root' || value === '--ref-dir') options.inputRoot = take(index++, value.slice(2))
    else if (value === '--output-root') options.outputRoot = take(index++, 'output-root')
    else if (value === '--server') options.server = take(index++, 'server')
    else if (value === '--stages') {
      const stages = take(index++, 'stages')
      options.stages = stages === 'all' ? [...ALL_STAGES] : stages.split(',').filter(Boolean)
    } else if (value === '--only') options.only = take(index++, 'only')
    else if (value === '--kind') options.kind = take(index++, 'kind')
    else if (value === '--limit') options.limit = Number(take(index++, 'limit'))
    else if (value === '--face-count') options.faceCount = Number(take(index++, 'face-count'))
    else if (value === '--triangle-ratio') options.triangleRatio = Number(take(index++, 'triangle-ratio'))
    else if (value === '--triangle-floor') options.triangleFloor = Number(take(index++, 'triangle-floor'))
    else if (value === '--shape-steps') options.shapeSteps = Number(take(index++, 'shape-steps'))
    else if (value === '--octree-resolution') options.octreeResolution = Number(take(index++, 'octree-resolution'))
    else if (value === '--guidance-scale') options.guidanceScale = Number(take(index++, 'guidance-scale'))
    else if (value === '--request-timeout-min') options.requestTimeoutMinutes = Number(take(index++, 'request-timeout-min'))
    else if (value === '--cache-dir') options.cacheDir = take(index++, 'cache-dir')
    else if (value === '--item-metadata') options.itemMetadata = take(index++, 'item-metadata')
    else if (value === '--content-db') options.contentDb = take(index++, 'content-db')
    else if (value === '--retry-failed') options.retryFailed = true
    else if (value === '--force') options.force = true
    else if (value === '--prune-shapes') options.pruneShapes = true
    else if (value === '--dry-run') options.dryRun = true
    else if (value === '--help' || value === '-h') options.help = true
    else throw new Error(`Unknown option: ${value}`)
  }
  options.inputRoot = path.resolve(options.inputRoot)
  options.outputRoot = path.resolve(options.outputRoot)
  options.cacheDir = path.resolve(options.cacheDir)
  options.itemMetadata = path.resolve(options.itemMetadata)
  options.contentDb = path.resolve(options.contentDb)
  options.server = options.server.replace(/\/$/, '')
  const unknownStages = options.stages.filter((stage) => !ALL_STAGES.includes(stage))
  if (unknownStages.length) throw new Error(`Unknown stages: ${unknownStages.join(', ')}`)
  if (options.kind && !['items', 'objects'].includes(options.kind)) {
    throw new Error('--kind must be items or objects')
  }
  for (const [name, number] of Object.entries({
    limit: options.limit,
    faceCount: options.faceCount,
    triangleRatio: options.triangleRatio,
    triangleFloor: options.triangleFloor,
    shapeSteps: options.shapeSteps,
    octreeResolution: options.octreeResolution,
    guidanceScale: options.guidanceScale,
    requestTimeoutMinutes: options.requestTimeoutMinutes,
  })) {
    if (!(number > 0)) throw new Error(`--${name} must be positive`)
  }
  return options
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await fs.rename(temporary, file)
}

async function downloadChecked(url, output, expectedSha = null) {
  const existing = await fs.readFile(output).catch(() => null)
  if (existing && (!expectedSha || sha256(existing) === expectedSha)) return existing
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (expectedSha && sha256(bytes) !== expectedSha) {
    throw new Error(`Checksum mismatch for ${url}; expected ${expectedSha}, got ${sha256(bytes)}`)
  }
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, bytes)
  return bytes
}

async function ensureClassifierAssets(cacheDir) {
  const modelPath = path.join(cacheDir, 'mobilenetv2-12.onnx')
  const labelsPath = path.join(cacheDir, 'imagenet-classes.txt')
  await Promise.all([
    downloadChecked(MODEL_URL, modelPath, MODEL_SHA256),
    downloadChecked(LABELS_URL, labelsPath),
  ])
  const labels = (await fs.readFile(labelsPath, 'utf8')).trim().split(/\r?\n/)
  if (labels.length !== 1000) throw new Error(`Expected 1000 ImageNet labels, found ${labels.length}`)
  return { modelPath, labels }
}

async function collectReferenceFiles(inputRoot, requestedKind) {
  const kinds = requestedKind ? [requestedKind] : ['items', 'objects']
  const assets = []
  for (const kind of kinds) {
    const root = path.join(inputRoot, kind)
    const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const entry of entries) {
      if (!entry.isFile() || !/\.glb(?:\.gz)?$/i.test(entry.name)) continue
      const id = entry.name.replace(/\.glb(?:\.gz)?$/i, '').toLowerCase()
      assets.push({ id, kind, source: path.join(root, entry.name) })
    }
  }
  assets.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
  return assets
}

async function loadItemMetadata(file) {
  const contents = await fs.readFile(file, 'utf8').catch(() => null)
  if (!contents) return new Map()
  let records
  if (file.endsWith('.json')) {
    records = JSON.parse(contents)
  } else {
    const marker = 'export const OFFLINE_ITEM_TEMPLATES'
    const markerIndex = contents.indexOf(marker)
    if (markerIndex < 0) return new Map()
    const equalsIndex = contents.indexOf('=', markerIndex)
    const arrayStart = contents.indexOf('[', equalsIndex)
    const arrayEnd = contents.lastIndexOf('];')
    if (arrayStart < 0 || arrayEnd < arrayStart) return new Map()
    records = JSON.parse(contents.slice(arrayStart, arrayEnd + 1))
  }
  const byModel = new Map()
  for (const item of records) {
    const key = String(item.idfile ?? '').toLowerCase()
    if (!key) continue
    if (!byModel.has(key)) byModel.set(key, [])
    byModel.get(key).push(item)
  }
  return byModel
}

function summarizeItems(items) {
  if (!items?.length) return null
  const counts = (field) => Object.entries(items.reduce((result, item) => {
    const value = String(item[field] ?? '')
    result[value] = (result[value] ?? 0) + 1
    return result
  }, {})).sort((left, right) => right[1] - left[1])
  return {
    count: items.length,
    names: items.slice(0, 24).map((item) => ({ id: item.id, name: item.name })),
    itemTypes: counts('itemtype').map(([itemType, count]) => ({ itemType: Number(itemType), count })),
    slots: counts('slots').slice(0, 12).map(([slots, count]) => ({ slots: Number(slots), count })),
  }
}

function normalizeModelId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.(?:mod|ter|eqg|glb)$/i, '')
    .replace(/_actordef$/i, '')
    .replace(/[^a-z0-9]+/g, '')
}

function groupedByModel(rows, field) {
  const result = new Map()
  for (const row of rows) {
    const key = normalizeModelId(row[field])
    if (!key) continue
    if (!result.has(key)) result.set(key, [])
    result.get(key).push(row)
  }
  return result
}

function countedValues(rows, field, limit = 16) {
  const counts = new Map()
  for (const row of rows ?? []) {
    const value = row[field]
    if (value == null || value === '') continue
    const key = String(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}

function sqliteItemSummary(rows) {
  if (!rows?.length) return null
  const summary = summarizeItems(rows.map((row) => ({
    ...row,
    name: row.name,
    itemtype: row.itemType,
  })))
  return {
    ...summary,
    names: rows.slice(0, 24).map((row) => ({ id: row.id, name: row.name })),
    itemClasses: countedValues(rows, 'itemClass').map(({ value, count }) => ({ itemClass: Number(value), count })),
    materials: countedValues(rows, 'material').map(({ value, count }) => ({ material: Number(value), count })),
    icons: countedValues(rows, 'icon').map(({ value, count }) => ({ icon: Number(value), count })),
    combat: {
      maximumDamage: Math.max(...rows.map((row) => Number(row.damage) || 0)),
      minimumDelay: (() => {
        const delays = rows.map((row) => Number(row.delay)).filter((value) => value > 0)
        return delays.length ? Math.min(...delays) : null
      })(),
      maximumRange: Math.max(...rows.map((row) => Number(row.range) || 0)),
    },
  }
}

function sqlitePlacementSummary(rows) {
  if (!rows?.length) return null
  return {
    count: rows.length,
    zones: countedValues(rows, 'zoneLongName', 24),
    displayNames: countedValues(rows, 'displayName', 24),
    comments: countedValues(rows, 'comment', 24),
    linkedItems: rows
      .filter((row) => row.itemId > 0 || row.linkedItemName)
      .slice(0, 24)
      .map((row) => ({ id: row.itemId || null, name: row.linkedItemName || null })),
    types: countedValues(rows, 'type').map(({ value, count }) => ({ type: Number(value), count })),
  }
}

function sqliteToolObjectSummary(rows) {
  if (!rows?.length) return null
  return {
    count: rows.length,
    sourcePackages: countedValues(rows, 'fileFrom', 24),
    zones: countedValues(rows, 'zoneShortName', 24),
    globalCount: rows.filter((row) => Number(row.isGlobal) !== 0).length,
  }
}

function sqliteDoorSummary(rows) {
  if (!rows?.length) return null
  return {
    count: rows.length,
    zones: countedValues(rows, 'zoneShortName', 24),
    openTypes: countedValues(rows, 'openType').map(({ value, count }) => ({ openType: Number(value), count })),
    keyedCount: rows.filter((row) => Number(row.keyItem) > 0).length,
    sizes: countedValues(rows, 'size').map(({ value, count }) => ({ size: Number(value), count })),
  }
}

function loadSqliteMetadata(file) {
  const database = new DatabaseSync(file, { readOnly: true })
  try {
    const items = database.prepare(`
      SELECT id, Name AS name, idfile, itemtype AS itemType, itemclass AS itemClass,
             slots, material, icon, damage, delay, range, classes, races, lore
      FROM items WHERE idfile <> '' ORDER BY lower(idfile), id
    `).all()
    const placements = database.prepare(`
      SELECT object.objectname AS modelName, object.itemid AS itemId, object.type AS type,
             display_name AS displayName, NULL AS comment,
             zone.long_name AS zoneLongName, items.Name AS linkedItemName
      FROM object
      LEFT JOIN zone ON zone.zoneidnumber = object.zoneid
      LEFT JOIN items ON items.id = object.itemid
      WHERE objectname IS NOT NULL AND objectname <> ''
      UNION ALL
      SELECT ground_spawns.name AS modelName, ground_spawns.item AS itemId, NULL AS type,
             NULL AS displayName, ground_spawns.comment AS comment,
             zone.long_name AS zoneLongName, items.Name AS linkedItemName
      FROM ground_spawns
      LEFT JOIN zone ON zone.zoneidnumber = ground_spawns.zoneid
      LEFT JOIN items ON items.id = ground_spawns.item
      WHERE ground_spawns.name <> ''
    `).all()
    const toolObjects = database.prepare(`
      SELECT object_name AS modelName, file_from AS fileFrom,
             zonesn AS zoneShortName, zoneid AS zoneId, is_global AS isGlobal
      FROM tool_game_objects WHERE object_name <> ''
      ORDER BY lower(object_name), id
    `).all()
    const doors = database.prepare(`
      SELECT name AS modelName, zone AS zoneShortName, opentype AS openType,
             keyitem AS keyItem, size
      FROM doors WHERE name <> '' ORDER BY lower(name), id
    `).all()
    return {
      file,
      items: groupedByModel(items, 'idfile'),
      placements: groupedByModel(placements, 'modelName'),
      toolObjects: groupedByModel(toolObjects, 'modelName'),
      doors: groupedByModel(doors, 'modelName'),
    }
  } finally {
    database.close()
  }
}

function databaseSemantics(asset, metadata) {
  const key = normalizeModelId(asset.id)
  const itemRows = metadata.items.get(key) ?? []
  const placementRows = metadata.placements.get(key) ?? []
  const toolRows = metadata.toolObjects.get(key) ?? []
  const doorRows = metadata.doors.get(key) ?? []
  const items = sqliteItemSummary(itemRows)
  const placements = sqlitePlacementSummary(placementRows)
  const toolObjects = sqliteToolObjectSummary(toolRows)
  const doors = sqliteDoorSummary(doorRows)
  const matchedSources = [
    items && 'items.idfile',
    placements && 'object/ground_spawns model name',
    toolObjects && 'tool_game_objects.object_name',
    doors && 'doors.name',
  ].filter(Boolean)
  const displayName = items?.names?.[0]?.name
    ?? placements?.displayNames?.[0]?.value
    ?? placements?.comments?.[0]?.value
    ?? toolRows[0]?.modelName
    ?? doorRows[0]?.modelName
    ?? asset.id
  const itemCategory = itemMetadataCategory(items)
  const category = itemCategory ?? (doors ? 'architecture.door' : null)
  return {
    database: path.basename(metadata.file),
    normalizedModelId: key,
    matched: matchedSources.length > 0,
    matchedSources,
    displayName,
    category,
    items,
    placements,
    toolObjects,
    doors,
  }
}

function lowPolyContract(sourceGeometry, options) {
  const originalTriangles = Number(sourceGeometry?.triangleCount ?? 0)
  if (!(originalTriangles > 0)) return null
  const relativeCeiling = Math.ceil(originalTriangles * options.triangleRatio)
  const maximumTriangles = Math.min(
    options.faceCount,
    Math.max(options.triangleFloor, relativeCeiling),
  )
  return {
    originalTriangles,
    ratio: options.triangleRatio,
    minimumTarget: options.triangleFloor,
    absoluteCeiling: options.faceCount,
    maximumTriangles,
    targetFaceCount: maximumTriangles,
  }
}

function mappedCategory(labels) {
  const rules = [
    ['weapon.sword', /\b(?:sword|saber|scabbard)\b/],
    ['weapon.knife', /\b(?:knife|dagger|cleaver)\b/],
    ['weapon.axe', /\b(?:axe|hatchet)\b/],
    ['weapon.hammer', /\b(?:hammer|mallet|mace)\b/],
    ['weapon.bow', /\b(?:bow|crossbow|quiver)\b/],
    ['weapon.polearm', /\b(?:spear|pike|lance|trident)\b/],
    ['weapon.staff', /\b(?:staff|crook)\b/],
    ['weapon.shield', /\b(?:shield|buckler)\b/],
    ['prop.container', /\b(?:chest|crate|barrel|carton|safe|bucket|basket)\b/],
    ['prop.furniture', /\b(?:chair|throne|bench|table|desk|bed|wardrobe|bookcase|cabinet|sofa)\b/],
    ['prop.lighting', /\b(?:lamp|lantern|torch|candle)\b/],
    ['prop.tool', /\b(?:tool|shovel|pick|plow|anvil|chain|lock|key)\b/],
    ['prop.vessel', /\b(?:pot|vase|jar|jug|bottle|goblet|cauldron)\b/],
    ['environment.vegetation', /\b(?:tree|plant|flower|mushroom|stump)\b/],
    ['environment.rock', /\b(?:rock|cliff|stone|coral)\b/],
    ['architecture', /\b(?:building|castle|palace|church|monastery|bridge|tower|door|gate|fountain)\b/],
    ['signage', /\b(?:sign|banner|flag|pole)\b/],
  ]
  for (const prediction of labels) {
    for (const [category, pattern] of rules) {
      if (pattern.test(prediction.label.toLowerCase())) return { category, evidence: prediction }
    }
  }
  return { category: 'prop.unknown', evidence: labels[0] ?? null }
}

const ITEM_TYPE_CATEGORY = new Map([
  [0, 'weapon.sword.one-handed'], [1, 'weapon.sword.two-handed'],
  [2, 'weapon.piercing'], [3, 'weapon.blunt.one-handed'],
  [4, 'weapon.blunt.two-handed'], [5, 'weapon.bow'],
  [7, 'weapon.throwing'], [8, 'weapon.shield'], [19, 'weapon.throwing'],
  [35, 'weapon.polearm'], [45, 'weapon.hand-to-hand'],
])

function itemMetadataCategory(summary) {
  if (!summary) return null
  for (const { itemType } of summary.itemTypes) {
    if (ITEM_TYPE_CATEGORY.has(itemType)) return ITEM_TYPE_CATEGORY.get(itemType)
  }
  return null
}

function filenameCategory(id) {
  const rules = [
    ['architecture.door', /door|gate|portcullis/],
    ['architecture.bridge', /bridge|dock/],
    ['architecture.building', /building|house|hut|shop|temple|tower|wall|outpost|barn/],
    ['prop.container', /barrel|crate|chest|box|basket|urn|coffin/],
    ['prop.furniture', /chair|throne|bench|table|desk|bed|stool|shelf|divan/],
    ['prop.lighting', /lamp|lantern|torch|candle|brazier|fire/],
    ['prop.tool', /anvil|shovel|pick|lever|gear|wheel|workbench|ballista/],
    ['prop.vessel', /cauldron|vase|pot|bottle|goblet|cup/],
    ['environment.vegetation', /tree|plant|palm|pine|cedar|bush|grass|stump/],
    ['environment.rock', /rock|boulder|cliff|rubble|mound/],
    ['signage', /sign|banner|flag|pennant/],
    ['weapon.sword', /sword|blade|saber/],
    ['weapon.axe', /axe|hatchet/],
    ['weapon.hammer', /hammer|mace/],
  ]
  for (const [category, pattern] of rules) if (pattern.test(id.toLowerCase())) return category
  return null
}

class OnnxClassifier {
  constructor(session, labels, modelPath) {
    this.session = session
    this.labels = labels
    this.modelPath = modelPath
  }

  static async create(cacheDir) {
    const { modelPath, labels } = await ensureClassifierAssets(cacheDir)
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    })
    return new OnnxClassifier(session, labels, modelPath)
  }

  async classify(imagePath, topK = 8) {
    const { data, info } = await sharp(imagePath)
      .flatten({ background: '#ffffff' })
      .removeAlpha()
      .resize(224, 224, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (info.channels !== 3) throw new Error(`Expected RGB classifier input, found ${info.channels} channels`)
    const mean = [0.485, 0.456, 0.406]
    const standardDeviation = [0.229, 0.224, 0.225]
    const tensorData = new Float32Array(3 * 224 * 224)
    for (let y = 0; y < 224; y++) {
      for (let x = 0; x < 224; x++) {
        const pixel = (y * 224 + x) * 3
        for (let channel = 0; channel < 3; channel++) {
          tensorData[channel * 224 * 224 + y * 224 + x] =
            (data[pixel + channel] / 255 - mean[channel]) / standardDeviation[channel]
        }
      }
    }
    const inputName = this.session.inputNames[0]
    const results = await this.session.run({
      [inputName]: new ort.Tensor('float32', tensorData, [1, 3, 224, 224]),
    })
    const logits = [...results[this.session.outputNames[0]].data].map(Number)
    const max = Math.max(...logits)
    const exponentials = logits.map((value) => Math.exp(value - max))
    const total = exponentials.reduce((sum, value) => sum + value, 0)
    return logits
      .map((_, index) => ({ index, label: this.labels[index] ?? `class-${index}`, score: exponentials[index] / total }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)
  }
}

class SnapshotRenderer {
  constructor(outputRoot, width = 768, height = 768) {
    this.outputRoot = outputRoot
    this.width = width
    this.height = height
    this.server = null
    this.chrome = null
    this.socket = null
    this.sessionId = null
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
    const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eq-catalog-chrome-'))
    this.profile = profile
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
      `--user-data-dir=${profile}`,
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
    const attached = await this.send('Target.attachToTarget', { targetId, flatten: true })
    this.sessionId = attached.sessionId
    await this.send('Page.enable', {}, this.sessionId)
    await this.send('Runtime.enable', {}, this.sessionId)
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: 1,
      mobile: false,
    }, this.sessionId)
    const address = this.server.httpServer.address()
    const url = `http://127.0.0.1:${address.port}/scripts/eq-catalog-renderer/index.html`
    await this.send('Page.navigate', { url }, this.sessionId)
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      const state = await this.evaluate('window.__EQ_CATALOG_RENDERER_STATE__ ?? null')
      if (state?.status === 'ready') return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Timed out waiting for the EQ snapshot renderer')
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

  async render(glbPath, outputDir) {
    await fs.mkdir(outputDir, { recursive: true })
    const url = `/@fs/${glbPath}`
    const geometry = await this.evaluate(
      `window.__EQ_CATALOG_RENDERER__.load(${JSON.stringify(url)})`,
    )
    const snapshots = []
    for (const view of VIEWS) {
      await this.evaluate(`window.__EQ_CATALOG_RENDERER__.setView(${JSON.stringify(view)})`)
      await new Promise((resolve) => setTimeout(resolve, 120))
      const result = await this.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      }, this.sessionId)
      const bytes = Buffer.from(result.data, 'base64')
      const file = path.join(outputDir, `${view}.png`)
      await fs.writeFile(file, bytes)
      const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      let foreground = 0
      for (let index = 0; index < data.length; index += info.channels) {
        if (data[index] < 245 || data[index + 1] < 245 || data[index + 2] < 245) foreground++
      }
      snapshots.push({
        view,
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

class HunyuanLanClient {
  constructor(server, timeoutMinutes) {
    this.server = server
    this.timeoutMs = timeoutMinutes * 60 * 1000
  }

  async checkedFetch(url, init = {}, timeoutMs = this.timeoutMs) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        const message = (await response.text()).slice(0, 2000)
        throw new Error(`${url} returned ${response.status}: ${message}`)
      }
      return response
    } finally {
      clearTimeout(timer)
    }
  }

  async mode() {
    return (await this.checkedFetch(`${this.server}/mode`, {}, 30000)).json()
  }

  async ensureMode(mode) {
    const flag = mode === 'shape' ? 'shape_loaded' : 'paint_loaded'
    let current = await this.mode()
    if (current[flag]) return current
    await this.checkedFetch(`${this.server}/mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    }, 60000)
    const deadline = Date.now() + 15 * 60 * 1000
    for (;;) {
      current = await this.mode()
      if (current[flag]) return current
      if (Date.now() > deadline) throw new Error(`Timed out waiting for LAN ${mode} mode: ${JSON.stringify(current)}`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }

  async modelResponse(endpoint, payload) {
    const response = await this.checkedFetch(`${this.server}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return Buffer.from(await response.arrayBuffer())
    const result = await response.json()
    if (result.model_base64) return Buffer.from(result.model_base64, 'base64')
    if (!result.uid) throw new Error(`Unexpected /${endpoint} response: ${JSON.stringify(result).slice(0, 2000)}`)
    const deadline = Date.now() + this.timeoutMs
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      const status = await (await this.checkedFetch(`${this.server}/status/${result.uid}`, {}, 30000)).json()
      if (status.status === 'completed' && status.model_base64) {
        return Buffer.from(status.model_base64, 'base64')
      }
      if (!['processing', 'queued'].includes(status.status)) {
        throw new Error(`LAN job ${result.uid} failed: ${JSON.stringify(status).slice(0, 2000)}`)
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for LAN job ${result.uid}`)
    }
  }
}

function validateGlb(bytes, label) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`${label} is not a binary GLB (${bytes.length} bytes)`)
  }
  const version = bytes.readUInt32LE(4)
  const declaredLength = bytes.readUInt32LE(8)
  if (version !== 2 || declaredLength !== bytes.length) {
    throw new Error(`${label} has invalid GLB header (version ${version}, declared ${declaredLength}, actual ${bytes.length})`)
  }
  return { bytes: bytes.length, sha256: sha256(bytes), glbVersion: version }
}

function inspectGlbGeometry(bytes) {
  validateGlb(bytes, 'geometry inspection input')
  let cursor = 12
  let document = null
  while (cursor < bytes.length) {
    const length = bytes.readUInt32LE(cursor)
    const type = bytes.readUInt32LE(cursor + 4)
    if (type === 0x4e4f534a) {
      document = JSON.parse(bytes.subarray(cursor + 8, cursor + 8 + length).toString('utf8').trimEnd())
      break
    }
    cursor += 8 + length
  }
  if (!document) throw new Error('GLB has no JSON document')
  const primitives = (document.meshes ?? []).flatMap((mesh) => mesh.primitives ?? [])
  const renderablePrimitives = primitives.filter((primitive) => {
    const positionAccessor = primitive.attributes?.POSITION
    return Number.isInteger(positionAccessor) && (document.accessors?.[positionAccessor]?.count ?? 0) >= 3
  })
  const primitiveElementCount = (primitive) => {
    const accessorIndex = Number.isInteger(primitive.indices)
      ? primitive.indices
      : primitive.attributes?.POSITION
    return Number(document.accessors?.[accessorIndex]?.count ?? 0)
  }
  const primitiveTriangleCount = (primitive) => {
    const count = primitiveElementCount(primitive)
    const mode = primitive.mode ?? 4
    if (mode === 4) return Math.floor(count / 3)
    if (mode === 5 || mode === 6) return Math.max(0, count - 2)
    return 0
  }
  const textureInfoIndices = (material) => {
    const indices = []
    const visit = (value, key = '') => {
      if (!value || typeof value !== 'object') return
      if (/texture$/i.test(key) && Number.isInteger(value.index)) indices.push(value.index)
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey)
    }
    visit(material)
    return indices
  }
  const validTexture = (textureIndex) => {
    const texture = document.textures?.[textureIndex]
    return Boolean(texture && Number.isInteger(texture.source) && document.images?.[texture.source])
  }
  const materialHasTexture = (materialIndex) => {
    const material = document.materials?.[materialIndex]
    return Boolean(material && textureInfoIndices(material).some(validTexture))
  }
  const baseColorTextureMaterialCount = (document.materials ?? []).filter((material) => {
    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index
    return Number.isInteger(textureIndex) && validTexture(textureIndex)
  }).length
  const texturedPrimitiveCount = renderablePrimitives.filter((primitive) => (
    Number.isInteger(primitive.material) && materialHasTexture(primitive.material)
  )).length
  return {
    meshCount: document.meshes?.length ?? 0,
    primitiveCount: primitives.length,
    renderablePrimitiveCount: renderablePrimitives.length,
    accessorCount: document.accessors?.length ?? 0,
    vertexCount: renderablePrimitives.reduce((total, primitive) => (
      total + Number(document.accessors?.[primitive.attributes.POSITION]?.count ?? 0)
    ), 0),
    triangleCount: renderablePrimitives.reduce((total, primitive) => (
      total + primitiveTriangleCount(primitive)
    ), 0),
    materialCount: document.materials?.length ?? 0,
    imageCount: document.images?.length ?? 0,
    textureCount: document.textures?.length ?? 0,
    baseColorTextureMaterialCount,
    texturedPrimitiveCount,
    textured: renderablePrimitives.length > 0 && texturedPrimitiveCount === renderablePrimitives.length,
    renderable: renderablePrimitives.length > 0,
  }
}

function repairLegacyGlbForRendering(bytes) {
  validateGlb(bytes, 'legacy render input')
  const chunks = []
  let cursor = 12
  let document = null
  while (cursor < bytes.length) {
    const length = bytes.readUInt32LE(cursor)
    const type = bytes.readUInt32LE(cursor + 4)
    const data = bytes.subarray(cursor + 8, cursor + 8 + length)
    if (type === 0x4e4f534a) document = JSON.parse(data.toString('utf8').trimEnd())
    else chunks.push({ type, data })
    cursor += 8 + length
  }
  if (!document) throw new Error('Legacy GLB has no JSON chunk')
  const stripTextureFields = (value) => {
    if (!value || typeof value !== 'object') return
    for (const key of Object.keys(value)) {
      if (/texture$/i.test(key)) delete value[key]
      else stripTextureFields(value[key])
    }
  }
  for (const material of document.materials ?? []) {
    stripTextureFields(material)
    material.pbrMetallicRoughness ??= {}
    material.pbrMetallicRoughness.baseColorFactor ??= [0.64, 0.61, 0.56, 1]
    material.pbrMetallicRoughness.metallicFactor ??= 0
    material.pbrMetallicRoughness.roughnessFactor ??= 0.82
  }
  delete document.images
  delete document.textures
  delete document.samplers
  const jsonBytes = Buffer.from(JSON.stringify(document))
  const jsonPadding = (4 - jsonBytes.length % 4) % 4
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)])
  const totalLength = 12 + 8 + paddedJson.length
    + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0)
  const output = Buffer.alloc(totalLength)
  output.write('glTF', 0)
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(totalLength, 8)
  let outputCursor = 12
  output.writeUInt32LE(paddedJson.length, outputCursor)
  output.writeUInt32LE(0x4e4f534a, outputCursor + 4)
  paddedJson.copy(output, outputCursor + 8)
  outputCursor += 8 + paddedJson.length
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, outputCursor)
    output.writeUInt32LE(chunk.type, outputCursor + 4)
    chunk.data.copy(output, outputCursor + 8)
    outputCursor += 8 + chunk.data.length
  }
  validateGlb(output, 'repaired legacy render GLB')
  return output
}

async function sourceGeometryFallback(asset) {
  const compressed = await fs.readFile(asset.source)
  const original = asset.source.toLowerCase().endsWith('.gz')
    ? await gunzipAsync(compressed)
    : compressed
  validateGlb(original, `${asset.kind}/${asset.id} source fallback`)
  const bytes = repairLegacyGlbForRendering(original)
  return {
    bytes,
    geometry: inspectGlbGeometry(bytes),
    sourceSha256: sha256(compressed),
  }
}

async function extractedGlb(source, temporaryRoot, id) {
  const compressed = await fs.readFile(source)
  const bytes = source.toLowerCase().endsWith('.gz') ? await gunzipAsync(compressed) : compressed
  validateGlb(bytes, source)
  const file = path.join(temporaryRoot, `${id}-${process.pid}.glb`)
  await fs.writeFile(file, bytes)
  return { file, bytes, sourceBytes: compressed.length, sourceSha256: sha256(compressed) }
}

async function renderFallbacks(asset, extracted, temporaryRoot) {
  const fallbacks = []
  const pairedBabylon = asset.source.replace(/\.glb(?:\.gz)?$/i, '.babylon.gz')
  try {
    const compressed = await fs.readFile(pairedBabylon)
    const bytes = await gunzipAsync(compressed)
    const file = path.join(temporaryRoot, `${asset.kind}-${asset.id}-${process.pid}.babylon`)
    await fs.writeFile(file, bytes)
    fallbacks.push({ file, method: 'paired_babylon', source: pairedBabylon })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const repaired = repairLegacyGlbForRendering(extracted.bytes)
  const repairedFile = path.join(temporaryRoot, `${asset.kind}-${asset.id}-${process.pid}-repaired.glb`)
  await fs.writeFile(repairedFile, repaired)
  fallbacks.push({ file: repairedFile, method: 'material_stripped_glb_repair', source: asset.source })
  return fallbacks
}

function checkpointComplete(state, stage, options) {
  if (options.force) return false
  if (state?.excluded) return true
  if (state?.failure && !options.retryFailed) return true
  return Boolean(state?.stages?.[stage]?.completed)
}

function compactError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    at: new Date().toISOString(),
  }
}

async function updateDescription(asset, state, outputRoot) {
  const file = path.join(outputRoot, asset.kind, asset.id, 'description.json')
  const relative = (value) => value ? path.relative(outputRoot, value) : null
  const value = {
    schemaVersion: 2,
    pipelineVersion: PIPELINE_VERSION,
    id: asset.id,
    kind: asset.kind === 'items' ? 'item' : 'object',
    source: {
      file: asset.source,
      bytes: state.source?.bytes ?? null,
      sha256: state.source?.sha256 ?? null,
      renderFallback: state.source?.renderFallback ?? null,
    },
    legacyItems: state.legacyItems ?? null,
    databaseSemantics: state.databaseSemantics ?? null,
    exclusion: state.excluded ?? null,
    geometry: state.geometry ?? null,
    lowPolyContract: state.lowPolyContract ?? null,
    classification: state.classification ?? null,
    snapshots: (state.snapshots ?? []).map((snapshot) => ({ ...snapshot, file: relative(snapshot.file) })),
    generated: {
      shape: state.generated?.shape ? { ...state.generated.shape, file: relative(state.generated.shape.file) } : null,
      final: state.generated?.final ? { ...state.generated.final, file: relative(state.generated.final.file) } : null,
    },
    finalValidation: state.finalValidation ? {
      ...state.finalValidation,
      snapshots: (state.finalValidation.snapshots ?? []).map((snapshot) => ({ ...snapshot, file: relative(snapshot.file) })),
    } : null,
    stages: state.stages ?? {},
    failure: state.failure ?? null,
    updatedAt: new Date().toISOString(),
  }
  await writeJsonAtomic(file, value)
  return file
}

async function writeMasterManifest(outputRoot, assets, stateByKey, options) {
  const records = assets.map((asset) => {
    const state = stateByKey.get(`${asset.kind}/${asset.id}`) ?? {}
    const root = path.join(outputRoot, asset.kind, asset.id)
    return {
      id: asset.id,
      displayName: state.databaseSemantics?.displayName ?? asset.id,
      kind: asset.kind === 'items' ? 'item' : 'object',
      source: asset.source,
      sourceSha256: state.source?.sha256 ?? null,
      category: state.classification?.category ?? null,
      semanticMatch: state.databaseSemantics?.matched ?? false,
      semanticSources: state.databaseSemantics?.matchedSources ?? [],
      selectedView: state.classification?.selectedView ?? null,
      shapeMethod: state.generated?.shape?.method ?? 'legacy_hunyuan_checkpoint',
      lowPoly: state.lowPolyContract ? {
        sourceTriangles: state.lowPolyContract.originalTriangles,
        maximumTriangles: state.lowPolyContract.maximumTriangles,
        finalTriangles: state.generated?.final?.geometry?.triangleCount
          ?? state.finalValidation?.geometry?.triangleCount
          ?? null,
      } : null,
      textured: state.generated?.final?.geometry?.textured
        ?? state.finalValidation?.geometry?.textured
        ?? null,
      status: state.excluded
        ? 'excluded_nonvisual'
        : state.failure
        ? 'failed'
        : state.finalValidation?.passed
          ? 'complete'
          : state.generated?.final
            ? 'generated_unvalidated'
            : 'pending',
      description: path.relative(outputRoot, path.join(root, 'description.json')),
      glb: state.generated?.final ? path.relative(outputRoot, state.generated.final.file) : null,
      failure: state.failure?.message ?? null,
    }
  })
  const counts = records.reduce((result, record) => {
    result[record.status] = (result[record.status] ?? 0) + 1
    result[record.kind] = (result[record.kind] ?? 0) + 1
    if (record.semanticMatch) result.sqliteMatched = (result.sqliteMatched ?? 0) + 1
    if (record.textured) result.textured = (result.textured ?? 0) + 1
    return result
  }, {})
  const manifest = {
    schemaVersion: 2,
    pipelineVersion: PIPELINE_VERSION,
    generatedAt: new Date().toISOString(),
    inputRoot: options.inputRoot,
    outputRoot,
    contentDatabase: options.contentDb,
    server: options.server,
    classifier: { name: 'MobileNetV2-12', runtime: 'onnxruntime-node', modelSha256: MODEL_SHA256 },
    parameters: {
      faceCount: options.faceCount,
      triangleRatio: options.triangleRatio,
      triangleFloor: options.triangleFloor,
      shapeSteps: options.shapeSteps,
      octreeResolution: options.octreeResolution,
      guidanceScale: options.guidanceScale,
      views: VIEWS,
    },
    counts,
    assets: records,
  }
  await writeJsonAtomic(path.join(outputRoot, 'manifest.json'), manifest)
  return manifest
}

async function withRetries(label, action, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action(attempt)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      const delay = Math.min(30000, 2000 * 2 ** (attempt - 1))
      console.warn(`${label} attempt ${attempt}/${attempts} failed: ${error.message}; retrying in ${delay} ms`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

async function run(options) {
  await fs.access(options.inputRoot)
  await fs.access(options.contentDb)
  await fs.mkdir(options.outputRoot, { recursive: true })
  const inventoryAssets = await collectReferenceFiles(options.inputRoot)
  let assets = options.kind
    ? inventoryAssets.filter((asset) => asset.kind === options.kind)
    : [...inventoryAssets]
  if (options.only) {
    const needle = options.only.toLowerCase()
    assets = assets.filter((asset) => asset.id.includes(needle) || asset.source.toLowerCase().includes(needle))
  }
  assets = assets.slice(0, options.limit)
  if (!assets.length) throw new Error(`No *.glb or *.glb.gz references found under ${options.inputRoot}`)

  const itemMetadata = await loadItemMetadata(options.itemMetadata)
  const sqliteMetadata = loadSqliteMetadata(options.contentDb)
  const stateByKey = new Map()
  for (const asset of inventoryAssets) {
    const stateFile = path.join(options.outputRoot, asset.kind, asset.id, 'state.json')
    const state = await readJson(stateFile, { schemaVersion: 1, stages: {}, generated: {} })
    state.schemaVersion = 2
    state.pipelineVersion = PIPELINE_VERSION
    state.databaseSemantics = databaseSemantics(asset, sqliteMetadata)
    state.legacyItems = state.databaseSemantics.items
      ?? (asset.kind === 'items' ? summarizeItems(itemMetadata.get(asset.id)) : null)
    state.lowPolyContract = lowPolyContract(state.geometry, options)
    if (state.classification) {
      const sqliteCategory = state.databaseSemantics.category
      state.classification.categorySources ??= {}
      state.classification.categorySources.sqlite = {
        category: sqliteCategory,
        matchedSources: state.databaseSemantics.matchedSources,
        displayName: state.databaseSemantics.displayName,
      }
      state.classification.category = sqliteCategory
        ?? filenameCategory(asset.id)
        ?? state.classification.category
    }
    stateByKey.set(`${asset.kind}/${asset.id}`, state)
  }
  console.log(JSON.stringify({
    discovered: assets.length,
    items: assets.filter((asset) => asset.kind === 'items').length,
    objects: assets.filter((asset) => asset.kind === 'objects').length,
    stages: options.dryRun ? ['inventory'] : options.stages,
    outputRoot: options.outputRoot,
  }))
  if (options.dryRun) {
    for (const asset of inventoryAssets) {
      await updateDescription(asset, stateByKey.get(`${asset.kind}/${asset.id}`), options.outputRoot)
    }
    const manifest = await writeMasterManifest(options.outputRoot, inventoryAssets, stateByKey, options)
    return manifest
  }

  // macOS exposes the temporary tree through both /var and /private/var.
  // Vite compares canonical paths for its allow-list, so stage GLBs under the
  // canonical spelling as well.
  const temporaryRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'eq-catalog-')))
  let renderer = null
  let classifier = null
  const needsSnapshots = options.stages.some((stage) => ['snapshot', 'classify'].includes(stage))
  if (needsSnapshots) {
    renderer = new SnapshotRenderer(options.outputRoot)
    classifier = await OnnxClassifier.create(options.cacheDir)
    await renderer.start()
  }

  try {
    if (needsSnapshots) {
      for (const [index, asset] of assets.entries()) {
        const key = `${asset.kind}/${asset.id}`
        const state = stateByKey.get(key)
        const stateFile = path.join(options.outputRoot, asset.kind, asset.id, 'state.json')
        if (checkpointComplete(state, 'classify', options)) continue
        console.log(`[snapshot ${index + 1}/${assets.length}] ${key}`)
        try {
          const extracted = await extractedGlb(asset.source, temporaryRoot, `${asset.kind}-${asset.id}`)
          state.source = { file: asset.source, bytes: extracted.sourceBytes, sha256: extracted.sourceSha256 }
          const sourceGeometry = inspectGlbGeometry(extracted.bytes)
          state.geometry = sourceGeometry
          state.lowPolyContract = lowPolyContract(sourceGeometry, options)
          if (!sourceGeometry.renderable) {
            state.excluded = {
              reason: 'source_has_no_renderable_primitives',
              category: /(?:^|_)col(?:lision)?/i.test(asset.id)
                ? 'nonvisual.collision_proxy'
                : 'nonvisual.empty_reference',
              geometry: sourceGeometry,
              at: new Date().toISOString(),
            }
            state.geometry = sourceGeometry
            state.snapshots = []
            state.classification = {
              model: null,
              runtime: null,
              selectedView: null,
              selectedSnapshot: null,
              category: state.excluded.category,
              categorySources: { sourceGeometry: state.excluded.reason },
              topLabels: [],
            }
            state.stages.snapshot = { completed: true, excluded: true, at: new Date().toISOString() }
            state.stages.classify = { completed: true, excluded: true, at: new Date().toISOString() }
            state.failure = null
            await fs.rm(extracted.file, { force: true })
            await writeJsonAtomic(stateFile, state)
            await updateDescription(asset, state, options.outputRoot)
            await writeMasterManifest(options.outputRoot, inventoryAssets, stateByKey, options)
            console.log(`[exclude nonvisual] ${key}: no renderable primitives`)
            continue
          }
          state.excluded = null
          const snapshotRoot = path.join(options.outputRoot, asset.kind, asset.id, 'snapshots')
          let rendered
          try {
            rendered = await renderer.render(extracted.file, snapshotRoot)
          } catch (primaryError) {
            const failures = [primaryError]
            for (const fallback of await renderFallbacks(asset, extracted, temporaryRoot)) {
              try {
                rendered = await renderer.render(fallback.file, snapshotRoot)
                state.source.renderFallback = {
                  method: fallback.method,
                  source: fallback.source,
                  primaryError: primaryError.message,
                }
                break
              } catch (fallbackError) {
                failures.push(fallbackError)
              }
            }
            if (!rendered) {
              throw new AggregateError(failures, `Every render source failed for ${asset.kind}/${asset.id}`)
            }
          }
          state.geometry = { ...sourceGeometry, ...rendered.geometry }
          state.lowPolyContract = lowPolyContract(state.geometry, options)
          state.snapshots = rendered.snapshots
          state.stages.snapshot = { completed: true, at: new Date().toISOString() }
          for (const snapshot of state.snapshots) {
            snapshot.labels = await classifier.classify(snapshot.file)
          }
          const selected = [...state.snapshots].sort((left, right) => {
            const leftScore = (left.labels[0]?.score ?? 0) + (left.view === 'threeQuarter' ? 0.025 : 0)
            const rightScore = (right.labels[0]?.score ?? 0) + (right.view === 'threeQuarter' ? 0.025 : 0)
            return rightScore - leftScore
          })[0]
          const visual = mappedCategory(state.snapshots.flatMap((snapshot) => snapshot.labels))
          const sqliteCategory = state.databaseSemantics?.category
          const metadataCategory = itemMetadataCategory(state.legacyItems)
          const nameCategory = filenameCategory(asset.id)
          state.classification = {
            model: 'MobileNetV2-12/ImageNet-1K',
            runtime: 'onnxruntime-node',
            selectedView: selected.view,
            selectedSnapshot: selected.file,
            category: sqliteCategory ?? metadataCategory ?? nameCategory ?? visual.category,
            categorySources: {
              sqlite: {
                category: sqliteCategory,
                matchedSources: state.databaseSemantics?.matchedSources ?? [],
                displayName: state.databaseSemantics?.displayName ?? asset.id,
              },
              legacyItemMetadata: metadataCategory,
              legacyModelName: nameCategory,
              onnxVisual: visual,
            },
            topLabels: selected.labels,
          }
          state.stages.classify = { completed: true, at: new Date().toISOString() }
          state.failure = null
          await fs.rm(extracted.file, { force: true })
          await writeJsonAtomic(stateFile, state)
          await updateDescription(asset, state, options.outputRoot)
        } catch (error) {
          state.failure = { stage: 'classify', ...compactError(error) }
          await writeJsonAtomic(stateFile, state)
          await updateDescription(asset, state, options.outputRoot)
          console.error(`[failed] ${key}: ${error.message}`)
        }
        await writeMasterManifest(options.outputRoot, inventoryAssets, stateByKey, options)
      }
    }
  } finally {
    await renderer?.close()
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }

  const lan = new HunyuanLanClient(options.server, options.requestTimeoutMinutes)
  if (options.stages.includes('shape')) {
    await lan.ensureMode('shape')
    for (const [index, asset] of assets.entries()) {
      const key = `${asset.kind}/${asset.id}`
      const state = stateByKey.get(key)
      if (checkpointComplete(state, 'shape', options)) continue
      if (!state.classification?.selectedSnapshot) {
        console.warn(`[skip shape] ${key}: no classified snapshot`)
        continue
      }
      console.log(`[shape ${index + 1}/${assets.length}] ${key}`)
      const stateFile = path.join(options.outputRoot, asset.kind, asset.id, 'state.json')
      try {
        const image = await fs.readFile(state.classification.selectedSnapshot)
        let bytes
        let method = 'hunyuan_image_to_shape'
        let fallbackReason = null
        try {
          bytes = await withRetries(`${key} shape`, () => lan.modelResponse('generate', {
            image: image.toString('base64'),
            octree_resolution: options.octreeResolution,
            num_inference_steps: options.shapeSteps,
            guidance_scale: options.guidanceScale,
            texture: false,
            type: 'glb',
          }), 2)
        } catch (shapeError) {
          const fallback = await sourceGeometryFallback(asset)
          bytes = fallback.bytes
          method = 'validated_source_geometry_for_hunyuan_paint'
          fallbackReason = shapeError.message
          console.warn(`[shape fallback] ${key}: Hunyuan shape failed; preserving original geometry`)
        }
        const validation = validateGlb(bytes, `${key} shape response`)
        const file = path.join(options.outputRoot, asset.kind, asset.id, 'shape.glb')
        await fs.writeFile(file, bytes)
        state.generated.shape = {
          file,
          ...validation,
          geometry: inspectGlbGeometry(bytes),
          method,
          fallbackReason,
        }
        state.stages.shape = { completed: true, at: new Date().toISOString() }
        state.failure = null
      } catch (error) {
        state.failure = { stage: 'shape', ...compactError(error) }
        console.error(`[failed] ${key}: ${error.message}`)
      }
      await writeJsonAtomic(stateFile, state)
      await updateDescription(asset, state, options.outputRoot)
      await writeMasterManifest(options.outputRoot, inventoryAssets, stateByKey, options)
    }
  }

  if (options.stages.includes('paint')) {
    await lan.ensureMode('paint')
    for (const [index, asset] of assets.entries()) {
      const key = `${asset.kind}/${asset.id}`
      const state = stateByKey.get(key)
      if (checkpointComplete(state, 'paint', options)) continue
      const shapeFile = state.generated?.shape?.file
      const imageFile = state.classification?.selectedSnapshot
      if (!shapeFile || !imageFile) {
        console.warn(`[skip paint] ${key}: missing shape or classified snapshot`)
        continue
      }
      console.log(`[paint ${index + 1}/${assets.length}] ${key}`)
      const stateFile = path.join(options.outputRoot, asset.kind, asset.id, 'state.json')
      try {
        const [mesh, image] = await Promise.all([fs.readFile(shapeFile), fs.readFile(imageFile)])
        const contract = state.lowPolyContract ?? lowPolyContract(state.geometry, options)
        if (!contract) throw new Error(`${key} has no measurable source triangle count`)
        state.lowPolyContract = contract
        const bytes = await withRetries(`${key} paint`, () => lan.modelResponse('paint', {
          mesh: mesh.toString('base64'),
          image: image.toString('base64'),
          face_count: contract.targetFaceCount,
          texture: true,
          type: 'glb',
        }))
        const validation = validateGlb(bytes, `${key} paint response`)
        const geometry = inspectGlbGeometry(bytes)
        const file = path.join(options.outputRoot, asset.kind, asset.id, 'final.glb')
        await fs.writeFile(file, bytes)
        state.generated.final = {
          file,
          ...validation,
          geometry,
          requestedFaceCount: contract.targetFaceCount,
        }
        state.stages.paint = { completed: true, at: new Date().toISOString() }
        state.failure = null
        if (options.pruneShapes) {
          await fs.rm(shapeFile, { force: true })
          state.generated.shape.pruned = true
        }
      } catch (error) {
        state.failure = { stage: 'paint', ...compactError(error) }
        console.error(`[failed] ${key}: ${error.message}`)
      }
      await writeJsonAtomic(stateFile, state)
      await updateDescription(asset, state, options.outputRoot)
      await writeMasterManifest(options.outputRoot, inventoryAssets, stateByKey, options)
    }
  }

  if (options.stages.includes('validate')) {
    const validationRenderer = new SnapshotRenderer(options.outputRoot)
    const validationClassifier = classifier ?? await OnnxClassifier.create(options.cacheDir)
    await validationRenderer.start()
    try {
      for (const [index, asset] of assets.entries()) {
        const key = `${asset.kind}/${asset.id}`
        const state = stateByKey.get(key)
        if (checkpointComplete(state, 'validate', options)) continue
        const finalFile = state.generated?.final?.file
        if (!finalFile) {
          console.warn(`[skip validate] ${key}: missing final GLB`)
          continue
        }
        console.log(`[validate ${index + 1}/${assets.length}] ${key}`)
        const stateFile = path.join(options.outputRoot, asset.kind, asset.id, 'state.json')
        try {
          const finalBytes = await fs.readFile(finalFile)
          const glb = validateGlb(finalBytes, `${key} final GLB`)
          const inspected = inspectGlbGeometry(finalBytes)
          const contract = state.lowPolyContract ?? lowPolyContract(state.geometry, options)
          if (!contract) throw new Error(`${key} has no measurable source triangle count`)
          state.lowPolyContract = contract
          const reviewRoot = path.join(options.outputRoot, asset.kind, asset.id, 'final-snapshots')
          const rendered = await validationRenderer.render(finalFile, reviewRoot)
          for (const snapshot of rendered.snapshots) {
            snapshot.labels = await validationClassifier.classify(snapshot.file)
          }
          const visual = mappedCategory(rendered.snapshots.flatMap((snapshot) => snapshot.labels))
          const checks = {
            validGlb: glb.glbVersion === 2,
            finiteGeometry: inspected.renderable && inspected.vertexCount > 0 && inspected.triangleCount > 0,
            triangleBudget: inspected.triangleCount <= contract.maximumTriangles,
            hasTextureImages: inspected.imageCount > 0 && inspected.textureCount > 0,
            everyPrimitiveTextured: inspected.textured,
            visibleInEveryView: rendered.snapshots.every((snapshot) => snapshot.foregroundFraction >= 0.005),
          }
          state.finalValidation = {
            passed: Object.values(checks).every(Boolean),
            checks,
            geometry: { ...rendered.geometry, ...inspected },
            sourceGeometry: state.geometry,
            lowPolyContract: contract,
            triangleRatio: inspected.triangleCount / contract.originalTriangles,
            snapshots: rendered.snapshots,
            onnxVisual: visual,
            validatedAt: new Date().toISOString(),
          }
          if (!state.finalValidation.passed) {
            throw new Error(`Final validation failed: ${JSON.stringify(checks)}`)
          }
          state.stages.validate = { completed: true, at: new Date().toISOString() }
          state.failure = null
        } catch (error) {
          state.failure = { stage: 'validate', ...compactError(error) }
          console.error(`[failed] ${key}: ${error.message}`)
        }
        await writeJsonAtomic(stateFile, state)
        await updateDescription(asset, state, options.outputRoot)
        await writeMasterManifest(options.outputRoot, inventoryAssets, stateByKey, options)
      }
    } finally {
      await validationRenderer.close()
    }
  }

  return writeMasterManifest(options.outputRoot, inventoryAssets, stateByKey, options)
}

export {
  ALL_STAGES,
  OnnxClassifier,
  SnapshotRenderer,
  collectReferenceFiles,
  filenameCategory,
  databaseSemantics,
  inspectGlbGeometry,
  loadItemMetadata,
  loadSqliteMetadata,
  lowPolyContract,
  mappedCategory,
  parseArguments,
  repairLegacyGlbForRendering,
  sourceGeometryFallback,
  summarizeItems,
  validateGlb,
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      console.log(usage())
    } else {
      const manifest = await run(options)
      console.log(JSON.stringify({ complete: true, counts: manifest.counts, manifest: path.join(options.outputRoot, 'manifest.json') }))
    }
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  }
}
