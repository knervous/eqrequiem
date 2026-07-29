import {
  Effect,
  ShaderStore,
  type AbstractEngine,
  type Quaternion,
  type Vector3,
  type Vector4,
} from "@babylonjs/core";
import type * as BJS from "@babylonjs/core";
import {
  ShadoActor,
  ShadoInstanceContainer,
  field,
  gpuStruct,
} from "@knervous/shado";
import requiemEntityReducerDebugUrl from "../../../../common/wasm/requiem-entity-reducer.debug.wasm?url";
import requiemEntityReducerReleaseUrl from "../../../../common/wasm/requiem-entity-reducer.release.wasm?url";
import type { RequiemEntityVisibilitySink } from "./requiem-entity-visibility";

/**
 * The client-side view of the shared entity record. All hot render state lives
 * in Shado's packed AoS arena; Babylon nodes and physics bodies are adapters.
 */
@gpuStruct({ name: "RequiemEntityActor", useWasm: true })
export class RequiemEntityActor extends ShadoActor {
  @field("u32") entityId!: number;
  @field("u32") stateFlags!: number;
  @field("u32") appearanceOffset!: number;
  @field("u32") appearanceCount!: number;

  public override initialize(): void {
    super.initialize();
    this.entityId = 0;
    this.stateFlags = 0;
    this.appearanceOffset = 0;
    this.appearanceCount = 0;
  }
}

export const REQUIEM_ACTOR_ACTIVE = 1 << 0;
export const REQUIEM_ACTOR_SELECTED = 1 << 1;

@gpuStruct({ name: "RequiemEntityContainer", useWasm: true })
export class RequiemEntityContainer extends ShadoInstanceContainer<RequiemEntityActor> {
  @field({ arrayOf: "vec4" }) appearance!: Float32Array;

  public ensureAppearanceCount(count: number): void {
    const current = this.getVarArrayCount("appearance");
    if (current >= count) return;
    this.resizeVarArray("appearance", count);
  }

  public setAppearance(index: number, value: ArrayLike<number>): void {
    this.ensureAppearanceCount(index + 1);
    this.writeVarArrayRange("appearance", index, value);
  }
}

let initializedEngine: BJS.AbstractEngine | undefined;
let initialization: Promise<void> | undefined;
let reducerArtifact: Promise<ArrayBuffer> | undefined;

function decodeInlineArtifact(url: string): ArrayBuffer | undefined {
  if (!url.startsWith("data:")) return undefined;
  const comma = url.indexOf(",");
  if (comma < 0) throw new Error("Malformed inline Requiem reducer URL");
  const metadata = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  if (!metadata.endsWith(";base64")) {
    return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function loadRequiemEntityReducer(): Promise<ArrayBuffer> {
  assertRequiemReducerAbi();
  const url = import.meta.env.DEV
    ? requiemEntityReducerDebugUrl
    : requiemEntityReducerReleaseUrl;
  reducerArtifact ??= Promise.resolve(decodeInlineArtifact(url)).then(
    async (inline) => {
      if (inline) return inline;
      const response = await fetch(url).catch((error: unknown) => {
        throw new Error(
          `Unable to fetch the Requiem reducer at ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      if (!response.ok) {
        throw new Error(
          `Unable to load precompiled Requiem reducer: ${response.status} ${response.statusText}`,
        );
      }
      return response.arrayBuffer();
    },
  );
  return reducerArtifact;
}

export function assertRequiemReducerAbi(): void {
  const schema = RequiemEntityActor.getSchema();
  if (schema.headerFloatCount !== 32) {
    throw new Error(
      `Requiem reducer ABI expected 32 actor floats, got ${schema.headerFloatCount}`,
    );
  }
  const translation = schema.fields.find(
    (candidate) => candidate.name === "translation",
  );
  if (translation?.headerFloatOffset !== 0) {
    throw new Error(
      `Requiem reducer ABI mismatch for translation: expected 0, got ${translation?.headerFloatOffset}`,
    );
  }
}

function registerClientShaderIncludes(): void {
  const register = (
    schema: ReturnType<typeof RequiemEntityActor.getSchema>,
  ) => {
    for (const field of Object.values(schema.structArrays))
      register(field.schema);
    const chunks = {
      [schema.name]: schema.emitHeaderStruct(),
      [`${schema.name}Offsets`]: schema.emitOffsets(),
      [`${schema.name}Storage`]: schema.emitGLSLStorage(0, 0),
    };
    const wgslChunks = {
      [schema.name]: schema.emitHeaderStructWGSL(),
      [`${schema.name}Offsets`]: schema.emitOffsetsWGSL(),
      [`${schema.name}Storage`]: schema.emitWGSLStorage(),
    };
    Object.assign(Effect.IncludesShadersStore, chunks);
    Object.assign(ShaderStore.IncludesShadersStore, chunks);
    Object.assign(ShaderStore.IncludesShadersStoreWGSL, wgslChunks);
  };
  register(RequiemEntityContainer.getSchema());
}

async function initializeShado(engine: AbstractEngine): Promise<void> {
  if (initializedEngine === engine && initialization) return initialization;
  initializedEngine = engine;
  initialization = RequiemEntityContainer.initialize(engine, {
    backend: engine.isWebGPU ? "storage" : "datatex",
    extra: RequiemEntityActor,
    wasm: {
      mode: "precompiled",
      module: await loadRequiemEntityReducer(),
    },
  }).then((ok) => {
    if (!ok) throw new Error("Unable to initialize the Shado entity arena");
    // @knervous/shado may resolve a different Babylon peer in linked-repo dev.
    // Publish the generated chunks into the client's concrete shader store.
    registerClientShaderIncludes();
  });
  return initialization;
}

export class ShadoEntityPool {
  public readonly shado: RequiemEntityContainer;
  private readonly free: number[] = [];
  private readonly byEntityId = new Map<number, RequiemEntityActor>();
  private readonly coarseVisibility = new WeakMap<
    RequiemEntityActor,
    boolean
  >();
  private reservedActors = 0;
  private visibilitySink: RequiemEntityVisibilitySink | null = null;

  public static async create(engine: AbstractEngine): Promise<ShadoEntityPool> {
    await initializeShado(engine);
    return new ShadoEntityPool(engine);
  }

  private constructor(engine: AbstractEngine) {
    this.shado = new RequiemEntityContainer(engine);
    // GPU picking retains Babylon's per-slot instanceMeshID attribute, so its
    // compatibility pass still needs a per-source visibility lookup.
    this.shado.requireVisibilityFlags();
    // WebGPU builds bind groups before onBind. Ensure the arena backing exists
    // even while this model has zero actors.
    this.shado.markArenaDirty();
    this.shado.commit();
  }

  public reserve(actorCount: number, appearanceEntries: number): void {
    this.shado.reserveInstances(actorCount);
    this.shado.reserveVarArray("appearance", appearanceEntries);
    this.reservedActors = Math.max(this.reservedActors, actorCount);
  }

  public acquire(
    entityId: number,
    appearanceCount: number,
  ): {
    actor: RequiemEntityActor;
    index: number;
  } {
    const existing = this.byEntityId.get(entityId);
    if (existing) {
      return { actor: existing, index: this.shado.children.indexOf(existing) };
    }

    const reusable = this.free.pop();
    if (
      reusable === undefined &&
      this.shado.children.length >= this.reservedActors
    ) {
      const nextCapacity = Math.max(64, this.reservedActors * 2);
      this.reserve(nextCapacity, nextCapacity * appearanceCount);
    }
    const actor =
      reusable === undefined
        ? this.shado.addInstance(true)
        : this.shado.children[reusable];
    const index = reusable ?? this.shado.children.length - 1;
    // addInstance() already initializes new records. Reinitialize only a
    // recycled slot whose previous actor state must be cleared.
    if (reusable !== undefined) actor.initialize();
    actor.entityId = entityId >>> 0;
    actor.stateFlags = REQUIEM_ACTOR_ACTIVE;
    // Entity setup is asynchronous (nameplate, appearance and held-item data).
    // The zone grid makes the actor visible only after setup has completed.
    actor.visibleFlag = 0;
    actor.visibleIndex = index;
    actor.appearanceOffset = index * appearanceCount;
    actor.appearanceCount = appearanceCount;
    this.coarseVisibility.set(actor, false);
    this.shado.ensureAppearanceCount((index + 1) * appearanceCount);
    this.byEntityId.set(entityId, actor);
    this.shado.visibleCount = Math.max(this.shado.visibleCount, index + 1);
    this.visibilitySink?.acquire(this, actor, index);
    return { actor, index };
  }

  public release(index: number): void {
    const actor = this.shado.children[index];
    if (!actor || !(actor.stateFlags & REQUIEM_ACTOR_ACTIVE)) return;
    this.visibilitySink?.release(actor);
    this.coarseVisibility.delete(actor);
    this.byEntityId.delete(actor.entityId);
    actor.entityId = 0;
    actor.stateFlags = 0;
    actor.visibleFlag = 0;
    actor.visibleIndex = -1;
    actor.translation = new Float32Array([0, -1_000_000, 0, 0]);
    this.free.push(index);
  }

  public setTransform(
    actor: RequiementityActorCompat,
    position: Vector3,
    rotation: Quaternion,
    scale: number,
  ): void {
    actor.translation = new Float32Array([
      position.x,
      position.y,
      position.z,
      scale,
    ]);
    actor.rotation = new Float32Array([
      rotation.x,
      rotation.y,
      rotation.z,
      rotation.w,
    ]);
    this.visibilitySink?.transform(actor, position, scale);
  }

  public setAnimation(
    actor: RequiementityActorCompat,
    animation: Vector4,
  ): void {
    actor.animationBuffer = new Float32Array([
      animation.x,
      animation.y,
      animation.z,
      animation.w,
    ]);
  }

  public setVisible(actor: RequiementityActorCompat, visible: boolean): void {
    this.coarseVisibility.set(actor, visible);
    actor.visibleFlag = visible ? 1 : 0;
    this.visibilitySink?.visible(actor, visible);
  }

  public setSelected(actor: RequiementityActorCompat, selected: boolean): void {
    actor.stateFlags = selected
      ? actor.stateFlags | REQUIEM_ACTOR_SELECTED
      : actor.stateFlags & ~REQUIEM_ACTOR_SELECTED;
  }

  public setAppearance(
    instanceIndex: number,
    submeshIndex: number,
    submeshCount: number,
    slice: number,
    r: number,
    g: number,
    b: number,
  ): void {
    this.shado.setAppearance(instanceIndex * submeshCount + submeshIndex, [
      slice,
      r,
      g,
      b,
    ]);
    const actor = this.shado.children[instanceIndex];
    if (!actor || actor.appearanceCount === submeshCount) return;
    actor.appearanceOffset = instanceIndex * submeshCount;
    actor.appearanceCount = submeshCount;
  }

  public commit(): void {
    this.shado.commit();
  }

  public cull(camera: BJS.Camera, radius: number, maxDistance: number): void {
    // All model pools share the same generated Requiem container reducer. The
    // call operates directly on each pool's Shado arena; no actor copies or
    // transient JS visibility lists are created.
    this.shado.frustumCull(camera, radius, maxDistance);
  }

  public attachVisibilitySink(sink: RequiemEntityVisibilitySink | null): void {
    this.visibilitySink = sink;
    if (!sink) return;
    for (let index = 0; index < this.shado.children.length; index++) {
      const actor = this.shado.children[index];
      if (!(actor.stateFlags & REQUIEM_ACTOR_ACTIVE)) continue;
      sink.acquire(this, actor, index);
      const translation = actor.translation;
      sink.transform(
        actor,
        {
          x: Number(translation[0] ?? 0),
          y: Number(translation[1] ?? 0),
          z: Number(translation[2] ?? 0),
        },
        Number(translation[3] ?? 1),
      );
      sink.visible(actor, this.coarseVisibility.get(actor) ?? true);
    }
  }

  public applyWorkerVisibility(indices: ArrayLike<number>): void {
    this.shado.applyVisibilityReduction(indices);
  }

  public dispose(): void {
    this.visibilitySink?.detachPool(this);
    this.visibilitySink = null;
    this.byEntityId.clear();
    this.free.length = 0;
    this.shado.dispose();
  }
}

type RequiementityActorCompat = RequiemEntityActor;
