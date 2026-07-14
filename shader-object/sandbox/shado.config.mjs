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
    models: [
      {
        name: 'barbarian',
        import: {
          kind: 'asset-container',
          url: 'https://eqrequiem.blob.core.windows.net/dev/barbarian_1.glb',
        },
        runtime: {
          merge: true,
          replaceMaterial: true,
          disposeOriginalMaterial: false,
        },
        vat: {
          variants: ['float16', 'float32'],
          options: {
            useHalfDQ: true,
          },
        },
        artifact: 'models/barbarian.model.json.gz',
      },
      {
        name: 'arr',
        import: {
          kind: 'scene-loader',
          rootUrl: 'https://raw.githubusercontent.com/RaggarDK/Baby/baby/',
          fileName: 'arr.babylon',
        },
        runtime: {
          merge: false,
          replaceMaterial: true,
          disposeOriginalMaterial: false,
        },
        vat: {
          variants: ['float16', 'float32'],
          options: {
            useHalfDQ: true,
            defaultFPS: 30,
            manualAnimationRanges: [
              { from: 0, to: 33, name: 'Animation_0' },
              { from: 33, to: 61, name: 'Animation_1' },
              { from: 63, to: 91, name: 'Animation_2' },
              { from: 93, to: 130, name: 'Animation_3' },
            ],
          },
        },
        artifact: 'models/arr.model.json.gz',
      },
    ],
  },
  models: [
    {
      name: 'barbarian',
      outFile: 'sandbox/public/shado/preprocessed/models/barbarian.model.json.gz',
      import: {
        kind: 'asset-container',
        url: 'https://eqrequiem.blob.core.windows.net/dev/barbarian_1.glb',
      },
      runtime: {
        merge: true,
        replaceMaterial: true,
        disposeOriginalMaterial: false,
      },
      vat: {
        variants: ['float16', 'float32'],
        options: {
          useHalfDQ: true,
        },
      },
    },
    {
      name: 'arr',
      outFile: 'sandbox/public/shado/preprocessed/models/arr.model.json.gz',
      import: {
        kind: 'scene-loader',
        rootUrl: 'https://raw.githubusercontent.com/RaggarDK/Baby/baby/',
        fileName: 'arr.babylon',
      },
      runtime: {
        merge: false,
        replaceMaterial: true,
        disposeOriginalMaterial: false,
      },
      vat: {
        variants: ['float16', 'float32'],
        options: {
          useHalfDQ: true,
          defaultFPS: 30,
          manualAnimationRanges: [
            { from: 0, to: 33, name: 'Animation_0' },
            { from: 33, to: 61, name: 'Animation_1' },
            { from: 63, to: 91, name: 'Animation_2' },
            { from: 93, to: 130, name: 'Animation_3' },
          ],
        },
      },
    },
  ],
};
