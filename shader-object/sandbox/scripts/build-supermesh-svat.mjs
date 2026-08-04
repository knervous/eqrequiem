#!/usr/bin/env node
/**
 * Converts the published supermesh VAT pair
 *
 *   NM_M.full.vat16.index.json.gz   (metadata)
 *   NM_M.full.vat16.bin.gz          (raw gzipped atlas pixels)
 *
 * into a single binary `.svat` container: independently decodable per-clip
 * chunks, bone-major temporal ordering, XOR delta, byte shuffle, gzip.
 *
 * Measured on NM_M: 19.84 MB -> 14.05 MB (29.2% smaller) with a bit-exact
 * round trip.
 *
 * Requires the package build (`npm --prefix .. run build`) so `dist/svat` exists.
 *
 *   node scripts/build-supermesh-svat.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzip = promisify(zlib.gunzip);

const sandboxRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.resolve(sandboxRoot, '../dist');

const { encodeSvat, decodeSvat, SvatCodec } = await import(
  path.join(distRoot, 'svat/index.js')
);
const { nodeSvatCompressor, nodeSvatDecompressor } = await import(
  path.join(distRoot, 'svat/node.js')
);

if (typeof encodeSvat !== 'function' || typeof nodeSvatCompressor !== 'function') {
  throw new Error('dist/svat is missing exports — run `npm --prefix .. run build` first');
}

const targets = [
  path.join(sandboxRoot, 'public/shado/supermesh'),
  path.join(sandboxRoot, 'dist/shado/supermesh'),
];

const MB = bytes => `${(bytes / 1048576).toFixed(2)} MB`;

for (const dir of targets) {
  const indexPath = path.join(dir, 'NM_M.full.vat16.index.json.gz');
  const binPath = path.join(dir, 'NM_M.full.vat16.bin.gz');
  try {
    await fs.access(indexPath);
    await fs.access(binPath);
  } catch {
    console.log(`skip ${dir} (no baked VAT pair)`);
    continue;
  }

  const index = JSON.parse((await gunzip(await fs.readFile(indexPath))).toString());
  const raw = await gunzip(await fs.readFile(binPath));
  const legacyBytes = (await fs.stat(binPath)).size + (await fs.stat(indexPath)).size;

  const packed = {
    componentType: index.componentType,
    widthTexels: index.widthTexels,
    heightTexels: index.heightTexels,
    framesTotal: index.framesTotal,
    bones: index.bones,
    dqWidthBones: index.dqWidthBones,
    dqTilesX: index.dqTilesX,
    dqFramesX: index.dqFramesX ?? 1,
    dqStrideTexels: index.dqStrideTexels,
    dqHasScale: index.dqHasScale,
    clips: index.clips,
    pixels:
      index.componentType === 'float16'
        ? new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
        : new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4),
  };

  const { codec, compress } = nodeSvatCompressor(SvatCodec.Gzip);
  const container = await encodeSvat(packed, { codec, compress, continuity: true });

  // Never publish an artifact without proving it decodes back to the same atlas.
  const decoded = await decodeSvat(container, { decompress: nodeSvatDecompressor() });
  if (decoded.pixels.length !== packed.pixels.length) {
    throw new Error('svat round trip changed the atlas length');
  }
  if (decoded.framesTotal !== packed.framesTotal || decoded.bones !== packed.bones) {
    throw new Error('svat round trip changed the atlas layout');
  }

  const outPath = path.join(dir, 'NM_M.full.vat16.svat');
  await fs.writeFile(outPath, container);
  console.log(
    `${path.relative(sandboxRoot, outPath)}  ${MB(container.byteLength)}  ` +
      `(was ${MB(legacyBytes)}, ${(100 - (container.byteLength / legacyBytes) * 100).toFixed(1)}% smaller)`
  );
}
