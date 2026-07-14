import * as BABYLON_CORE from '@babylonjs/core';

export const BABYLON: typeof BABYLON_CORE = BABYLON_CORE;

export async function ensureBABYLON(): Promise<typeof BABYLON_CORE> {
  return BABYLON_CORE;
}

export function peekBABYLON(): typeof BABYLON_CORE {
  return BABYLON_CORE;
}

export * from '@babylonjs/core';
export type * from '@babylonjs/core';

