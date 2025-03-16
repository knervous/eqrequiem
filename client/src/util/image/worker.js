import * as Comlink from 'comlink';
import { convertDDS2Jimp } from 'sage-core/util/image-processing';
import 'jimp/browser/lib/jimp';
import dxt from 'dxt-js';
import { createDirectoryHandle } from 'sage-core/util/fileSystem';

const ShaderType = {
  Diffuse                        : 0,
  Transparent25                  : 1,
  Transparent50                  : 2,
  Transparent75                  : 3,
  TransparentAdditive            : 4,
  TransparentAdditiveUnlit       : 5,
  TransparentMasked              : 6,
  DiffuseSkydome                 : 7,
  TransparentSkydome             : 8,
  TransparentAdditiveUnlitSkydome: 9,
  Invisible                      : 10,
  Boundary                       : 11,
};

/**
 * @type {import('jimp/browser/lib/jimp')}
 */
const Jimp = globalThis.Jimp;  

/**
 * @typedef QueueItem
 * @property {string} name
 * @property {ArrayBuffer} data
 */

const fullAlphaToDoubleAlphaThreshold = 64;
const alphaShaderMap = {
  [ShaderType.Transparent25]      : 64,
  [ShaderType.Transparent50]      : 128,
  [ShaderType.TransparentSkydome] : 128,
  [ShaderType.Transparent75]      : 192,
  [ShaderType.TransparentAdditive]: 192,
};

const mainThreadFuncs = Comlink.wrap(self);  

/**
 *
 * @param {[QueueItem]} entries
 * @param {FileSystemDirectoryHandle} eqFileHandle
 */
async function parseTextures(entries, eqFileHandle, workerNum) {
  if (typeof eqFileHandle === 'string') {
    eqFileHandle = createDirectoryHandle(eqFileHandle);
  }
  performance.mark(`${workerNum} entered function`);

  const requiemDir = await eqFileHandle.getDirectoryHandle('eqsage', { create: true });
  const dirHandle = await requiemDir.getDirectoryHandle('textures', { create: true });

  performance.mark(`${workerNum} started work`);
  const cleanupFuncs = [];
  await Promise.all(entries.map(async ({ name, data, shaderType }) => {
    name = name.toLowerCase().replace(/\.\w+$/, '.png');
    const textureHandle = await dirHandle.getFileHandle(name, { create: true });
    const writable = await textureHandle.createWritable();
    if (writable.locked) {
      mainThreadFuncs.incrementParsedImage();
      return;
    }
    const imgData = await parseTexture(name, shaderType, data);
    if (imgData) {
      await writable.write(imgData);
    }
    cleanupFuncs.push(async () => {
      await writable.close();
    });
    mainThreadFuncs.incrementParsedImage();
  }));

  performance.mark(`${workerNum} finished work`);
  performance.measure(`${workerNum} total time`, `${workerNum} entered function`, `${workerNum} finished work`);

  setTimeout(async () => {
    for (const cleanup of cleanupFuncs) {
      await cleanup();
    }
  }, 0);
}

/** @param {string} name */
async function parseTexture(name, shaderType, data) {
  name = name.toLowerCase().replace(/\.\w+$/, '');

  if (new DataView(data).getUint16(0, true) === 0x4d42) {
    // header for bitmap
    try {
      const img = await Jimp.read(data);
      let maskColor;

      // If TransparentMasked shader type, set maskColor to the first pixel
      if (shaderType === ShaderType.TransparentMasked) {
        const firstPixelIdx = 0;
        maskColor = {
          r: img.bitmap.data[firstPixelIdx],
          g: img.bitmap.data[firstPixelIdx + 1],
          b: img.bitmap.data[firstPixelIdx + 2],
          a: img.bitmap.data[firstPixelIdx + 3],
        };
      }

      img.scan(0, 0, img.bitmap.width, img.bitmap.height, (x, y, idx) => {
        const r = img.bitmap.data[idx];
        const g = img.bitmap.data[idx + 1];
        const b = img.bitmap.data[idx + 2];
        let alpha = img.bitmap.data[idx + 3];

        if (shaderType === ShaderType.TransparentMasked) {
          // If the current pixel matches the mask color, set alpha to 0
          if (
            r === maskColor.r &&
            g === maskColor.g &&
            b === maskColor.b &&
            alpha === maskColor.a
          ) {
            alpha = 0;
          }
        } else if (alphaShaderMap[shaderType]) {
          alpha = alphaShaderMap[shaderType];
        } else if (shaderType === undefined || shaderType === ShaderType.Diffuse) {
          alpha = 255;
        } else {
          const maxRgb = Math.max(r, g, b);
          alpha = maxRgb <= fullAlphaToDoubleAlphaThreshold
            ? maxRgb
            : Math.min(maxRgb + (maxRgb - fullAlphaToDoubleAlphaThreshold) * 2, 255);
        }

        img.bitmap.data[idx + 3] = alpha;
      });

      return await img.getBufferAsync(Jimp.MIME_PNG);
    } catch (e) {
      console.warn('Error processing BMP:', e, name);
      return null;
    }
  } else {
    // otherwise DDS
    let decompressed, dds;
    try {
      ([decompressed, dds] = convertDDS2Jimp(new Uint8Array(data), name));
    } catch (e) {
      console.log('Error decompressing DDS', e);
      return null;
    }
    const w = dds.mipmaps[0].width;
    const h = dds.mipmaps[0].height;
    const bmp = new Jimp(w, h);

    let maskColor;

    // If TransparentMasked shader type, set maskColor to the first pixel of decompressed data
    if (shaderType === ShaderType.TransparentMasked) {
      maskColor = {
        r: decompressed[0],
        g: decompressed[1],
        b: decompressed[2],
        a: decompressed[3],
      };
    }

    bmp.scan(0, 0, w, h, (x, y, idx) => {
      bmp.bitmap.data[idx] = decompressed[idx]; // r
      bmp.bitmap.data[idx + 1] = decompressed[idx + 1]; // g
      bmp.bitmap.data[idx + 2] = decompressed[idx + 2]; // b
      let alpha = decompressed[idx + 3]; // a

      if (shaderType === ShaderType.TransparentMasked) {
        // If the current pixel matches the mask color, set alpha to 0
        if (
          bmp.bitmap.data[idx] === maskColor.r &&
          bmp.bitmap.data[idx + 1] === maskColor.g &&
          bmp.bitmap.data[idx + 2] === maskColor.b &&
          alpha === maskColor.a
        ) {
          alpha = 0;
        }
      } else if (alphaShaderMap[shaderType]) {
        alpha = alphaShaderMap[shaderType];
      }

      bmp.bitmap.data[idx + 3] = alpha;
    });

    bmp.flip(false, true);

    return await bmp.getBufferAsync(Jimp.MIME_PNG);
  }
}


async function convertPNGtoDDS(pngFile, name) {
  if (!isValidPNG(pngFile)) {
    console.log('Invalid PNG file.', pngFile, name);
    return null;
    // throw new Error('Invalid PNG file.');
  }
  // Decode PNG into raw RGBA pixel data
  const canvas = new OffscreenCanvas(1, 1);
  const blob = new Blob([pngFile], { type: 'image/png' });
  const imgBitmap = await createImageBitmap(blob);
  const width = imgBitmap.width;
  const height = imgBitmap.height;
  canvas.width = imgBitmap.width;
  canvas.height = imgBitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgBitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgbaPixels = new Uint8Array(imageData.data.buffer); // Raw RGBA pixel data

  // Compress RGBA pixels to DXT5
  const compressed = await dxt.compress(
    rgbaPixels, // Raw RGBA input
    canvas.width,
    canvas.height,
    dxt.flags.DXT5
  );

  // Step 3: Create a DDS header for a DXT5 texture
  const ddsHeader = createDDSHeader(width, height, compressed.length);

  // Step 4: Combine header + compressed data
  // DDS header is 128 bytes total (4 bytes for magic, 124 for the header struct)
  const ddsBuffer = new ArrayBuffer(ddsHeader.byteLength + compressed.byteLength);
  const ddsView = new Uint8Array(ddsBuffer);
 
  // Write the header first
  ddsView.set(new Uint8Array(ddsHeader), 0);
  // Then the compressed data
  ddsView.set(compressed, ddsHeader.byteLength);
 
  // Step 5: Return full DDS file
  return ddsBuffer;
}


/**
 * Creates a minimal DDS header for a DXT5 texture of given width/height.
 */
function createDDSHeader(width, height, linearSize) {
  const DDS_MAGIC = 0x20534444; // "DDS "
  
  // The total size of magic number + header = 128 bytes
  // We'll store the magic as well; so we build 128 - 4 = 124 for the header plus 4 for magic 
  const headerBuffer = new ArrayBuffer(128);
  const headerView32 = new Uint32Array(headerBuffer);
  const headerView8 = new Uint8Array(headerBuffer);

  // 1) Write the magic "DDS "
  // We'll put that in the first 4 bytes:
  headerView32[0] = DDS_MAGIC; // offset 0

  // 2) The next 124 bytes is the DDS_HEADER
  // offset to where the DDS_HEADER starts in 32-bit words is 1
  const dwSize = 124;
  headerView32[1] = dwSize; // dwSize
  // DDSD_CAPS = 0x1, DDSD_HEIGHT = 0x2, DDSD_WIDTH = 0x4,
  // DDSD_PIXELFORMAT = 0x1000, DDSD_LINEARSIZE = 0x80000
  headerView32[2] = 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000; // dwFlags
  
  headerView32[3] = height; // dwHeight
  headerView32[4] = width; // dwWidth
  headerView32[5] = linearSize; // dwPitchOrLinearSize
  headerView32[6] = 0; // dwDepth
  headerView32[7] = 0; // dwMipMapCount

  // dwReserved1 (11 UInt32s)
  // We'll leave them at 0
  // indexes 8..18 are zero

  // --- DDS_PIXELFORMAT starts at offset 19 in 32-bit words
  const ddspfSize = 32;
  headerView32[19] = ddspfSize; // ddspf.dwSize
  headerView32[20] = 0x4; // ddspf.dwFlags => DDPF_FOURCC
  // 'DXT5' FourCC
  headerView8[84] = 'D'.charCodeAt(0);
  headerView8[85] = 'X'.charCodeAt(0);
  headerView8[86] = 'T'.charCodeAt(0);
  headerView8[87] = '5'.charCodeAt(0);

  // ddspf.dwRGBBitCount, dwRBitMask, dwGBitMask, dwBBitMask, dwRGBAlphaMask => 0

  // dwCaps
  // DDSCAPS_TEXTURE = 0x1000
  headerView32[25] = 0x1000; // dwCaps1
  // dwCaps2, dwCaps3, dwCaps4 => 0
  // dwReserved2 => 0

  // That should be enough for a simple DXT5 file with no mipmaps.
  return headerBuffer;
}

function isValidPNG(buffer) {
  const signature = new Uint8Array(buffer.slice(0, 8));
  // PNG signature is: 89 50 4E 47 0D 0A 1A 0A
  return (
    signature[0] === 0x89 &&
    signature[1] === 0x50 &&
    signature[2] === 0x4e &&
    signature[3] === 0x47 &&
    signature[4] === 0x0d &&
    signature[5] === 0x0a &&
    signature[6] === 0x1a &&
    signature[7] === 0x0a
  );
}

/**
 * 
 * @param {ArrayBuffer} buffer 
 */
async function compressImage(buffer) {
  const uint8Array = new Uint8Array(buffer);
  const blob = new Blob([uint8Array], { type: 'image/png' });

  try {
    const imageBitmap = await createImageBitmap(blob);
    const offscreen = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = offscreen.getContext('2d');

    // X axis flip
    // ctx.scale(1, -1);
    // ctx.translate(0, -imageBitmap.height);

    ctx.drawImage(imageBitmap, 0, 0);
    const quality = 0.7;
    const compressedBlob = await offscreen.convertToBlob({ type: 'image/jpeg', quality });
    const arrayBuffer = await compressedBlob.arrayBuffer();
    return Comlink.transfer(arrayBuffer, [arrayBuffer]);
  } catch (e) {
    console.warn('Error in compress', e);
  }
  return null;
}
const exports = { parseTextures, compressImage, convertPNGtoDDS };

/** @type {typeof exports} */
const exp = Object.fromEntries(Object.entries(exports).map(([key, fn]) => [key, async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    console.error('Worker error', error);
  }
}]));

export default exp;

Comlink.expose(exp);
