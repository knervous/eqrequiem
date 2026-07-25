import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import {
  collectReferenceFiles,
  databaseSemantics,
  filenameCategory,
  inspectGlbGeometry,
  loadItemMetadata,
  loadSqliteMetadata,
  lowPolyContract,
  mappedCategory,
  parseArguments,
  repairLegacyGlbForRendering,
  summarizeItems,
  validateGlb,
} from './generate-eq-catalog-lan.mjs'

function jsonGlb(document) {
  const json = Buffer.from(JSON.stringify(document))
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
  const glb = Buffer.alloc(20 + padded.length)
  glb.write('glTF')
  glb.writeUInt32LE(2, 4)
  glb.writeUInt32LE(glb.length, 8)
  glb.writeUInt32LE(padded.length, 12)
  glb.writeUInt32LE(0x4e4f534a, 16)
  padded.copy(glb, 20)
  return glb
}

test('CLI accepts a mounted reference root and bounded stages', () => {
  const options = parseArguments([
    '--ref-dir', '/tmp/eq-ref',
    '--output-root', '/tmp/eq-out',
    '--stages', 'snapshot,classify',
    '--kind', 'items',
    '--limit', '3',
  ])
  assert.equal(options.inputRoot, '/tmp/eq-ref')
  assert.equal(options.outputRoot, '/tmp/eq-out')
  assert.deepEqual(options.stages, ['snapshot', 'classify'])
  assert.equal(options.kind, 'items')
  assert.equal(options.limit, 3)
  assert.equal(options.faceCount, 6000)
  assert.equal(options.triangleRatio, 1.5)
  assert.equal(options.triangleFloor, 64)
})

test('inventory includes GLB and compressed GLB but excludes Babylon duplicates', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eq-catalog-test-'))
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'items'))
  await fs.mkdir(path.join(root, 'objects'))
  await Promise.all([
    fs.writeFile(path.join(root, 'items', 'IT14.glb.gz'), ''),
    fs.writeFile(path.join(root, 'items', 'IT14.babylon.gz'), ''),
    fs.writeFile(path.join(root, 'objects', 'Crate.glb'), ''),
  ])
  assert.deepEqual(await collectReferenceFiles(root), [
    { id: 'it14', kind: 'items', source: path.join(root, 'items', 'IT14.glb.gz') },
    { id: 'crate', kind: 'objects', source: path.join(root, 'objects', 'Crate.glb') },
  ])
})

test('item metadata is grouped by idfile and summarized without sending the catalog', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eq-catalog-metadata-'))
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'items.json')
  await fs.writeFile(file, JSON.stringify([
    { id: 1, name: 'Wind Hammer', idfile: 'IT14', itemtype: 3, slots: 8192 },
    { id: 2, name: 'Other Wind Hammer', idfile: 'it14', itemtype: 3, slots: 8192 },
  ]))
  const metadata = await loadItemMetadata(file)
  const summary = summarizeItems(metadata.get('it14'))
  assert.equal(summary.count, 2)
  assert.deepEqual(summary.itemTypes, [{ itemType: 3, count: 2 }])
  assert.deepEqual(summary.slots, [{ slots: 8192, count: 2 }])
})

test('SQLite metadata joins item and object model names into bounded semantics', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eq-catalog-sqlite-'))
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'content.sqlite')
  const database = new DatabaseSync(file)
  database.exec(`
    CREATE TABLE items (
      id INTEGER, Name TEXT, idfile TEXT, itemtype INTEGER, itemclass INTEGER,
      slots INTEGER, material INTEGER, icon INTEGER, damage INTEGER, delay INTEGER,
      range INTEGER, classes INTEGER, races INTEGER, lore TEXT
    );
    CREATE TABLE zone (zoneidnumber INTEGER, short_name TEXT, long_name TEXT);
    CREATE TABLE object (
      objectname TEXT, itemid INTEGER, type INTEGER, display_name TEXT, zoneid INTEGER
    );
    CREATE TABLE ground_spawns (name TEXT, item INTEGER, comment TEXT, zoneid INTEGER);
    CREATE TABLE tool_game_objects (
      id INTEGER, object_name TEXT, file_from TEXT, zonesn TEXT, zoneid INTEGER, is_global INTEGER
    );
    CREATE TABLE doors (
      id INTEGER, name TEXT, zone TEXT, opentype INTEGER, keyitem INTEGER, size INTEGER
    );
    INSERT INTO items VALUES
      (14, 'Wind Hammer', 'IT14', 3, 0, 8192, 2, 7, 9, 20, 0, 1, 1, '');
    INSERT INTO zone VALUES (1, 'qeynos', 'South Qeynos');
    INSERT INTO object VALUES ('CHAIRD', 14, 0, 'Oak Tavern Chair', 1);
    INSERT INTO ground_spawns VALUES ('CHAIRD', 14, 'chair spawn', 1);
    INSERT INTO tool_game_objects VALUES (1, 'CHAIRD', 'qeynos_obj.s3d', 'qeynos', 1, 0);
    INSERT INTO doors VALUES (1, 'CHAIRD', 'qeynos', 31, 0, 100);
  `)
  database.close()

  const metadata = loadSqliteMetadata(file)
  const item = databaseSemantics({ id: 'it14', kind: 'items' }, metadata)
  assert.equal(item.matched, true)
  assert.equal(item.displayName, 'Wind Hammer')
  assert.equal(item.category, 'weapon.blunt.one-handed')
  assert.deepEqual(item.matchedSources, ['items.idfile'])

  const object = databaseSemantics({ id: 'chaird', kind: 'objects' }, metadata)
  assert.equal(object.displayName, 'Oak Tavern Chair')
  assert.deepEqual(object.matchedSources, [
    'object/ground_spawns model name',
    'tool_game_objects.object_name',
    'doors.name',
  ])
  assert.equal(object.placements.count, 2)
})

test('low-poly contract is source-relative, floored, and absolutely capped', () => {
  const options = { triangleRatio: 1.5, triangleFloor: 64, faceCount: 6000 }
  assert.deepEqual(lowPolyContract({ triangleCount: 20 }, options), {
    originalTriangles: 20,
    ratio: 1.5,
    minimumTarget: 64,
    absoluteCeiling: 6000,
    maximumTriangles: 64,
    targetFaceCount: 64,
  })
  assert.equal(lowPolyContract({ triangleCount: 1000 }, options).maximumTriangles, 1500)
  assert.equal(lowPolyContract({ triangleCount: 10000 }, options).maximumTriangles, 6000)
  assert.equal(lowPolyContract({ triangleCount: 0 }, options), null)
})

test('visual category rules use word boundaries', () => {
  assert.equal(mappedCategory([{ label: 'hatchet', score: 0.8 }]).category, 'weapon.axe')
  assert.equal(mappedCategory([{ label: 'balance beam', score: 0.8 }]).category, 'prop.unknown')
})

test('legacy model names provide deterministic object semantics', () => {
  assert.equal(filenameCategory('bazaardoor'), 'architecture.door')
  assert.equal(filenameCategory('obp_tree_commonb2'), 'environment.vegetation')
  assert.equal(filenameCategory('unknown-gizmo'), null)
})

test('GLB validation checks magic, version, and declared length', () => {
  const valid = Buffer.alloc(20)
  valid.write('glTF')
  valid.writeUInt32LE(2, 4)
  valid.writeUInt32LE(20, 8)
  assert.equal(validateGlb(valid, 'test').glbVersion, 2)
  const invalid = Buffer.from(valid)
  invalid.writeUInt32LE(21, 8)
  assert.throws(() => validateGlb(invalid, 'bad'), /invalid GLB header/)
})

test('legacy render repair strips broken texture references while preserving GLB chunks', () => {
  const document = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 0 }],
    images: [{ mimeType: 'image/missing' }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  }
  const glb = jsonGlb(document)
  const repaired = repairLegacyGlbForRendering(glb)
  validateGlb(repaired, 'repaired')
  const repairedLength = repaired.readUInt32LE(12)
  const repairedDocument = JSON.parse(repaired.subarray(20, 20 + repairedLength).toString('utf8').trimEnd())
  assert.equal(repairedDocument.images, undefined)
  assert.equal(repairedDocument.textures, undefined)
  assert.equal(repairedDocument.materials[0].pbrMetallicRoughness.baseColorTexture, undefined)
  assert.deepEqual(repairedDocument.materials[0].pbrMetallicRoughness.baseColorFactor, [0.64, 0.61, 0.56, 1])
})

test('geometry inspection distinguishes empty collision proxies', () => {
  const document = { asset: { version: '2.0' }, meshes: [{ primitives: [{}] }] }
  const glb = jsonGlb(document)
  assert.deepEqual(inspectGlbGeometry(glb), {
    meshCount: 1,
    primitiveCount: 1,
    renderablePrimitiveCount: 0,
    accessorCount: 0,
    vertexCount: 0,
    triangleCount: 0,
    materialCount: 0,
    imageCount: 0,
    textureCount: 0,
    baseColorTextureMaterialCount: 0,
    texturedPrimitiveCount: 0,
    textured: false,
    renderable: false,
  })
})

test('geometry inspection counts triangles and requires valid texture-image references', () => {
  const textured = jsonGlb({
    asset: { version: '2.0' },
    accessors: [{ count: 12 }, { count: 18 }],
    images: [{ uri: 'data:image/png;base64,AA==' }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  })
  const geometry = inspectGlbGeometry(textured)
  assert.equal(geometry.vertexCount, 12)
  assert.equal(geometry.triangleCount, 6)
  assert.equal(geometry.texturedPrimitiveCount, 1)
  assert.equal(geometry.textured, true)

  const missingImage = jsonGlb({
    asset: { version: '2.0' },
    accessors: [{ count: 3 }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  })
  assert.equal(inspectGlbGeometry(missingImage).textured, false)
})
