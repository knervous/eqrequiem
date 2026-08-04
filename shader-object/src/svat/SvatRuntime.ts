/**
 * Browser-side `.svat` decompression.
 *
 * Strategy: use the platform `DecompressionStream` when it supports the chunk's
 * codec — zero dependencies, zero bundle weight, native speed. Fall back to a
 * caller-supplied decoder (a WASM Zstd build, say) when it does not. The bake
 * pipeline can emit a gzip-coded `.svat` alongside the Zstd one for runtimes
 * with neither.
 */

import type { SvatDecompress } from './SvatCodec';

type DecompressionFormat = 'gzip' | 'deflate' | 'deflate-raw' | 'zstd';

const supportCache = new Map<DecompressionFormat, boolean>();

/** Whether this runtime's DecompressionStream understands `format`. */
export function supportsDecompressionFormat(format: DecompressionFormat): boolean {
  const cached = supportCache.get(format);
  if (cached !== undefined) return cached;

  let supported = false;
  if (typeof DecompressionStream !== 'undefined') {
    try {
      // Constructing throws TypeError on unsupported formats.
      new DecompressionStream(format as never);
      supported = true;
    } catch {
      supported = false;
    }
  }
  supportCache.set(format, supported);
  return supported;
}

async function streamDecompress(bytes: Uint8Array, format: DecompressionFormat): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream(format as never)
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export type SvatRuntimeDecoderOptions = {
  /**
   * Used when the platform cannot decode Zstd natively. Receives the raw frame
   * and the expected decoded length.
   */
  zstdFallback?: SvatDecompress;
};

/**
 * Decompressor that dispatches on the frame magic, so one decoder handles a
 * container regardless of which codec the bake chose.
 */
export function createSvatDecompressor(options: SvatRuntimeDecoderOptions = {}): SvatDecompress {
  return async (bytes, decodedBytes) => {
    const isZstd =
      bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;

    if (isZstd) {
      if (supportsDecompressionFormat('zstd')) return streamDecompress(bytes, 'zstd');
      if (options.zstdFallback) return options.zstdFallback(bytes, decodedBytes);
      throw new Error(
        'This runtime cannot decode Zstd .svat chunks. Serve the gzip-coded artifact ' +
          'or pass a zstdFallback decoder.'
      );
    }

    if (isGzip) {
      if (supportsDecompressionFormat('gzip')) return streamDecompress(bytes, 'gzip');
      throw new Error('This runtime does not expose DecompressionStream("gzip")');
    }

    // Uncompressed chunk.
    return bytes;
  };
}
