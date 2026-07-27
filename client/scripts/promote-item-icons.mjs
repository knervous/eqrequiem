import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const sourceRoot = path.join(repoRoot, "assets/generated/eq-catalog/items");
const outputRoot = path.join(repoRoot, "client/public/eltania/items/catalog");
const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
const promoted = [];

await fs.mkdir(outputRoot, { recursive: true });

for (const entry of entries) {
  if (!entry.isDirectory() || !/^[a-z0-9_-]+$/i.test(entry.name)) continue;
  const source = path.join(sourceRoot, entry.name, "final-snapshots/front.png");
  try {
    await fs.access(source);
  } catch {
    continue;
  }

  const { data, info } = await sharp(source)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const sourceOffset = (y * info.width + x) * info.channels;
      const targetOffset = (y * info.width + x) * 4;
      const red = data[sourceOffset];
      const green = data[sourceOffset + 1];
      const blue = data[sourceOffset + 2];
      const distanceFromWhite = Math.max(255 - red, 255 - green, 255 - blue);
      const alpha = Math.max(0, Math.min(255, (distanceFromWhite - 3) * 6));
      rgba[targetOffset] = red;
      rgba[targetOffset + 1] = green;
      rgba[targetOffset + 2] = blue;
      rgba[targetOffset + 3] = alpha;
      if (alpha > 18) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) continue;
  const padding = 12;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(info.width - 1, right + padding);
  bottom = Math.min(info.height - 1, bottom + padding);
  const key = entry.name.toLowerCase();
  await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1,
    })
    .resize(112, 112, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(path.join(outputRoot, `${key}.webp`));
  promoted.push(key);
}

promoted.sort();
await fs.writeFile(
  path.join(outputRoot, "manifest.json"),
  `${JSON.stringify({ schema: 1, icons: promoted }, null, 2)}\n`,
);
console.log(`Promoted ${promoted.length} item icons to ${outputRoot}`);
