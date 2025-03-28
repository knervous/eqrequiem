import TgaLoader from 'tga-js';

const tga = new TgaLoader();

function cropImage(base64Url: string, cropX: number, cropY: number, cropWidth: number, cropHeight: number) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get 2d context"));
        return;
      }
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const croppedDataUrl = canvas.toDataURL("image/png");
      resolve(croppedDataUrl);
    };
    img.onerror = reject;
    img.src = base64Url;
  });
}

export class ImageCache {
  private static cache: { [key: string]: string } = {};
  public static getEQFile: (
    folder: string,
    path: string
  ) => Promise<ArrayBuffer | null>;

  public static async getImageUrl(
    folder: string,
    path: string,
    crop: boolean = false,
    cropX?: number,
    cropY?: number,
    cropWidth?: number,
    cropHeight?: number,
  ): Promise<string> {
    const cacheKey = `${folder}${path}${crop ? `_${cropX}_${cropY}_${cropWidth}_${cropHeight}` : ''}`;
    
    if (!this.cache[cacheKey]) {
      if (!this.getEQFile) {
        throw new Error("getEQFile is not set");
      }
      const data = await this.getEQFile(folder, path);
      if (data instanceof ArrayBuffer) {
        tga.load(new Uint8Array(data));
        let imageUrl = tga.getDataURL('image/png');

        // Apply cropping if requested and parameters are provided
        if (crop) {
          if (
            cropX === undefined ||
            cropY === undefined ||
            cropWidth === undefined ||
            cropHeight === undefined
          ) {
            throw new Error("Crop parameters (cropX, cropY, cropWidth, cropHeight) must be provided when crop is true");
          }
          imageUrl = await cropImage(imageUrl, cropX, cropY, cropWidth, cropHeight);
        }

        this.cache[cacheKey] = imageUrl;
      } else {
        this.cache[cacheKey] = ""; // Cache empty string if no data
      }
    }
    return this.cache[cacheKey] ?? "";
  }
}