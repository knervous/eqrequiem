/**
 * Reversible preprocessing for `.svat` chunk payloads.
 *
 * The GPU wants random access by (frame, bone, component); a general-purpose
 * compressor wants temporally adjacent values to sit next to each other. These
 * helpers convert between the two and apply the numeric filters described in
 * `docs/shado/shado-vat-storage-and-webgpu-fetch-optimization.md` §9.
 *
 * Storage order within a chunk is bone-major, component-separated, frame-minor:
 *
 *   for bone, for texel slot, for component (x,y,z,w), for frame → value
 *
 * so each (bone, slot, component) forms one contiguous temporal stream that XOR
 * delta and byte shuffle can exploit.
 */

import type { DQClipInfo } from '../extensions/VATBuilder/VATBuilder';
import { svatChunkComponentCount, svatComponentIndex, type SvatLayout } from './SvatFormat';

export type SvatPixels = Uint16Array | Float32Array;

/** Decode an IEEE-754 binary16 bit pattern to a JS number. */
export function halfToFloat(bits: number): number {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x03ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * (mantissa + 1024) * 2 ** (exponent - 25);
}

/** Flip the sign of one stored component in place, for either component type. */
function negateComponent(pixels: SvatPixels, index: number): void {
  if (pixels instanceof Uint16Array) {
    // Half-float sign bit. XOR leaves the magnitude bits untouched, so this is exact.
    pixels[index] = pixels[index] ^ 0x8000;
  } else {
    pixels[index] = -pixels[index];
  }
}

function readComponent(pixels: SvatPixels, index: number): number {
  return pixels instanceof Uint16Array ? halfToFloat(pixels[index]) : pixels[index];
}

/**
 * Previous-frame quaternion continuity, applied in place across the atlas.
 *
 * `q` and `-q` describe the same orientation but have very different bit patterns,
 * so a hemisphere flip mid-clip destroys temporal correlation. The bake currently
 * forces a global `w >= 0` hemisphere, which still flips whenever `w` crosses zero.
 * Choosing the sign relative to the *preceding sample* keeps each bone's track
 * smooth in bit space.
 *
 * Real and dual parts are negated together, which is an exact ±1 multiply and
 * leaves the represented rigid transform identical. The runtime shader re-aligns
 * hemispheres anyway (`dqHemisphereAlign(r1a, d1a, r0)` before the frame lerp),
 * so this is invisible to rendering.
 *
 * The scale texel (slot 2) is a magnitude, not part of the DQ, and is left alone.
 * Prediction resets at every clip boundary so clips stay independent.
 */
export function applyQuaternionContinuity(
  pixels: SvatPixels,
  layout: SvatLayout,
  clips: readonly DQClipInfo[]
): void {
  let frameBase = 0;
  for (const clip of clips) {
    for (let bone = 0; bone < layout.bones; bone++) {
      let hasPrevious = false;
      let px = 0;
      let py = 0;
      let pz = 0;
      let pw = 0;
      for (let f = 0; f < clip.frames; f++) {
        const frame = frameBase + f;
        const realBase = svatComponentIndex(layout, frame, bone, 0, 0);
        const x = readComponent(pixels, realBase + 0);
        const y = readComponent(pixels, realBase + 1);
        const z = readComponent(pixels, realBase + 2);
        const w = readComponent(pixels, realBase + 3);

        let flip = false;
        if (hasPrevious) {
          flip = px * x + py * y + pz * z + pw * w < 0;
        }

        if (flip) {
          const dualBase = svatComponentIndex(layout, frame, bone, 1, 0);
          for (let c = 0; c < 4; c++) {
            negateComponent(pixels, realBase + c);
            negateComponent(pixels, dualBase + c);
          }
          px = -x;
          py = -y;
          pz = -z;
          pw = -w;
        } else {
          px = x;
          py = y;
          pz = z;
          pw = w;
        }
        hasPrevious = true;
      }
    }
    frameBase += clip.frames;
  }
}

/** Allocate a storage-order buffer matching the pixel component type. */
function allocateLike(pixels: SvatPixels, length: number): SvatPixels {
  return pixels instanceof Uint16Array ? new Uint16Array(length) : new Float32Array(length);
}

/**
 * Atlas order → storage order for one chunk of frames.
 * `frameStart` is a global atlas frame index.
 */
export function gatherChunk(
  pixels: SvatPixels,
  layout: SvatLayout,
  frameStart: number,
  frameCount: number
): SvatPixels {
  const out = allocateLike(pixels, svatChunkComponentCount(layout, frameCount));
  let cursor = 0;
  for (let bone = 0; bone < layout.bones; bone++) {
    for (let slot = 0; slot < layout.strideTexels; slot++) {
      for (let comp = 0; comp < 4; comp++) {
        for (let f = 0; f < frameCount; f++) {
          out[cursor++] = pixels[svatComponentIndex(layout, frameStart + f, bone, slot, comp)];
        }
      }
    }
  }
  return out;
}

/** Storage order → atlas order. Exact inverse of {@link gatherChunk}. */
export function scatterChunk(
  target: SvatPixels,
  layout: SvatLayout,
  frameStart: number,
  frameCount: number,
  chunk: SvatPixels
): void {
  let cursor = 0;
  for (let bone = 0; bone < layout.bones; bone++) {
    for (let slot = 0; slot < layout.strideTexels; slot++) {
      for (let comp = 0; comp < 4; comp++) {
        for (let f = 0; f < frameCount; f++) {
          target[svatComponentIndex(layout, frameStart + f, bone, slot, comp)] = chunk[cursor++];
        }
      }
    }
  }
}

/** Integer view over a storage-order chunk, for bitwise filtering. */
function wordView(chunk: SvatPixels): Uint16Array | Uint32Array {
  return chunk instanceof Uint16Array
    ? chunk
    : new Uint32Array(chunk.buffer, chunk.byteOffset, chunk.length);
}

/**
 * XOR delta along each temporal stream, in place.
 *
 * Adjacent samples of a smooth track usually share sign, exponent and the high
 * mantissa bits, so the XOR residual is mostly zero bits. Each run of
 * `runLength` values is independent, so prediction resets at every
 * (bone, slot, component) boundary as well as at chunk boundaries.
 */
export function deltaEncode(chunk: SvatPixels, runLength: number): void {
  if (runLength <= 1) return;
  const words = wordView(chunk);
  for (let offset = 0; offset < words.length; offset += runLength) {
    let previous = 0;
    for (let i = 0; i < runLength; i++) {
      const current = words[offset + i];
      words[offset + i] = (current ^ previous) >>> 0;
      previous = current;
    }
  }
}

/** Exact inverse of {@link deltaEncode}. */
export function deltaDecode(chunk: SvatPixels, runLength: number): void {
  if (runLength <= 1) return;
  const words = wordView(chunk);
  for (let offset = 0; offset < words.length; offset += runLength) {
    let previous = 0;
    for (let i = 0; i < runLength; i++) {
      const current = (words[offset + i] ^ previous) >>> 0;
      words[offset + i] = current;
      previous = current;
    }
  }
}

/**
 * Byte shuffle: regroup element bytes into planes so that like-significance bytes
 * become adjacent (`lo0 hi0 lo1 hi1` → `lo0 lo1 hi0 hi1`). This is the same
 * transform numerical compressors such as Blosc apply before a general-purpose
 * codec, and it materially improves the ratio on float arrays.
 */
export function byteShuffle(bytes: Uint8Array, elementBytes: number): Uint8Array {
  if (elementBytes <= 1) return bytes;
  const count = (bytes.length / elementBytes) | 0;
  const out = new Uint8Array(bytes.length);
  for (let plane = 0; plane < elementBytes; plane++) {
    const planeBase = plane * count;
    for (let i = 0; i < count; i++) {
      out[planeBase + i] = bytes[i * elementBytes + plane];
    }
  }
  return out;
}

/** Exact inverse of {@link byteShuffle}. */
export function byteUnshuffle(bytes: Uint8Array, elementBytes: number): Uint8Array {
  if (elementBytes <= 1) return bytes;
  const count = (bytes.length / elementBytes) | 0;
  const out = new Uint8Array(bytes.length);
  for (let plane = 0; plane < elementBytes; plane++) {
    const planeBase = plane * count;
    for (let i = 0; i < count; i++) {
      out[i * elementBytes + plane] = bytes[planeBase + i];
    }
  }
  return out;
}

/** Raw byte view over a storage-order chunk. */
export function chunkBytes(chunk: SvatPixels): Uint8Array {
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}
