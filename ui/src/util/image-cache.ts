import TgaLoader from 'tga-js';

const tga = new TgaLoader();


export class ImageCache {
  private static cache: { [key: string]: string } = {};
  public static getEQFile: (
    folder: string,
    path: string
  ) => Promise<ArrayBuffer | null>;

  public static async getImageUrl(
    folder: string,
    path: string
  ): Promise<string> {
    if (!this.cache[folder + path]) {
      if (!this.getEQFile) {
        throw new Error("getEQFile is not set");
      }
      const data = await this.getEQFile(folder, path);
      console.log('Folder', folder, path, data);
      if (data instanceof ArrayBuffer) {
        tga.load(new Uint8Array(data));
        this.cache[folder + path] = tga.getDataURL('image/png');
      }
    }
    return this.cache[folder + path] ?? "";
  }
}
