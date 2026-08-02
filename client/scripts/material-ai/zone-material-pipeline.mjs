#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import sharp from "sharp";
import {
  bakeZoneMaterialPalette,
  extractPaletteSources,
  paletteRoot,
  readPaletteManifest,
  RUNTIME_TEXTURE_SIZE,
  verifyBakedPalette,
} from "./zone-material-palette.mjs";
import {
  accessorValues,
  baseColorBindings,
  embeddedImage,
  parseGlb,
} from "./glb-material-palette.mjs";
import { preprocessZoneSceneGlb } from "../promote-zone-object-assets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const DEFAULT_ZONE = "qeynos2";
const DEFAULT_SERVER = "http://127.0.0.1:7860";
const RECIPE_VERSION = 1;
const SAMPLER = "euler a";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArguments(arguments_) {
  const options = {};
  const positional = [];
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const name = argument.slice(2);
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) {
      options[name] = true;
    } else {
      options[name] = value;
      index++;
    }
  }
  return { command: positional[0] ?? "help", options };
}

function integerOption(options, name, fallback) {
  const value =
    options[name] === undefined ? fallback : Number.parseInt(options[name], 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function numberOption(options, name, fallback) {
  const value = options[name] === undefined ? fallback : Number(options[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`--${name} must be numeric`);
  }
  return value;
}

async function sourceScene(zone) {
  for (const extension of [".glb.gz", ".glb"]) {
    const file = path.join(
      repoRoot,
      "assets",
      "reference",
      "everquest_rof2",
      "zones",
      `${zone}${extension}`,
    );
    try {
      const stored = await fs.readFile(file);
      return {
        file,
        glb: extension.endsWith(".gz") ? gunzipSync(stored) : stored,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`No source GLB is available for ${zone}`);
}

function deterministicSeed(entry, attempt = 0) {
  const sourceKey =
    entry.sourceSha256 ??
    (entry.authoringOnly ? `authoring-only:${entry.id}` : null);
  if (!sourceKey) {
    throw new Error(`${entry.id} has no deterministic material source key`);
  }
  const value = createHash("sha256")
    .update(
      `${sourceKey}:${entry.id}:material-recipe-${RECIPE_VERSION}`,
    )
    .digest()
    .readUInt32LE(0);
  return ((value & 0x7fffffff) + attempt * 104729) & 0x7fffffff;
}

function materialFamily(manifest, entry) {
  if (!entry.family) return null;
  const family = manifest.families?.[entry.family];
  if (!family) {
    throw new Error(
      `${entry.id} references unknown material family '${entry.family}'`,
    );
  }
  return family;
}

function generationModeFor(manifest, entry) {
  return (
    entry.generationMode ??
    materialFamily(manifest, entry)?.generationMode ??
    manifest.generationMode ??
    "txt2img-clean-room"
  );
}

function postProcessFor(manifest, entry) {
  return (
    entry.postProcess ?? materialFamily(manifest, entry)?.postProcess ?? null
  );
}

function composedPrompt(manifest, entry) {
  if (entry.promptOverride) return entry.promptOverride;
  const family = materialFamily(manifest, entry);
  const generationMode = generationModeFor(manifest, entry);
  return [
    entry.prompt ?? family?.prompt,
    generationMode === "img2img"
      ? "preserve the source material layout, motif scale, orientation, and coverage"
      : "create a wholly new clean-room material; do not reproduce any legacy bitmap pattern",
    "high-detail seamless tileable game environment texture",
    family?.orientation ??
      "straight-down overhead close-up with the material filling the entire frame",
    "flat diffuse overcast illumination, crisp surface detail",
    "no perspective, no horizon, no directional shadow",
    manifest.promptPrefix,
  ].join(", ");
}

function composedNegativePrompt(manifest, entry) {
  if (entry.negativePromptOverride) return entry.negativePromptOverride;
  return [
    manifest.negativePrompt,
    materialFamily(manifest, entry)?.negativePrompt,
    entry.negativePromptSuffix,
  ]
    .filter(Boolean)
    .join(", ");
}

async function requestMaterial({
  baseUrl,
  source,
  entry,
  manifest,
  generationSize,
  steps,
  attempt,
}) {
  const generationMode = generationModeFor(manifest, entry);
  const usesInitImage =
    generationMode === "img2img" ||
    generationMode === "img2img-procedural-guide";
  const endpoint = new URL(
    usesInitImage ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img",
    baseUrl,
  );
  if (
    !["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname) &&
    process.env.SDCPP_ALLOW_REMOTE !== "true"
  ) {
    throw new Error(
      `Refusing non-loopback diffusion server: ${endpoint.hostname}; ` +
        "set SDCPP_ALLOW_REMOTE=true for a trusted LAN worker",
    );
  }
  const prompt = composedPrompt(manifest, entry);
  const negativePrompt = composedNegativePrompt(manifest, entry);
  const seed = deterministicSeed(entry, attempt);
  const timeoutMs = Number(process.env.SDCPP_REQUEST_TIMEOUT_MS ?? 600_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(usesInitImage
          ? {
              init_images: [
                (
                  await sharp(source)
                    .resize(generationSize, generationSize, {
                      fit: "fill",
                      kernel: sharp.kernel.lanczos3,
                    })
                    .png()
                    .toBuffer()
                ).toString("base64"),
              ],
              denoising_strength:
                entry.denoiseStrength ??
                materialFamily(manifest, entry)?.denoiseStrength,
            }
          : {}),
        prompt,
        negative_prompt: negativePrompt,
        width: generationSize,
        height: generationSize,
        steps,
        cfg_scale: manifest.cfgScale,
        sampler_name: SAMPLER,
        seed,
        batch_size: 1,
        n_iter: 1,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(
      `Local sd.cpp returned HTTP ${response.status}: ` +
        `${(await response.text()).slice(0, 1000)}`,
    );
  }
  const result = await response.json();
  const encoded = result?.images?.[0];
  if (typeof encoded !== "string") {
    throw new Error("Local sd.cpp img2img response did not contain images[0]");
  }
  const raw = Buffer.from(
    encoded.replace(/^data:image\/[-+\w.]+;base64,/, ""),
    "base64",
  );
  const metadata = await sharp(raw).metadata();
  if (metadata.width !== generationSize || metadata.height !== generationSize) {
    throw new Error(
      `Local sd.cpp returned ${metadata.width}x${metadata.height}, ` +
        `expected ${generationSize}x${generationSize}`,
    );
  }
  return {
    raw,
    prompt,
    negativePrompt,
    seed,
    inferenceMs: Math.round(performance.now() - startedAt),
    serverInfo: result.info ?? null,
    generationMode,
  };
}

function seededRandom(key) {
  let state = createHash("sha256").update(key).digest().readUInt32LE(0);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function colorVariation(base, random, range = 18) {
  return base.map((value) =>
    Math.max(0, Math.min(255, Math.round(value + (random() * 2 - 1) * range))),
  );
}

export async function proceduralMaterialGuide(entry, size) {
  const random = seededRandom(`eltania:${entry.id}:procedural-guide-v4`);
  if (entry.id === "grass-terrain" || entry.id === "fieldstone-path") {
    const grass = [];
    const bladeCount = Math.round((size * size) / 58);
    for (let index = 0; index < bladeCount; index++) {
      const x = random() * size;
      const y = random() * size;
      const pathCenter =
        size * 0.5 + Math.sin((y / size) * Math.PI * 2) * size * 0.025;
      const onPath =
        entry.id === "fieldstone-path" &&
        Math.abs(x - pathCenter) < size * 0.15;
      if (onPath) continue;
      const length = size * (0.002 + random() * 0.007);
      const angle = random() * Math.PI * 2;
      const [r, g, b] = colorVariation(
        random() < 0.08 ? [126, 116, 72] : [55, 101, 59],
        random,
        18,
      );
      grass.push(
        `<line x1="${x}" y1="${y}" ` +
          `x2="${x + Math.cos(angle) * length}" ` +
          `y2="${y + Math.sin(angle) * length}" ` +
          `stroke="rgb(${r},${g},${b})" ` +
          `stroke-width="${0.5 + random() * 1.3}" stroke-linecap="round"/>`,
      );
    }
    const path =
      entry.id === "fieldstone-path"
        ? `<path d="M ${size * 0.35} -20 ` +
          `C ${size * 0.39} ${size * 0.25}, ${size * 0.31} ${size * 0.5}, ${size * 0.37} ${size * 0.75} ` +
          `C ${size * 0.41} ${size * 0.9}, ${size * 0.36} ${size}, ${size * 0.36} ${size + 20} ` +
          `L ${size * 0.65} ${size + 20} ` +
          `C ${size * 0.62} ${size * 0.75}, ${size * 0.69} ${size * 0.5}, ${size * 0.63} ${size * 0.25} ` +
          `C ${size * 0.6} ${size * 0.1}, ${size * 0.66} 0, ${size * 0.65} -20 Z" ` +
          `fill="#70533a"/>`
        : "";
    const pathDetails = [];
    if (entry.id === "fieldstone-path") {
      for (let index = 0; index < 52; index++) {
        const y = random() * size;
        const center =
          size * 0.5 + Math.sin((y / size) * Math.PI * 2) * size * 0.025;
        const x = center + (random() - 0.5) * size * 0.2;
        const rx = size * (0.012 + random() * 0.025);
        const ry = size * (0.008 + random() * 0.018);
        const stonePalette = [
          [125, 124, 113],
          [109, 113, 110],
          [137, 129, 108],
          [103, 107, 96],
        ];
        const [r, g, b] = colorVariation(
          stonePalette[Math.floor(random() * stonePalette.length)],
          random,
          12,
        );
        pathDetails.push(
          `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ` +
            `transform="rotate(${random() * 90} ${x} ${y})" ` +
            `fill="rgb(${r},${g},${b})"/>`,
        );
      }
      for (let index = 0; index < 1800; index++) {
        const y = random() * size;
        const center =
          size * 0.5 + Math.sin((y / size) * Math.PI * 2) * size * 0.025;
        const x = center + (random() - 0.5) * size * 0.25;
        const radius = 0.4 + random() * 1.6;
        const [r, g, b] = colorVariation([99, 74, 49], random, 28);
        pathDetails.push(
          `<circle cx="${x}" cy="${y}" r="${radius}" ` +
            `fill="rgb(${r},${g},${b})"/>`,
        );
      }
    }
    const svg = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="#3d653f"/>` +
        path +
        pathDetails.join("") +
        grass.join("") +
        `</svg>`,
    );
    return sharp(svg).png().toBuffer();
  }
  const elements = [];
  if (entry.id === "city-wall") {
    const rowHeight = size / 7;
    for (let row = -1; row < 8; row++) {
      let x = row % 2 ? -size * 0.12 : -size * 0.03;
      while (x < size) {
        const width = size * (0.13 + random() * 0.13);
        const [r, g, b] = colorVariation(
          random() < 0.13 ? [130, 111, 72] : [83, 94, 99],
          random,
          20,
        );
        elements.push(
          `<rect x="${x}" y="${row * rowHeight + 5}" ` +
            `width="${width - 7}" height="${rowHeight - 9}" rx="5" ` +
            `fill="rgb(${r},${g},${b})"/>`,
        );
        x += width;
      }
    }
  } else if (entry.id === "fieldstone-masonry") {
    const cell = size / 8;
    for (let row = -1; row < 10; row++) {
      for (let column = -1; column < 10; column++) {
        const cx = (column + 0.5 + (random() - 0.5) * 0.45) * cell;
        const cy = (row + 0.5 + (random() - 0.5) * 0.45) * cell;
        const rx = cell * (0.34 + random() * 0.3);
        const ry = cell * (0.3 + random() * 0.28);
        const palette = [
          [61, 70, 73],
          [87, 91, 84],
          [100, 83, 65],
          [72, 82, 66],
        ];
        const [r, g, b] = colorVariation(
          palette[Math.floor(random() * palette.length)],
          random,
          17,
        );
        elements.push(
          `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ` +
            `transform="rotate(${random() * 50 - 25} ${cx} ${cy})" ` +
            `fill="rgb(${r},${g},${b})"/>`,
        );
      }
    }
  } else if (entry.id === "herringbone-brick") {
    const step = size / 10;
    const rowCount = Math.ceil(size / (step * 0.72)) + 4;
    for (let row = -3; row < rowCount; row++) {
      for (let column = -3; column < 15; column++) {
        const cx = column * step + (row % 2) * step * 0.5;
        const cy = row * step * 0.72;
        const angle = (row + column) % 2 ? 45 : -45;
        const [r, g, b] = colorVariation(
          random() < 0.16 ? [82, 55, 44] : [126, 64, 43],
          random,
          13,
        );
        elements.push(
          `<rect x="${cx - step * 0.48}" y="${cy - step * 0.17}" ` +
            `width="${step * 0.96}" height="${step * 0.34}" rx="3" ` +
            `transform="rotate(${angle} ${cx} ${cy})" ` +
            `fill="rgb(${r},${g},${b})"/>`,
        );
      }
    }
  } else if (entry.id === "garden-herbaceous-bed") {
    const palette = [
      [62, 90, 54],
      [78, 105, 64],
      [93, 111, 75],
      [47, 73, 45],
    ];
    for (let index = 0; index < Math.round((size * size) / 85); index++) {
      const cx = random() * size;
      const cy = random() * size;
      const leafColor = colorVariation(
        palette[Math.floor(random() * palette.length)],
        random,
        12,
      );
      const radius = size * (0.004 + random() * 0.009);
      const angle = random() * 180;
      elements.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${radius * 1.8}" ` +
          `ry="${radius * 0.62}" transform="rotate(${angle} ${cx} ${cy})" ` +
          `fill="rgb(${leafColor.join(",")})"/>`,
      );
      if (random() < 0.055) {
        const flower = random() < 0.55 ? [128, 139, 173] : [183, 174, 132];
        elements.push(
          `<circle cx="${cx}" cy="${cy}" r="${radius * 0.42}" ` +
            `fill="rgb(${flower.join(",")})"/>`,
        );
      }
    }
  } else if (entry.id === "garden-clipped-hedge") {
    const palette = [
      [39, 76, 43],
      [52, 91, 49],
      [66, 100, 54],
      [74, 105, 63],
    ];
    for (let index = 0; index < Math.round((size * size) / 62); index++) {
      const cx = random() * size;
      const cy = random() * size;
      const leafColor = colorVariation(
        palette[Math.floor(random() * palette.length)],
        random,
        10,
      );
      const radius = size * (0.0035 + random() * 0.0065);
      elements.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${radius * 1.9}" ` +
          `ry="${radius * 0.72}" ` +
          `transform="rotate(${random() * 180} ${cx} ${cy})" ` +
          `fill="rgb(${leafColor.join(",")})"/>`,
      );
    }
  } else {
    throw new Error(`No procedural guide recipe exists for ${entry.id}`);
  }
  const backgrounds = {
    "herringbone-brick": "#9d896c",
    "garden-herbaceous-bed": "#283725",
    "garden-clipped-hedge": "#294a2c",
  };
  const background = backgrounds[entry.id] ?? "#c9b990";
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="${background}"/>` +
      elements.join("") +
      `</svg>`,
  );
  const { data, info } = await sharp(svg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const grain = (random() * 2 - 1) * 16;
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.max(
        0,
        Math.min(255, Math.round(data[offset + channel] + grain)),
      );
    }
  }
  return sharp(data, {
    raw: { width: size, height: size, channels: info.channels },
  })
    .png()
    .toBuffer();
}

function blendPair(buffer, a, b, weight) {
  for (let channel = 0; channel < 3; channel++) {
    const average = (buffer[a + channel] + buffer[b + channel]) / 2;
    buffer[a + channel] = Math.round(
      buffer[a + channel] * (1 - weight) + average * weight,
    );
    buffer[b + channel] = Math.round(
      buffer[b + channel] * (1 - weight) + average * weight,
    );
  }
}

function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function enforceC1Horizontal(buffer, size, channels) {
  for (let y = 0; y < size; y++) {
    for (let channel = 0; channel < 3; channel++) {
      const left = y * size * channels + channel;
      const leftInner = (y * size + 1) * channels + channel;
      const right = (y * size + size - 1) * channels + channel;
      const rightInner = (y * size + size - 2) * channels + channel;
      const edge = (buffer[left] + buffer[right]) / 2;
      const difference = buffer[leftInner] - buffer[rightInner];
      buffer[left] = byte(edge);
      buffer[right] = byte(edge);
      buffer[leftInner] = byte(edge + difference / 2);
      buffer[rightInner] = byte(edge - difference / 2);
    }
  }
}

function enforceC1Vertical(buffer, size, channels) {
  for (let x = 0; x < size; x++) {
    for (let channel = 0; channel < 3; channel++) {
      const top = x * channels + channel;
      const topInner = (size + x) * channels + channel;
      const bottom = ((size - 1) * size + x) * channels + channel;
      const bottomInner = ((size - 2) * size + x) * channels + channel;
      const edge = (buffer[top] + buffer[bottom]) / 2;
      const difference = buffer[topInner] - buffer[bottomInner];
      buffer[top] = byte(edge);
      buffer[bottom] = byte(edge);
      buffer[topInner] = byte(edge + difference / 2);
      buffer[bottomInner] = byte(edge - difference / 2);
    }
  }
}

export async function enforcePeriodicEdges(
  input,
  {
    size = 1024,
    repairBand = 64,
    sharpenSigma = 0,
    saturation = 1,
    brightness = 1,
  } = {},
) {
  if (repairBand < 2 || repairBand * 2 >= size) {
    throw new Error("Periodic repair band is invalid for the output size");
  }
  let operation = sharp(input)
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .removeAlpha()
    .modulate({ saturation, brightness });
  if (sharpenSigma > 0) {
    operation = operation.sharpen({ sigma: sharpenSigma });
  }
  const { data, info } = await operation
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  for (let distance = 0; distance < repairBand; distance++) {
    const ratio = 1 - distance / repairBand;
    const weight = ratio * ratio;
    for (let y = 0; y < size; y++) {
      const left = (y * size + distance) * channels;
      const right = (y * size + size - 1 - distance) * channels;
      blendPair(data, left, right, weight);
    }
  }
  for (let distance = 0; distance < repairBand; distance++) {
    const ratio = 1 - distance / repairBand;
    const weight = ratio * ratio;
    for (let x = 0; x < size; x++) {
      const top = (distance * size + x) * channels;
      const bottom = ((size - 1 - distance) * size + x) * channels;
      blendPair(data, top, bottom, weight);
    }
  }
  enforceC1Horizontal(data, size, channels);
  enforceC1Vertical(data, size, channels);
  enforceC1Horizontal(data, size, channels);
  return sharp(data, {
    raw: { width: size, height: size, channels },
  })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

function rmse(sum, samples) {
  return Math.sqrt(sum / samples) / 255;
}

export async function seamMetrics(input) {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let horizontal = 0;
  let vertical = 0;
  let horizontalGradient = 0;
  let verticalGradient = 0;
  let horizontalSamples = 0;
  let verticalSamples = 0;
  for (let y = 0; y < height; y++) {
    for (let channel = 0; channel < 3; channel++) {
      const left = data[y * width * channels + channel];
      const leftInner = data[(y * width + 1) * channels + channel];
      const right = data[(y * width + width - 1) * channels + channel];
      const rightInner = data[(y * width + width - 2) * channels + channel];
      horizontal += (left - right) ** 2;
      horizontalGradient += (leftInner - left - (right - rightInner)) ** 2;
      horizontalSamples++;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let channel = 0; channel < 3; channel++) {
      const top = data[x * channels + channel];
      const topInner = data[(width + x) * channels + channel];
      const bottom = data[((height - 1) * width + x) * channels + channel];
      const bottomInner = data[((height - 2) * width + x) * channels + channel];
      vertical += (top - bottom) ** 2;
      verticalGradient += (topInner - top - (bottom - bottomInner)) ** 2;
      verticalSamples++;
    }
  }
  return {
    edgeRmseX: rmse(horizontal, horizontalSamples),
    edgeRmseY: rmse(vertical, verticalSamples),
    gradientRmseX: rmse(horizontalGradient, horizontalSamples),
    gradientRmseY: rmse(verticalGradient, verticalSamples),
  };
}

function closeDataMapEdges(data, width, height, channels) {
  for (let y = 0; y < height; y++) {
    blendPair(data, y * width * channels, (y * width + width - 1) * channels, 1);
  }
  for (let x = 0; x < width; x++) {
    blendPair(data, x * channels, ((height - 1) * width + x) * channels, 1);
  }
}

export async function derivePbrChannels(
  input,
  { normalStrength = 2, roughness = 0.86, roughnessVariation = 0.08 } = {},
) {
  const { data: height, info } = await sharp(input)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height: imageHeight } = info;
  const normal = Buffer.alloc(width * imageHeight * 3);
  const metallicRoughness = Buffer.alloc(width * imageHeight * 3);
  for (let y = 0; y < imageHeight; y++) {
    const top = (y - 1 + imageHeight) % imageHeight;
    const bottom = (y + 1) % imageHeight;
    for (let x = 0; x < width; x++) {
      const left = (x - 1 + width) % width;
      const right = (x + 1) % width;
      const dx = (height[y * width + right] - height[y * width + left]) / 255;
      const dy = (height[bottom * width + x] - height[top * width + x]) / 255;
      let nx = -dx * normalStrength;
      let ny = -dy * normalStrength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      const target = (y * width + x) * 3;
      normal[target] = byte((nx * 0.5 + 0.5) * 255);
      normal[target + 1] = byte((ny * 0.5 + 0.5) * 255);
      normal[target + 2] = byte((nz * 0.5 + 0.5) * 255);

      const luminance = height[y * width + x] / 255;
      const localRoughness = Math.max(
        0,
        Math.min(1, roughness + (0.5 - luminance) * roughnessVariation * 2),
      );
      metallicRoughness[target] = 255;
      metallicRoughness[target + 1] = byte(localRoughness * 255);
      metallicRoughness[target + 2] = 0;
    }
  }
  closeDataMapEdges(normal, width, imageHeight, 3);
  closeDataMapEdges(metallicRoughness, width, imageHeight, 3);
  const encode = (data) =>
    sharp(data, {
      raw: { width, height: imageHeight, channels: 3 },
    })
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
  const [normalMap, metallicRoughnessMap] = await Promise.all([
    encode(normal),
    encode(metallicRoughness),
  ]);
  return { normal: normalMap, metallicRoughness: metallicRoughnessMap };
}

export async function sourceCorrelation(source, generated) {
  const [a, b] = await Promise.all(
    [source, generated].map((input) =>
      sharp(input).resize(64, 64, { fit: "fill" }).greyscale().raw().toBuffer(),
    ),
  );
  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < a.length; index++) {
    meanA += a[index];
    meanB += b[index];
  }
  meanA /= a.length;
  meanB /= b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index++) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    covariance += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }
  if (varianceA === 0 || varianceB === 0) return 0;
  return Math.abs(covariance / Math.sqrt(varianceA * varianceB));
}

async function generatedArtifactSetIsCurrent({
  root,
  entry,
  output,
  metadata,
  recipeHash,
}) {
  if (metadata.recipeHash !== recipeHash) return false;
  const current = await fs.readFile(output);
  if (metadata.outputSha256 !== sha256(current)) return false;
  if (!entry.pbr) return metadata.channels === null;
  if (!metadata.channels) return false;
  const [normal, metallicRoughness] = await Promise.all([
    fs.readFile(path.join(root, entry.pbr.normal)),
    fs.readFile(path.join(root, entry.pbr.metallicRoughness)),
  ]);
  return (
    metadata.channels.normalSha256 === sha256(normal) &&
    metadata.channels.metallicRoughnessSha256 === sha256(metallicRoughness)
  );
}

async function generate({ zone, options }) {
  const loaded = await readPaletteManifest(repoRoot, zone);
  if (!loaded) throw new Error(`No material palette is authored for ${zone}`);
  const root = paletteRoot(repoRoot, zone);
  const generationSize = integerOption(
    options,
    "size",
    loaded.manifest.generationSize,
  );
  const requestedSteps =
    options.steps === undefined
      ? null
      : integerOption(options, "steps", loaded.manifest.steps);
  const outputSize = integerOption(
    options,
    "output-size",
    loaded.manifest.outputSize,
  );
  const limit = integerOption(
    options,
    "limit",
    loaded.manifest.materials.length,
  );
  const requestedAttempt =
    options.attempt === undefined
      ? null
      : integerOption(options, "attempt", 1) - 1;
  const requestedIds = options.ids
    ? new Set(
        String(options.ids)
          .split(",")
          .map((id) => id.trim()),
      )
    : null;
  const baseUrl = options.server ?? process.env.SDCPP_URL ?? DEFAULT_SERVER;
  let completed = 0;
  for (const entry of loaded.manifest.materials) {
    if (
      entry.enabled === false ||
      completed >= limit ||
      (requestedIds && !requestedIds.has(entry.id))
    )
      continue;
    const attempt = requestedAttempt ?? (entry.attempt ?? 1) - 1;
    const family = materialFamily(loaded.manifest, entry);
    const steps =
      requestedSteps ?? entry.steps ?? family?.steps ?? loaded.manifest.steps;
    const generationMode = generationModeFor(loaded.manifest, entry);
    const denoiseStrength =
      entry.denoiseStrength ?? family?.denoiseStrength ?? null;
    const postProcess = postProcessFor(loaded.manifest, entry);
    const authoringOnly = entry.authoringOnly === true;
    if (
      authoringOnly &&
      ![
        "txt2img-clean-room",
        "txt2img",
        "img2img-procedural-guide",
      ].includes(generationMode)
    ) {
      throw new Error(
        `${entry.id} is authoring-only and must use clean-room txt2img ` +
          "or an original procedural guide",
      );
    }
    let source = null;
    if (!authoringOnly) {
      const sourceFile = path.join(root, "source", `${entry.id}.webp`);
      source = await fs.readFile(sourceFile);
      if (sha256(source) !== entry.sourceSha256) {
        throw new Error(`${entry.id} source hash does not match palette.json`);
      }
    }
    const sourceKey =
      entry.sourceSha256 ??
      (authoringOnly ? `authoring-only:${zone}:${entry.id}` : null);
    const recipeHash = sha256(
      Buffer.from(
        JSON.stringify({
          recipeVersion: RECIPE_VERSION,
          sourceSha256: entry.sourceSha256 ?? null,
          sourceKey,
          authoringOnly,
          family: entry.family ?? null,
          familyRecipe: family,
          prompt: composedPrompt(loaded.manifest, entry),
          negativePrompt: composedNegativePrompt(loaded.manifest, entry),
          generationMode,
          proceduralGuideVersion:
            generationMode === "img2img-procedural-guide" ? 4 : null,
          generationSize,
          outputSize,
          steps,
          cfgScale: loaded.manifest.cfgScale,
          denoiseStrength,
          repairBand: loaded.manifest.repairBand,
          periodicRepairVersion: 2,
          sharpenSigma: loaded.manifest.sharpenSigma,
          postProcess,
          pbr: entry.pbr ?? null,
          attempt,
        }),
      ),
    );
    const output = path.join(root, entry.output);
    const metadataFile = path.join(root, "metadata", `${entry.id}.json`);
    if (!options.force) {
      try {
        const metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"));
        if (
          await generatedArtifactSetIsCurrent({
            root,
            entry,
            output,
            metadata,
            recipeHash,
          })
        ) {
          console.log(`resumed ${entry.id}`);
          completed++;
          continue;
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    const rawFile = path.join(root, "generated", "raw", `${entry.id}.png`);
    let initImage = source;
    let guideSha256 = null;
    if (generationMode === "img2img-procedural-guide") {
      initImage = await proceduralMaterialGuide(entry, generationSize);
      guideSha256 = sha256(initImage);
      const guideFile = path.join(
        root,
        "generated",
        "guides",
        `${entry.id}.png`,
      );
      await fs.mkdir(path.dirname(guideFile), { recursive: true });
      await fs.writeFile(guideFile, initImage);
    }
    let generated;
    if (options["reuse-raw"]) {
      try {
        const retainedRaw = await fs.readFile(rawFile);
        const retainedMetadata = await sharp(retainedRaw).metadata();
        if (
          retainedMetadata.width !== generationSize ||
          retainedMetadata.height !== generationSize
        ) {
          console.log(
            `ignored stale ${retainedMetadata.width}x${retainedMetadata.height} ` +
              `raw for ${entry.id}`,
          );
        } else {
          generated = {
            raw: retainedRaw,
            prompt: composedPrompt(loaded.manifest, entry),
            negativePrompt: composedNegativePrompt(loaded.manifest, entry),
            seed: deterministicSeed(entry, attempt),
            inferenceMs: null,
            serverInfo: null,
            generationMode,
            reusedRaw: true,
          };
          console.log(`reprocessing retained raw for ${entry.id}`);
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    if (!generated) {
      console.log(`generating ${entry.id} from local Stable Diffusion`);
      generated = await requestMaterial({
        baseUrl,
        source: initImage,
        entry,
        manifest: loaded.manifest,
        generationSize,
        steps,
        attempt,
      });
      await fs.mkdir(path.dirname(rawFile), { recursive: true });
      await fs.writeFile(rawFile, generated.raw);
    }
    const repaired = await enforcePeriodicEdges(generated.raw, {
      size: outputSize,
      repairBand: loaded.manifest.repairBand,
      sharpenSigma: loaded.manifest.sharpenSigma,
      saturation: postProcess?.saturation ?? 1,
      brightness: postProcess?.brightness ?? 1,
    });
    const metrics = await seamMetrics(repaired);
    const correlation = source
      ? await sourceCorrelation(source, repaired)
      : null;
    if (
      metrics.edgeRmseX > loaded.manifest.maxEdgeRmse ||
      metrics.edgeRmseY > loaded.manifest.maxEdgeRmse ||
      metrics.gradientRmseX > loaded.manifest.maxGradientRmse ||
      metrics.gradientRmseY > loaded.manifest.maxGradientRmse
    ) {
      throw new Error(
        `${entry.id} failed seamless-wrap validation: ${JSON.stringify(metrics)}`,
      );
    }
    if (
      source &&
      generated.generationMode !== "img2img" &&
      correlation > loaded.manifest.maxSourceCorrelation
    ) {
      throw new Error(
        `${entry.id} is too correlated with the legacy source ` +
          `(${correlation} > ${loaded.manifest.maxSourceCorrelation})`,
      );
    }
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, repaired);
    let channels = null;
    if (entry.pbr) {
      channels = await derivePbrChannels(repaired, {
        normalStrength: entry.pbr.normalStrength,
        roughness: entry.pbr.roughness,
        roughnessVariation: entry.pbr.roughnessVariation,
      });
      const normalFile = path.join(root, entry.pbr.normal);
      const metallicRoughnessFile = path.join(
        root,
        entry.pbr.metallicRoughness,
      );
      await Promise.all([
        fs.mkdir(path.dirname(normalFile), { recursive: true }),
        fs.mkdir(path.dirname(metallicRoughnessFile), { recursive: true }),
      ]);
      await Promise.all([
        fs.writeFile(normalFile, channels.normal),
        fs.writeFile(metallicRoughnessFile, channels.metallicRoughness),
      ]);
    }
    await fs.mkdir(path.dirname(metadataFile), { recursive: true });
    await fs.writeFile(
      metadataFile,
      `${JSON.stringify(
        {
          schema: "eltania.zone-material-generation",
          version: 1,
          recipeVersion: RECIPE_VERSION,
          recipeHash,
          zone,
          id: entry.id,
          image: entry.image,
          semantic: entry.semantic,
          sourceSha256: entry.sourceSha256 ?? null,
          authoringOnly,
          rawSha256: sha256(generated.raw),
          outputSha256: sha256(repaired),
          prompt: generated.prompt,
          negativePrompt: generated.negativePrompt,
          seed: generated.seed,
          parameters: {
            generationSize,
            outputSize,
            steps,
            cfgScale: loaded.manifest.cfgScale,
            sampler: SAMPLER,
            denoiseStrength,
            repairBand: loaded.manifest.repairBand,
            sharpenSigma: loaded.manifest.sharpenSigma,
            postProcess,
            attempt: attempt + 1,
            inferenceMs: generated.inferenceMs,
          },
          seamMetrics: metrics,
          cleanRoomSourceCorrelation: correlation,
          proceduralGuideSha256: guideSha256,
          channels: channels
            ? {
                normalSha256: sha256(channels.normal),
                metallicRoughnessSha256: sha256(channels.metallicRoughness),
              }
            : null,
          reusedRetainedRaw: generated.reusedRaw ?? false,
          generationMode: generated.generationMode,
          serverInfo: generated.serverInfo,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`passed ${entry.id}: ${JSON.stringify(metrics)}`);
    completed++;
  }
  return completed;
}

async function tiledPreview(input, size) {
  const tile = await sharp(input)
    .resize(size / 2, size / 2)
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: "#111111",
    },
  })
    .composite([
      { input: tile, left: 0, top: 0 },
      { input: tile, left: size / 2, top: 0 },
      { input: tile, left: 0, top: size / 2 },
      { input: tile, left: size / 2, top: size / 2 },
    ])
    .png()
    .toBuffer();
}

function baseSuggestedMaterialFamily(imageName) {
  const name = imageName.toLowerCase();
  if (/cloud/.test(name)) return "sky";
  if (/falls|fount|^w1$|wafl/.test(name)) return "water";
  if (/grass|gras/.test(name)) return "grass-terrain";
  if (/^10dirt|xdrt/.test(name)) return "dirt-terrain";
  if (/undrtil|thievflr|wdfloor/.test(name)) return "stone-floor";
  if (/^6roof$/.test(name)) return "clay-roof";
  if (/^12roof$/.test(name)) return "slate-roof";
  if (/roof/.test(name)) return "roof";
  if (/brick/.test(name)) return "brick-paving";
  if (/cywleav|rosewal|crowal/.test(name)) return "vegetated-masonry";
  if (/citywa|coble|gsupwall|ike2/.test(name)) return "masonry";
  if (/win|wn\d/.test(name)) return "window-facade";
  if (/sign|crest|gateban/.test(name)) return "signage";
  if (/jam/.test(name)) return "plaster-trim";
  if (/door/.test(name)) return "door-and-trim";
  if (/^11temcar$/.test(name)) return "interior-decor";
  if (/^16irnsn/.test(name)) return "signage";
  if (/^16cab$/.test(name)) return "timber";
  if (
    /11prist|11temcar|16cab|16celina|16irnsn|16jwall|monk|sneed|theif/.test(
      name,
    )
  )
    return "shop-display";
  if (/11gold|11side|11wall|cotushbn|silfist/.test(name)) {
    return "ornamental";
  }
  if (/wood|floor|flor|deck|ceil|bar/.test(name)) return "timber";
  if (/inwall|walin|inceil/.test(name)) return "interior";
  if (/wall|wal|wail|waa|side/.test(name)) return "building-facade";
  if (/carpet|rea1/.test(name)) return "interior-decor";
  return "special";
}

const rounded = (value) => Math.round(value * 10000) / 10000;

function triangleArea3(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return Math.hypot(...cross) / 2;
}

function triangleArea2(a, b, c) {
  return (
    Math.abs(
      (b[0] - a[0]) * (c[1] - a[1]) -
        (b[1] - a[1]) * (c[0] - a[0]),
    ) / 2
  );
}

function primitiveMaterialUsage(document, mesh, primitive, binding) {
  const uvAccessor = primitive.attributes?.[`TEXCOORD_${binding.texCoord}`];
  const positionAccessor = primitive.attributes?.POSITION;
  if (uvAccessor === undefined || positionAccessor === undefined) {
    return {
      mesh: mesh.name ?? "unnamed-mesh",
      material: binding.materialName,
      issue: "missing-position-or-requested-uv",
    };
  }
  const uvs = accessorValues(document, uvAccessor);
  const positions = accessorValues(document, positionAccessor);
  const indices =
    primitive.indices === undefined
      ? positions.map((_, index) => [index])
      : accessorValues(document, primitive.indices);
  const uvMin = [Infinity, Infinity];
  const uvMax = [-Infinity, -Infinity];
  for (const uv of uvs) {
    for (let axis = 0; axis < 2; axis++) {
      uvMin[axis] = Math.min(uvMin[axis], uv[axis]);
      uvMax[axis] = Math.max(uvMax[axis], uv[axis]);
    }
  }
  let worldArea = 0;
  let uvArea = 0;
  let degenerateUvTriangles = 0;
  const triangleCount = Math.floor(indices.length / 3);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const a = indices[triangle * 3][0];
    const b = indices[triangle * 3 + 1][0];
    const c = indices[triangle * 3 + 2][0];
    worldArea += triangleArea3(positions[a], positions[b], positions[c]);
    const area = triangleArea2(uvs[a], uvs[b], uvs[c]);
    uvArea += area;
    if (area < 1e-8) degenerateUvTriangles++;
  }
  const uvSpan = uvMax.map((value, axis) => value - uvMin[axis]);
  const repeatedAxes = [
    ...(uvSpan[0] > 1.05 ? ["x"] : []),
    ...(uvSpan[1] > 1.05 ? ["y"] : []),
  ];
  return {
    mesh: mesh.name ?? "unnamed-mesh",
    material: binding.materialName,
    vertexCount: positions.length,
    triangleCount,
    uvMin: uvMin.map(rounded),
    uvMax: uvMax.map(rounded),
    uvSpan: uvSpan.map(rounded),
    repeatedAxes,
    worldArea: rounded(worldArea),
    uvArea: rounded(uvArea),
    worldUnitsPerUv:
      uvArea > 1e-8 ? rounded(Math.sqrt(worldArea / uvArea)) : null,
    degenerateUvTriangles,
  };
}

function materialUsageByImage(document) {
  const bindingsByMaterial = new Map(
    baseColorBindings(document).map((binding) => [
      binding.materialIndex,
      binding,
    ]),
  );
  const usages = new Map();
  for (const mesh of document.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const binding = bindingsByMaterial.get(primitive.material);
      if (!binding) continue;
      const key = binding.imageName.toLowerCase();
      const current = usages.get(key) ?? [];
      current.push(primitiveMaterialUsage(document, mesh, primitive, binding));
      usages.set(key, current);
    }
  }
  return usages;
}

function summarizedMaterialUsage(primitives, wrapModes) {
  const valid = primitives.filter((primitive) => !primitive.issue);
  const repeatedAxes = new Set(
    valid.flatMap((primitive) => primitive.repeatedAxes),
  );
  const uvMin = [0, 1].map((axis) =>
    Math.min(...valid.map((primitive) => primitive.uvMin[axis])),
  );
  const uvMax = [0, 1].map((axis) =>
    Math.max(...valid.map((primitive) => primitive.uvMax[axis])),
  );
  const issues = primitives
    .filter((primitive) => primitive.issue)
    .map((primitive) => `${primitive.mesh}: ${primitive.issue}`);
  const samplerRepeats = [...wrapModes].every(
    (mode) => mode === "10497/10497",
  );
  if (repeatedAxes.size && !samplerRepeats) {
    issues.push("UVs repeat but the source sampler does not repeat on both axes");
  }
  for (const primitive of valid) {
    if (
      primitive.triangleCount > 0 &&
      primitive.degenerateUvTriangles / primitive.triangleCount > 0.1
    ) {
      issues.push(
        `${primitive.mesh}: ${primitive.degenerateUvTriangles}/` +
          `${primitive.triangleCount} triangles have degenerate UVs`,
      );
    }
  }
  return {
    primitiveCount: primitives.length,
    uvMin: valid.length ? uvMin.map(rounded) : null,
    uvMax: valid.length ? uvMax.map(rounded) : null,
    maxUvSpan: valid.length
      ? [0, 1].map((axis) =>
          rounded(
            Math.max(...valid.map((primitive) => primitive.uvSpan[axis])),
          ),
        )
      : null,
    repeatedAxes: [...repeatedAxes],
    tileability:
      repeatedAxes.size === 2
        ? "xy"
        : repeatedAxes.has("x")
          ? "x"
          : repeatedAxes.has("y")
            ? "y"
            : "none",
    issues,
    primitives,
  };
}

function suggestedMaterialFamily(record) {
  const base = baseSuggestedMaterialFamily(record.imageName);
  // A scene-like shelf texture cannot survive broad repeated wall UVs. These
  // legacy names describe shop buildings, not necessarily unique display
  // panels, so geometry usage wins over the filename heuristic.
  if (
    base === "shop-display" &&
    record.usage.repeatedAxes.length > 0
  ) {
    return "building-facade";
  }
  // Large continuous meshes need a quiet repeatable substrate. The old
  // ornamental heuristic turned whole buildings into oversized decorative
  // panels because it never considered the UV footprint.
  if (
    base === "ornamental" &&
    Math.max(...(record.usage.maxUvSpan ?? [0, 0])) > 8
  ) {
    return "building-facade";
  }
  return base;
}

async function inventory({ zone }) {
  const source = await sourceScene(zone);
  const document = parseGlb(source.glb);
  const usageByImage = materialUsageByImage(document);
  const grouped = new Map();
  for (const binding of baseColorBindings(document)) {
    const key = binding.imageName.toLowerCase();
    const current = grouped.get(key) ?? {
      imageName: binding.imageName,
      imageIndices: new Set(),
      materialNames: new Set(),
      alphaModes: new Set(),
      wrapModes: new Set(),
      texCoords: new Set(),
    };
    current.imageIndices.add(binding.imageIndex);
    current.materialNames.add(binding.materialName);
    current.alphaModes.add(binding.alphaMode);
    current.wrapModes.add(`${binding.wrapS}/${binding.wrapT}`);
    current.texCoords.add(binding.texCoord);
    grouped.set(key, current);
  }
  const root = paletteRoot(repoRoot, zone);
  const extractedDirectory = path.join(root, "source-all");
  await fs.mkdir(extractedDirectory, { recursive: true });
  const records = [];
  for (const current of [...grouped.values()].sort((a, b) =>
    a.imageName.localeCompare(b.imageName, undefined, { numeric: true }),
  )) {
    const imageIndex = [...current.imageIndices][0];
    const bytes = embeddedImage(document, imageIndex);
    const metadata = await sharp(bytes).metadata();
    const safeName = current.imageName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const sourceOutput = path.join(extractedDirectory, `${safeName}.webp`);
    await sharp(bytes).webp({ lossless: true, effort: 6 }).toFile(sourceOutput);
    const record = {
      imageName: current.imageName,
      imageIndices: [...current.imageIndices],
      materialNames: [...current.materialNames],
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha ?? false,
      alphaModes: [...current.alphaModes],
      wrapModes: [...current.wrapModes],
      texCoords: [...current.texCoords],
      sourceSha256: sha256(bytes),
      usage: summarizedMaterialUsage(
        usageByImage.get(current.imageName.toLowerCase()) ?? [],
        current.wrapModes,
      ),
      source: path.relative(repoRoot, sourceOutput).split(path.sep).join("/"),
    };
    record.suggestedFamily = suggestedMaterialFamily(record);
    records.push(record);
  }
  const output = path.join(root, "material-inventory.json");
  await fs.writeFile(
    output,
    `${JSON.stringify(
      {
        schema: "eltania.zone-material-inventory",
        version: 1,
        zone,
        sourceSceneSha256: sha256(source.glb),
        materialCount: records.length,
        records,
      },
      null,
      2,
    )}\n`,
  );

  const columns = 6;
  const cell = 128;
  const caption = 24;
  const rows = Math.ceil(records.length / columns);
  const atlas = path.join(root, "review", `${zone}-material-inventory.png`);
  const composites = [];
  for (const [index, record] of records.entries()) {
    const left = (index % columns) * cell;
    const top = Math.floor(index / columns) * (cell + caption);
    composites.push(
      {
        input: await sharp(path.join(repoRoot, record.source))
          .resize(cell, cell, {
            fit: "contain",
            background: "#171914",
          })
          .png()
          .toBuffer(),
        left,
        top,
      },
      {
        input: labelSvg(cell, caption, record.imageName),
        left,
        top: top + cell,
      },
    );
  }
  await fs.mkdir(path.dirname(atlas), { recursive: true });
  await sharp({
    create: {
      width: columns * cell,
      height: rows * (cell + caption),
      channels: 3,
      background: "#0c0e0c",
    },
  })
    .composite(composites)
    .png()
    .toFile(atlas);
  console.log(`inventoried ${records.length} geometry material images`);
  console.log(atlas);
  return { records, output, atlas };
}

async function bootstrap({ zone }) {
  const inventoried = await inventory({ zone });
  const loaded = await readPaletteManifest(repoRoot, zone);
  if (!loaded) throw new Error(`No material palette is authored for ${zone}`);
  const existingImages = new Set(
    loaded.manifest.materials
      .filter((entry) => !entry.authoringOnly)
      .map((entry) => entry.image.toLowerCase()),
  );
  const automaticByImage = new Map(
    loaded.manifest.materials
      .filter(
        (entry) => !entry.authoringOnly && entry.id.startsWith("legacy-"),
      )
      .map((entry) => [entry.image.toLowerCase(), entry]),
  );
  const additions = [];
  let reclassified = 0;
  for (const record of inventoried.records) {
    const imageKey = record.imageName.toLowerCase();
    const family = loaded.manifest.families?.[record.suggestedFamily];
    if (!family) {
      throw new Error(
        `${record.imageName} resolved to missing family '${record.suggestedFamily}'`,
      );
    }
    const safeName = record.imageName
      .toLowerCase()
      .replaceAll(/[^a-z0-9._-]/g, "_");
    const generatedMapping = {
      id: `legacy-${safeName}`,
      image: record.imageName,
      family: record.suggestedFamily,
      status: "queued-family-migration",
      sourceSha256: record.sourceSha256,
      sourceDimensions: [record.width, record.height],
      attempt: 1,
      generationMode: "txt2img-clean-room",
      tileability: record.usage.tileability,
      output: `generated/all/${safeName}.webp`,
      ...(family.extraShader ? { extraShader: family.extraShader } : {}),
      pbr: {
        normal: `generated/all/pbr/${safeName}-normal.webp`,
        metallicRoughness: `generated/all/pbr/${safeName}-metallic-roughness.webp`,
        normalStrength: family.normalStrength,
        normalScale: family.normalScale,
        roughness: family.roughness,
        roughnessVariation: family.roughnessVariation,
      },
    };
    const automatic = automaticByImage.get(imageKey);
    if (automatic) {
      if (automatic.family !== generatedMapping.family) reclassified++;
      Object.assign(automatic, generatedMapping);
      if (!family.extraShader) delete automatic.extraShader;
      continue;
    }
    if (existingImages.has(imageKey)) continue;
    additions.push(generatedMapping);
  }
  additions.sort((a, b) =>
    a.image.localeCompare(b.image, undefined, { numeric: true }),
  );
  const manifest = {
    ...loaded.manifest,
    materials: [...loaded.manifest.materials, ...additions],
  };
  await fs.writeFile(loaded.file, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `added ${additions.length} family-mapped materials; ` +
      `reclassified ${reclassified}; ` +
      `${manifest.materials.length} unique image mappings are now authored`,
  );
  return { additions, manifest };
}

function labelSvg(width, height, text) {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const fontSize = height < 32 ? 11 : 17;
  const baseline = Math.round(height * 0.7);
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="#141612"/>` +
      `<text x="${height < 32 ? 5 : 16}" y="${baseline}" fill="#e5d9bd" font-size="${fontSize}" ` +
      `font-family="sans-serif" font-weight="700">${escaped}</text></svg>`,
  );
}

async function review({ zone, options = {} }) {
  const loaded = await readPaletteManifest(repoRoot, zone);
  if (!loaded) throw new Error(`No material palette is authored for ${zone}`);
  const root = paletteRoot(repoRoot, zone);
  const requestedIds = options.ids
    ? new Set(
        String(options.ids)
          .split(",")
          .map((id) => id.trim()),
      )
    : null;
  const candidates = loaded.manifest.materials.filter(
    (entry) =>
      entry.enabled !== false && (!requestedIds || requestedIds.has(entry.id)),
  );
  const rows = [];
  for (const entry of candidates) {
    try {
      await fs.access(path.join(root, entry.output));
      rows.push(entry);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (!rows.length)
    throw new Error(`No generated ${zone} materials are reviewable`);
  const cell = rows.length > 8 ? 128 : 256;
  const header = rows.length > 8 ? 28 : 44;
  const panel = cell * 2;
  const width = panel * 3;
  const pageSize = cell === 128 ? 36 : 8;
  const outputs = [];
  for (let start = 0; start < rows.length; start += pageSize) {
    const page = rows.slice(start, start + pageSize);
    const rowHeight = cell * 2 + header;
    const height = header + page.length * rowHeight;
    const composites = [
      { input: labelSvg(panel, header, "SOURCE"), left: 0, top: 0 },
      { input: labelSvg(panel, header, "GENERATED"), left: panel, top: 0 },
      {
        input: labelSvg(panel, header, "2 × 2 REPEAT / SEAM CHECK"),
        left: panel * 2,
        top: 0,
      },
    ];
    for (const [index, entry] of page.entries()) {
      const top = header + index * rowHeight;
      const source = entry.authoringOnly
        ? null
        : path.join(root, "source", `${entry.id}.webp`);
      const output = path.join(root, entry.output);
      const description =
        `${(entry.semantic ?? entry.family ?? entry.id).toUpperCase()}  //  ` +
        `${entry.authoringOnly ? "NEW AUTHORING MATERIAL" : entry.image}`;
      composites.push(
        {
          input: source
            ? await sharp(source).resize(panel, panel).png().toBuffer()
            : labelSvg(panel, panel, "CLEAN-ROOM\nNO LEGACY SOURCE"),
          left: 0,
          top,
        },
        {
          input: await sharp(output).resize(panel, panel).png().toBuffer(),
          left: panel,
          top,
        },
        {
          input: await tiledPreview(output, panel),
          left: panel * 2,
          top,
        },
        {
          input: labelSvg(width, header, description),
          left: 0,
          top: top + cell * 2,
        },
      );
    }
    const suffix =
      rows.length > pageSize ? `-page-${Math.floor(start / pageSize) + 1}` : "";
    const output = path.join(
      root,
      "review",
      `${zone}-before-after${suffix}.png`,
    );
    await fs.mkdir(path.dirname(output), { recursive: true });
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#0c0e0c",
      },
    })
      .composite(composites)
      .png()
      .toFile(output);
    outputs.push(output);
  }
  return outputs;
}

async function bake({ zone }) {
  const source = await sourceScene(zone);
  const baked = await bakeZoneMaterialPalette({
    repoRoot,
    zone,
    sourceGlb: source.glb,
    requireEnabled: true,
  });
  const output = path.join(
    paletteRoot(repoRoot, zone),
    "review",
    `${zone}.material-preview.glb.gz`,
  );
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, gzipSync(baked.bytes, { level: 9 }));
  console.log(
    `baked ${baked.materialCount} materials without changing geometry or UVs`,
  );
  return { output, bytes: baked.bytes };
}

async function runtimePreview({ zone }) {
  const source = await sourceScene(zone);
  const baked = await bakeZoneMaterialPalette({
    repoRoot,
    zone,
    sourceGlb: source.glb,
    requireEnabled: true,
    runtimeTextureSize: RUNTIME_TEXTURE_SIZE,
    includePbrTextures: false,
  });
  const runtime = preprocessZoneSceneGlb(baked.bytes, zone);
  const stored = gzipSync(runtime, { level: 9 });
  const reviewOutput = path.join(
    paletteRoot(repoRoot, zone),
    "review",
    `${zone}.material-runtime-preview.glb.gz`,
  );
  const reviewGlbOutput = reviewOutput.slice(0, -3);
  const publicOutput = path.join(
    repoRoot,
    "client",
    "public",
    "eqrequiem",
    "worlds",
    `${zone}.material-preview.glb.gz`,
  );
  await Promise.all([
    fs.mkdir(path.dirname(reviewOutput), { recursive: true }),
    fs.mkdir(path.dirname(publicOutput), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(reviewOutput, stored),
    fs.writeFile(reviewGlbOutput, runtime),
    fs.writeFile(publicOutput, stored),
  ]);
  console.log(
    `published ${baked.materialCount} runtime-preview materials to ${publicOutput}`,
  );
  return { reviewOutput, reviewGlbOutput, publicOutput, bytes: runtime };
}

async function verify({ zone, bakedBytes }) {
  const source = await sourceScene(zone);
  let bakedGlb = bakedBytes;
  if (!bakedGlb) {
    const file = path.join(
      paletteRoot(repoRoot, zone),
      "review",
      `${zone}.material-preview.glb.gz`,
    );
    bakedGlb = gunzipSync(await fs.readFile(file));
  }
  const result = await verifyBakedPalette({
    repoRoot,
    zone,
    sourceGlb: source.glb,
    bakedGlb,
  });
  const loaded = await readPaletteManifest(repoRoot, zone);
  for (const entry of loaded.manifest.materials.filter(
    (material) => material.enabled !== false,
  )) {
    const metrics = await seamMetrics(
      await fs.readFile(path.join(paletteRoot(repoRoot, zone), entry.output)),
    );
    if (
      metrics.edgeRmseX > loaded.manifest.maxEdgeRmse ||
      metrics.edgeRmseY > loaded.manifest.maxEdgeRmse ||
      metrics.gradientRmseX > loaded.manifest.maxGradientRmse ||
      metrics.gradientRmseY > loaded.manifest.maxGradientRmse
    ) {
      result.failures.push(`${entry.id} failed seam thresholds`);
    }
  }
  result.ok = result.failures.length === 0;
  if (!result.ok) {
    throw new Error(
      `Palette verification failed: ${result.failures.join("; ")}`,
    );
  }
  console.log(`verified geometry ${result.geometrySignature}`);
  console.log(`verified UVs      ${result.uvSignature}`);
  return result;
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const zone = String(options.zone ?? DEFAULT_ZONE).toLowerCase();
  if (command === "help") {
    console.log(
      "Usage: node zone-material-pipeline.mjs " +
        "<inventory|bootstrap|extract|generate|bake|runtime-preview|verify|review|all> " +
        "[--zone qeynos2]",
    );
    return;
  }
  if (command === "inventory") {
    await inventory({ zone });
    return;
  }
  if (command === "bootstrap") {
    await bootstrap({ zone });
    return;
  }
  if (command === "extract") {
    const source = await sourceScene(zone);
    const result = await extractPaletteSources({
      repoRoot,
      zone,
      sourceGlb: source.glb,
    });
    console.log(`extracted ${result.extracted.length} source materials`);
    return;
  }
  if (command === "generate") {
    console.log(
      `generated or resumed ${await generate({ zone, options })} materials`,
    );
    return;
  }
  if (command === "bake") {
    await bake({ zone });
    return;
  }
  if (command === "runtime-preview") {
    await runtimePreview({ zone });
    return;
  }
  if (command === "verify") {
    await verify({ zone });
    return;
  }
  if (command === "review") {
    console.log((await review({ zone, options })).join("\n"));
    return;
  }
  if (command === "all") {
    const source = await sourceScene(zone);
    await extractPaletteSources({ repoRoot, zone, sourceGlb: source.glb });
    await generate({ zone, options });
    const baked = await bake({ zone });
    await verify({ zone, bakedBytes: baked.bytes });
    console.log((await review({ zone, options })).join("\n"));
    return;
  }
  throw new Error(`Unknown material pipeline command '${command}'`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
