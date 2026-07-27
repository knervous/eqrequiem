import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { sha256, writeMetadata } from './sprite-pipeline.mjs';

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
  'cropped object',
  'clutter',
  'photorealistic scene',
  'hands',
  'character portrait',
  'blurry',
  'malformed object',
].join(', ');

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

  async variation({ sourcePath, entry, prompt = DEFAULT_PROMPT, strength = 0.34 }) {
    const seed = deterministicSeed(entry);
    const source = await sharp(sourcePath)
      .resize(512, 512, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
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
          width: 512,
          height: 512,
          steps: 24,
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
      serverInfo: result.info ?? null,
    };
  }
}

export async function generateMasters({
  outputRoot,
  manifest,
  client = new SdCppImg2ImgClient(),
  limit = Infinity,
  strength = 0.34,
}) {
  let completed = 0;
  for (const sheet of manifest.sheets) {
    for (const entry of sheet.entries) {
      if (entry.blank || completed >= limit) continue;
      const sourcePath = path.join(outputRoot, entry.sourcePath);
      const masterPath = path.join(outputRoot, 'masters', sheet.sheetId, `${entry.id}.png`);
      const metadataPath = path.join(outputRoot, 'metadata', sheet.sheetId, `${entry.id}.json`);
      if (await completedOutputMatches(metadataPath, masterPath, entry.sourceHash)) {
        completed += 1;
        continue;
      }
      const generated = await client.variation({ sourcePath, entry, strength });
      const sourceAlpha = await sharp(sourcePath)
        .resize(64, 64, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .extractChannel('alpha')
        .raw()
        .toBuffer();
      const masterBuffer = await sharp(generated.rawBuffer)
        .resize(64, 64, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .removeAlpha()
        .joinChannel(sourceAlpha, { raw: { width: 64, height: 64, channels: 1 } })
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
          generationSize: 512,
          finalSize: 64,
          steps: 24,
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

async function completedOutputMatches(metadataPath, outputPath, sourceHash) {
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const output = await readFile(outputPath);
    return (
      metadata.operation === 'variation' &&
      metadata.sourceHash === sourceHash &&
      metadata.outputHash === sha256(output)
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
