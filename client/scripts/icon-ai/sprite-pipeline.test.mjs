import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { IconContextDatabase, promptFromContext } from './icon-context.mjs';
import { SdCppImg2ImgClient, isolateChromaBackground } from './sdcpp-client.mjs';
import {
  auditGeneratedCollection,
  promoteGeneratedCollection,
} from './production-assets.mjs';
import {
  LEGACY_SHEET,
  createPassthroughMasters,
  repackSheets,
  sliceSheet,
  slotGeometry,
  verifyRepackedSheet,
  writeMetadata,
  writeCollectionManifest,
} from './sprite-pipeline.mjs';

test('legacy slots undo the source atlas Y flip without introducing an X inset', () => {
  assert.deepEqual(slotGeometry(0), {
    slot: 0,
    column: 0,
    row: 0,
    sourceSlot: 30,
    sourceColumn: 0,
    sourceRow: 5,
    sourceLeft: 0,
    sourceTop: 216,
    left: 0,
    top: 0,
    width: 40,
    height: 40,
  });
  assert.equal(slotGeometry(35).sourceSlot, 5);
  assert.equal(slotGeometry(35).sourceLeft, 200);
  assert.equal(slotGeometry(35).sourceTop, 16);
  assert.equal(slotGeometry(35).left, 200);
  assert.equal(slotGeometry(35).top, 200);
});

test('SQLite item metadata becomes one dominant positive icon concept', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'requiem-icon-context-'));
  const databasePath = path.join(root, 'content.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE items (
      id INTEGER, Name TEXT, idfile TEXT, lore TEXT, icon INTEGER, itemtype INTEGER,
      slots INTEGER, material INTEGER, color INTEGER, magic INTEGER, damage INTEGER,
      delay INTEGER
    );
    INSERT INTO items VALUES
      (1, 'Grotesque Mask', 'IT63', 'A carved mask', 506, 10, 8, 0, 0, 1, 0, 0),
      (2, 'Black Wolf Mask', 'IT91', 'A wolf mask', 506, 10, 8, 0, 0, 1, 0, 0),
      (3, 'Mask of Secrets', 'IT63', 'A veiled mask', 506, 10, 8, 0, 0, 1, 0, 0);
  `);
  database.close();
  const contexts = new IconContextDatabase(databasePath);
  try {
    const context = contexts.contextFor({ atlasIconId: 506 });
    assert.equal(context.recordCount, 3);
    assert.deepEqual(context.imageNames, ['IT63', 'IT91']);
    assert.equal(context.dominantSlot, 'face');
    assert.deepEqual(context.equipmentSlots, [{ name: 'face', count: 3 }]);
    assert.match(promptFromContext(context), /exactly one original high fantasy medieval face mask/i);
    assert.match(promptFromContext(context), /equipment placement: face slot/i);
    assert.match(promptFromContext(context), /chroma green background/i);
    assert.match(promptFromContext(context), /no presentation tile, no card, no frame/i);
  } finally {
    contexts.close();
  }
});

test('edge-field isolation creates a 256px master with transparent exterior pixels', async () => {
  const source = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 0, g: 255, b: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 100,
            height: 140,
            channels: 3,
            background: { r: 120, g: 50, b: 20 },
          },
        })
          .png()
          .toBuffer(),
        left: 78,
        top: 58,
      },
    ])
    .png()
    .toBuffer();
  const isolated = await isolateChromaBackground(source, { finalSize: 256 });
  const { data, info } = await sharp(isolated.buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 256);
  assert.equal(info.height, 256);
  assert.equal(data[3], 0);
  assert.equal(data[(255 * 256 + 255) * 4 + 3], 0);
  assert.ok(isolated.alphaBounds.minimumX >= 16);
  assert.ok(isolated.alphaBounds.maximumX <= 239);
});

test('chroma isolation removes matching backdrop enclosed by an object', async () => {
  const ring = Buffer.from(
    `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="128" cy="128" r="76" fill="none" stroke="#9b4c20" stroke-width="24"/>` +
      `</svg>`,
  );
  const source = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 30, g: 220, b: 45 },
    },
  })
    .composite([{ input: ring, left: 0, top: 0 }])
    .png()
    .toBuffer();
  const isolated = await isolateChromaBackground(source, {
    finalSize: 256,
    requireChromaField: true,
  });
  const { data, info } = await sharp(isolated.buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(data[(128 * info.width + 128) * info.channels + 3], 0);
});

test('singular equipment slots reject multiple substantial icon subjects', async () => {
  const object = await sharp({
    create: {
      width: 54,
      height: 90,
      channels: 3,
      background: { r: 130, g: 45, b: 25 },
    },
  })
    .png()
    .toBuffer();
  const source = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 0, g: 255, b: 0 },
    },
  })
    .composite([
      { input: object, left: 54, top: 82 },
      { input: object, left: 148, top: 82 },
    ])
    .png()
    .toBuffer();
  const paired = await isolateChromaBackground(source, { maxForegroundComponents: 2 });
  assert.equal(paired.foregroundComponents, 2);
  await assert.rejects(
    isolateChromaBackground(source, { maxForegroundComponents: 1 }),
    /slot permits 1 and overflow ratio/,
  );
});

test('slice and original-layout repack preserve pixels', async () => {
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
    const geometry = slotGeometry(slot);
    composites.push({
      input: await sharp({
        create: { width: 40, height: 40, channels: 4, background: color },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 8,
                height: 8,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 255 },
              },
            })
              .png()
              .toBuffer(),
            left: 2,
            top: 3,
          },
        ])
        .flip()
        .png()
        .toBuffer(),
      left: geometry.sourceLeft,
      top: geometry.sourceTop,
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
  assert.equal(manifest.generation.masterSize, 256);
  assert.equal(sheet.entries.length, 36);
  assert.equal(sheet.entries[17].atlasIconId, 532);
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

test('only current transparent txt2img masters can be atomically promoted by icon ID', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'requiem-icon-promotion-'));
  const outputRoot = path.join(root, 'output');
  const publicItemsRoot = path.join(root, 'public', 'eltania', 'items');
  const entry = {
    id: 'dragitem1-00',
    sheetId: 'dragitem1',
    atlasIconId: 500,
    slot: 0,
    sourceSlot: 30,
    sourceLeft: 0,
    sourceTop: 216,
    left: 0,
    top: 0,
    width: 40,
    height: 40,
    sourceHash: 'a'.repeat(64),
    blank: false,
  };
  const manifest = {
    sheets: [{ sheetId: 'dragitem1', entries: [entry] }],
  };
  const masterBuffer = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 112,
            height: 160,
            channels: 4,
            background: { r: 140, g: 70, b: 25, alpha: 255 },
          },
        })
          .png()
          .toBuffer(),
        left: 72,
        top: 48,
      },
    ])
    .png()
    .toBuffer();
  const masterPath = path.join(outputRoot, 'masters', 'dragitem1', `${entry.id}.png`);
  await mkdir(path.dirname(masterPath), { recursive: true });
  await writeFile(masterPath, masterBuffer);
  await writeMetadata({
    outputRoot,
    entry,
    operation: 'text-to-image',
    outputPath: masterPath,
    outputBuffer: masterBuffer,
    parameters: { recipeVersion: 10, finalSize: 256 },
    context: { sqliteIconId: 500 },
  });

  const audit = await auditGeneratedCollection({ outputRoot, manifest });
  assert.equal(audit.promotable, true);
  const promoted = await promoteGeneratedCollection({
    outputRoot,
    manifest,
    publicItemsRoot,
  });
  assert.equal(promoted.iconCount, 1);
  const publicManifest = JSON.parse(
    await readFile(path.join(promoted.targetRoot, 'manifest.json'), 'utf8'),
  );
  assert.equal(publicManifest.addressing, 'SQLite item.icon');
  assert.equal(publicManifest.entries[0].icon, 500);
  assert.equal(
    (await sharp(path.join(promoted.targetRoot, '500.webp')).metadata()).hasAlpha,
    true,
  );
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

test('sd.cpp txt2img sends SQLite context without legacy init pixels', async () => {
  const generated = await sharp({
    create: {
      width: 384,
      height: 384,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
  let received;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, request) => {
    assert.equal(String(url), 'http://127.0.0.1:17860/sdapi/v1/txt2img');
    received = JSON.parse(request.body);
    return new Response(JSON.stringify({ images: [generated.toString('base64')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const client = new SdCppImg2ImgClient({
      baseUrl: 'http://127.0.0.1:17860',
      timeoutMs: 5_000,
    });
    await client.textToImage({
      entry: { sourceHash: '12345678'.padEnd(64, '0') },
      context: {
        itemNames: ['Grotesque Mask', 'Black Wolf Mask'],
        imageNames: ['IT63'],
      },
      generationSize: 384,
      steps: 12,
    });
    assert.equal(received.width, 384);
    assert.equal(received.steps, 12);
    assert.equal('init_images' in received, false);
    assert.match(received.prompt, /exactly one original high fantasy medieval face mask/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
