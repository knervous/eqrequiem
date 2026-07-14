import {
  OFFSET_ShadoDynamicEntityDeltaRecord_positionSize,
  OFFSET_ShadoDynamicEntityExpirationRecord_flags,
  OFFSET_ShadoDynamicEntityExpirationRecord_index,
  OFFSET_ShadoDynamicEntityExpirationRecord_padding,
  OFFSET_ShadoDynamicEntityExpirationRecord_removeAfterFrame,
  OFFSET_ShadoDynamicEntityExpirationRecord_removeAfterSimulationTime,
  OFFSET_ShadoEntity2D_destinationSize,
  OFFSET_ShadoEntity2D_motion,
  OFFSET_ShadoEntity2D_positionSize,
  OFFSET_ShadoEntity2D_render,
  OFFSET_ShadoEntity2D_renderState,
  ShadoDynamicEntityDeltaRecord,
  ShadoDynamicEntityExpirationRecord,
  SIZEOF_ShadoDynamicEntityDeltaRecord,
  SIZEOF_ShadoDynamicEntityExpirationRecord,
  SIZEOF_ShadoEntity2DHeader,
} from './render-reducer.generated';

const ENTITY_VISIBLE: i32 = 1 << 0;

const DELTA_MAGIC: u32 = 0x44524453; // SDRD
const DELTA_VERSION: u32 = 1;
const DELTA_HEADER_BYTES: i32 = 16;

const OP_SET_DESTINATION: u32 = 1;
const OP_DIRECT_PLACE: u32 = 2;
const OP_SET_VISIBILITY: u32 = 3;
const OP_SET_EXPIRATION: u32 = 4;
const OP_MARK_ACTIVE: u32 = 5;

const EXPIRATION_FLAG_FRAME: i32 = 1 << 0;
const EXPIRATION_FLAG_SIMULATION_TIME: i32 = 1 << 1;

let heapPtr: i32 = 1024;

let entityBasePtr: i32 = 0;
let entityCapacity: i32 = 0;
let entityStrideBytes: i32 = 0;
let positionSizeOffset: i32 = 0;
let renderOffset: i32 = 0;
let destinationSizeOffset: i32 = 0;
let motionOffset: i32 = 0;
let renderStateOffset: i32 = 0;

let activeIndexPtr: i32 = 0;
let activeIndexCapacity: i32 = 0;
let activeIndexCount: i32 = 0;
let activeMarkerPtr: i32 = 0;

let changedIndexPtr: i32 = 0;
let changedIndexCapacity: i32 = 0;
let changedIndexCount: i32 = 0;

let expirationPtr: i32 = 0;
let expirationCapacity: i32 = 0;
let expirationStrideBytes: i32 = SIZEOF_ShadoDynamicEntityExpirationRecord;
let expirationCount: i32 = 0;

let timelinePtr: i32 = 0;
let timelineByteLength: i32 = 0;

export function alloc(byteLength: i32): i32 {
  const alignedLength = (byteLength + 15) & ~15;
  const ptr = heapPtr;
  const next = ptr + alignedLength;
  const currentBytes = memory.size() << 16;
  if (next > currentBytes) {
    const neededPages = ((next - currentBytes + 0xffff) >> 16);
    memory.grow(neededPages);
  }
  heapPtr = next;
  return ptr;
}

export function resetAllocator(byteOffset: i32 = 1024): void {
  heapPtr = (byteOffset + 15) & ~15;
}

export function init(
  entityBasePtrArg: i32,
  entityCapacityArg: i32,
  entityStrideBytesArg: i32,
  positionSizeOffsetArg: i32,
  renderOffsetArg: i32,
  destinationSizeOffsetArg: i32,
  motionOffsetArg: i32,
  renderStateOffsetArg: i32,
  activeIndexPtrArg: i32,
  activeIndexCapacityArg: i32,
  changedIndexPtrArg: i32,
  changedIndexCapacityArg: i32,
  expirationPtrArg: i32,
  expirationCapacityArg: i32,
  expirationStrideBytesArg: i32
): void {
  entityBasePtr = entityBasePtrArg;
  entityCapacity = entityCapacityArg;
  entityStrideBytes = entityStrideBytesArg > 0
    ? entityStrideBytesArg
    : SIZEOF_ShadoEntity2DHeader;
  positionSizeOffset = positionSizeOffsetArg >= 0
    ? positionSizeOffsetArg
    : OFFSET_ShadoEntity2D_positionSize;
  renderOffset = renderOffsetArg >= 0 ? renderOffsetArg : OFFSET_ShadoEntity2D_render;
  destinationSizeOffset = destinationSizeOffsetArg >= 0
    ? destinationSizeOffsetArg
    : OFFSET_ShadoEntity2D_destinationSize;
  motionOffset = motionOffsetArg >= 0 ? motionOffsetArg : OFFSET_ShadoEntity2D_motion;
  renderStateOffset = renderStateOffsetArg >= 0
    ? renderStateOffsetArg
    : OFFSET_ShadoEntity2D_renderState;
  activeIndexPtr = activeIndexPtrArg;
  activeIndexCapacity = activeIndexCapacityArg;
  activeIndexCount = 0;
  activeMarkerPtr = entityCapacity > 0 ? alloc(entityCapacity * 4) : 0;
  clearActiveMarkers();
  changedIndexPtr = changedIndexPtrArg;
  changedIndexCapacity = changedIndexCapacityArg;
  changedIndexCount = 0;
  expirationPtr = expirationPtrArg;
  expirationCapacity = expirationCapacityArg;
  expirationStrideBytes = expirationStrideBytesArg > 0
    ? expirationStrideBytesArg
    : SIZEOF_ShadoDynamicEntityExpirationRecord;
  expirationCount = 0;
}

export function applyDelta(deltaPtr: i32, deltaByteLength: i32): i32 {
  if (deltaByteLength < DELTA_HEADER_BYTES) return -1;
  if (load<u32>(deltaPtr) != DELTA_MAGIC) return -2;
  if (load<u32>(deltaPtr + 4) != DELTA_VERSION) return -3;

  const recordCount = load<i32>(deltaPtr + 8);
  const requiredBytes = DELTA_HEADER_BYTES + recordCount * SIZEOF_ShadoDynamicEntityDeltaRecord;
  if (recordCount < 0 || requiredBytes > deltaByteLength) return -4;

  let applied = 0;
  let recordPtr = deltaPtr + DELTA_HEADER_BYTES;
  for (let i = 0; i < recordCount; i++) {
    const record = changetype<ShadoDynamicEntityDeltaRecord>(recordPtr);
    const op = record.op;
    const index = record.index;
    if (isValidEntityIndex(index)) {
      if (op == OP_SET_DESTINATION) {
        setDestinationFromRecord(index, recordPtr);
        applied++;
      } else if (op == OP_DIRECT_PLACE) {
        directPlaceFromRecord(index, recordPtr);
        applied++;
      } else if (op == OP_SET_VISIBILITY) {
        setVisible(index, record.flags != 0);
        applied++;
      } else if (op == OP_SET_EXPIRATION) {
        setExpirationFromRecord(index, recordPtr);
        applied++;
      } else if (op == OP_MARK_ACTIVE) {
        markTransitionActive(index);
        applied++;
      }
    }
    recordPtr += SIZEOF_ShadoDynamicEntityDeltaRecord;
  }
  return applied;
}

export function stepTransitions(_nowMs: f64, dtMs: f64): i32 {
  const dtSeconds = Math.max(0, dtMs * 0.001);
  if (dtSeconds <= 0 || activeIndexCount <= 0) return 0;

  let moved = 0;
  let write = 0;
  for (let read = 0; read < activeIndexCount; read++) {
    const index = load<i32>(activeIndexPtr + read * 4);
    if (!isValidEntityIndex(index)) continue;

    const motionPtr = entityPtr(index) + motionOffset;
    if (load<f32>(motionPtr) <= 0) {
      setActiveMarker(index, false);
      continue;
    }

    const speed = Math.max(0.001, load<f32>(motionPtr + 4));
    const epsilon = Math.max(0.00001, load<f32>(motionPtr + 8));
    const alpha = 1 - Math.exp(-speed * dtSeconds);
    const positionPtr = entityPtr(index) + positionSizeOffset;
    const destinationPtr = entityPtr(index) + destinationSizeOffset;
    const position = v128.load(<usize>positionPtr);
    const destination = v128.load(<usize>destinationPtr);
    const next = f32x4.add(
      position,
      f32x4.mul(
        f32x4.sub(destination, position),
        f32x4.splat(<f32>alpha)
      )
    );
    const delta = f32x4.abs(f32x4.sub(destination, next));
    v128.store(<usize>positionPtr, next);

    let remaining = f32x4.extract_lane(delta, 0);
    remaining = <f32>Math.max(remaining, f32x4.extract_lane(delta, 1));
    remaining = <f32>Math.max(remaining, f32x4.extract_lane(delta, 2));
    remaining = <f32>Math.max(remaining, f32x4.extract_lane(delta, 3));

    if (remaining <= epsilon) {
      copyVec4(destinationPtr, positionPtr);
      store<f32>(motionPtr, 0);
      setActiveMarker(index, false);
    } else {
      store<i32>(activeIndexPtr + write * 4, index);
      write++;
    }
    addChanged(index);
    moved++;
  }

  activeIndexCount = write;
  return moved;
}

export function sweepExpired(frameId: i32, simulationTime: f64): i32 {
  if (expirationCount <= 0) return 0;

  let swept = 0;
  let write = 0;
  for (let read = 0; read < expirationCount; read++) {
    const recordPtr = expirationPtr + read * expirationStrideBytes;
    const record = changetype<ShadoDynamicEntityExpirationRecord>(recordPtr);
    const index = record.index;
    const removeAfterFrame = record.removeAfterFrame;
    const flags = record.flags;
    const removeAfterSimulationTime = record.removeAfterSimulationTime;
    const frameExpired =
      (flags & EXPIRATION_FLAG_FRAME) != 0 && removeAfterFrame <= frameId;
    const simulationExpired =
      (flags & EXPIRATION_FLAG_SIMULATION_TIME) != 0 &&
      removeAfterSimulationTime <= simulationTime;
    const noExplicitExpiry =
      (flags & (EXPIRATION_FLAG_FRAME | EXPIRATION_FLAG_SIMULATION_TIME)) == 0;

    if (isValidEntityIndex(index) && (frameExpired || simulationExpired || noExplicitExpiry)) {
      setVisible(index, false);
      store<f32>(entityPtr(index) + motionOffset, 0);
      swept++;
    } else {
      if (write != read) copyExpirationRecord(recordPtr, expirationPtr + write * expirationStrideBytes);
      write++;
    }
  }

  expirationCount = write;
  return swept;
}

export function buildTimeline(recordPtr: i32, recordByteLength: i32): i32 {
  if (recordByteLength < 8) return -1;
  const declaredLength = load<u64>(recordPtr);
  if (declaredLength > <u64>recordByteLength) return -2;
  timelinePtr = recordPtr;
  timelineByteLength = <i32>declaredLength;
  return timelineByteLength;
}

export function scrubTimeline(_anchorOffset: i32, _nextOffset: i32): i32 {
  return timelinePtr != 0 && timelineByteLength >= 8 ? 0 : -1;
}

export function getChangedIndexPtr(): i32 {
  return changedIndexPtr;
}

export function getChangedIndexCount(): i32 {
  return changedIndexCount;
}

export function clearChanged(): void {
  changedIndexCount = 0;
}

export function getActiveIndexPtr(): i32 {
  return activeIndexPtr;
}

export function getActiveIndexCount(): i32 {
  return activeIndexCount;
}

export function setActiveIndexCount(count: i32): void {
  activeIndexCount = clampCount(count, activeIndexCapacity);
  rebuildActiveMarkers();
}

export function getExpirationPtr(): i32 {
  return expirationPtr;
}

export function getExpirationCount(): i32 {
  return expirationCount;
}

export function setExpirationCount(count: i32): void {
  expirationCount = clampCount(count, expirationCapacity);
}

function entityPtr(index: i32): i32 {
  return entityBasePtr + index * entityStrideBytes;
}

function isValidEntityIndex(index: i32): bool {
  return index >= 0 && index < entityCapacity && entityStrideBytes > 0 && entityBasePtr != 0;
}

function setDestinationFromRecord(index: i32, recordPtr: i32): void {
  const record = changetype<ShadoDynamicEntityDeltaRecord>(recordPtr);
  const base = entityPtr(index);
  const destinationPtr = base + destinationSizeOffset;
  v128.store(<usize>destinationPtr, loadDeltaPositionSize(recordPtr));
  store<f32>(base + renderOffset, record.z);

  const motionPtr = base + motionOffset;
  store<f32>(motionPtr, 1);
  store<f32>(motionPtr + 4, <f32>Math.max(0.001, record.speed));
  store<f32>(base + renderStateOffset + 12, record.positionSize_y);
  setVisible(index, true);
  markTransitionActive(index);
  addChanged(index);
}

function directPlaceFromRecord(index: i32, recordPtr: i32): void {
  const record = changetype<ShadoDynamicEntityDeltaRecord>(recordPtr);
  const base = entityPtr(index);
  const positionPtr = base + positionSizeOffset;
  const destinationPtr = base + destinationSizeOffset;
  const positionSize = loadDeltaPositionSize(recordPtr);
  v128.store(<usize>positionPtr, positionSize);
  v128.store(<usize>destinationPtr, positionSize);
  store<f32>(base + renderOffset, record.z);
  store<f32>(base + motionOffset, 0);
  store<f32>(base + motionOffset + 4, <f32>Math.max(0.001, record.speed));
  store<f32>(base + renderStateOffset + 4, <f32>record.flags);
  store<f32>(base + renderStateOffset + 12, record.positionSize_y);
  addChanged(index);
}

function setVisible(index: i32, visible: bool): void {
  const flagsPtr = entityPtr(index) + renderStateOffset + 4;
  const flags = <i32>load<f32>(flagsPtr);
  store<f32>(flagsPtr, <f32>(visible ? flags | ENTITY_VISIBLE : flags & ~ENTITY_VISIBLE));
  addChanged(index);
}

function setExpirationFromRecord(index: i32, recordPtr: i32): void {
  if (expirationPtr == 0 || expirationCount >= expirationCapacity) return;
  const record = changetype<ShadoDynamicEntityDeltaRecord>(recordPtr);
  const out = expirationPtr + expirationCount * expirationStrideBytes;
  store<i32>(out + OFFSET_ShadoDynamicEntityExpirationRecord_index, index);
  store<i32>(
    out + OFFSET_ShadoDynamicEntityExpirationRecord_removeAfterFrame,
    record.removeAfterFrame
  );
  store<i32>(out + OFFSET_ShadoDynamicEntityExpirationRecord_flags, record.flags);
  store<i32>(out + OFFSET_ShadoDynamicEntityExpirationRecord_padding, 0);
  store<f64>(
    out + OFFSET_ShadoDynamicEntityExpirationRecord_removeAfterSimulationTime,
    record.removeAfterSimulationTime
  );
  expirationCount++;
}

function markTransitionActive(index: i32): void {
  if (activeIndexPtr == 0 || activeIndexCount >= activeIndexCapacity) return;
  if (getActiveMarker(index)) return;
  store<i32>(activeIndexPtr + activeIndexCount * 4, index);
  activeIndexCount++;
  setActiveMarker(index, true);
}

function addChanged(index: i32): void {
  if (changedIndexPtr == 0 || changedIndexCount >= changedIndexCapacity) return;
  store<i32>(changedIndexPtr + changedIndexCount * 4, index);
  changedIndexCount++;
}

function copyVec4(fromPtr: i32, toPtr: i32): void {
  v128.store(<usize>toPtr, v128.load(<usize>fromPtr));
}

function loadDeltaPositionSize(recordPtr: i32): v128 {
  return f32x4.max(
    v128.load(<usize>(recordPtr + OFFSET_ShadoDynamicEntityDeltaRecord_positionSize)),
    f32x4(-Infinity, -Infinity, 0.0001, 0.0001)
  );
}

function copyExpirationRecord(fromPtr: i32, toPtr: i32): void {
  v128.store(<usize>toPtr, v128.load(<usize>fromPtr));
  store<f64>(
    toPtr + OFFSET_ShadoDynamicEntityExpirationRecord_removeAfterSimulationTime,
    load<f64>(fromPtr + OFFSET_ShadoDynamicEntityExpirationRecord_removeAfterSimulationTime)
  );
}

function clampCount(count: i32, capacity: i32): i32 {
  if (count <= 0) return 0;
  return count > capacity ? capacity : count;
}

function getActiveMarker(index: i32): bool {
  return activeMarkerPtr != 0 && isValidEntityIndex(index) && load<i32>(activeMarkerPtr + index * 4) != 0;
}

function setActiveMarker(index: i32, active: bool): void {
  if (activeMarkerPtr == 0 || !isValidEntityIndex(index)) return;
  store<i32>(activeMarkerPtr + index * 4, active ? 1 : 0);
}

function clearActiveMarkers(): void {
  if (activeMarkerPtr == 0 || entityCapacity <= 0) return;
  for (let i = 0; i < entityCapacity; i++) {
    store<i32>(activeMarkerPtr + i * 4, 0);
  }
}

function rebuildActiveMarkers(): void {
  clearActiveMarkers();
  if (activeIndexPtr == 0 || activeIndexCount <= 0) return;
  let write = 0;
  for (let read = 0; read < activeIndexCount; read++) {
    const index = load<i32>(activeIndexPtr + read * 4);
    if (!isValidEntityIndex(index) || getActiveMarker(index)) continue;
    store<i32>(activeIndexPtr + write * 4, index);
    setActiveMarker(index, true);
    write++;
  }
  activeIndexCount = write;
}
