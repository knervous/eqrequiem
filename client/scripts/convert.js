import sharp from "sharp";
import { convertDDS2Jimp } from "./image-processing.js";
import { Jimp } from "jimp";
import TgaLoader from "tga-js";

// File signatures
const BUF_BMP = Buffer.from([0x42, 0x4d]);       // "BM"
const BUF_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Uint8Array|Buffer} buf
 * @returns {boolean}
 */
function isBitmap(buf) {
  return Buffer.compare(BUF_BMP, Buffer.from(buf.slice(0, 2))) === 0;
}

/**
 * @param {Uint8Array|Buffer} buf
 * @returns {boolean}
 */
function isPng(buf) {
  return Buffer.compare(BUF_PNG, Buffer.from(buf.slice(0, 8))) === 0;
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
  if (channels !== 4) return imageData;
  const buffer = Buffer.from(imageData);
  for (let i = 0; i < width * height * 4; i += 4) {
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
    return tga.header.width > 0 && tga.header.height > 0;
  } catch {
    return false;
  }
}

/**
 * @param {ArrayBuffer} data
 * @param {string} name
 * @returns {Promise<sharp.Sharp|null>}
 */
export async function convertToSharp(data, name) {
  const buf = new Uint8Array(data);

  if (isBitmap(buf)) {
    try {
      const jimpBmp = await Jimp.read(data);
      return sharp(jimpBmp.bitmap.data, {
        raw: {
          width: jimpBmp.bitmap.width,
          height: jimpBmp.bitmap.height,
          channels: 4,
        },
      });
    } catch (e) {
      console.warn("Error processing BMP:", e, name);
      return null;
    }

  } else if (isPng(buf)) {
    try {
      // Let sharp auto-detect PNG
      return sharp(Buffer.from(data));
    } catch (e) {
      console.warn("Error processing PNG:", e, name);
      return null;
    }

  } else if (isTGA(data)) {
    try {
      const tga = new TgaLoader();
      tga.load(new Uint8Array(data));
      const { header: { width, height, pixelDepth }, imageData } = tga;
      const channels = pixelDepth === 32 ? 4 : 3;
      const corrected = convertBGRAToRGBA(imageData, width, height, channels);
      return sharp(corrected, { raw: { width, height, channels } })
        .ensureAlpha()
        .flip();
    } catch (e) {
      console.warn("Error processing TGA:", e.message, name);
      return null;
    }

  } else {
    // DDS fallback
    try {
      const [decompressed, dds] = convertDDS2Jimp(new Uint8Array(data), name);
      const w = dds.mipmaps[0].width;
      const h = dds.mipmaps[0].height;
      const pixelCount = w * h * 4;
      const imgBuffer = Buffer.from(decompressed.slice(0, pixelCount));
      return sharp(imgBuffer, { raw: { width: w, height: h, channels: 4 } }).flip();
    } catch (e) {
      console.warn("Error processing DDS:", e, name);
      return null;
    }
  }
}

/**
 * @param {ArrayBuffer} data
 * @param {string} name
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function convertToWebP(data, name) {
  const buf = new Uint8Array(data);

  if (isBitmap(buf)) {
    try {
      const jimpBmp = await Jimp.read(data);
      return await sharp(jimpBmp.bitmap.data, {
        raw: { width: jimpBmp.bitmap.width, height: jimpBmp.bitmap.height, channels: 4 }
      }).webp({ quality: 80 }).toBuffer();
    } catch (e) {
      console.warn("Error processing BMP:", e, name);
      return null;
    }

  } else if (isPng(buf)) {
    try {
      return await sharp(Buffer.from(data))
        .webp({ quality: 80 })
        .toBuffer();
    } catch (e) {
      console.warn("Error processing PNG:", e, name);
      return null;
    }

  } else if (isTGA(data)) {
    try {
      const tga = new TgaLoader();
      tga.load(new Uint8Array(data));
      const { header: { width, height, pixelDepth }, imageData } = tga;
      const channels = pixelDepth === 32 ? 4 : 3;
      const corrected = convertBGRAToRGBA(imageData, width, height, channels);
      return await sharp(corrected, { raw: { width, height, channels } })
        .ensureAlpha()
        .flip()
        .webp({ quality: 80 })
        .toBuffer();
    } catch (e) {
      console.warn("Error processing TGA:", e.message, name);
      return null;
    }

  } else {
    try {
      const [decompressed, dds] = convertDDS2Jimp(new Uint8Array(data), name);
      const w = dds.mipmaps[0].width;
      const h = dds.mipmaps[0].height;
      const pixelCount = w * h * 4;
      const imgBuffer = Buffer.from(decompressed.slice(0, pixelCount));
      return await sharp(imgBuffer, { raw: { width: w, height: h, channels: 4 } })
        .flip()
        .webp({ quality: 80 })
        .toBuffer();
    } catch (e) {
      console.warn("Error processing DDS:", e, name);
      return null;
    }
  }
}
