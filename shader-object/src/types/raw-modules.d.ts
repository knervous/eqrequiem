// src/types/raw-modules.d.ts
declare module '*.fx' {
  const source: string;
  export default source;
}
declare module '*.wgsl.fx' {
  const source: string;
  export default source;
}
declare module '*.glsl.fx' {
  const source: string;
  export default source;
}
declare module '*.wasm.gz' {
  const source: Uint8Array;
  export default source;
}
