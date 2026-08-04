/**
 * `.svat` — Shado Vertex Animation Texture binary container.
 *
 * Replaces the JSON + Base64 + gzip payload produced by `VATBuilder.toSerialized()`.
 * The container stores the same DQ atlas pixels, but as opaque binary split into
 * independently decodable per-clip chunks so that animation banks can stream.
 *
 * All multi-byte header/directory fields are little-endian. Chunk payloads are raw
 * typed-array bytes and therefore assume a little-endian host, which matches the
 * `byteOrder: 'little-endian'` contract the JSON format already declared and every
 * WebGL/WebGPU target Shado runs on.
 *
 * File layout:
 *
 *   header       (64 bytes)
 *   clip dir     (clipCount  * 40 bytes)
 *   chunk dir    (chunkCount * 32 bytes)
 *   name blob    (UTF-8 clip names, referenced by offset/length)
 *   payload      (concatenated compressed chunks)
 */

/** "SVAT" read as a little-endian u32. */
export const SVAT_MAGIC = 0x54415653;
export const SVAT_VERSION = 1;

export const SVAT_HEADER_BYTES = 64;
export const SVAT_CLIP_ENTRY_BYTES = 40;
export const SVAT_CHUNK_ENTRY_BYTES = 32;

/** Reversible byte-level preprocessing applied before the general-purpose codec. */
export enum SvatFilter {
  /** Storage-order transpose only. */
  None = 0,
  /** Storage-order transpose, then per-stream XOR delta, then byte shuffle. */
  DeltaXorShuffle = 1,
}

/** General-purpose codec applied to the filtered chunk bytes. */
export enum SvatCodec {
  None = 0,
  Zstd = 1,
  Gzip = 2,
}

export type SvatComponentType = 'float32' | 'float16';

/** Geometry of the DQ atlas, sufficient to address any component. */
export type SvatLayout = {
  bones: number;
  framesTotal: number;
  /** Bones per atlas row (not texels). */
  widthBones: number;
  /** Horizontal tiles per frame: ceil(bones / widthBones). */
  tilesX: number;
  /** Complete frame palettes packed across the atlas. Always 1 today. */
  framesX: number;
  /** Texels per bone: 2 (real, dual) or 3 (real, dual, scale). */
  strideTexels: number;
  widthTexels: number;
  heightTexels: number;
  hasScale: boolean;
  componentType: SvatComponentType;
};

export type SvatClipEntry = {
  name: string;
  from: number;
  to: number;
  frames: number;
  fps: number;
  /** Global frame index of this clip's first frame within the atlas. */
  firstFrame: number;
  firstChunk: number;
  chunkCount: number;
};

export type SvatChunkEntry = {
  clipIndex: number;
  /** First frame of this chunk, relative to the clip. */
  firstFrame: number;
  frameCount: number;
  filter: SvatFilter;
  codec: SvatCodec;
  compressedOffset: number;
  compressedBytes: number;
  decodedBytes: number;
  checksum: number;
};

export type SvatDirectory = {
  version: number;
  flags: number;
  layout: SvatLayout;
  clips: SvatClipEntry[];
  chunks: SvatChunkEntry[];
  /** Byte length of the fully reconstructed atlas pixel buffer. */
  decodedByteLength: number;
  payloadOffset: number;
};

/** Bytes per atlas component for a given component type. */
export function svatComponentBytes(componentType: SvatComponentType): number {
  return componentType === 'float16' ? 2 : 4;
}

/**
 * Component index into the flat atlas pixel array.
 *
 * Mirrors the runtime fetch in `ShadoInstanceContainer`'s `fetchBoneDQScale()`:
 *
 *   frameColumn  = frame % framesX
 *   frameGridRow = frame / framesX
 *   y            = frameGridRow * tilesX + floor(bone / widthBones)
 *   baseX        = frameColumn * widthBones * strideTexels
 *                + (bone % widthBones) * strideTexels
 *
 * `framesX > 1` packs several complete frame palettes across a single atlas row,
 * which the supermesh bake relies on (NM_M ships framesX = 3). With framesX = 1
 * this reduces to the simple `frame * tilesX` row addressing used by
 * `VATBuilder.buildFromScene()`.
 */
export function svatComponentIndex(
  layout: SvatLayout,
  frame: number,
  bone: number,
  slot: number,
  component: number
): number {
  const framesX = layout.framesX > 0 ? layout.framesX : 1;
  const frameColumn = frame % framesX;
  const frameGridRow = (frame / framesX) | 0;
  const tile = (bone / layout.widthBones) | 0;
  const xBone = bone % layout.widthBones;
  const y = frameGridRow * layout.tilesX + tile;
  const baseX = frameColumn * layout.widthBones * layout.strideTexels + xBone * layout.strideTexels;
  return (y * layout.widthTexels + baseX + slot) * 4 + component;
}

/** Number of atlas components covered by one chunk of `frameCount` frames. */
export function svatChunkComponentCount(layout: SvatLayout, frameCount: number): number {
  return layout.bones * layout.strideTexels * 4 * frameCount;
}

/** FNV-1a 32-bit. Cheap integrity check, not a cryptographic digest. */
export function svatChecksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    // hash *= 16777619, kept in u32 without Math.imul overflow surprises.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function encodingWord(filter: SvatFilter, codec: SvatCodec): number {
  return ((filter & 0xffff) | ((codec & 0xffff) << 16)) >>> 0;
}

function decodeEncodingWord(word: number): { filter: SvatFilter; codec: SvatCodec } {
  return {
    filter: (word & 0xffff) as SvatFilter,
    codec: ((word >>> 16) & 0xffff) as SvatCodec,
  };
}

/**
 * Serialize header + directories + name blob. Chunk payload bytes are appended by
 * the caller at `payloadOffset`, in chunk-directory order.
 */
export function encodeSvatDirectory(directory: SvatDirectory): Uint8Array {
  const { layout, clips, chunks } = directory;

  const encoder = new TextEncoder();
  const nameBytes = clips.map(clip => encoder.encode(clip.name));
  const nameBlobBytes = nameBytes.reduce((total, bytes) => total + bytes.length, 0);

  const clipDirOffset = SVAT_HEADER_BYTES;
  const chunkDirOffset = clipDirOffset + clips.length * SVAT_CLIP_ENTRY_BYTES;
  const nameBlobOffset = chunkDirOffset + chunks.length * SVAT_CHUNK_ENTRY_BYTES;
  const payloadOffset = nameBlobOffset + nameBlobBytes;

  const buffer = new ArrayBuffer(payloadOffset);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint32(0, SVAT_MAGIC, true);
  view.setUint16(4, SVAT_VERSION, true);
  view.setUint16(6, directory.flags >>> 0, true);
  view.setUint8(8, layout.componentType === 'float16' ? 1 : 0);
  view.setUint8(9, layout.strideTexels);
  view.setUint8(10, layout.hasScale ? 1 : 0);
  view.setUint8(11, 0);
  view.setUint32(12, layout.bones, true);
  view.setUint32(16, layout.framesTotal, true);
  view.setUint32(20, layout.widthBones, true);
  view.setUint32(24, layout.tilesX, true);
  view.setUint32(28, layout.framesX, true);
  view.setUint32(32, layout.widthTexels, true);
  view.setUint32(36, layout.heightTexels, true);
  view.setUint32(40, clips.length, true);
  view.setUint32(44, chunks.length, true);
  view.setUint32(48, directory.decodedByteLength, true);
  view.setUint32(52, nameBlobOffset, true);
  view.setUint32(56, nameBlobBytes, true);
  view.setUint32(60, payloadOffset, true);

  let nameCursor = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const entry = clipDirOffset + i * SVAT_CLIP_ENTRY_BYTES;
    view.setUint32(entry + 0, nameCursor, true);
    view.setUint32(entry + 4, nameBytes[i].length, true);
    view.setFloat32(entry + 8, clip.from, true);
    view.setFloat32(entry + 12, clip.to, true);
    view.setUint32(entry + 16, clip.frames, true);
    view.setFloat32(entry + 20, clip.fps, true);
    view.setUint32(entry + 24, clip.firstFrame, true);
    view.setUint32(entry + 28, clip.firstChunk, true);
    view.setUint32(entry + 32, clip.chunkCount, true);
    view.setUint32(entry + 36, 0, true);
    bytes.set(nameBytes[i], nameBlobOffset + nameCursor);
    nameCursor += nameBytes[i].length;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const entry = chunkDirOffset + i * SVAT_CHUNK_ENTRY_BYTES;
    view.setUint32(entry + 0, chunk.clipIndex, true);
    view.setUint32(entry + 4, chunk.firstFrame, true);
    view.setUint32(entry + 8, chunk.frameCount, true);
    view.setUint32(entry + 12, encodingWord(chunk.filter, chunk.codec), true);
    view.setUint32(entry + 16, chunk.compressedOffset, true);
    view.setUint32(entry + 20, chunk.compressedBytes, true);
    view.setUint32(entry + 24, chunk.decodedBytes, true);
    view.setUint32(entry + 28, chunk.checksum >>> 0, true);
  }

  return bytes;
}

/** True when `bytes` starts with the `.svat` magic. Used to sniff legacy artifacts. */
export function isSvatContainer(bytes: ArrayBuffer | Uint8Array): boolean {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength < 4) return false;
  return (
    view[0] === 0x53 && // 'S'
    view[1] === 0x56 && // 'V'
    view[2] === 0x41 && // 'A'
    view[3] === 0x54 //    'T'
  );
}

/** Parse header + directories. Does not touch the payload. */
export function decodeSvatDirectory(source: ArrayBuffer | Uint8Array): SvatDirectory {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength < SVAT_HEADER_BYTES) {
    throw new Error('.svat payload is smaller than its header');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = view.getUint32(0, true);
  if (magic !== SVAT_MAGIC) {
    throw new Error(`.svat magic mismatch: expected 0x${SVAT_MAGIC.toString(16)}, got 0x${magic.toString(16)}`);
  }
  const version = view.getUint16(4, true);
  if (version !== SVAT_VERSION) {
    throw new Error(`.svat version ${version} is not supported by this decoder (expected ${SVAT_VERSION})`);
  }

  const layout: SvatLayout = {
    componentType: view.getUint8(8) === 1 ? 'float16' : 'float32',
    strideTexels: view.getUint8(9),
    hasScale: view.getUint8(10) === 1,
    bones: view.getUint32(12, true),
    framesTotal: view.getUint32(16, true),
    widthBones: view.getUint32(20, true),
    tilesX: view.getUint32(24, true),
    framesX: view.getUint32(28, true),
    widthTexels: view.getUint32(32, true),
    heightTexels: view.getUint32(36, true),
  };

  const clipCount = view.getUint32(40, true);
  const chunkCount = view.getUint32(44, true);
  const decodedByteLength = view.getUint32(48, true);
  const nameBlobOffset = view.getUint32(52, true);
  const payloadOffset = view.getUint32(60, true);

  const clipDirOffset = SVAT_HEADER_BYTES;
  const chunkDirOffset = clipDirOffset + clipCount * SVAT_CLIP_ENTRY_BYTES;
  if (payloadOffset > bytes.byteLength) {
    throw new Error('.svat directory extends past the end of the payload');
  }

  const decoder = new TextDecoder();
  const clips: SvatClipEntry[] = [];
  for (let i = 0; i < clipCount; i++) {
    const entry = clipDirOffset + i * SVAT_CLIP_ENTRY_BYTES;
    const nameOffset = view.getUint32(entry + 0, true);
    const nameLength = view.getUint32(entry + 4, true);
    clips.push({
      name: decoder.decode(bytes.subarray(nameBlobOffset + nameOffset, nameBlobOffset + nameOffset + nameLength)),
      from: view.getFloat32(entry + 8, true),
      to: view.getFloat32(entry + 12, true),
      frames: view.getUint32(entry + 16, true),
      fps: view.getFloat32(entry + 20, true),
      firstFrame: view.getUint32(entry + 24, true),
      firstChunk: view.getUint32(entry + 28, true),
      chunkCount: view.getUint32(entry + 32, true),
    });
  }

  const chunks: SvatChunkEntry[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const entry = chunkDirOffset + i * SVAT_CHUNK_ENTRY_BYTES;
    const { filter, codec } = decodeEncodingWord(view.getUint32(entry + 12, true));
    chunks.push({
      clipIndex: view.getUint32(entry + 0, true),
      firstFrame: view.getUint32(entry + 4, true),
      frameCount: view.getUint32(entry + 8, true),
      filter,
      codec,
      compressedOffset: view.getUint32(entry + 16, true),
      compressedBytes: view.getUint32(entry + 20, true),
      decodedBytes: view.getUint32(entry + 24, true),
      checksum: view.getUint32(entry + 28, true),
    });
  }

  return { version, flags: view.getUint16(6, true), layout, clips, chunks, decodedByteLength, payloadOffset };
}
