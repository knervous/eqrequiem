// src/asc/loadASC.ts
let ascPromise: Promise<any> | null = null;
let binaryenInitialized = false;

export async function loadASC(): Promise<any> {
  // eslint-disable-next-line no-console
  console.log('Initializing asc');

  if (!binaryenInitialized) {
    try {
      await import('binaryen');
      binaryenInitialized = true;
    } catch (e) {
      throw new Error(
        [
          'AssemblyScript runtime compilation requires the optional peer dependency "binaryen".',
          'Install it with `npm i -D binaryen`, use `wasm: false`, or pass a precompiled module.',
          e instanceof Error ? e.message : String(e),
        ].join('\n')
      );
    }
  }

  // Gate concurrent ASC imports
  ascPromise ??= import('./prebundled.js')
    .then((m: any) => m?.default ?? m)
    .catch(e => {
      ascPromise = null;
      throw e;
    });

  return ascPromise;
}
