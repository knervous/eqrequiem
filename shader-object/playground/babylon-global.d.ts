import type * as BabylonCore from '@babylonjs/core';

declare global {
  const BABYLON: typeof BabylonCore;

  namespace BABYLON {
    type ArcRotateCamera = BabylonCore.ArcRotateCamera;
    type Engine = BabylonCore.Engine;
    type Scene = BabylonCore.Scene;
  }
}

export {};
