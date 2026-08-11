import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const manifestPath = path.join(repoRoot, "client/public/eltania/abilities/icons/v1/icon-manifest.json");
const outputDir = path.join(repoRoot, "client/public/eltania/abilities/icons/v1");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runFinalPass() {
  const existing = new Set(fs.readdirSync(outputDir).filter((f) => f.endsWith(".webp")));
  const missing = manifest.icons.filter((i) => !existing.has(i.file));

  console.log(`[Final 16 Pass] Present: ${existing.size} | Missing: ${missing.length}`);

  if (missing.length === 0) {
    console.log("🎉 100% Complete! All 221 icons are generated.");
    process.exit(0);
  }

  for (const [idx, icon] of missing.entries()) {
    const encodedPrompt = encodeURIComponent(icon.prompt);
    // Cycle between pollinations endpoints & models if throttled
    const models = ["flux", "turbo", "flux-realism"];
    let success = false;

    for (const model of models) {
      if (success) break;
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${9000 + idx}&model=${model}`;
      const tempJpg = path.join("/tmp", `icon_final16_${icon.id.replace(/\./g, "_")}.jpg`);
      const finalWebp = path.join(outputDir, icon.file);

      try {
        console.log(`[${idx + 1}/${missing.length}] ${icon.id} (model: ${model})...`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 2000) throw new Error("Image buffer too small");

        fs.writeFileSync(tempJpg, buf);
        execSync(`ffmpeg -y -i "${tempJpg}" -vf "scale=512:512" "${finalWebp}"`, { stdio: "ignore" });
        if (fs.existsSync(tempJpg)) fs.unlinkSync(tempJpg);

        const size = fs.statSync(finalWebp).size;
        console.log(`  -> [PASS] ${icon.file} (${(size / 1024).toFixed(1)} KB)`);
        success = true;
      } catch (err) {
        console.warn(`  -> [RETRY ${model}] ${err.message}`);
        await sleep(3000);
      }
    }
    await sleep(3500);
  }

  const countAfter = fs.readdirSync(outputDir).filter((f) => f.endsWith(".webp")).length;
  console.log(`[Final 16 Pass] Complete! ${countAfter} / ${manifest.icons.length} WebP icons generated.`);
}

runFinalPass().catch(console.error);
