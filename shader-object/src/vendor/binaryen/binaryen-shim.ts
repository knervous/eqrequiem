// ESM wrapper that matches `binaryen` default export semantics
// and exposes an init you can await before loading ASC.
// Supports both Browser (gzipped WASM) and Node.js (native binaryen) environments.

import type createBinaryenType from './binaryen_wasm.js';

// Detect environment
const isNode = typeof process !== 'undefined' && process.versions?.node != null;

let _binaryen: any | undefined;
let _initPromise: Promise<any> | null = null;

// In-memory gzip → stream → instantiateStreaming (browser only)
function instantiateFromGzipBytes(
  gz: Uint8Array,
  imports: WebAssembly.Imports
): Promise<{ instance: WebAssembly.Instance; module: WebAssembly.Module }> {
  const input = new Response(gz as any).body;
  if (!input) throw new Error('Failed to create readable stream from gzipped WASM');
  const decompressed = input.pipeThrough(new (globalThis as any).DecompressionStream('gzip'));
  const resp = new Response(decompressed, {
    headers: { 'Content-Type': 'application/wasm' },
  });
  return WebAssembly.instantiateStreaming(resp, imports);
}

export async function initializeBinaryen(): Promise<any> {
  if (_binaryen) return _binaryen; // already ready
  if (_initPromise) return _initPromise; // in flight

  // Node.js: use native binaryen package
  if (isNode) {
    _initPromise = (async () => {
      try {
        // In Node, binaryen is a native module that's ready to use
        const binaryen = await import('binaryen');
        _binaryen = binaryen.default ?? binaryen;
        return _binaryen;
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('Error loading native binaryen in Node.js', err);
        _initPromise = null;
        throw err;
      }
    })();
    return _initPromise;
  }

  // Browser: use gzipped WASM (dynamic imports to avoid bundling in Node)
  _initPromise = (async () => {
    try {
      const { default: createBinaryen } = (await import('./binaryen_wasm.js')) as {
        default: typeof createBinaryenType;
      };
      const { default: wasmGz } = (await import('./binaryen_wasm.wasm.gz')) as {
        default: Uint8Array;
      };

      const mod = await createBinaryen({
        async instantiateWasm(info: WebAssembly.Imports, receive: Function) {
          const { instance, module } = await instantiateFromGzipBytes(wasmGz, info);
          return receive(instance, module); // hand off to Emscripten
        },
        locateFile: (p: string) => p,
      });

      // eslint-disable-next-line no-console
      console.log('Initialized Binaryen', mod);
      _binaryen = mod;
      return mod;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('Error initializing Binaryen', err);
      _initPromise = null;
      throw err;
    }
  })();

  return _initPromise;
}

// ✅ LIVE default export (not a snapshot):
// consumers importing `default` see the actual Binaryen object after init.
export { _binaryen as default };
