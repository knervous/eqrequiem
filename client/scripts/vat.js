// src/scripts/vat.js
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import * as BABYLON from "@babylonjs/core/index.js";
import "@babylonjs/loaders/glTF/2.0/index.js";
import fs from "fs-extra";
import path from "path";
import pLimit from "p-limit";
const rootPath = process.argv[2] || process.cwd();
const CONCURRENCY_LIMIT = 8;

if (!rootPath) {
  console.error("Please provide a root path.");
  process.exit(1);
}

const bakeVertexData = async function (mesh, ags) {
  const s = mesh.skeleton;
  const boneCount = s.bones.length;
  /** total number of frames in our animations */
  const frameCount = ags.reduce(
    (acc, ag) => acc + (Math.floor(ag.to) - Math.floor(ag.from)) + 1,
    0,
  );

  // reset our loop data
  let textureIndex = 0;
  const textureSize = (boneCount + 1) * 4 * 4 * frameCount;
  const vertexData = new Float32Array(textureSize);

  function* captureFrame() {
    const skeletonMatrices = s.getTransformMatrices(mesh);
    vertexData.set(skeletonMatrices, textureIndex * skeletonMatrices.length);
  }

  let ii = 0;
  for (const ag of ags) {
    ag.reset();
    const from = Math.floor(ag.from);
    const to = Math.floor(ag.to);
    for (let frameIndex = from; frameIndex <= to; frameIndex++) {
      if (ii++ === 0) continue;
      // start anim for one frame
      ag.start(false, 1, frameIndex, frameIndex, false);
      // wait for finishing
      await ag.onAnimationEndObservable.runCoroutineAsync(captureFrame());
      textureIndex++;
      // stop anim
      ag.stop();
    }
  }

  return vertexData;
};

const modelFolder = path.join(rootPath, "models");
const objectsFolder = path.join(rootPath, "objects");
const outputDir = path.join(rootPath, "vat");

const modelFiles = fs
  .readdirSync(modelFolder)
  .filter((file) => file.endsWith(".glb"));
const objectsFiles = fs
  .readdirSync(objectsFolder)
  .filter((file) => file.endsWith(".glb"));

const allFiles = [
  ...modelFiles.map((file) => ({ folder: modelFolder, file })),
  ...objectsFiles.map((file) => ({ folder: objectsFolder, file })),
];

const limit = pLimit(CONCURRENCY_LIMIT);
const targetFps = 60;

const engine = new NullEngine({
  deterministicLockstep: true,
  lockstepMaxSteps: 1,
  timeStep: 1 / targetFps, // 33.333ms per simulation step
});
const scene = new Scene(engine);
const camera = new FreeCamera("camera", new BABYLON.Vector3(0, 0, -10), scene);

const interval = 1000 / targetFps;
let lastTime = Date.now();

scene.activeCamera = camera;
engine.runRenderLoop(() => {
  const now = Date.now();
  const delta = now - lastTime;

  if (delta >= interval) {
    // advance by however much we overshot, so we stay in sync
    lastTime = now - (delta % interval);
    scene.render();
  }
});

const processFiles = async () => {
  const tasks = allFiles.map(({ folder, file }) =>
    limit(() =>
      outputVat(folder, file).catch((err) => {
        // console.error(`Error processing ${file}:`, err);
      }),
    ),
  );

  await Promise.all(tasks);
  console.log("All VAT processing complete.");
};

async function outputVat(folder, file) {
  console.log(`Processing file: ${file} from folder: ${folder}`);
  const modelPath = path.join(folder, file);
  const fileBuffer = fs.readFileSync(modelPath);
  const base64String = fileBuffer.toString("base64");
  const dataUrl = `data:model/gltf-binary;base64,${base64String}`;
  const { meshes, animationGroups, skeletons } = await BABYLON.ImportMeshAsync(
    dataUrl, // Base64 data URI
    scene,
  ).catch((e) => {
    console.error(`Failed to load model ${file}:`, e);
  });

  if (!animationGroups || animationGroups.length === 0) {
    console.log(`No animation groups found for model ${file}`);
    return;
  }

  if (!skeletons || skeletons.length === 0) {
    console.log(`No skeletons found for model ${file}`);
    return;
  }
  const mesh = BABYLON.Mesh.MergeMeshes(
    meshes.filter((m) => m.getTotalVertices() > 0),
    true,
    true,
    undefined,
    true,
    true,
  );
  mesh.skeleton = skeletons[0];

  // Process animation groups and normalize frame ranges
  const ranges = [];
  for (const group of animationGroups) {
    ranges.push({
      name: group.name,
      from: group.from,
      to: group.to,
    });
  }

  if (ranges.length === 0) {
    console.log(`No valid animation ranges found for model ${file}`);
    return;
  }

  return new Promise((res) => {
    bakeVertexData(mesh, animationGroups).then(async (vatData) => {
      const modelFile = file.replace(".glb", "");
      console.log(`Exporting ${modelFile}...`);

      await fs.ensureDir(outputDir);
      await fs.writeFile(
        path.join(outputDir, `${modelFile}.bin`),
        Buffer.from(vatData.buffer),
      );

      console.log(`VAT export complete for ${modelFile}.`);
      res();
    });
  });
}

processFiles()
  .catch((err) => {
    console.error("Error during processing:", err);
    process.exit(1);
  })
  .then(() => {
    engine.dispose();
    console.log("Processing complete. Engine disposed.");
    process.exit(0);
  });
