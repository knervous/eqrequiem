const LEAF_BIT: u32 = 0x80000000;
const EMPTY_REF: u32 = 0xffffffff;

let heap: usize = (memory.size() as usize) << 16;

export function alloc(bytes: i32): usize {
  const pointer = heap;
  const required = (pointer + <usize>bytes + 7) & ~(<usize>7);
  const pages = <i32>((required + 0xffff) >>> 16);
  const current = memory.size();
  if (pages > current) memory.grow(pages - current);
  heap = required;
  return pointer;
}

// Descriptor offsets are mirrored by ShadoWorldReducer.ts.
export function queryWorldFrustum(descriptor: usize): i32 {
  const nodeCount = load<u32>(descriptor);
  if (nodeCount == 0) return 0;
  const root = load<i32>(descriptor + 4);
  const qMinX = load<f32>(descriptor + 8);
  const qMinY = load<f32>(descriptor + 12);
  const qMinZ = load<f32>(descriptor + 16);
  const qExtX = load<f32>(descriptor + 20);
  const qExtY = load<f32>(descriptor + 24);
  const qExtZ = load<f32>(descriptor + 28);
  const minXPtr = <usize>load<u32>(descriptor + 32);
  const minYPtr = <usize>load<u32>(descriptor + 36);
  const minZPtr = <usize>load<u32>(descriptor + 40);
  const maxXPtr = <usize>load<u32>(descriptor + 44);
  const maxYPtr = <usize>load<u32>(descriptor + 48);
  const maxZPtr = <usize>load<u32>(descriptor + 52);
  const refsPtr = <usize>load<u32>(descriptor + 56);
  const planesPtr = <usize>load<u32>(descriptor + 60);
  const outputPtr = <usize>load<u32>(descriptor + 64);
  const outputCapacity = load<u32>(descriptor + 68);
  const stackPtr = <usize>load<u32>(descriptor + 72);

  let top: i32 = 0;
  store<i32>(stackPtr, root);
  top++;
  let visible: u32 = 0;
  while (top > 0) {
    top--;
    const node = load<i32>(stackPtr + <usize>top * 4);
    for (let lane: i32 = 0; lane < 4; lane++) {
      const slot = node * 4 + lane;
      const ref = load<u32>(refsPtr + <usize>slot * 4);
      if (ref == EMPTY_REF) continue;
      const qOffset = <usize>slot * 2;
      const minX = qMinX + <f32>load<u16>(minXPtr + qOffset) * (qExtX / 65535.0);
      const minY = qMinY + <f32>load<u16>(minYPtr + qOffset) * (qExtY / 65535.0);
      const minZ = qMinZ + <f32>load<u16>(minZPtr + qOffset) * (qExtZ / 65535.0);
      const maxX = qMinX + <f32>load<u16>(maxXPtr + qOffset) * (qExtX / 65535.0);
      const maxY = qMinY + <f32>load<u16>(maxYPtr + qOffset) * (qExtY / 65535.0);
      const maxZ = qMinZ + <f32>load<u16>(maxZPtr + qOffset) * (qExtZ / 65535.0);

      let inside = true;
      for (let plane: i32 = 0; plane < 6; plane++) {
        const p = planesPtr + <usize>plane * 16;
        const nx = load<f32>(p);
        const ny = load<f32>(p + 4);
        const nz = load<f32>(p + 8);
        const x = nx >= 0 ? maxX : minX;
        const y = ny >= 0 ? maxY : minY;
        const z = nz >= 0 ? maxZ : minZ;
        if (nx * x + ny * y + nz * z + load<f32>(p + 12) < 0) {
          inside = false;
          break;
        }
      }
      if (!inside) continue;
      if ((ref & LEAF_BIT) != 0) {
        if (visible < outputCapacity) store<u32>(outputPtr + <usize>visible * 4, ref & ~LEAF_BIT);
        visible++;
      } else {
        store<i32>(stackPtr + <usize>top * 4, <i32>ref);
        top++;
      }
    }
  }
  return <i32>visible;
}

// World-visibility descriptor offsets are mirrored by ShadoWorldReducer.ts.
// Immutable topology pointers and persistent output pointers are installed once;
// each call changes only the camera row and optional byte-per-cell policies.
export function reduceWorldVisibility(descriptor: usize): i32 {
  const frustumDescriptor = <usize>load<u32>(descriptor);
  const cameraCell = load<i32>(descriptor + 4);
  const cameraRegion = load<i32>(descriptor + 8);
  const regionCount = load<u32>(descriptor + 12);
  const cellCount = load<u32>(descriptor + 16);
  const clusterCount = load<u32>(descriptor + 20);
  const packetCount = load<u32>(descriptor + 24);
  const pvsWordsPtr = <usize>load<u32>(descriptor + 28);
  const wordsPerRow = load<u32>(descriptor + 32);
  const pvsRowCount = load<u32>(descriptor + 36);
  const cellRegionPtr = <usize>load<u32>(descriptor + 40);
  const persistentCellPtr = <usize>load<u32>(descriptor + 44);
  const loadedPtr = <usize>load<u32>(descriptor + 48);
  const phasePtr = <usize>load<u32>(descriptor + 52);
  const portalPtr = <usize>load<u32>(descriptor + 56);
  const clusterCellPtr = <usize>load<u32>(descriptor + 60);
  const clusterPacketPtr = <usize>load<u32>(descriptor + 64);
  const visibleClustersPtr = <usize>load<u32>(descriptor + 68);
  const visiblePacketsPtr = <usize>load<u32>(descriptor + 72);
  const clusterFlagsPtr = <usize>load<u32>(descriptor + 76);
  const cellFlagsPtr = <usize>load<u32>(descriptor + 80);
  const regionFlagsPtr = <usize>load<u32>(descriptor + 84);
  const packetFlagsPtr = <usize>load<u32>(descriptor + 88);
  const hasDenseVisibility = load<i32>(descriptor + 100) != 0;
  const hasLoadedPolicy = load<i32>(descriptor + 104) != 0;
  const hasPhasePolicy = load<i32>(descriptor + 108) != 0;
  const hasPortalPolicy = load<i32>(descriptor + 112) != 0;

  memory.fill(clusterFlagsPtr, 0, clusterCount);
  memory.fill(cellFlagsPtr, 0, cellCount);
  memory.fill(packetFlagsPtr, 0, packetCount);

  // Dense visibility regions cover empty terrain as well as render cells. An
  // omitted policy therefore passes every region, while an explicit policy is
  // projected from its exact render-cell ownership below.
  for (let region: u32 = 0; region < regionCount; region++) {
    let flags: u8 = hasDenseVisibility ? 0x02 : 0;
    if (!hasLoadedPolicy) flags |= 0x10;
    if (!hasPhasePolicy) flags |= 0x20;
    if (!hasPortalPolicy) flags |= 0x40;
    const cameraRow = hasDenseVisibility ? cameraRegion : cameraCell;
    let pvsVisible = cameraRow < 0 || wordsPerRow == 0 || pvsRowCount == 0;
    if (!pvsVisible && <u32>cameraRow < pvsRowCount) {
      const word = load<u32>(
        pvsWordsPtr + <usize>(<u32>cameraRow * wordsPerRow + (region >>> 5)) * 4
      );
      pvsVisible = (word & ((<u32>1) << (region & 31))) != 0;
    }
    // Invalid camera rows fail open, matching the outside-world policy.
    if (<u32>cameraRow >= pvsRowCount && cameraRow >= 0) pvsVisible = true;
    if (pvsVisible) flags |= 0x01;
    store<u8>(regionFlagsPtr + <usize>region, flags);
  }

  for (let cell: u32 = 0; cell < cellCount; cell++) {
    const region = load<u32>(cellRegionPtr + <usize>cell * 4);
    const regionPvs =
      region < regionCount && (load<u8>(regionFlagsPtr + <usize>region) & 0x01) != 0;
    let flags: u8 = regionPvs || load<u8>(persistentCellPtr + <usize>cell) != 0 ? 0x01 : 0;
    if (load<u8>(loadedPtr + <usize>cell) != 0) flags |= 0x10;
    if (load<u8>(phasePtr + <usize>cell) != 0) flags |= 0x20;
    if (load<u8>(portalPtr + <usize>cell) != 0) flags |= 0x40;
    store<u8>(cellFlagsPtr + <usize>cell, flags);
    if (hasDenseVisibility && region < regionCount) {
      let regionFlags = load<u8>(regionFlagsPtr + <usize>region);
      if (hasLoadedPolicy && (flags & 0x10) != 0) regionFlags |= 0x10;
      if (hasPhasePolicy && (flags & 0x20) != 0) regionFlags |= 0x20;
      if (hasPortalPolicy && (flags & 0x40) != 0) regionFlags |= 0x40;
      store<u8>(regionFlagsPtr + <usize>region, regionFlags);
    } else if (!hasDenseVisibility && region < regionCount) {
      store<u8>(regionFlagsPtr + <usize>region, flags);
    }
  }

  const frustumCount = queryWorldFrustum(frustumDescriptor);
  let visibleClusterCount: u32 = 0;
  for (let index: i32 = 0; index < frustumCount; index++) {
    const cluster = load<u32>(visibleClustersPtr + <usize>index * 4);
    if (cluster >= clusterCount) continue;
    const cell = load<u32>(clusterCellPtr + <usize>cluster * 4);
    if (cell >= cellCount) continue;
    const cellPolicy = load<u8>(cellFlagsPtr + <usize>cell) & 0x71;
    let flags: u8 = cellPolicy | 0x06;
    if (cellPolicy == 0x71) flags |= 0x80;
    store<u8>(clusterFlagsPtr + <usize>cluster, flags);
    if ((flags & 0x80) == 0) continue;
    // In-place compaction is safe because the write cursor never passes index.
    store<u32>(visibleClustersPtr + <usize>visibleClusterCount * 4, cluster);
    visibleClusterCount++;
    const cellFlags = load<u8>(cellFlagsPtr + <usize>cell) | 0x86;
    store<u8>(cellFlagsPtr + <usize>cell, cellFlags);
    const packet = load<u32>(clusterPacketPtr + <usize>cluster * 4);
    if (packet < packetCount) {
      store<u8>(
        packetFlagsPtr + <usize>packet,
        load<u8>(packetFlagsPtr + <usize>packet) | cellPolicy | 0x86
      );
    }
  }

  let visiblePacketCount: u32 = 0;
  for (let packet: u32 = 0; packet < packetCount; packet++) {
    if ((load<u8>(packetFlagsPtr + <usize>packet) & 0x80) == 0) continue;
    store<u32>(visiblePacketsPtr + <usize>visiblePacketCount * 4, packet);
    visiblePacketCount++;
  }
  store<u32>(descriptor + 92, visibleClusterCount);
  store<u32>(descriptor + 96, visiblePacketCount);
  return <i32>visibleClusterCount;
}

// Entity descriptor offsets are mirrored by ShadoWorldReducer.ts.
export function reduceEntityVisibility(descriptor: usize): i32 {
  const count = load<u32>(descriptor);
  const xPtr = <usize>load<u32>(descriptor + 4);
  const yPtr = <usize>load<u32>(descriptor + 8);
  const zPtr = <usize>load<u32>(descriptor + 12);
  const radiusPtr = <usize>load<u32>(descriptor + 16);
  const planesPtr = <usize>load<u32>(descriptor + 20);
  const cellFlagsPtr = <usize>load<u32>(descriptor + 24);
  const tileLookupPtr = <usize>load<u32>(descriptor + 28);
  const gridWidth = load<i32>(descriptor + 32);
  const gridHeight = load<i32>(descriptor + 36);
  const gridMinX = load<i32>(descriptor + 40);
  const gridMinZ = load<i32>(descriptor + 44);
  const originX = load<f32>(descriptor + 48);
  const originZ = load<f32>(descriptor + 52);
  const tileSize = load<f32>(descriptor + 56);
  const camX = load<f32>(descriptor + 60);
  const camY = load<f32>(descriptor + 64);
  const camZ = load<f32>(descriptor + 68);
  const maxDistance = load<f32>(descriptor + 72);
  const outsideVisible = load<i32>(descriptor + 76) != 0;
  const outputPtr = <usize>load<u32>(descriptor + 80);
  const flagsPtr = <usize>load<u32>(descriptor + 84);
  let visible: u32 = 0;

  for (let i: u32 = 0; i < count; i++) {
    const offset = <usize>i * 4;
    const x = load<f32>(xPtr + offset);
    const y = load<f32>(yPtr + offset);
    const z = load<f32>(zPtr + offset);
    const radius = load<f32>(radiusPtr + offset);
    const tileX = <i32>Math.floor((x - originX) / tileSize);
    const tileZ = <i32>Math.floor((z - originZ) / tileSize);
    const localX = tileX - gridMinX;
    const localZ = tileZ - gridMinZ;
    let cell = -1;
    if (localX >= 0 && localX < gridWidth && localZ >= 0 && localZ < gridHeight) {
      const denseCell = localZ * gridWidth + localX;
      cell = tileLookupPtr == 0 ? denseCell : load<i32>(tileLookupPtr + <usize>denseCell * 4);
    }
    // Entity candidacy is stable topology policy, not whether a terrain cluster in
    // the same cell happened to survive this frame's geometry frustum query.
    const requiredCellBits: u8 = 0x71; // PVS | loaded | phase | portal reachable
    let reason: u8 =
      cell < 0
        ? outsideVisible
          ? requiredCellBits
          : 0
        : load<u8>(cellFlagsPtr + <usize>cell) & 0x73;
    const cellCandidate = (reason & requiredCellBits) == requiredCellBits;
    if (!cellCandidate) {
      store<u8>(flagsPtr + <usize>i, reason);
      continue;
    }

    let inside = true;
    for (let plane: i32 = 0; plane < 6; plane++) {
      const p = planesPtr + <usize>plane * 16;
      if (
        load<f32>(p) * x + load<f32>(p + 4) * y + load<f32>(p + 8) * z + load<f32>(p + 12) <
        -radius
      ) {
        inside = false;
        break;
      }
    }
    if (!inside) {
      store<u8>(flagsPtr + <usize>i, reason);
      continue;
    }
    reason |= 0x04;

    if (maxDistance > 0.0) {
      const dx = x - camX;
      const dy = y - camY;
      const dz = z - camZ;
      const limit = maxDistance + radius;
      if (dx * dx + dy * dy + dz * dz > limit * limit) {
        store<u8>(flagsPtr + <usize>i, reason);
        continue;
      }
    }
    reason |= 0x88;
    store<u8>(flagsPtr + <usize>i, reason);
    store<u32>(outputPtr + <usize>visible * 4, i);
    visible++;
  }
  return <i32>visible;
}
