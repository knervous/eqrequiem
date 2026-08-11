import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import "@babylonjs/loaders/glTF/index.js";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(clientRoot, "..");
const SCENE_MANIFEST = "requiem-character-select.json";
const manifestPath = path.join(
  clientRoot,
  `public/eqrequiem/scenes/${SCENE_MANIFEST}`,
);
const reportPath = path.join(
  repoRoot,
  "assets/generated/world/character-select/requiem-character-select.build.json",
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const bindingsSource = await readFile(
  path.join(clientRoot, "src/Core/bindings.ts"),
  "utf8",
);
const environmentSource = await readFile(
  path.join(clientRoot, "src/Game/Zone/character-select-environment.ts"),
  "utf8",
);
const playerSource = await readFile(
  path.join(clientRoot, "src/Game/Player/player.ts"),
  "utf8",
);
const entitySource = await readFile(
  path.join(clientRoot, "src/Game/Model/entity.ts"),
  "utf8",
);
const characterSelectSource = await readFile(
  path.join(clientRoot, "src/Game/Zone/character-select.ts"),
  "utf8",
);
const characterSelectUiSource = await readFile(
  path.join(clientRoot, "src/UI/components/character-select/index.tsx"),
  "utf8",
);
const characterCreateUiSource = await readFile(
  path.join(clientRoot, "src/UI/components/character-select/char-create.tsx"),
  "utf8",
);
const characterSelectCssSource = await readFile(
  path.join(clientRoot, "src/UI/components/character-select/component.css"),
  "utf8",
);

function parseGlb(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  const jsonChunkLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  return JSON.parse(
    bytes.toString("utf8", 20, 20 + jsonChunkLength).trimEnd(),
  );
}

test("character-select manifest is an identity presentation contract", () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.coordinateContract, "gltf-y-up-identity");
  assert.equal(manifest.name, "Wayfarer's Verge");
  assert.equal(manifest.character.gravity, false);
  assert.equal(manifest.character.collision, false);
  assert.ok(manifest.camera.orbitDurationSeconds >= 120);
  assert.equal(manifest.camera.driftDegrees, undefined);
  assert.equal(new Set(Object.values(manifest.semantics)).size, 8);
  assert.equal(report.coordinateContract, manifest.coordinateContract);
  assert.deepEqual(report.semantics, manifest.semantics);
  assert.ok(
    bindingsSource.includes(
      `"eqrequiem/scenes/${manifest.asset}"`,
    ),
    "uncompressed request identity must route to the bundled gzip",
  );
  assert.ok(
    bindingsSource.includes(
      `"eqrequiem/scenes/${SCENE_MANIFEST}"`,
    ),
    "scene manifest must route to the bundled public asset",
  );
});

test("compressed GLB contains every semantic and an identity authored root", async () => {
  const compressed = await readFile(
    path.join(
      clientRoot,
      "public/eqrequiem/scenes/requiem-character-select.glb.gz",
    ),
  );
  assert.equal(compressed[0], 0x1f);
  assert.equal(compressed[1], 0x8b);
  const gltf = parseGlb(gunzipSync(compressed));
  const nodes = new Map(gltf.nodes.map((node) => [node.name, node]));

  for (const semantic of Object.values(manifest.semantics)) {
    assert.ok(nodes.has(semantic), `missing semantic node '${semantic}'`);
  }
  const root = nodes.get(manifest.semantics.root);
  assert.equal(root.translation, undefined);
  assert.equal(root.rotation, undefined);
  assert.equal(root.scale, undefined);
  assert.ok((gltf.images?.length ?? 0) >= 2);
  assert.ok((gltf.textures?.length ?? 0) >= 2);
  assert.ok(
    gltf.meshes
      .flatMap((mesh) => mesh.primitives)
      .some((primitive) => primitive.attributes.COLOR_0 !== undefined),
    "authored vertex-color variation must survive export",
  );
});

test("ambient presentation orbits the camera and owns observer cleanup", () => {
  assert.ok(environmentSource.includes("configureAmbientOrbit()"));
  assert.ok(environmentSource.includes("onBeforeRenderObservable.add"));
  assert.ok(environmentSource.includes("onBeforeRenderObservable.remove"));
  assert.ok(environmentSource.includes("orbitDurationSeconds"));
  assert.ok(environmentSource.includes("horizontalCompositionOffset"));
  assert.ok(environmentSource.includes("Math.PI * 2 * deltaSeconds"));
  assert.ok(environmentSource.includes("createAmbientMotes()"));
});

test("character preview is render-only and preserves its authored anchor", () => {
  assert.ok(characterSelectSource.includes("await this.initialize()"));
  assert.ok(characterSelectSource.includes("EntityCache.initialize("));
  assert.ok(characterSelectSource.includes("disableCulling: true"));
  assert.ok(characterSelectSource.includes("nameplateDepthTest: false"));
  assert.ok(
    characterSelectSource.indexOf("EntityCache.initialize(") <
      characterSelectSource.indexOf(
        "this.initializePromise = this.environment.initialize()",
      ),
  );
  assert.ok(playerSource.includes("renderOnly: fromCharSelect"));
  assert.ok(entitySource.includes("this.isPlayer && !this.renderOnly"));
  assert.ok(playerSource.includes("presentationScale: fromCharSelect ? 0.9 : 1"));
  assert.ok(
    entitySource.includes(
      "await this.instantiateNameplate([this.spawn.name.replaceAll",
    ),
  );
  assert.ok(!entitySource.includes("if (this.renderOnly) return;"));
  assert.ok(
    entitySource.includes(
      "if (this.renderOnly) this.position.copyFrom(this.spawnPosition)",
    ),
  );
  assert.ok(characterSelectSource.includes('fromCharCreate ? [] : [player.name || "Wayfarer"]'));
  assert.ok(characterCreateUiSource.includes("rq-character-create__preview-nameplate"));
  assert.ok(!characterCreateUiSource.includes("Player.instance?.UpdateNameplate"));
});

test("character roster is a compact single-action composition", () => {
  assert.ok(characterSelectUiSource.includes("Choose your wayfarer"));
  assert.ok(characterSelectUiSource.includes("Create a new wayfarer"));
  assert.ok(!characterSelectUiSource.includes("Array.from({ length: charSelectNum"));
  assert.ok(characterSelectCssSource.includes("right: 24px"));
  assert.ok(characterSelectCssSource.includes("backdrop-filter: blur"));
});

test("authored sky is normalized as a camera-visible unlit backdrop", () => {
  assert.ok(environmentSource.includes('startsWith("CS Atmosphere · Sky")'));
  assert.ok(environmentSource.includes("material.emissiveColor.copyFrom"));
  assert.ok(environmentSource.includes("mesh.alwaysSelectAsActiveMesh = true"));
  assert.ok(environmentSource.includes(
    'this.runtimeSky.createSky("requiem-sky", true)',
  ));
  assert.ok(environmentSource.includes("this.runtimeSky?.tick("));
});

test("Babylon activates the real payload and resolves authored poses", async () => {
  const compressed = await readFile(
    path.join(
      clientRoot,
      "public/eqrequiem/scenes/requiem-character-select.glb.gz",
    ),
  );
  const bytes = gunzipSync(compressed);
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const container = await LoadAssetContainerAsync(
    `data:application/octet-stream;base64,${bytes.toString("base64")}`,
    scene,
    { pluginExtension: ".glb" },
  );
  try {
    container.addAllToScene();
    const allNodes = [...container.transformNodes, ...container.meshes];
    const resolve = (name) => {
      const node = allNodes.find((candidate) => candidate.name === name);
      assert.ok(node, `Babylon did not resolve '${name}'`);
      node.computeWorldMatrix(true);
      return node;
    };
    const character = resolve(manifest.semantics.character);
    const camera = resolve(manifest.semantics.camera);
    const faceCamera = resolve(manifest.semantics.faceCamera);
    resolve(manifest.semantics.cameraTarget);
    resolve(manifest.semantics.faceTarget);
    resolve(manifest.semantics.classFx);
    resolve(manifest.semantics.sky);

    assert.ok(camera.getAbsolutePosition().z > character.getAbsolutePosition().z);
    assert.ok(
      faceCamera.getAbsolutePosition().z <
        camera.getAbsolutePosition().z,
      "face camera should be the closer authored pose",
    );
    assert.ok(container.meshes.some((mesh) => mesh.getTotalVertices() > 0));
    assert.ok(container.materials.length >= 8);
  } finally {
    container.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("canonical Blender source and production review are retained", async () => {
  await Promise.all([
    readFile(
      path.join(
        repoRoot,
        "assets/src/world/character-select/character-select.blend",
      ),
    ),
    readFile(path.join(repoRoot, report.review)),
    readFile(path.join(repoRoot, report.asset)),
    ...report.reviews.orbit.map((review) =>
      readFile(path.join(repoRoot, review)),
    ),
    readFile(path.join(repoRoot, report.reviews.clay)),
    readFile(path.join(repoRoot, report.reviews.wireframe)),
    readFile(path.join(repoRoot, "client/public/eltania/terrain/character-select/control0.png")),
    ...["grass-albedo.webp", "grass-mr.webp", "dirt-albedo.webp", "dirt-mr.webp", "rock-albedo.webp", "rock-mr.webp"].map(
      (name) => readFile(path.join(repoRoot, "client/public/eltania/terrain/character-select", name)),
    ),
  ]);
  assert.ok(report.triangles > 8_000);
  assert.ok(report.triangles < 500_000);
  assert.ok(report.estimatedDrawGroups <= 250);
  assert.ok(report.meshCount <= 250);
  assert.equal(report.terrain.grassClumps, 20000);
  assert.equal(report.terrain.horizonRidges, 2);
  assert.equal(report.terrain.runtimeShader, "requiemTerrainSurface");
  assert.equal(report.treeVariation.species, 5);
  assert.equal(report.treeVariation.linkedInstances, 108);
  assert.deepEqual(report.backgroundLandmarks, ["stone_church", "cottage_blue_roof"]);
  assert.equal(report.settlementLights, 4);
  assert.deepEqual(report.materialsMissingTextures, []);
  assert.deepEqual(report.meshesMissingUvs, []);
  for (const [materialName, textures] of Object.entries(
    report.pbrTextureCoverage,
  )) {
    if (materialName.startsWith("CS Atmosphere ·")) continue;
    const requiredTextureCount = materialName.startsWith("CS ") ? 3 : 1;
    assert.ok(textures.length >= requiredTextureCount, `${materialName} must retain its authored PBR textures`);
  }
  assert.equal(report.negativeScaleObjects.length, 0);
  assert.deepEqual(report.unappliedModifiers, {});
  assert.ok(report.materials >= 8);
});
