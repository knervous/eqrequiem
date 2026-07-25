#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

import { renderGlbReferenceSheet } from './render-glb-reference.mjs'

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const glb = path.resolve(option('glb') ?? '')
const outputDir = path.resolve(option('output-dir') ?? '')
const model = option('model') ?? path.basename(glb, path.extname(glb))
const styleProfilePath = option('style-profile') ? path.resolve(option('style-profile')) : undefined
if (!option('glb') || !option('output-dir')) {
  throw new Error('Usage: render-humanoid-art-review.mjs --glb candidate.glb --output-dir review --model hum [--style-profile style.json]')
}
const styleProfile = styleProfilePath
  ? JSON.parse(await fs.readFile(styleProfilePath, 'utf8'))
  : { id: 'requiem-painterly-fantasy-v1', artReview: {} }

await fs.mkdir(outputDir, { recursive: true })
const specs = [
  { id: 'full-front-idle', pose: 'Idle', poseFraction: 0, frontAxis: '+z', focus: 'full' },
  { id: 'head-front-idle', pose: 'Idle', poseFraction: 0, frontAxis: '+z', focus: 'head' },
  { id: 'hands-front-idle', pose: 'Idle', poseFraction: 0, frontAxis: '+z', focus: 'hands' },
  { id: 'feet-front-idle', pose: 'Idle', poseFraction: 0, frontAxis: '+z', focus: 'feet' },
  { id: 'feet-side-run-0.25', pose: 'Run', poseFraction: 0.25, frontAxis: '-x', focus: 'feet' },
  { id: 'feet-side-run-0.5', pose: 'Run', poseFraction: 0.5, frontAxis: '-x', focus: 'feet' },
  { id: 'full-front-run-0.5', pose: 'Run', poseFraction: 0.5, frontAxis: '+z', focus: 'full' },
  { id: 'full-side-run-0.5', pose: 'Run', poseFraction: 0.5, frontAxis: '-x', focus: 'full' },
]

const views = []
for (const spec of specs) {
  const output = path.join(outputDir, `${model}-${spec.id}.png`)
  await renderGlbReferenceSheet({
    glbs: [glb],
    output,
    width: 1200,
    height: 1200,
    ...spec,
  })
  views.push({ ...spec, output })
}

const report = {
  schemaVersion: 1,
  model,
  input: glb,
  passed: false,
  reviewer: null,
  reviewedAt: null,
  styleProfile: styleProfile.id,
  styleProfilePath: styleProfilePath ?? null,
  views,
  checks: {
    intentionalGroundedFantasyStyle: null,
    coherentReadableFace: null,
    cleanHands: null,
    cleanIdleFeet: null,
    cleanAnimatedFeet: null,
    consistentMaterialLanguage: null,
    noVisibleProjectionOrUvArtifacts: null
  },
  rejectWhen: styleProfile.artReview?.rejectWhen ?? [],
  findings: [],
  note: 'Fail-closed template. A human reviewer must inspect every view, fill every check, and set passed=true before release.',
}
await fs.writeFile(path.join(outputDir, 'art-review.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ outputDir, report: path.join(outputDir, 'art-review.json'), views: views.length }, null, 2))
