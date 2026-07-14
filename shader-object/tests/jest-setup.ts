// Mock browser APIs for NullEngine tests
import { TextDecoder, TextEncoder } from 'util';

// Mock FileReader for Babylon.js loader
global.FileReader = class FileReader {
  result: any;
  onload: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  
  abort() {
    // No-op for mock
  }
  
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      if (this.onload) {
        this.onload({ target: this });
      }
    }).catch((error) => {
      if (this.onerror) {
        this.onerror({ target: this, error });
      }
    });
  }
  
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((buffer) => {
      const uint8 = new Uint8Array(buffer);
      const base64 = Buffer.from(uint8).toString('base64');
      this.result = `data:${blob.type};base64,${base64}`;
      if (this.onload) {
        this.onload({ target: this });
      }
    }).catch((error) => {
      if (this.onerror) {
        this.onerror({ target: this, error });
      }
    });
  }
  
  readAsText(blob: Blob) {
    blob.text().then((text) => {
      this.result = text;
      if (this.onload) {
        this.onload({ target: this });
      }
    }).catch((error) => {
      if (this.onerror) {
        this.onerror({ target: this, error });
      }
    });
  }
} as any;

// Mock TextEncoder/TextDecoder
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = (blob: Blob) => {
  return `blob:mock-${Math.random().toString(36).substr(2, 9)}`;
};
global.URL.revokeObjectURL = () => {};
