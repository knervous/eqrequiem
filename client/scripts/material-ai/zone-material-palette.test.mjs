import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  appendImageOverrides,
  appendMaterialChannels,
  embeddedImage,
  geometrySignature,
  imageIndicesNamed,
  parseGlb,
  serializeGlb,
  uvSignature,
} from "./glb-material-palette.mjs";
import {
  derivePbrChannels,
  enforcePeriodicEdges,
  seamMetrics,
} from "./zone-material-pipeline.mjs";

async function fixtureGlb() {
  const geometry = Buffer.from(new Float32Array([
    0, 0,
    1, 0,
    0, 1,
  ]).buffer);
  const image = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: "#52713d",
    },
  }).webp().toBuffer();
  const imageOffset = (geometry.byteLength + 3) & ~3;
  const binary = Buffer.alloc(imageOffset + image.byteLength);
  geometry.copy(binary);
  image.copy(binary, imageOffset);
  return serializeGlb({
    json: {
      asset: { version: "2.0" },
      buffers: [{ byteLength: binary.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: geometry.byteLength },
        { buffer: 0, byteOffset: imageOffset, byteLength: image.byteLength },
      ],
      accessors: [{
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC2",
      }],
      images: [{ name: "grass1", mimeType: "image/webp", bufferView: 1 }],
      textures: [{
        extensions: { EXT_texture_webp: { source: 0 } },
      }],
      materials: [{
        name: "grass1",
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      }],
      meshes: [{
        primitives: [{ attributes: { TEXCOORD_0: 0 }, material: 0 }],
      }],
      extensionsUsed: ["EXT_texture_webp"],
      extensionsRequired: ["EXT_texture_webp"],
    },
    binary,
  });
}

test("image overrides retain all geometry and UV bytes", async () => {
  const before = parseGlb(await fixtureGlb());
  const replacement = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "#798d51",
    },
  }).webp().toBuffer();
  const after = appendImageOverrides(before, [{
    imageName: "grass1",
    bytes: replacement,
    mimeType: "image/webp",
  }]);
  assert.equal(geometrySignature(after), geometrySignature(before));
  assert.equal(uvSignature(after), uvSignature(before));
  assert.deepEqual(embeddedImage(after, 0), replacement);
  assert.doesNotThrow(() => parseGlb(serializeGlb(after)));
});

test("periodic repair closes both texture axes within seam thresholds", async () => {
  const size = 64;
  const data = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 3;
      data[offset] = x * 3;
      data[offset + 1] = y * 3;
      data[offset + 2] = 80;
    }
  }
  const input = await sharp(data, {
    raw: { width: size, height: size, channels: 3 },
  }).png().toBuffer();
  const repaired = await enforcePeriodicEdges(input, {
    size,
    repairBand: 8,
  });
  const metrics = await seamMetrics(repaired);
  assert.ok(metrics.edgeRmseX <= 0.003, JSON.stringify(metrics));
  assert.ok(metrics.edgeRmseY <= 0.003, JSON.stringify(metrics));
  assert.ok(metrics.gradientRmseX <= 0.08, JSON.stringify(metrics));
  assert.ok(metrics.gradientRmseY <= 0.08, JSON.stringify(metrics));
});

test("derived PBR channels remain periodic and bind without changing geometry", async () => {
  const before = parseGlb(await fixtureGlb());
  const baseColor = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "#6f755e",
    },
  }).webp({ lossless: true }).toBuffer();
  const channels = await derivePbrChannels(baseColor, {
    normalStrength: 3,
    roughness: 0.9,
  });
  const after = appendMaterialChannels(before, [{
    imageName: "grass1",
    normal: {
      bytes: channels.normal,
      mimeType: "image/webp",
      scale: 0.7,
    },
    metallicRoughness: {
      bytes: channels.metallicRoughness,
      mimeType: "image/webp",
    },
  }]);
  assert.equal(geometrySignature(after), geometrySignature(before));
  assert.equal(uvSignature(after), uvSignature(before));
  assert.equal(after.json.materials[0].normalTexture.scale, 0.7);
  assert.equal(after.json.materials[0].pbrMetallicRoughness.metallicFactor, 0);
  assert.equal(
    imageIndicesNamed(after, "palette:grass1:normal").length,
    1,
  );
  for (const map of [channels.normal, channels.metallicRoughness]) {
    const metrics = await seamMetrics(map);
    assert.equal(metrics.edgeRmseX, 0);
    assert.equal(metrics.edgeRmseY, 0);
  }
  assert.doesNotThrow(() => parseGlb(serializeGlb(after)));
});
