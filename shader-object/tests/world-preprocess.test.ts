import {
  installNodeDracoDecoder,
  sanitizeWorldGlbForGeometry,
} from '../src/preprocess/worlds';

function jsonOnlyGlb(json: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(json));
  const paddedLength = (payload.byteLength + 3) & ~3;
  const bytes = Buffer.alloc(20 + paddedLength, 0x20);
  bytes.write('glTF', 0, 'ascii');
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.byteLength, 8);
  bytes.writeUInt32LE(paddedLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  payload.copy(bytes, 20);
  return bytes;
}

function readJson(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(Buffer.from(bytes.subarray(20, 20 + length)).toString('utf8').trim());
}

describe('world GLB geometry import', () => {
  it('initializes the bundled Draco decoder without a browser script loader', async () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const previousWorker = (globalThis as { Worker?: unknown }).Worker;
    try {
      delete (globalThis as { window?: unknown }).window;
      delete (globalThis as { Worker?: unknown }).Worker;
      await expect(installNodeDracoDecoder()).resolves.toBeUndefined();
    } finally {
      if (previousWindow !== undefined) {
        (globalThis as { window?: unknown }).window = previousWindow;
      }
      if (previousWorker !== undefined) {
        (globalThis as { Worker?: unknown }).Worker = previousWorker;
      }
    }
  });

  it('ignores malformed image records while preserving material slots and names', () => {
    const source = jsonOnlyGlb({
      asset: { version: '2.0' },
      materials: [
        { name: 'stone', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
        { name: 'water', normalTexture: { index: 1 } },
      ],
      textures: [{ source: 0 }, { source: 1 }],
      images: [
        { mimeType: 'image/png' },
        { uri: 'data:image/png;base64,broken' },
      ],
      samplers: [{}],
    });

    const sanitized = sanitizeWorldGlbForGeometry(source);
    const gltf = readJson(sanitized);

    expect(gltf.materials).toEqual([{ name: 'stone' }, { name: 'water' }]);
    expect(gltf.images).toBeUndefined();
    expect(gltf.textures).toBeUndefined();
    expect(gltf.samplers).toBeUndefined();
    expect(new DataView(sanitized.buffer, sanitized.byteOffset).getUint32(8, true))
      .toBe(sanitized.byteLength);
  });
});
