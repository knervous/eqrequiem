import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { SdCppImg2ImgClient } from './sdcpp-client.mjs';
import {
  LEGACY_SHEET,
  createPassthroughMasters,
  repackSheets,
  sliceSheet,
  slotGeometry,
  verifyRepackedSheet,
  writeCollectionManifest,
} from './sprite-pipeline.mjs';

test('legacy slots mirror source grid X/Y without rotating tile pixels', () => {
  assert.deepEqual(slotGeometry(0), {
    slot: 0,
    column: 0,
    row: 0,
    sourceSlot: 35,
    sourceColumn: 5,
    sourceRow: 5,
    sourceLeft: 200,
    sourceTop: 200,
    left: 16,
    top: 16,
    width: 40,
    height: 40,
  });
  assert.equal(slotGeometry(35).sourceSlot, 0);
  assert.equal(slotGeometry(35).left, 216);
  assert.equal(slotGeometry(35).top, 216);
});

test('slice, 64px master, and original-layout repack preserve pixels', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'requiem-icon-sprite-'));
  const sourceDirectory = path.join(root, 'source');
  const outputRoot = path.join(root, 'output');
  await mkdir(sourceDirectory, { recursive: true });
  const sheetPath = path.join(sourceDirectory, 'dragitem1.png');

  const composites = [];
  for (let slot = 0; slot < LEGACY_SHEET.slots; slot += 1) {
    const color = {
      r: (slot * 47) % 256,
      g: (slot * 83) % 256,
      b: (slot * 131) % 256,
      alpha: 255,
    };
    composites.push({
      input: await sharp({
        create: { width: 40, height: 40, channels: 4, background: color },
      })
        .png()
        .toBuffer(),
      left: (slot % LEGACY_SHEET.columns) * LEGACY_SHEET.cellSize,
      top: Math.floor(slot / LEGACY_SHEET.columns) * LEGACY_SHEET.cellSize,
    });
  }
  await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(sheetPath);

  const sheet = await sliceSheet({ sheetPath, outputRoot });
  const { manifest } = await writeCollectionManifest({ outputRoot, sheets: [sheet] });
  assert.equal(sheet.entries.length, 36);
  assert.equal(sheet.entries[17].atlasIconId, 17);
  await createPassthroughMasters({ outputRoot, manifest });
  await repackSheets({ outputRoot, sourceDirectory, manifest, format: 'png', from: 'slices' });
  const comparison = await verifyRepackedSheet({
    outputRoot,
    sheet,
    repackedPath: path.join(outputRoot, 'repacked', 'dragitem1.png'),
  });
  assert.deepEqual(comparison, {
    equal: true,
    differingBytes: 0,
    maximumDelta: 0,
    paddingAlphaMaximum: 0,
  });
});

test('sd.cpp client maps a deterministic loopback img2img request', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'requiem-icon-transport-'));
  const sourcePath = path.join(root, 'source.png');
  await sharp({
    create: {
      width: 40,
      height: 40,
      channels: 4,
      background: { r: 90, g: 40, b: 20, alpha: 255 },
    },
  })
    .png()
    .toFile(sourcePath);
  const generated = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 3,
      background: { r: 20, g: 30, b: 40 },
    },
  })
    .png()
    .toBuffer();

  let received;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, request) => {
    assert.equal(String(url), 'http://127.0.0.1:17860/sdapi/v1/img2img');
    received = JSON.parse(request.body);
    return new Response(
      JSON.stringify({ images: [generated.toString('base64')], info: '{}' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const client = new SdCppImg2ImgClient({
      baseUrl: 'http://127.0.0.1:17860',
      timeoutMs: 5_000,
    });
    const entry = { sourceHash: '12345678'.padEnd(64, '0') };
    const result = await client.variation({ sourcePath, entry, strength: 0.25 });
    assert.equal(result.seed, 0x12345678);
    assert.equal(received.width, 512);
    assert.equal(received.height, 512);
    assert.equal(received.denoising_strength, 0.25);
    assert.equal(received.init_images.length, 1);
    assert.ok(result.rawBuffer.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
