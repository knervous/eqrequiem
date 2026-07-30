import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  accessorValues,
  appendImageOverrides,
  appendMaterialChannels,
  appendVertexColorOverrides,
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
import { resizeRuntimeTexture } from "./zone-material-palette.mjs";

test("accessor decoding respects interleaved strides and accessor offsets", () => {
  const binary = Buffer.alloc(2 * 20);
  const view = new DataView(
    binary.buffer,
    binary.byteOffset,
    binary.byteLength,
  );
  // Two records: padding float, VEC2 UV, then two padding floats.
  for (const [index, values] of [
    [0, [99, -2.5, 4.25, 88, 77]],
    [1, [66, 7.5, -8.25, 55, 44]],
  ]) {
    values.forEach((value, component) =>
      view.setFloat32(index * 20 + component * 4, value, true),
    );
  }
  const document = {
    json: {
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 40, byteStride: 20 },
      ],
      accessors: [
        {
          bufferView: 0,
          byteOffset: 4,
          componentType: 5126,
          count: 2,
          type: "VEC2",
        },
      ],
    },
    binary,
  };
  assert.deepEqual(accessorValues(document, 0), [
    [-2.5, 4.25],
    [7.5, -8.25],
  ]);
});

async function fixtureGlb() {
  const geometry = Buffer.from(new Float32Array([0, 0, 1, 0, 0, 1]).buffer);
  const image = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: "#52713d",
    },
  })
    .webp()
    .toBuffer();
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
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC2",
        },
      ],
      images: [{ name: "grass1", mimeType: "image/webp", bufferView: 1 }],
      textures: [
        {
          extensions: { EXT_texture_webp: { source: 0 } },
        },
      ],
      materials: [
        {
          name: "grass1",
          pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
        },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0, TEXCOORD_0: 0 },
              material: 0,
            },
          ],
        },
      ],
      extensionsUsed: ["EXT_texture_webp"],
      extensionsRequired: ["EXT_texture_webp"],
    },
    binary,
  });
}

test("baked vertex colors append without changing existing UV values", async () => {
  const before = parseGlb(await fixtureGlb());
  const expectedUvs = accessorValues(before, 0);
  const after = appendVertexColorOverrides(
    before,
    new Map([
      [
        undefined,
        [
          0.2, 0.3, 0.4, 1,
          0.5, 0.6, 0.7, 1,
          0.8, 0.9, 1, 1,
        ],
      ],
    ]),
  );
  assert.equal(after.applied, 1);
  assert.deepEqual(accessorValues(after, 0), expectedUvs);
  const colorAccessor =
    after.json.meshes[0].primitives[0].attributes.COLOR_0;
  const colors = accessorValues(after, colorAccessor);
  const expectedColors = [
    [0.2, 0.3, 0.4, 1],
    [0.5, 0.6, 0.7, 1],
    [0.8, 0.9, 1, 1],
  ];
  colors.forEach((color, row) =>
    color.forEach((value, column) =>
      assert.ok(
        Math.abs(value - expectedColors[row][column]) < 1e-6,
        `${row}/${column}: ${value}`,
      ),
    ),
  );
  assert.equal(
    after.json.asset.extras.eltaniaBakedLighting.dynamicWorldLights,
    false,
  );
});

test("image overrides retain all geometry and UV bytes", async () => {
  const before = parseGlb(await fixtureGlb());
  const replacement = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "#798d51",
    },
  })
    .webp()
    .toBuffer();
  const after = appendImageOverrides(before, [
    {
      imageName: "grass1",
      bytes: replacement,
      mimeType: "image/webp",
    },
  ]);
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
  })
    .png()
    .toBuffer();
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

test("runtime textures are reduced with exact periodic edges", async () => {
  const size = 64;
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 3;
      pixels[offset] = 70 + ((x * 13 + y * 7) % 80);
      pixels[offset + 1] = 85 + ((x * 5 + y * 11) % 80);
      pixels[offset + 2] = 55 + ((x * 3 + y * 17) % 60);
    }
  }
  const source = await enforcePeriodicEdges(
    await sharp(pixels, {
      raw: {
        width: size,
        height: size,
        channels: 3,
      },
    })
      .png()
      .toBuffer(),
    { size, repairBand: 8 },
  );
  const output = await resizeRuntimeTexture(source, 16);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 16);
  const metrics = await seamMetrics(output);
  assert.equal(metrics.edgeRmseX, 0);
  assert.equal(metrics.edgeRmseY, 0);
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
  })
    .webp({ lossless: true })
    .toBuffer();
  const channels = await derivePbrChannels(baseColor, {
    normalStrength: 3,
    roughness: 0.9,
  });
  const after = appendMaterialChannels(before, [
    {
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
    },
  ]);
  assert.equal(geometrySignature(after), geometrySignature(before));
  assert.equal(uvSignature(after), uvSignature(before));
  assert.equal(after.json.materials[0].normalTexture.scale, 0.7);
  assert.equal(after.json.materials[0].pbrMetallicRoughness.metallicFactor, 0);
  assert.equal(imageIndicesNamed(after, "palette:grass1:normal").length, 1);
  for (const map of [channels.normal, channels.metallicRoughness]) {
    const metrics = await seamMetrics(map);
    assert.equal(metrics.edgeRmseX, 0);
    assert.equal(metrics.edgeRmseY, 0);
  }
  assert.doesNotThrow(() => parseGlb(serializeGlb(after)));
});

test("scalar runtime roughness does not append normal or packed PBR maps", async () => {
  const before = parseGlb(await fixtureGlb());
  const after = appendMaterialChannels(before, [
    {
      imageName: "grass1",
      roughness: 0.91,
      extraShader: "grass",
    },
  ]);
  const material = after.json.materials[0];
  assert.equal(material.normalTexture, undefined);
  assert.equal(
    material.pbrMetallicRoughness.metallicRoughnessTexture,
    undefined,
  );
  assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
  assert.equal(material.pbrMetallicRoughness.roughnessFactor, 0.91);
  assert.equal(material.extras.eltania.extraShader, "grass");
});
