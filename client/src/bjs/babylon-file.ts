export type SerializedBabylonScene = Record<string, unknown> & {
  materials?: Array<{
    plugins?: Record<string, unknown>;
  }>;
};

export function prepareSerializedBabylonScene(
  bytes: ArrayBuffer,
  label = "Babylon scene",
): SerializedBabylonScene {
  let serializedScene: SerializedBabylonScene;
  try {
    serializedScene = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as SerializedBabylonScene;
  } catch (error) {
    throw new Error(`${label} is not valid uncompressed Babylon JSON`, {
      cause: error,
    });
  }

  // Babylon's serializer can persist this WebXR-only plugin on every PBR
  // material even though it has no effect in a normal scene. A Lite runtime
  // intentionally has no WebXR constructor, and Material._ParsePlugins
  // otherwise throws while trying to instantiate it.
  for (const material of serializedScene.materials ?? []) {
    if (material.plugins) {
      delete material.plugins.DepthSensingMaterialPlugin;
    }
  }

  return serializedScene;
}
