import { FileAccess, OS, PackedByteArray } from "godot";
const localPrefix = "/Users/Paul/Documents/everquest_rof2/";

if (OS.has_feature("editor")) {
  try {
    // First, include your decodeUTF8 function:
    function decodeUTF8(buffer: ArrayBuffer) {
      const uint8 = new Uint8Array(buffer);
      let result = "";
      let i = 0;
      while (i < uint8.length) {
        const byte1 = uint8[i++];
        if (byte1 < 0x80) {
          result += String.fromCharCode(byte1);
        } else if ((byte1 & 0xe0) === 0xc0) {
          const byte2 = uint8[i++];
          const codePoint = ((byte1 & 0x1f) << 6) | (byte2 & 0x3f);
          result += String.fromCharCode(codePoint);
        } else if ((byte1 & 0xf0) === 0xe0) {
          const byte2 = uint8[i++];
          const byte3 = uint8[i++];
          const codePoint =
            ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f);
          result += String.fromCharCode(codePoint);
        } else if ((byte1 & 0xf8) === 0xf0) {
          const byte2 = uint8[i++];
          const byte3 = uint8[i++];
          const byte4 = uint8[i++];
          let codePoint =
            ((byte1 & 0x07) << 18) |
            ((byte2 & 0x3f) << 12) |
            ((byte3 & 0x3f) << 6) |
            (byte4 & 0x3f);
          codePoint -= 0x10000;
          const highSurrogate = (codePoint >> 10) + 0xd800;
          const lowSurrogate = (codePoint & 0x3ff) + 0xdc00;
          result += String.fromCharCode(highSurrogate, lowSurrogate);
        }
      }
      return result;
    }

    // Then, create the TextDecoder polyfill if it's not already defined:
    if (typeof TextDecoder === "undefined") {
      class TextDecoder {
        encoding = "";
        constructor(encoding = "utf-8") {
          if (encoding.toLowerCase() !== "utf-8") {
            throw new Error(
              "This TextDecoder shim only supports UTF-8 encoding.",
            );
          }
          this.encoding = encoding;
        }
        decode(buffer: ArrayBuffer) {
          // Assume buffer is an ArrayBuffer or a Uint8Array
          if (buffer instanceof Uint8Array) {
            // If it's a Uint8Array, extract the underlying buffer slice.
            buffer = buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            );
          }
          return decodeUTF8(buffer);
        }
      }
      // Expose the polyfill in the global scope
      globalThis.TextDecoder = TextDecoder;
    }
  } catch (e) {
    console.log("Error writing TextDecoder shim", e);
  }
}
declare const window: Window;

export class FileSystem {
  static async getFileBytes(
    fileName: string,
  ): Promise<ArrayBuffer | undefined> {
    let buffer: ArrayBuffer | undefined;
    if (OS.has_feature("editor")) {
      const file = FileAccess.open(
        `${localPrefix}${fileName}`,
        FileAccess.ModeFlags.READ,
      );
      if (file) {
        const size = file.get_length();
        const data: PackedByteArray = file.get_buffer(size);
        file.close();
        buffer = data.to_array_buffer();
      } else {
        console.log("Failed to open file:", fileName);
      }
    } else {
      const bytes = await window.getJsBytes?.(fileName);
      if (bytes) {
        buffer = bytes;
      }
    }
    
    return buffer;
  }
}
