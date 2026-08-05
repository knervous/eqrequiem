#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { authoredObjectIds } from "./authored-object-registry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const worldRoot = path.join(
  repoRoot,
  "shader-object/sandbox/public/shado/worlds",
);
const catalogFile = path.join(
  repoRoot,
  "assets/generated/eq-catalog/manifest.json",
);
const outputRoot = path.join(
  repoRoot,
  "client/public/eqrequiem/objects",
);

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function parseGlb(bytes, label) {
  if (
    bytes.byteLength < 20 ||
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.byteLength
  ) {
    throw new Error(`${label} is not a valid binary GLB`);
  }
  const chunks = [];
  let offset = 12;
  while (offset < bytes.byteLength) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > bytes.byteLength) throw new Error(`${label} has a truncated chunk`);
    chunks.push({ type, bytes: Buffer.from(bytes.subarray(offset + 8, end)) });
    offset = end;
  }
  const json = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  const binary = chunks.find((chunk) => chunk.type === 0x004e4942);
  if (!json || !binary) throw new Error(`${label} requires JSON and BIN chunks`);
  return {
    document: JSON.parse(json.bytes.toString("utf8").trimEnd()),
    binary: Buffer.from(binary.bytes),
    chunks,
  };
}

function rebuildGlb(document, binary, sourceChunks) {
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = (json.byteLength + 3) & ~3;
  const jsonChunk = Buffer.alloc(8 + jsonLength, 0x20);
  jsonChunk.writeUInt32LE(jsonLength, 0);
  jsonChunk.writeUInt32LE(0x4e4f534a, 4);
  json.copy(jsonChunk, 8);
  const otherChunks = sourceChunks
    .filter((chunk) => chunk.type !== 0x4e4f534a)
    .map((chunk) => {
      const payload = chunk.type === 0x004e4942 ? binary : chunk.bytes;
      const result = Buffer.alloc(8 + payload.byteLength);
      result.writeUInt32LE(payload.byteLength, 0);
      result.writeUInt32LE(chunk.type, 4);
      payload.copy(result, 8);
      return result;
    });
  const length =
    12 + jsonChunk.byteLength +
    otherChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = Buffer.alloc(length);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(length, 8);
  jsonChunk.copy(output, 12);
  let offset = 12 + jsonChunk.byteLength;
  for (const chunk of otherChunks) {
    chunk.copy(output, offset);
    offset += chunk.byteLength;
  }
  return output;
}

const ACCESSOR_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

function accessorData(parsed, accessorIndex, label) {
  const accessor = parsed.document.accessors?.[accessorIndex];
  const view = parsed.document.bufferViews?.[accessor?.bufferView];
  const components = ACCESSOR_COMPONENTS[accessor?.type];
  if (
    !accessor ||
    !view ||
    view.buffer !== 0 ||
    accessor.sparse ||
    !components ||
    !Number.isInteger(accessor.count) ||
    accessor.count <= 0
  ) {
    throw new Error(`${label} accessor ${accessorIndex} is not a supported GLB stream`);
  }
  return {
    accessor,
    components,
    offset: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    stride:
      view.byteStride ??
      components * ({ 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType] ?? 0),
    data: new DataView(
      parsed.binary.buffer,
      parsed.binary.byteOffset,
      parsed.binary.byteLength,
    ),
  };
}

function reflectFloatAccessorX(parsed, accessorIndex, semantic, reflected) {
  const key = `${semantic}:${accessorIndex}`;
  if (reflected.has(key)) return;
  reflected.add(key);
  const stream = accessorData(parsed, accessorIndex, semantic);
  if (
    stream.accessor.componentType !== 5126 ||
    stream.components < 3 ||
    stream.stride < stream.components * 4
  ) {
    throw new Error(`${semantic} accessor ${accessorIndex} must be a float vector`);
  }
  for (let row = 0; row < stream.accessor.count; row++) {
    const offset = stream.offset + row * stream.stride;
    stream.data.setFloat32(
      offset,
      -stream.data.getFloat32(offset, true),
      true,
    );
    if (semantic === "TANGENT") {
      stream.data.setFloat32(
        offset + 12,
        -stream.data.getFloat32(offset + 12, true),
        true,
      );
    }
  }
  if (
    semantic === "POSITION" &&
    stream.accessor.min?.length === 3 &&
    stream.accessor.max?.length === 3
  ) {
    const minimum = stream.accessor.min[0];
    stream.accessor.min[0] = -stream.accessor.max[0];
    stream.accessor.max[0] = -minimum;
  }
}

function reverseTriangleAccessor(parsed, accessorIndex, reversed) {
  if (reversed.has(accessorIndex)) return;
  reversed.add(accessorIndex);
  const stream = accessorData(parsed, accessorIndex, "index");
  if (
    stream.accessor.type !== "SCALAR" ||
    ![5121, 5123, 5125].includes(stream.accessor.componentType) ||
    stream.accessor.count % 3 !== 0
  ) {
    throw new Error(`Index accessor ${accessorIndex} is not a triangle stream`);
  }
  const io = {
    5121: ["getUint8", "setUint8", 1],
    5123: ["getUint16", "setUint16", 2],
    5125: ["getUint32", "setUint32", 4],
  }[stream.accessor.componentType];
  for (let index = 0; index < stream.accessor.count; index += 3) {
    const second = stream.offset + (index + 1) * stream.stride;
    const third = stream.offset + (index + 2) * stream.stride;
    const b = stream.data[io[0]](second, true);
    const c = stream.data[io[0]](third, true);
    stream.data[io[1]](second, c, true);
    stream.data[io[1]](third, b, true);
  }
}

/**
 * Mark an object payload for Babylon's right-handed game scene without
 * rewriting authored geometry. Babylon applies no loader reflection in that
 * mode, so adding a compensation root would itself mirror the prototype.
 */
export function preprocessZoneObjectGlb(source, label = "zone object") {
  const parsed = parseGlb(Buffer.from(source), label);
  const scenes = parsed.document.scenes ?? [];
  if (!scenes.length) {
    throw new Error(`${label} requires at least one scene`);
  }
  for (const mesh of parsed.document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(primitive.indices)) {
        throw new Error(`${label} requires indexed triangle primitives`);
      }
    }
  }
  parsed.document.asset.extras = {
    ...parsed.document.asset.extras,
    requiemRuntimeContract: "babylon-rhs-y-up-v3",
    runtimeHandedness: "right",
  };
  return rebuildGlb(parsed.document, parsed.binary, parsed.chunks);
}

/**
 * Requiem zone exports carry an exporter X-reflection root that compensates
 * Babylon's default left-handed glTF import. Canonical Requiem gameplay space
 * also reflects the imported zone geometry on X while metadata, entities, and
 * object placements remain in their authored coordinates. Bake that geometry
 * reflection into attributes and winding, then remove the exporter root. The
 * right-handed runtime receives canonical geometry with determinant +1 and no
 * runtime reflection.
 */
export function preprocessZoneSceneGlb(source, label = "zone scene") {
  const parsed = parseGlb(Buffer.from(source), label);
  const nodes = parsed.document.nodes ?? [];
  const scenes = parsed.document.scenes ?? [];
  if (!scenes.length) {
    throw new Error(`${label} requires at least one scene`);
  }
  for (const scene of scenes) {
    if (!scene.nodes?.length) {
      throw new Error(`${label} has a scene without a root node`);
    }
    for (const nodeIndex of scene.nodes) {
      const root = nodes[nodeIndex];
      if (
        !root ||
        !Array.isArray(root.scale) ||
        root.scale.length !== 3 ||
        root.scale[0] !== -1 ||
        root.scale[1] !== 1 ||
        root.scale[2] !== 1
      ) {
        throw new Error(`${label} does not have the current exporter reflection root`);
      }
      delete root.scale;
    }
  }
  const reflected = new Set();
  const reversed = new Set();
  for (const mesh of parsed.document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(primitive.indices)) {
        throw new Error(`${label} requires indexed triangle primitives`);
      }
      for (const semantic of ["POSITION", "NORMAL", "TANGENT"]) {
        const accessor = primitive.attributes?.[semantic];
        if (Number.isInteger(accessor)) {
          reflectFloatAccessorX(parsed, accessor, semantic, reflected);
        }
      }
      reverseTriangleAccessor(parsed, primitive.indices, reversed);
    }
  }
  parsed.document.asset.extras = {
    ...parsed.document.asset.extras,
    requiemRuntimeContract: "babylon-rhs-y-up-v4",
    runtimeHandedness: "right",
    exporterReflectionRemoved: true,
    canonicalZoneMirrorXApplied: true,
  };
  return rebuildGlb(parsed.document, parsed.binary, parsed.chunks);
}

export async function promoteZoneObjectAssets(requestedZones = ["qeynos2"]) {
  const zones = requestedZones
    .map((value) => value.toLowerCase())
    .sort();
  if (!zones.length) {
    throw new Error("Object promotion requires at least one zone");
  }
  if (new Set(zones).size !== zones.length) {
    throw new Error("Zone arguments must be unique");
  }
  const worlds = [];
  for (const zone of zones) {
    const world = JSON.parse(
      gunzipSync(
        await fs.readFile(path.join(worldRoot, `${zone}.spatial.json.gz`)),
      ),
    );
    if (
      world.kind !== "shado.world.spatial" ||
      world.version !== 5 ||
      world.name.toLowerCase() !== zone ||
      world.coordinateSystem !== "babylon-y-up"
    ) {
      throw new Error(`Zone '${zone}' does not have a current world package`);
    }
    worlds.push(world);
  }
  const catalogBytes = await fs.readFile(catalogFile);
  const catalog = JSON.parse(catalogBytes);
  const catalogObjects = new Map(
    catalog.assets
      .filter((asset) => asset.kind === "object")
      .map((asset) => [asset.id, asset]),
  );
  // Authored prototypes are deliberately absent from the RoF2 catalog: they are
  // built from checked-in sources by promote-authored-zone-objects.mjs and
  // publish to the same runtime URL. Skipping them here keeps this pass the
  // sole authority over catalog assets without making a zone that references an
  // authored building unpromotable.
  const authored = await authoredObjectIds();
  const requiredIds = [
    ...new Set(
      worlds.flatMap((world) => world.objects.prototypes.id),
    ),
  ]
    .filter((id) => !authored.has(id))
    .sort();
  const required = requiredIds.map((id) => {
    const asset = catalogObjects.get(id);
    if (!asset?.source) throw new Error(`Catalog has no source for '${id}'`);
    return { id, asset };
  });

  // Validate every source before changing public output.
  const processed = [];
  for (const { id, asset } of required) {
    const compressedSource = await fs.readFile(asset.source);
    if (sha256(compressedSource) !== asset.sourceSha256) {
      throw new Error(`Catalog source checksum changed for '${id}'`);
    }
    const source = asset.source.toLowerCase().endsWith(".gz")
      ? gunzipSync(compressedSource)
      : compressedSource;
    const runtime = preprocessZoneObjectGlb(source, id);
    const compressed = gzipSync(runtime, { level: 9 });
    processed.push({
      id,
      runtime,
      compressed,
      source: asset.source,
      sourceSha256: asset.sourceSha256,
    });
  }

  await fs.mkdir(outputRoot, { recursive: true });
  for (const object of processed) {
    const directory = path.join(outputRoot, object.id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "final.glb.gz"), object.compressed);
  }
  const manifest = {
    kind: "requiem.object-assets",
    version: 3,
    coordinateSystem: "babylon-y-up",
    runtimeHandedness: "right",
    sourceTransform: "identity",
    sourceCatalogSha256: sha256(catalogBytes),
    zones,
    objects: processed.map((object) => ({
      id: object.id,
      source: `/eqrequiem/objects/${object.id}/final.glb.gz`,
      sourceSha256: object.sourceSha256,
      contentSha256: sha256(object.runtime),
      compressedSha256: sha256(object.compressed),
      bytes: object.runtime.byteLength,
      compressedBytes: object.compressed.byteLength,
    })),
  };
  await fs.writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Promoted ${processed.length} current object assets for ${zones.join(", ")} ` +
      `(${processed.reduce((sum, object) => sum + object.compressed.byteLength, 0)} compressed bytes)`,
  );
  return {
    manifest,
    manifestFile: path.join(outputRoot, "manifest.json"),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await promoteZoneObjectAssets(
    process.argv.length > 2 ? process.argv.slice(2) : ["qeynos2"],
  );
}
