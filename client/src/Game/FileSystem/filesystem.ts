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
}
