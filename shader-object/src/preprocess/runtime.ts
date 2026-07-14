import type { SerializedDQVAT } from '../extensions/VATBuilder/VATBuilder';

export type ShadoModelArtifactMap = {
  model?: string | null;
  vat16?: string | null;
  vat32?: string | null;
  asm?: string | null;
  wgsl?: string | null;
  glsl?: string | null;
};

export type ShadoModelImportSource =
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

export type ShadoModelManifestEntry = {
  name: string;
  import: ShadoModelImportSource;
  runtime?: {
    merge?: boolean;
    replaceMaterial?: boolean;
    disposeOriginalMaterial?: boolean;
  };
  includeAnimation?: boolean;
  vat?: {
    variants?: Array<'float16' | 'float32'>;
    options?: unknown;
  };
  artifacts?: ShadoModelArtifactMap;
};

export type ShadoModelManifestDocument = {
  kind: 'shado.model.manifest';
  version: number;
  models: Record<string, ShadoModelManifestEntry>;
};

export type ShadoPackedModel = {
  kind: 'shado.model';
  version: number;
  name?: string;
  source?: ShadoModelImportSource;
  scene?: unknown;
  runtime?: ShadoModelManifestEntry['runtime'];
  artifacts?: Omit<ShadoModelArtifactMap, 'model'>;
};

export type ShadoVatSelection = 'auto' | 'float16' | 'float32' | false;
export type ShadoShaderSelection = false | true | 'glsl' | 'wgsl' | Array<'glsl' | 'wgsl'>;

export type ShadoDeserializeRequest = {
  manifest?: ShadoModelManifestDocument;
  manifestUrl?: string;
  modelName?: string;
  model?: ShadoModelManifestEntry;
  modelUrl?: string;
  baseUrl?: string;
};

export type ShadoDeserializeOptions = {
  animation?: boolean;
  vat?: ShadoVatSelection;
  reducers?: boolean;
  shaders?: ShadoShaderSelection;
  gpu?: {
    textureHalfFloat?: boolean;
  };
  fetch?: typeof fetch;
};

export type ShadoDeserializedModel = {
  manifest?: ShadoModelManifestDocument;
  manifestModel?: ShadoModelManifestEntry;
  model?: ShadoPackedModel;
  modelUrl?: string;
  vat?: SerializedDQVAT;
  vatVariant?: 'float16' | 'float32';
  vatUrl?: string;
  wasm?: ArrayBuffer;
  wasmUrl?: string;
  wgsl?: string;
  wgslUrl?: string;
  glsl?: string;
  glslUrl?: string;
  artifacts: {
    model?: string;
    vat16?: string;
    vat32?: string;
    asm?: string;
    wgsl?: string;
    glsl?: string;
  };
};

export async function deserializeShadoModel(
  request: ShadoDeserializeRequest,
  options: ShadoDeserializeOptions = {}
): Promise<ShadoDeserializedModel> {
  const fetcher = getFetch(options.fetch);
  const manifest =
    request.manifest ??
    (request.manifestUrl
      ? await fetchShadoJson<ShadoModelManifestDocument>(request.manifestUrl, { fetch: fetcher })
      : undefined);
  const manifestBase = request.baseUrl ?? (request.manifestUrl ? shadoDirectoryUrl(request.manifestUrl) : undefined);
  const manifestModel =
    request.model ??
    (request.modelName && manifest ? manifest.models[request.modelName] : undefined);
  const modelRef = request.modelUrl ?? manifestModel?.artifacts?.model;
  const modelUrl = modelRef ? resolveShadoArtifactUrl(modelRef, request.modelUrl ? request.baseUrl : manifestBase) : undefined;
  const model = modelUrl
    ? await fetchShadoJson<ShadoPackedModel>(modelUrl, { fetch: fetcher })
    : undefined;
  const modelBase = modelUrl ? shadoDirectoryUrl(modelUrl) : manifestBase;

  const artifacts = {
    model: modelUrl,
    vat16: resolveArtifact('vat16', manifestModel?.artifacts, manifestBase, model?.artifacts, modelBase),
    vat32: resolveArtifact('vat32', manifestModel?.artifacts, manifestBase, model?.artifacts, modelBase),
    asm: resolveArtifact('asm', manifestModel?.artifacts, manifestBase, model?.artifacts, modelBase),
    wgsl: resolveArtifact('wgsl', manifestModel?.artifacts, manifestBase, model?.artifacts, modelBase),
    glsl: resolveArtifact('glsl', manifestModel?.artifacts, manifestBase, model?.artifacts, modelBase),
  };

  const result: ShadoDeserializedModel = {
    manifest,
    manifestModel,
    model,
    modelUrl,
    artifacts,
  };

  const vatChoice = chooseVatArtifact(artifacts, options);
  if (vatChoice) {
    result.vat = await fetchShadoJson<SerializedDQVAT>(vatChoice.url, { fetch: fetcher });
    result.vatVariant = vatChoice.variant;
    result.vatUrl = vatChoice.url;
  }

  if (options.reducers && artifacts.asm) {
    result.wasm = await fetchShadoBytes(artifacts.asm, { fetch: fetcher });
    result.wasmUrl = artifacts.asm;
  }

  const shaders = normalizeShaderSelection(options.shaders ?? false);
  if (shaders.has('wgsl') && artifacts.wgsl) {
    result.wgsl = await fetchShadoText(artifacts.wgsl, { fetch: fetcher });
    result.wgslUrl = artifacts.wgsl;
  }
  if (shaders.has('glsl') && artifacts.glsl) {
    result.glsl = await fetchShadoText(artifacts.glsl, { fetch: fetcher });
    result.glslUrl = artifacts.glsl;
  }

  return result;
}

export async function fetchShadoJson<T>(
  url: string,
  options: { fetch?: typeof fetch } = {}
): Promise<T> {
  return JSON.parse(await fetchShadoText(url, options)) as T;
}

export async function fetchShadoText(
  url: string,
  options: { fetch?: typeof fetch } = {}
): Promise<string> {
  const bytes = await fetchShadoBytes(url, options);
  return new TextDecoder().decode(bytes);
}

export async function fetchShadoBytes(
  url: string,
  options: { fetch?: typeof fetch } = {}
): Promise<ArrayBuffer> {
  const response = await getFetch(options.fetch)(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch '${url}': ${response.status} ${response.statusText}`);
  }
  const bytes = await response.arrayBuffer();
  if (!url.endsWith('.gz')) return bytes;
  return gunzipBrowser(bytes, url);
}

export function resolveShadoArtifactUrl(ref: string, baseUrl?: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('blob:')) {
    return ref;
  }
  const base = normalizeBaseUrl(baseUrl ?? globalThis.location?.href);
  if (!base) return ref;
  try {
    return new URL(ref, base).href;
  } catch {
    return joinPathLike(base, ref);
  }
}

export function shadoDirectoryUrl(url: string): string {
  const base = normalizeBaseUrl(globalThis.location?.href);
  if (!base && !/^(?:[a-z]+:)?\/\//i.test(url)) {
    return url.endsWith('/') ? url : url.slice(0, url.lastIndexOf('/') + 1);
  }
  const resolved = new URL(url, base);
  if (url.endsWith('/')) return resolved.href;
  const lastSlash = resolved.pathname.lastIndexOf('/');
  resolved.pathname = lastSlash >= 0 ? resolved.pathname.slice(0, lastSlash + 1) : '/';
  resolved.search = '';
  resolved.hash = '';
  return resolved.href;
}

export function getBabylonSceneDataUrl(model: ShadoPackedModel): string | undefined {
  return model.scene ? `data:${JSON.stringify(model.scene)}` : undefined;
}

function resolveArtifact(
  key: keyof Omit<ShadoModelArtifactMap, 'model'>,
  manifestArtifacts?: ShadoModelArtifactMap,
  manifestBase?: string,
  modelArtifacts?: Omit<ShadoModelArtifactMap, 'model'>,
  modelBase?: string
): string | undefined {
  const manifestRef = manifestArtifacts?.[key];
  if (manifestRef) return resolveShadoArtifactUrl(manifestRef, manifestBase);
  const modelRef = modelArtifacts?.[key];
  if (modelRef) return resolveShadoArtifactUrl(modelRef, modelBase);
  return undefined;
}

function chooseVatArtifact(
  artifacts: ShadoDeserializedModel['artifacts'],
  options: ShadoDeserializeOptions
): { variant: 'float16' | 'float32'; url: string } | undefined {
  if (options.animation === false || options.vat === false) return undefined;
  const preferred = options.vat ?? 'auto';
  if (preferred === 'float16') {
    return artifacts.vat16
      ? { variant: 'float16', url: artifacts.vat16 }
      : artifacts.vat32
        ? { variant: 'float32', url: artifacts.vat32 }
        : undefined;
  }
  if (preferred === 'float32') {
    return artifacts.vat32
      ? { variant: 'float32', url: artifacts.vat32 }
      : artifacts.vat16
        ? { variant: 'float16', url: artifacts.vat16 }
        : undefined;
  }
  return options.gpu?.textureHalfFloat && artifacts.vat16
    ? { variant: 'float16', url: artifacts.vat16 }
    : artifacts.vat32
      ? { variant: 'float32', url: artifacts.vat32 }
      : artifacts.vat16
        ? { variant: 'float16', url: artifacts.vat16 }
        : undefined;
}

function normalizeShaderSelection(value: ShadoShaderSelection): Set<'glsl' | 'wgsl'> {
  if (!value) return new Set();
  if (value === true) return new Set(['glsl', 'wgsl']);
  return new Set(Array.isArray(value) ? value : [value]);
}

function getFetch(fetcher?: typeof fetch): typeof fetch {
  const next = fetcher ?? globalThis.fetch;
  if (!next) throw new Error('deserializeShadoModel requires fetch');
  return next.bind(globalThis);
}

async function gunzipBrowser(bytes: ArrayBuffer, url: string): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(`Cannot decompress '${url}': this runtime does not expose DecompressionStream`);
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  if (/^(?:[a-z]+:)?\/\//i.test(baseUrl) || baseUrl.startsWith('data:') || baseUrl.startsWith('blob:')) {
    return baseUrl;
  }
  const locationHref = globalThis.location?.href;
  return locationHref ? new URL(baseUrl, locationHref).href : baseUrl;
}

function joinPathLike(base: string, ref: string): string {
  if (ref.startsWith('/')) return ref;
  return `${base.endsWith('/') ? base : `${base}/`}${ref}`;
}
