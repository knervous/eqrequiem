// The EQ showcase intentionally VAT-bakes its vendored .glb.gz roster in the
// browser. Only schema wrappers remain precompiled; local and online demos now
// exercise exactly the same model-loading path.
export default {
  wrappers: {
    name: 'sandbox',
    outDir: 'sandbox/public/shado/preprocessed/wrappers',
    gzip: ['glsl', 'wgsl'],
    schemas: [
      {
        module: 'shado',
        export: 'ShadoInstanceContainer',
        initialize: {
          wasm: false,
          extra: { module: 'shado', export: 'TestClass' },
        },
      },
      {
        module: 'shado/msdf',
        export: 'NameplateData',
        initialize: { wasm: false },
      },
    ],
  },
  modelManifest: {
    outFile: 'sandbox/public/shado/preprocessed/models.json',
    models: [],
  },
  models: [],
};
