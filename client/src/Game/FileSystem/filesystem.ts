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

  static async getFileJSON<T>(
    folderPath: string,
    fileName?: string,
  ): Promise<T | undefined> {
    const bytes = await this.getFileBytes(folderPath, fileName);
    if (!bytes) {
      return undefined;
    }
    
    try {
      const jsonString = new TextDecoder().decode(bytes);
      return JSON.parse(jsonString) as T;
    } catch (error) {
      console.error(`Failed to parse JSON from ${folderPath}/${fileName}:`, error);
      return undefined;
    }
  }
}
