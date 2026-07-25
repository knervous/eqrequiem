export type RendererProviderFactory<
  TCore,
  TFeatures extends Record<string, unknown>,
> = () => Promise<RendererProvider<TCore, TFeatures>>;

export interface RendererProvider<
  TCore,
  TFeatures extends Record<string, unknown>,
> {
  readonly id: string;
  readonly core: TCore;
  readonly capabilities: ReadonlySet<keyof TFeatures>;
  readonly features: {
    readonly [K in keyof TFeatures]?: () => Promise<TFeatures[K]>;
  };
  dispose?(): void | Promise<void>;
}

export interface RendererGate<
  TRendererId extends string,
  TCore,
  TFeatures extends Record<string, unknown>,
> {
  readonly selected: TRendererId;
  loadCore(): Promise<TCore>;
  loadFeature<K extends keyof TFeatures>(feature: K): Promise<TFeatures[K]>;
  supports(feature: keyof TFeatures): Promise<boolean>;
  dispose(): Promise<void>;
}

/**
 * Typed, one-way renderer selection.
 *
 * The selected provider is the only renderer module fetched. Feature modules
 * are cached independently and remain behind explicit async boundaries, which
 * prevents a convenient barrel import from silently restoring every loader,
 * effect, serializer, inspector, and plugin to the cold-start graph.
 */
export function createRendererGate<
  TRendererId extends string,
  TCore,
  TFeatures extends Record<string, unknown>,
>(
  providers: Readonly<
    Record<TRendererId, RendererProviderFactory<TCore, TFeatures>>
  >,
  selected: TRendererId
): RendererGate<TRendererId, TCore, TFeatures> {
  let providerPromise: Promise<RendererProvider<TCore, TFeatures>> | undefined;
  const featurePromises = new Map<keyof TFeatures, Promise<unknown>>();

  const provider = () => {
    const factory = providers[selected];
    if (!factory) throw new Error(`Renderer provider "${selected}" is not registered.`);
    return (providerPromise ??= factory().then(loaded => {
      if (loaded.id !== selected) {
        throw new Error(
          `Renderer provider "${selected}" loaded mismatched implementation "${loaded.id}".`
        );
      }
      return loaded;
    }));
  };

  return {
    selected,
    async loadCore() {
      return (await provider()).core;
    },
    async loadFeature(feature) {
      const loaded = await provider();
      const loader = loaded.features[feature];
      if (!loader || !loaded.capabilities.has(feature)) {
        throw new Error(
          `Renderer "${selected}" does not support feature "${String(feature)}".`
        );
      }
      let promise = featurePromises.get(feature) as
        | Promise<TFeatures[typeof feature]>
        | undefined;
      if (!promise) {
        promise = loader();
        featurePromises.set(feature, promise);
      }
      return promise;
    },
    async supports(feature) {
      return (await provider()).capabilities.has(feature);
    },
    async dispose() {
      featurePromises.clear();
      const loaded = await providerPromise;
      await loaded?.dispose?.();
      providerPromise = undefined;
    },
  };
}

