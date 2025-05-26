import { fsBindings } from "@/Core/bindings";


export class FileSystem {
  static async getFileBytes(
    folderPath: string,
    fileName?: string,
  ): Promise<ArrayBuffer | undefined> {
    let buffer: ArrayBuffer | undefined;
    const bytes = await fsBindings.getFile?.(folderPath, fileName ?? '');
    if (bytes) {
      buffer = bytes;
    }
    return buffer;
  }

  static async getFileJson(
    folderPath: string,
    fileName?: string,
  ): Promise<object | undefined> {
    const buffer = await this.getFileBytes(folderPath, fileName);
    if (!buffer) {
      console.warn(`No data found for ${folderPath}/${fileName}`);
      return {};
    }
    try {
      return JSON.parse(new TextDecoder().decode(buffer));
    } catch (error) {
      console.error(`Failed to parse JSON from ${folderPath}/${fileName}`, error);
      return {};
    }
  }
}
