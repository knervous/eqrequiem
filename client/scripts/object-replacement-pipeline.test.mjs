import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  addLegacyFitRoot,
  addPlacementEnvelopeCalibration,
  geometrySummary,
  shapeProfileCheck,
} from "./object-replacement-pipeline.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function documentWithSize(size) {
  return {
    json: {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      accessors: [
        { type: "VEC3", count: 8, min: [0, 0, 0], max: size, componentType: 5126 },
        { type: "SCALAR", count: 36, componentType: 5123 },
      ],
      materials: [{
        normalTexture: { index: 1 },
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicRoughnessTexture: { index: 2 },
        },
      }],
      images: [{}, {}, {}],
      textures: [{}, {}, {}],
    },
    binary: Buffer.alloc(0),
  };
}

test("shape profile rejects collapsed depth and accepts uniform normalization", () => {
  assert.equal(shapeProfileCheck([9, 4, 6], [2.25, 1, 1.5]).passed, true);
  assert.equal(shapeProfileCheck([9, 4, 6], [2, 1, 0.1]).passed, false);
});

test("planar shape profile compares footprint and allows shallow authored thickness", () => {
  assert.equal(shapeProfileCheck([8, 0, 6], [2, 0.05, 1.5]).passed, true);
  assert.equal(shapeProfileCheck([8, 0, 6], [2, 0.5, 1.5]).passed, false);
  assert.equal(shapeProfileCheck([8, 0, 6], [1, 0.02, 2]).passed, false);
});

test("legacy fit restores height, grounds Y, and centers X/Z", () => {
  const source = { min: [-2, 0, -3], max: [2, 6, 3] };
  const candidate = { min: [-1, -1, -0.5], max: [1, 1, 0.5] };
  const result = addLegacyFitRoot(documentWithSize([2, 2, 1]), "chair", source, candidate);
  assert.equal(result.scale, 3);
  assert.deepEqual(result.translation, [0, 3, 0]);
  const sceneRoot = result.document.json.nodes[result.document.json.scenes[0].nodes[0]];
  assert.deepEqual(sceneRoot.scale, [3, 3, 3]);
  assert.deepEqual(sceneRoot.children, [0]);
});

test("legacy fit sizes planar assets by footprint and grounds their underside", () => {
  const source = { min: [-4, 0, -3], max: [4, 0, 3] };
  const candidate = { min: [-1, -0.05, -0.75], max: [1, 0.05, 0.75] };
  const result = addLegacyFitRoot(documentWithSize([2, 0.1, 1.5]), "rug", source, candidate);
  assert.equal(result.scale, 4);
  assert.deepEqual(result.translation, [0, 0.2, 0]);
});

test("legacy fit ignores empty auxiliary Blender scenes", () => {
  const document = documentWithSize([2, 2, 1]);
  document.json.scenes.unshift({ name: "empty_authoring_reference" });
  const result = addLegacyFitRoot(
    document,
    "chair",
    { min: [-2, 0, -3], max: [2, 6, 3] },
    { min: [-1, -1, -0.5], max: [1, 1, 0.5] },
  );
  assert.deepEqual(result.document.json.scenes[0], { name: "empty_authoring_reference" });
  assert.equal(result.document.json.scenes[1].nodes.length, 1);
});

test("placement envelope calibration is bounded and moves a clean-room asset inside its gate", () => {
  const candidate = { min: [-0.5, -0.372, -0.372], max: [0.5, 0.372, 0.372] };
  const result = addPlacementEnvelopeCalibration(
    documentWithSize([1, 0.744, 0.744]),
    "chest",
    [2.51, 2.44, 3.76],
    candidate,
    0.3,
  );
  assert.equal(result.changed, true);
  assert.equal(result.scale.every((value) => value >= 2 / 3 && value <= 1.5), true);
  assert.equal(shapeProfileCheck([2.51, 2.44, 3.76], result.effectiveSize, 0.3).passed, true);
  const wrapper = result.document.json.nodes[result.document.json.scenes[0].nodes[0]];
  assert.deepEqual(wrapper.children, [0]);
  assert.equal(wrapper.extras.requiemPlacementEnvelope, "bounded-thematic-fit-v1");
});

test("geometry gate counts indexed triangles and complete PBR bindings", () => {
  const summary = geometrySummary(documentWithSize([2, 3, 4]));
  assert.equal(summary.triangleCount, 12);
  assert.equal(summary.indexedTriangles, true);
  assert.equal(summary.finiteGeometry, true);
  assert.equal(summary.everyPrimitiveTextured, true);
  assert.equal(summary.everyPrimitiveNormalMapped, true);
  assert.equal(summary.everyPrimitiveMetallicRoughnessMapped, true);
});

test("static Qeynos2 manifests require generated first-pass cleanup with no fallback", () => {
  const ids = [];
  for (let index = 1; index <= 11; index++) {
    const number = String(index).padStart(2, "0");
    const manifest = JSON.parse(fs.readFileSync(path.join(
      repoRoot,
      `assets/src/world/objects/replacements/qeynos2-pass-02-${number}.json`,
    )));
    assert.equal(manifest.generationPolicy.requiredCandidateKind, "generated-first-pass-clean");
    assert.deepEqual(manifest.generationPolicy.fallbackCandidateKinds, []);
    assert.equal(manifest.generationPolicy.source, "generated-shape-glb-automated-cleanup");
    assert.equal(manifest.generationPolicy.legacyImageConditioning, false);
    assert.equal(manifest.generationPolicy.designMode,
      "clean-room-generated-first-pass-refinement");
    assert.equal(manifest.firstPassCleanup.automatic, true);
    assert.equal(manifest.firstPassCleanup.sourcePolicy,
      "generated-shape-plus-numeric-placement-envelope-no-rof2-geometry-pixels-uvs-or-textures");
    assert.equal(manifest.firstPassCleanup.materialPolicy,
      "independent-deterministic-procedural-v1");
    for (const asset of manifest.assets) {
      ids.push(asset.id);
      assert.equal(asset.candidate.kind, "generated-first-pass-clean");
      assert.equal(asset.candidate.file,
        `assets/src/world/objects/replacements/first-pass-clean/${asset.id}/final.glb`);
      assert.match(asset.candidate.sha256, /^[a-f0-9]{64}$/);
      assert.match(asset.candidate.source.sha256, /^[a-f0-9]{64}$/);
      assert.equal(asset.candidate.automation.placementNormalization.policy,
        "numeric-placement-envelope-baked-before-cleanup-v1");
    }
  }
  assert.equal(ids.length, 41);
  assert.equal(new Set(ids).size, 41);
  assert.equal(ids.includes("templelife"), false);
  assert.equal(ids.includes("templelifeb"), false);
  assert.equal(ids.includes("qeyflag"), false);
});
