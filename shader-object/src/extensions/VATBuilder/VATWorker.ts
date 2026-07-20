import {
  VAT_PACK_KERNEL_RELAXED_SIMD_BASE64,
  VAT_PACK_KERNEL_SCALAR_BASE64,
  VAT_PACK_KERNEL_SIMD_BASE64,
} from './vat-pack-kernel.generated';

export type VATKernelFlavor = 'scalar' | 'simd' | 'relaxed-simd';

export type VATWorkerPackOptions = {
  matrices: Float32Array;
  frames: number;
  bones: number;
  dqWidthBones: number;
  tilesX: number;
  strideTexels: number;
  useHalf: boolean;
  worker?: boolean;
  /** Prefer a specific kernel for diagnostics. Auto-selects the fastest supported variant by default. */
  kernel?: 'auto' | VATKernelFlavor;
};

export type VATMatrixScaleInfo = {
  hasScale: boolean;
  hasAnisotropic: boolean;
};

/** Inspect Babylon matrices without allocating a Matrix/Vector per sample. */
export function detectVatMatrixScale(
  matrices: Float32Array,
  epsilon = 1e-4,
): VATMatrixScaleInfo {
  let hasScale = false;
  for (let base = 0; base + 15 < matrices.length; base += 16) {
    const sx = Math.hypot(matrices[base], matrices[base + 1], matrices[base + 2]);
    const sy = Math.hypot(matrices[base + 4], matrices[base + 5], matrices[base + 6]);
    const sz = Math.hypot(matrices[base + 8], matrices[base + 9], matrices[base + 10]);
    if (Math.abs(sx - 1) > epsilon || Math.abs(sy - 1) > epsilon || Math.abs(sz - 1) > epsilon) {
      hasScale = true;
    }
    // Exporters accumulate small axis drift on large uniform scales. Compare
    // anisotropy relatively: HVGirl's nominal 100x palette differs by at most
    // ~0.0068 between axes, which is noise rather than authored squash/stretch.
    const scaleReference = Math.max(1, sx, sy, sz);
    if (
      Math.max(Math.abs(sx - sy), Math.abs(sx - sz), Math.abs(sy - sz))
        > epsilon * scaleReference
    ) {
      return { hasScale: true, hasAnisotropic: true };
    }
  }
  return { hasScale, hasAnisotropic: false };
}

function decodeKernel(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const KERNELS: readonly [VATKernelFlavor, string][] = [
  ['relaxed-simd', VAT_PACK_KERNEL_RELAXED_SIMD_BASE64],
  ['simd', VAT_PACK_KERNEL_SIMD_BASE64],
  ['scalar', VAT_PACK_KERNEL_SCALAR_BASE64],
];

/** Select the fastest kernel accepted by the current WebAssembly engine. */
export function selectVatKernel(preference: 'auto' | VATKernelFlavor = 'auto'): {
  flavor: VATKernelFlavor;
  bytes: Uint8Array<ArrayBuffer>;
} {
  const candidates = preference === 'auto'
    ? KERNELS
    : KERNELS.filter(([flavor]) => flavor === preference);
  for (const [flavor, base64] of candidates) {
    const bytes = decodeKernel(base64);
    if (WebAssembly.validate(bytes)) return { flavor, bytes };
  }
  if (preference !== 'auto') throw new Error(`VAT ${preference} kernel is not supported by this runtime`);
  throw new Error('No compatible VAT WebAssembly kernel is available');
}

const WORKER_SOURCE = String.raw`
function toHalf(value) {
  const floatView = new Float32Array(1), intView = new Uint32Array(floatView.buffer);
  floatView[0] = value; const x = intView[0];
  let bits = (x >> 16) & 0x8000, m = (x >> 12) & 0x07ff, e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) { bits |= 0x7c00; bits |= (e === 255 ? 0 : 1) && (x & 0x007fffff); return bits; }
  if (e < 113) { m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits; }
  bits |= ((e - 112) << 10) | (m >> 1); bits += m & 1; return bits;
}
async function pack(message) {
  const { wasm, matrices, frames, bones, dqWidthBones, tilesX, strideTexels, useHalf } = message;
  const instance = await WebAssembly.instantiate(wasm, {});
  const exports = instance.instance ? instance.instance.exports : instance.exports;
  const memory = exports.memory;
  const inputBytes = matrices.byteLength, outputFloats = frames * bones * strideTexels * 4;
  const inputPtr = 1024, outputPtr = (inputPtr + inputBytes + 15) & ~15;
  const required = outputPtr + outputFloats * 4;
  if (memory.buffer.byteLength < required) memory.grow(Math.ceil((required - memory.buffer.byteLength) / 65536));
  new Uint8Array(memory.buffer, inputPtr, inputBytes).set(new Uint8Array(matrices));
  exports.packDQ(inputPtr, outputPtr, frames * bones, strideTexels === 3 ? 1 : 0);
  const packed = new Float32Array(memory.buffer, outputPtr, outputFloats);
  const atlasWidth = dqWidthBones * strideTexels, atlasHeight = frames * tilesX;
  const atlas = new Float32Array(atlasWidth * atlasHeight * 4);
  for (let frame = 0; frame < frames; frame++) for (let bone = 0; bone < bones; bone++) {
    const source = (frame * bones + bone) * strideTexels * 4;
    const tile = Math.floor(bone / dqWidthBones), xBone = bone % dqWidthBones;
    const target = (((frame * tilesX + tile) * atlasWidth) + xBone * strideTexels) * 4;
    atlas.set(packed.subarray(source, source + strideTexels * 4), target);
  }
  if (!useHalf) return atlas.buffer;
  const half = new Uint16Array(atlas.length);
  for (let i = 0; i < atlas.length; i++) half[i] = toHalf(atlas[i]);
  return half.buffer;
}
self.onmessage = async event => {
  try { const result = await pack(event.data); self.postMessage({ result }, [result]); }
  catch (error) { self.postMessage({ error: error && (error.stack || error.message) || String(error) }); }
};`;

async function runWorker(options: VATWorkerPackOptions, wasm: Uint8Array): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(url);
  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = event => event.data.error
        ? reject(new Error(event.data.error))
        : resolve(event.data.result as ArrayBuffer);
      worker.onerror = event => reject(new Error(event.message));
      const matrices = options.matrices.buffer.slice(
        options.matrices.byteOffset,
        options.matrices.byteOffset + options.matrices.byteLength
      );
      const wasmBuffer = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
      worker.postMessage({ ...options, matrices, wasm: wasmBuffer }, [matrices, wasmBuffer]);
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

/** Pack sampled skin matrices with the AssemblyScript kernel, optionally in a worker. */
export async function packVatMatrices(options: VATWorkerPackOptions): Promise<Float32Array | Uint16Array> {
  const { bytes: wasm } = selectVatKernel(options.kernel);
  if (options.worker !== false && typeof Worker !== 'undefined') {
    try {
      const result = await runWorker(options, wasm);
      return options.useHalf ? new Uint16Array(result) : new Float32Array(result);
    } catch (error) {
      console.warn('[VATWorker] worker unavailable; falling back to main-thread WASM', error);
    }
  }
  const result = await WebAssembly.instantiate(wasm, {});
  const instance = result instanceof WebAssembly.Instance
    ? result
    : (result as WebAssembly.WebAssemblyInstantiatedSource).instance;
  const exports = instance.exports as unknown as {
    memory: WebAssembly.Memory;
    packDQ(input: number, output: number, count: number, hasScale: number): void;
  };
  const inputBytes = options.matrices.byteLength;
  const packedFloats = options.frames * options.bones * options.strideTexels * 4;
  const inputPtr = 1024;
  const outputPtr = (inputPtr + inputBytes + 15) & ~15;
  const required = outputPtr + packedFloats * 4;
  if (exports.memory.buffer.byteLength < required) {
    exports.memory.grow(Math.ceil((required - exports.memory.buffer.byteLength) / 65536));
  }
  new Float32Array(exports.memory.buffer, inputPtr, options.matrices.length).set(options.matrices);
  exports.packDQ(inputPtr, outputPtr, options.frames * options.bones, options.strideTexels === 3 ? 1 : 0);
  const packed = new Float32Array(exports.memory.buffer, outputPtr, packedFloats);
  const atlasWidth = options.dqWidthBones * options.strideTexels;
  const atlas = new Float32Array(atlasWidth * options.frames * options.tilesX * 4);
  for (let frame = 0; frame < options.frames; frame++) for (let bone = 0; bone < options.bones; bone++) {
    const source = (frame * options.bones + bone) * options.strideTexels * 4;
    const tile = Math.floor(bone / options.dqWidthBones);
    const target = (((frame * options.tilesX + tile) * atlasWidth) + (bone % options.dqWidthBones) * options.strideTexels) * 4;
    atlas.set(packed.subarray(source, source + options.strideTexels * 4), target);
  }
  if (!options.useHalf) return atlas;
  // Babylon's converter is not imported here so the worker module stays small.
  const half = new Uint16Array(atlas.length);
  const float = new Float32Array(1), bits = new Uint32Array(float.buffer);
  for (let i = 0; i < atlas.length; i++) {
    float[0] = atlas[i]; const x = bits[0];
    let value = (x >> 16) & 0x8000, mantissa = (x >> 12) & 0x07ff, exponent = (x >> 23) & 0xff;
    if (exponent < 103) { half[i] = value; continue; }
    if (exponent > 142) { half[i] = value | 0x7c00 | (exponent === 255 ? 0 : (x & 0x007fffff)); continue; }
    if (exponent < 113) { mantissa |= 0x0800; half[i] = value | ((mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1)); continue; }
    value |= ((exponent - 112) << 10) | (mantissa >> 1); half[i] = value + (mantissa & 1);
  }
  return half;
}
