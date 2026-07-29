// Shared EQRequiem client/server entity reducer ABI.
// Built at development/build time through @knervous/shado's `shado asc build` bin.
// Runtime code must only instantiate the resulting debug/release artifacts.

// Visibility and draw-order indirection are SoA sidecars owned by Shado, with
// compatibility mirrors retained in the packed actor record. The reducer only
// consumes translation and the vec4-aligned 32-float/128-byte actor stride;
// all other field offsets are owned by Shado's generated schema.
const ACTOR_STRIDE_BYTES: usize = 128;
const ACTOR_TRANSLATION_OFFSET: usize = 0;

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
 * Writes compact draw indices and visibility bytes into Shado's SoA planes.
 * Durable actor records remain untouched by culling.
 */
export function frustumMarkSoA(
  base: usize,
  planesPtr: usize,
  visibleIndicesPtr: usize,
  visibilityPtr: usize,
  baseRadius: f32,
  cameraX: f32,
  cameraY: f32,
  cameraZ: f32,
  maxDistance: f32,
): i32 {
  const count = load<u32>(base + CONTAINER_INSTANCES_COUNT_OFFSET);
  if (count == 0) return 0;

  const instances = <usize>load<u32>(base + CONTAINER_INSTANCES_PTR_OFFSET);
  let visibleCount: u32 = 0;

  for (let index: u32 = 0; index < count; index++) {
    const actor = instances + ACTOR_STRIDE_BYTES * <usize>index;
    store<u8>(visibilityPtr + <usize>index, 0);

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
    if (!inside) continue;

    store<u32>(visibleIndicesPtr + <usize>visibleCount * 4, index);
    store<u8>(visibilityPtr + <usize>index, 1);
    visibleCount++;
  }

  return <i32>visibleCount;
}
