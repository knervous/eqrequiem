import {
  createStorageBuffer,
  disposeStorageBuffer,
  setShaderStorageBuffer,
  updateStorageBuffer,
  type EngineContext,
  type ShaderMaterial,
  type StorageBuffer,
} from '@babylonjs/lite';

import {
  installShadoRendererAdapter,
  type ShadoRendererAdapter,
  type ShadoRendererBuffer,
} from '../renderer/ShadoRendererAdapter';

export function installBabylonLiteShadoRenderer(
  engine: EngineContext
): ShadoRendererAdapter {
  const adapter: ShadoRendererAdapter = {
    id: 'babylon-lite',
    isWebGPU: true,
    createStorageBuffer(byteLength, label): ShadoRendererBuffer {
      const size = Math.max(4, (byteLength + 3) & ~3);
      const native = createStorageBuffer(engine, new Uint8Array(size), label);
      return {
        byteLength: size,
        native,
        update(data, byteOffset = 0) {
          updateStorageBuffer(engine, native, data, byteOffset);
        },
        dispose() {
          disposeStorageBuffer(native);
        },
      };
    },
    bindStorageBuffer(target, name, buffer) {
      setShaderStorageBuffer(
        target as ShaderMaterial,
        name,
        buffer.native as StorageBuffer
      );
    },
    warn(message) {
      console.warn(`[Shado/Babylon Lite] ${message}`);
    },
  };
  return installShadoRendererAdapter(engine, adapter);
}

