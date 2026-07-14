// Paths are relative to serverjs/, where the shader-object bin is invoked.
const common = {
  inputPaths: ["assembly/zone-simulation.ts"],
  runtime: "stub",
  simd: true,
};

export default {
  asc: [
    {
      ...common,
      outFile: "src/zone/wasm/zone-simulation.release.wasm",
      textFile: "build/wasm/zone-simulation.release.wat",
      optimizeLevel: 3,
      shrinkLevel: 2,
      noAssert: true,
    },
    {
      ...common,
      outFile: "src/zone/wasm/zone-simulation.debug.wasm",
      textFile: "build/wasm/zone-simulation.debug.wat",
      sourceMap: true,
      debug: true,
      noAssert: false,
    },
    {
      inputPaths: ["../common/assembly/requiem-entity-reducer.ts"],
      outFile: "../common/wasm/requiem-entity-reducer.release.wasm",
      textFile: "build/wasm/requiem-entity-reducer.release.wat",
      runtime: "stub",
      simd: true,
      optimizeLevel: 3,
      shrinkLevel: 2,
      noAssert: true,
    },
    {
      inputPaths: ["../common/assembly/requiem-entity-reducer.ts"],
      outFile: "../common/wasm/requiem-entity-reducer.debug.wasm",
      textFile: "build/wasm/requiem-entity-reducer.debug.wat",
      runtime: "stub",
      simd: true,
      sourceMap: true,
      debug: true,
      noAssert: false,
    },
  ],
};
