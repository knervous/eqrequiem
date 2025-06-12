import { Worker } from "worker_threads";
import path from "path";
import pLimit from "p-limit";
import fs from "fs-extra";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import * as BABYLON from "@babylonjs/core/index.js";
import "@babylonjs/loaders/glTF/2.0/index.js";

const rootPath = process.argv[2] || process.cwd();
const CONCURRENCY_LIMIT = 8;

if (!rootPath) {
  console.error("Please provide a root path.");
  process.exit(1);
}

// Collect all .glb files under models/ and objects/
const modelFolder = path.join(rootPath, "models");
const objectsFolder = path.join(rootPath, "objects");

const modelFiles = fs.existsSync(modelFolder)
  ? fs.readdirSync(modelFolder).filter((f) => f.endsWith(".glb"))
  : [];
const objectFiles = fs.existsSync(objectsFolder)
  ? fs.readdirSync(objectsFolder).filter((f) => f.endsWith(".glb"))
  : [];

const allFiles = [
  ...modelFiles.map((file) => ({ folder: modelFolder, file })),
  ...objectFiles.map((file) => ({ folder: objectsFolder, file })),
];

const limit = pLimit(CONCURRENCY_LIMIT);

const engine = new NullEngine();
const scene = new Scene(engine);
const camera = new FreeCamera("camera", new BABYLON.Vector3(0, 0, -10), scene);
scene.activeCamera = camera;

async function hasAnimationsOrSkeletons(folder, file) {
  const modelPath = path.join(folder, file);
  const fileBuffer = await fs.readFile(modelPath);
  const dataUrl = `data:model/gltf-binary;base64,${fileBuffer.toString("base64")}`;

  try {
    const { animationGroups, skeletons } =
      await BABYLON.ImportMeshAsync(dataUrl, scene);
    const hasContent = animationGroups.length > 0 || skeletons.length > 0;
    return hasContent;
  } catch {
    return false;
  } finally {
  }
}

async function processAll() {
  const tasks = [];
  for (const { folder, file } of allFiles) {
    const hasContent = await hasAnimationsOrSkeletons(folder, file);
    if (!hasContent) {
      console.log(`Skipping ${file}: No animations or skeletons.`);
      continue;
    }
    tasks.push(
      limit(() =>
        runWorker(folder, file).catch((err) => {
          console.error(`Error processing ${file}:`, err);
        }),
      ),
    );
  }

  await Promise.all(tasks);
  console.log("All VAT processing complete.");
}

function runWorker(folder, file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve("scripts", "vat-worker.js"), {
      workerData: { folder, file, rootPath },
    });
    worker.on("message", (msg) => {
      console.log(msg);
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`));
      else resolve();
    });
  });
}

processAll();
