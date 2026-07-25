import * as BABYLON from '@babylonjs/core';

import type {
  ShadoRendererAdapter,
  ShadoRendererBuffer,
  ShadoRendererTexture,
} from '../renderer/ShadoRendererAdapter';
import { installShadoRendererAdapter } from '../renderer/ShadoRendererAdapter';
import { registerIncludesOnEngine } from '../includes/register';

export function installBabylonShadoRenderer(engine: any): ShadoRendererAdapter {
  const adapter: ShadoRendererAdapter = {
    id: 'babylonjs',
    isWebGPU:
      engine?.isWebGPU ??
      engine?._isWebGPU ??
      engine?.getClassName?.() === 'WebGPUEngine',
    createStorageBuffer(byteLength, label): ShadoRendererBuffer {
      const native = new BABYLON.StorageBuffer(
        engine,
        byteLength,
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
        label
      );
      return {
        byteLength,
        native,
        update(data, byteOffset = 0) {
          native.update(data, byteOffset);
        },
        dispose() {
          native.dispose();
        },
      };
    },
    bindStorageBuffer(target, name, buffer) {
      const destination = target as any;
      if (typeof destination?.setStorageBuffer === 'function') {
        destination.setStorageBuffer(name, buffer.native);
      } else {
        engine.setStorageBuffer(name, buffer.native);
      }
    },
    createDataTexture(data, width, height): ShadoRendererTexture {
      const native = new BABYLON.RawTexture(
        data,
        width,
        height,
        BABYLON.Engine.TEXTUREFORMAT_RGBA,
        engine,
        false,
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
        BABYLON.Engine.TEXTURETYPE_FLOAT
      );
      native.wrapU = native.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      return {
        native,
        update(next) {
          native.update(next);
        },
        dispose() {
          native.dispose();
        },
      };
    },
    bindDataTexture(target, name, texture) {
      (target as any).setTexture(name, texture.native);
    },
    setInt(target, name, value) {
      (target as any).setInt(name, value);
    },
    registerSchema(schema) {
      registerIncludesOnEngine(schema);
    },
    registerShader(name, language, pair) {
      if (language === 'wgsl') {
        BABYLON.ShaderStore.ShadersStoreWGSL[`${name}VertexShader`] = pair.vs;
        BABYLON.ShaderStore.ShadersStoreWGSL[`${name}FragmentShader`] = pair.fs;
      } else {
        BABYLON.Effect.ShadersStore[`${name}VertexShader`] = pair.vs;
        BABYLON.Effect.ShadersStore[`${name}FragmentShader`] = pair.fs;
      }
    },
    warn(message) {
      BABYLON.Logger.Warn(message);
    },
  };
  return installShadoRendererAdapter(engine, adapter);
}

