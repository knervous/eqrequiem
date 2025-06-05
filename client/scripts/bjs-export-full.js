import fs from "fs-extra";
import path from "path";
import pLimit from "p-limit";
import { NodeIO } from "@gltf-transform/core";
import { EXTTextureWebP, KHRMaterialsSpecular } from "@gltf-transform/extensions";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import * as BABYLON from "@babylonjs/core/index.js";

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

  // Ensure the user passed a folder
  const inputRoot = process.argv[2];
  if (!inputRoot) {
    console.error("Usage: node glb-to-babylon.js <folder-containing-GLBs>");
    process.exit(1);
  }

  // Normalize and make sure it exists
  const rootPath = path.resolve(inputRoot);
  if (!(await fs.pathExists(rootPath))) {
    console.error(`Folder not found: ${rootPath}`);
    process.exit(1);
  }

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

      try {
        // 1) Read the original GLB into a Buffer
        const inputBuffer = await fs.readFile(filePath);

        // 2) GLTF-TRANSFORM: apply optimizations without removing animations or textures
        let outputBuffer;
        {
          // Initialize NodeIO and register extensions
          const io = new NodeIO().registerExtensions([
            EXTTextureWebP,
            KHRMaterialsSpecular,
          ]);

          // Read the GLB from the buffer
          const document = await io.readBinary(new Uint8Array(inputBuffer));

          // Write the optimized GLB to a buffer
          outputBuffer = await io.writeBinary(document);
        }

        // 3) BABYLON EXPORT: Load the modified GLB into Babylon.js and export as .babylon
        {
          const engine = new NullEngine();
          const scene = new Scene(engine);
     
          scene.useRightHandedSystem = true;
          
          const base64 = Buffer.from(outputBuffer).toString("base64");
          const dataUrl = `data:model/gltf-binary;base64,${base64}`;

          try {
            await BABYLON.ImportMeshAsync(dataUrl, scene);

            // Serialize the scene to .babylon format
            const serializedScene = BABYLON.SceneSerializer.Serialize(scene);

            // Convert to JSON string
            const babylonJson = JSON.stringify(serializedScene, null, 2);

            // Write the .babylon file to the same directory as the input
            const targetBabylonPath = filePath.replace(/\.glb$/i, ".babylon");
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
        //process.exit(1)
      }
    }),
  );

  // Wait for all files to finish
  await Promise.all(tasks);
  console.log("\nAll done! .babylon files are in their respective input folders.");
})();