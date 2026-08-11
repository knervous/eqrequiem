import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const manifestFile = path.join(repoRoot, "assets/generated/eq-catalog/manifest.json");
const blender = "/Users/Paul/Downloads/Blender.app/Contents/MacOS/Blender";
const authorScript = path.join(repoRoot, "assets/pipeline/author_clean_item_model.py");
const execFileAsync = promisify(execFile);

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  const items = manifest.assets.filter((asset) => asset.kind === "item").slice(0, 100);
  console.log(`Processing batch of ${items.length} items...`);

  let converted = 0;
  for (const [index, item] of items.entries()) {
    const id = item.id;
    const outputGlb = path.join(repoRoot, `assets/generated/eq-catalog/items/${id}/final-pbr.glb`);
    const reportFile = path.join(repoRoot, `assets/generated/eq-catalog/items/${id}/pbr-report.json`);
    
    let sourceGlb = path.join(repoRoot, `assets/generated/eq-catalog/items/${id}/shape.glb`);
    let exists = await fs.access(sourceGlb).then(() => true).catch(() => false);
    if (!exists) {
      sourceGlb = path.join(repoRoot, `assets/generated/eq-catalog/items/${id}/final.glb`);
      exists = await fs.access(sourceGlb).then(() => true).catch(() => false);
    }

    if (!exists) {
      console.warn(`[item-batch] [${index + 1}/${items.length}] Skipping ${id}: shape.glb not found`);
      continue;
    }

    const envelope = item.lowPoly?.placementSize || [0.5, 1.0, 0.5];
    const targetTriangles = Math.min(item.lowPoly?.maximumTriangles || 512, 1024);

    try {
      await execFileAsync(
        blender,
        [
          "--background",
          "--python",
          authorScript,
          "--",
          sourceGlb,
          outputGlb,
          id,
          item.category || "item",
          reportFile,
        ],
        { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 }
      );
      converted++;
      console.log(`[item-batch] [${index + 1}/${items.length}] Successfully converted ${id} (${item.displayName || id})`);
    } catch (error) {
      console.error(`[item-batch] [${index + 1}/${items.length}] Failed ${id}: ${error.message}`);
    }
  }

  console.log(`Successfully converted ${converted}/${items.length} item models to PBR glTF.`);
}

main().catch(console.error);
