import type { RenderSnapshotNetBatchView } from "../protocol/generated/net-structs.js";

export const EntityKind = Object.freeze({
  inactive: 0,
  pc: 1,
  npc: 2,
});

export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

export interface EntityArenaBinding {
  readonly capacity: number;
  readonly publicState: RenderSnapshotNetBatchView;
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  readonly targetZ: Float32Array;
  readonly speed: Float32Array;
  readonly serverFlags: Uint32Array;
  readonly combatTimer: Uint32Array;
  readonly aggroTarget: Uint32Array;
  readonly dirtyIndices: Uint32Array;
  spawnEntity(
    index: number,
    id: number,
    kind: EntityKind,
    x: number,
    y: number,
    z: number,
    speed: number,
  ): void;
  setEntityTarget(index: number, x: number, y: number, z: number): void;
  markDirty(index: number): void;
}

export interface EntitySpawn {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NpcSpawn extends EntitySpawn {
  readonly speed?: number;
}

/** Mutable vector handle over one entity's scalar range. Writes mark that entity dirty. */
export class EntityVectorView {
  constructor(
    private readonly values: Float32Array | readonly Float32Array[],
    private readonly index: number,
    readonly components: 3 | 4,
    private readonly dirty: () => void,
  ) {}

  get x(): number { return this.read(0); }
  set x(value: number) { this.write(0, value); }

  get y(): number { return this.read(1); }
  set y(value: number) { this.write(1, value); }

  get z(): number { return this.read(2); }
  set z(value: number) { this.write(2, value); }

  get w(): number {
    if (this.components !== 4) throw new RangeError("A three-component vector has no w value");
    return this.read(3);
  }
  set w(value: number) {
    if (this.components !== 4) throw new RangeError("A three-component vector has no w value");
    this.write(3, value);
  }

  set(x: number, y: number, z: number, w?: number): void {
    this.writeValue(0, x);
    this.writeValue(1, y);
    this.writeValue(2, z);
    if (this.components === 4) this.writeValue(3, w ?? this.read(3));
    this.dirty();
  }

  /** Zero-copy typed ranges for reducers or bulk APIs. Prefer setters for gameplay writes. */
  typedArrays(): readonly Float32Array[] {
    const planes = this.planarValues;
    if (planes) return planes.map((plane) => plane.subarray(this.index, this.index + 1));
    return [this.interleavedValues.subarray(this.offset, this.offset + this.components)];
  }

  private get offset(): number { return this.index * this.components; }

  private write(component: number, value: number): void {
    this.writeValue(component, value);
    this.dirty();
  }

  private read(component: number): number {
    const planes = this.planarValues;
    if (planes) return planes[component]?.[this.index] ?? 0;
    return this.interleavedValues[this.offset + component] ?? 0;
  }

  private writeValue(component: number, value: number): void {
    const planes = this.planarValues;
    if (planes) {
      const plane = planes[component];
      if (plane) plane[this.index] = value;
      return;
    }
    this.interleavedValues[this.offset + component] = value;
  }

  private get planarValues(): readonly Float32Array[] | null {
    return this.values instanceof Float32Array ? null : this.values;
  }

  private get interleavedValues(): Float32Array {
    if (!(this.values instanceof Float32Array)) throw new TypeError("Expected an interleaved vector");
    return this.values;
  }
}

/** Object-oriented handle over a row index in the authoritative Shado SoA arena. */
export class Entity {
  readonly position: EntityVectorView;
  readonly orientation: EntityVectorView;
  readonly velocity: EntityVectorView;

  constructor(
    protected readonly store: EntityStore,
    readonly index: number,
  ) {
    const state = store.publicState;
    const dirty = (): void => store.markDirty(index);
    this.position = new EntityVectorView(state.statePosition, index, 3, dirty);
    this.orientation = new EntityVectorView(state.stateOrientation, index, 4, dirty);
    this.velocity = new EntityVectorView(state.stateVelocity, index, 3, dirty);
  }

  get id(): number { return this.store.publicState.entityId[this.index] ?? 0; }
  get kind(): EntityKind {
    return (this.store.publicState.stateKind[this.index] ?? EntityKind.inactive) as EntityKind;
  }
  get active(): boolean { return this.kind !== EntityKind.inactive; }

  get animation(): number { return this.store.publicState.stateAnimation[this.index] ?? 0; }
  set animation(value: number) {
    this.store.publicState.stateAnimation[this.index] = value;
    this.markDirty();
  }

  get movementState(): number {
    return this.store.publicState.stateMovementState[this.index] ?? 0;
  }
  set movementState(value: number) {
    this.store.publicState.stateMovementState[this.index] = value;
    this.markDirty();
  }

  get appearance(): number { return this.store.publicState.stateAppearance[this.index] ?? 0; }
  set appearance(value: number) {
    this.store.publicState.stateAppearance[this.index] = value;
    this.markDirty();
  }

  get nameOffset(): number { return this.store.publicState.stateNameOffset[this.index] ?? 0; }
  get nameLength(): number { return this.store.publicState.stateNameLength[this.index] ?? 0; }

  /** Server-owned state: part of the arena, intentionally absent from render snapshots. */
  get serverFlags(): number { return this.store.privateServerFlags[this.index] ?? 0; }
  set serverFlags(value: number) { this.store.privateServerFlags[this.index] = value; }

  get combatTimer(): number { return this.store.privateCombatTimer[this.index] ?? 0; }
  set combatTimer(value: number) { this.store.privateCombatTimer[this.index] = value; }

  setNameReference(byteOffset: number, byteLength: number): void {
    this.store.publicState.stateNameOffset[this.index] = byteOffset;
    this.store.publicState.stateNameLength[this.index] = byteLength;
    this.markDirty();
  }

  markDirty(): void { this.store.markDirty(this.index); }
}

export class PC extends Entity {}

export class NPC extends Entity {
  readonly target: EntityVectorView;

  constructor(store: EntityStore, index: number) {
    super(store, index);
    this.target = new EntityVectorView(
      store.privateTargetPlanes,
      index,
      3,
      () => {},
    );
  }

  get moveSpeed(): number { return this.store.privateSpeed[this.index] ?? 0; }
  set moveSpeed(value: number) { this.store.privateSpeed[this.index] = value; }

  get aggroTargetId(): number { return this.store.privateAggroTarget[this.index] ?? 0; }
  set aggroTargetId(value: number) { this.store.privateAggroTarget[this.index] = value; }
}

/** Owns lifecycle and stable class handles; all state remains in the supplied arena. */
export class EntityStore {
  private readonly handles: Array<Entity | undefined>;
  private readonly byEntityId = new Map<number, Entity>();
  private activeHighWaterMark = 0;

  constructor(private readonly arena: EntityArenaBinding) {
    this.handles = Array.from({ length: arena.capacity }, () => undefined);
  }

  get capacity(): number { return this.arena.capacity; }
  get count(): number { return this.activeHighWaterMark; }
  get publicState(): RenderSnapshotNetBatchView { return this.arena.publicState; }
  get privateSpeed(): Float32Array { return this.arena.speed; }
  get privateServerFlags(): Uint32Array { return this.arena.serverFlags; }
  get privateCombatTimer(): Uint32Array { return this.arena.combatTimer; }
  get privateAggroTarget(): Uint32Array { return this.arena.aggroTarget; }
  get privateTargetPlanes(): readonly Float32Array[] {
    return [this.arena.targetX, this.arena.targetY, this.arena.targetZ];
  }

  /** Full fixed-capacity public prefix, already carrying the Shado net header. */
  netPayload(): Uint8Array { return this.publicState.bytes; }

  spawnPC(spawn: EntitySpawn): PC { return this.spawnPCAt(this.nextIndex(), spawn); }
  spawnNPC(spawn: NpcSpawn): NPC { return this.spawnNPCAt(this.nextIndex(), spawn); }

  spawnPCAt(index: number, spawn: EntitySpawn): PC {
    this.assertSpawnIndex(index, spawn.id);
    this.arena.spawnEntity(index, spawn.id, EntityKind.pc, spawn.x, spawn.y, spawn.z, 0);
    this.resetPublicFields(index);
    const entity = new PC(this, index);
    this.install(entity);
    entity.orientation.w = 1;
    return entity;
  }

  spawnNPCAt(index: number, spawn: NpcSpawn): NPC {
    this.assertSpawnIndex(index, spawn.id);
    this.arena.spawnEntity(
      index,
      spawn.id,
      EntityKind.npc,
      spawn.x,
      spawn.y,
      spawn.z,
      spawn.speed ?? 0,
    );
    this.resetPublicFields(index);
    const entity = new NPC(this, index);
    this.install(entity);
    entity.orientation.w = 1;
    return entity;
  }

  at(index: number): Entity | undefined { return this.handles[index]; }
  get(id: number): Entity | undefined { return this.byEntityId.get(id); }

  remove(entity: Entity): void {
    if (this.handles[entity.index] !== entity) return;
    this.publicState.stateKind[entity.index] = EntityKind.inactive;
    this.byEntityId.delete(entity.id);
    this.handles[entity.index] = undefined;
    this.markDirty(entity.index);
  }

  dirtyIndices(count: number): Uint32Array {
    return this.arena.dirtyIndices.subarray(0, count);
  }

  markDirty(index: number): void { this.arena.markDirty(index); }

  private nextIndex(): number {
    const free = this.handles.findIndex((handle, index) => index < this.activeHighWaterMark && !handle);
    return free >= 0 ? free : this.activeHighWaterMark;
  }

  private assertSpawnIndex(index: number, id: number): void {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.capacity) {
      throw new RangeError("Entity index exceeds the zone arena");
    }
    if (this.handles[index]) throw new Error(`Entity slot ${index} is already active`);
    if (this.byEntityId.has(id)) throw new Error(`Entity id ${id} is already active`);
  }

  private resetPublicFields(index: number): void {
    const state = this.publicState;
    state.stateOrientation.fill(0, index * 4, index * 4 + 4);
    state.stateVelocity.fill(0, index * 3, index * 3 + 3);
    state.stateAppearance[index] = 0;
    state.stateNameOffset[index] = 0;
    state.stateNameLength[index] = 0;
    state.stateArchetypeId[index] = 0;
    state.stateLevel[index] = 0;
    state.stateRace[index] = 0;
    state.stateGender[index] = 0;
    state.stateClassId[index] = 0;
    state.stateBodyType[index] = 0;
    state.stateSize[index] = 1;
    state.stateFace[index] = 0;
    state.stateHelm[index] = 0;
    state.stateChest[index] = 0;
    state.statePrimary[index] = 0;
    state.stateSecondary[index] = 0;
    state.stateModelKeyOffset[index] = 0;
    state.stateModelKeyLength[index] = 0;
    state.stateHeading[index] = 0;
    this.arena.serverFlags[index] = 0;
    this.arena.combatTimer[index] = 0;
    this.arena.aggroTarget[index] = 0;
  }

  private install(entity: Entity): void {
    const existing = this.byEntityId.get(entity.id);
    if (existing) throw new Error(`Entity id ${entity.id} is already active`);
    this.handles[entity.index] = entity;
    this.byEntityId.set(entity.id, entity);
    this.activeHighWaterMark = Math.max(this.activeHighWaterMark, entity.index + 1);
  }
}
