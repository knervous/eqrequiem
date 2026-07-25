import type { ShadoStructSchema } from '../schema/ShadoStructSchema';

export type ShadoShaderLanguage = 'glsl' | 'wgsl';

export interface ShadoRendererBuffer {
  readonly byteLength: number;
  readonly native: unknown;
  update(data: ArrayBufferView, byteOffset?: number): void;
  dispose(): void;
}

export interface ShadoRendererTexture {
  readonly native: unknown;
  update(data: Float32Array): void;
  dispose(): void;
}

/**
 * The deliberately small renderer boundary used by Shado's packed runtime.
 * It contains only resource and shader-registration operations; meshes,
 * scenes, materials, loading, UI, and effects stay in renderer-specific
 * packages so importing Shado core cannot pull an engine barrel into an app.
 */
export interface ShadoRendererAdapter {
  readonly id: 'babylon-lite' | 'babylonjs' | (string & {});
  readonly isWebGPU: boolean;
  createStorageBuffer(byteLength: number, label?: string): ShadoRendererBuffer;
  bindStorageBuffer(target: unknown, name: string, buffer: ShadoRendererBuffer): void;
  createDataTexture?(
    data: Float32Array,
    width: number,
    height: number,
    label?: string
  ): ShadoRendererTexture;
  bindDataTexture?(
    target: unknown,
    name: string,
    texture: ShadoRendererTexture
  ): void;
  setInt?(target: unknown, name: string, value: number): void;
  registerSchema?(schema: ShadoStructSchema): void;
  registerShader?(
    name: string,
    language: ShadoShaderLanguage,
    pair: { vs: string; fs: string }
  ): void;
  warn?(message: string): void;
}

const adapters = new WeakMap<object, ShadoRendererAdapter>();

export function installShadoRendererAdapter(
  engine: object,
  adapter: ShadoRendererAdapter
): ShadoRendererAdapter {
  const current = adapters.get(engine);
  if (current && current !== adapter && current.id !== adapter.id) {
    throw new Error(
      `Shado renderer already installed as ${current.id}; cannot replace it with ${adapter.id}.`
    );
  }
  adapters.set(engine, adapter);
  return adapter;
}

export function getShadoRendererAdapter(engine: object): ShadoRendererAdapter {
  const adapter = adapters.get(engine);
  if (!adapter) {
    throw new Error(
      'No Shado renderer adapter is installed for this engine. ' +
        'Use installBabylonShadoRenderer() or installBabylonLiteShadoRenderer() before constructing Shado data.'
    );
  }
  return adapter;
}

export function peekShadoRendererAdapter(
  engine: object
): ShadoRendererAdapter | undefined {
  return adapters.get(engine);
}

export async function ensureShadoRendererAdapter(
  engine: object
): Promise<ShadoRendererAdapter> {
  const current = adapters.get(engine);
  if (current) return current;

  const candidate = engine as any;
  // Lite's public EngineContext is plain data and owns a primary SurfaceContext;
  // Babylon.js engines expose getClassName()/isWebGPU. Keep this detection here
  // solely as a backwards-compatible initialization bridge; new applications
  // should install their selected adapter explicitly at the renderer gate.
  if (
    candidate?.surfaces &&
    candidate?.engine === candidate &&
    !candidate?.getClassName
  ) {
    const { installBabylonLiteShadoRenderer } = await import('../lite/adapter');
    return installBabylonLiteShadoRenderer(candidate);
  }

  const { installBabylonShadoRenderer } = await import('../babylon/adapter');
  return installBabylonShadoRenderer(candidate);
}
