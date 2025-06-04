import sharp from "sharp";
import { convertDDS2Jimp } from "./image-processing.js";
import { Jimp } from "jimp";
import TgaLoader from "tga-js";

const BUF_BMP = Buffer.from([0x42, 0x4d]); // "BM" file signature

/**
 *
 * @param {ArrayBuffer} buf
 * @returns
 */
function isBitmap(buf) {
  return Buffer.compare(BUF_BMP, buf.slice(0, 2)) === 0;
}

/**
 * Convert BGRA to RGBA by swapping red and blue channels
 * @param {Buffer} imageData
 * @param {number} width
 * @param {number} height
 * @param {number} channels
 * @returns {Buffer}
 */
function convertBGRAToRGBA(imageData, width, height, channels) {
  if (channels !== 4) return imageData; // Only convert for RGBA (32-bit)
  const buffer = Buffer.from(imageData);
  for (let i = 0; i < width * height * 4; i += 4) {
    // Swap red (index i) and blue (index i+2)
    const red = buffer[i];
    buffer[i] = buffer[i + 2];
    buffer[i + 2] = red;
  }
  return buffer;
}

/**
 * @param {ArrayBuffer} buf
 * @returns {boolean}
 */
function isTGA(buf) {
  try {
    const tga = new TgaLoader();

    tga.load(new Uint8Array(buf));
    return tga.header.width > 0 && tga.header.height > 0; // Valid TGA with non-zero dimensions
  } catch (e) {
    return false;
  }
}

/**
 * @param {ArrayBuffer} data
 * @param {string} name
 * @returns {Promise<sharp.Sharp>}
 */
export async function convertToSharp(data, name) {
  if (isBitmap(new Uint8Array(data))) {
    // header for bitmap
    try {
      const jimpBmp = await Jimp.read(data);
      return await sharp(jimpBmp.bitmap.data, {
        raw: {
          width: jimpBmp.bitmap.width,
          height: jimpBmp.bitmap.height,
          channels: 4,
        },
      })
    } catch (e) {
      console.warn("Error processing BMP:", e, name);
      return null;
    }
  } else if (isTGA(data)) {
    // Handle TGA
    try {
      const tga = new TgaLoader();

      tga.load(new Uint8Array(data));
      const {
        header: { width, height, pixelDepth },
        imageData,
      } = tga;
      const channels = pixelDepth === 32 ? 4 : 3;
      // Convert BGRA to RGBA for TGA images
      const correctedImageData = convertBGRAToRGBA(imageData, width, height, channels);
      return await sharp(correctedImageData, {
        raw: {
          width,
          height,
          channels,
        },
      })
        .ensureAlpha() // Add alpha channel if missing
        .flip();
    } catch (e) {
      console.warn("Error processing TGA:", e.message, name);
      return null;
    }
  } else {
    // otherwise DDS
    let decompressed, dds;
    try {
      [decompressed, dds] = convertDDS2Jimp(new Uint8Array(data), name);
    } catch (e) {
      console.log("Error decompressing DDS", e);
      return null;
    }
    const w = dds.mipmaps[0].width;
    const h = dds.mipmaps[0].height;
    try {
      const pixelCount = w * h * 4;
      const imgBuffer = Buffer.from(decompressed.slice(0, pixelCount));

      return await sharp(imgBuffer, {
        raw: { width: w, height: h, channels: 4 },
      })
        .flip() // Flip Y-axis
    } catch (e) {
      console.warn("Error processing DDS to WebP:", e, name);
      return null;
    }
  }
}


/**
 * @param {ArrayBuffer} data
 * @param {string} name
 * @returns {Promise<ArrayBuffer>}
 */
export async function convertToWebP(data, name) {
  if (isBitmap(new Uint8Array(data))) {
    // header for bitmap
    try {
      const jimpBmp = await Jimp.read(data);
      const webpBuffer = await sharp(jimpBmp.bitmap.data, {
        raw: {
          width: jimpBmp.bitmap.width,
          height: jimpBmp.bitmap.height,
          channels: 4,
        },
      })
        .webp({ quality: 80 })
        .toBuffer();
      return webpBuffer;
    } catch (e) {
      console.warn("Error processing BMP:", e, name);
      return null;
    }
  } else if (isTGA(data)) {
    // Handle TGA
    try {
      const tga = new TgaLoader();

      tga.load(new Uint8Array(data));
      const {
        header: { width, height, pixelDepth },
        imageData,
      } = tga;
      const channels = pixelDepth === 32 ? 4 : 3;
      // Convert BGRA to RGBA for TGA images
      const correctedImageData = convertBGRAToRGBA(imageData, width, height, channels);
      const webpBuffer = await sharp(correctedImageData, {
        raw: {
          width,
          height,
          channels,
        },
      })
        .ensureAlpha() // Add alpha channel if missing
        .webp({ quality: 80 })
        .flip()
        .toBuffer();
      return webpBuffer;
    } catch (e) {
      console.warn("Error processing TGA:", e.message, name);
      return null;
    }
  } else {
    // otherwise DDS
    let decompressed, dds;
    try {
      [decompressed, dds] = convertDDS2Jimp(new Uint8Array(data), name);
    } catch (e) {
      console.log("Error decompressing DDS", e);
      return null;
    }
    const w = dds.mipmaps[0].width;
    const h = dds.mipmaps[0].height;
    try {
      const pixelCount = w * h * 4;
      const imgBuffer = Buffer.from(decompressed.slice(0, pixelCount));

      const webpBuffer = await sharp(imgBuffer, {
        raw: { width: w, height: h, channels: 4 },
      })
        .flip() // Flip Y-axis
        .webp({ quality: 80 })
        .toBuffer();
      return webpBuffer;
    } catch (e) {
      console.warn("Error processing DDS to WebP:", e, name);
      return null;
    }
  }
}
