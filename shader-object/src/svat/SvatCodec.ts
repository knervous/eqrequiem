/**
 * `.svat` encode/decode. Isomorphic: the actual compressor is injected, so this
 * module runs unchanged in Node (node:zlib zstd) and in the browser
 * (DecompressionStream / a WASM decoder).
 */

import type { DQClipInfo, PackedDQVAT } from '../extensions/VATBuilder/VATBuilder';
import {
  applyQuaternionContinuity,
  byteShuffle,
  byteUnshuffle,
  chunkBytes,
  deltaDecode,
  deltaEncode,
  gatherChunk,
  scatterChunk,
  type SvatPixels,
} from './SvatFilters';
import {
  decodeSvatDirectory,
  encodeSvatDirectory,
  svatChecksum,
  svatChunkComponentCount,
  svatComponentBytes,
  SvatCodec,
  SvatFilter,
  type SvatChunkEntry,
  type SvatClipEntry,
  type SvatLayout,
} from './SvatFormat';

export type SvatCompress = (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>;
export type SvatDecompress = (bytes: Uint8Array, decodedBytes: number) => Uint8Array | Promise<Uint8Array>;

export type SvatEncodeOptions = {
  /** Codec recorded in the chunk directory. Must match `compress`. */
  codec: SvatCodec;
  compress: SvatCompress;
  /** Defaults to `DeltaXorShuffle`. */
  filter?: SvatFilter;
  /**
   * Re-sign quaternion tracks against the previous frame before compressing.
   * Lossless with respect to the represented transform; defaults to `true`.
   * Set false to keep the artifact bit-identical to the baked atlas.
   */
  continuity?: boolean;
  /** Target decoded bytes per chunk. Defaults to 1 MiB; clamped to >= 1 frame. */
  targetChunkBytes?: number;
};

export type SvatDecodeOptions = {
  decompress: SvatDecompress;
  /** Verify the FNV-1a checksum of each decompressed chunk. Defaults to true. */
  verifyChecksums?: boolean;
};

const DEFAULT_TARGET_CHUNK_BYTES = 1024 * 1024;

function layoutFromPacked(packed: PackedDQVAT): SvatLayout {
  return {
    bones: packed.bones,
    framesTotal: packed.framesTotal,
    widthBones: packed.dqWidthBones,
    tilesX: packed.dqTilesX,
    framesX: packed.dqFramesX ?? 1,
    strideTexels: packed.dqStrideTexels,
    widthTexels: packed.widthTexels,
    heightTexels: packed.heightTexels,
    hasScale: packed.dqHasScale,
    componentType: packed.componentType,
  };
}

/** Frames per chunk such that one decoded chunk stays near `targetChunkBytes`. */
function framesPerChunk(layout: SvatLayout, targetChunkBytes: number): number {
  const bytesPerFrame =
    layout.bones * layout.strideTexels * 4 * svatComponentBytes(layout.componentType);
  if (bytesPerFrame <= 0) return 1;
  return Math.max(1, Math.floor(targetChunkBytes / bytesPerFrame));
}

/**
 * Build a `.svat` container from a baked DQ atlas.
 *
 * Clips are chunked independently so an animation bank can stream, retry, or be
 * evicted a clip at a time.
 */
export async function encodeSvat(
  packed: PackedDQVAT,
  options: SvatEncodeOptions
): Promise<Uint8Array> {
  const layout = layoutFromPacked(packed);
  const filter = options.filter ?? SvatFilter.DeltaXorShuffle;
  const elementBytes = svatComponentBytes(layout.componentType);

  // Continuity rewrites source values, so work on a copy — callers keep using the
  // builder's atlas for rendering after a bake.
  let pixels: SvatPixels = packed.pixels;
  if (options.continuity ?? true) {
    pixels = packed.pixels.slice() as SvatPixels;
    applyQuaternionContinuity(pixels, layout, packed.clips);
  }

  const perChunk = framesPerChunk(layout, options.targetChunkBytes ?? DEFAULT_TARGET_CHUNK_BYTES);

  const clipEntries: SvatClipEntry[] = [];
  const chunkEntries: SvatChunkEntry[] = [];
  const payloads: Uint8Array[] = [];
  let compressedCursor = 0;
  let frameBase = 0;

  for (const clip of packed.clips) {
    const firstChunk = chunkEntries.length;

    for (let offset = 0; offset < clip.frames; offset += perChunk) {
      const frameCount = Math.min(perChunk, clip.frames - offset);
      const storage = gatherChunk(pixels, layout, frameBase + offset, frameCount);

      if (filter === SvatFilter.DeltaXorShuffle) {
        deltaEncode(storage, frameCount);
      }
      const raw = chunkBytes(storage);
      const filtered =
        filter === SvatFilter.DeltaXorShuffle ? byteShuffle(raw, elementBytes) : raw;

      const compressed = await options.compress(filtered);
      payloads.push(compressed);

      chunkEntries.push({
        clipIndex: clipEntries.length,
        firstFrame: offset,
        frameCount,
        filter,
        codec: options.codec,
        compressedOffset: compressedCursor,
        compressedBytes: compressed.byteLength,
        decodedBytes: filtered.byteLength,
        checksum: svatChecksum(filtered),
      });
      compressedCursor += compressed.byteLength;
    }

    clipEntries.push({
      name: clip.name,
      from: clip.from,
      to: clip.to,
      frames: clip.frames,
      fps: clip.fps,
      firstFrame: frameBase,
      firstChunk,
      chunkCount: chunkEntries.length - firstChunk,
    });
    frameBase += clip.frames;
  }

  const decodedByteLength =
    layout.widthTexels * layout.heightTexels * 4 * svatComponentBytes(layout.componentType);

  const header = encodeSvatDirectory({
    version: 1,
    flags: 0,
    layout,
    clips: clipEntries,
    chunks: chunkEntries,
    decodedByteLength,
    payloadOffset: 0, // recomputed inside encodeSvatDirectory
  });

  const total = header.byteLength + compressedCursor;
  const out = new Uint8Array(total);
  out.set(header, 0);
  let cursor = header.byteLength;
  for (const payload of payloads) {
    out.set(payload, cursor);
    cursor += payload.byteLength;
  }
  return out;
}

/** Reconstruct the DQ atlas from a `.svat` container. */
export async function decodeSvat(
  source: ArrayBuffer | Uint8Array,
  options: SvatDecodeOptions
): Promise<PackedDQVAT> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const directory = decodeSvatDirectory(bytes);
  const { layout } = directory;
  const elementBytes = svatComponentBytes(layout.componentType);
  const verify = options.verifyChecksums ?? true;

  const componentCount = layout.widthTexels * layout.heightTexels * 4;
  const pixels: SvatPixels =
    layout.componentType === 'float16'
      ? new Uint16Array(componentCount)
      : new Float32Array(componentCount);

  for (const chunk of directory.chunks) {
    const clip = directory.clips[chunk.clipIndex];
    if (!clip) throw new Error(`.svat chunk references missing clip ${chunk.clipIndex}`);

    const start = directory.payloadOffset + chunk.compressedOffset;
    const compressed = bytes.subarray(start, start + chunk.compressedBytes);
    const decompressed = await options.decompress(compressed, chunk.decodedBytes);

    if (decompressed.byteLength !== chunk.decodedBytes) {
      throw new Error(
        `.svat chunk decoded to ${decompressed.byteLength} bytes, expected ${chunk.decodedBytes}`
      );
    }
    if (verify) {
      const actual = svatChecksum(decompressed);
      if (actual !== chunk.checksum) {
        throw new Error(
          `.svat chunk checksum mismatch: expected ${chunk.checksum}, got ${actual}`
        );
      }
    }

    const planar =
      chunk.filter === SvatFilter.DeltaXorShuffle
        ? byteUnshuffle(decompressed, elementBytes)
        : decompressed;

    // Copy into an aligned buffer so the typed-array view is always valid.
    const aligned = new Uint8Array(planar.byteLength);
    aligned.set(planar);
    const storage: SvatPixels =
      layout.componentType === 'float16'
        ? new Uint16Array(aligned.buffer)
        : new Float32Array(aligned.buffer);

    const expected = svatChunkComponentCount(layout, chunk.frameCount);
    if (storage.length !== expected) {
      throw new Error(`.svat chunk holds ${storage.length} components, expected ${expected}`);
    }

    if (chunk.filter === SvatFilter.DeltaXorShuffle) {
      deltaDecode(storage, chunk.frameCount);
    }
    scatterChunk(pixels, layout, clip.firstFrame + chunk.firstFrame, chunk.frameCount, storage);
  }

  const clips: DQClipInfo[] = directory.clips.map(clip => ({
    name: clip.name,
    from: clip.from,
    to: clip.to,
    frames: clip.frames,
    fps: clip.fps,
  }));

  return {
    componentType: layout.componentType,
    widthTexels: layout.widthTexels,
    heightTexels: layout.heightTexels,
    framesTotal: layout.framesTotal,
    bones: layout.bones,
    dqWidthBones: layout.widthBones,
    dqTilesX: layout.tilesX,
    dqFramesX: layout.framesX,
    dqStrideTexels: layout.strideTexels,
    dqHasScale: layout.hasScale,
    clips,
    pixels,
  };
}
