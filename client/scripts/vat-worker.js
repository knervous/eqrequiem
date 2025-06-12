import { parentPort, workerData } from "worker_threads";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import * as BABYLON from "@babylonjs/core/index.js";
import "@babylonjs/loaders/glTF/2.0/index.js";
import fs from "fs-extra";
import path from "path";

(async () => {
  const { folder, file, rootPath } = workerData;
  const outputDir = path.join(rootPath, "vat");

  parentPort.postMessage(`Worker processing ${file}`);

  const modelPath = path.join(folder, file);
  const fileBuffer = await fs.readFile(modelPath);
  const dataUrl = `data:model/gltf-binary;base64,${fileBuffer.toString("base64")}`;

  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera(
    "camera",
    new BABYLON.Vector3(0, 0, -10),
    scene,
  );
  scene.activeCamera = camera;

  const { meshes, animationGroups, skeletons } = await BABYLON.ImportMeshAsync(
    dataUrl,
    scene,
  );

  if (!animationGroups.length || !skeletons.length) {
    parentPort.postMessage(`No animations or skeletons in ${file}`);
    parentPort.close();
    return;
  }

  // Merge meshes
  const mesh = BABYLON.Mesh.MergeMeshes(
    meshes.filter((m) => m.getTotalVertices() > 0),
    true,
    true,
    undefined,
    true,
    true,
  );
  mesh.skeleton = skeletons[0];

  // Compute animation ranges
  const ranges = [];
  let offset = 0;
  for (const ag of animationGroups) {
    const fromFrame = Math.floor(ag.from);
    const toFrame = Math.floor(ag.to);
    const count = toFrame - fromFrame + 1;
    ranges.push({ name: ag.name, from: offset, to: offset + count - 1 });
    offset += count;
  }

  // Bake vertex data
  const skeleton = mesh.skeleton;
  const floatsPerFrame = (skeleton.bones.length + 1) * 16;
  const totalFrames = ranges.reduce((sum, r) => sum + (r.to - r.from + 1), 0);
  const vertexData = new Uint16Array(floatsPerFrame * totalFrames);

  let frameIdx = 0;
  for (const ag of animationGroups) {
    skeleton.returnToRest();
    ag.reset();
    ag.play(true);
    ag.pause();

    for (let f = Math.floor(ag.from); f <= Math.floor(ag.to); f++) {
      ag.goToFrame(f);
      scene.render();
      skeleton.computeAbsoluteMatrices(true);
      const matrices = skeleton.getTransformMatrices(mesh);
      const base = frameIdx * floatsPerFrame;
      matrices.forEach((val, i) => {
        vertexData[base + i] = BABYLON.ToHalfFloat(val);
      });
      frameIdx++;
    }
    ag.stop();
  }

  // Write outputs
  await fs.ensureDir(outputDir);
  const baseName = path.basename(file, ".glb");

  // Binary VAT
  await fs.writeFile(
    path.join(outputDir, `${baseName}.bin`),
    Buffer.from(vertexData.buffer),
  );

  // JSON ranges
  await fs.writeJson(
    path.join(outputDir, `${baseName}.json`),
    { animations: ranges },
    { spaces: 2 },
  );

  engine.dispose();
  parentPort.postMessage(`Finished ${file}`);
  parentPort.close();
})();
