#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const repaintRoot = path.join(
  repoRoot,
  'assets/generated/object-replacements/qeynos2-hunyuan-clean-room-all/repaints/dark-fantasy-v2',
)
const reportFile = path.join(repaintRoot, 'report.json')
const manifestFile = path.join(
  repoRoot,
  'assets/src/world/objects/replacements/qeynos2-dark-fantasy-v2.json',
)
const expectedAssets = 45
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

function repoRelative(file) {
  const relative = path.relative(repoRoot, file).replaceAll(path.sep, '/')
  ensure(relative && !relative.startsWith('../'), `${file} is outside the repository`)
  return relative
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await fs.rename(temporary, file)
}

function pbrProfile(id) {
  if (/^rug|bed|bunk/.test(id)) {
    return { normalStrength: 1.25, normalScale: 0.8, roughness: 0.94, roughnessVariation: 0.07 }
  }
  if (/lamp|pole/.test(id)) {
    return { normalStrength: 1.4, normalScale: 0.9, roughness: 0.76, roughnessVariation: 0.1 }
  }
  if (/^urn/.test(id)) {
    return { normalStrength: 1.5, normalScale: 0.9, roughness: 0.9, roughnessVariation: 0.1 }
  }
  if (/^tree/.test(id)) {
    return { normalStrength: 1.8, normalScale: 1, roughness: 0.92, roughnessVariation: 0.11 }
  }
  return { normalStrength: 1.65, normalScale: 0.9, roughness: 0.87, roughnessVariation: 0.1 }
}

async function checkedEvidence(file) {
  const bytes = await fs.readFile(file)
  return { file: repoRelative(file), sha256: sha256(bytes) }
}

async function main() {
  ensure(
    process.argv.includes('--owner-approved'),
    'Refusing to create an approved manifest without --owner-approved',
  )
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'))
  ensure(report.kind === 'requiem.qeynos2-dark-fantasy-repaint-review', 'Repaint report contract changed')
  ensure(report.version === 1, 'Unsupported repaint report version')
  ensure(report.results?.length === expectedAssets, `Expected ${expectedAssets} repaint results`)
  ensure(report.results.every(({ passed }) => passed), 'A repaint failed its technical gates')
  ensure(report.sheets?.length === Math.ceil(expectedAssets / 4), 'Review-sheet inventory changed')

  const assets = []
  for (const [index, result] of report.results.entries()) {
    const candidateFile = path.resolve(repoRoot, result.final)
    const candidateBytes = await fs.readFile(candidateFile)
    ensure(sha256(candidateBytes) === result.finalSha256, `${result.id} candidate checksum changed`)
    const sheetFile = path.resolve(repoRoot, report.sheets[Math.floor(index / 4)])
    const legacyFile = path.join(
      repoRoot,
      `assets/generated/eq-catalog/objects/${result.id}/snapshots/threeQuarter.png`,
    )
    assets.push({
      id: result.id,
      candidate: {
        kind: 'hunyuan-clean-room-dark-fantasy-v2',
        file: repoRelative(candidateFile),
        sha256: result.finalSha256,
        sourceShape: result.source,
        sourceShapeSha256: result.sourceSha256,
        conditioning: result.conditioning,
      },
      pbr: pbrProfile(result.id),
      validation: {
        maximumTriangles: result.finalGeometry.triangleCount,
        maximumShapeLogError: 0.47,
      },
      review: {
        decision: 'approved',
        reason: 'Owner approved the complete 45-object dark-fantasy v2 image review on 2026-08-02 after all geometry-preservation, integrity, and embedded PBR gates passed.',
        evidence: [
          await checkedEvidence(legacyFile),
          await checkedEvidence(sheetFile),
        ],
      },
    })
  }

  const manifest = {
    kind: 'requiem.object-replacements',
    version: 1,
    passId: 'qeynos2-dark-fantasy-v2',
    zone: 'qeynos2',
    description: 'Owner-approved promotion of 45 static clean-room Qeynos2 object shapes with cohesive dark-fantasy Hunyuan Paint materials and complete embedded PBR channels.',
    generationPolicy: {
      requiredCandidateKind: 'hunyuan-clean-room-dark-fantasy-v2',
      designMode: 'clean-room-generated-shape-and-repaint',
      legacyImageConditioning: false,
      fallbackCandidateKinds: [],
      excludes: ['animated', 'morph-targeted', 'stateful'],
    },
    assets,
  }
  await atomicJson(manifestFile, manifest)
  await atomicJson(reportFile, {
    ...report,
    state: 'owner-approved-for-promotion',
    ownerApprovedAt: new Date().toISOString(),
    promotionManifest: repoRelative(manifestFile),
  })
  console.log(JSON.stringify({ manifest: repoRelative(manifestFile), assets: assets.length }, null, 2))
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  process.exitCode = 1
})
