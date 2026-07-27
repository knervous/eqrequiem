import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { sha256 } from './sprite-pipeline.mjs';
import { TEXT_GENERATION_RECIPE } from './sdcpp-client.mjs';

const PUBLIC_SCHEMA_VERSION = 1;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function validateMaster({ outputRoot, sheet, entry, masterSize }) {
  const masterPath = path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`);
  const metadataPath = path.join(outputRoot, 'metadata', sheet.sheetId, `${entry.id}.json`);
  const [masterBuffer, metadataText] = await Promise.all([
    readFile(masterPath),
    readFile(metadataPath, 'utf8'),
  ]);
  const metadata = JSON.parse(metadataText);
  const image = sharp(masterBuffer);
  const imageMetadata = await image.metadata();
  const failures = [];

  if (metadata.operation !== 'text-to-image') failures.push(`operation=${metadata.operation}`);
  if (metadata.sourceHash !== entry.sourceHash) failures.push('source hash mismatch');
  if (metadata.context?.sqliteIconId !== entry.atlasIconId) failures.push('SQLite icon mismatch');
  if (metadata.parameters?.recipeVersion !== TEXT_GENERATION_RECIPE) {
    failures.push(`recipe=${metadata.parameters?.recipeVersion}`);
  }
  if (metadata.parameters?.finalSize !== masterSize) {
    failures.push(`finalSize=${metadata.parameters?.finalSize}`);
  }
  if (metadata.outputHash !== sha256(masterBuffer)) failures.push('output hash mismatch');
  if (imageMetadata.width !== masterSize || imageMetadata.height !== masterSize) {
    failures.push(`geometry=${imageMetadata.width}x${imageMetadata.height}`);
  }
  if (!imageMetadata.hasAlpha) failures.push('missing alpha channel');

  if (failures.length === 0) {
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let edgeAlphaMaximum = 0;
    let visiblePixels = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const alpha = data[(y * info.width + x) * info.channels + 3];
        if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) {
          edgeAlphaMaximum = Math.max(edgeAlphaMaximum, alpha);
        }
        if (alpha >= 16) visiblePixels += 1;
      }
    }
    if (edgeAlphaMaximum !== 0) failures.push(`edge alpha=${edgeAlphaMaximum}`);
    const visibleRatio = visiblePixels / (info.width * info.height);
    if (visibleRatio < 0.005 || visibleRatio > 0.8) {
      failures.push(`implausible visible ratio=${visibleRatio.toFixed(4)}`);
    }
  }

  if (failures.length > 0) throw new Error(failures.join(', '));
  return { entry, masterPath, masterBuffer, outputHash: metadata.outputHash };
}

export async function auditGeneratedCollection({
  outputRoot,
  manifest,
  masterSize = 256,
}) {
  const valid = [];
  const failures = [];
  let blank = 0;

  for (const sheet of manifest.sheets) {
    const results = await Promise.all(
      sheet.entries.map(async (entry) => {
        if (entry.blank) return { blank: true };
        try {
          return {
            valid: await validateMaster({ outputRoot, sheet, entry, masterSize }),
          };
        } catch (error) {
          return { failure: { id: entry.id, reason: error.message } };
        }
      }),
    );
    for (const result of results) {
      if (result.blank) blank += 1;
      if (result.valid) valid.push(result.valid);
      if (result.failure) failures.push(result.failure);
    }
  }

  return {
    valid,
    failures,
    blank,
    total: valid.length + failures.length + blank,
    promotable: failures.length === 0,
    masterSize,
    recipeVersion: TEXT_GENERATION_RECIPE,
  };
}

export function assertPromotable(audit) {
  if (audit.promotable) return;
  const examples = audit.failures
    .slice(0, 20)
    .map(({ id, reason }) => `  ${id}: ${reason}`)
    .join('\n');
  throw new Error(
    `Collection is not promotable: ${audit.failures.length} of ` +
      `${audit.total - audit.blank} nonblank icons failed validation.\n${examples}`,
  );
}

export async function promoteGeneratedCollection({
  outputRoot,
  manifest,
  publicItemsRoot,
  version = 'v1',
  masterSize = 256,
}) {
  if (!/^v[1-9]\d*$/.test(version)) throw new Error(`Invalid public icon version: ${version}`);
  const audit = await auditGeneratedCollection({ outputRoot, manifest, masterSize });
  assertPromotable(audit);

  const iconsRoot = path.join(publicItemsRoot, 'icons');
  const targetRoot = path.join(iconsRoot, version);
  const stagingRoot = path.join(iconsRoot, `.${version}-staging-${process.pid}`);
  if (await exists(targetRoot)) {
    throw new Error(`${targetRoot} already exists; publish a new immutable version instead`);
  }
  if (await exists(stagingRoot)) throw new Error(`Staging directory already exists: ${stagingRoot}`);
  await mkdir(stagingRoot, { recursive: true });

  const entries = [];
  for (const [index, icon] of audit.valid.entries()) {
    const fileName = `${icon.entry.atlasIconId}.webp`;
    const publicBuffer = await sharp(icon.masterBuffer)
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    await writeFile(path.join(stagingRoot, fileName), publicBuffer);
    entries.push({
      icon: icon.entry.atlasIconId,
      file: fileName,
      sourceId: icon.entry.id,
      sourceHash: icon.outputHash,
      publicHash: sha256(publicBuffer),
    });
    if ((index + 1) % 250 === 0) {
      console.log(`prepared ${index + 1}/${audit.valid.length} public icons`);
    }
  }

  const publicManifest = {
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    version,
    recipeVersion: audit.recipeVersion,
    masterSize,
    format: 'lossless webp',
    addressing: 'SQLite item.icon',
    iconCount: entries.length,
    blankSourceSlots: audit.blank,
    entries,
  };
  await writeFile(
    path.join(stagingRoot, 'manifest.json'),
    `${JSON.stringify(publicManifest, null, 2)}\n`,
  );
  await rename(stagingRoot, targetRoot);
  return { targetRoot, iconCount: entries.length };
}
