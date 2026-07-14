const generatedReducerFiles = [
  {
    outFile: 'assembly/render-reducer.generated.ts',
    schemas: [
      {
        module: './dist/render/index.js',
        export: 'ShadoEntity2D',
        initialize: false,
      },
    ],
    records: [
      {
        module: './dist/render/index.js',
        export: 'ShadoDynamicEntityDeltaRecord',
      },
      {
        module: './dist/render/index.js',
        export: 'ShadoDynamicEntityExpirationRecord',
      },
    ],
  },
];

export default {
  asc: [
    {
      inputPaths: ['assembly/render-reducer.ts'],
      outFile: 'build/wasm/shado-dynamic-entity-reducer.wasm',
      generatedFiles: generatedReducerFiles,
      gzipFile: 'build/wasm/shado-dynamic-entity-reducer.wasm.gz',
      base64File: 'src/render/wasm/shado-dynamic-entity-reducer-wasm-gz-b64.ts',
      base64ExportName: 'SHADO_DYNAMIC_ENTITY_REDUCER_WASM_GZ_BASE64',
      base64Source: 'gzipFile',
      textFile: 'build/shado-dynamic-entity-reducer.wat',
      runtime: 'stub',
      optimizeLevel: 3,
      shrinkLevel: 2,
      noAssert: true,
      simd: true,
    },
    {
      inputPaths: ['assembly/render-reducer.ts'],
      outFile: 'build/wasm/shado-dynamic-entity-reducer.debug.wasm',
      generatedFiles: generatedReducerFiles,
      gzipFile: 'build/wasm/shado-dynamic-entity-reducer.debug.wasm.gz',
      base64File: 'src/render/wasm/shado-dynamic-entity-reducer-debug-wasm-gz-b64.ts',
      base64ExportName: 'SHADO_DYNAMIC_ENTITY_REDUCER_DEBUG_WASM_GZ_BASE64',
      base64Source: 'gzipFile',
      textFile: 'build/shado-dynamic-entity-reducer.debug.wat',
      sourceMap: true,
      debug: true,
      runtime: 'stub',
      noAssert: false,
      simd: true,
    },
  ],
};
