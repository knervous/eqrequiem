import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  appendImageOverrides,
  appendMaterialChannels,
  baseColorBindings,
  embeddedImage,
  geometrySignature,
  imageIndicesNamed,
  parseGlb,
  serializeGlb,
  sha256,
  surfaceContractSignature,
  uvSignature,
} from "./glb-material-palette.mjs";

export const PALETTE_SCHEMA = "eltania.zone-material-palette";
export const PALETTE_VERSION = 1;
export const RUNTIME_TEXTURE_SIZE = 512;
export const RUNTIME_WEBP_QUALITY = 82;

export function paletteRoot(repoRoot, zone) {
  return path.join(
    repoRoot,
    "assets",
    "src",
    "world",
    "zones",
    zone,
    "material-palette",
  );
}

export function paletteManifestPath(repoRoot, zone) {
  return path.join(paletteRoot(repoRoot, zone), "palette.json");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function enforceC1Horizontal(data, info) {
  const { width, height, channels } = info;
  for (let y = 0; y < height; y++) {
    for (let channel = 0; channel < Math.min(3, channels); channel++) {
      const left = y * width * channels + channel;
      const leftInner = (y * width + 1) * channels + channel;
      const right = (y * width + width - 1) * channels + channel;
      const rightInner = (y * width + width - 2) * channels + channel;
      const edge = (data[left] + data[right]) / 2;
      const difference = data[leftInner] - data[rightInner];
      data[left] = byte(edge);
      data[right] = byte(edge);
      data[leftInner] = byte(edge + difference / 2);
      data[rightInner] = byte(edge - difference / 2);
    }
  }
}

function enforceC1Vertical(data, info) {
  const { width, height, channels } = info;
  for (let x = 0; x < width; x++) {
    for (let channel = 0; channel < Math.min(3, channels); channel++) {
      const top = x * channels + channel;
      const topInner = (width + x) * channels + channel;
      const bottom = ((height - 1) * width + x) * channels + channel;
      const bottomInner = ((height - 2) * width + x) * channels + channel;
      const edge = (data[top] + data[bottom]) / 2;
      const difference = data[topInner] - data[bottomInner];
      data[top] = byte(edge);
      data[bottom] = byte(edge);
      data[topInner] = byte(edge + difference / 2);
      data[bottomInner] = byte(edge - difference / 2);
    }
  }
}

function closePeriodicEdges(data, info) {
  enforceC1Horizontal(data, info);
  enforceC1Vertical(data, info);
  enforceC1Horizontal(data, info);
}

function renormalizeTangentNormals(data, info) {
  for (let offset = 0; offset < data.length; offset += info.channels) {
    let x = data[offset] / 127.5 - 1;
    let y = data[offset + 1] / 127.5 - 1;
    let z = data[offset + 2] / 127.5 - 1;
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;
    data[offset] = byte((x * 0.5 + 0.5) * 255);
    data[offset + 1] = byte((y * 0.5 + 0.5) * 255);
    data[offset + 2] = byte((z * 0.5 + 0.5) * 255);
  }
}

export async function resizeRuntimeTexture(
  input,
  size = RUNTIME_TEXTURE_SIZE,
  quality = RUNTIME_WEBP_QUALITY,
) {
  const resized = await sharp(input)
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  closePeriodicEdges(resized.data, resized.info);
  const quantized = await sharp(resized.data, {
    raw: resized.info,
  })
    .webp({
      quality,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();
  const repaired = await sharp(quantized)
    .raw()
    .toBuffer({ resolveWithObject: true });
  closePeriodicEdges(repaired.data, repaired.info);
  return sharp(repaired.data, { raw: repaired.info })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

export async function resizeRuntimeDataTexture(
  input,
  size = RUNTIME_TEXTURE_SIZE,
  { tangentNormal = false } = {},
) {
  const resized = await sharp(input)
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (tangentNormal) renormalizeTangentNormals(resized.data, resized.info);
  closePeriodicEdges(resized.data, resized.info);
  return sharp(resized.data, { raw: resized.info })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
}

function rmse(sum, samples) {
  return Math.sqrt(sum / samples) / 255;
}

/** Measure both value and first-derivative continuity at a periodic image edge. */
export async function periodicSeamMetrics(input) {
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
    for (let channel = 0; channel < Math.min(3, channels); channel++) {
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
    for (let channel = 0; channel < Math.min(3, channels); channel++) {
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

export async function centeredBannerCompositionMetrics(input) {
  const { data, info } = await sharp(input)
    .resize(64, 64, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let centerSaturation = 0;
  let centerSamples = 0;
  let sideSaturation = 0;
  let sideSamples = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const normalizedX = (x + 0.5) / info.width;
      const center = normalizedX >= 0.4 && normalizedX <= 0.6;
      const side = normalizedX <= 0.3 || normalizedX >= 0.7;
      if (!center && !side) continue;
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const maximum = Math.max(red, green, blue);
      const saturation =
        maximum === 0 ? 0 : (maximum - Math.min(red, green, blue)) / maximum;
      if (center) {
        centerSaturation += saturation;
        centerSamples++;
      } else {
        sideSaturation += saturation;
        sideSamples++;
      }
    }
  }
  centerSaturation /= centerSamples;
  sideSaturation /= sideSamples;
  return {
    centerSaturation,
    sideSaturation,
    saturationDelta: centerSaturation - sideSaturation,
  };
}

export async function readPaletteManifest(repoRoot, zone) {
  const file = paletteManifestPath(repoRoot, zone);
  if (!(await exists(file))) return null;
  const manifest = JSON.parse(await fs.readFile(file, "utf8"));
  if (
    manifest.schema !== PALETTE_SCHEMA ||
    manifest.version !== PALETTE_VERSION ||
    manifest.zone !== zone
  ) {
    throw new Error(`${file} is not a compatible ${zone} palette manifest`);
  }
  return { file, manifest };
}

function stablePoolIndex(value, length) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % length;
}

export function runtimeMaterialEntry(manifest, entry) {
  const pool = manifest.families?.[entry.family]?.runtimeMaterialPool;
  if (!Array.isArray(pool) || pool.length === 0) return entry;
  const selectedId = pool[stablePoolIndex(entry.id, pool.length)];
  const selected = manifest.materials.find(
    (candidate) => candidate.id === selectedId,
  );
  if (!selected) {
    throw new Error(
      `${entry.family} runtime material pool references missing '${selectedId}'`,
    );
  }
  if (selected.family !== entry.family) {
    throw new Error(
      `${entry.family} runtime material '${selectedId}' belongs to ${selected.family}`,
    );
  }
  if (!isRuntimePaletteEntry(selected)) {
    throw new Error(
      `${entry.family} runtime material '${selectedId}' is not a production candidate`,
    );
  }
  return selected;
}

/**
 * Generation status is review state, not documentation. Only explicitly
 * approved candidates may replace a source-zone image in a runtime package.
 * Authoring-only materials are embedded by Blender and never override legacy
 * image bindings here.
 */
export function isRuntimePaletteEntry(entry) {
  return (
    entry.enabled !== false &&
    entry.authoringOnly !== true &&
    entry.status === "production-candidate"
  );
}

export async function extractPaletteSources({ repoRoot, zone, sourceGlb }) {
  const loaded = await readPaletteManifest(repoRoot, zone);
  if (!loaded) throw new Error(`No material palette is authored for ${zone}`);
  const document = parseGlb(sourceGlb);
  const sourceDirectory = path.join(paletteRoot(repoRoot, zone), "source");
  await fs.mkdir(sourceDirectory, { recursive: true });
  const extracted = [];
  for (const entry of loaded.manifest.materials.filter(
    (material) => !material.authoringOnly,
  )) {
    const indices = imageIndicesNamed(document, entry.image);
    if (!indices.length) {
      throw new Error(`${zone} has no image named '${entry.image}'`);
    }
    const bytes = embeddedImage(document, indices[0]);
    const hash = sha256(bytes);
    if (entry.sourceSha256 && hash !== entry.sourceSha256) {
      throw new Error(
        `${entry.id} source hash changed (${hash} != ${entry.sourceSha256})`,
      );
    }
    const metadata = await sharp(bytes).metadata();
    const extension = metadata.format === "webp" ? "webp" : "png";
    const output = path.join(sourceDirectory, `${entry.id}.${extension}`);
    await fs.writeFile(output, bytes);
    extracted.push({
      id: entry.id,
      image: entry.image,
      imageIndices: indices,
      output,
      sha256: hash,
      width: metadata.width,
      height: metadata.height,
    });
  }
  const bindings = baseColorBindings(document).filter((binding) =>
    loaded.manifest.materials.some(
      (entry) =>
        !entry.authoringOnly &&
        entry.image.toLowerCase() === binding.imageName.toLowerCase(),
    ),
  );
  const audit = {
    schema: "eltania.zone-material-source-audit",
    version: 1,
    zone,
    sourceSceneSha256: sha256(sourceGlb),
    geometrySignature: geometrySignature(document),
    uvSignature: uvSignature(document),
    extracted: extracted.map(({ output, ...entry }) => ({
      ...entry,
      output: path.relative(repoRoot, output).split(path.sep).join("/"),
    })),
    bindings,
  };
  const auditFile = path.join(paletteRoot(repoRoot, zone), "source-audit.json");
  await fs.writeFile(auditFile, `${JSON.stringify(audit, null, 2)}\n`);
  return { extracted, audit, auditFile };
}

export async function bakeZoneMaterialPalette({
  repoRoot,
  zone,
  sourceGlb,
  requireEnabled = false,
  runtimeTextureSize = null,
  includePbrTextures = true,
}) {
  const loaded = await readPaletteManifest(repoRoot, zone);
  if (!loaded || !loaded.manifest.enabled) {
    if (requireEnabled) {
      throw new Error(`${zone} material palette is absent or disabled`);
    }
    return {
      bytes: Buffer.from(sourceGlb),
      applied: false,
      manifest: loaded?.manifest ?? null,
    };
  }
  const before = parseGlb(sourceGlb);
  const overrides = [];
  const channels = [];
  for (const entry of loaded.manifest.materials.filter(isRuntimePaletteEntry)) {
    const sourceIndices = imageIndicesNamed(before, entry.image);
    if (!sourceIndices.length) {
      throw new Error(`${zone} has no image named '${entry.image}'`);
    }
    const sourceHash = sha256(embeddedImage(before, sourceIndices[0]));
    if (sourceHash !== entry.sourceSha256) {
      throw new Error(
        `${entry.id} source hash changed ` +
          `(${sourceHash} != ${entry.sourceSha256})`,
      );
    }
    const runtimeEntry = runtimeMaterialEntry(loaded.manifest, entry);
    const replacement = path.join(
      paletteRoot(repoRoot, zone),
      runtimeEntry.output,
    );
    let input = await fs.readFile(replacement);
    let metadata = await sharp(input).metadata();
    if (
      metadata.format !== "webp" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width !== metadata.height ||
      (metadata.width & (metadata.width - 1)) !== 0
    ) {
      throw new Error(
        `${entry.id} replacement must be a square power-of-two WebP texture`,
      );
    }
    if (runtimeTextureSize && metadata.width !== runtimeTextureSize) {
      input = await resizeRuntimeTexture(input, runtimeTextureSize);
      metadata = await sharp(input).metadata();
    }
    overrides.push({
      imageName: entry.image,
      bytes: input,
      mimeType: "image/webp",
    });
    if (runtimeEntry.pbr && includePbrTextures) {
      const readChannel = async (relativeFile, label) => {
        const file = path.join(paletteRoot(repoRoot, zone), relativeFile);
        let channelInput = await fs.readFile(file);
        let channelMetadata = await sharp(channelInput).metadata();
        if (
          runtimeTextureSize &&
          (channelMetadata.width !== runtimeTextureSize ||
            channelMetadata.height !== runtimeTextureSize)
        ) {
          channelInput = await resizeRuntimeDataTexture(
            channelInput,
            runtimeTextureSize,
            { tangentNormal: label === "normal map" },
          );
          channelMetadata = await sharp(channelInput).metadata();
        }
        if (
          channelMetadata.format !== "webp" ||
          channelMetadata.width !== metadata.width ||
          channelMetadata.height !== metadata.height
        ) {
          throw new Error(
            `${entry.id} ${label} must be WebP and match its base-color dimensions`,
          );
        }
        return {
          bytes: channelInput,
          mimeType: "image/webp",
        };
      };
      const normal = await readChannel(runtimeEntry.pbr.normal, "normal map");
      normal.scale = runtimeEntry.pbr.normalScale ?? 1;
      channels.push({
        imageName: entry.image,
        normal,
        metallicRoughness: await readChannel(
          runtimeEntry.pbr.metallicRoughness,
          "metallic/roughness map",
        ),
        extraShader: runtimeEntry.extraShader ?? null,
      });
    } else if (
      runtimeEntry.extraShader ||
      runtimeEntry.pbr?.roughness !== undefined
    ) {
      channels.push({
        imageName: entry.image,
        extraShader: runtimeEntry.extraShader,
        roughness: runtimeEntry.pbr?.roughness,
      });
    }
  }
  const baseColorBaked = appendImageOverrides(before, overrides);
  const after = appendMaterialChannels(baseColorBaked, channels);
  if (geometrySignature(before) !== geometrySignature(after)) {
    throw new Error(`${zone} palette bake changed geometry bindings or bytes`);
  }
  if (uvSignature(before) !== uvSignature(after)) {
    throw new Error(`${zone} palette bake changed UV bindings or bytes`);
  }
  return {
    bytes: serializeGlb(after),
    applied: true,
    manifest: loaded.manifest,
    materialCount: overrides.length,
    geometrySignature: geometrySignature(after),
    uvSignature: uvSignature(after),
  };
}

export async function verifyBakedPalette({
  repoRoot,
  zone,
  sourceGlb,
  bakedGlb,
}) {
  const loaded = await readPaletteManifest(repoRoot, zone);
  if (!loaded) throw new Error(`No material palette is authored for ${zone}`);
  const before = parseGlb(sourceGlb);
  const after = parseGlb(bakedGlb);
  const failures = [];
  if (geometrySignature(before) !== geometrySignature(after)) {
    failures.push("geometry signature changed");
  }
  if (uvSignature(before) !== uvSignature(after)) {
    failures.push("UV signature changed");
  }
  if (surfaceContractSignature(before) !== surfaceContractSignature(after)) {
    failures.push("portable material surface contract changed");
  }
  for (const entry of loaded.manifest.materials.filter(isRuntimePaletteEntry)) {
    const indices = imageIndicesNamed(after, entry.image);
    if (!indices.length) {
      failures.push(`${entry.id} image binding is missing`);
      continue;
    }
    const dimensions = await Promise.all(
      indices.map(async (index) =>
        sharp(embeddedImage(after, index)).metadata(),
      ),
    );
    const expectedWidth = dimensions[0]?.width;
    const expectedHeight = dimensions[0]?.height;
    if (
      !expectedWidth ||
      expectedWidth !== expectedHeight ||
      (expectedWidth & (expectedWidth - 1)) !== 0 ||
      dimensions.some(
        (metadata) =>
          metadata.format !== "webp" ||
          metadata.width !== expectedWidth ||
          metadata.height !== expectedHeight,
      )
    ) {
      failures.push(
        `${entry.id} base color is not one square power-of-two WebP size`,
      );
    }
    const repeatedX = entry.tileability?.includes("x");
    const repeatedY = entry.tileability?.includes("y");
    const checkSeams = async (bytes, label) => {
      if (!repeatedX && !repeatedY) return;
      const metrics = await periodicSeamMetrics(bytes);
      if (
        (repeatedX &&
          (metrics.edgeRmseX > loaded.manifest.maxEdgeRmse ||
            metrics.gradientRmseX > loaded.manifest.maxGradientRmse)) ||
        (repeatedY &&
          (metrics.edgeRmseY > loaded.manifest.maxEdgeRmse ||
            metrics.gradientRmseY > loaded.manifest.maxGradientRmse))
      ) {
        failures.push(`${entry.id} ${label} failed baked seam thresholds`);
      }
    };
    await checkSeams(embeddedImage(after, indices[0]), "base color");
    if (entry.pbr) {
      for (const kind of ["normal", "metallic-roughness"]) {
        const channelIndices = imageIndicesNamed(
          after,
          `palette:${entry.image}:${kind}`,
        );
        if (channelIndices.length !== 1) {
          failures.push(`${entry.id} ${kind} image binding is missing`);
          continue;
        }
        const channelMetadata = await sharp(
          embeddedImage(after, channelIndices[0]),
        ).metadata();
        if (
          channelMetadata.format !== "webp" ||
          channelMetadata.width !== expectedWidth ||
          channelMetadata.height !== expectedHeight
        ) {
          failures.push(`${entry.id} ${kind} map has invalid dimensions`);
        }
        await checkSeams(
          embeddedImage(after, channelIndices[0]),
          `${kind} map`,
        );
      }
      for (const binding of baseColorBindings(after).filter(
        (candidate) =>
          candidate.imageName.toLowerCase() === entry.image.toLowerCase(),
      )) {
        const material = after.json.materials[binding.materialIndex];
        if (!material.normalTexture) {
          failures.push(`${entry.id} material normal binding is missing`);
        } else if (
          (material.normalTexture.texCoord ?? 0) !== binding.texCoord
        ) {
          failures.push(`${entry.id} material normal UV binding changed`);
        }
        if (
          !material.pbrMetallicRoughness?.metallicRoughnessTexture ||
          material.pbrMetallicRoughness.metallicFactor !== 0 ||
          material.pbrMetallicRoughness.roughnessFactor !== 1
        ) {
          failures.push(
            `${entry.id} material metallic/roughness binding is missing`,
          );
        } else if (
          (material.pbrMetallicRoughness.metallicRoughnessTexture.texCoord ??
            0) !== binding.texCoord
        ) {
          failures.push(
            `${entry.id} material metallic/roughness UV binding changed`,
          );
        }
      }
    }
    if (entry.extraShader) {
      for (const binding of baseColorBindings(after).filter(
        (candidate) =>
          candidate.imageName.toLowerCase() === entry.image.toLowerCase(),
      )) {
        if (
          after.json.materials[binding.materialIndex].extras?.eltania
            ?.extraShader !== entry.extraShader
        ) {
          failures.push(`${entry.id} extraShader metadata is missing`);
        }
      }
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    geometrySignature: geometrySignature(after),
    uvSignature: uvSignature(after),
  };
}
