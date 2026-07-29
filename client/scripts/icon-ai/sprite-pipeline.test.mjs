import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import {
  IconContextDatabase,
  chromaKeyForContext,
  promptFromContext,
} from './icon-context.mjs';
import {
  createPocContactSheet,
  SdCppImg2ImgClient,
  TEXT_GENERATION_RECIPE,
  isolateChromaBackground,
  isolateGeneratedBackground,
  negativePromptForContext,
  summarizeGenerationFailures,
} from './sdcpp-client.mjs';
import { SdCppServer } from './sdcpp-server.mjs';
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

test('managed diffusion server refuses non-loopback hosts and invalid ports', () => {
  assert.throws(() => new SdCppServer({ host: '0.0.0.0' }), /loopback/);
  assert.throws(() => new SdCppServer({ port: 70_000 }), /Invalid.*port/);
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
    assert.match(
      promptFromContext(context),
      /original pre-industrial medieval high-fantasy face mask from Elrador/i,
    );
    assert.match(promptFromContext(context), /face equipment slot/i);
    assert.match(promptFromContext(context), /featureless bright light-gray field/i);
    assert.match(promptFromContext(context), /pre-industrial medieval high-fantasy/i);
    assert.match(
      negativePromptForContext(context),
      /^modern, anachronistic, contemporary, industrial, electronic, firearm/i,
    );
    assert.match(
      promptFromContext(context, { retryReason: 'subjects' }),
      /correction: exactly one object, no duplicate or alternate/i,
    );
  } finally {
    contexts.close();
  }
});

test('prompt context selects a non-conflicting key and treats equipment pairs as one design', () => {
  const natureRing = {
    recordCount: 2,
    itemNames: ['Verdant Emerald Ring', 'Forest Signet'],
    dominantSlot: 'finger',
  };
  assert.deepEqual(chromaKeyForContext(natureRing), {
    name: 'magenta',
    hex: '#ff00ff',
  });
  assert.match(
    promptFromContext(natureRing, { backgroundStrategy: 'chroma' }),
    /chroma magenta #ff00ff/i,
  );

  const gauntlets = {
    recordCount: 3,
    itemNames: ['Lupine Claw Gauntlets', 'Griffon Talon Gloves'],
    dominantSlot: 'hands',
  };
  assert.match(
    promptFromContext(gauntlets),
    /exactly two separate five-fingered armored gloves.*five visible articulated metal fingers.*never crossed or overlapping/i,
  );
  assert.doesNotMatch(negativePromptForContext(gauntlets), /multiple objects/i);
  assert.match(negativePromptForContext(gauntlets), /weapon, axe, sword, blade/i);
  assert.match(negativePromptForContext(gauntlets), /bracer without fingers/i);
  assert.match(
    negativePromptForContext({ dominantSlot: 'face' }),
    /multiple objects/i,
  );
  assert.match(
    promptFromContext({
      recordCount: 2,
      itemNames: ['Ancient Boots'],
      dominantSlot: 'feet',
      dominantConcept: 'pair of boots',
    }),
    /clear empty gap between their silhouettes, never overlapping/i,
  );
  assert.match(
    negativePromptForContext({
      dominantSlot: null,
      dominantConcept: 'magical orb',
    }),
    /product photography.*display case.*perfect reflective sphere/i,
  );
});

test('generation rejection telemetry summarizes common failure sets', () => {
  assert.deepEqual(
    summarizeGenerationFailures([
      {
        id: 'dragitem1-01',
        rejections: [
          {
            reason: 'foreground mask is a large filled rectangle and likely a card',
            retryMode: 'chroma',
          },
          {
            reason: 'model did not produce a clean removable field',
            retryMode: 'chroma',
          },
          {
            reason: 'foreground has 2 substantial disconnected subjects',
            retryMode: 'subjects',
          },
        ],
      },
    ]),
    {
      failedIcons: 1,
      rejectedAttempts: 3,
      byFailureSet: {
        'multiple-subjects': 1,
        'non-removable-background': 1,
        'presentation-card-or-backdrop': 1,
      },
      byRetryMode: { chroma: 2, subjects: 1 },
    },
  );
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

test('a clean vivid non-green chroma field is accepted and removed', async () => {
  const source = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 25, g: 45, b: 235 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 92,
            height: 136,
            channels: 3,
            background: { r: 145, g: 65, b: 20 },
          },
        })
          .png()
          .toBuffer(),
        left: 82,
        top: 60,
      },
    ])
    .png()
    .toBuffer();
  const isolated = await isolateChromaBackground(source, {
    finalSize: 256,
    requireChromaField: true,
  });
  const data = await sharp(isolated.buffer).ensureAlpha().raw().toBuffer();
  assert.equal(data[3], 0);
});

test('hue-following isolation removes a chroma gradient instead of retaining a halo', async () => {
  const source = await sharp(
    Buffer.from(
      `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><radialGradient id="key"><stop offset="0" stop-color="#00cc00"/>` +
        `<stop offset="1" stop-color="#5feee0"/></radialGradient></defs>` +
        `<rect width="256" height="256" fill="url(#key)"/>` +
        `<path d="M90 196 L104 76 Q128 48 152 76 L166 196 Z" fill="#813b1e"/>` +
        `</svg>`,
    ),
  )
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
  assert.equal(data[(128 * info.width + 24) * info.channels + 3], 0);
  assert.ok(isolated.opaquePixelRatio < 0.25);
});

test('generated-background isolation falls back to a validated local model matte', async () => {
  const striped = await sharp(
    Buffer.from(
      `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="128" height="256" fill="#fff"/><rect x="128" width="128" height="256" fill="#4a9fec"/>` +
        `</svg>`,
    ),
  )
    .png()
    .toBuffer();
  const matte = await sharp({
    create: {
      width: 320,
      height: 320,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 120,
            height: 170,
            channels: 4,
            background: { r: 115, g: 48, b: 20, alpha: 255 },
          },
        })
          .png()
          .toBuffer(),
        left: 100,
        top: 75,
      },
    ])
    .png()
    .toBuffer();
  const isolated = await isolateGeneratedBackground(striped, {
    finalSize: 256,
    maxForegroundComponents: 1,
    backgroundRemover: {
      available: async () => true,
      remove: async () => ({
        buffer: matte,
        modelId: 'fixture-u2net.onnx',
        inferenceMs: 7,
        maskRange: { minimum: 0, maximum: 1 },
      }),
    },
  });
  assert.match(isolated.backgroundIsolation, /local U2Net matte/);
  assert.equal(isolated.backgroundRemovalModel, 'fixture-u2net.onnx');
  assert.equal(isolated.backgroundRemovalInferenceMs, 7);
  const data = await sharp(isolated.buffer).ensureAlpha().raw().toBuffer();
  assert.equal(data[3], 0);
});

test('slot-aware matte repair preserves a ring opening and completes a damaged orb', async () => {
  const striped = await sharp(
    Buffer.from(
      `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="128" height="256" fill="#fff"/>` +
        `<rect x="128" width="128" height="256" fill="#79a9d8"/>` +
        `</svg>`,
    ),
  )
    .png()
    .toBuffer();
  const ringAlpha = await sharp(
    Buffer.from(
      `<svg width="320" height="320" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><mask id="ring-damage"><rect width="320" height="320" fill="#fff"/>` +
        `<circle cx="160" cy="70" r="9" fill="#000"/></mask></defs>` +
        `<circle cx="160" cy="160" r="90" fill="none" stroke="#fff" ` +
        `stroke-width="34" mask="url(#ring-damage)"/>` +
        `</svg>`,
    ),
  )
    .extractChannel('alpha')
    .raw()
    .toBuffer();
  const ringArtwork = await sharp(
    Buffer.from(
      `<svg width="320" height="320" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="320" height="320" fill="#eeeeed"/>` +
        `<circle cx="160" cy="160" r="90" fill="none" stroke="#9b6a24" ` +
        `stroke-width="34"/>` +
        `</svg>`,
    ),
  )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ringMatte = await sharp(ringArtwork.data, {
    raw: {
      width: ringArtwork.info.width,
      height: ringArtwork.info.height,
      channels: ringArtwork.info.channels,
    },
  })
    .joinChannel(ringAlpha, {
      raw: { width: 320, height: 320, channels: 1 },
    })
    .png()
    .toBuffer();
  const fakeRingRemover = {
    available: async () => true,
    remove: async () => ({
      buffer: ringMatte,
      modelId: 'fixture.onnx',
      inferenceMs: 1,
      maskRange: { minimum: 0, maximum: 1 },
    }),
  };
  const ring = await isolateGeneratedBackground(striped, {
    finalSize: 256,
    maxForegroundComponents: 1,
    backgroundRemover: fakeRingRemover,
    subjectShape: 'finger ring',
  });
  const ringPixels = await sharp(ring.buffer).ensureAlpha().raw().toBuffer();
  assert.equal(ringPixels[(128 * 256 + 128) * 4 + 3], 0);
  assert.ok(ringPixels[(35 * 256 + 128) * 4 + 3] > 200);
  assert.match(ring.matteRepair, /finger opening preserved/);

  const orbMatte = await sharp(
    Buffer.from(
      `<svg width="320" height="320" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><mask id="damage"><rect width="320" height="320" fill="#fff"/>` +
        `<path d="M70 70 H165 V165 H70 Z" fill="#000"/></mask></defs>` +
        `<circle cx="160" cy="160" r="104" fill="#405a72" mask="url(#damage)"/>` +
        `</svg>`,
    ),
  )
    .png()
    .toBuffer();
  const orb = await isolateGeneratedBackground(striped, {
    finalSize: 256,
    maxForegroundComponents: 1,
    backgroundRemover: {
      available: async () => true,
      remove: async () => ({
        buffer: orbMatte,
        modelId: 'fixture.onnx',
        inferenceMs: 1,
        maskRange: { minimum: 0, maximum: 1 },
      }),
    },
    subjectShape: 'magical orb',
  });
  const orbPixels = await sharp(orb.buffer).ensureAlpha().raw().toBuffer();
  assert.ok(orbPixels[(80 * 256 + 80) * 4 + 3] > 200);
  assert.match(orb.matteRepair, /elliptical orb contour/);
});

test('an extremely uniform neutral studio field is accepted and removed', async () => {
  const source = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 245, g: 245, b: 244 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 88,
            height: 140,
            channels: 3,
            background: { r: 80, g: 35, b: 18 },
          },
        })
          .png()
          .toBuffer(),
        left: 84,
        top: 58,
      },
    ])
    .png()
    .toBuffer();
  const isolated = await isolateChromaBackground(source, {
    finalSize: 256,
    requireChromaField: true,
  });
  const data = await sharp(isolated.buffer).ensureAlpha().raw().toBuffer();
  assert.equal(data[3], 0);
});

test('a muted colored field is not mistaken for a chroma key', async () => {
  const source = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 135, g: 78, b: 38 },
    },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    isolateChromaBackground(source, {
      finalSize: 256,
      requireChromaField: true,
    }),
    /clean removable field/,
  );
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
    parameters: { recipeVersion: TEXT_GENERATION_RECIPE, finalSize: 256 },
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

test('sd.cpp client requires explicit opt-in for a remote worker', () => {
  assert.throws(
    () =>
      new SdCppImg2ImgClient({
        baseUrl: 'http://192.168.2.139:7860',
      }),
    /SDCPP_ALLOW_REMOTE=true/,
  );
  assert.doesNotThrow(
    () =>
      new SdCppImg2ImgClient({
        baseUrl: 'http://192.168.2.139:7860',
        allowRemote: true,
      }),
  );
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
    assert.equal(received.sampler_name, 'euler a');
    assert.equal('init_images' in received, false);
    assert.match(
      received.prompt,
      /original pre-industrial medieval high-fantasy face mask from Elrador/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sd.cpp transport rejects generated image geometry that differs from the request', async () => {
  const wrongSize = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 0, g: 255, b: 0 },
    },
  })
    .png()
    .toBuffer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ images: [wrongSize.toString('base64')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  try {
    const client = new SdCppImg2ImgClient({
      baseUrl: 'http://127.0.0.1:17860',
      timeoutMs: 5_000,
    });
    await assert.rejects(
      client.textToImage({
        entry: { sourceHash: '12345678'.padEnd(64, '0') },
        context: { itemNames: ['Iron Mask'], dominantSlot: 'face' },
        generationSize: 384,
        steps: 12,
      }),
      /returned 256x256; expected 384x384/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POC contact sheets require current hash-matched outputs and include raw review art', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'requiem-icon-contact-'));
  const entry = {
    id: 'dragitem1-00',
    sheetId: 'dragitem1',
    atlasIconId: 500,
    sourceHash: 'c'.repeat(64),
    sourcePath: 'slices/dragitem1/dragitem1-00.png',
    blank: false,
  };
  const sourcePath = path.join(outputRoot, entry.sourcePath);
  const masterPath = path.join(outputRoot, 'masters', entry.sheetId, `${entry.id}.png`);
  const previewPath = path.join(
    outputRoot,
    'previews',
    entry.sheetId,
    `${entry.id}-attempt-1.png`,
  );
  await Promise.all([
    mkdir(path.dirname(sourcePath), { recursive: true }),
    mkdir(path.dirname(masterPath), { recursive: true }),
    mkdir(path.dirname(previewPath), { recursive: true }),
  ]);
  await sharp({
    create: {
      width: 40,
      height: 40,
      channels: 4,
      background: { r: 120, g: 65, b: 25, alpha: 255 },
    },
  })
    .png()
    .toFile(sourcePath);
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
            width: 100,
            height: 140,
            channels: 4,
            background: { r: 120, g: 65, b: 25, alpha: 255 },
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
  await writeFile(masterPath, masterBuffer);
  await sharp({
    create: {
      width: 384,
      height: 384,
      channels: 3,
      background: { r: 0, g: 255, b: 0 },
    },
  })
    .png()
    .toFile(previewPath);
  await writeMetadata({
    outputRoot,
    entry,
    operation: 'text-to-image',
    outputPath: masterPath,
    outputBuffer: masterBuffer,
    seed: 42,
    parameters: {
      recipeVersion: TEXT_GENERATION_RECIPE,
      finalSize: 256,
      generationAttempt: 1,
    },
    context: {
      sqliteIconId: 500,
      itemNames: ['Netted Choker'],
    },
  });
  const manifest = {
    sheets: [{ sheetId: entry.sheetId, entries: [entry] }],
  };
  const contactPath = await createPocContactSheet({
    outputRoot,
    manifest,
    limit: 1,
  });
  const contactMetadata = await sharp(contactPath).metadata();
  assert.equal(contactMetadata.width, 880);
  assert.equal(contactMetadata.height, 316);

  const metadataPath = path.join(outputRoot, 'metadata', entry.sheetId, `${entry.id}.json`);
  const stale = JSON.parse(await readFile(metadataPath, 'utf8'));
  stale.parameters.recipeVersion = 16;
  await writeFile(metadataPath, JSON.stringify(stale));
  await assert.rejects(
    createPocContactSheet({ outputRoot, manifest, limit: 1 }),
    /requires 1 current outputs, but found 0/,
  );
});
