import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const LEGACY_SHEET = Object.freeze({
  width: 256,
  height: 256,
  cellSize: 40,
  columns: 6,
  rows: 6,
  slots: 36,
  iconBase: 500,
  sourceOriginX: 0,
  sourceOriginY: 16,
  canonicalOriginX: 0,
  canonicalOriginY: 0,
});

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function naturalSheetNumber(fileName) {
  const match = path.basename(fileName).match(/^dragitem(\d+)\.(?:png|webp)$/i);
  return match ? Number(match[1]) : null;
}

export function slotGeometry(slot, layout = LEGACY_SHEET) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= layout.slots) {
    throw new RangeError(`Sprite slot must be between 0 and ${layout.slots - 1}; received ${slot}`);
  }
  const column = slot % layout.columns;
  const row = Math.floor(slot / layout.columns);
  const sourceColumn = column;
  const sourceRow = layout.rows - row - 1;
  return {
    slot,
    column,
    row,
    sourceSlot: sourceRow * layout.columns + sourceColumn,
    sourceColumn,
    sourceRow,
    sourceLeft: layout.sourceOriginX + sourceColumn * layout.cellSize,
    sourceTop: layout.sourceOriginY + sourceRow * layout.cellSize,
    left: layout.canonicalOriginX + column * layout.cellSize,
    top: layout.canonicalOriginY + row * layout.cellSize,
    width: layout.cellSize,
    height: layout.cellSize,
  };
}

async function ensureLegacyGeometry(sheetPath, layout) {
  const metadata = await sharp(sheetPath).metadata();
  if (metadata.width !== layout.width || metadata.height !== layout.height) {
    throw new Error(
      `${path.basename(sheetPath)} is ${metadata.width}×${metadata.height}; expected ` +
        `${layout.width}×${layout.height}`,
    );
  }
  return metadata;
}

export async function sliceSheet({
  sheetPath,
  outputRoot,
  layout = LEGACY_SHEET,
  overwrite = false,
}) {
  const sheetNumber = naturalSheetNumber(sheetPath);
  if (sheetNumber === null) {
    throw new Error(`Legacy sheet name must match dragitem<number>.png|webp: ${sheetPath}`);
  }
  const metadata = await ensureLegacyGeometry(sheetPath, layout);
  const sheetBuffer = await readFile(sheetPath);
  const sourceHash = sha256(sheetBuffer);
  const sheetId = `dragitem${sheetNumber}`;
  const sliceDirectory = path.join(outputRoot, 'slices', sheetId);
  await mkdir(sliceDirectory, { recursive: true });

  const entries = [];
  for (let slot = 0; slot < layout.slots; slot += 1) {
    const geometry = slotGeometry(slot, layout);
    const id = `${sheetId}-${String(slot).padStart(2, '0')}`;
    const outputPath = path.join(sliceDirectory, `${id}.png`);
    const operation = sharp(sheetBuffer)
      .extract({
        left: geometry.sourceLeft,
        top: geometry.sourceTop,
        width: geometry.width,
        height: geometry.height,
      })
      .flip()
      .png();
    const tileBuffer = await operation.toBuffer();
    const stats = await sharp(tileBuffer).stats();
    const alpha = stats.channels[3];
    const alphaMaximum = alpha?.max ?? 255;
    const alphaMinimum = alpha?.min ?? 255;
    const blank = Boolean(alpha && alphaMaximum === 0);
    if (overwrite || !(await fileMatchesHash(outputPath, sha256(tileBuffer)))) {
      await writeFile(outputPath, tileBuffer);
    }
    entries.push({
      id,
      sheetId,
      sheetNumber,
      atlasIconId:
        layout.iconBase +
        (sheetNumber - 1) * layout.slots +
        geometry.column * layout.rows +
        geometry.row,
      ...geometry,
      sourcePath: path.relative(outputRoot, outputPath),
      sourceHash: sha256(tileBuffer),
      blank,
      alpha: {
        present: metadata.hasAlpha === true,
        minimum: alphaMinimum,
        maximum: alphaMaximum,
      },
      state: blank ? 'blank' : 'sliced',
    });
  }

  return {
    schemaVersion: 1,
    sheetId,
    sheetNumber,
    sourceFile: path.basename(sheetPath),
    sourceHash,
    source: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      hasAlpha: metadata.hasAlpha === true,
    },
    layout,
    entries,
  };
}

export async function writeCollectionManifest({ outputRoot, sheets }) {
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceOrientation: {
      stored: 'top-left',
      correction:
        'legacy atlas rows and cell pixels are flipped on Y; X is stored normally',
      sourcePadding: 'right and top',
      canonicalPadding: 'right and bottom',
    },
    generation: {
      workingSize: 512,
      masterSize: 256,
      repackedCellSize: LEGACY_SHEET.cellSize,
    },
    sheets: [...sheets].sort((a, b) => a.sheetNumber - b.sheetNumber),
  };
  const manifestPath = path.join(outputRoot, 'sprite-manifest.json');
  await mkdir(outputRoot, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath };
}

export async function loadCollectionManifest(outputRoot) {
  const manifestPath = path.join(outputRoot, 'sprite-manifest.json');
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

export async function createPassthroughMasters({ outputRoot, manifest, masterSize = 256 }) {
  let completed = 0;
  for (const sheet of manifest.sheets) {
    const masterDirectory = path.join(outputRoot, 'masters', sheet.sheetId);
    await mkdir(masterDirectory, { recursive: true });
    for (const entry of sheet.entries) {
      if (entry.blank) continue;
      const sourcePath = path.join(outputRoot, entry.sourcePath);
      const masterPath = path.join(masterDirectory, `${entry.id}.png`);
      const masterBuffer = await sharp(sourcePath)
        .resize(masterSize, masterSize, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();
      if (!(await fileMatchesHash(masterPath, sha256(masterBuffer)))) {
        await writeFile(masterPath, masterBuffer);
      }
      await writeMetadata({
        outputRoot,
        entry,
        operation: 'passthrough',
        outputPath: masterPath,
        outputBuffer: masterBuffer,
        parameters: { generationSize: null, finalSize: masterSize },
      });
      completed += 1;
    }
  }
  return completed;
}

export async function repackSheets({
  outputRoot,
  sourceDirectory,
  manifest,
  format = 'png',
  from = 'masters',
}) {
  if (!['masters', 'slices'].includes(from)) {
    throw new Error(`Repack source must be "masters" or "slices"; received ${from}`);
  }
  const repackedDirectory = path.join(outputRoot, 'repacked');
  await mkdir(repackedDirectory, { recursive: true });
  const results = [];
  for (const sheet of manifest.sheets) {
    const sourcePath = path.join(sourceDirectory, sheet.sourceFile);
    await ensureLegacyGeometry(sourcePath, sheet.layout);
    const composites = [];
    for (const entry of sheet.entries) {
      if (entry.blank) continue;
      const inputPath =
        from === 'slices'
          ? path.join(outputRoot, entry.sourcePath)
          : path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`);
      const tile =
        from === 'slices'
          ? await readFile(inputPath)
          : await resizeMasterTile(inputPath, entry.width, entry.height);
      composites.push({ input: tile, left: entry.left, top: entry.top });
    }
    const pipeline = sharp({
      create: {
        width: sheet.layout.width,
        height: sheet.layout.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite(composites);
    const outputName = `${sheet.sheetId}.${format}`;
    const outputPath = path.join(repackedDirectory, outputName);
    if (format === 'webp') {
      await pipeline.webp({ lossless: true, alphaQuality: 100, effort: 6 }).toFile(outputPath);
    } else {
      await pipeline.png().toFile(outputPath);
    }
    const metadata = await sharp(outputPath).metadata();
    if (metadata.width !== sheet.layout.width || metadata.height !== sheet.layout.height) {
      throw new Error(`Repacked ${outputName} has invalid dimensions`);
    }
    results.push({ outputPath, width: metadata.width, height: metadata.height });
  }
  return results;
}

async function resizeMasterTile(inputPath, width, height) {
  const { data, info } = await sharp(inputPath)
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alphaOffset = (y * width + x) * info.channels + 3;
      if (
        data[alphaOffset] < 8 ||
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1
      ) {
        data[alphaOffset] = 0;
      }
    }
  }
  return sharp(data, { raw: { width, height, channels: info.channels } })
    .png()
    .toBuffer();
}

export async function compareSheetPixels(firstPath, secondPath, tolerance = 1) {
  const firstMetadata = await sharp(firstPath).metadata();
  const secondMetadata = await sharp(secondPath).metadata();
  if (firstMetadata.width !== secondMetadata.width || firstMetadata.height !== secondMetadata.height) {
    return { equal: false, differingBytes: Infinity, maximumDelta: Infinity };
  }
  // RGB values beneath fully transparent pixels are not visible and image encoders
  // may normalize them. Equality over both black and white backgrounds proves the
  // decoded alpha-composited image is unchanged without comparing irrelevant bytes.
  return compareRenderedInputs(firstPath, secondPath, tolerance);
}

async function compareRenderedInputs(firstInput, secondInput, tolerance) {
  const comparisons = await Promise.all(
    [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ].map(async (background) => ({
      first: await sharp(firstInput).flatten({ background }).raw().toBuffer(),
      second: await sharp(secondInput).flatten({ background }).raw().toBuffer(),
    })),
  );
  let differingBytes = 0;
  let maximumDelta = 0;
  for (const comparison of comparisons) {
    for (let index = 0; index < comparison.first.length; index += 1) {
      const delta = Math.abs(comparison.first[index] - comparison.second[index]);
      if (delta > tolerance) differingBytes += 1;
      if (delta > maximumDelta) maximumDelta = delta;
    }
  }
  return { equal: differingBytes === 0, differingBytes, maximumDelta };
}

export async function verifyRepackedSheet({
  outputRoot,
  sheet,
  repackedPath,
  tolerance = 1,
}) {
  await ensureLegacyGeometry(repackedPath, sheet.layout);
  let differingBytes = 0;
  let maximumDelta = 0;
  for (const entry of sheet.entries) {
    const sourcePath = path.join(outputRoot, entry.sourcePath);
    const repackedTile = await sharp(repackedPath)
      .extract({
        left: entry.left,
        top: entry.top,
        width: entry.width,
        height: entry.height,
      })
      .png()
      .toBuffer();
    const comparison = await compareRenderedInputs(sourcePath, repackedTile, tolerance);
    differingBytes += comparison.differingBytes;
    maximumDelta = Math.max(maximumDelta, comparison.maximumDelta);
  }
  const bottomPaddingBuffer = await sharp(repackedPath)
    .extract({
      left: 0,
      top: sheet.layout.canonicalOriginY + sheet.layout.rows * sheet.layout.cellSize,
      width: sheet.layout.width,
      height:
        sheet.layout.height -
        sheet.layout.canonicalOriginY -
        sheet.layout.rows * sheet.layout.cellSize,
    })
    .png()
    .toBuffer();
  const rightPaddingBuffer = await sharp(repackedPath)
    .extract({
      left: sheet.layout.canonicalOriginX + sheet.layout.columns * sheet.layout.cellSize,
      top: 0,
      width:
        sheet.layout.width -
        sheet.layout.canonicalOriginX -
        sheet.layout.columns * sheet.layout.cellSize,
      height: sheet.layout.height,
    })
    .png()
    .toBuffer();
  const [bottomPadding, rightPadding] = await Promise.all([
    sharp(bottomPaddingBuffer).stats(),
    sharp(rightPaddingBuffer).stats(),
  ]);
  const paddingAlphaMaximum = Math.max(
    bottomPadding.channels[3]?.max ?? 255,
    rightPadding.channels[3]?.max ?? 255,
  );
  return {
    equal: differingBytes === 0 && paddingAlphaMaximum === 0,
    differingBytes,
    maximumDelta,
    paddingAlphaMaximum,
  };
}

export async function writeMetadata({
  outputRoot,
  entry,
  operation,
  outputPath,
  outputBuffer,
  parameters,
  prompt = null,
  negativePrompt = null,
  seed = null,
  warnings = [],
  context = null,
}) {
  const metadataDirectory = path.join(outputRoot, 'metadata', entry.sheetId);
  await mkdir(metadataDirectory, { recursive: true });
  const metadata = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    operation,
    id: entry.id,
    sourceHash: entry.sourceHash,
    sourceSprite: {
      sheet: entry.sheetId,
      slot: entry.slot,
      sourceSlot: entry.sourceSlot,
      sourceLeft: entry.sourceLeft,
      sourceTop: entry.sourceTop,
      left: entry.left,
      top: entry.top,
      width: entry.width,
      height: entry.height,
    },
    prompt,
    negativePrompt,
    seed,
    parameters,
    context,
    outputPath: path.relative(outputRoot, outputPath),
    outputHash: sha256(outputBuffer),
    warnings,
  };
  await writeFile(
    path.join(metadataDirectory, `${entry.id}.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
}

async function fileMatchesHash(filePath, expectedHash) {
  try {
    return sha256(await readFile(filePath)) === expectedHash;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
