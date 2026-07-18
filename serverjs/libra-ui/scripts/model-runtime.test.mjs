import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const libraRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.resolve(libraRoot, '../../client/public/eqrequiem')
const sourceRoot = path.resolve(libraRoot, '../../assets/src/models/human_male')
const sourceRoots = {
  hum: sourceRoot,
  huf: path.resolve(libraRoot, '../../assets/src/models/human_female'),
  hmc: path.resolve(libraRoot, '../../assets/src/models/comfyui_humans/male'),
  hfc: path.resolve(libraRoot, '../../assets/src/models/comfyui_humans/female'),
}
const loadRuntime = (model) => {
  const scene = JSON.parse(gunzipSync(fs.readFileSync(path.join(runtimeRoot, `babylon/${model}.babylon.gz`))))
  return {
    animations: JSON.parse(fs.readFileSync(path.join(runtimeRoot, `vat/${model}.json`), 'utf8')),
    geometry: scene.geometries.vertexData.find((entry) => entry.id === model),
    metadata: scene.meshes.find((entry) => entry.name === model).metadata.gltf.extras,
    bones: scene.skeletons[0].bones.map((bone) => bone.name),
  }
}
const male = loadRuntime('hum')
const female = loadRuntime('huf')
const comfyMale = loadRuntime('hmc')
const comfyFemale = loadRuntime('hfc')
const runtimes = { hum: male, huf: female, hmc: comfyMale, hfc: comfyFemale }

test('all human runtimes stay inside the geometry and scale contract', () => {
  for (const [model, runtime] of Object.entries(runtimes)) {
    assert.ok(runtime.geometry)
    assert.ok(runtime.geometry.positions.length / 3 <= 5_000)
    assert.equal(runtime.metadata.runtimeTargetHeight, 6)
    assert.equal(runtime.metadata.preserveRuntimeWinding, true)
    assert.ok(Math.abs(runtime.metadata.runtimeYawCorrection + Math.PI / 2) < 1e-10)
    assert.equal(runtime.bones.length, 26)
    for (const socket of ['socket_hand.L', 'socket_hand.R', 'socket_back', 'socket_head']) {
      assert.ok(runtime.bones.includes(socket), `${socket} is exported`)
    }
    const triangles = runtime.geometry.indices.length / 3
    if (model === 'hum') assert.equal(triangles, 6_396)
    else if (model === 'huf') assert.equal(triangles, 6_396)
    else assert.ok(triangles <= 6_000, `${model} has ${triangles} triangles`)
  }
})

test('triangle winding agrees with exported vertex normals for every body', () => {
  for (const runtime of Object.values(runtimes)) {
    const { indices, normals, positions } = runtime.geometry
    let aligned = 0
    for (let offset = 0; offset < indices.length; offset += 3) {
      const [a, b, c] = indices.slice(offset, offset + 3)
      const ab = [0, 1, 2].map((axis) => positions[b * 3 + axis] - positions[a * 3 + axis])
      const ac = [0, 1, 2].map((axis) => positions[c * 3 + axis] - positions[a * 3 + axis])
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ]
      const normal = [0, 1, 2].map(
        (axis) => normals[a * 3 + axis] + normals[b * 3 + axis] + normals[c * 3 + axis],
      )
      if (cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] >= 0) aligned++
    }
    // The connected female voxel surface uses smooth vertex normals; a few
    // triangles at strongly concave joints can legitimately oppose the sum of
    // their interpolated corner normals even though face winding is consistent.
    assert.ok(aligned / (indices.length / 3) > 0.995, `${aligned} triangles aligned`)
  }
})

test('viewer inputs contain the three locomotion clips and painted atlases', () => {
  for (const [model, runtime] of Object.entries(runtimes)) {
    assert.equal(runtime.animations.fps, 30)
    assert.equal(runtime.animations.animations.length, 3)
    for (const name of ['Idle', 'Walk', 'Run']) {
      assert.ok(runtime.animations.animations.some((entry) => entry.name === name))
    }
    // Painted human bodies carry a 512-square atlas; the ComfyUI POCs remain
    // on the legacy 128-square baseline until they are reinstalled.
    const atlasSide = model === 'hum' || model === 'huf' ? 512 : 128
    assert.equal(fs.statSync(path.join(runtimeRoot, `basis/${model}.rgba`)).size, atlasSide * atlasSide * 4)
  }
})

test('priority motions pass human-gait validation on both bodies', () => {
  for (const model of ['hum', 'huf']) {
    const sex = model === 'hum' ? 'human_male' : 'human_female'
    const report = JSON.parse(fs.readFileSync(
      path.join(sourceRoots[model], `eqref/${sex}_locomotion_v11.audit.json`),
      'utf8',
    ))
    assert.equal(report.passed, true)
    const idle = report.clips.find((clip) => clip.clip === 'Idle')
    const walk = report.clips.find((clip) => clip.clip === 'Walk')
    const run = report.clips.find((clip) => clip.clip === 'Run')
    // Idle arms hang relaxed instead of holding a bent zombie pose.
    assert.ok(idle.metrics.maxElbowFlexionDegrees <= 30)
    // The stance leg must extend at contact: a permanently crouched gait fails.
    assert.ok(walk.metrics.minStanceKneeFlexionDegrees <= 22)
    assert.ok(run.metrics.minStanceKneeFlexionDegrees <= 35)
    // Both arms and both legs must actually swing with human amplitude.
    assert.ok(walk.metrics.minHandSwingMeters >= 0.10)
    assert.ok(run.metrics.minHandSwingMeters >= 0.15)
    assert.ok(walk.metrics.minAnkleSwingMeters >= 0.30)
    assert.ok(run.metrics.minAnkleSwingMeters >= 0.45)
    // The pelvis rides near its rest height rather than sinking into a squat.
    assert.ok(walk.metrics.meanPelvisHeightMeters >= walk.metrics.restPelvisHeightMeters - 0.06)
    assert.ok(run.metrics.meanPelvisHeightMeters >= run.metrics.restPelvisHeightMeters - 0.09)
    // Contralateral limb timing comes from the mocap and must survive retarget.
    assert.ok(walk.metrics.leftHandVsLeftFootPhase < -0.45)
    assert.ok(walk.metrics.leftHandVsRightFootPhase > 0.45)
    assert.ok(run.metrics.leftHandVsLeftFootPhase < -0.45)
    assert.ok(run.metrics.leftHandVsRightFootPhase > 0.45)
    assert.equal(walk.metrics.bothHandsBehindFrames, 0)
    assert.ok(walk.metrics.maxKneeLateralMeters < 0.09)
    assert.ok(run.metrics.maxKneeLateralMeters < 0.09)
  }
})

test('manual candidates retain complete PBR transfer evidence', () => {
  const candidates = {
    hum: { root: path.join(sourceRoots.hum, 'eqref'), report: 'human_male_locomotion_v11_pbr.paint.json', textures: 'pbr_v11' },
    huf: { root: path.join(sourceRoots.huf, 'eqref'), report: 'human_female_locomotion_v11_pbr.paint.json', textures: 'pbr_v11' },
    hmc: { root: sourceRoots.hmc, report: 'male_comfy_pbr.paint.json', textures: 'pbr' },
    hfc: { root: sourceRoots.hfc, report: 'female_comfy_pbr.paint.json', textures: 'pbr' },
  }
  for (const [model, candidate] of Object.entries(candidates)) {
    const report = JSON.parse(fs.readFileSync(path.join(candidate.root, candidate.report), 'utf8'))
    assert.ok(report.paintedVertices <= 5_000)
    assert.equal(report.nearestFallbacks, 0)
    assert.equal(report.maximumDistance, 0)
    assert.equal(report.animations, 3)
    assert.equal(report.joints, 26)
    assert.deepEqual(report.channels, ['baseColor', 'normal', 'occlusion', 'roughness', 'metallic'])
    for (const texture of ['base-color.png', 'normal.png', 'orm.png']) {
      assert.ok(fs.statSync(path.join(candidate.root, candidate.textures, texture)).size > 1_000, `${model} ${texture}`)
    }
  }
})
