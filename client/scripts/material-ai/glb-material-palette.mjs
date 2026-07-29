import { createHash } from "node:crypto";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function paddedLength(length) {
  return (length + 3) & ~3;
}

export function parseGlb(bytes) {
  const input = Buffer.from(bytes);
  ensure(input.byteLength >= 20, "GLB is shorter than its header");
  ensure(input.readUInt32LE(0) === GLB_MAGIC, "Input is not a GLB");
  ensure(input.readUInt32LE(4) === 2, "Only GLB version 2 is supported");
  ensure(
    input.readUInt32LE(8) === input.byteLength,
    "GLB header length does not match input length",
  );
  let offset = 12;
  let json;
  let binary;
  while (offset < input.byteLength) {
    const length = input.readUInt32LE(offset);
    const type = input.readUInt32LE(offset + 4);
    const chunk = input.subarray(offset + 8, offset + 8 + length);
    ensure(chunk.byteLength === length, "GLB contains a truncated chunk");
    if (type === JSON_CHUNK) {
      ensure(!json, "GLB contains more than one JSON chunk");
      json = JSON.parse(chunk.toString("utf8").replace(/[\0 ]+$/, ""));
    } else if (type === BIN_CHUNK) {
      ensure(!binary, "GLB contains more than one BIN chunk");
      binary = Buffer.from(chunk);
    }
    offset += 8 + length;
  }
  ensure(json, "GLB has no JSON chunk");
  ensure(binary, "Material palette baking requires an embedded BIN chunk");
  return { json, binary };
}

export function serializeGlb({ json, binary }) {
  const unpaddedJson = Buffer.from(JSON.stringify(json), "utf8");
  const jsonLength = paddedLength(unpaddedJson.byteLength);
  const binaryLength = paddedLength(binary.byteLength);
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binaryLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.byteLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(JSON_CHUNK, 16);
  output.fill(0x20, 20, 20 + jsonLength);
  unpaddedJson.copy(output, 20);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binaryHeader);
  output.writeUInt32LE(BIN_CHUNK, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

export function embeddedImage(document, imageIndex) {
  const image = document.json.images?.[imageIndex];
  ensure(image, `GLB has no image at index ${imageIndex}`);
  ensure(
    Number.isInteger(image.bufferView),
    `Image ${image.name ?? imageIndex} is not embedded`,
  );
  const view = document.json.bufferViews?.[image.bufferView];
  ensure(view, `Image ${image.name ?? imageIndex} has no buffer view`);
  ensure(
    (view.buffer ?? 0) === 0,
    `Image ${image.name ?? imageIndex} is not in buffer 0`,
  );
  const start = view.byteOffset ?? 0;
  return document.binary.subarray(start, start + view.byteLength);
}

export function imageIndicesNamed(document, requestedName) {
  const name = requestedName.toLowerCase();
  return (document.json.images ?? [])
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => image.name?.toLowerCase() === name)
    .map(({ index }) => index);
}

function textureImageIndex(texture) {
  return texture.extensions?.EXT_texture_webp?.source ?? texture.source;
}

export function baseColorBindings(document) {
  const json = document.json;
  return (json.materials ?? []).flatMap((material, materialIndex) => {
    const baseColor = material.pbrMetallicRoughness?.baseColorTexture;
    if (!baseColor) return [];
    const texture = json.textures?.[baseColor.index];
    if (!texture) return [];
    const imageIndex = textureImageIndex(texture);
    const image = json.images?.[imageIndex];
    const sampler = json.samplers?.[texture.sampler];
    return [{
      materialIndex,
      materialName: material.name ?? `material-${materialIndex}`,
      textureIndex: baseColor.index,
      textureName: texture.name ?? `texture-${baseColor.index}`,
      imageIndex,
      imageName: image?.name ?? `image-${imageIndex}`,
      texCoord: baseColor.texCoord ?? 0,
      wrapS: sampler?.wrapS ?? 10497,
      wrapT: sampler?.wrapT ?? 10497,
      alphaMode: material.alphaMode ?? "OPAQUE",
    }];
  });
}

function accessorBytes(document, accessorIndex) {
  const accessor = document.json.accessors?.[accessorIndex];
  ensure(accessor, `GLB has no accessor at index ${accessorIndex}`);
  if (accessor.bufferView === undefined) return Buffer.alloc(0);
  const view = document.json.bufferViews?.[accessor.bufferView];
  ensure(view, `Accessor ${accessorIndex} has no buffer view`);
  const start = view.byteOffset ?? 0;
  return document.binary.subarray(start, start + view.byteLength);
}

export function geometrySignature(document) {
  const primitives = [];
  const accessors = new Set();
  for (const [meshIndex, mesh] of (document.json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const attributes = Object.fromEntries(
        Object.entries(primitive.attributes ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
      for (const index of Object.values(attributes)) accessors.add(index);
      if (primitive.indices !== undefined) accessors.add(primitive.indices);
      primitives.push({
        meshIndex,
        primitiveIndex,
        attributes,
        indices: primitive.indices ?? null,
        material: primitive.material ?? null,
        mode: primitive.mode ?? 4,
      });
    }
  }
  const accessorRecords = [...accessors].sort((a, b) => a - b).map((index) => ({
    index,
    descriptor: document.json.accessors[index],
    bytes: sha256(accessorBytes(document, index)),
  }));
  return sha256(Buffer.from(JSON.stringify({ primitives, accessorRecords })));
}

export function uvSignature(document) {
  const uvAccessors = new Set();
  for (const mesh of document.json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const [semantic, index] of Object.entries(primitive.attributes ?? {})) {
        if (semantic.startsWith("TEXCOORD_")) uvAccessors.add(index);
      }
    }
  }
  const records = [...uvAccessors].sort((a, b) => a - b).map((index) => ({
    index,
    descriptor: document.json.accessors[index],
    bytes: sha256(accessorBytes(document, index)),
  }));
  return sha256(Buffer.from(JSON.stringify(records)));
}

export function appendImageOverrides(document, overrides) {
  const json = structuredClone(document.json);
  const chunks = [Buffer.from(document.binary)];
  let byteLength = document.binary.byteLength;
  for (const override of overrides) {
    const indices = imageIndicesNamed(document, override.imageName);
    ensure(indices.length, `No embedded image is named '${override.imageName}'`);
    const padding = paddedLength(byteLength) - byteLength;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    const payload = Buffer.from(override.bytes);
    const bufferView = json.bufferViews.length;
    json.bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: payload.byteLength,
      name: `palette:${override.imageName}`,
    });
    chunks.push(payload);
    byteLength += payload.byteLength;
    for (const index of indices) {
      json.images[index].bufferView = bufferView;
      json.images[index].mimeType = override.mimeType;
    }
  }
  const binary = Buffer.concat(chunks);
  json.buffers[0].byteLength = binary.byteLength;
  return { json, binary };
}

export function appendMaterialChannels(document, channels) {
  const json = structuredClone(document.json);
  const chunks = [Buffer.from(document.binary)];
  let byteLength = document.binary.byteLength;

  const appendImage = ({ name, bytes, mimeType }) => {
    const padding = paddedLength(byteLength) - byteLength;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    const payload = Buffer.from(bytes);
    const bufferView = json.bufferViews.length;
    json.bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: payload.byteLength,
      name,
    });
    chunks.push(payload);
    byteLength += payload.byteLength;
    const imageIndex = json.images.length;
    json.images.push({ name, mimeType, bufferView });
    return imageIndex;
  };

  for (const channel of channels) {
    const bindings = baseColorBindings(document).filter(
      (binding) =>
        binding.imageName.toLowerCase() === channel.imageName.toLowerCase(),
    );
    ensure(bindings.length, `No material uses '${channel.imageName}' as base color`);
    const baseTexture = json.textures[bindings[0].textureIndex];
    const sampler = baseTexture?.sampler;

    const appendTexture = (kind, source) => {
      const imageIndex = appendImage({
        name: `palette:${channel.imageName}:${kind}`,
        bytes: source.bytes,
        mimeType: source.mimeType,
      });
      const textureIndex = json.textures.length;
      json.textures.push({
        name: `palette:${channel.imageName}:${kind}`,
        ...(sampler === undefined ? {} : { sampler }),
        extensions: { EXT_texture_webp: { source: imageIndex } },
      });
      return textureIndex;
    };

    const normalTexture = channel.normal
      ? appendTexture("normal", channel.normal)
      : null;
    const metallicRoughnessTexture = channel.metallicRoughness
      ? appendTexture("metallic-roughness", channel.metallicRoughness)
      : null;

    for (const binding of bindings) {
      const material = json.materials[binding.materialIndex];
      if (channel.extraShader) {
        material.extras ??= {};
        material.extras.eltania ??= {};
        material.extras.eltania.extraShader = channel.extraShader;
      }
      if (normalTexture !== null) {
        material.normalTexture = {
          index: normalTexture,
          texCoord: binding.texCoord,
          scale: channel.normal.scale ?? 1,
        };
      }
      if (metallicRoughnessTexture !== null) {
        material.pbrMetallicRoughness ??= {};
        material.pbrMetallicRoughness.metallicFactor = 0;
        material.pbrMetallicRoughness.roughnessFactor = 1;
        material.pbrMetallicRoughness.metallicRoughnessTexture = {
          index: metallicRoughnessTexture,
          texCoord: binding.texCoord,
        };
      }
    }
  }

  const binary = Buffer.concat(chunks);
  json.buffers[0].byteLength = binary.byteLength;
  return { json, binary };
}

export function describePaletteTargets(document, imageNames) {
  const names = new Set(imageNames.map((name) => name.toLowerCase()));
  return baseColorBindings(document).filter((binding) =>
    names.has(binding.imageName.toLowerCase()),
  );
}

export { sha256 };
