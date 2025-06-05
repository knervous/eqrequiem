import type * as BJS from "@babylonjs/core";

import BABYLON from "@bjs";

type CompressionFormats = {
    etc1?: boolean;
    s3tc?: boolean;
    pvrtc?: boolean;
    etc2?: boolean;
    astc?: boolean;
    bc7?: boolean;
};

type BasisTextureResult = {
    layerCount: number;
    useGPUCompression: boolean;
    data: Uint8Array;
    format: number; // BABYLON.Constants.TEXTUREFORMAT_RGBA or glInternalFormat
};

export async function loadBasisTexture(
  engine,
  basisBytes: Uint8Array | ArrayBuffer,
  forceDecompress = true,
): Promise<BasisTextureResult> {

  // 2) Determine supported compressed formats
  const supportedCompressionFormats: CompressionFormats = {};
  const isWebGL = engine instanceof BABYLON.ThinEngine && !(engine instanceof BABYLON.WebGPUEngine);
  const isWebGPU = engine instanceof BABYLON.WebGPUEngine;

  if (isWebGL) {
    const gl = engine._gl;
    supportedCompressionFormats.etc1 = !!gl.getExtension('WEBGL_compressed_texture_etc1');
    supportedCompressionFormats.s3tc = !!gl.getExtension('WEBGL_compressed_texture_s3tc');
    supportedCompressionFormats.pvrtc = !!gl.getExtension('WEBGL_compressed_texture_pvrtc');
    supportedCompressionFormats.etc2 = !!gl.getExtension('WEBGL_compressed_texture_etc');
    supportedCompressionFormats.astc = !!gl.getExtension('WEBGL_compressed_texture_astc');
    supportedCompressionFormats.bc7 = !!gl.getExtension('EXT_texture_compression_bptc');
  } else if (isWebGPU) {
    // WebGPU: Check supported texture formats
    // Note: WebGPU does not use extensions; check adapter features or format support
    const adapter = await engine._device;
    const features = await adapter.features; // Hypothetical; WebGPU API may vary
    supportedCompressionFormats.etc1 = false; // ETC1 not typically supported in WebGPU
    supportedCompressionFormats.s3tc = features.has('texture-compression-bc'); // Includes BC7
    supportedCompressionFormats.pvrtc = false; // PVRTC not typically supported
    supportedCompressionFormats.etc2 = features.has('texture-compression-etc2');
    supportedCompressionFormats.astc = features.has('texture-compression-astc');
    supportedCompressionFormats.bc7 = features.has('texture-compression-bc');
  }


  const transcodeConfig = {
    supportedCompressionFormats,
    loadMipmapLevels: false,
    loadSingleImage: undefined,
  };

  let transcodeResult;
  if (!forceDecompress) {
    try {
      transcodeResult = await BABYLON.BasisTools.TranscodeAsync(basisBytes, transcodeConfig);
    } catch (e) {
      console.error('Basis transcoding failed:', e);
      transcodeResult = null;
    }
  }


  let images;
  let basisFormat;
  let glInternalFormat;
  const useGPUCompression = transcodeResult?.success && Object.values(supportedCompressionFormats).some((v) => v);

  if (useGPUCompression) {
    images = transcodeResult.fileInfo.images;
    basisFormat = transcodeResult.format;
    if (!images || images.length === 0) {
      throw new Error("BasisTools returned zero images; was this built as a 2D array?");
    }
    glInternalFormat = BABYLON.GetInternalFormatFromBasisFormat(basisFormat, engine);
  } else {
    // --- CPU fallback: ask BasisTools for uncompressed RGB565 data ---
    const fallbackConfig = {
      loadMipmapLevels: false,
      loadSingleImage: undefined,
      supportedCompressionFormats: {},
    };
    transcodeResult = await BABYLON.BasisTools.TranscodeAsync(basisBytes, fallbackConfig);
    images = transcodeResult.fileInfo.images;
  }

  const layerCount = images.length;

  let data;
  // 6) If the GPU supports the compressed format, just pass through to the existing compressed path:
  if (useGPUCompression) {
    data = images.map((img) => img.levels[0].transcodedPixels);
  } else if (images.length) {
    const { width, height } = images[0].levels[0];
    const pixelsPerSlice = width * height;
    const bytesRGB8 = pixelsPerSlice * 4;
    const totalRGBbytes = layerCount * bytesRGB8;
    const outB = new Uint8Array(totalRGBbytes);

    for (let layer = 0; layer < layerCount; layer++) {
      const sliceRGB565 = new Uint16Array(images[layer].levels[0].transcodedPixels.buffer);

      for (let idx = 0; idx < pixelsPerSlice; idx++) {
        const rgb565 = sliceRGB565[idx];
        const r5 = (rgb565 >> 11) & 0x1F; // 5 bits for red
        const g6 = (rgb565 >> 5) & 0x3F;  // 6 bits for green
        const b5 = rgb565 & 0x1F;         // 5 bits for blue
        const r8 = (r5 * 255 / 31) | 0; // Scale 5 bits to 8 bits
        const g8 = (g6 * 255 / 63) | 0; // Scale 6 bits to 8 bits
        const b8 = (b5 * 255 / 31) | 0; // Scale 5 bits to 8 bits
        const dstOff = layer * bytesRGB8 + idx * 4;
        outB[dstOff + 0] = r8; // Red
        outB[dstOff + 1] = g8; // Green
        outB[dstOff + 2] = b8; // Blue
        outB[dstOff + 3] = 255; // Blue
      }
    }
    data = outB;

  }
  return {
    layerCount,
    useGPUCompression,
    data,
    format: useGPUCompression ? glInternalFormat : BABYLON.Constants.TEXTUREFORMAT_RGBA,
  };
}


/**
 * Create a function for updateRawTexture3D/updateRawTexture2DArray
 * @param is3D true for TEXTURE_3D and false for TEXTURE_2D_ARRAY
 * @internal
 */
function _makeUpdateRawTextureFunction(is3D) {
  return function (
    this: BJS.WebGPUEngine | BJS.ThinEngine,
    texture,
    data,
    format,
    invertY,
    compression = null,
    textureType = BABYLON.Constants.TEXTURETYPE_UNSIGNED_INT,
  ) {
    const gl = this._gl;
    const target = is3D ? gl.TEXTURE_3D : gl.TEXTURE_2D_ARRAY;
    const internalType = this._getWebGLTextureType(textureType);
    const internalFormat = this._getInternalFormat(format);
    const internalSizedFormat = this._getRGBABufferInternalSizedFormat(textureType, format);

    this._bindTextureDirectly(target, texture, true);
    this._unpackFlipY(invertY === undefined ? true : !!invertY);

    if (!this._doNotHandleContextLost) {
      texture._bufferView = Array.isArray(data) ? null : data; // Store single buffer if not array
      texture.format = format;
      texture.invertY = invertY;
      texture._compression = compression;
    }

    if (texture.width % 4 !== 0) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    }

    if (compression && data) {
      if (Array.isArray(data)) {
        // Per-slice upload for compressed 2D array
        if (!is3D) {
          const depth = texture.depth || data.length;
          // Initialize the texture array with the correct dimensions
          gl.compressedTexImage3D(
            target,
            0,
            compression,
            texture.width,
            texture.height,
            depth,
            0,
            new Uint8Array(data.reduce((acc, val) => acc + val.byteLength, 0)), // Allocate texture storage
          );

          // Upload each slice individually
          for (let slice = 0; slice < data.length; slice++) {
            gl.compressedTexSubImage3D(
              target,
              0, // level
              0, // xoffset
              0, // yoffset
              slice, // zoffset (slice index)
              texture.width,
              texture.height,
              1, // One slice
              compression,
              data[slice],
            );
          }
        } else {
          throw new Error("Per-slice upload is only supported for TEXTURE_2D_ARRAY.");
        }
      } else {
        // Single buffer upload (existing behavior)
        gl.compressedTexImage3D(
          target,
          0,
          compression,
          texture.width,
          texture.height,
          texture.depth,
          0,
          data,
        );
      }
    } else {
      gl.texImage3D(
        target,
        0,
        internalSizedFormat,
        texture.width,
        texture.height,
        texture.depth,
        0,
        internalFormat,
        internalType,
        data,
      );
    }

    if (texture.generateMipMaps) {
      gl.generateMipmap(target);
    }
    this._bindTextureDirectly(target, null);
    texture.isReady = true;
  };
}

//------------------------------------------------------------------------------
// Update a compressed 2D‐array “raw texture” (e.g. from Basis‐transcoded blocks)
//------------------------------------------------------------------------------
// signature matches WebGL’s updateRawTexture2DArrayCompressed:
//   texture: InternalTexture
//   bufferOrArr: either ArrayBufferView (single buffer) or Array<ArrayBufferView> (one per slice)
//   format: GPUTextureFormat (must be a compressed format – e.g. astc, etc.)
//   invertY: boolean (ignored for compressed data, but stored on texture for context‐lost)
//   compression: string | null (e.g. "astc", "s3tc", etc.)
//   textureType: number (Engine.TEXTURETYPE_*; usually unsigned byte)
//
// NOTE: This will upload each slice (or whole‐depth buffer) into the GPUTexture’s array layers.
//       Because WebGPU cannot generate compressed mipmaps on the fly, this code does not call generateMipmaps.
//------------------------------------------------------------------------------
BABYLON.WebGPUEngine.prototype.updateRawTexture2DArrayCompressed = function (
  texture,
  bufferOrArr,
  format,
  invertY,
  compression = null,
  textureType = BABYLON.Constants.TEXTURETYPE_UNSIGNED_INTEGER,
) {
  if (!texture) {
    return;
  }
  const totalLength = bufferOrArr.reduce((acc, val) => acc + val.byteLength, 0);
  const result = new Uint8Array(totalLength);

  // Copy each array into result at the correct offset
  let offset = 0;
  for (const arr of bufferOrArr) {
    result.set(arr, offset);
    offset += arr.length;
  }
  bufferOrArr = result;
  // 1) Store buffer/view + metadata for context‐lost
  if (!this._doNotHandleContextLost) {
    // If bufferOrArr is an array, store as is; otherwise store single buffer.
    texture._bufferView = Array.isArray(bufferOrArr) ? null : (bufferOrArr);
    texture._bufferViewArray = Array.isArray(bufferOrArr) ? (bufferOrArr) : null;
    texture.format = format;
    texture.invertY = invertY;
    texture._compression = compression;
    texture.type = textureType; // e.g. unsigned byte
  }

  // 2) If no data, we’re done (just keep it as an empty texture)
  if (!bufferOrArr) {
    texture.isReady = true;
    return;
  }

  // 3) Grab the underlying GPUTexture
  const hwTex = texture._hardwareTexture;
  const gpuTexture = hwTex.underlyingResource;
  const width = texture.width;
  const height = texture.height;
  const depth = texture.depth; // number of array layers

  // 4) Determine block info for this compressed format
  //    (blockWidth/blockHeight = texels per compressed block; blockByteLength = bytes per block)
  //   console.log('Tex helper', BABYLON.WebGPUTextureHelper); // not available in sandbox
  //   console.log('Format', format);
  const blockInfo = { width: 4, height: 4, length: 16 }; // BABYLON.WebGPUTextureHelper.GetBlockInformationFromFormat(format);
  const blockWidth = blockInfo.width;
  const blockHeight = blockInfo.height;
  const blockByteLen = blockInfo.length;

  const allBytes = new Uint8Array(
    (bufferOrArr).buffer,
    (bufferOrArr).byteOffset,
    (bufferOrArr).byteLength,
  );
  console.log('All bytes', allBytes);
  const blocksInRow = Math.ceil(width / blockWidth);
  const blocksInCol = Math.ceil(height / blockHeight);
  const bytesPerRow = blocksInRow * blockByteLen;
  const rowsPerImage = blocksInCol;

  this._device.queue.writeTexture(
    {
      texture: gpuTexture,
      mipLevel: 0,
      origin: { x: 0, y: 0, z: 0 },
      aspect: "all",
    },
    allBytes,
    {
      offset: 0,
      bytesPerRow: bytesPerRow,
      rowsPerImage: rowsPerImage,
    },
    {
      width: blocksInRow * blockWidth,
      height: blocksInCol * blockHeight,
      depthOrArrayLayers: depth,
    },
  );


  // 8) Mark ready (no automatic mip generation for compressed textures in WebGPU)
  texture.isReady = true;
};

BABYLON.ThinEngine.prototype.updateRawTexture2DArrayCompressed = _makeUpdateRawTextureFunction(false);  
