// Shared EQRequiem client/server entity reducer ABI.
// Built at development/build time through shader-object's `shado asc build` bin.
// Runtime code must only instantiate the resulting debug/release artifacts.

const ACTOR_STRIDE_BYTES: usize = 128;
const ACTOR_TRANSLATION_OFFSET: usize = 0;
const ACTOR_VISIBLE_INDEX_OFFSET: usize = 48;
const ACTOR_VISIBLE_FLAG_OFFSET: usize = 96;

const CONTAINER_VISIBLE_COUNT_OFFSET: usize = 0;
const CONTAINER_INSTANCES_PTR_OFFSET: usize = 4;
const CONTAINER_INSTANCES_COUNT_OFFSET: usize = 8;

let heap: usize = (memory.size() as usize) << 16;

export function alloc(bytes: i32): usize {
  const pointer = heap;
  const required = pointer + <usize>bytes;
  const requiredPages = <i32>((required + 0xffff) >>> 16);
  const currentPages = memory.size();
  if (requiredPages > currentPages) memory.grow(requiredPages - currentPages);
  heap = required;
  return pointer;
}

/**
 * Marks actors visible in place and writes the compact visible-index prefix.
 * All model-specific pools use this same ABI and reducer artifact.
 */
export function frustumMarkAoS(
  base: usize,
  planesPtr: usize,
  baseRadius: f32,
  cameraX: f32,
  cameraY: f32,
  cameraZ: f32,
  maxDistance: f32,
): void {
  const count = load<u32>(base + CONTAINER_INSTANCES_COUNT_OFFSET);
  if (count == 0) {
    store<u32>(base + CONTAINER_VISIBLE_COUNT_OFFSET, 0);
    return;
  }

  const instances = <usize>load<u32>(base + CONTAINER_INSTANCES_PTR_OFFSET);
  let writePointer = instances + ACTOR_VISIBLE_INDEX_OFFSET;
  let visibleCount: u32 = 0;
  const limit = instances + ACTOR_STRIDE_BYTES * <usize>count;

  for (let index: u32 = 0; index < count; index++) {
    const actor = instances + ACTOR_STRIDE_BYTES * <usize>index;
    store<i32>(actor + ACTOR_VISIBLE_INDEX_OFFSET, -1);
    store<i32>(actor + ACTOR_VISIBLE_FLAG_OFFSET, 0);

    const x = load<f32>(actor + ACTOR_TRANSLATION_OFFSET);
    const y = load<f32>(actor + ACTOR_TRANSLATION_OFFSET + 4);
    const z = load<f32>(actor + ACTOR_TRANSLATION_OFFSET + 8);
    const scale = load<f32>(actor + ACTOR_TRANSLATION_OFFSET + 12);
    const radius = baseRadius * scale;

    if (maxDistance > 0) {
      const dx = x - cameraX;
      const dy = y - cameraY;
      const dz = z - cameraZ;
      const distance = maxDistance + radius;
      if (dx * dx + dy * dy + dz * dz > distance * distance) continue;
    }

    let inside = true;
    for (let plane: usize = 0; plane < 6; plane++) {
      const offset = planesPtr + plane * 16;
      const distance =
        x * load<f32>(offset) +
        y * load<f32>(offset + 4) +
        z * load<f32>(offset + 8) +
        load<f32>(offset + 12);
      if (distance < -radius) {
        inside = false;
        break;
      }
    }
    if (!inside || writePointer >= limit) continue;

    store<i32>(writePointer, <i32>index);
    writePointer += ACTOR_STRIDE_BYTES;
    visibleCount++;
    store<i32>(actor + ACTOR_VISIBLE_FLAG_OFFSET, 1);
  }

  store<u32>(base + CONTAINER_VISIBLE_COUNT_OFFSET, visibleCount);
}
