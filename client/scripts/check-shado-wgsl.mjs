import path from "node:path";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NullEngine, ShaderLanguage, ShaderStore } from "@babylonjs/core";
import {
  Finalize,
  Initialize,
  Process,
} from "@babylonjs/core/Engines/Processors/shaderProcessor.js";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext.js";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.js";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parentServer = createHttpServer();
const server = await createServer({
  configFile: false,
  root,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  resolve: {
    alias: [
      {
        find: "@knervous/shado",
        replacement: path.resolve(root, "../shader-object/src/index.ts"),
      },
      {
        find: "@bjs",
        replacement: path.resolve(root, "src/bjs/index.ts"),
      },
    ],
  },
  server: { hmr: { server: parentServer }, middlewareMode: true },
});

const engine = new NullEngine();
engine._isWebGPU = true;

async function preprocess(pair, defines = []) {
  const processor = new WebGPUShaderProcessorWGSL();
  const processingContext = new WebGPUShaderProcessingContext(
    ShaderLanguage.WGSL,
  );
  const common = {
    defines,
    indexParameters: {},
    shouldUseHighPrecisionShader: true,
    supportsUniformBuffers: true,
    shadersRepository: "",
    includesShadersStore: ShaderStore.IncludesShadersStoreWGSL,
    processor,
    version: "",
    platformName: "WEBGPU",
    processingContext,
    isNDCHalfZRange: true,
    useReverseDepthBuffer: false,
  };
  Initialize({ ...common, isFragment: false });
  const process = (source, isFragment) =>
    new Promise((resolve, reject) => {
      try {
        Process(
          source,
          { ...common, isFragment },
          (code) => resolve(code),
          engine,
        );
      } catch (error) {
        reject(error);
      }
    });
  return Finalize(await process(pair.vs, false), await process(pair.fs, true), {
    ...common,
    isFragment: false,
  });
}

try {
  const {
    RequiemEntityActor,
    RequiemEntityContainer,
    assertRequiemReducerAbi,
  } = await server.ssrLoadModule("/src/Game/Model/shado-entity-pool.ts");
  await server.ssrLoadModule("/src/Game/Model/entity-material.ts");

  // Exercise the same reducer/schema contract checked during entity-pool
  // initialization at character select.
  assertRequiemReducerAbi();

  const register = (schema) => {
    for (const field of Object.values(schema.structArrays)) {
      register(field.schema);
    }
    Object.assign(ShaderStore.IncludesShadersStoreWGSL, {
      [schema.name]: schema.emitHeaderStructWGSL(),
      [`${schema.name}Offsets`]: schema.emitOffsetsWGSL(),
      [`${schema.name}Storage`]: schema.emitWGSLStorage(),
    });
  };
  register(RequiemEntityActor.getSchema());
  register(RequiemEntityContainer.getSchema());

  for (const influencers of [4, 8]) {
    const definitions = [`#define NUM_BONE_INFLUENCERS ${influencers}`];
    const visible = await preprocess(
      {
        vs: ShaderStore.ShadersStoreWGSL.vatVertexShader,
        fs: ShaderStore.ShadersStoreWGSL.vatFragmentShader,
      },
      definitions,
    );
    const picking = await preprocess(
      {
        vs: ShaderStore.ShadersStoreWGSL.vatPickingVertexShader,
        fs: ShaderStore.ShadersStoreWGSL.vatPickingFragmentShader,
      },
      definitions,
    );

    for (const [name, pair] of Object.entries({ visible, picking })) {
      if (
        !pair.vertexCode.includes(
          "var<storage, read> requiemEntityContainerBuf",
        )
      ) {
        throw new Error(
          `${name}/${influencers} shader did not retain Requiem storage backing`,
        );
      }
      if (/#include|\battribute\b|\bvarying\b/.test(pair.vertexCode)) {
        throw new Error(
          `${name}/${influencers} vertex shader contains unprocessed declarations`,
        );
      }
    }
  }
  console.log(
    "Requiem native WGSL VAT and picking shaders preprocess successfully.",
  );
} finally {
  engine.dispose();
  await server.close();
}
