import * as core from "@babylonjs/core";
import { prepareSerializedBabylonScene } from "./babylon-file";

type CoreAPI = typeof import("@babylonjs/core");
type LoaderAPI = typeof import("@babylonjs/loaders/glTF/2.0");

const featureLoaders = {
  babylon: async () => {
    const [, loader] = await Promise.all([
      import("@babylonjs/core/Materials/colorCurves.js"),
      import(
        "@babylonjs/core/Loading/Plugins/babylonFileLoader.pure.js"
      ),
    ]);
    loader.RegisterBabylonFileLoader();
    return loader;
  },
  gltf: () => import("@babylonjs/loaders/glTF"),
  physics: async () => {
    const [joined, v2] = await Promise.all([
      import(
        "@babylonjs/core/Physics/joinedPhysicsEngineComponent.pure.js"
      ),
      import("@babylonjs/core/Physics/v2/physicsEngineComponent.pure.js"),
    ]);
    joined.RegisterJoinedPhysicsEngineComponent();
    v2.RegisterPhysicsV2PhysicsEngineComponent();
    return { ...joined, ...v2 };
  },
  gradientMaterial: () =>
    import("@babylonjs/materials/gradient/gradientMaterial"),
  serializers: () => import("@babylonjs/serializers"),
  inspector: () => import("@babylonjs/inspector"),
} as const;

export type BabylonFeature = keyof typeof featureLoaders;
export type BabylonFeatureModule<K extends BabylonFeature> = Awaited<
  ReturnType<(typeof featureLoaders)[K]>
>;

export type BabylonAPI = CoreAPI & LoaderAPI & {
  initialize(): Promise<void>;
  loadBabylonAssetContainer(
    bytes: ArrayBuffer,
    scene: CoreAPI["Scene"]["prototype"],
    options?: { name?: string; rootUrl?: string },
  ): Promise<CoreAPI["AssetContainer"]["prototype"]>;
  loadFeature<K extends BabylonFeature>(
    feature: K,
  ): Promise<BabylonFeatureModule<K>>;
  supportsFeature(feature: string): feature is BabylonFeature;
};

const featurePromises = new Map<BabylonFeature, Promise<unknown>>();
let initializePromise: Promise<void> | undefined;

const exportObject = {
  // The explicit core runtime is part of the baseline API and must exist as
  // soon as this namespace is imported. Shader modules register their source
  // at evaluation time, before the async feature initialization phase.
  ...core,

  async initialize() {
    initializePromise ??= (async () => {
      await Promise.all([
        exportObject.loadFeature("babylon"),
        exportObject.loadFeature("gltf"),
        exportObject.loadFeature("physics"),
        import("@babylonjs/core/Engines/Extensions/engine.query"),
        import("@babylonjs/core/Rendering/boundingBoxRenderer"),
      ]);
      if (!core.SceneLoader.IsPluginForExtensionAvailable(".babylon")) {
        throw new Error("Babylon .babylon file loader failed to register.");
      }
    })();
    await initializePromise;
  },

  async loadBabylonAssetContainer(
    bytes: ArrayBuffer,
    scene: CoreAPI["Scene"]["prototype"],
    options: { name?: string; rootUrl?: string } = {},
  ) {
    const loader = await exportObject.loadFeature("babylon");
    const label = options.name ?? "Babylon scene";
    const serializedScene = prepareSerializedBabylonScene(bytes, label);

    const container = loader.LoadAssetContainerFromSerializedScene(
      scene,
      serializedScene,
      options.rootUrl ?? "",
    );
    container.populateRootNodes();
    return container;
  },

  async loadFeature<K extends BabylonFeature>(
    feature: K,
  ): Promise<BabylonFeatureModule<K>> {
    let pending = featurePromises.get(feature) as
      | Promise<BabylonFeatureModule<K>>
      | undefined;
    if (!pending) {
      pending = featureLoaders[feature]().then((loaded) => {
        // Feature modules that publish constructors remain compatible with the
        // legacy namespace while staying outside the cold-start graph.
        Object.assign(exportObject, loaded);
        return loaded as BabylonFeatureModule<K>;
      });
      featurePromises.set(feature, pending);
    }
    return pending;
  },

  supportsFeature(feature: string): feature is BabylonFeature {
    return feature in featureLoaders;
  },
} as BabylonAPI;

if (import.meta.env.VITE_LOCAL_DEV === "true") {
  (window as unknown as { BABYLON: BabylonAPI }).BABYLON = exportObject;
}

export default exportObject;
