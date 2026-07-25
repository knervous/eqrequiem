import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  asc: {
    inputPaths: [path.resolve(here, 'assembly/world-reducer.ts')],
    outFile: path.resolve(here, 'build/world-reducer.wasm'),
    textFile: path.resolve(here, 'build/world-reducer.wat'),
    base64File: path.resolve(here, '../src/world/world-reducer-wasm.generated.ts'),
    base64ExportName: 'SHADO_WORLD_REDUCER_WASM_BASE64',
    base64Source: 'outFile',
    runtime: 'stub',
    simd: true,
  },
};
