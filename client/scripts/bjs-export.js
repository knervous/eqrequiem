import fs from "fs-extra";
import path from "path";
import pLimit from "p-limit";
import { NodeIO } from "@gltf-transform/core";
import { EXTTextureWebP, KHRMaterialsSpecular } from "@gltf-transform/extensions";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import * as BABYLON from "@babylonjs/core/index.js";
import { dedup, prune } from "@gltf-transform/functions";

import "@babylonjs/loaders/glTF/2.0/index.js";

(async () => {
  // Helper: collect all .glb files recursively under `dir`
  async function collectGlbFiles(dir) {
    let files = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(await collectGlbFiles(fullPath));
      } else if (entry.isFile() && fullPath.toLowerCase().endsWith(".glb")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  // The 1×1 gray RGBA PNG (128,128,128,255), base64-encoded
  const GRAY_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==";
  const grayPixelBuffer = Buffer.from(GRAY_PNG_BASE64, "base64");

  // Ensure the user passed a folder
  const inputRoot = process.argv[2];
  if (!inputRoot) {
    console.error(
      "Usage: node lean-glb-to-babylon.js <folder-containing-GLBs>",
    );
    process.exit(1);
  }

  // Normalize and make sure it exists
  const rootPath = path.resolve(inputRoot);
  if (!(await fs.pathExists(rootPath))) {
    console.error(`Folder not found: ${rootPath}`);
    process.exit(1);
  }

  // Where to write the “lean” versions
  const outputRoot = path.join(rootPath, "..", "babylon");
  await fs.ensureDir(outputRoot);

  // Gather all .glb files under inputRoot
  const allGlbs = await collectGlbFiles(rootPath);
  if (allGlbs.length === 0) {
    console.log(`No .glb files found under ${rootPath}`);
    process.exit(0);
  }

  // Concurrency limiter
  const limit = pLimit(8);

  // Main processing loop
  const tasks = allGlbs.map((filePath) =>
    limit(async () => {
      const relPath = path.relative(rootPath, filePath);
      console.log(`\n→ Processing: ${relPath}`);
      //if (!relPath.toLowerCase().endsWith("rat.glb")) return;

      try {
        // 1) Read the original GLB into a Buffer
        const inputBuffer = await fs.readFile(filePath);
        let boundingBox = {
          min: [
            Number.POSITIVE_INFINITY,
            Number.POSITIVE_INFINITY,
            Number.POSITIVE_INFINITY,
          ],
          max: [
            Number.NEGATIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
          ],
        };

        // 2) HEADLESS-BABYLON: extract animation-group ranges (“from”/“to”)
        let animationRanges = [];
        {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, -10),
            scene,
          );
          scene.useRightHandedSystem = true;

          const base64 = inputBuffer.toString("base64");
          const dataUrl = `data:model/gltf-binary;base64,${base64}`;

          try {
            const result = await BABYLON.ImportMeshAsync(dataUrl, scene);
            const { animationGroups } = result;

            if (animationGroups && animationGroups.length) {
              animationRanges = animationGroups.map((ag) => ({
                name: ag.name || "",
                from: ag.from,
                to: ag.to,
              }));
            }
            const skeletons = result.skeletons || [];
            const meshes = result.meshes || [];
            if (animationGroups.length && skeletons.length) {
              const idleGroup =
                animationGroups.find((g) => g.name === "pos") ||
                animationGroups[0];
              const skel = skeletons[0];

              // switch meshes to CPU skinning and bind the skeleton
              meshes.forEach((m) => {
                m.computeBonesUsingShaders = false;
                m.skeleton = skel;
              });

              // jump to frame `idleGroup.from`
              scene.beginAnimation(
                skel,
                idleGroup.from,
                idleGroup.from,
                false,
                1,
              );
              scene.render(); // force one CPU-skinning pass
              scene.stopAnimation(skel);

              const skelBB = {
                min: new BABYLON.Vector3(
                  Number.POSITIVE_INFINITY,
                  Number.POSITIVE_INFINITY,
                  Number.POSITIVE_INFINITY,
                ),
                max: new BABYLON.Vector3(
                  Number.NEGATIVE_INFINITY,
                  Number.NEGATIVE_INFINITY,
                  Number.NEGATIVE_INFINITY,
                ),
              };
              const rootMesh = BABYLON.Mesh.MergeMeshes(
                meshes.filter(m => m.getTotalVertices() > 0),
                true,
                true,
                undefined,
                false,
                true,
              );

              skel.computeAbsoluteMatrices(true);
              // For each bone, grab its world‐space head position…
              skel.bones.forEach((bone) => {
                const absMat = bone.getAbsoluteMatrix(); // bone→world matrix
                const headPos = absMat.getTranslation(); // origin of the bone in world space

                skelBB.min.minimizeInPlace(headPos);
                skelBB.max.maximizeInPlace(headPos);
              });

                            // Get PE offset and normalize
              const peBone = skel.bones.find((b) => b.name === "pe");
              let yOffset = 0;
              if (peBone) { 
                const localY = peBone._localPosition.y;
                skelBB.min.y -= localY;
                skelBB.max.y -= localY;
                yOffset = localY;
              }
              rootMesh.refreshBoundingInfo(true);
               const bb = rootMesh.getBoundingInfo().boundingBox;
               const center  = bb.center.asArray();
              const min = bb.minimum.asArray().map((v, i) => v - center[i]); 
              const max = bb.maximum.asArray().map((v, i) => v - center[i]);
              boundingBox = {
                min,
                max,
                yOffset,
              }
               
              // Compute bounding box for the root mesh
              // meshes.forEach((m) => {
              //   // Compute bounding box for each mesh
              //   const meshBB = m.refreshBoundingInfo(true);
              //   const bb = meshBB.getBoundingInfo().boundingBox;
              //   const stop = 123;
              // });
              

              // boundingBox = {
              //   min: [skelBB.min.x, skelBB.min.y, skelBB.min.z],
              //   max: [skelBB.max.x, skelBB.max.y, skelBB.max.z],
              //   yOffset,
              // };



              // restore GPU skinning
              meshes.forEach((m) => {
                m.computeBonesUsingShaders = true;
                m.skeleton = skel;
              });
            }
          } catch (err) {
            console.warn(
              `  [warning] Babylon failed to load animations for ${relPath}:`,
              err.message,
            );
          } finally {
            scene.dispose();
            engine.dispose();
          }
        }

        // 3) GLTF-TRANSFORM: strip animations, embed `animationRanges` into `extras`,
        //    and replace every texture with a 1×1 gray pixel
        let outputBuffer;
        {
          // Initialize NodeIO and register EXTTextureWebP
          const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMaterialsSpecular]);

          // Read the GLB from the buffer
          const document = await io.readBinary(new Uint8Array(inputBuffer));

          const root = document.getRoot();
          // 4) Run a chain of size-reducing transforms:
          await document.transform(
            // a) Remove any unused data before compressing
            prune(),

            // b) Deduplicate identical accessors/meshes
          //  dedup(),
          );

          // 3a) Store `animationRanges` in root.extras
          if (animationRanges.length) {
            const existingExtras = root.listNodes()[0].getExtras() || {};
            root
              .listNodes()[0]
              .setExtras({ animationRanges, boundingBox, ...existingExtras });
          }

          // 3b) Remove all animations (but keep skins/skeletons)
          for (const anim of root.listAnimations()) {
            anim.dispose();
          }

          // 3c) Replace every texture with the 1×1 gray pixel PNG
          for (const tex of root.listTextures()) {
            tex.setImage(grayPixelBuffer);
            tex.setMimeType("image/png"); // Ensure texture is marked as PNG
          }

          // 4) Write the “lean” GLB to a buffer
          outputBuffer = await io.writeBinary(document);

          //   // 5) Write the lean GLB to disk
          //   const targetGlbPath = path.join(outputRoot, relPath);
          //   await fs.ensureDir(path.dirname(targetGlbPath));
          //   await fs.writeFile(targetGlbPath, outputBuffer);

          //   console.log(
          //     `  ✔ Wrote lean GLB to: ${path.relative(process.cwd(), targetGlbPath)}`,
          //   );
        }

        // 6) BABYLON EXPORT: Load the modified GLB into Babylon.js and export as .babylon
        {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const camera = new BABYLON.FreeCamera(
            "camera",
            new BABYLON.Vector3(0, 0, -10),
            scene,
          );
          scene.activeCamera = camera;
          const base64 = Buffer.from(outputBuffer).toString("base64");
          const dataUrl = `data:model/gltf-binary;base64,${base64}`;

          try {
            await BABYLON.ImportMeshAsync(dataUrl, scene);

            // Serialize the scene to .babylon format
            const serializedScene = BABYLON.SceneSerializer.Serialize(scene);
            // Sometimes our secondaryMeshes number was lying to us, let's fix that
            const rootMetadata = serializedScene.transformNodes[0]?.metadata;
            const currentSecMesh = rootMetadata.gltf?.extras?.secondaryMeshes;
            let realSecondaryMeshCount = 0;
            const modelName = path.basename(relPath, ".glb");
            const secondaryMeshRegex = /\w{3}he\d{2}$/;
            const isSecondaryMesh = secondaryMeshRegex.test(modelName);
            if (isSecondaryMesh) {
              realSecondaryMeshCount = 0;
            } else {
              const baseModelName = modelName.slice(0, 3);
              // Now recurse through the models folder and look at names and pick the number of matches
              // with secondaryMeshRegex from the filename.glb stripped of .glb
              const allModels = await collectGlbFiles(rootPath);
              for (const modelPath of allModels) {
                const modelName = path.basename(modelPath, ".glb");
                if (
                  modelName.startsWith(baseModelName) &&
                  secondaryMeshRegex.test(modelName)
                ) {
                  realSecondaryMeshCount++;
                }
              }
            }
            if (currentSecMesh !== realSecondaryMeshCount) {
              if (!isSecondaryMesh) {
                console.log(
                  `[SecondaryMesh] Updating secondaryMeshes count for ${modelName} from ${currentSecMesh} to ${realSecondaryMeshCount}`,
                );
              }
              serializedScene.transformNodes[0].metadata.gltf.extras.secondaryMeshes =
                realSecondaryMeshCount;
            }
            // Convert to JSON string
            const babylonJson = JSON.stringify(serializedScene, null, 2);

            // Write the .babylon file
            const targetBabylonPath = path.join(
              outputRoot,
              relPath.replace(/\.glb$/i, ".babylon"),
            );
            await fs.ensureDir(path.dirname(targetBabylonPath));
            await fs.writeFile(targetBabylonPath, babylonJson);

            console.log(
              `  ✔ Wrote .babylon file to: ${path.relative(process.cwd(), targetBabylonPath)}`,
            );
          } catch (err) {
            console.error(
              `  [error] Failed to export ${relPath} to .babylon:`,
              err.message,
            );
          } finally {
            scene.dispose();
            engine.dispose();
          }
        }
      } catch (err) {
        console.error(`  [error] Failed to process ${relPath}:`, err.message);
      }
    }),
  );

  // Wait for all files to finish
  await Promise.all(tasks);
  console.log(
    "\nAll done! “Lean” GLBs and .babylon files are under:",
    outputRoot,
  );
})();
