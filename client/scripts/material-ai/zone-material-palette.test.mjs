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
  surfaceContractSignature,
  uvSignature,
} from "./glb-material-palette.mjs";
import {
  derivePbrChannels,
  enforcePeriodicEdges,
  seamMetrics,
} from "./zone-material-pipeline.mjs";
import {
  centeredBannerCompositionMetrics,
  isRuntimePaletteEntry,
  periodicSeamMetrics,
  resizeRuntimeDataTexture,
  resizeRuntimeTexture,
  runtimeMaterialEntry,
} from "./zone-material-palette.mjs";

test("gate atlas composition keeps its colored banner centered on masonry", async () => {
  const size = 64;
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const banner = x >= size * 0.4 && x < size * 0.6;
      const color = banner ? [153, 104, 27] : [86, 96, 102];
      pixels.set(color, (y * size + x) * 3);
    }
  }
  const texture = await sharp(pixels, {
    raw: { width: size, height: size, channels: 3 },
  })
    .webp()
    .toBuffer();
  const metrics = await centeredBannerCompositionMetrics(texture);
  assert.ok(metrics.centerSaturation >= 0.3, JSON.stringify(metrics));
  assert.ok(metrics.sideSaturation <= 0.24, JSON.stringify(metrics));
  assert.ok(metrics.saturationDelta >= 0.15, JSON.stringify(metrics));
});

test("runtime material promotion requires explicit production approval", () => {
  assert.equal(isRuntimePaletteEntry({ status: "production-candidate" }), true);
  assert.equal(
    isRuntimePaletteEntry({ status: "queued-family-migration" }),
    false,
  );
  assert.equal(
    isRuntimePaletteEntry({ status: "production-candidate", enabled: false }),
    false,
  );
  assert.equal(
    isRuntimePaletteEntry({
      status: "production-candidate",
      authoringOnly: true,
    }),
    false,
  );
});

test("runtime material pools resolve to an approved same-family material", () => {
  const selected = runtimeMaterialEntry(
    {
      families: { facade: { runtimeMaterialPool: ["clean-facade"] } },
      materials: [
        {
          id: "clean-facade",
          family: "facade",
          status: "production-candidate",
        },
      ],
    },
    { id: "shop-slot", family: "facade" },
  );
  assert.equal(selected.id, "clean-facade");
});

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
      [undefined, [0.2, 0.3, 0.4, 1, 0.5, 0.6, 0.7, 1, 0.8, 0.9, 1, 1]],
    ]),
  );
  assert.equal(after.applied, 1);
  assert.deepEqual(accessorValues(after, 0), expectedUvs);
  const colorAccessor = after.json.meshes[0].primitives[0].attributes.COLOR_0;
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
  const replacement = [0.9, 0.8, 0.7, 1, 0.6, 0.5, 0.4, 1, 0.3, 0.2, 0.1, 1];
  const reapplied = appendVertexColorOverrides(
    after,
    new Map([[undefined, replacement]]),
  );
  assert.equal(reapplied.binary.byteLength, after.binary.byteLength);
  const reappliedAccessor =
    reapplied.json.meshes[0].primitives[0].attributes.COLOR_0;
  const firstReappliedColor = accessorValues(reapplied, reappliedAccessor)[0];
  firstReappliedColor.forEach((value, index) =>
    assert.ok(Math.abs(value - replacement[index]) < 1e-6),
  );
});

test("baked vertex colors split across every mesh primitive", async () => {
  const before = parseGlb(await fixtureGlb());
  before.json.meshes[0].name = "multi-primitive";
  before.json.meshes[0].primitives.push(
    structuredClone(before.json.meshes[0].primitives[0]),
  );
  const colors = [
    0.1, 0.2, 0.3, 1, 0.2, 0.3, 0.4, 1, 0.3, 0.4, 0.5, 1, 0.6, 0.7, 0.8, 1, 0.7,
    0.8, 0.9, 1, 0.8, 0.9, 1, 1,
  ];
  const after = appendVertexColorOverrides(
    before,
    new Map([["multi-primitive", colors]]),
  );
  assert.equal(after.applied, 1);
  const [first, second] = after.json.meshes[0].primitives.map((primitive) =>
    accessorValues(after, primitive.attributes.COLOR_0),
  );
  assert.ok(Math.abs(first[0][0] - 0.1) < 1e-6);
  assert.ok(Math.abs(first[2][2] - 0.5) < 1e-6);
  assert.ok(Math.abs(second[0][0] - 0.6) < 1e-6);
  assert.ok(Math.abs(second[2][2] - 1) < 1e-6);
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
  assert.equal(
    surfaceContractSignature(after),
    surfaceContractSignature(before),
  );
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

test("runtime data maps are reduced losslessly with exact periodic edges", async () => {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 3;
      pixels[offset] = 110 + ((x * 7 + y * 3) % 40);
      pixels[offset + 1] = 180 + ((x * 5 + y * 11) % 60);
      pixels[offset + 2] = 128;
    }
  }
  const source = await enforcePeriodicEdges(
    await sharp(pixels, {
      raw: { width: size, height: size, channels: 3 },
    })
      .webp({ lossless: true })
      .toBuffer(),
    { size, repairBand: 4 },
  );
  const output = await resizeRuntimeDataTexture(source, 16);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 16);
  const metrics = await seamMetrics(output);
  assert.equal(metrics.edgeRmseX, 0);
  assert.equal(metrics.edgeRmseY, 0);
  const bakedMetrics = await periodicSeamMetrics(output);
  assert.deepEqual(bakedMetrics, metrics);
});

test("bounded tangent normals are renormalized and remain C1 periodic", async () => {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 3;
      pixels[offset] = 92 + ((x * 11 + y * 3) % 72);
      pixels[offset + 1] = 96 + ((x * 5 + y * 13) % 64);
      pixels[offset + 2] = 205 + ((x + y) % 40);
    }
  }
  const output = await resizeRuntimeDataTexture(
    await sharp(pixels, {
      raw: { width: size, height: size, channels: 3 },
    })
      .webp({ lossless: true })
      .toBuffer(),
    16,
    { tangentNormal: true },
  );
  const metrics = await periodicSeamMetrics(output);
  assert.equal(metrics.edgeRmseX, 0);
  assert.equal(metrics.edgeRmseY, 0);
  assert.ok(metrics.gradientRmseX <= 0.01, JSON.stringify(metrics));
  assert.ok(metrics.gradientRmseY <= 0.01, JSON.stringify(metrics));
  const { data, info } = await sharp(output)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let meanLength = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    meanLength += Math.hypot(
      data[offset] / 127.5 - 1,
      data[offset + 1] / 127.5 - 1,
      data[offset + 2] / 127.5 - 1,
    );
  }
  meanLength /= data.length / info.channels;
  assert.ok(meanLength >= 0.98, `mean normal length ${meanLength}`);
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
  assert.equal(after.json.materials[0].pbrMetallicRoughness.metallicFactor, 1);
  assert.equal(imageIndicesNamed(after, "palette:grass1:normal").length, 1);
  for (const map of [channels.normal, channels.metallicRoughness]) {
    const metrics = await seamMetrics(map);
    assert.equal(metrics.edgeRmseX, 0);
    assert.equal(metrics.edgeRmseY, 0);
  }
  assert.doesNotThrow(() => parseGlb(serializeGlb(after)));
});

test("derived PBR channels preserve rectangular object-texture dimensions", async () => {
  const baseColor = await sharp({
    create: {
      width: 16,
      height: 8,
      channels: 3,
      background: "#76512f",
    },
  })
    .webp({ lossless: true })
    .toBuffer();
  const channels = await derivePbrChannels(baseColor);
  const [normal, metallicRoughness] = await Promise.all([
    sharp(channels.normal).metadata(),
    sharp(channels.metallicRoughness).metadata(),
  ]);
  assert.deepEqual([normal.width, normal.height], [16, 8]);
  assert.deepEqual(
    [metallicRoughness.width, metallicRoughness.height],
    [16, 8],
  );
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
