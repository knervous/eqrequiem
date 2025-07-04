import { fsBindings } from '@/Core/bindings';

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
      
      // Convert canvas to Blob and create a Blob URL
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to create blob"));
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        resolve(blobUrl);
      }, "image/png"); // Specify the output format
    };
    img.onerror = reject;
    img.src = base64Url;
  });
}

export class ImageCache {
  private static cache: { [key: string]: string } = {};

  public static async getRawImageUrl(
    folder: string,
    path: string,
    type: string) : Promise<string> {
    const cacheKey = `${folder}${path}`;
    if (!this.cache[cacheKey]) {
      const data = await fsBindings.getFile(folder, path);
      if (data instanceof ArrayBuffer) {
        // Convert WebP buffer to base64 data URL
        const blob = new Blob([data], { type });
        const imageUrl = URL.createObjectURL(blob);
        this.cache[cacheKey] = imageUrl;
      } else {
        this.cache[cacheKey] = ""; // Cache empty string if no data
      }
    }
    return this.cache[cacheKey] ?? "";
  }

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
      const data = await fsBindings.getFile(folder, path);
      if (data instanceof ArrayBuffer) {
        // Convert WebP buffer to base64 data URL
        const blob = new Blob([data], { type: 'image/webp' });
        const imageUrl = URL.createObjectURL(blob);
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
          this.cache[cacheKey] = await cropImage(imageUrl, cropX, cropY, cropWidth, cropHeight);
        } else {
          this.cache[cacheKey] = imageUrl;
        }
      } else {
        this.cache[cacheKey] = ""; // Cache empty string if no data
      }
    }
    return this.cache[cacheKey] ?? "";
  }
}

window.ImageCache = ImageCache; // Expose to global scope for debugging