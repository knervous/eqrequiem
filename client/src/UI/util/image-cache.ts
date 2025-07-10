import { fsBindings } from '@/Core/bindings';

function cropImage(
  base64Url: string,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number,
  flipX: boolean = false,
  flipY: boolean = false,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d')!;
  
      // 1) figure out which src‐rect in the original image
      //    corresponds to your crop rect AFTER a full‐image flip:
      const srcX = flipX
        ? img.width - cropX - cropWidth
        : cropX;
      const srcY = flipY
        ? img.height - cropY - cropHeight
        : cropY;
  
      // 2) set up a flip‐only transform for the tiny cropped piece:
      ctx.resetTransform();
      // move origin to bottom/right corner of our small canvas if needed
      ctx.translate(flipX ? cropWidth : 0,
        flipY ? cropHeight : 0);
      // then flip
      ctx.scale(flipX ? -1 : 1,
        flipY ? -1 : 1);

      // 3) draw just that src‐rect from the big image into our small canvas
      ctx.drawImage(
        img,
        srcX, srcY, cropWidth, cropHeight, // ▶︎ source rectangle
        0, 0, cropWidth, cropHeight, // ▶︎ destination on our canvas
      );


      // Convert canvas to Blob and create a Blob URL
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'));
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        resolve(blobUrl);
      }, 'image/png'); // Specify the output format
    };
    img.onerror = reject;
    img.src = base64Url;
  });
}

export class ImageCache {
  private static cache: { [key: string]: Promise<string> } = {};

  public static async getRawImageUrl(
    folder: string,
    path: string,
    type: string,
  ): Promise<string> {
    const cacheKey = `${folder}${path}`;
    if (!this.cache[cacheKey]) {
      this.cache[cacheKey] = fsBindings
        .getFile(folder, path)
        .then((data) => {
          if (data instanceof ArrayBuffer) {
            // Convert WebP buffer to base64 data URL
            const blob = new Blob([data], { type });
            return URL.createObjectURL(blob);
          }
          return ''; // Return empty string if no data
        })
        .catch((err) => {
          console.error(`Error fetching image from ${folder}/${path}:`, err);
          return ''; // Return empty string on error
        });
    }
    return (await this.cache[cacheKey]) ?? '';
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
      this.cache[cacheKey] = new Promise<string>((res) => {
        fsBindings
          .getFile(folder, path)
          .then((data) => {
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
                  throw new Error(
                    'Crop parameters (cropX, cropY, cropWidth, cropHeight) must be provided when crop is true',
                  );
                }
                const flipX = false;
                let flipY = false;
                if (path.toLowerCase().includes('dragitem')) {
                  flipY = true;
                }
                res(cropImage(imageUrl, cropX, cropY, cropWidth, cropHeight, flipX, flipY));
              } else {
                res(imageUrl);
              }
            } else {
              res(''); // Resolve with empty string if no data
            }
          })
          .catch((err) => {
            console.error(`Error fetching image from ${folder}/${path}:`, err);
            res(''); // Resolve with empty string on error
          });
      });
    }
    return (await this.cache[cacheKey]) ?? '';
  }
}

window.ImageCache = ImageCache; // Expose to global scope for debugging
