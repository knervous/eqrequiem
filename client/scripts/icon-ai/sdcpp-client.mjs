import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LocalBackgroundRemover } from './background-removal.mjs';
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

const DEFAULT_NEGATIVE_TERMS = [
  'modern',
  'anachronistic',
  'contemporary',
  'industrial',
  'electronic',
  'firearm',
  'gun',
  'pistol',
  'rifle',
  'grenade',
  'plastic',
  'rubber',
  'zipper',
  'camera',
  'phone',
  'vehicle',
  'science fiction',
  'steampunk',
  'cyberpunk',
  'neon',
  'vector art',
  'flat colors',
  'cartoon',
  'glossy plastic',
  'person',
  'body',
  'human arm',
  'human leg',
  'human foot',
  'sleeve',
  'wearer',
  'equipment worn on body',
  'mannequin',
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
  'backdrop',
  'black background',
  'dark background',
  'colored background',
  'gradient background',
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
];
const DEFAULT_NEGATIVE_PROMPT = DEFAULT_NEGATIVE_TERMS.join(', ');

export const TEXT_GENERATION_RECIPE = 24;
const DEFAULT_MASTER_SIZE = 256;
const MAX_BACKGROUND_ATTEMPTS = 5;
const SAMPLER_NAME = 'euler a';
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

export function negativePromptForContext(context) {
  const paired = PAIRED_EQUIPMENT_SLOTS.has(context.dominantSlot);
  const terms = paired
    ? [
        ...DEFAULT_NEGATIVE_TERMS.filter((term) => term !== 'multiple objects'),
        'weapon',
        'axe',
        'sword',
        'blade',
        'mace',
        'hammer',
        'bow',
        'staff',
        'shield',
        'tool',
        'handle',
        'crossed objects',
        'attached prop',
      ]
    : [...DEFAULT_NEGATIVE_TERMS];
  if (context.dominantSlot === 'hands') {
    terms.push(
      'bracer without fingers',
      'arm guard without fingers',
      'shoulder armor',
      'chest armor',
      'heraldic crest',
    );
  }
  if (context.dominantConcept === 'magical orb') {
    terms.push(
      'product photography',
      'studio photography',
      'display case',
      'glass box',
      'lightbox',
      'square border',
      'perfect reflective sphere',
    );
  }
  return terms.join(', ');
}

async function decodeGeneratedImage(result, expectedSize, operation) {
  const encoded = result?.images?.[0];
  if (typeof encoded !== 'string') {
    throw new Error(`${operation} response did not contain images[0]`);
  }
  const payload = encoded.replace(/^data:image\/[-+\w.]+;base64,/, '');
  const maximumEncodedLength = expectedSize * expectedSize * 12;
  if (payload.length > maximumEncodedLength) {
    throw new Error(
      `${operation} response image exceeds the encoded-size limit ` +
        `(${payload.length} > ${maximumEncodedLength})`,
    );
  }
  const rawBuffer = Buffer.from(payload, 'base64');
  const metadata = await sharp(rawBuffer, {
    limitInputPixels: expectedSize * expectedSize,
  }).metadata();
  if (metadata.width !== expectedSize || metadata.height !== expectedSize) {
    throw new Error(
      `${operation} returned ${metadata.width}x${metadata.height}; ` +
        `expected ${expectedSize}x${expectedSize}`,
    );
  }
  return rawBuffer;
}

const TRANSPORT_RETRY_DELAYS_MS = [1_500, 4_000, 10_000];

async function postGeneration(url, payload, timeoutMs) {
  let lastError;
  for (
    let transportAttempt = 0;
    transportAttempt <= TRANSPORT_RETRY_DELAYS_MS.length;
    transportAttempt += 1
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method: 'POST',
        // sd-server closes completed generation sockets on some Windows
        // builds without making that lifecycle clear to undici. Do not reuse
        // a stale keep-alive connection for the next long-running request.
        headers: {
          'content-type': 'application/json',
          connection: 'close',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (transportAttempt < TRANSPORT_RETRY_DELAYS_MS.length) {
      const delay = TRANSPORT_RETRY_DELAYS_MS[transportAttempt];
      const diagnostic = [
        lastError?.message,
        lastError?.cause?.code,
        lastError?.cause?.message,
      ]
        .filter(Boolean)
        .join(': ');
      console.warn(
        `sd.cpp transport retry ${transportAttempt + 1}/` +
          `${TRANSPORT_RETRY_DELAYS_MS.length} in ${delay}ms (${diagnostic})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export class SdCppImg2ImgClient {
  constructor({
    baseUrl = process.env.SDCPP_URL ?? 'http://127.0.0.1:7860',
    endpoint = process.env.SDCPP_IMG2IMG_ENDPOINT ?? '/sdapi/v1/img2img',
    timeoutMs = Number(process.env.SDCPP_REQUEST_TIMEOUT_MS ?? 300_000),
    allowRemote = process.env.SDCPP_ALLOW_REMOTE === 'true',
  } = {}) {
    this.url = new URL(endpoint, baseUrl);
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(this.url.hostname);
    if (!loopback && !allowRemote) {
      throw new Error(
        `Refusing non-loopback diffusion server: ${this.url.hostname}; ` +
          'set SDCPP_ALLOW_REMOTE=true only for a firewall-restricted trusted LAN worker',
      );
    }
    this.timeoutMs = timeoutMs;
  }

  async variation({
    sourcePath,
    entry,
    prompt = DEFAULT_PROMPT,
    negativePrompt = DEFAULT_NEGATIVE_PROMPT,
    strength = 0.34,
    generationSize = 512,
    steps = 24,
  }) {
    const seed = deterministicSeed(entry);
    const source = await sharp(sourcePath)
      .resize(generationSize, generationSize, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    const startedAt = performance.now();
    let response;
    try {
      response = await postGeneration(
        this.url,
        {
          init_images: [source.toString('base64')],
          prompt,
          negative_prompt: negativePrompt,
          width: generationSize,
          height: generationSize,
          steps,
          cfg_scale: 7,
          sampler_name: SAMPLER_NAME,
          denoising_strength: strength,
          seed,
          batch_size: 1,
          n_iter: 1,
        },
        this.timeoutMs,
      );
    } catch (error) {
      throw new Error(`Local sd.cpp img2img request failed at ${this.url}: ${error.message}`, {
        cause: error,
      });
    }
    if (!response.ok) {
      const diagnostic = (await response.text()).slice(0, 1_000);
      throw new Error(`sd.cpp returned HTTP ${response.status}: ${diagnostic}`);
    }
    const result = await response.json();
    const rawBuffer = await decodeGeneratedImage(
      result,
      generationSize,
      'sd.cpp img2img',
    );
    return {
      rawBuffer,
      prompt,
      negativePrompt,
      seed,
      strength,
      generationSize,
      steps,
      sampler: SAMPLER_NAME,
      inferenceMs: Math.round(performance.now() - startedAt),
      serverInfo: result.info ?? null,
    };
  }

  async textToImage({
    entry,
    context,
    generationSize = 512,
    steps = 24,
    prompt = promptFromContext(context),
    negativePrompt = negativePromptForContext(context),
    attempt = 0,
  }) {
    const seed = (deterministicSeed(entry) + attempt * 104_729) & 0x7fffffff;
    const startedAt = performance.now();
    let response;
    try {
      response = await postGeneration(
        new URL('/sdapi/v1/txt2img', this.url),
        {
          prompt,
          negative_prompt: negativePrompt,
          width: generationSize,
          height: generationSize,
          steps,
          cfg_scale: 7,
          sampler_name: SAMPLER_NAME,
          seed,
          batch_size: 1,
        },
        this.timeoutMs,
      );
    } catch (error) {
      throw new Error(`Local sd.cpp txt2img request failed: ${error.message}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(`sd.cpp txt2img returned HTTP ${response.status}: ${(await response.text()).slice(0, 1_000)}`);
    }
    const result = await response.json();
    const rawBuffer = await decodeGeneratedImage(
      result,
      generationSize,
      'sd.cpp txt2img',
    );
    return {
      rawBuffer,
      prompt,
      negativePrompt,
      seed,
      generationSize,
      steps,
      sampler: SAMPLER_NAME,
      inferenceMs: Math.round(performance.now() - startedAt),
      serverInfo: result.info ?? null,
      generationMode: 'txt2img',
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
  force = false,
  verboseRejections = true,
  backgroundRemover = new LocalBackgroundRemover(),
}) {
  let completed = 0;
  const failures = [];
  for (const sheet of manifest.sheets) {
    for (const entry of sheet.entries) {
      if (entry.blank || completed >= limit || (ids && !ids.has(entry.id))) continue;
      const rejectionDetails = [];
      try {
      const context = contextDatabase.contextFor(entry);
      const masterPath = path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`);
      const metadataPath = path.join(outputRoot, 'metadata', sheet.sheetId, `${entry.id}.json`);
      if (
        !force &&
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
      let inferenceMsTotal = generated.inferenceMs;
      let isolated;
      let attempt = 0;
      let retryReason = null;
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
          isolated = await isolateGeneratedBackground(selected.rawBuffer, {
            maxForegroundComponents: PAIRED_EQUIPMENT_SLOTS.has(context.dominantSlot) ? 2 : 1,
            finalSize: masterSize,
            backgroundRemover,
            subjectShape: context.dominantConcept,
          });
          break;
        } catch (error) {
          retryReason = retryMode(error.message);
          rejectionDetails.push({
            attempt: attempt + 1,
            reason: error.message,
            retryMode: retryReason,
          });
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
            prompt: promptFromContext(context, { retryReason }),
          });
          inferenceMsTotal += selected.inferenceMs;
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
          sampler: selected.sampler,
          recipeVersion: TEXT_GENERATION_RECIPE,
          generationAttempt: attempt + 1,
          seedOffset,
          generationMode: selected.generationMode,
          inferenceMs: inferenceMsTotal,
          backgroundIsolation: isolated.backgroundIsolation,
          backgroundRemovalModel: isolated.backgroundRemovalModel ?? null,
          backgroundRemovalInferenceMs:
            isolated.backgroundRemovalInferenceMs ?? null,
          alphaBounds: isolated.alphaBounds,
          opaquePixelRatio: isolated.opaquePixelRatio,
          foregroundComponents: isolated.foregroundComponents,
          matteRepair: isolated.matteRepair,
        },
        context: {
          sqliteIconId: context.iconId,
          recordCount: context.recordCount,
          itemNames: context.itemNames,
          imageNames: context.imageNames,
          equipmentSlots: context.equipmentSlots,
          dominantSlot: context.dominantSlot,
          dominantConcept: context.dominantConcept,
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
        failures.push({ id: entry.id, reason: error.message, rejections: rejectionDetails });
        console.error(`${entry.id} failed and was left resumable: ${error.message}`);
      }
    }
  }
  return continueOnError ? { completed, failures } : completed;
}

export function summarizeGenerationFailures(failures) {
  const byRetryMode = {};
  const byFailureSet = {};
  let rejectedAttempts = 0;
  for (const failure of failures) {
    for (const rejection of failure.rejections ?? []) {
      rejectedAttempts += 1;
      const retry = rejection.retryMode ?? 'unclassified';
      byRetryMode[retry] = (byRetryMode[retry] ?? 0) + 1;
      const failureSet = rejectionFailureSet(rejection.reason);
      byFailureSet[failureSet] = (byFailureSet[failureSet] ?? 0) + 1;
    }
  }
  return {
    failedIcons: failures.length,
    rejectedAttempts,
    byFailureSet: sortCounts(byFailureSet),
    byRetryMode: sortCounts(byRetryMode),
  };
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
          sampler: generated.sampler,
          denoiseStrength: generated.strength,
          inferenceMs: generated.inferenceMs,
        },
        warnings: ['Original source alpha restored after img2img'],
      });
      completed += 1;
    }
  }
  return completed;
}

export async function createPocContactSheet({
  outputRoot,
  manifest,
  limit = 6,
  ids = null,
  masterSize = DEFAULT_MASTER_SIZE,
  outputFileName = 'poc-contact-sheet.png',
}) {
  const rows = [];
  for (const sheet of manifest.sheets) {
    for (const entry of sheet.entries) {
      if (entry.blank || rows.length >= limit || (ids && !ids.has(entry.id))) continue;
      const metadataPath = path.join(outputRoot, 'metadata', sheet.sheetId, `${entry.id}.json`);
      const masterPath = path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`);
      try {
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
        if (
          !(await completedOutputMatches(
            metadataPath,
            masterPath,
            entry.sourceHash,
            'text-to-image',
            entry.atlasIconId,
            TEXT_GENERATION_RECIPE,
            masterSize,
          ))
        ) {
          continue;
        }
        rows.push({ sheet, entry, metadata });
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  const expectedCount = ids ? ids.size : limit;
  if (rows.length !== expectedCount) {
    throw new Error(
      `POC contact sheet requires ${expectedCount} current outputs, but found ${rows.length}`,
    );
  }
  const rowHeight = 316;
  const sheetWidth = 880;
  const composites = [];
  const checkerboard = Buffer.from(
    `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><pattern id="c" width="24" height="24" patternUnits="userSpaceOnUse">` +
      `<rect width="24" height="24" fill="#202620"/>` +
      `<rect width="12" height="12" fill="#343b33"/>` +
      `<rect x="12" y="12" width="12" height="12" fill="#343b33"/>` +
      `</pattern></defs><rect width="256" height="256" fill="url(#c)"/></svg>`,
  );
  for (const [index, { sheet, entry, metadata }] of rows.entries()) {
    const top = index * rowHeight;
    const source = await sharp(path.join(outputRoot, entry.sourcePath))
      .resize(256, 256, { fit: 'fill', kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const attempt = metadata.parameters.generationAttempt;
    const raw = await sharp(
      path.join(
        outputRoot,
        'previews',
        sheet.sheetId,
        `${entry.id}-attempt-${attempt}.png`,
      ),
    )
      .resize(256, 256, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    const master = await sharp(checkerboard)
      .composite([
        {
          input: await sharp(
            path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`),
          )
            .resize(256, 256, { fit: 'fill', kernel: sharp.kernel.nearest })
            .png()
            .toBuffer(),
        },
      ])
      .resize(256, 256, { fit: 'fill', kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const itemCue = metadata.context?.itemNames?.[0] ?? 'no SQLite item name';
    const label = Buffer.from(
      `<svg width="${sheetWidth}" height="60" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${sheetWidth}" height="60" fill="#101410"/>` +
        `<text x="8" y="20" fill="#e8ddc3" font-family="monospace" font-size="15">` +
        `${escapeXml(entry.id)} · icon ${entry.atlasIconId} · seed ${metadata.seed} · ${escapeXml(itemCue)}` +
        `</text>` +
        `<text x="8" y="48" fill="#9ca89c" font-family="monospace" font-size="14">LEGACY</text>` +
        `<text x="312" y="48" fill="#9ca89c" font-family="monospace" font-size="14">SELECTED RAW</text>` +
        `<text x="616" y="48" fill="#9ca89c" font-family="monospace" font-size="14">FINAL ALPHA</text>` +
        `</svg>`,
    );
    composites.push(
      { input: label, left: 0, top },
      { input: source, left: 8, top: top + 60 },
      { input: raw, left: 312, top: top + 60 },
      { input: master, left: 616, top: top + 60 },
    );
  }
  const outputPath = path.join(outputRoot, outputFileName);
  await sharp({
    create: {
      width: sheetWidth,
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

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function isolateGeneratedBackground(
  input,
  {
    maxForegroundComponents = 2,
    finalSize = 64,
    backgroundRemover = new LocalBackgroundRemover(),
    subjectShape = null,
  } = {},
) {
  try {
    const isolated = await isolateChromaBackground(input, {
      maxForegroundComponents,
      finalSize,
      requireChromaField: true,
      subjectShape,
    });
    return {
      ...isolated,
      backgroundIsolation: 'validated chroma/neutral edge-field segmentation',
    };
  } catch (chromaError) {
    if (!(await backgroundRemover.available())) throw chromaError;
    try {
      const removed = await backgroundRemover.remove(input);
      const { data, info } = await sharp(removed.buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const isolated = await normalizeSegmentedSubject(data, info, {
        maxForegroundComponents,
        finalSize,
        subjectShape,
      });
      return {
        ...isolated,
        backgroundIsolation:
          'local U2Net matte with border-palette cleanup and validated transparent contain',
        backgroundRemovalModel: removed.modelId,
        backgroundRemovalInferenceMs: removed.inferenceMs,
        backgroundRemovalMaskRange: removed.maskRange,
        chromaFallbackReason: chromaError.message,
      };
    } catch (backgroundError) {
      throw new Error(
        `local background removal failed validation: ${backgroundError.message}`,
        { cause: backgroundError },
      );
    }
  }
}

export async function isolateChromaBackground(
  input,
  {
    maxForegroundComponents = 2,
    finalSize = 64,
    requireChromaField = false,
    subjectShape = null,
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
  const backgroundHsv = rgbToHsv(background);
  const saturatedBorderHues = border
    .map(rgbToHsv)
    .filter((sample) => sample.saturation >= 0.18 && sample.value >= 40)
    .map((sample) => hueDistance(sample.hue, backgroundHsv.hue))
    .sort((first, second) => first - second);
  const borderHueP90 =
    saturatedBorderHues[Math.floor(saturatedBorderHues.length * 0.9)] ?? 180;
  const preferredDarkKeyHue =
    (backgroundHsv.hue >= 80 && backgroundHsv.hue <= 200) ||
    (backgroundHsv.hue >= 285 && backgroundHsv.hue <= 335);
  const vividChromaField =
    (backgroundHsv.value >= 175 ||
      (backgroundHsv.value >= 90 && preferredDarkKeyHue)) &&
    backgroundHsv.saturation >= 0.35 &&
    saturatedBorderHues.length >= border.length * 0.65 &&
    borderHueP90 <= 42;
  const cleanNeutralField =
    backgroundHsv.value >= 180 &&
    borderSpread <= 18 &&
    Math.max(...background) - Math.min(...background) <= 12;
  const removableField = vividChromaField || cleanNeutralField;
  if (requireChromaField && !removableField) {
    throw new Error(
      `model did not produce a clean removable field ` +
        `(background ${background.join('/')}, spread ${borderSpread})`,
    );
  }
  if (borderSpread > 72 && !removableField) {
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
  if (cleanNeutralField) threshold = Math.min(24, borderSpread + 12);
  let flood = floodBackground(
    data,
    info,
    background,
    threshold,
    vividChromaField ? backgroundHsv : null,
  );
  if (removableField) {
    includeEnclosedChromaField(data, info, background, flood, {
      maximumDistance: vividChromaField ? 56 : 18,
    });
  }
  while (
    !removableField &&
    flood.queue.length / count < 0.2 &&
    threshold < 208
  ) {
    threshold = Math.min(208, threshold + 24);
    flood = floodBackground(data, info, background, threshold, null);
  }
  const { connected, queue } = flood;
  if (queue.length / count < 0.12) {
    throw new Error('edge-connected background covers less than 12% of the image');
  }
  const rgba = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    const sourceOffset = index * info.channels;
    const targetOffset = index * 4;
    rgba[targetOffset] = data[sourceOffset];
    rgba[targetOffset + 1] = data[sourceOffset + 1];
    rgba[targetOffset + 2] = data[sourceOffset + 2];
    rgba[targetOffset + 3] = connected[index] ? 0 : 255;
  }
  return normalizeSegmentedSubject(rgba, { ...info, channels: 4 }, {
    maxForegroundComponents,
    finalSize,
    subjectShape,
  });
}

async function normalizeSegmentedSubject(
  rgba,
  info,
  { maxForegroundComponents, finalSize, subjectShape = null },
) {
  repairSubjectMatte(rgba, info, subjectShape);
  const count = info.width * info.height;
  const backgroundMask = new Uint8Array(count);
  let minimumX = info.width;
  let minimumY = info.height;
  let maximumX = -1;
  let maximumY = -1;
  let foregroundPixels = 0;
  for (let index = 0; index < count; index += 1) {
    const alpha = rgba[index * info.channels + 3];
    if (alpha < 16) {
      backgroundMask[index] = 1;
      continue;
    }
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
    foregroundPixels += 1;
  }
  if (maximumX < 0 || foregroundPixels / count < 0.01) {
    throw new Error('foreground mask is empty');
  }
  const foregroundComponentSizes = substantialForegroundComponentSizes(
    backgroundMask,
    info,
  );
  const foregroundComponents = foregroundComponentSizes.length;
  if (foregroundComponents > maxForegroundComponents) {
    const overflowRatio =
      foregroundComponentSizes[maxForegroundComponents] /
      foregroundComponentSizes[0];
    if (overflowRatio > 0.18) {
      throw new Error(
        `foreground contains ${foregroundComponents} substantial disconnected subjects; ` +
          `slot permits ${maxForegroundComponents} and overflow ratio is ` +
          `${overflowRatio.toFixed(2)}`,
      );
    }
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
  const rectangleEdgeCoverage = rectangularEdgeCoverage(backgroundMask, info, {
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
    raw: { width: info.width, height: info.height, channels: info.channels },
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
    matteRepair:
      subjectShape === 'finger ring'
        ? 'outer ring silhouette and small alpha holes repaired; neutral finger opening preserved'
        : subjectShape === 'necklace'
          ? 'large central neutral-field opening cleared'
        : subjectShape === 'magical orb'
          ? 'solid elliptical orb contour repaired'
          : null,
  };
}

function repairSubjectMatte(rgba, info, subjectShape) {
  if (subjectShape === 'finger ring') {
    fillRingSilhouetteAlpha(rgba, info);
    clearCentralNeutralField(rgba, info);
    fillSmallEnclosedAlphaHoles(rgba, info, 0.025);
  } else if (subjectShape === 'necklace') {
    clearCentralNeutralField(rgba, info);
  } else if (subjectShape === 'magical orb') {
    fillOrbAlpha(rgba, info);
  }
}

function clearCentralNeutralField(rgba, info) {
  const count = info.width * info.height;
  const centerX = Math.floor(info.width / 2);
  const centerY = Math.floor(info.height / 2);
  const candidates = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * info.channels;
    const hsv = rgbToHsv([rgba[offset], rgba[offset + 1], rgba[offset + 2]]);
    if (hsv.saturation <= 0.2 && hsv.value >= 175) candidates[index] = 1;
  }
  let start = centerY * info.width + centerX;
  if (!candidates[start]) {
    const radius = Math.round(Math.min(info.width, info.height) * 0.12);
    let bestValue = -1;
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        const index = y * info.width + x;
        if (!candidates[index]) continue;
        const offset = index * info.channels;
        const value = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
        if (value <= bestValue) continue;
        bestValue = value;
        start = index;
      }
    }
    if (bestValue < 0) return;
  }
  const visited = new Uint8Array(count);
  visited[start] = 1;
  const region = [start];
  for (let cursor = 0; cursor < region.length; cursor += 1) {
    const index = region[cursor];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    for (const [offsetX, offsetY] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
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
      if (!candidates[next] || visited[next]) continue;
      visited[next] = 1;
      region.push(next);
    }
  }
  if (region.length / count < 0.02 || region.length / count > 0.48) return;
  for (const index of region) rgba[index * info.channels + 3] = 0;
}

function fillRingSilhouetteAlpha(rgba, info) {
  for (let y = 0; y < info.height; y += 1) {
    let left = info.width;
    let right = -1;
    let foreground = 0;
    for (let x = 0; x < info.width; x += 1) {
      if (rgba[(y * info.width + x) * info.channels + 3] < 16) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      foreground += 1;
    }
    const span = right - left + 1;
    if (
      right < 0 ||
      span < info.width * 0.08 ||
      span > info.width * 0.8 ||
      foreground / span < 0.05
    ) {
      continue;
    }
    for (let x = left; x <= right; x += 1) {
      rgba[(y * info.width + x) * info.channels + 3] = 255;
    }
  }
}

function fillSmallEnclosedAlphaHoles(rgba, info, maximumRatio) {
  const count = info.width * info.height;
  const visited = new Uint8Array(count);
  const maximumPixels = Math.round(count * maximumRatio);
  for (let start = 0; start < count; start += 1) {
    if (visited[start] || rgba[start * info.channels + 3] >= 16) continue;
    visited[start] = 1;
    const region = [start];
    let touchesEdge = false;
    for (let cursor = 0; cursor < region.length; cursor += 1) {
      const index = region[cursor];
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) {
        touchesEdge = true;
      }
      for (const [offsetX, offsetY] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
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
        if (visited[next] || rgba[next * info.channels + 3] >= 16) continue;
        visited[next] = 1;
        region.push(next);
      }
    }
    if (touchesEdge || region.length > maximumPixels) continue;
    for (const index of region) rgba[index * info.channels + 3] = 255;
  }
}

function fillOrbAlpha(rgba, info) {
  let minimumX = info.width;
  let minimumY = info.height;
  let maximumX = -1;
  let maximumY = -1;
  for (let index = 0; index < info.width * info.height; index += 1) {
    if (rgba[index * info.channels + 3] < 16) continue;
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
  }
  if (maximumX < 0) return;
  const width = maximumX - minimumX + 1;
  const height = maximumY - minimumY + 1;
  const aspect = width / height;
  if (aspect < 0.72 || aspect > 1.38) return;
  const centerX = (minimumX + maximumX) / 2;
  const centerY = (minimumY + maximumY) / 2;
  const radiusX = width / 2;
  const radiusY = height / 2;
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const normalizedRadius = Math.sqrt(
        ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2,
      );
      if (normalizedRadius > 1) continue;
      const targetAlpha =
        normalizedRadius <= 0.97
          ? 255
          : Math.round(((1 - normalizedRadius) / 0.03) * 255);
      const offset = (y * info.width + x) * info.channels + 3;
      rgba[offset] = Math.max(rgba[offset], targetAlpha);
    }
  }
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

function includeEnclosedChromaField(
  data,
  info,
  background,
  flood,
  { maximumDistance = 56 } = {},
) {
  // Edge flooding deliberately protects foreground-colored pixels, but it
  // cannot reach the backdrop visible through a closed ring, necklace, mask
  // eye, or handle. Remove only close matches to the sampled key color here;
  // broad green hue matching would punch holes in emerald subject materials.
  for (let index = 0; index < flood.connected.length; index += 1) {
    if (flood.connected[index]) continue;
    const offset = index * info.channels;
    const sample = [data[offset], data[offset + 1], data[offset + 2]];
    if (colorDistance(sample, background) >= maximumDistance) continue;
    flood.connected[index] = 1;
    flood.queue.push(index);
  }
}

function retryMode(message) {
  if (
    /chroma field|removable field|edge field|background covers|card|frame|rectangle|backdrop/.test(
      message,
    )
  ) {
    return 'chroma';
  }
  if (/disconnected subjects|multiple|component/.test(message)) return 'subjects';
  if (/touches the image edge|cropped/.test(message)) return 'edge';
  return null;
}

function rejectionFailureSet(message) {
  if (/card|frame|rectangle|backdrop/.test(message)) return 'presentation-card-or-backdrop';
  if (/disconnected subjects|multiple|component/.test(message)) return 'multiple-subjects';
  if (/touches the image edge|cropped/.test(message)) return 'edge-contact-or-crop';
  if (/foreground mask is empty/.test(message)) return 'empty-foreground';
  if (/chroma field|removable field|edge field|background covers/.test(message)) {
    return 'non-removable-background';
  }
  if (/insufficient.*background|background.*insufficient/.test(message)) {
    return 'insufficient-edge-background';
  }
  return 'other';
}

function sortCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
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

function floodBackground(data, info, background, threshold, chromaHsv) {
  const connected = new Uint8Array(info.width * info.height);
  const queue = [];
  const enqueue = (x, y) => {
    const index = y * info.width + x;
    if (connected[index]) return;
    const sample = pixel(data, info, x, y);
    const closeColor = colorDistance(sample, background) < threshold;
    const sampleHsv = chromaHsv ? rgbToHsv(sample) : null;
    const followsChromaGradient =
      chromaHsv &&
      sampleHsv.value >= 28 &&
      sampleHsv.saturation >= 0.18 &&
      hueDistance(sampleHsv.hue, chromaHsv.hue) <= 62;
    const isBackground = closeColor || followsChromaGradient;
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

function rgbToHsv([red, green, blue]) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;
  let hue = 0;
  if (chroma > 0) {
    if (maximum === red) hue = ((green - blue) / chroma) % 6;
    else if (maximum === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return {
    hue,
    saturation: maximum === 0 ? 0 : chroma / maximum,
    value: maximum,
  };
}

function hueDistance(first, second) {
  const difference = Math.abs(first - second);
  return Math.min(difference, 360 - difference);
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
