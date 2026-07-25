import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  compileShadoWorld,
  importLegacyZoneMetadata,
  mergeLegacyZoneMetadata,
  validateShadoWorldAuthoring,
  type ShadoWorldCompileOptions,
  type ShadoWorldPrimitive,
} from '../world';
import { installNodeXMLHttpRequest } from './models';

const gunzipAsync = promisify(gunzip);
const gzipAsync = promisify(gzip);

export type ShadoWorldPackConfig = Omit<ShadoWorldCompileOptions, 'source'> & {
  input: string;
  outFile: string;
  runtimeSource?: string;
  copyInputTo?: string;
  /** Editable region sidecar compiled into the runtime spatial package. */
  authoringInput?: string;
  /** Original Requiem zone JSON promoted into authoring when no authored document exists. */
  metadataInput?: string;
  objectSourcePrefix?: string;
};

export type ShadoWorldPackResult = {
  name: string;
  input: string;
  outFile: string;
  primitiveCount: number;
  triangleCount: number;
  clusterCount: number;
  renderChunkCount: number;
  cellCount: number;
  portalCount: number;
  regionCount: number;
  objectPrototypeCount: number;
  objectStampCount: number;
  tileCount: number;
};

/** Imports a static GLB/GLB.GZ and emits reducer-friendly world spatial data. */
export async function packShadoWorld(config: ShadoWorldPackConfig): Promise<ShadoWorldPackResult> {
  if (!config.input) throw new Error(`World '${config.name}' requires input`);
  if (!config.outFile) throw new Error(`World '${config.name}' requires outFile`);
  const input = path.resolve(process.cwd(), config.input);
  const compressed = await fs.readFile(input);
  const glb = input.toLowerCase().endsWith('.gz') ? await gunzipAsync(compressed) : compressed;
  validateGlb(glb, input);
  // Spatial preprocessing never samples textures. Loading them here makes an
  // otherwise valid geometry migration fail on legacy exports with incomplete
  // image records (for example an image with neither URI nor bufferView).
  const primitives = await importWorldPrimitives(glb, worldGlbMaterialNames(glb));
  const authoringPath = config.authoringInput
    ? path.resolve(process.cwd(), config.authoringInput)
    : undefined;
  const metadataPath = config.metadataInput
    ? path.resolve(process.cwd(), config.metadataInput)
    : undefined;
  let authoring = authoringPath
    ? validateShadoWorldAuthoring(
        JSON.parse(await fs.readFile(authoringPath, 'utf8')),
        config.name
      )
    : config.metadataInput
      ? importLegacyZoneMetadata(
          JSON.parse(await fs.readFile(metadataPath!, 'utf8')),
          config.name,
          { objectSourcePrefix: config.objectSourcePrefix }
        )
    : config.authoring;
  if (authoringPath && metadataPath) {
    const before = JSON.stringify(authoring);
    authoring = mergeLegacyZoneMetadata(
      authoring,
      JSON.parse(await fs.readFile(metadataPath, 'utf8')),
      config.name,
      { objectSourcePrefix: config.objectSourcePrefix }
    );
    if (JSON.stringify(authoring) !== before) {
      authoring.revision++;
      await fs.writeFile(authoringPath, `${JSON.stringify(authoring, null, 2)}\n`);
    }
  }
  const world = compileShadoWorld(primitives, {
    name: config.name,
    source: config.runtimeSource ?? input,
    tileSize: config.tileSize,
    maxClusterTriangles: config.maxClusterTriangles,
    authoring,
  });
  const outFile = path.resolve(process.cwd(), config.outFile);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const payload = Buffer.from(`${JSON.stringify(world)}\n`);
  await fs.writeFile(
    outFile,
    outFile.endsWith('.gz') ? await gzipAsync(payload, { level: 9 }) : payload
  );
  if (config.copyInputTo) {
    const copyInputTo = path.resolve(process.cwd(), config.copyInputTo);
    await fs.mkdir(path.dirname(copyInputTo), { recursive: true });
    await fs.copyFile(input, copyInputTo);
  }
  return {
    name: config.name,
    input,
    outFile,
    primitiveCount: primitives.length,
    triangleCount: world.triangleCount,
    clusterCount: world.clusters.radius.length,
    renderChunkCount: world.renderChunks.primitive.length,
    cellCount: world.cells.kind.length,
    portalCount: world.portals.fromCell.length,
    regionCount: world.regions.id.length,
    objectPrototypeCount: world.objects?.prototypes.id.length ?? 0,
    objectStampCount: world.objects?.stamps.id.length ?? 0,
    tileCount: world.tiles.x.length,
  };
}

async function importWorldPrimitives(
  glb: Uint8Array,
  sourceMaterials: ReadonlyMap<string, string>
): Promise<ShadoWorldPrimitive[]> {
  installNodeXMLHttpRequest();
  const BABYLON = await import('@babylonjs/core');
  await installNodeDracoDecoder();
  await import('@babylonjs/loaders');
  const engine = new BABYLON.NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new BABYLON.Scene(engine);
  const url = `data:model/gltf-binary;base64,${Buffer.from(glb).toString('base64')}`;
  try {
    BABYLON.SceneLoader.OnPluginActivatedObservable.addOnce((plugin: any) => {
      if (plugin.name === 'gltf') plugin.skipMaterials = true;
    });
    const container = await BABYLON.LoadAssetContainerAsync(url, scene, {
      pluginExtension: '.glb',
    });
    container.addAllToScene();
    scene.rootNodes.forEach(node => node.computeWorldMatrix(true));
    const primitives: ShadoWorldPrimitive[] = [];
    for (const mesh of scene.meshes) {
      const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      if (!positions?.length || !indices?.length) continue;
      const matrix = mesh.computeWorldMatrix(true).m;
      const worldPositions = new Float32Array(positions.length);
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i],
          y = positions[i + 1],
          z = positions[i + 2];
        worldPositions[i] = x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12];
        worldPositions[i + 1] = x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13];
        worldPositions[i + 2] = x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14];
      }
      const subMeshes = mesh.subMeshes?.length
        ? mesh.subMeshes
        : [{ indexStart: 0, indexCount: indices.length, materialIndex: 0 }];
      for (let subIndex = 0; subIndex < subMeshes.length; subIndex++) {
        const subMesh = subMeshes[subIndex];
        const count = subMesh.indexCount - (subMesh.indexCount % 3);
        if (!count) continue;
        const material =
          sourceMaterials.get(mesh.name) ?? materialName(mesh.material, subMesh.materialIndex);
        primitives.push({
          name: `${mesh.name || mesh.id}#${subIndex}`,
          material,
          positions: worldPositions,
          indices: Uint32Array.from(indices.slice(subMesh.indexStart, subMesh.indexStart + count)),
        });
      }
    }
    if (!primitives.length) throw new Error('World GLB has no indexed triangle primitives');
    return primitives;
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

let nodeDracoDecoderInstallation: Promise<void> | undefined;

/**
 * Babylon defaults to downloading its Draco wrapper from the CDN. That path
 * uses the browser script loader and cannot run in the Node migration CLI.
 * Load the decoder and WASM already distributed with @babylonjs/core instead.
 */
export async function installNodeDracoDecoder(): Promise<void> {
  nodeDracoDecoderInstallation ??= (async () => {
    const require = createRequire(import.meta.url);
    const decoderModulePath = require.resolve(
      '@babylonjs/core/Meshes/Compression/dracoDecoder.js'
    );
    const dracoAssetDir = path.resolve(path.dirname(decoderModulePath), '../../assets/Draco');
    const wrapperPath = path.join(dracoAssetDir, 'draco_wasm_wrapper_gltf.js');
    const wasmPath = path.join(dracoAssetDir, 'draco_decoder_gltf.wasm');
    const [wrapperSource, wasmBytes] = await Promise.all([
      fs.readFile(wrapperPath, 'utf8'),
      fs.readFile(wasmPath),
    ]);

    const commonJsModule = { exports: {} as unknown };
    const evaluate = runInThisContext(
      `(function (exports, require, module, __filename, __dirname) {\n${wrapperSource}\n})`,
      { filename: wrapperPath }
    ) as (
      exports: unknown,
      require: NodeJS.Require,
      module: { exports: unknown },
      filename: string,
      dirname: string
    ) => void;
    evaluate(
      commonJsModule.exports,
      createRequire(wrapperPath),
      commonJsModule,
      wrapperPath,
      dracoAssetDir
    );
    if (typeof commonJsModule.exports !== 'function') {
      throw new Error(`Unable to initialize bundled Draco decoder at ${wrapperPath}`);
    }

    const { DracoDecoder } = await import(
      '@babylonjs/core/Meshes/Compression/dracoDecoder.js'
    );
    const wasmBinary = wasmBytes.buffer.slice(
      wasmBytes.byteOffset,
      wasmBytes.byteOffset + wasmBytes.byteLength
    );
    DracoDecoder.ResetDefault();
    DracoDecoder.DefaultConfiguration = {
      // Babylon requires these keys to select its WASM path. jsModule and
      // wasmBinary keep both resources local, so the URLs are never fetched.
      wasmUrl: wrapperPath,
      wasmBinaryUrl: wasmPath,
      wasmBinary,
      jsModule: commonJsModule.exports,
      numWorkers: 0,
    };
    await DracoDecoder.Default.whenReadyAsync();
  })();
  await nodeDracoDecoderInstallation;
}

function worldGlbMaterialNames(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== GLB_JSON_CHUNK || 20 + jsonLength > bytes.byteLength) {
    throw new Error('World GLB is missing its leading JSON chunk');
  }
  const gltf = JSON.parse(
    Buffer.from(bytes.subarray(20, 20 + jsonLength)).toString('utf8').trimEnd()
  ) as {
    nodes?: Array<{ name?: string; mesh?: number }>;
    meshes?: Array<{ primitives?: Array<{ material?: number }> }>;
    materials?: Array<{ name?: string }>;
  };
  const result = new Map<string, string>();
  gltf.nodes?.forEach((node, nodeIndex) => {
    if (node.mesh == null) return;
    const primitives = gltf.meshes?.[node.mesh]?.primitives ?? [];
    const nodeName = node.name || `node${nodeIndex}`;
    primitives.forEach((primitive, primitiveIndex) => {
      const meshName =
        primitives.length === 1 ? nodeName : `${nodeName}_primitive${primitiveIndex}`;
      const material = primitive.material == null
        ? '__default'
        : gltf.materials?.[primitive.material]?.name || `material-${primitive.material}`;
      result.set(meshName, material);
    });
  });
  return result;
}

function materialName(material: any, materialIndex: number): string {
  const selected = material?.subMaterials?.[materialIndex] ?? material;
  return selected?.name || selected?.id || '__default';
}

function validateGlb(bytes: Uint8Array, file: string) {
  if (bytes.byteLength < 20 || Buffer.from(bytes.subarray(0, 4)).toString('ascii') !== 'glTF') {
    throw new Error(`World input '${file}' is not a binary GLB`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error(`World input '${file}' has an invalid GLB header`);
  }
}

const GLB_JSON_CHUNK = 0x4e4f534a;

/**
 * Removes render-only texture payload references while retaining geometry,
 * material indices, and material names. Other GLB chunks are copied verbatim.
 */
export function sanitizeWorldGlbForGeometry(bytes: Uint8Array): Uint8Array {
  validateGlb(bytes, '<memory>');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  let foundJson = false;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const end = offset + 8 + length;
    if (end > bytes.byteLength) throw new Error('World GLB has a truncated chunk');
    if (type === GLB_JSON_CHUNK && !foundJson) {
      const source = Buffer.from(bytes.subarray(offset + 8, end)).toString('utf8').trimEnd();
      const gltf = JSON.parse(source) as {
        materials?: Array<Record<string, unknown>>;
        images?: unknown[];
        textures?: unknown[];
        samplers?: unknown[];
      };
      if (gltf.materials) {
        gltf.materials = gltf.materials.map(material =>
          typeof material.name === 'string' ? { name: material.name } : {}
        );
      }
      delete gltf.images;
      delete gltf.textures;
      delete gltf.samplers;
      const json = Buffer.from(JSON.stringify(gltf));
      const paddedLength = (json.byteLength + 3) & ~3;
      const chunk = Buffer.alloc(8 + paddedLength, 0x20);
      chunk.writeUInt32LE(paddedLength, 0);
      chunk.writeUInt32LE(GLB_JSON_CHUNK, 4);
      json.copy(chunk, 8);
      chunks.push(chunk);
      foundJson = true;
    } else {
      chunks.push(bytes.slice(offset, end));
    }
    offset = end;
  }
  if (!foundJson) throw new Error('World GLB is missing its JSON chunk');
  if (offset !== bytes.byteLength) throw new Error('World GLB has trailing partial chunk data');
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = Buffer.alloc(totalLength);
  Buffer.from(bytes.subarray(0, 12)).copy(output);
  output.writeUInt32LE(totalLength, 8);
  let writeOffset = 12;
  for (const chunk of chunks) {
    Buffer.from(chunk).copy(output, writeOffset);
    writeOffset += chunk.byteLength;
  }
  return output;
}
