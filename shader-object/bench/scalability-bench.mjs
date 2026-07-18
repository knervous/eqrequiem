#!/usr/bin/env node
// CPU-side scalability benchmark for the Shado dynamic-entity path.
//
// Measures the stages the scalability plan makes proportional to changed /
// visible entities instead of total capacity: reducer transitions, draw-list
// maintenance, GPU encode, and upload bytes (recorded, not actually sent).
//
//   node --experimental-vm-modules bench/scalability-bench.mjs [--entities 100000]
//
// Scenarios: static, 1% / 10% / 100% movers, one and eight mesh variants.

import { NullEngine } from '@babylonjs/core';
import { ShadoDynamicEntityContainer } from '../dist/index.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? Number(process.argv[index + 1]) : fallback
}

const entityCount = option('entities', 100_000)
const frames = option('frames', 60)

function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

function report(label, samples, extra = '') {
  const p50 = percentile(samples, 50).toFixed(3)
  const p95 = percentile(samples, 95).toFixed(3)
  const p99 = percentile(samples, 99).toFixed(3)
  console.log(`${label.padEnd(44)} p50 ${p50}ms  p95 ${p95}ms  p99 ${p99}ms ${extra}`)
}

async function scenario({ movers, meshVariants }) {
  const engine = new NullEngine()
  const ok = await ShadoDynamicEntityContainer.initialize(engine, {})
  if (!ok) throw new Error('initialize failed')
  const container = new ShadoDynamicEntityContainer(engine)

  const inputs = []
  for (let i = 0; i < entityCount; i++) {
    inputs.push({
      id: `e${i}`,
      x: (i % 1000) * 2,
      y: Math.floor(i / 1000) * 2,
      width: 1,
      meshIndex: i % meshVariants,
      visible: true,
    })
  }
  const populateStart = performance.now()
  container.upsertMany(inputs)
  const populateMs = performance.now() - populateStart

  const backing = container['_backing']
  const moverCount = Math.floor(entityCount * movers)
  const tickSamples = []
  const commitSamples = []
  let uploadedBytes = 0
  let uploadCalls = 0

  // Warm-up frame: initial full upload.
  container.syncGpu(0)

  for (let frame = 1; frame <= frames; frame++) {
    if (moverCount) {
      const destinations = []
      for (let m = 0; m < moverCount; m++) {
        const index = (frame * 7919 + m * 104729) % entityCount
        destinations.push({
          id: `e${index}`,
          x: Math.random() * 2000,
          y: Math.random() * 200,
        })
      }
      container.setEntityDestinations(destinations)
    }

    const tickStart = performance.now()
    container.tickTransitions(1 / 60)
    tickSamples.push(performance.now() - tickStart)

    const commitStart = performance.now()
    const stats = container.syncGpu(frame)
    commitSamples.push(performance.now() - commitStart)
    uploadedBytes += stats.uploadedBytes
    uploadCalls += stats.uploadCalls
  }

  const arenaBytes = container.arena.take().byteLength
  const label = `${entityCount} entities, ${(movers * 100).toFixed(0)}% movers, ${meshVariants} variants`
  console.log(`\n== ${label} (populate ${populateMs.toFixed(1)}ms, arena ${(arenaBytes / 1e6).toFixed(1)}MB) ==`)
  report('  tickTransitions', tickSamples)
  report('  syncGpu (encode+record)', commitSamples,
    ` uploads=${uploadCalls} avgBytes/frame=${(uploadedBytes / frames / 1024).toFixed(1)}KiB`)

  // Invariant: an unchanged frame uploads zero bytes.
  const idle = container.syncGpu(frames + 1)
  const idle2 = container.syncGpu(frames + 2)
  if (movers === 0 && (idle.uploadedBytes !== 0 || idle2.uploadedBytes !== 0)) {
    throw new Error(`static scenario uploaded bytes on idle frames: ${idle.uploadedBytes}`)
  }
  container.dispose()
  engine.dispose()
}

for (const meshVariants of [1, 8]) {
  for (const movers of [0, 0.01, 0.1, 1]) {
    await scenario({ movers, meshVariants })
  }
}
console.log('\nAll scenarios completed.')
