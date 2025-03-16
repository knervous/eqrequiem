import * as pako from 'pako';
export default pako;
export * from 'pako';
export const deflate = pako.deflate;
export const inflate = pako.inflate;