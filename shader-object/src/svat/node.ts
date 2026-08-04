/**
 * Node-only entry point for `.svat` compression (`@knervous/shado/svat/node`).
 *
 * Kept separate from `@knervous/shado/svat` so browser bundles never pull in
 * `node:zlib`. The bake pipeline imports this; the runtime imports the other.
 */
export {
  nodeGunzipDecompress,
  nodeGzipCompress,
  nodeSvatCompressor,
  nodeSvatDecompressor,
  nodeZstdCompress,
  nodeZstdDecompress,
  SVAT_ZSTD_LEVELS,
} from './SvatNode';
