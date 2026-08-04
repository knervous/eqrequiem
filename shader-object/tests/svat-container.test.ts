import { describe, expect, it } from '@jest/globals';
import type { PackedDQVAT } from '../src/extensions/VATBuilder/VATBuilder';
import {
  byteShuffle,
  byteUnshuffle,
  decodeSvat,
  decodeSvatDirectory,
  deltaDecode,
  deltaEncode,
  encodeSvat,
  gatherChunk,
  halfToFloat,
  isSvatContainer,
  scatterChunk,
  SvatCodec,
  SvatFilter,
  svatComponentIndex,
  type SvatLayout,
} from '../src/svat';
import { nodeSvatDecompressor, nodeZstdCompress } from '../src/svat/SvatNode';

/**
 * Builds a synthetic DQ atlas using the exact addressing VATBuilder writes:
 *   px = (yTex * widthTexels + xBone * strideTexels) * 4
 *   yTex = frame * tilesX + floor(bone / widthBones)
 */
function makeAtlas(options: {
  bones: number;
  widthBones: number;
  strideTexels: number;
  clips: Array<{ name: string; frames: number; fps: number }>;
  componentType: 'float16' | 'float32';
  /** Complete frame palettes packed across one atlas row. NM_M ships 3. */
  framesX?: number;
}): PackedDQVAT {
  const { bones, widthBones, strideTexels, componentType } = options;
  const framesX = options.framesX ?? 1;
  const tilesX = Math.ceil(bones / widthBones);
  const framesTotal = options.clips.reduce((total, clip) => total + clip.frames, 0);
  const widthTexels = framesX * widthBones * strideTexels;
  const heightTexels = Math.ceil(framesTotal / framesX) * tilesX;
  const componentCount = widthTexels * heightTexels * 4;

  const pixels =
    componentType === 'float16' ? new Uint16Array(componentCount) : new Float32Array(componentCount);

  const layout: SvatLayout = {
    bones,
    framesTotal,
    widthBones,
    tilesX,
    framesX,
    strideTexels,
    widthTexels,
    heightTexels,
    hasScale: strideTexels >= 3,
    componentType,
  };

  // Smooth, rotating unit quaternions so continuity and delta coding have
  // something realistic to chew on, plus a deliberate hemisphere crossing.
  let frameBase = 0;
  for (const clip of options.clips) {
    for (let f = 0; f < clip.frames; f++) {
      const frame = frameBase + f;
      for (let bone = 0; bone < bones; bone++) {
        const angle = (f / Math.max(1, clip.frames)) * Math.PI * 2 + bone * 0.05;
        const half = angle * 0.5;
        const axis = 1 / Math.sqrt(3);
        const real = [
          Math.sin(half) * axis,
          Math.sin(half) * axis,
          Math.sin(half) * axis,
          Math.cos(half),
        ];
        const dual = [real[3] * 0.01 * bone, -real[0] * 0.02, real[1] * 0.015, -real[2] * 0.01];
        // VATBuilder forces a global w >= 0 hemisphere. That rule is exactly what
        // introduces the mid-clip sign discontinuity continuity coding removes, so
        // the fixture has to reproduce it for the continuity test to mean anything.
        if (real[3] < 0) {
          for (let c = 0; c < 4; c++) {
            real[c] = -real[c];
            dual[c] = -dual[c];
          }
        }

        const realBase = svatComponentIndex(layout, frame, bone, 0, 0);
        const dualBase = svatComponentIndex(layout, frame, bone, 1, 0);
        for (let c = 0; c < 4; c++) {
          writeComponent(pixels, realBase + c, real[c]);
          writeComponent(pixels, dualBase + c, dual[c]);
        }
        if (strideTexels >= 3) {
          writeComponent(pixels, svatComponentIndex(layout, frame, bone, 2, 0), 1);
        }
      }
    }
    frameBase += clip.frames;
  }

  return {
    componentType,
    widthTexels,
    heightTexels,
    framesTotal,
    bones,
    dqWidthBones: widthBones,
    dqTilesX: tilesX,
    dqFramesX: framesX,
    dqStrideTexels: strideTexels,
    dqHasScale: strideTexels >= 3,
    clips: options.clips.map((clip, index) => ({
      name: clip.name,
      from: index * 100,
      to: index * 100 + clip.frames,
      frames: clip.frames,
      fps: clip.fps,
    })),
    pixels,
  };
}

function writeComponent(pixels: Uint16Array | Float32Array, index: number, value: number) {
  if (pixels instanceof Float32Array) {
    pixels[index] = value;
    return;
  }
  pixels[index] = floatToHalf(value);
}

/** Minimal binary32 → binary16, matching BABYLON.ToHalfFloat's round-to-nearest. */
function floatToHalf(value: number): number {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >>> 16) & 0x8000;
  let exponent = (bits >>> 23) & 0xff;
  let mantissa = bits & 0x7fffff;
  if (exponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  let unbiased = exponent - 127 + 15;
  if (unbiased >= 0x1f) return sign | 0x7c00;
  if (unbiased <= 0) {
    if (unbiased < -10) return sign;
    mantissa |= 0x800000;
    const shift = 14 - unbiased;
    const half = (mantissa + (1 << (shift - 1))) >>> shift;
    return sign | half;
  }
  const rounded = mantissa + 0x1000;
  if (rounded & 0x800000) {
    unbiased += 1;
    mantissa = 0;
    if (unbiased >= 0x1f) return sign | 0x7c00;
  } else {
    mantissa = rounded;
  }
  return sign | (unbiased << 10) | (mantissa >>> 13);
}

function readValue(pixels: Uint16Array | Float32Array, index: number): number {
  return pixels instanceof Uint16Array ? halfToFloat(pixels[index]) : pixels[index];
}

describe('svat filters', () => {
  it('gather and scatter are exact inverses', () => {
    const packed = makeAtlas({
      bones: 7,
      widthBones: 4,
      strideTexels: 2,
      componentType: 'float16',
      clips: [{ name: 'idle', frames: 5, fps: 30 }],
    });
    const layout: SvatLayout = {
      bones: 7,
      framesTotal: 5,
      widthBones: 4,
      tilesX: 2,
      framesX: 1,
      strideTexels: 2,
      widthTexels: 8,
      heightTexels: 10,
      hasScale: false,
      componentType: 'float16',
    };

    const storage = gatherChunk(packed.pixels, layout, 0, 5);
    const restored = new Uint16Array(packed.pixels.length);
    scatterChunk(restored, layout, 0, 5, storage);

    // Every addressable component must survive; padding texels stay zero.
    for (let frame = 0; frame < 5; frame++) {
      for (let bone = 0; bone < 7; bone++) {
        for (let slot = 0; slot < 2; slot++) {
          for (let comp = 0; comp < 4; comp++) {
            const index = svatComponentIndex(layout, frame, bone, slot, comp);
            expect(restored[index]).toBe(packed.pixels[index]);
          }
        }
      }
    }
  });

  it('xor delta round-trips exactly for both component widths', () => {
    const half = new Uint16Array([1, 2, 3, 4, 9, 9, 9, 9]);
    const halfCopy = half.slice();
    deltaEncode(half, 4);
    expect(Array.from(half)).not.toEqual(Array.from(halfCopy));
    deltaDecode(half, 4);
    expect(Array.from(half)).toEqual(Array.from(halfCopy));

    const full = new Float32Array([0.5, 0.5, 0.25, -1, 3, 3, 3, 3]);
    const fullCopy = full.slice();
    deltaEncode(full, 4);
    deltaDecode(full, 4);
    expect(Array.from(full)).toEqual(Array.from(fullCopy));
  });

  it('byte shuffle round-trips and groups like-significance bytes', () => {
    const bytes = new Uint8Array([1, 200, 2, 201, 3, 202, 4, 203]);
    const shuffled = byteShuffle(bytes, 2);
    expect(Array.from(shuffled)).toEqual([1, 2, 3, 4, 200, 201, 202, 203]);
    expect(Array.from(byteUnshuffle(shuffled, 2))).toEqual(Array.from(bytes));
  });
});

describe('svat container', () => {
  const compress = nodeZstdCompress(12);
  const decompress = nodeSvatDecompressor();

  it('round-trips a float16 atlas bit-exactly with continuity disabled', async () => {
    const packed = makeAtlas({
      bones: 34,
      widthBones: 34,
      strideTexels: 2,
      componentType: 'float16',
      clips: [
        { name: 'idle', frames: 24, fps: 30 },
        { name: 'walk', frames: 31, fps: 30 },
      ],
    });

    const container = await encodeSvat(packed, {
      codec: SvatCodec.Zstd,
      compress,
      continuity: false,
    });
    expect(isSvatContainer(container)).toBe(true);

    const decoded = await decodeSvat(container, { decompress });
    expect(decoded.pixels).toEqual(packed.pixels);
    expect(decoded.componentType).toBe('float16');
    expect(decoded.bones).toBe(34);
    expect(decoded.framesTotal).toBe(55);
    expect(decoded.clips.map(clip => clip.name)).toEqual(['idle', 'walk']);
    expect(decoded.clips.map(clip => clip.frames)).toEqual([24, 31]);
  });

  it('round-trips a float32 atlas with a scale texel and multiple tiles', async () => {
    const packed = makeAtlas({
      bones: 90,
      widthBones: 32,
      strideTexels: 3,
      componentType: 'float32',
      clips: [
        { name: 'idle', frames: 12, fps: 24 },
        { name: 'attack', frames: 9, fps: 24 },
        { name: 'cast', frames: 17, fps: 24 },
      ],
    });

    const container = await encodeSvat(packed, {
      codec: SvatCodec.Zstd,
      compress,
      continuity: false,
    });
    const decoded = await decodeSvat(container, { decompress });
    expect(decoded.pixels).toEqual(packed.pixels);
    expect(decoded.dqTilesX).toBe(3);
    expect(decoded.dqHasScale).toBe(true);
    expect(decoded.dqStrideTexels).toBe(3);
  });

  it('continuity preserves the represented rotation up to a whole-DQ sign flip', async () => {
    const packed = makeAtlas({
      bones: 20,
      widthBones: 20,
      strideTexels: 2,
      componentType: 'float32',
      clips: [{ name: 'spin', frames: 48, fps: 30 }],
    });

    const container = await encodeSvat(packed, {
      codec: SvatCodec.Zstd,
      compress,
      continuity: true,
    });
    const decoded = await decodeSvat(container, { decompress });
    const layout = {
      bones: 20,
      framesTotal: 48,
      widthBones: 20,
      tilesX: 1,
      framesX: 1,
      strideTexels: 2,
      widthTexels: 40,
      heightTexels: 48,
      hasScale: false,
      componentType: 'float32' as const,
    };

    let flipped = 0;
    for (let frame = 0; frame < 48; frame++) {
      for (let bone = 0; bone < 20; bone++) {
        const realBase = svatComponentIndex(layout, frame, bone, 0, 0);
        const dualBase = svatComponentIndex(layout, frame, bone, 1, 0);
        // Sign is decided per (frame, bone) across the whole DQ.
        const sign = Math.sign(readValue(decoded.pixels, realBase + 3) || 1) *
          Math.sign(readValue(packed.pixels, realBase + 3) || 1);
        if (sign < 0) flipped++;
        for (let comp = 0; comp < 4; comp++) {
          expect(readValue(decoded.pixels, realBase + comp)).toBeCloseTo(
            sign * readValue(packed.pixels, realBase + comp),
            6
          );
          expect(readValue(decoded.pixels, dualBase + comp)).toBeCloseTo(
            sign * readValue(packed.pixels, dualBase + comp),
            6
          );
        }
      }
    }
    // The synthetic track sweeps a full turn, so some samples must have flipped.
    expect(flipped).toBeGreaterThan(0);
  });

  it('splits clips into independently addressable chunks', async () => {
    const packed = makeAtlas({
      bones: 64,
      widthBones: 64,
      strideTexels: 2,
      componentType: 'float16',
      clips: [
        { name: 'idle', frames: 40, fps: 30 },
        { name: 'run', frames: 40, fps: 30 },
      ],
    });

    const container = await encodeSvat(packed, {
      codec: SvatCodec.Zstd,
      compress,
      continuity: false,
      targetChunkBytes: 8 * 1024,
    });
    const directory = decodeSvatDirectory(container);

    expect(directory.clips).toHaveLength(2);
    expect(directory.chunks.length).toBeGreaterThan(2);
    // Chunk directory must partition each clip exactly once, in order.
    for (const [index, clip] of directory.clips.entries()) {
      const owned = directory.chunks.filter(chunk => chunk.clipIndex === index);
      expect(owned).toHaveLength(clip.chunkCount);
      expect(owned.reduce((total, chunk) => total + chunk.frameCount, 0)).toBe(clip.frames);
      expect(owned[0].firstFrame).toBe(0);
    }
    expect(directory.clips[1].firstFrame).toBe(40);

    const decoded = await decodeSvat(container, { decompress });
    expect(decoded.pixels).toEqual(packed.pixels);
  });

  it('rejects a corrupted chunk via its checksum', async () => {
    const packed = makeAtlas({
      bones: 16,
      widthBones: 16,
      strideTexels: 2,
      componentType: 'float16',
      clips: [{ name: 'idle', frames: 8, fps: 30 }],
    });

    const container = await encodeSvat(packed, {
      codec: SvatCodec.Zstd,
      compress,
      continuity: false,
      filter: SvatFilter.None,
    });
    const directory = decodeSvatDirectory(container);
    // Flip a byte inside the first compressed chunk's decoded stream by
    // corrupting the recorded checksum instead of the zstd frame, which would
    // otherwise fail to decompress at all.
    const corrupted = container.slice();
    const chunkDirOffset = 64 + directory.clips.length * 40;
    new DataView(corrupted.buffer).setUint32(chunkDirOffset + 28, 0xdeadbeef, true);

    await expect(decodeSvat(corrupted, { decompress })).rejects.toThrow(/checksum mismatch/);
  });

  it('handles framesX > 1, the packing the supermesh bake actually ships', async () => {
    // NM_M.full.vat16 is 107 bones / 17381 frames / framesX 3, so several complete
    // frame palettes share one atlas row. Addressing has to match the runtime
    // shader's `frameColumn = frame % uDQFramesX` path, not the framesX=1 shortcut.
    const packed = makeAtlas({
      bones: 107,
      widthBones: 107,
      strideTexels: 2,
      framesX: 3,
      componentType: 'float16',
      clips: [
        { name: 'damage', frames: 20, fps: 30 },
        { name: 'die', frames: 46, fps: 30 },
        { name: 'idle', frames: 31, fps: 30 },
      ],
    });

    expect(packed.widthTexels).toBe(3 * 107 * 2);
    expect(packed.heightTexels).toBe(Math.ceil(97 / 3));

    const layout: SvatLayout = {
      bones: 107,
      framesTotal: 97,
      widthBones: 107,
      tilesX: 1,
      framesX: 3,
      strideTexels: 2,
      widthTexels: packed.widthTexels,
      heightTexels: packed.heightTexels,
      hasScale: false,
      componentType: 'float16',
    };

    // No two (frame, bone) pairs may alias onto the same texel.
    const seen = new Set<number>();
    for (let frame = 0; frame < 97; frame++) {
      for (let bone = 0; bone < 107; bone++) {
        const index = svatComponentIndex(layout, frame, bone, 0, 0);
        expect(seen.has(index)).toBe(false);
        seen.add(index);
      }
    }

    const container = await encodeSvat(packed, {
      codec: SvatCodec.Zstd,
      compress,
      continuity: false,
    });
    const decoded = await decodeSvat(container, { decompress });
    expect(decoded.pixels).toEqual(packed.pixels);
    expect(decoded.dqFramesX).toBe(3);
  });

  it('refuses a container with the wrong magic', () => {
    const bogus = new Uint8Array(64);
    expect(isSvatContainer(bogus)).toBe(false);
    expect(() => decodeSvatDirectory(bogus)).toThrow(/magic mismatch/);
  });
});
