/**
 * Node-side `.svat` compression, used by the offline bake pipeline.
 *
 * Zstandard is exposed by `node:zlib` from Node 22. It is the primary codec for
 * custom Shado assets: comparable ratio to Brotli at a fraction of the decode
 * cost, with a wide level range and dictionary support for small related clips.
 * Gzip stays available as a compatibility artifact for runtimes without a Zstd
 * decoder.
 */

import { SvatCodec } from './SvatFormat';
import type { SvatCompress, SvatDecompress } from './SvatCodec';

/**
 * Suggested levels. Benchmark before assuming higher is better — ultra levels
 * cost significant build memory for often marginal gains.
 */
export const SVAT_ZSTD_LEVELS = {
  development: 7,
  production: 12,
  release: 15,
} as const;

async function zlib() {
  return import('node:zlib');
}

/** Zstd compressor at `level`. Pair with `codec: SvatCodec.Zstd`. */
export function nodeZstdCompress(level: number = SVAT_ZSTD_LEVELS.production): SvatCompress {
  return async (bytes: Uint8Array) => {
    const { zstdCompress, constants } = await zlib();
    return new Promise<Uint8Array>((resolve, reject) => {
      zstdCompress(
        bytes,
        { params: { [constants.ZSTD_c_compressionLevel]: level } },
        (error, result) => (error ? reject(error) : resolve(new Uint8Array(result)))
      );
    });
  };
}

/** Zstd decompressor, for round-trip verification during the bake. */
export function nodeZstdDecompress(): SvatDecompress {
  return async (bytes: Uint8Array) => {
    const { zstdDecompress } = await zlib();
    return new Promise<Uint8Array>((resolve, reject) => {
      zstdDecompress(bytes, (error, result) =>
        error ? reject(error) : resolve(new Uint8Array(result))
      );
    });
  };
}

/** Gzip compressor for the compatibility artifact. Pair with `codec: SvatCodec.Gzip`. */
export function nodeGzipCompress(level = 9): SvatCompress {
  return async (bytes: Uint8Array) => {
    const { gzip } = await zlib();
    return new Promise<Uint8Array>((resolve, reject) => {
      gzip(bytes, { level }, (error, result) =>
        error ? reject(error) : resolve(new Uint8Array(result))
      );
    });
  };
}

export function nodeGunzipDecompress(): SvatDecompress {
  return async (bytes: Uint8Array) => {
    const { gunzip } = await zlib();
    return new Promise<Uint8Array>((resolve, reject) => {
      gunzip(bytes, (error, result) =>
        error ? reject(error) : resolve(new Uint8Array(result))
      );
    });
  };
}

/** Compressor/codec pair for a named preset. */
export function nodeSvatCompressor(
  codec: SvatCodec,
  level?: number
): { codec: SvatCodec; compress: SvatCompress } {
  if (codec === SvatCodec.Gzip) return { codec, compress: nodeGzipCompress(level ?? 9) };
  if (codec === SvatCodec.Zstd) {
    return { codec, compress: nodeZstdCompress(level ?? SVAT_ZSTD_LEVELS.production) };
  }
  return { codec: SvatCodec.None, compress: bytes => bytes };
}

/** Decompressor matching a chunk's recorded codec. */
export function nodeSvatDecompressor(): SvatDecompress {
  const zstd = nodeZstdDecompress();
  const gunzip = nodeGunzipDecompress();
  return async (bytes, decodedBytes) => {
    // Zstd frames start with magic 0xFD2FB528; gzip with 0x1F8B.
    if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
      return zstd(bytes, decodedBytes);
    }
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzip(bytes, decodedBytes);
    return bytes;
  };
}
