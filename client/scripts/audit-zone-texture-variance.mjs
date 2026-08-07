#!/usr/bin/env node

/**
 * Report zone textures whose pixels carry no information a material factor
 * could not express.
 *
 * A bound texture costs GPU memory whether or not its content varies: every
 * channel is decoded to RGBA8 and mipped regardless. A metallic-roughness or
 * normal map that is effectively constant is pure VRAM with no visual result,
 * and can be replaced by the equivalent scalar factor.
 *
 *   node client/scripts/audit-zone-texture-variance.mjs [zone...]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const worldRoot = path.join(repoRoot, "client/public/eqrequiem/worlds");

/** Per-channel 8-bit range below which a map carries no usable variation. */
const FLAT_RANGE = 4;
/** Standard deviation below which variation is noise rather than signal. */
const FLAT_STDDEV = 2;

function imageIndexOf(texture) {
  return texture.extensions?.EXT_texture_webp?.source ?? texture.source;
}

function parseGlb(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return {
    doc: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")),
    binOffset: 20 + jsonLength + 8,
  };
}

async function auditZone(zone) {
  const raw = gunzipSync(await fs.readFile(path.join(worldRoot, `${zone}.glb.gz`)));
  const { doc, binOffset } = parseGlb(raw);

  const roles = new Map();
  for (const material of doc.materials ?? []) {
    const pbr = material.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture) {
      roles.set(imageIndexOf(doc.textures[pbr.baseColorTexture.index]), "base-color");
    }
    if (pbr.metallicRoughnessTexture) {
      roles.set(
        imageIndexOf(doc.textures[pbr.metallicRoughnessTexture.index]),
        "metallic-roughness",
      );
    }
    if (material.normalTexture) {
      roles.set(imageIndexOf(doc.textures[material.normalTexture.index]), "normal");
    }
  }

  const flat = [];
  let bytes = 0;
  let texels = 0;
  for (const [index, role] of roles) {
    const view = doc.bufferViews[doc.images[index].bufferView];
    const start = binOffset + (view.byteOffset ?? 0);
    const data = raw.subarray(start, start + view.byteLength);
    const image = sharp(data);
    const { channels: stats } = await image.stats();
    const { width, height } = await image.metadata();
    bytes += view.byteLength;
    texels += width * height;

    // Alpha is ignored: a constant alpha channel is normal and is not what
    // makes a colour or data map redundant.
    const meaningful = stats.slice(0, role === "metallic-roughness" ? 3 : 3);
    const ranges = meaningful.map((c) => c.max - c.min);
    const deviations = meaningful.map((c) => c.stdev);
    if (
      Math.max(...ranges) <= FLAT_RANGE &&
      Math.max(...deviations) <= FLAT_STDDEV
    ) {
      flat.push({
        name: doc.images[index].name ?? String(index),
        role,
        size: [width, height],
        bytes: view.byteLength,
        vram: width * height * 4,
        means: meaningful.map((c) => Math.round(c.mean)),
        ranges,
      });
    }
  }

  return { zone, textures: roles.size, bytes, texels, flat };
}

const zones = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["qeynos2"];

let totalFlatVram = 0;
for (const zone of zones) {
  const report = await auditZone(zone);
  const vram = report.texels * 4;
  console.log(
    `\n=== ${zone}: ${report.textures} bound textures, ` +
      `${(report.bytes / 2 ** 20).toFixed(1)} MiB encoded, ` +
      `${(vram / 2 ** 20).toFixed(0)} MiB RGBA8 ` +
      `(${((vram * 4) / 3 / 2 ** 20).toFixed(0)} MiB with mips) ===`,
  );
  if (!report.flat.length) {
    console.log("  no constant-valued textures");
    continue;
  }
  const flatVram = report.flat.reduce((sum, f) => sum + f.vram, 0);
  totalFlatVram += flatVram;
  console.log(
    `  ${report.flat.length} textures carry no variation ` +
      `(range <= ${FLAT_RANGE}, stdev <= ${FLAT_STDDEV}): ` +
      `${(flatVram / 2 ** 20).toFixed(0)} MiB RGBA8, ` +
      `${((flatVram * 4) / 3 / 2 ** 20).toFixed(0)} MiB with mips`,
  );
  const byRole = new Map();
  for (const entry of report.flat) {
    const bucket = byRole.get(entry.role) ?? [];
    bucket.push(entry);
    byRole.set(entry.role, bucket);
  }
  for (const [role, entries] of byRole) {
    console.log(
      `    ${role}: ${entries.length} textures, ` +
        `${(entries.reduce((s, e) => s + e.vram, 0) / 2 ** 20).toFixed(0)} MiB`,
    );
    for (const entry of entries.slice(0, 6)) {
      console.log(
        `      ${entry.name.slice(0, 44).padEnd(46)} ` +
          `mean ${JSON.stringify(entry.means)} range ${JSON.stringify(entry.ranges)}`,
      );
    }
    if (entries.length > 6) console.log(`      ... and ${entries.length - 6} more`);
  }
}
if (zones.length > 1) {
  console.log(
    `\ntotal recoverable: ${(totalFlatVram / 2 ** 20).toFixed(0)} MiB RGBA8`,
  );
}
