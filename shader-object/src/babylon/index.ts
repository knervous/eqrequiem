import * as BABYLON_CORE from '@babylonjs/core';

export const BABYLON: typeof BABYLON_CORE = BABYLON_CORE;

/**
 * Make dynamically generated shaders visible to a second Babylon runtime.
 *
 * Babylon Playground exposes `BABYLON` globally while npm imports resolve to a
 * separate module instance. Both runtimes must share the same mutable shader
 * stores or generated Shado materials are mistaken for external `.fx` files.
 */
export function bridgeBabylonShaderStores(hostBabylon: typeof BABYLON_CORE): void {
  if (!hostBabylon || hostBabylon === BABYLON_CORE) return;

  const hostEffect = hostBabylon.Effect as any;
  const moduleEffect = BABYLON_CORE.Effect as any;
  const hostStore = (hostBabylon as any).ShaderStore;
  const moduleStore = (BABYLON_CORE as any).ShaderStore;

  for (const key of ['ShadersStore', 'IncludesShadersStore']) {
    const shared = hostStore?.[key] ?? hostEffect?.[key];
    if (!shared) continue;
    Object.assign(shared, moduleStore?.[key], moduleEffect?.[key]);
    if (hostStore) hostStore[key] = shared;
    if (hostEffect) hostEffect[key] = shared;
    if (moduleStore) moduleStore[key] = shared;
    if (moduleEffect) moduleEffect[key] = shared;
  }

  for (const key of ['ShadersStoreWGSL', 'IncludesShadersStoreWGSL']) {
    const shared = hostStore?.[key];
    if (!shared) continue;
    Object.assign(shared, moduleStore?.[key]);
    hostStore[key] = shared;
    if (moduleStore) moduleStore[key] = shared;
  }
}

export async function ensureBABYLON(): Promise<typeof BABYLON_CORE> {
  return BABYLON_CORE;
}

export function peekBABYLON(): typeof BABYLON_CORE {
  return BABYLON_CORE;
}

export * from '@babylonjs/core';
export type * from '@babylonjs/core';
