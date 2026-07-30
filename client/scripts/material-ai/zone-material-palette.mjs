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

function closePeriodicEdges(data, info) {
  const stride = info.width * info.channels;
  for (let y = 0; y < info.height; y++) {
    const first = y * stride;
    const last = first + (info.width - 1) * info.channels;
    data.copy(data, last, first, first + info.channels);
  }
  data.copy(data, (info.height - 1) * stride, 0, stride);
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

export async function extractPaletteSources({ repoRoot, zone, sourceGlb }) {
  const loaded = await readPaletteManifest(repoRoot, zone);
  if (!loaded) throw new Error(`No material palette is authored for ${zone}`);
  const document = parseGlb(sourceGlb);
  const sourceDirectory = path.join(paletteRoot(repoRoot, zone), "source");
  await fs.mkdir(sourceDirectory, { recursive: true });
  const extracted = [];
  for (const entry of loaded.manifest.materials) {
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
      (entry) => entry.image.toLowerCase() === binding.imageName.toLowerCase(),
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
  for (const entry of loaded.manifest.materials) {
    if (entry.enabled === false) continue;
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
    const replacement = path.join(paletteRoot(repoRoot, zone), entry.output);
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
    if (entry.pbr && includePbrTextures) {
      const readChannel = async (relativeFile, label) => {
        const file = path.join(paletteRoot(repoRoot, zone), relativeFile);
        const channelInput = await fs.readFile(file);
        const channelMetadata = await sharp(channelInput).metadata();
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
      const normal = await readChannel(entry.pbr.normal, "normal map");
      normal.scale = entry.pbr.normalScale ?? 1;
      channels.push({
        imageName: entry.image,
        normal,
        metallicRoughness: await readChannel(
          entry.pbr.metallicRoughness,
          "metallic/roughness map",
        ),
        extraShader: entry.extraShader ?? null,
      });
    } else if (entry.extraShader || entry.pbr?.roughness !== undefined) {
      channels.push({
        imageName: entry.image,
        extraShader: entry.extraShader,
        roughness: entry.pbr?.roughness,
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
  for (const entry of loaded.manifest.materials.filter(
    (material) => material.enabled !== false,
  )) {
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
    if (
      dimensions.some(
        (metadata) =>
          metadata.width !== loaded.manifest.outputSize ||
          metadata.height !== loaded.manifest.outputSize,
      )
    ) {
      failures.push(`${entry.id} was not baked at the configured output size`);
    }
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
          channelMetadata.width !== loaded.manifest.outputSize ||
          channelMetadata.height !== loaded.manifest.outputSize
        ) {
          failures.push(`${entry.id} ${kind} map has invalid dimensions`);
        }
      }
      for (const binding of baseColorBindings(after).filter(
        (candidate) =>
          candidate.imageName.toLowerCase() === entry.image.toLowerCase(),
      )) {
        const material = after.json.materials[binding.materialIndex];
        if (!material.normalTexture) {
          failures.push(`${entry.id} material normal binding is missing`);
        }
        if (
          !material.pbrMetallicRoughness?.metallicRoughnessTexture ||
          material.pbrMetallicRoughness.metallicFactor !== 0
        ) {
          failures.push(
            `${entry.id} material metallic/roughness binding is missing`,
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
