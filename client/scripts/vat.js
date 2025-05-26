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
  const modelPath = path.join(folder, file);
  const fileBuffer = fs.readFileSync(modelPath);
  const base64String = fileBuffer.toString("base64");
  const dataUrl = `data:model/gltf-binary;base64,${base64String}`;
  
  const { meshes, animationGroups, skeletons } =
    await BABYLON.SceneLoader.ImportMeshAsync(
      null, // Import all meshes
      "", // Root URL (empty since we're using a data URI)
      dataUrl, // Base64 data URI
      scene,
    );

  if (!animationGroups || animationGroups.length === 0) {
    console.log(`No animation groups found for model ${file}`);
    return;
  }

  if (!skeletons || skeletons.length === 0) {
    console.log(`No skeletons found for model ${file}`);
    return;
  }

  const baker = new BABYLON.VertexAnimationBaker(scene, skeletons[0], {
    bakeTransformations: true,
  });

  // Process animation groups and normalize frame ranges
  const ranges = animationGroups.map((group) => {
    return {
      name: group.name,
      from: group.from,
      to: group.to,
    };
  });

  if (ranges.length === 0) {
    console.log(`No valid animation ranges found for model ${file}`);
    return;
  }

  console.log(`Update static anim: ${file}`);
  // Bake vertex data with the specified FPS
  const vatData = await baker.bakeVertexData(ranges, targetFps);
  const modelFile = file.replace(".glb", "");
  console.log(`Exporting ${modelFile}...`);

  await fs.ensureDir(outputDir);
  await fs.writeFile(
    path.join(outputDir, `${modelFile}.bin`),
    Buffer.from(vatData.buffer),
  );

  console.log(`VAT export complete for ${modelFile}.`);
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
