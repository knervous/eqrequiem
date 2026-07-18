#!/usr/bin/env node

import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { NodeIO } from "@gltf-transform/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import * as BABYLON from "@babylonjs/core/index.js";
import sharp from "sharp";

import "@babylonjs/loaders/glTF/index.js";

const clientRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(clientRoot, "..");
const sourcePath = path.resolve(
  process.argv[2] ??
    path.join(
      repoRoot,
      "assets/src/models/human_male/eqref/human_male_locomotion_v10_pbr.glb",
    ),
);
const model = (process.argv[3] ?? (sourcePath.includes("human_female") ? "huf" : "hum")).toLowerCase();
const publicRoot = path.join(clientRoot, "public", "eqrequiem");
const buildRoot = path.join(clientRoot, ".runtime-model-build");
const runtimeGlbPath = path.join(buildRoot, "models", `${model}.glb`);
const materialName = `${model}ch0000`;
const fps = 30;
const runtimeTargetHeight = 6;
const runtimeYawCorrection = -Math.PI / 2;

if (!(await fs.pathExists(sourcePath))) {
  throw new Error(`Human model not found: ${sourcePath}`);
}

await fs.remove(buildRoot);
await fs.ensureDir(path.dirname(runtimeGlbPath));

const io = new NodeIO();
const document = await io.read(sourcePath);
const root = document.getRoot();
const modelNode = root.listNodes().find((node) => node.getMesh());
const mesh = modelNode?.getMesh();
if (!modelNode || !mesh) {
  throw new Error("The human GLB does not contain a mesh node");
}

modelNode.setName(model);
modelNode.setExtras({
  ...modelNode.getExtras(),
  model,
  piece: "ch",
  variation: "00",
  texNum: "00",
  secondaryMeshes: 0,
});
mesh.setName(`${model}_mesh`);
mesh.setExtras({
  ...mesh.getExtras(),
  model,
  piece: "ch",
  variation: "00",
  texNum: "00",
});

const material = root.listMaterials()[0];
if (!material) {
  throw new Error("The human GLB does not contain a material");
}
material.setName(materialName);
await io.write(runtimeGlbPath, document);

const engine = new NullEngine();
const scene = new Scene(engine);
scene.activeCamera = new BABYLON.FreeCamera(
  "runtime_export_camera",
  new BABYLON.Vector3(0, 0, -10),
  scene,
);

const runtimeBytes = await fs.readFile(runtimeGlbPath);
const dataUrl = `data:model/gltf-binary;base64,${runtimeBytes.toString("base64")}`;
const imported = await BABYLON.ImportMeshAsync(dataUrl, scene, {
  pluginExtension: ".glb",
});
if (!imported.animationGroups.length || !imported.skeletons.length) {
  throw new Error("The human GLB must contain a skeleton and animation clips");
}

const animatedMeshes = imported.meshes.filter(
  (candidate) => candidate.getTotalVertices() > 0,
);
const totalVertices = animatedMeshes.reduce(
  (total, candidate) => total + candidate.getTotalVertices(),
  0,
);
if (totalVertices > 5000) {
  throw new Error(
    `Runtime human exceeds the 5,000 vertex budget (${totalVertices})`,
  );
}

const mergedForBounds = BABYLON.Mesh.MergeMeshes(
  animatedMeshes.map((candidate) => candidate.clone()),
  true,
  true,
  undefined,
  false,
  true,
);
mergedForBounds.refreshBoundingInfo(true);
const bounds = mergedForBounds.getBoundingInfo().boundingBox;
const sourceBoundingBox = {
  min: bounds.minimumWorld.asArray(),
  max: bounds.maximumWorld.asArray(),
  center: bounds.centerWorld.asArray(),
  yOffset: 0,
};
mergedForBounds.dispose();

const sourceHeight = sourceBoundingBox.max[1] - sourceBoundingBox.min[1];
const runtimeScale = runtimeTargetHeight / sourceHeight;
const runtimeAlignment = BABYLON.Matrix.Scaling(
  runtimeScale,
  runtimeScale,
  runtimeScale,
).multiply(BABYLON.Matrix.RotationY(runtimeYawCorrection));
const alignedCorners = [];
for (const x of [sourceBoundingBox.min[0], sourceBoundingBox.max[0]]) {
  for (const y of [sourceBoundingBox.min[1], sourceBoundingBox.max[1]]) {
    for (const z of [sourceBoundingBox.min[2], sourceBoundingBox.max[2]]) {
      alignedCorners.push(
        BABYLON.Vector3.TransformCoordinates(
          new BABYLON.Vector3(x, y, z),
          runtimeAlignment,
        ),
      );
    }
  }
}
const alignedMin = new BABYLON.Vector3(
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
);
const alignedMax = new BABYLON.Vector3(
  Number.NEGATIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
);
for (const corner of alignedCorners) {
  alignedMin.minimizeInPlace(corner);
  alignedMax.maximizeInPlace(corner);
}
const boundingBox = {
  min: alignedMin.asArray(),
  max: alignedMax.asArray(),
  center: BABYLON.Vector3.Center(alignedMin, alignedMax).asArray(),
  yOffset: 0,
};

const mergedMesh = BABYLON.Mesh.MergeMeshes(
  animatedMeshes,
  true,
  true,
  undefined,
  true,
  true,
);
if (!mergedMesh) {
  throw new Error("Unable to merge the human mesh for VAT baking");
}
const skeleton = imported.skeletons[0];
mergedMesh.skeleton = skeleton;

const animations = [];
const animationFrames = new Map();
let frameOffset = 0;
for (const group of imported.animationGroups) {
  const engineFps =
    group.targetedAnimations[0]?.animation.framePerSecond ?? fps;
  const frameStep = engineFps / fps;
  const frames = [];
  for (let frame = group.from; frame <= group.to + 1e-6; frame += frameStep) {
    frames.push(frame);
  }
  animationFrames.set(group, frames);
  const frameCount = frames.length;
  animations.push({
    name: group.name,
    from: frameOffset,
    to: frameOffset + frameCount - 1,
    fps,
  });
  frameOffset += frameCount;
}

const floatsPerFrame = (skeleton.bones.length + 1) * 16;
const vat16 = new Uint16Array(floatsPerFrame * frameOffset);
const vat32 = new Float32Array(floatsPerFrame * frameOffset);
let bakedFrame = 0;
for (const group of imported.animationGroups) {
  skeleton.returnToRest();
  group.reset();
  group.play(true);
  group.pause();
  for (const frame of animationFrames.get(group)) {
    group.goToFrame(frame);
    // NullEngine's scene.render() advances its own animatable clock by a
    // fixed per-call delta and overwrites the pose goToFrame just set
    // (confirmed: goToFrame alone matches the source curve exactly; adding
    // a render() call afterward stomps it back toward bind pose). Force the
    // matrix recompute directly instead of rendering a frame. prepare() is
    // required too: it's the step that copies each bone's rotation/position
    // from its linked TransformNode (the actual animation target) into the
    // Bone object itself; computeAbsoluteMatrices alone reads stale/rest
    // values for any bone that hasn't been synced this way.
    skeleton.prepare(true);
    mergedMesh.computeWorldMatrix(true);
    skeleton.computeAbsoluteMatrices(true);
    const matrices = skeleton.getTransformMatrices(mergedMesh);
    const base = bakedFrame * floatsPerFrame;
    for (let matrixOffset = 0; matrixOffset < matrices.length; matrixOffset += 16) {
      const alignedMatrix = BABYLON.Matrix.FromArray(
        matrices,
        matrixOffset,
      ).multiply(runtimeAlignment);
      alignedMatrix.m.forEach((value, index) => {
        vat16[base + matrixOffset + index] = BABYLON.ToHalfFloat(value);
        vat32[base + matrixOffset + index] = value;
      });
    }
    bakedFrame++;
  }
  group.stop();
}

const strippedDocument = await io.read(runtimeGlbPath);
for (const animation of strippedDocument.getRoot().listAnimations()) {
  animation.dispose();
}
for (const texture of strippedDocument.getRoot().listTextures()) {
  texture.setImage(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  texture.setMimeType("image/png");
}
const strippedBytes = await io.writeBinary(strippedDocument);

const exportEngine = new NullEngine();
const exportScene = new Scene(exportEngine);
exportScene.activeCamera = new BABYLON.FreeCamera(
  "lean_export_camera",
  new BABYLON.Vector3(0, 0, -10),
  exportScene,
);
const strippedUrl = `data:model/gltf-binary;base64,${Buffer.from(strippedBytes).toString("base64")}`;
await BABYLON.ImportMeshAsync(strippedUrl, exportScene, {
  pluginExtension: ".glb",
});
const serializedScene = BABYLON.SceneSerializer.Serialize(exportScene);
const metadata = {
  gltf: {
    extras: {
      animationRanges: animations,
      boundingBox,
      model,
      piece: "ch",
      variation: "00",
      texNum: "00",
      secondaryMeshes: 0,
      sourceHeight,
      runtimeTargetHeight,
      runtimeScale,
      runtimeYawCorrection,
      // GLTFLoader has already converted the source primitive to Babylon's
      // winding convention. Legacy EQ bundles require a runtime flip, but this
      // generated asset must retain its imported index order.
      preserveRuntimeWinding: true,
    },
  },
};
for (const node of serializedScene.transformNodes ?? []) {
  node.metadata = {
    ...(node.metadata ?? {}),
    ...metadata,
  };
}
for (const serializedMesh of serializedScene.meshes ?? []) {
  if (serializedMesh.geometryId) {
    serializedMesh.metadata = {
      ...(serializedMesh.metadata ?? {}),
      ...metadata,
    };
    serializedMesh.materialId = serializedScene.materials?.[0]?.id;
  }
}

const babylonBytes = Buffer.from(JSON.stringify(serializedScene));
await fs.ensureDir(path.join(publicRoot, "babylon"));
await fs.ensureDir(path.join(publicRoot, "vat"));
await fs.ensureDir(path.join(publicRoot, "basis"));
await fs.writeFile(
  path.join(publicRoot, "babylon", `${model}.babylon.gz`),
  gzipSync(babylonBytes, { level: 9 }),
);
await fs.writeFile(
  path.join(publicRoot, "vat", `${model}.bin.gz`),
  gzipSync(Buffer.from(vat16.buffer), { level: 9 }),
);
await fs.writeFile(
  path.join(publicRoot, "vat", `${model}_32.bin.gz`),
  gzipSync(Buffer.from(vat32.buffer), { level: 9 }),
);
await fs.writeJson(
  path.join(publicRoot, "vat", `${model}.json`),
  { schemaVersion: 1, fps, animations },
  { spaces: 2 },
);

const atlasPng = path.join(buildRoot, `${materialName}.png`);
// Select by semantic role (baseColorTexture), not array position: texture
// export order isn't guaranteed to put baseColor first, and a Blender
// re-export can reorder textures so listTextures()[0] silently picks up the
// normal map or another channel instead.
const sourceTexture = material.getBaseColorTexture()?.getImage();
if (sourceTexture) {
  await sharp(sourceTexture)
    .resize({ width: 512, height: 512, fit: "fill" })
    .removeAlpha()
    .png()
    .toFile(atlasPng);
} else {
  const fallback = material.getBaseColorFactor().map((value) =>
    Math.max(0, Math.min(255, Math.round(value * 255))),
  );
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 3,
      background: { r: fallback[0], g: fallback[1], b: fallback[2] },
    },
  }).png().toFile(atlasPng);
}

const basisPath = path.join(publicRoot, "basis", `${model}.basis`);
execFileSync(
  "npx",
  [
    "--yes",
    "basisu",
    atlasPng,
    "-output_file",
    basisPath,
    "-tex_type",
    "2darray",
  ],
  {
    cwd: clientRoot,
    env: {
      ...process.env,
      npm_config_cache: path.join(os.tmpdir(), "eqrequiem-npx-cache"),
    },
    stdio: "inherit",
  },
);
await fs.writeJson(
  path.join(publicRoot, "basis", `${model}.json`),
  [materialName],
  { spaces: 2 },
);
// A deterministic RGBA preview copy lets developer tooling exercise the real
// Shado/VAT material without bundling a second Basis transcoder implementation.
await fs.writeFile(
  path.join(publicRoot, "basis", `${model}.rgba`),
  await sharp(atlasPng).ensureAlpha().raw().toBuffer(),
);

engine.dispose();
exportEngine.dispose();
await fs.remove(buildRoot);

console.log(
  `Installed ${model} runtime: ${totalVertices} vertices, ${skeleton.bones.length} bones, ${animations.length} clips at ${fps} FPS`,
);
