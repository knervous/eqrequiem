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
  hem: path.resolve(libraRoot, '../../assets/src/models/half_elf_male'),
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
    boneContract: scene.skeletons[0].bones.map((bone) => ({
      name: bone.name,
      parentBoneIndex: bone.parentBoneIndex,
      rest: Object.values(bone.rest),
    })),
  }
}
const male = loadRuntime('hum')
const female = loadRuntime('huf')
const halfElfMale = loadRuntime('hem')
const comfyMale = loadRuntime('hmc')
const comfyFemale = loadRuntime('hfc')
const runtimes = { hum: male, huf: female, hem: halfElfMale, hmc: comfyMale, hfc: comfyFemale }
const highQualityHumanoids = new Set(['hum', 'huf', 'hem'])
const expandedHumanAnimations = [
  'Idle', 'Walk', 'Run', 'Idle_Look', 'Jump_Start', 'Jump_Land', 'Jump_Loop',
  'Crouch_Walk', 'Swim', 'Sit_Idle', 'Turn_Right', 'Strafe_Right', 'Pickup',
  'Kick', 'Punch_Right', 'Block', 'Punch_Left', 'Hit_Front', 'Knockdown',
  'Death', 'Cheer', 'Wave', 'Yes', 'No', 'Kneel', 'Point', 'Bow',
]

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
    if (model === 'hum') assert.equal(triangles, 5_998)
    else if (model === 'huf') assert.equal(triangles, 6_396)
    else if (model === 'hem') assert.equal(triangles, 5_998)
    else assert.ok(triangles <= 6_000, `${model} has ${triangles} triangles`)
  }
})

test('half elf male retains the canonical human runtime skeleton ABI', () => {
  assert.equal(halfElfMale.boneContract.length, male.boneContract.length)
  for (let index = 0; index < male.boneContract.length; index++) {
    const expected = male.boneContract[index]
    const actual = halfElfMale.boneContract[index]
    assert.equal(actual.name, expected.name)
    assert.equal(actual.parentBoneIndex, expected.parentBoneIndex)
    assert.equal(actual.rest.length, expected.rest.length)
    for (let component = 0; component < expected.rest.length; component++) {
      assert.ok(
        Math.abs(actual.rest[component] - expected.rest[component]) <= 1e-5,
        `${actual.name} rest matrix component ${component} drifted`,
      )
    }
  }
})

test('hum and huf retain the same runtime skeleton while canonical drift is audited separately', () => {
  assert.equal(male.boneContract.length, female.boneContract.length)
  for (let index = 0; index < male.boneContract.length; index++) {
    const expected = male.boneContract[index]
    const actual = female.boneContract[index]
    assert.equal(actual.name, expected.name)
    assert.equal(actual.parentBoneIndex, expected.parentBoneIndex)
    assert.equal(actual.rest.length, expected.rest.length)
    for (let component = 0; component < expected.rest.length; component++) {
      assert.ok(
        Math.abs(actual.rest[component] - expected.rest[component]) <= 1e-5,
        `${actual.name} rest matrix component ${component} drifted`,
      )
    }
  }
})

test('triangle winding agrees with exported vertex normals for every body', () => {
  for (const [model, runtime] of Object.entries(runtimes)) {
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
    // Smooth normals on the connected Hunyuan voxel surfaces can oppose a face
    // at strongly concave joints even when topology winding is consistent.
    // Keep release bodies at the tighter gate; comparison-only diagnostics get
    // a still-strict 99% gross-winding sanity check instead of masquerading as
    // release-approved geometry.
    const minimumAlignment = model === 'hum' || model === 'huf' ? 0.995 : 0.99
    const alignment = aligned / (indices.length / 3)
    assert.ok(alignment > minimumAlignment, `${model} has ${aligned} aligned triangles (${alignment})`)
  }
})

test('viewer inputs contain their approved animation libraries and painted atlases', () => {
  for (const [model, runtime] of Object.entries(runtimes)) {
    assert.equal(runtime.animations.fps, 30)
    const expectedAnimations = highQualityHumanoids.has(model)
      ? expandedHumanAnimations
      : ['Idle', 'Walk', 'Run']
    assert.equal(runtime.animations.animations.length, expectedAnimations.length)
    for (const name of expectedAnimations) {
      assert.ok(runtime.animations.animations.some((entry) => entry.name === name))
    }
    // Release HUM/HUF bodies retain the reviewed 2K grounded-fantasy paint.
    // Comparison POCs use the generic installer's 512-square runtime atlas.
    const atlasSide = highQualityHumanoids.has(model) ? 2048 : 512
    assert.equal(fs.statSync(path.join(runtimeRoot, `basis/${model}.rgba`)).size, atlasSide * atlasSide * 4)
    if (highQualityHumanoids.has(model)) {
      const metadata = JSON.parse(fs.readFileSync(
        path.join(runtimeRoot, `basis/${model}.meta.json`),
        'utf8',
      ))
      assert.equal(metadata.styleProfile.id, 'requiem-grounded-animated-fantasy-v2')
      assert.equal(metadata.runtime.width, 2048)
      assert.equal(metadata.runtime.height, 2048)
      assert.equal(metadata.runtime.basisEncoding, 'uastc')
      assert.equal(metadata.runtime.basisUastcLevel, 3)
      assert.ok(metadata.runtime.basisBytes > 1_000_000)
      assert.ok(metadata.source.width >= 2048)
      assert.ok(metadata.source.height >= 2048)
    }
  }
})

test('EQ secondary motions use the corrected forward-axis contract', () => {
  for (const model of ['hum', 'huf']) {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(sourceRoots[model], 'runtime/eq-motion-manifest.json'),
      'utf8',
    ))
    assert.equal(manifest.provenance, 'everquest_hum_direction_retarget_v3_axis_fixed')
    assert.deepEqual(manifest.coordinateContract, {
      sourceForward: '-X',
      targetForward: '-Y',
      properRotation: true,
    })
    const bow = manifest.directionAudits.find((audit) => audit.semantic === 'Bow')
    assert.ok(bow)
    assert.equal(bow.passed, true)
    assert.ok(bow.peakForwardMeters >= bow.minimumForwardMeters)
  }
})

test('priority motions pass human-gait validation on release-quality humanoids', () => {
  for (const model of ['hum', 'huf', 'hem']) {
    const report = JSON.parse(fs.readFileSync(
      path.join(sourceRoots[model], 'runtime/motion-audit.json'),
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

test('candidate release status agrees with every strict pipeline report', () => {
  for (const model of ['hum', 'huf']) {
    const root = sourceRoots[model]
    const asset = JSON.parse(fs.readFileSync(path.join(root, 'asset.json'), 'utf8'))
    const candidateRoot = path.join(root, 'texture-candidate')
    const motion = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'motion-audit.json'), 'utf8'))
    const rig = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'rig-audit.json'), 'utf8'))
    const fit = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'fit-audit.json'), 'utf8'))
    const deformation = JSON.parse(fs.readFileSync(
      path.join(candidateRoot, 'deformation-audit.json'),
      'utf8',
    ))
    const vat = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'vat-audit.json'), 'utf8'))
    const texture = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'texture-audit.json'), 'utf8'))
    const uv = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'uv-audit.json'), 'utf8'))
    const art = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'art-review.json'), 'utf8'))
    assert.equal(fit.thresholds.allowOutsideJoints, 0)
    assert.equal(deformation.animationAudit.minEdgeRatio, 0.25)
    assert.equal(deformation.animationAudit.maxEdgeRatio, 4)
    assert.equal(deformation.animationAudit.maxP99EdgeRatio, 2)
    assert.equal(deformation.animationAudit.maxExtremeEdgeFraction, 0.0015)
    assert.equal(vat.passed, true, `${model} installed VAT matches its source GLB`)
    const approved = motion.passed === true
      && rig.comparison.compatible === true
      && fit.passed === true
      && deformation.render.animationAudit.failedClipCount === 0
      && vat.passed === true
      && texture.automatedPassed === true
      && uv.passed === true
      && art.passed === true
    assert.equal(
      asset.textureCandidate.validationStatus,
      approved ? 'approved' : 'pending_art_review',
      `${model} texture candidate must remain pending until art review passes`,
    )
    assert.equal(asset.runtimeCandidate.validationStatus, 'technical_approved_texture_rework_required')
  }
})

test('manual candidates retain complete PBR transfer evidence', () => {
  const candidates = {
    hum: { root: path.join(sourceRoots.hum, 'texture-candidate'), report: 'human_male.paint.json', textures: 'pbr' },
    huf: { root: path.join(sourceRoots.huf, 'texture-candidate'), report: 'human_female.paint.json', textures: 'pbr' },
    hmc: { root: sourceRoots.hmc, report: 'male_comfy_pbr.paint.json', textures: 'pbr' },
    hfc: { root: sourceRoots.hfc, report: 'female_comfy_pbr.paint.json', textures: 'pbr' },
  }
  for (const [model, candidate] of Object.entries(candidates)) {
    const report = JSON.parse(fs.readFileSync(path.join(candidate.root, candidate.report), 'utf8'))
    assert.ok(report.paintedVertices <= 5_000)
    assert.equal(report.nearestFallbacks, 0)
    assert.equal(report.maximumDistance, 0)
    if (model === 'hum' || model === 'huf') {
      assert.equal(report.topologyMismatches, 0)
      assert.ok(report.maximumInfluences <= 4)
      assert.ok(report.maximumWeightSumError <= 1e-4)
    }
    assert.equal(report.animations, 3)
    assert.equal(report.joints, 26)
    assert.deepEqual(report.channels, ['baseColor', 'normal', 'occlusion', 'roughness', 'metallic'])
    for (const texture of ['base-color.png', 'normal.png', 'orm.png']) {
      assert.ok(fs.statSync(path.join(candidate.root, candidate.textures, texture)).size > 1_000, `${model} ${texture}`)
    }
  }
})
