// Owned by eqrequiem. shader-object is only the compiler/codegen frontend.
// TypeScript binds these pointers to one Shado net arena before invoking reducers.
const MAX_ENTITIES: i32 = 16384;
// 104 public RenderSnapshotNet bytes + 36 private reducer bytes per entity,
// rounded up so schema growth cannot overlap the private planes.
const ARENA_BYTES: i32 = MAX_ENTITIES * 144 + 64;
const arena = new StaticArray<u8>(ARENA_BYTES);

let ids: usize = 0;
let kinds: usize = 0;
let positionX: usize = 0;
let positionY: usize = 0;
let positionZ: usize = 0;
let velocityX: usize = 0;
let velocityY: usize = 0;
let velocityZ: usize = 0;
let targetX: usize = 0;
let targetY: usize = 0;
let targetZ: usize = 0;
let speed: usize = 0;
let animation: usize = 0;
let movementState: usize = 0;
let dirtyFlags: usize = 0;
let dirtyIndices: usize = 0;
let dirtyCount: i32 = 0;

export function capacity(): i32 { return MAX_ENTITIES; }
export function arenaPtr(): usize { return changetype<usize>(arena); }
export function arenaByteLength(): i32 { return ARENA_BYTES; }

/** Bind Shado-generated SoA planes and private reducer planes once at bootstrap. */
export function bindEntityArena(
  idsPtr: usize,
  kindsPtr: usize,
  positionXPtr: usize,
  positionYPtr: usize,
  positionZPtr: usize,
  velocityXPtr: usize,
  velocityYPtr: usize,
  velocityZPtr: usize,
  animationPtr: usize,
  movementStatePtr: usize,
  targetXPtr: usize,
  targetYPtr: usize,
  targetZPtr: usize,
  speedPtr: usize,
  dirtyFlagsPtr: usize,
  dirtyIndicesPtr: usize,
): void {
  ids = idsPtr;
  kinds = kindsPtr;
  positionX = positionXPtr;
  positionY = positionYPtr;
  positionZ = positionZPtr;
  velocityX = velocityXPtr;
  velocityY = velocityYPtr;
  velocityZ = velocityZPtr;
  animation = animationPtr;
  movementState = movementStatePtr;
  targetX = targetXPtr;
  targetY = targetYPtr;
  targetZ = targetZPtr;
  speed = speedPtr;
  dirtyFlags = dirtyFlagsPtr;
  dirtyIndices = dirtyIndicesPtr;
}

export function spawnEntity(
  index: i32,
  id: u32,
  kind: u8,
  x: f32,
  y: f32,
  z: f32,
  moveSpeed: f32,
): void {
  if (index < 0 || index >= MAX_ENTITIES) return;
  const scalarOffset = <usize>index << 2;
  const vectorOffset = <usize>index * 12;
  store<u32>(ids + (<usize>index << 2), id);
  store<u8>(kinds + <usize>index, kind);
  store<f32>(positionX + vectorOffset, x);
  store<f32>(positionY + vectorOffset, y);
  store<f32>(positionZ + vectorOffset, z);
  store<f32>(targetX + scalarOffset, x);
  store<f32>(targetY + scalarOffset, y);
  store<f32>(targetZ + scalarOffset, z);
  store<f32>(speed + scalarOffset, moveSpeed);
  store<u32>(animation + scalarOffset, 0);
  store<u16>(movementState + (<usize>index << 1), 0);
  markDirty(index);
}

export function setEntityTarget(index: i32, x: f32, y: f32, z: f32): void {
  if (index < 0 || index >= MAX_ENTITIES) return;
  store<f32>(targetX + (<usize>index << 2), x);
  store<f32>(targetY + (<usize>index << 2), y);
  store<f32>(targetZ + (<usize>index << 2), z);
}

export function markDirty(index: i32): void {
  if (index >= 0 && index < MAX_ENTITIES) {
    store<u8>(dirtyFlags + <usize>index, 1);
  }
}

/** Dense deterministic steering/integration pass over the authoritative arena. */
export function tickNpcs(entityCount: i32, deltaMs: f32): void {
  const count = min<i32>(max<i32>(entityCount, 0), MAX_ENTITIES);
  const dt: f32 = deltaMs * <f32>0.001;
  for (let i = 0; i < count; i++) {
    if (load<u8>(kinds + <usize>i) != 2) continue;
    const scalarOffset = <usize>i << 2;
    const vectorOffset = <usize>i * 12;
    const dx: f32 = load<f32>(targetX + scalarOffset) - load<f32>(positionX + vectorOffset);
    const dy: f32 = load<f32>(targetY + scalarOffset) - load<f32>(positionY + vectorOffset);
    const dz: f32 = load<f32>(targetZ + scalarOffset) - load<f32>(positionZ + vectorOffset);
    const distanceSq: f32 = dx * dx + dy * dy + dz * dz;
    if (distanceSq < <f32>0.0001) {
      const wasMoving = load<u16>(movementState + (<usize>i << 1)) != 0;
      store<f32>(velocityX + vectorOffset, 0);
      store<f32>(velocityY + vectorOffset, 0);
      store<f32>(velocityZ + vectorOffset, 0);
      store<u32>(animation + scalarOffset, 0);
      store<u16>(movementState + (<usize>i << 1), 0);
      if (wasMoving) markDirty(i);
      continue;
    }
    const inverseDistance: f32 = <f32>1.0 / Mathf.sqrt(distanceSq);
    const moveSpeed = load<f32>(speed + scalarOffset);
    const step: f32 = min<f32>(moveSpeed * dt, <f32>1.0 / inverseDistance);
    store<f32>(velocityX + vectorOffset, dx * inverseDistance * moveSpeed);
    store<f32>(velocityY + vectorOffset, dy * inverseDistance * moveSpeed);
    store<f32>(velocityZ + vectorOffset, dz * inverseDistance * moveSpeed);
    store<f32>(positionX + vectorOffset, load<f32>(positionX + vectorOffset) + dx * inverseDistance * step);
    store<f32>(positionY + vectorOffset, load<f32>(positionY + vectorOffset) + dy * inverseDistance * step);
    store<f32>(positionZ + vectorOffset, load<f32>(positionZ + vectorOffset) + dz * inverseDistance * step);
    store<u32>(animation + scalarOffset, 1);
    store<u16>(movementState + (<usize>i << 1), 1);
    markDirty(i);
  }
}

/** Stable compaction point shared by TypeScript writes and WASM reducer writes. */
export function collectDirty(entityCount: i32): i32 {
  dirtyCount = 0;
  const count = min<i32>(max<i32>(entityCount, 0), MAX_ENTITIES);
  for (let i = 0; i < count; i++) {
    if (load<u8>(dirtyFlags + <usize>i) == 0) continue;
    store<u32>(dirtyIndices + (<usize>dirtyCount << 2), <u32>i);
    store<u8>(dirtyFlags + <usize>i, 0);
    dirtyCount++;
  }
  return dirtyCount;
}
