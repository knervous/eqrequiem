import fs from 'node:fs/promises';
import path from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { DQBuildOpts, SerializedDQVAT } from '../extensions/VATBuilder/VATBuilder';

const gzipAsync = promisify(gzip);

export type ShadoModelImportConfig =
  | {
      kind?: 'asset-container';
      url: string;
    }
  | {
      kind: 'scene-loader';
      rootUrl: string;
      fileName: string;
      meshNames?: string[];
    };

export type ShadoModelPackConfig = {
  name: string;
  outFile: string;
  import: ShadoModelImportConfig;
  meshName?: string;
  skeletonName?: string;
  includeAnimation?: boolean;
  serializeScene?: boolean;
  vat?: {
    variants?: Array<'float16' | 'float32'>;
    options?: DQBuildOpts;
  };
  artifacts?: {
    asm?: string;
    wgsl?: string;
    glsl?: string;
  };
  runtime?: {
    merge?: boolean;
    disposeOriginalMaterial?: boolean;
    replaceMaterial?: boolean;
  };
};

export type ShadoModelManifestConfig = {
  outFile: string;
  models: Array<
    Pick<ShadoModelPackConfig, 'name' | 'import' | 'runtime' | 'vat' | 'includeAnimation'> & {
      artifact?: string;
      vat16?: string;
      vat32?: string;
      asm?: string;
      wgsl?: string;
      glsl?: string;
    }
  >;
};

export type ShadoModelPackResult = {
  name: string;
  outFile: string;
  files: string[];
  vatVariants: string[];
  meshCount: number;
};

export type SerializedShadoModel = {
  kind: 'shado.model';
  version: 1;
  name: string;
  source: ShadoModelImportConfig;
  runtime?: ShadoModelPackConfig['runtime'];
  meshes: Array<{
    name: string;
    id: string;
    vertices: number;
    indices: number;
    skeleton?: string;
  }>;
  skeletons: Array<{ name: string; id: string; bones: number }>;
  scene?: unknown;
  artifacts: {
    vat16?: string;
    vat32?: string;
    asm?: string;
    wgsl?: string;
    glsl?: string;
  };
};

export async function packShadoModel(config: ShadoModelPackConfig): Promise<ShadoModelPackResult> {
  if (!config.name) throw new Error('Model pack requires name');
  if (!config.outFile) throw new Error(`Model pack '${config.name}' requires outFile`);

  installNodeXMLHttpRequest();
  const BABYLON = await import('@babylonjs/core');
  await import('@babylonjs/loaders');
  const { SceneSerializer } = await import('@babylonjs/core/Misc/sceneSerializer.js');
  const { VATBuilder } = await import('../extensions/VATBuilder/VATBuilder.js');

  const engine = new BABYLON.NullEngine({
    renderWidth: 256,
    renderHeight: 256,
    textureSize: 256,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new BABYLON.Scene(engine);
  new BABYLON.FreeCamera('__shado_preprocess_camera', BABYLON.Vector3.Zero(), scene);
  new BABYLON.HemisphericLight(
    '__shado_preprocess_light',
    new BABYLON.Vector3(0, 1, 0),
    scene
  );

  try {
    await importModel(BABYLON, scene, config.import);
    await scene.whenReadyAsync();

    const meshes = scene.meshes.filter(mesh => mesh.getTotalVertices() > 0);
    const targetMesh =
      (config.meshName ? meshes.find(mesh => mesh.name === config.meshName || mesh.id === config.meshName) : undefined) ??
      meshes[0];
    if (!targetMesh) throw new Error(`Model '${config.name}' did not load any renderable meshes`);

    const skeleton =
      (config.skeletonName
        ? scene.skeletons.find(s => s.name === config.skeletonName || s.id === config.skeletonName)
        : undefined) ??
      targetMesh.skeleton ??
      scene.skeletons[0];

    const vat: Record<string, SerializedDQVAT> = {};
    if (config.includeAnimation !== false) {
      if (!skeleton) {
        throw new Error(`Model '${config.name}' has no skeleton for DQ VAT preprocessing`);
      }
      const variants = config.vat?.variants?.length ? config.vat.variants : ['float16', 'float32'];
      for (const variant of variants) {
        const builder = VATBuilder.buildFromScene(scene as any, targetMesh as any, skeleton as any, {
          ...(config.vat?.options ?? {}),
          useHalfDQ: variant === 'float16',
          forceHalfDQ: variant === 'float16',
        });
        vat[variant] = builder.toSerialized();
      }
    }

    const outFile = normalizeModelOutFile(path.resolve(process.cwd(), config.outFile), config.name);
    const outDir = path.dirname(outFile);
    const stem = path.basename(outFile, '.model.json.gz');
    await fs.mkdir(outDir, { recursive: true });

    const artifactRefs: SerializedShadoModel['artifacts'] = { ...(config.artifacts ?? {}) };
    const files: string[] = [];
    for (const [variant, payload] of Object.entries(vat)) {
      const suffix = variant === 'float16' ? 'vat16' : 'vat32';
      const fileName = `${stem}.${suffix}.json.gz`;
      const file = path.join(outDir, fileName);
      await writeGzipJson(file, payload);
      files.push(file);
      if (variant === 'float16') artifactRefs.vat16 = fileName;
      if (variant === 'float32') artifactRefs.vat32 = fileName;
    }

    const serialized: SerializedShadoModel = {
      kind: 'shado.model',
      version: 1,
      name: config.name,
      source: config.import,
      runtime: config.runtime,
      meshes: meshes.map(mesh => ({
        name: mesh.name,
        id: mesh.id,
        vertices: mesh.getTotalVertices(),
        indices: mesh.getTotalIndices(),
        skeleton: mesh.skeleton?.name,
      })),
      skeletons: scene.skeletons.map(skeleton => ({
        name: skeleton.name,
        id: skeleton.id,
        bones: skeleton.bones.length,
      })),
      artifacts: artifactRefs,
    };

    if (config.serializeScene ?? true) {
      serialized.scene = await SceneSerializer.SerializeAsync(scene);
    }

    await writeGzipJson(outFile, serialized);
    files.unshift(outFile);

    return {
      name: config.name,
      outFile,
      files,
      vatVariants: Object.keys(vat),
      meshCount: meshes.length,
    };
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

export async function writeShadoModelManifest(config: ShadoModelManifestConfig): Promise<string> {
  if (!config.outFile) throw new Error('Model manifest requires outFile');
  const outFile = path.resolve(process.cwd(), config.outFile);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const manifest = {
    kind: 'shado.model.manifest',
    version: 1,
    models: Object.fromEntries(
      config.models.map(model => [
        model.name,
        {
          name: model.name,
          import: model.import,
          runtime: model.runtime,
          includeAnimation: model.includeAnimation ?? true,
          vat: model.vat,
          artifacts: {
            model: model.artifact ?? `models/${model.name}.model.json.gz`,
            vat16: model.vat16 ?? `models/${model.name}.vat16.json.gz`,
            vat32: model.vat32 ?? `models/${model.name}.vat32.json.gz`,
            asm: model.asm,
            wgsl: model.wgsl,
            glsl: model.glsl,
          },
        },
      ])
    ),
  };
  await fs.writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return outFile;
}

async function writeGzipJson(file: string, payload: unknown) {
  const json = `${JSON.stringify(payload)}\n`;
  const compressed = await gzipAsync(Buffer.from(json, 'utf8'), { level: 9 });
  await fs.writeFile(file, compressed);
}

function normalizeModelOutFile(outFile: string, name: string): string {
  if (outFile.endsWith('.model.json.gz')) return outFile;
  if (outFile.endsWith('.shado-model.json')) return outFile.replace(/\.shado-model\.json$/, '.model.json.gz');
  if (outFile.endsWith('.json')) return outFile.replace(/\.json$/, '.model.json.gz');
  if (outFile.endsWith('/')) return path.join(outFile, `${name}.model.json.gz`);
  return outFile;
}

async function importModel(BABYLON: typeof import('@babylonjs/core'), scene: any, source: ShadoModelImportConfig) {
  if ('url' in source) {
    const container = await BABYLON.LoadAssetContainerAsync(source.url, scene, undefined);
    container.addAllToScene();
    return;
  }
  await BABYLON.SceneLoader.ImportMeshAsync(
    source.meshNames ?? '',
    source.rootUrl,
    source.fileName,
    scene
  );
}

function installNodeXMLHttpRequest() {
  if (typeof (globalThis as any).XMLHttpRequest !== 'undefined') return;

  type Listener = (event?: any) => void;

  class FetchXMLHttpRequest {
    public readyState = 0;
    public status = 0;
    public statusText = '';
    public response: any = null;
    public responseText = '';
    public responseType: XMLHttpRequestResponseType = '';
    public responseURL = '';
    public timeout = 0;
    public withCredentials = false;
    public onreadystatechange: Listener | null = null;
    public onload: Listener | null = null;
    public onerror: Listener | null = null;
    public onprogress: Listener | null = null;
    public onabort: Listener | null = null;
    public upload = {};

    private _method = 'GET';
    private _url = '';
    private _headers = new Map<string, string>();
    private _responseHeaders = new Map<string, string>();
    private _listeners = new Map<string, Set<Listener>>();
    private _controller: AbortController | undefined;

    open(method: string, url: string) {
      this._method = method;
      this._url = url;
      this.responseURL = url;
      this._setReadyState(1);
    }

    setRequestHeader(name: string, value: string) {
      this._headers.set(name, value);
    }

    getResponseHeader(name: string) {
      return this._responseHeaders.get(name.toLowerCase()) ?? null;
    }

    getAllResponseHeaders() {
      return [...this._responseHeaders.entries()].map(([k, v]) => `${k}: ${v}`).join('\r\n');
    }

    addEventListener(type: string, listener: Listener) {
      const listeners = this._listeners.get(type) ?? new Set<Listener>();
      listeners.add(listener);
      this._listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: Listener) {
      this._listeners.get(type)?.delete(listener);
    }

    async send(body?: BodyInit | null) {
      this._controller = new AbortController();
      try {
        const response = await fetch(this._url, {
          method: this._method,
          headers: Object.fromEntries(this._headers),
          body,
          signal: this._controller.signal,
        });
        this.status = response.status;
        this.statusText = response.statusText;
        response.headers.forEach((value, key) => this._responseHeaders.set(key.toLowerCase(), value));
        this._setReadyState(2);

        const arrayBuffer = await response.arrayBuffer();
        this._setReadyState(3);
        if (this.responseType === 'arraybuffer') {
          this.response = arrayBuffer;
        } else if (this.responseType === 'blob') {
          this.response = new Blob([arrayBuffer], {
            type: response.headers.get('content-type') ?? undefined,
          });
        } else {
          this.responseText = new TextDecoder().decode(arrayBuffer);
          this.response = this.responseText;
        }
        this._dispatch('progress', { loaded: arrayBuffer.byteLength, total: arrayBuffer.byteLength });
        this._setReadyState(4);
        this.onload?.();
        this._dispatch('load');
        this._dispatch('loadend');
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          this.onabort?.(error);
          this._dispatch('abort', error);
        } else {
          this.onerror?.(error);
          this._dispatch('error', error);
        }
        this._dispatch('loadend');
      }
    }

    abort() {
      this._controller?.abort();
    }

    private _setReadyState(state: number) {
      this.readyState = state;
      this.onreadystatechange?.();
      this._dispatch('readystatechange');
    }

    private _dispatch(type: string, event?: any) {
      this._listeners.get(type)?.forEach(listener => listener(event));
    }
  }

  (globalThis as any).XMLHttpRequest = FetchXMLHttpRequest;
}
