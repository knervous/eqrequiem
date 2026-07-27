import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { sha256, writeMetadata } from './sprite-pipeline.mjs';
import { promptFromContext } from './icon-context.mjs';

const DEFAULT_PROMPT = [
  'high fantasy medieval inventory icon',
  'centered single item',
  'faithful to the source object and silhouette',
  'hand-painted dark fantasy game art',
  'controlled highlights',
  'readable at small size',
  'no frame',
].join(', ');

const DEFAULT_NEGATIVE_PROMPT = [
  'text',
  'letters',
  'watermark',
  'logo',
  'multiple objects',
  'collection',
  'catalog',
  'grid',
  'contact sheet',
  'card',
  'square backdrop',
  'black background',
  'gray background',
  'gradient background',
  'white background',
  'environment',
  'floor',
  'surface',
  'pedestal',
  'cast shadow',
  'cropped object',
  'clutter',
  'photorealistic scene',
  'human hands',
  'human fingers',
  'character portrait',
  'blurry',
  'malformed object',
].join(', ');

export const TEXT_GENERATION_RECIPE = 10;
const DEFAULT_MASTER_SIZE = 256;
const MAX_BACKGROUND_ATTEMPTS = 5;
const PAIRED_EQUIPMENT_SLOTS = new Set([
  'shoulders',
  'arms',
  'wrist',
  'hands',
  'legs',
  'feet',
]);

function deterministicSeed(entry) {
  return Number.parseInt(entry.sourceHash.slice(0, 8), 16) & 0x7fffffff;
}

export class SdCppImg2ImgClient {
  constructor({
    baseUrl = process.env.SDCPP_URL ?? 'http://127.0.0.1:7860',
    endpoint = process.env.SDCPP_IMG2IMG_ENDPOINT ?? '/sdapi/v1/img2img',
    timeoutMs = Number(process.env.SDCPP_REQUEST_TIMEOUT_MS ?? 300_000),
  } = {}) {
    this.url = new URL(endpoint, baseUrl);
    if (!['127.0.0.1', 'localhost', '::1'].includes(this.url.hostname)) {
      throw new Error(`Refusing non-loopback diffusion server: ${this.url.hostname}`);
    }
    this.timeoutMs = timeoutMs;
  }

  async variation({
    sourcePath,
    entry,
    prompt = DEFAULT_PROMPT,
    strength = 0.34,
    generationSize = 512,
    steps = 24,
  }) {
    const seed = deterministicSeed(entry);
    const source = await sharp(sourcePath)
      .resize(generationSize, generationSize, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          init_images: [source.toString('base64')],
          prompt,
          negative_prompt: DEFAULT_NEGATIVE_PROMPT,
          width: generationSize,
          height: generationSize,
          steps,
          cfg_scale: 7,
          denoising_strength: strength,
          seed,
          batch_size: 1,
          n_iter: 1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(`Local sd.cpp img2img request failed at ${this.url}: ${error.message}`, {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const diagnostic = (await response.text()).slice(0, 1_000);
      throw new Error(`sd.cpp returned HTTP ${response.status}: ${diagnostic}`);
    }
    const result = await response.json();
    if (!Array.isArray(result.images) || typeof result.images[0] !== 'string') {
      throw new Error('sd.cpp response did not contain images[0]');
    }
    return {
      rawBuffer: Buffer.from(result.images[0].replace(/^data:image\/\w+;base64,/, ''), 'base64'),
      prompt,
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      seed,
      strength,
      generationSize,
      steps,
      serverInfo: result.info ?? null,
    };
  }

  async textToImage({
    entry,
    context,
    generationSize = 512,
    steps = 24,
    prompt = promptFromContext(context),
    attempt = 0,
  }) {
    const seed = (deterministicSeed(entry) + attempt * 104_729) & 0x7fffffff;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(new URL('/sdapi/v1/txt2img', this.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negative_prompt: DEFAULT_NEGATIVE_PROMPT,
          width: generationSize,
          height: generationSize,
          steps,
          cfg_scale: 7,
          seed,
          batch_size: 1,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(`Local sd.cpp txt2img request failed: ${error.message}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`sd.cpp txt2img returned HTTP ${response.status}: ${(await response.text()).slice(0, 1_000)}`);
    }
    const result = await response.json();
    if (!Array.isArray(result.images) || typeof result.images[0] !== 'string') {
      throw new Error('sd.cpp txt2img response did not contain images[0]');
    }
    return {
      rawBuffer: Buffer.from(result.images[0].replace(/^data:image\/\w+;base64,/, ''), 'base64'),
      prompt,
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      seed,
      generationSize,
      steps,
    };
  }
}

export async function generateNewMasters({
  outputRoot,
  manifest,
  contextDatabase,
  client = new SdCppImg2ImgClient(),
  limit = Infinity,
  generationSize = 512,
  masterSize = DEFAULT_MASTER_SIZE,
  steps = 24,
  ids = null,
  continueOnError = false,
  seedOffset = 0,
  verboseRejections = true,
}) {
  let completed = 0;
  const failures = [];
  for (const sheet of manifest.sheets) {
    for (const entry of sheet.entries) {
      if (entry.blank || completed >= limit || (ids && !ids.has(entry.id))) continue;
      try {
      const context = contextDatabase.contextFor(entry);
      const masterPath = path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`);
      const metadataPath = path.join(outputRoot, 'metadata', sheet.sheetId, `${entry.id}.json`);
      if (
        await completedOutputMatches(
          metadataPath,
          masterPath,
          entry.sourceHash,
          'text-to-image',
          context.iconId,
          TEXT_GENERATION_RECIPE,
          masterSize,
        )
      ) {
        completed += 1;
        continue;
      }
      const generated = await client.textToImage({
        entry,
        context,
        generationSize,
        steps,
        attempt: seedOffset,
      });
      let selected = generated;
      let isolated;
      let attempt = 0;
      for (;;) {
        const previewPath = path.join(
          outputRoot,
          'previews',
          sheet.sheetId,
          `${entry.id}-attempt-${attempt + 1}.png`,
        );
        await mkdir(path.dirname(previewPath), { recursive: true });
        await sharp(selected.rawBuffer).png().toFile(previewPath);
        try {
          isolated = await isolateChromaBackground(selected.rawBuffer, {
            maxForegroundComponents: PAIRED_EQUIPMENT_SLOTS.has(context.dominantSlot) ? 2 : 1,
            finalSize: masterSize,
            requireChromaField: true,
          });
          break;
        } catch (error) {
          if (verboseRejections) {
            console.warn(
              `${entry.id} attempt ${attempt + 1} rejected by alpha validation: ${error.message}`,
            );
          }
          if (attempt + 1 >= MAX_BACKGROUND_ATTEMPTS) {
            throw new Error(
              `${entry.id} failed transparent-background validation after ` +
                `${MAX_BACKGROUND_ATTEMPTS} attempts: ${error.message}`,
              { cause: error },
            );
          }
          attempt += 1;
          selected = await client.textToImage({
            entry,
            context,
            generationSize,
            steps,
            attempt: seedOffset + attempt,
          });
        }
      }
      const masterBuffer = isolated.buffer;
      await mkdir(path.dirname(masterPath), { recursive: true });
      await writeFile(masterPath, masterBuffer);
      await writeMetadata({
        outputRoot,
        entry,
        operation: 'text-to-image',
        outputPath: masterPath,
        outputBuffer: masterBuffer,
        prompt: selected.prompt,
        negativePrompt: selected.negativePrompt,
        seed: selected.seed,
        parameters: {
          generationSize: selected.generationSize,
          finalSize: masterSize,
          steps: selected.steps,
          cfgScale: 7,
          recipeVersion: TEXT_GENERATION_RECIPE,
          generationAttempt: attempt + 1,
          seedOffset,
          backgroundIsolation: 'validated edge-field flood, trim, and transparent contain',
          alphaBounds: isolated.alphaBounds,
          opaquePixelRatio: isolated.opaquePixelRatio,
          foregroundComponents: isolated.foregroundComponents,
        },
        context: {
          sqliteIconId: context.iconId,
          recordCount: context.recordCount,
          itemNames: context.itemNames,
          imageNames: context.imageNames,
          equipmentSlots: context.equipmentSlots,
          dominantSlot: context.dominantSlot,
          records: context.records,
        },
        warnings: [
          'Generated without init image',
          'Exterior alpha validated before accepting master',
        ],
      });
      completed += 1;
      if (continueOnError && completed % 50 === 0) {
        console.log(`checkpointed or resumed ${completed} generated masters`);
      }
      } catch (error) {
        if (!continueOnError) throw error;
        failures.push({ id: entry.id, reason: error.message });
        console.error(`${entry.id} failed and was left resumable: ${error.message}`);
      }
    }
  }
  return continueOnError ? { completed, failures } : completed;
}

export async function generateMasters({
  outputRoot,
  manifest,
  client = new SdCppImg2ImgClient(),
  limit = Infinity,
  strength = 0.34,
  generationSize = 512,
  masterSize = DEFAULT_MASTER_SIZE,
  steps = 24,
  ids = null,
}) {
  let completed = 0;
  for (const sheet of manifest.sheets) {
    for (const entry of sheet.entries) {
      if (entry.blank || completed >= limit || (ids && !ids.has(entry.id))) continue;
      const sourcePath = path.join(outputRoot, entry.sourcePath);
      const masterPath = path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`);
      const metadataPath = path.join(outputRoot, 'metadata', sheet.sheetId, `${entry.id}.json`);
      if (
        await completedOutputMatches(
          metadataPath,
          masterPath,
          entry.sourceHash,
          'variation',
          null,
          null,
          masterSize,
        )
      ) {
        completed += 1;
        continue;
      }
      const generated = await client.variation({
        sourcePath,
        entry,
        strength,
        generationSize,
        steps,
      });
      const sourceAlpha = await sharp(sourcePath)
        .resize(masterSize, masterSize, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .extractChannel('alpha')
        .raw()
        .toBuffer();
      const masterBuffer = await sharp(generated.rawBuffer)
        .resize(masterSize, masterSize, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .removeAlpha()
        .joinChannel(sourceAlpha, {
          raw: { width: masterSize, height: masterSize, channels: 1 },
        })
        .png()
        .toBuffer();
      await mkdir(path.dirname(masterPath), { recursive: true });
      await writeFile(masterPath, masterBuffer);
      await writeMetadata({
        outputRoot,
        entry,
        operation: 'variation',
        outputPath: masterPath,
        outputBuffer: masterBuffer,
        prompt: generated.prompt,
        negativePrompt: generated.negativePrompt,
        seed: generated.seed,
        parameters: {
          generationSize: generated.generationSize,
          finalSize: masterSize,
          steps: generated.steps,
          cfgScale: 7,
          denoiseStrength: generated.strength,
        },
        warnings: ['Original source alpha restored after img2img'],
      });
      completed += 1;
    }
  }
  return completed;
}

export async function createPocContactSheet({ outputRoot, manifest, limit = 6 }) {
  const rows = [];
  for (const sheet of manifest.sheets) {
    for (const entry of sheet.entries) {
      if (entry.blank || rows.length >= limit) continue;
      const metadataPath = path.join(outputRoot, 'metadata', sheet.sheetId, `${entry.id}.json`);
      try {
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
        if (!['variation', 'text-to-image'].includes(metadata.operation)) continue;
        rows.push({ sheet, entry, operation: metadata.operation });
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  if (rows.length === 0) throw new Error('No generated variations are available for a POC sheet');
  const rowHeight = 286;
  const composites = [];
  for (const [index, { sheet, entry, operation }] of rows.entries()) {
    const top = index * rowHeight;
    const source = await sharp(path.join(outputRoot, entry.sourcePath))
      .resize(256, 256, { fit: 'fill', kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const master = await sharp(
      path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`),
    )
      .resize(256, 256, { fit: 'fill', kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="576" height="30" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="576" height="30" fill="#101410"/>` +
        `<text x="8" y="21" fill="#e8ddc3" font-family="monospace" font-size="16">` +
        `${entry.id}  LEGACY                 ${operation === 'text-to-image' ? 'NEW FROM SQLITE' : 'VARIATION'}` +
        `</text></svg>`,
    );
    composites.push(
      { input: label, left: 0, top },
      { input: source, left: 8, top: top + 30 },
      { input: master, left: 312, top: top + 30 },
    );
  }
  const outputPath = path.join(outputRoot, 'poc-contact-sheet.png');
  await sharp({
    create: {
      width: 576,
      height: rows.length * rowHeight,
      channels: 4,
      background: '#080b09',
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
  return outputPath;
}

export async function isolateChromaBackground(
  input,
  {
    maxForegroundComponents = 2,
    finalSize = 64,
    requireChromaField = false,
  } = {},
) {
  if (!Number.isInteger(finalSize) || finalSize < 64 || finalSize > 1024) {
    throw new Error(`Final icon size must be an integer from 64 to 1024; received ${finalSize}`);
  }
  const segmentationSize = Math.max(256, finalSize);
  const { data, info } = await sharp(input)
    .resize(segmentationSize, segmentationSize, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const border = [];
  for (let x = 0; x < info.width; x += 1) {
    border.push(pixel(data, info, x, 0), pixel(data, info, x, info.height - 1));
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    border.push(pixel(data, info, 0, y), pixel(data, info, info.width - 1, y));
  }
  const background = [0, 1, 2].map((channel) => {
    const values = border.map((sample) => sample[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  const borderSpread = Math.max(
    ...border.map((sample) => colorDistance(sample, background)),
  );
  const greenField =
    background[1] > 70 && background[1] - Math.max(background[0], background[2]) > 25;
  if (requireChromaField && !greenField) {
    throw new Error(
      `model did not produce the required chroma field ` +
        `(background ${background.join('/')}, spread ${borderSpread})`,
    );
  }
  if (borderSpread > 72 && !greenField) {
    throw new Error(
      `model did not produce a clean uniform edge field ` +
        `(background ${background.join('/')}, spread ${borderSpread})`,
    );
  }
  const backgroundLuminance =
    background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722;
  const initialThreshold =
    backgroundLuminance < 45
      ? Math.max(78, Math.min(112, borderSpread + 82))
      : Math.max(42, Math.min(88, borderSpread + 28));
  const count = info.width * info.height;
  let threshold = initialThreshold;
  let flood = floodBackground(data, info, background, threshold, greenField);
  if (greenField) {
    includeEnclosedChromaField(data, info, background, flood);
  }
  while (!greenField && flood.queue.length / count < 0.2 && threshold < 208) {
    threshold = Math.min(208, threshold + 24);
    flood = floodBackground(data, info, background, threshold, false);
  }
  const { connected, queue } = flood;
  if (queue.length / count < 0.12) {
    throw new Error('edge-connected background covers less than 12% of the image');
  }
  const foregroundComponentSizes = substantialForegroundComponentSizes(connected, info);
  const foregroundComponents = foregroundComponentSizes.length;
  const overflowRatio =
    foregroundComponentSizes[maxForegroundComponents] / foregroundComponentSizes[0];
  if (foregroundComponents > maxForegroundComponents && overflowRatio > 0.18) {
    throw new Error(
      `foreground contains ${foregroundComponents} substantial disconnected subjects; ` +
        `slot permits ${maxForegroundComponents} and overflow ratio is ` +
        `${overflowRatio.toFixed(2)}`,
    );
  }
  const rgba = Buffer.alloc(count * 4);
  let minimumX = info.width;
  let minimumY = info.height;
  let maximumX = -1;
  let maximumY = -1;
  let foregroundPixels = 0;
  for (let index = 0; index < count; index += 1) {
    const sourceOffset = index * info.channels;
    const targetOffset = index * 4;
    rgba[targetOffset] = data[sourceOffset];
    rgba[targetOffset + 1] = data[sourceOffset + 1];
    rgba[targetOffset + 2] = data[sourceOffset + 2];
    const alpha = connected[index] ? 0 : 255;
    rgba[targetOffset + 3] = alpha;
    if (alpha >= 16) {
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      foregroundPixels += 1;
    }
  }
  if (maximumX < 0 || foregroundPixels / count < 0.01) {
    throw new Error('foreground mask is empty');
  }
  if (
    minimumX <= 1 ||
    minimumY <= 1 ||
    maximumX >= info.width - 2 ||
    maximumY >= info.height - 2
  ) {
    throw new Error('foreground touches the image edge');
  }
  if (foregroundPixels / count > 0.72) {
    throw new Error('foreground mask is too large and likely contains a backdrop');
  }
  const boundsWidth = maximumX - minimumX + 1;
  const boundsHeight = maximumY - minimumY + 1;
  const boundsFill = foregroundPixels / (boundsWidth * boundsHeight);
  const rectangleEdgeCoverage = rectangularEdgeCoverage(connected, info, {
    minimumX,
    minimumY,
    maximumX,
    maximumY,
  });
  if (
    boundsWidth / info.width > 0.7 &&
    boundsHeight / info.height > 0.7 &&
    boundsFill > 0.65
  ) {
    throw new Error('foreground mask is a large filled rectangle and likely a card');
  }
  if (
    boundsWidth / info.width > 0.55 &&
    boundsHeight / info.height > 0.55 &&
    boundsWidth / boundsHeight > 0.82 &&
    boundsWidth / boundsHeight < 1.22 &&
    Math.min(...Object.values(rectangleEdgeCoverage)) > 0.38
  ) {
    throw new Error(
      `foreground has a four-sided rectangular boundary and likely contains a card ` +
        `(${Object.values(rectangleEdgeCoverage).map((value) => value.toFixed(2)).join('/')})`,
    );
  }
  const trimLeft = Math.max(0, minimumX - 2);
  const trimTop = Math.max(0, minimumY - 2);
  const trimWidth = Math.min(info.width - trimLeft, maximumX - minimumX + 5);
  const trimHeight = Math.min(info.height - trimTop, maximumY - minimumY + 5);
  const padding = Math.max(4, Math.round(finalSize / 16));
  const containedSize = finalSize - padding * 2;
  const buffer = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({ left: trimLeft, top: trimTop, width: trimWidth, height: trimHeight })
    .resize(containedSize, containedSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const alphaBounds = await validatedAlphaBounds(buffer);
  return {
    buffer,
    alphaBounds,
    opaquePixelRatio: Number((foregroundPixels / count).toFixed(4)),
    foregroundComponents,
    foregroundComponentSizes,
    rectangleEdgeCoverage,
  };
}

function rectangularEdgeCoverage(backgroundMask, info, bounds) {
  const width = bounds.maximumX - bounds.minimumX + 1;
  const height = bounds.maximumY - bounds.minimumY + 1;
  const strip = Math.max(2, Math.round(Math.min(width, height) * 0.035));
  const coverage = (minimumX, minimumY, maximumX, maximumY) => {
    let foreground = 0;
    let pixels = 0;
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (let x = minimumX; x <= maximumX; x += 1) {
        pixels += 1;
        if (!backgroundMask[y * info.width + x]) foreground += 1;
      }
    }
    return foreground / pixels;
  };
  return {
    top: coverage(
      bounds.minimumX,
      bounds.minimumY,
      bounds.maximumX,
      Math.min(bounds.maximumY, bounds.minimumY + strip - 1),
    ),
    right: coverage(
      Math.max(bounds.minimumX, bounds.maximumX - strip + 1),
      bounds.minimumY,
      bounds.maximumX,
      bounds.maximumY,
    ),
    bottom: coverage(
      bounds.minimumX,
      Math.max(bounds.minimumY, bounds.maximumY - strip + 1),
      bounds.maximumX,
      bounds.maximumY,
    ),
    left: coverage(
      bounds.minimumX,
      bounds.minimumY,
      Math.min(bounds.maximumX, bounds.minimumX + strip - 1),
      bounds.maximumY,
    ),
  };
}

function includeEnclosedChromaField(data, info, background, flood) {
  // Edge flooding deliberately protects foreground-colored pixels, but it
  // cannot reach the backdrop visible through a closed ring, necklace, mask
  // eye, or handle. Remove only close matches to the sampled key color here;
  // broad green hue matching would punch holes in emerald subject materials.
  const chromaDistance = 56;
  for (let index = 0; index < flood.connected.length; index += 1) {
    if (flood.connected[index]) continue;
    const offset = index * info.channels;
    const sample = [data[offset], data[offset + 1], data[offset + 2]];
    if (colorDistance(sample, background) >= chromaDistance) continue;
    flood.connected[index] = 1;
    flood.queue.push(index);
  }
}

function substantialForegroundComponentSizes(backgroundMask, info) {
  const visited = new Uint8Array(backgroundMask.length);
  const minimumSize = Math.round(backgroundMask.length * 0.01);
  const componentSizes = [];
  for (let start = 0; start < backgroundMask.length; start += 1) {
    if (backgroundMask[start] || visited[start]) continue;
    visited[start] = 1;
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= info.width ||
            nextY >= info.height
          ) {
            continue;
          }
          const next = nextY * info.width + nextX;
          if (backgroundMask[next] || visited[next]) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    if (queue.length >= minimumSize) componentSizes.push(queue.length);
  }
  return componentSizes.sort((first, second) => second - first);
}

function floodBackground(data, info, background, threshold, greenField) {
  const connected = new Uint8Array(info.width * info.height);
  const queue = [];
  const enqueue = (x, y) => {
    const index = y * info.width + x;
    if (connected[index]) return;
    const sample = pixel(data, info, x, y);
    const isBackground = greenField
      ? sample[1] > 45 && sample[1] > sample[2] + 12 && sample[1] > sample[0] * 0.78
      : colorDistance(sample, background) < threshold;
    if (!isBackground) return;
    connected[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < info.width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < info.height) enqueue(x, y + 1);
  }
  return { connected, queue };
}

async function validatedAlphaBounds(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minimumX = info.width;
  let minimumY = info.height;
  let maximumX = -1;
  let maximumY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha === 0) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }
  if (
    maximumX < 0 ||
    minimumX === 0 ||
    minimumY === 0 ||
    maximumX === info.width - 1 ||
    maximumY === info.height - 1
  ) {
    throw new Error('final icon does not have transparent exterior padding');
  }
  return { minimumX, minimumY, maximumX, maximumY };
}

function pixel(data, info, x, y) {
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

function colorDistance(first, second) {
  return Math.max(
    Math.abs(first[0] - second[0]),
    Math.abs(first[1] - second[1]),
    Math.abs(first[2] - second[2]),
  );
}

async function completedOutputMatches(
  metadataPath,
  outputPath,
  sourceHash,
  expectedOperation,
  expectedContextId = null,
  expectedRecipeVersion = null,
  expectedFinalSize = null,
) {
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const output = await readFile(outputPath);
    return (
      metadata.operation === expectedOperation &&
      metadata.sourceHash === sourceHash &&
      (expectedContextId === null || metadata.context?.sqliteIconId === expectedContextId) &&
      (expectedRecipeVersion === null ||
        metadata.parameters?.recipeVersion === expectedRecipeVersion) &&
      (expectedFinalSize === null || metadata.parameters?.finalSize === expectedFinalSize) &&
      metadata.outputHash === sha256(output)
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
