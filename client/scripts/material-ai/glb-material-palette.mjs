import { createHash } from "node:crypto";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
    return [
      {
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
      },
    ];
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

const ACCESSOR_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const COMPONENT_BYTES = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

function readComponent(view, offset, componentType) {
  if (componentType === 5120) return view.getInt8(offset);
  if (componentType === 5121) return view.getUint8(offset);
  if (componentType === 5122) return view.getInt16(offset, true);
  if (componentType === 5123) return view.getUint16(offset, true);
  if (componentType === 5125) return view.getUint32(offset, true);
  if (componentType === 5126) return view.getFloat32(offset, true);
  throw new Error(`Unsupported glTF accessor component type ${componentType}`);
}

function normalizeComponent(value, componentType) {
  if (componentType === 5120) return Math.max(value / 127, -1);
  if (componentType === 5121) return value / 255;
  if (componentType === 5122) return Math.max(value / 32767, -1);
  if (componentType === 5123) return value / 65535;
  if (componentType === 5125) return value / 4294967295;
  return value;
}

/**
 * Decode an accessor without disturbing the source GLB. This deliberately
 * returns plain arrays because material audits favor clarity over hot-path
 * allocation behavior.
 */
export function accessorValues(document, accessorIndex) {
  const accessor = document.json.accessors?.[accessorIndex];
  ensure(accessor, `GLB has no accessor at index ${accessorIndex}`);
  ensure(
    accessor.sparse === undefined,
    `Sparse accessor ${accessorIndex} is not supported by the material audit`,
  );
  const componentCount = ACCESSOR_COMPONENTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  ensure(componentCount, `Accessor ${accessorIndex} has invalid type`);
  ensure(
    componentBytes,
    `Accessor ${accessorIndex} has invalid component type`,
  );
  if (accessor.bufferView === undefined) {
    return Array.from({ length: accessor.count }, () =>
      Array(componentCount).fill(0),
    );
  }
  const bufferView = document.json.bufferViews?.[accessor.bufferView];
  ensure(bufferView, `Accessor ${accessorIndex} has no buffer view`);
  ensure(
    (bufferView.buffer ?? 0) === 0,
    `Accessor ${accessorIndex} is not in buffer 0`,
  );
  const packedStride = componentCount * componentBytes;
  const stride = bufferView.byteStride ?? packedStride;
  ensure(
    stride >= packedStride,
    `Accessor ${accessorIndex} has an invalid byte stride`,
  );
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const required =
    start + Math.max(0, accessor.count - 1) * stride + packedStride;
  ensure(
    required <= document.binary.byteLength,
    `Accessor ${accessorIndex} exceeds the GLB binary chunk`,
  );
  const view = new DataView(
    document.binary.buffer,
    document.binary.byteOffset,
    document.binary.byteLength,
  );
  return Array.from({ length: accessor.count }, (_, elementIndex) =>
    Array.from({ length: componentCount }, (__, componentIndex) => {
      const value = readComponent(
        view,
        start + elementIndex * stride + componentIndex * componentBytes,
        accessor.componentType,
      );
      return accessor.normalized
        ? normalizeComponent(value, accessor.componentType)
        : value;
    }),
  );
}

export function geometrySignature(document) {
  const primitives = [];
  const accessors = new Set();
  for (const [meshIndex, mesh] of (document.json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (
      mesh.primitives ?? []
    ).entries()) {
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
  const accessorRecords = [...accessors]
    .sort((a, b) => a - b)
    .map((index) => ({
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
      for (const [semantic, index] of Object.entries(
        primitive.attributes ?? {},
      )) {
        if (semantic.startsWith("TEXCOORD_")) uvAccessors.add(index);
      }
    }
  }
  const records = [...uvAccessors]
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      descriptor: document.json.accessors[index],
      bytes: sha256(accessorBytes(document, index)),
    }));
  return sha256(Buffer.from(JSON.stringify(records)));
}

/**
 * Hash the portable surface behavior that a palette image replacement must
 * preserve. PBR detail channels and Requiem extras are deliberately excluded:
 * those are authored by the palette bake itself.
 */
export function surfaceContractSignature(document) {
  const json = document.json;
  const records = (json.materials ?? []).map((material, materialIndex) => {
    const baseColorTexture = material.pbrMetallicRoughness?.baseColorTexture;
    const texture = baseColorTexture
      ? json.textures?.[baseColorTexture.index]
      : null;
    const sampler = texture ? json.samplers?.[texture.sampler] : null;
    return {
      materialIndex,
      name: material.name ?? null,
      alphaMode: material.alphaMode ?? "OPAQUE",
      alphaCutoff: material.alphaCutoff ?? 0.5,
      doubleSided: material.doubleSided ?? false,
      emissiveFactor: material.emissiveFactor ?? [0, 0, 0],
      emissiveTexture: material.emissiveTexture ?? null,
      baseColorFactor: material.pbrMetallicRoughness?.baseColorFactor ?? [
        1, 1, 1, 1,
      ],
      baseColorTexCoord: baseColorTexture?.texCoord ?? 0,
      baseColorTransform:
        baseColorTexture?.extensions?.KHR_texture_transform ?? null,
      sampler: {
        magFilter: sampler?.magFilter ?? null,
        minFilter: sampler?.minFilter ?? null,
        wrapS: sampler?.wrapS ?? 10497,
        wrapT: sampler?.wrapT ?? 10497,
      },
    };
  });
  return sha256(Buffer.from(JSON.stringify(records)));
}

export function appendImageOverrides(document, overrides) {
  const json = structuredClone(document.json);
  const chunks = [Buffer.from(document.binary)];
  let byteLength = document.binary.byteLength;
  for (const override of overrides) {
    const indices = imageIndicesNamed(document, override.imageName);
    ensure(
      indices.length,
      `No embedded image is named '${override.imageName}'`,
    );
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

export function appendVertexColorOverrides(document, colorsByMesh) {
  const json = structuredClone(document.json);
  const chunks = [Buffer.from(document.binary)];
  let byteLength = document.binary.byteLength;
  let applied = 0;
  for (const mesh of json.meshes ?? []) {
    const colors = colorsByMesh.get(mesh.name);
    if (!colors) continue;
    ensure(
      mesh.primitives?.length > 0,
      `Mesh '${mesh.name}' has no primitives for baked vertex lighting`,
    );
    const positionAccessors = mesh.primitives.map(
      (primitive) => json.accessors?.[primitive.attributes?.POSITION],
    );
    ensure(
      positionAccessors.every(Boolean),
      `Mesh '${mesh.name}' has a primitive without a position accessor`,
    );
    const positionCount = positionAccessors.reduce(
      (total, accessor) => total + accessor.count,
      0,
    );
    ensure(
      colors.length === positionCount * 4,
      `Mesh '${mesh.name}' requires ${positionCount * 4} color values, ` +
        `got ${colors.length}`,
    );
    let colorOffset = 0;
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const positionAccessor = positionAccessors[primitiveIndex];
      const primitiveColorCount = positionAccessor.count * 4;
      const primitiveColors = colors.slice(
        colorOffset,
        colorOffset + primitiveColorCount,
      );
      colorOffset += primitiveColorCount;
      const streamName =
        mesh.primitives.length === 1
          ? `baked-lighting:${mesh.name}`
          : `baked-lighting:${mesh.name}:${primitiveIndex}`;
      const existingAccessor = json.accessors?.[primitive.attributes?.COLOR_0];
      const existingView = json.bufferViews?.[existingAccessor?.bufferView];
      const existingStride = existingView?.byteStride ?? 16;
      if (
        existingAccessor?.componentType === 5126 &&
        existingAccessor.type === "VEC4" &&
        existingAccessor.count === positionAccessor.count &&
        existingView?.buffer === 0 &&
        existingStride === 16 &&
        !existingAccessor.sparse
      ) {
        const baseOffset =
          (existingView.byteOffset ?? 0) + (existingAccessor.byteOffset ?? 0);
        ensure(
          baseOffset + existingAccessor.count * existingStride <=
            chunks[0].byteLength,
          `Existing COLOR_0 for mesh '${mesh.name}' primitive ${primitiveIndex} exceeds its binary buffer`,
        );
        for (let vertex = 0; vertex < existingAccessor.count; vertex++) {
          for (let component = 0; component < 4; component++) {
            chunks[0].writeFloatLE(
              primitiveColors[vertex * 4 + component],
              baseOffset + vertex * existingStride + component * 4,
            );
          }
        }
        existingAccessor.min = [0, 0, 0, 1];
        existingAccessor.max = [1, 1, 1, 1];
        existingAccessor.name = streamName;
        continue;
      }
      const padding = paddedLength(byteLength) - byteLength;
      if (padding) {
        chunks.push(Buffer.alloc(padding));
        byteLength += padding;
      }
      const payload = Buffer.alloc(primitiveColors.length * 4);
      for (let index = 0; index < primitiveColors.length; index++) {
        payload.writeFloatLE(primitiveColors[index], index * 4);
      }
      const bufferView = json.bufferViews.length;
      json.bufferViews.push({
        buffer: 0,
        byteOffset: byteLength,
        byteLength: payload.byteLength,
        name: streamName,
        target: 34962,
      });
      chunks.push(payload);
      byteLength += payload.byteLength;
      const accessor = json.accessors.length;
      json.accessors.push({
        bufferView,
        byteOffset: 0,
        componentType: 5126,
        count: positionAccessor.count,
        type: "VEC4",
        min: [0, 0, 0, 1],
        max: [1, 1, 1, 1],
        name: streamName,
      });
      primitive.attributes.COLOR_0 = accessor;
    }
    applied++;
  }
  const binary = Buffer.concat(chunks);
  json.buffers[0].byteLength = binary.byteLength;
  json.asset.extras = {
    ...json.asset.extras,
    eltaniaBakedLighting: {
      mode: "vertex-rgb-static",
      version: 1,
      dynamicWorldLights: false,
    },
  };
  return { json, binary, applied };
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
    ensure(
      bindings.length,
      `No material uses '${channel.imageName}' as base color`,
    );
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
        // glTF multiplies the metallic texture's B channel by this factor.
        // Keep it at one so an authored metallic mask is not silently disabled;
        // dielectric maps already carry zero in their B channel.
        material.pbrMetallicRoughness.metallicFactor = 1;
        material.pbrMetallicRoughness.roughnessFactor = 1;
        material.pbrMetallicRoughness.metallicRoughnessTexture = {
          index: metallicRoughnessTexture,
          texCoord: binding.texCoord,
        };
      }
      if (channel.roughness !== undefined) {
        material.pbrMetallicRoughness ??= {};
        material.pbrMetallicRoughness.metallicFactor = 0;
        material.pbrMetallicRoughness.roughnessFactor = channel.roughness;
        delete material.pbrMetallicRoughness.metallicRoughnessTexture;
        delete material.normalTexture;
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
