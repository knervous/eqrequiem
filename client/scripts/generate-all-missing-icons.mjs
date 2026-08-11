import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const manifestPath = path.join(repoRoot, "client/public/eltania/abilities/icons/v1/icon-manifest.json");
const outputDir = path.join(repoRoot, "client/public/eltania/abilities/icons/v1");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Filter existing to ONLY valid files (> 1000 bytes)
const allDirFiles = fs.readdirSync(outputDir);
for (const file of allDirFiles) {
  if (file.endsWith(".webp")) {
    const fullPath = path.join(outputDir, file);
    if (fs.statSync(fullPath).size < 1000) {
      console.warn(`Removing invalid 0-byte file: ${file}`);
      fs.unlinkSync(fullPath);
    }
  }
}

const validFiles = new Set(
  fs.readdirSync(outputDir).filter((f) => f.endsWith(".webp") && fs.statSync(path.join(outputDir, f)).size > 1000)
);

const missing = manifest.icons.filter((i) => !validFiles.has(i.file));

console.log(`[Icon Promotion Runner] Total Manifest Icons: ${manifest.icons.length}`);
console.log(`[Icon Promotion Runner] Valid Present Icons: ${validFiles.size}`);
console.log(`[Icon Promotion Runner] Missing Icons to Generate: ${missing.length}`);

if (missing.length === 0) {
  console.log("🎉 All 221 ability icons are 100% valid and present!");
  process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateSingleIcon(icon, index) {
  const models = ["flux", "turbo"];
  const encodedPrompt = encodeURIComponent(icon.prompt);

  for (const model of models) {
    const seed = 5000 + index;
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}&model=${model}`;
    const tempJpg = path.join("/tmp", `promote_${icon.id.replace(/\./g, "_")}.jpg`);
    const finalWebp = path.join(outputDir, icon.file);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) {
        throw new Error(`Downloaded buffer too small (${buf.length} bytes)`);
      }

      fs.writeFileSync(tempJpg, buf);
      execSync(`ffmpeg -y -i "${tempJpg}" -vf "scale=512:512" "${finalWebp}"`, { stdio: "ignore" });

      if (fs.existsSync(tempJpg)) fs.unlinkSync(tempJpg);

      if (!fs.existsSync(finalWebp) || fs.statSync(finalWebp).size < 1000) {
        throw new Error("FFmpeg output missing or too small");
      }

      const size = fs.statSync(finalWebp).size;
      console.log(`[PASS] ${icon.id} (${icon.className}) -> ${icon.file} (${(size / 1024).toFixed(1)} KB)`);
      return true;
    } catch (err) {
      if (fs.existsSync(tempJpg)) try { fs.unlinkSync(tempJpg); } catch {}
      if (fs.existsSync(finalWebp) && fs.statSync(finalWebp).size < 1000) {
        try { fs.unlinkSync(finalWebp); } catch {}
      }
      console.warn(`[RETRY] ${icon.id} (${model}): ${err.message}`);
      await sleep(2500);
    }
  }

  console.error(`[FAIL] ${icon.id} could not be generated.`);
  return false;
}

async function runPromotionPipeline() {
  const CONCURRENCY = 2;
  const DELAY_MS = 2000;

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const chunk = missing.slice(i, i + CONCURRENCY);
    console.log(`\n--- Batch Chunk ${Math.floor(i / CONCURRENCY) + 1} / ${Math.ceil(missing.length / CONCURRENCY)} (${chunk.length} items) ---`);

    await Promise.all(chunk.map((icon, idx) => generateSingleIcon(icon, i + idx)));
    
    const validNow = fs.readdirSync(outputDir).filter(f => f.endsWith(".webp") && fs.statSync(path.join(outputDir, f)).size > 1000).length;
    console.log(`Progress: ${validNow} / ${manifest.icons.length} valid WebP icons promoted to client.`);
    await sleep(DELAY_MS);
  }

  const finalValid = fs.readdirSync(outputDir).filter(f => f.endsWith(".webp") && fs.statSync(path.join(outputDir, f)).size > 1000).length;
  console.log(`\n🎉 Icon promotion complete! ${finalValid} / ${manifest.icons.length} icons published to client.`);
}

runPromotionPipeline().catch(console.error);
