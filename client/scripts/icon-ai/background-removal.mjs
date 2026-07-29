import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

export const DEFAULT_BACKGROUND_MODEL = path.join(
  repositoryRoot,
  'Hunyuan3D-2',
  '.cache',
  'u2net',
  'u2net.onnx',
);

const MODEL_SIZE = 320;
const IMAGE_NET_MEAN = [0.485, 0.456, 0.406];
const IMAGE_NET_STANDARD_DEVIATION = [0.229, 0.224, 0.225];
const MATTE_LOW = 0.18;
const MATTE_HIGH = 0.83;
const MINIMUM_ALPHA = 24;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export class LocalBackgroundRemover {
  constructor({
    modelPath = process.env.ICON_AI_BACKGROUND_MODEL ?? DEFAULT_BACKGROUND_MODEL,
  } = {}) {
    this.modelPath = path.resolve(modelPath);
    this.sessionPromise = null;
  }

  async available() {
    return exists(this.modelPath);
  }

  async remove(input) {
    const session = await this.#session();
    const { data, info } = await sharp(input, {
      limitInputPixels: 16_777_216,
    })
      .rotate()
      .resize(MODEL_SIZE, MODEL_SIZE, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const planar = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
    const planeSize = MODEL_SIZE * MODEL_SIZE;
    for (let pixel = 0; pixel < planeSize; pixel += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        planar[channel * planeSize + pixel] =
          (data[pixel * info.channels + channel] / 255 -
            IMAGE_NET_MEAN[channel]) /
          IMAGE_NET_STANDARD_DEVIATION[channel];
      }
    }
    const feeds = {
      [session.inputNames[0]]: new ort.Tensor(
        'float32',
        planar,
        [1, 3, MODEL_SIZE, MODEL_SIZE],
      ),
    };
    const startedAt = performance.now();
    const outputs = await session.run(feeds);
    const inferenceMs = Math.round(performance.now() - startedAt);
    const prediction = outputs[session.outputNames[0]];
    if (
      prediction?.type !== 'float32' ||
      prediction.data.length !== planeSize
    ) {
      throw new Error('Local background model returned an invalid foreground mask');
    }
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const value of prediction.data) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    if (!Number.isFinite(minimum) || maximum - minimum < 1e-6) {
      throw new Error('Local background model returned an empty foreground range');
    }
    const rgba = Buffer.alloc(planeSize * 4);
    for (let pixel = 0; pixel < planeSize; pixel += 1) {
      const sourceOffset = pixel * info.channels;
      const targetOffset = pixel * 4;
      rgba[targetOffset] = data[sourceOffset];
      rgba[targetOffset + 1] = data[sourceOffset + 1];
      rgba[targetOffset + 2] = data[sourceOffset + 2];
      const normalized =
        (prediction.data[pixel] - minimum) / (maximum - minimum);
      const alpha = Math.round(
        Math.max(0, Math.min(1, (normalized - MATTE_LOW) / (MATTE_HIGH - MATTE_LOW))) *
          255,
      );
      rgba[targetOffset + 3] = alpha < MINIMUM_ALPHA ? 0 : alpha;
    }
    removeLargeBorderColorRegions(rgba, data, info);
    return {
      buffer: await sharp(rgba, {
        raw: {
          width: MODEL_SIZE,
          height: MODEL_SIZE,
          channels: 4,
        },
      })
        .png()
        .toBuffer(),
      inferenceMs,
      maskRange: {
        minimum: Number(minimum.toFixed(6)),
        maximum: Number(maximum.toFixed(6)),
      },
      modelId: path.basename(this.modelPath),
    };
  }

  async #session() {
    if (!(await this.available())) {
      throw new Error(
        `Local background model not found: ${this.modelPath}. ` +
          'Set ICON_AI_BACKGROUND_MODEL or supply a clean chroma-key generation.',
      );
    }
    this.sessionPromise ??= ort.InferenceSession.create(this.modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
    return this.sessionPromise;
  }
}

function removeLargeBorderColorRegions(rgba, rgb, info) {
  const paletteCounts = new Map();
  let borderSamples = 0;
  const add = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    const key = quantizedColorKey(rgb[offset], rgb[offset + 1], rgb[offset + 2]);
    paletteCounts.set(key, (paletteCounts.get(key) ?? 0) + 1);
    borderSamples += 1;
  };
  for (let x = 0; x < info.width; x += 1) {
    add(x, 0);
    add(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    add(0, y);
    add(info.width - 1, y);
  }
  const minimumPaletteSamples = Math.max(6, Math.round(borderSamples * 0.01));
  const palette = new Set(
    [...paletteCounts]
      .filter(([, samples]) => samples >= minimumPaletteSamples)
      .map(([key]) => key),
  );
  const count = info.width * info.height;
  const matching = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * info.channels;
    if (matchesQuantizedPalette(rgb[offset], rgb[offset + 1], rgb[offset + 2], palette)) {
      matching[pixel] = 1;
    }
  }
  const visited = new Uint8Array(count);
  const minimumRegionSize = Math.round(count * 0.003);
  for (let start = 0; start < count; start += 1) {
    if (!matching[start] || visited[start]) continue;
    visited[start] = 1;
    const region = [start];
    for (let cursor = 0; cursor < region.length; cursor += 1) {
      const pixel = region[cursor];
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
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
          if (!matching[next] || visited[next]) continue;
          visited[next] = 1;
          region.push(next);
        }
      }
    }
    if (region.length < minimumRegionSize) continue;
    const lowConfidencePixels = region.reduce(
      (total, pixel) => total + (rgba[pixel * 4 + 3] < 200 ? 1 : 0),
      0,
    );
    if (lowConfidencePixels / region.length < 0.25) continue;
    for (const pixel of region) rgba[pixel * 4 + 3] = 0;
  }
}

function matchesQuantizedPalette(red, green, blue, palette) {
  const quantized = [red >> 4, green >> 4, blue >> 4];
  for (let redOffset = -1; redOffset <= 1; redOffset += 1) {
    for (let greenOffset = -1; greenOffset <= 1; greenOffset += 1) {
      for (let blueOffset = -1; blueOffset <= 1; blueOffset += 1) {
        const channels = [
          quantized[0] + redOffset,
          quantized[1] + greenOffset,
          quantized[2] + blueOffset,
        ];
        if (channels.some((channel) => channel < 0 || channel > 15)) continue;
        if (palette.has(channels[0] << 8 | channels[1] << 4 | channels[2])) {
          return true;
        }
      }
    }
  }
  return false;
}

function quantizedColorKey(red, green, blue) {
  return red >> 4 << 8 | green >> 4 << 4 | blue >> 4;
}
