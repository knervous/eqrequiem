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
} from "shader-object";
import requiemEntityReducerDebugUrl from "../../../../common/wasm/requiem-entity-reducer.debug.wasm?url";
import requiemEntityReducerReleaseUrl from "../../../../common/wasm/requiem-entity-reducer.release.wasm?url";

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
    const previous = current
      ? this.arena
          .take()
          .slice(
            this._varSeg.appearance.offF,
            this._varSeg.appearance.offF + current * 4,
          )
      : new Float32Array();
    const next = new Float32Array(count * 4);
    next.set(previous);
    this.setVarArray("appearance", next);
  }

  public setAppearance(index: number, value: ArrayLike<number>): void {
    this.ensureAppearanceCount(index + 1);
    const segment = this._varSeg.appearance;
    const target = this.arena.view(segment.offF + index * 4, 4);
    target.set(value);
    this.markArenaDirty();
  }
}

let initializedEngine: BJS.AbstractEngine | undefined;
let initialization: Promise<void> | undefined;
let reducerArtifact: Promise<ArrayBuffer> | undefined;

async function loadRequiemEntityReducer(): Promise<ArrayBuffer> {
  assertRequiemReducerAbi();
  reducerArtifact ??= fetch(
    import.meta.env.DEV
      ? requiemEntityReducerDebugUrl
      : requiemEntityReducerReleaseUrl,
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `Unable to load precompiled Requiem reducer: ${response.status} ${response.statusText}`,
      );
    }
    return response.arrayBuffer();
  });
  return reducerArtifact;
}

function assertRequiemReducerAbi(): void {
  const schema = RequiemEntityActor.getSchema();
  const expected = new Map<string, number>([
    ["translation", 0],
    ["visibleIndex", 12],
    ["visibleFlag", 24],
    ["entityId", 28],
    ["appearanceCount", 31],
  ]);
  if (schema.headerFloatCount !== 32) {
    throw new Error(`Requiem reducer ABI expected 32 actor floats, got ${schema.headerFloatCount}`);
  }
  for (const [name, offset] of expected) {
    const field = schema.fields.find((candidate) => candidate.name === name);
    if (field?.headerFloatOffset !== offset) {
      throw new Error(
        `Requiem reducer ABI mismatch for ${name}: expected ${offset}, got ${field?.headerFloatOffset}`,
      );
    }
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
    Object.assign(Effect.IncludesShadersStore, chunks);
    Object.assign(ShaderStore.IncludesShadersStore, chunks);
  };
  register(RequiemEntityContainer.getSchema());
}

async function initializeShado(engine: AbstractEngine): Promise<void> {
  if (initializedEngine === engine && initialization) return initialization;
  initializedEngine = engine;
  initialization = RequiemEntityContainer.initialize(engine, {
    backend: "datatex",
    extra: RequiemEntityActor,
    wasm: {
      mode: "precompiled",
      module: await loadRequiemEntityReducer(),
    },
  }).then((ok) => {
    if (!ok) throw new Error("Unable to initialize the Shado entity arena");
    // shader-object may resolve a different Babylon peer in linked-repo dev.
    // Publish the generated chunks into the client's concrete shader store.
    registerClientShaderIncludes();
  });
  return initialization;
}

export class ShadoEntityPool {
  public readonly shado: RequiemEntityContainer;
  private readonly free: number[] = [];
  private readonly byEntityId = new Map<number, RequiemEntityActor>();

  public static async create(engine: AbstractEngine): Promise<ShadoEntityPool> {
    await initializeShado(engine);
    return new ShadoEntityPool(engine);
  }

  private constructor(engine: AbstractEngine) {
    this.shado = new RequiemEntityContainer(engine);
    // WebGPU builds bind groups before onBind. Ensure the arena backing texture
    // exists even while this model has zero actors.
    this.shado.markArenaDirty();
    this.shado.commit();
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
    const actor =
      reusable === undefined
        ? this.shado.addInstance(true)
        : this.shado.children[reusable];
    const index = reusable ?? this.shado.children.length - 1;
    actor.initialize();
    actor.entityId = entityId >>> 0;
    actor.stateFlags = REQUIEM_ACTOR_ACTIVE;
    // Entity setup is asynchronous (nameplate, appearance and held-item data).
    // The zone grid makes the actor visible only after setup has completed.
    actor.visibleFlag = 0;
    actor.visibleIndex = index;
    actor.appearanceOffset = index * appearanceCount;
    actor.appearanceCount = appearanceCount;
    actor.emitHeaderDirty();
    this.shado.ensureAppearanceCount((index + 1) * appearanceCount);
    this.byEntityId.set(entityId, actor);
    this.shado.visibleCount = Math.max(this.shado.visibleCount, index + 1);
    return { actor, index };
  }

  public release(index: number): void {
    const actor = this.shado.children[index];
    if (!actor || !(actor.stateFlags & REQUIEM_ACTOR_ACTIVE)) return;
    this.byEntityId.delete(actor.entityId);
    actor.entityId = 0;
    actor.stateFlags = 0;
    actor.visibleFlag = 0;
    actor.visibleIndex = -1;
    actor.translation.set([0, -1_000_000, 0, 0]);
    actor.emitHeaderDirty();
    this.free.push(index);
  }

  public setTransform(
    actor: RequiementityActorCompat,
    position: Vector3,
    rotation: Quaternion,
    scale: number,
  ): void {
    actor.translation.set([position.x, position.y, position.z, scale]);
    actor.rotation.set([rotation.x, rotation.y, rotation.z, rotation.w]);
    actor.emitHeaderDirty();
  }

  public setAnimation(
    actor: RequiementityActorCompat,
    animation: Vector4,
  ): void {
    actor.animationBuffer.set([
      animation.x,
      animation.y,
      animation.z,
      animation.w,
    ]);
    actor.emitHeaderDirty();
  }

  public setVisible(actor: RequiementityActorCompat, visible: boolean): void {
    actor.visibleFlag = visible ? 1 : 0;
    actor.emitHeaderDirty();
  }

  public setSelected(actor: RequiementityActorCompat, selected: boolean): void {
    actor.stateFlags = selected
      ? actor.stateFlags | REQUIEM_ACTOR_SELECTED
      : actor.stateFlags & ~REQUIEM_ACTOR_SELECTED;
    actor.emitHeaderDirty();
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
    actor.emitHeaderDirty();
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

  public dispose(): void {
    this.byEntityId.clear();
    this.free.length = 0;
    this.shado.dispose();
  }
}

type RequiementityActorCompat = RequiemEntityActor;
