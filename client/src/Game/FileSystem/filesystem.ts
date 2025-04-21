import { godotBindings } from "@/godot/bindings";


export class FileSystem {
  static async getFileBytes(
    folderPath: string,
    fileName?: string,
  ): Promise<ArrayBuffer | undefined> {
    let buffer: ArrayBuffer | undefined;
    const bytes = await godotBindings.getFile?.(folderPath, fileName ?? '');
    if (bytes) {
      buffer = bytes;
    }
    
    return buffer;
  }
}
