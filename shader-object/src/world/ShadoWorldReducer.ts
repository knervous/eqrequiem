import { SHADO_WORLD_REDUCER_WASM_BASE64 } from './world-reducer-wasm.generated';
import type { ShadoWorldSpatialPackage } from './types';

type ReducerExports = {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  queryWorldFrustum(descriptor: number): number;
  reduceWorldVisibility(descriptor: number): number;
  reduceEntityVisibility(descriptor: number): number;
};

const DESCRIPTOR_BYTES = 76;
const ENTITY_DESCRIPTOR_BYTES = 88;
const WORLD_VISIBILITY_DESCRIPTOR_BYTES = 116;

export type ShadoWasmSlice = {
  /** Byte offset in this reducer's WebAssembly linear memory. */
  ptr: number;
  /** Logical element count, not byte count. */
  length: number;
};

export type ShadoWorldReductionInput = {
  planes: ArrayLike<number>;
  cameraCell: number;
  cameraRegion: number;
  loadedCells?: ArrayLike<number>;
  phaseCells?: ArrayLike<number>;
  portalReachableCells?: ArrayLike<number>;
};

export type ShadoWorldReductionView = {
  visibleClusters: Uint32Array;
  visiblePackets: Uint32Array;
  clusterFlags: Uint8Array;
  cellFlags: Uint8Array;
  regionFlags: Uint8Array;
  packetFlags: Uint8Array;
  visibleClustersSlice: ShadoWasmSlice;
  visiblePacketsSlice: ShadoWasmSlice;
  clusterFlagsSlice: ShadoWasmSlice;
  cellFlagsSlice: ShadoWasmSlice;
  regionFlagsSlice: ShadoWasmSlice;
  packetFlagsSlice: ShadoWasmSlice;
  /** Resident six-plane input that may be reused by a same-frame entity pass. */
  planesPtr: number;
};

export type ShadoWorldEntityReductionInput = {
  count: number;
  positionX: ArrayLike<number>;
  positionY: ArrayLike<number>;
  positionZ: ArrayLike<number>;
  radius: ArrayLike<number>;
  planes?: ArrayLike<number>;
  /** Reuse a resident plane block in this reducer instead of copying 24 floats. */
  planesPtr?: number;
  cellFlags?: ArrayLike<number>;
  /** Reuse resident region policy in this reducer instead of copying bytes. */
  cellFlagsPtr?: number;
  camera: [number, number, number];
  maxDistance?: number;
  outsideWorldVisible?: boolean;
};

export class ShadoWorldReducer {
  private constructor(
    private readonly world: ShadoWorldSpatialPackage,
    private readonly wasm: ReducerExports,
    private readonly descriptorPtr: number,
    private readonly planesPtr: number,
    private readonly outputPtr: number,
    private readonly entityDescriptorPtr: number,
    private readonly cellFlagsPtr: number,
    private readonly tileLookupPtr: number,
    private readonly worldVisibilityDescriptorPtr: number,
    private readonly loadedPolicyPtr: number,
    private readonly phasePolicyPtr: number,
    private readonly portalPolicyPtr: number,
    private readonly visiblePacketsPtr: number,
    private readonly clusterFlagsPtr: number,
    private readonly worldCellFlagsPtr: number,
    private readonly regionFlagsPtr: number,
    private readonly packetFlagsPtr: number,
    private readonly clusterCount: number,
    private readonly cellCount: number,
    private readonly regionCount: number,
    private readonly packetCount: number,
    private readonly gridWidth: number,
    private readonly gridHeight: number,
    private readonly gridMinX: number,
    private readonly gridMinZ: number,
    private readonly gridOriginX: number,
    private readonly gridOriginZ: number,
    private readonly gridSize: number,
    private readonly gridCellCount: number
  ) {}

  private entityCapacity = 0;
  private entityXPtr = 0;
  private entityYPtr = 0;
  private entityZPtr = 0;
  private entityRadiusPtr = 0;
  private entityOutputPtr = 0;
  private entityFlagsPtr = 0;

  public static async create(world: ShadoWorldSpatialPackage): Promise<ShadoWorldReducer> {
    const bytes = decodeBase64(SHADO_WORLD_REDUCER_WASM_BASE64);
    const module = await WebAssembly.compile(new Uint8Array(bytes).buffer as ArrayBuffer);
    const instance = await WebAssembly.instantiate(module, {});
    const wasm = instance.exports as unknown as ReducerExports;
    const allocU16 = (values: number[]) => allocate(wasm, Uint16Array.from(values));
    const minX = allocU16(world.bvh.childMinX);
    const minY = allocU16(world.bvh.childMinY);
    const minZ = allocU16(world.bvh.childMinZ);
    const maxX = allocU16(world.bvh.childMaxX);
    const maxY = allocU16(world.bvh.childMaxY);
    const maxZ = allocU16(world.bvh.childMaxZ);
    const refs = allocate(wasm, Uint32Array.from(world.bvh.childRef));
    const planesPtr = wasm.alloc(24 * 4);
    const outputPtr = wasm.alloc(Math.max(1, world.clusters.radius.length) * 4);
    const stackPtr = wasm.alloc(Math.max(1, world.bvh.nodeCount) * 4);
    const descriptorPtr = wasm.alloc(DESCRIPTOR_BYTES);
    const view = new DataView(wasm.memory.buffer, descriptorPtr, DESCRIPTOR_BYTES);
    view.setUint32(0, world.bvh.nodeCount, true);
    view.setInt32(4, world.bvh.root, true);
    world.bvh.quantizationMin.forEach((value, i) => view.setFloat32(8 + i * 4, value, true));
    world.bvh.quantizationExtent.forEach((value, i) => view.setFloat32(20 + i * 4, value, true));
    [minX, minY, minZ, maxX, maxY, maxZ, refs, planesPtr, outputPtr].forEach((ptr, i) =>
      view.setUint32(32 + i * 4, ptr, true)
    );
    view.setUint32(68, world.clusters.radius.length, true);
    view.setUint32(72, stackPtr, true);
    const visibility = world.visibility;
    const minTileX = visibility ? 0 : world.tiles.x.length ? Math.min(...world.tiles.x) : 0;
    const maxTileX = visibility
      ? visibility.width - 1
      : world.tiles.x.length
        ? Math.max(...world.tiles.x)
        : 0;
    const minTileZ = visibility ? 0 : world.tiles.z.length ? Math.min(...world.tiles.z) : 0;
    const maxTileZ = visibility
      ? visibility.height - 1
      : world.tiles.z.length
        ? Math.max(...world.tiles.z)
        : 0;
    const gridWidth = Math.max(0, maxTileX - minTileX + 1);
    const gridHeight = Math.max(0, maxTileZ - minTileZ + 1);
    let tileLookupPtr = 0;
    if (!visibility) {
      const tileLookup = new Int32Array(gridWidth * gridHeight).fill(-1);
      world.tiles.x.forEach((x, cell) => {
        tileLookup[(world.tiles.z[cell] - minTileZ) * gridWidth + x - minTileX] = cell;
      });
      tileLookupPtr = allocate(wasm, tileLookup);
    }
    // A zero lookup pointer tells WASM that this is an exact dense row-major grid.
    const gridCellCount = visibility ? visibility.width * visibility.height : world.tiles.x.length;
    const cellFlagsPtr = wasm.alloc(Math.max(1, gridCellCount));
    const entityDescriptorPtr = wasm.alloc(ENTITY_DESCRIPTOR_BYTES);
    const cellCount = world.tiles.x.length;
    const clusterCount = world.clusters.radius.length;
    const packetCount = world.packets.cellId.length;
    const regionCount = visibility ? visibility.width * visibility.height : cellCount;
    const pvs = visibility?.pvs ?? world.pvs;
    const pvsWordsPtr = allocate(wasm, Uint32Array.from(pvs?.words ?? [0]));
    const cellRegionPtr = allocate(
      wasm,
      Uint32Array.from(
        visibility?.cellRegion ?? Array.from({ length: cellCount }, (_, cell) => cell)
      )
    );
    const persistentCellFlags = new Uint8Array(Math.max(1, cellCount));
    for (const cell of visibility?.persistentCells ?? []) {
      if (cell >= 0 && cell < cellCount) persistentCellFlags[cell] = 1;
    }
    const persistentCellPtr = allocate(wasm, persistentCellFlags);
    const loadedPolicyPtr = wasm.alloc(Math.max(1, cellCount));
    const phasePolicyPtr = wasm.alloc(Math.max(1, cellCount));
    const portalPolicyPtr = wasm.alloc(Math.max(1, cellCount));
    const clusterCellPtr = allocate(wasm, Uint32Array.from(world.clusters.cellId));
    const clusterPacketPtr = allocate(wasm, Uint32Array.from(world.clusters.materialPacket));
    const visiblePacketsPtr = wasm.alloc(Math.max(1, packetCount) * 4);
    const clusterFlagsPtr = wasm.alloc(Math.max(1, clusterCount));
    const worldCellFlagsPtr = wasm.alloc(Math.max(1, cellCount));
    const regionFlagsPtr = wasm.alloc(Math.max(1, regionCount));
    const packetFlagsPtr = wasm.alloc(Math.max(1, packetCount));
    const worldVisibilityDescriptorPtr = wasm.alloc(WORLD_VISIBILITY_DESCRIPTOR_BYTES);
    const worldDescriptor = new DataView(
      wasm.memory.buffer,
      worldVisibilityDescriptorPtr,
      WORLD_VISIBILITY_DESCRIPTOR_BYTES
    );
    const staticValues = [
      descriptorPtr,
      0,
      0,
      regionCount,
      cellCount,
      clusterCount,
      packetCount,
      pvsWordsPtr,
      pvs?.wordsPerRow ?? 0,
      visibility ? regionCount : cellCount,
      cellRegionPtr,
      persistentCellPtr,
      loadedPolicyPtr,
      phasePolicyPtr,
      portalPolicyPtr,
      clusterCellPtr,
      clusterPacketPtr,
      outputPtr,
      visiblePacketsPtr,
      clusterFlagsPtr,
      worldCellFlagsPtr,
      regionFlagsPtr,
      packetFlagsPtr,
    ];
    staticValues.forEach((value, index) => worldDescriptor.setUint32(index * 4, value >>> 0, true));
    worldDescriptor.setInt32(100, visibility ? 1 : 0, true);
    return new ShadoWorldReducer(
      world,
      wasm,
      descriptorPtr,
      planesPtr,
      outputPtr,
      entityDescriptorPtr,
      cellFlagsPtr,
      tileLookupPtr,
      worldVisibilityDescriptorPtr,
      loadedPolicyPtr,
      phasePolicyPtr,
      portalPolicyPtr,
      visiblePacketsPtr,
      clusterFlagsPtr,
      worldCellFlagsPtr,
      regionFlagsPtr,
      packetFlagsPtr,
      clusterCount,
      cellCount,
      regionCount,
      packetCount,
      gridWidth,
      gridHeight,
      minTileX,
      minTileZ,
      visibility?.originX ?? world.tiles.originX,
      visibility?.originZ ?? world.tiles.originZ,
      visibility?.size ?? world.tiles.size,
      gridCellCount
    );
  }

  public queryFrustum(planes: ArrayLike<number>): Uint32Array {
    if (planes.length < 24) throw new Error('World reducer requires six vec4 frustum planes');
    copyFloat32(this.wasm.memory, this.planesPtr, planes, 24);
    const count = this.wasm.queryWorldFrustum(this.descriptorPtr);
    if (count < 0 || count > this.world.clusters.radius.length) {
      throw new Error(`World reducer returned invalid visible count ${count}`);
    }
    return new Uint32Array(this.wasm.memory.buffer, this.outputPtr, count);
  }

  /**
   * Runs PVS expansion, dynamic cell policy, BVH traversal, policy intersection,
   * and cluster/packet compaction in one WASM call.
   *
   * Every returned array is a borrowed view over a persistent pointer. No
   * result payload is allocated or copied. Views are valid until the reducer
   * is called again or its memory grows; use refreshWorldReductionViews() after
   * a call that may grow memory.
   */
  public reduceWorld(input: ShadoWorldReductionInput): ShadoWorldReductionView {
    if (input.planes.length < 24) {
      throw new Error('World reducer requires six vec4 frustum planes');
    }
    copyFloat32(this.wasm.memory, this.planesPtr, input.planes, 24);
    copyPolicy(this.wasm.memory, this.loadedPolicyPtr, this.cellCount, input.loadedCells);
    copyPolicy(this.wasm.memory, this.phasePolicyPtr, this.cellCount, input.phaseCells);
    copyPolicy(this.wasm.memory, this.portalPolicyPtr, this.cellCount, input.portalReachableCells);
    const descriptor = new DataView(
      this.wasm.memory.buffer,
      this.worldVisibilityDescriptorPtr,
      WORLD_VISIBILITY_DESCRIPTOR_BYTES
    );
    descriptor.setInt32(4, input.cameraCell | 0, true);
    descriptor.setInt32(8, input.cameraRegion | 0, true);
    descriptor.setInt32(104, input.loadedCells ? 1 : 0, true);
    descriptor.setInt32(108, input.phaseCells ? 1 : 0, true);
    descriptor.setInt32(112, input.portalReachableCells ? 1 : 0, true);
    const visibleCount = this.wasm.reduceWorldVisibility(this.worldVisibilityDescriptorPtr);
    const visiblePacketCount = descriptor.getUint32(96, true);
    if (visibleCount < 0 || visibleCount > this.clusterCount) {
      throw new Error(`World reducer returned invalid visible count ${visibleCount}`);
    }
    if (visiblePacketCount > this.packetCount) {
      throw new Error(`World reducer returned invalid packet count ${visiblePacketCount}`);
    }
    return this.worldReductionViews(visibleCount, visiblePacketCount);
  }

  /** Reacquires borrowed views after WebAssembly.Memory growth detached old views. */
  public refreshWorldReductionViews(view: ShadoWorldReductionView): void {
    const refreshed = this.worldReductionViews(
      view.visibleClustersSlice.length,
      view.visiblePacketsSlice.length
    );
    view.visibleClusters = refreshed.visibleClusters;
    view.visiblePackets = refreshed.visiblePackets;
    view.clusterFlags = refreshed.clusterFlags;
    view.cellFlags = refreshed.cellFlags;
    view.regionFlags = refreshed.regionFlags;
    view.packetFlags = refreshed.packetFlags;
  }

  public reduceEntities(input: ShadoWorldEntityReductionInput): {
    visibleIndices: Uint32Array;
    flags: Uint8Array;
  } {
    if (!input.planesPtr && (!input.planes || input.planes.length < 24)) {
      throw new Error('Entity reducer requires six vec4 planes or a resident planes pointer');
    }
    if (!input.cellFlagsPtr && !input.cellFlags) {
      throw new Error('Entity reducer requires cell flags or a resident cell-flags pointer');
    }
    const count = Math.max(0, input.count | 0);
    this.ensureEntityCapacity(count);
    copyFloat32(this.wasm.memory, this.entityXPtr, input.positionX, count);
    copyFloat32(this.wasm.memory, this.entityYPtr, input.positionY, count);
    copyFloat32(this.wasm.memory, this.entityZPtr, input.positionZ, count);
    copyFloat32(this.wasm.memory, this.entityRadiusPtr, input.radius, count);
    if (!input.planesPtr) copyFloat32(this.wasm.memory, this.planesPtr, input.planes!, 24);
    if (!input.cellFlagsPtr) {
      copyUint8(this.wasm.memory, this.cellFlagsPtr, input.cellFlags!, this.gridCellCount);
    }
    const residentPlanesPtr = input.planesPtr || this.planesPtr;
    const residentCellFlagsPtr = input.cellFlagsPtr || this.cellFlagsPtr;
    const descriptor = new DataView(
      this.wasm.memory.buffer,
      this.entityDescriptorPtr,
      ENTITY_DESCRIPTOR_BYTES
    );
    [
      count,
      this.entityXPtr,
      this.entityYPtr,
      this.entityZPtr,
      this.entityRadiusPtr,
      residentPlanesPtr,
      residentCellFlagsPtr,
      this.tileLookupPtr,
    ].forEach((value, index) => descriptor.setUint32(index * 4, value >>> 0, true));
    descriptor.setInt32(32, this.gridWidth, true);
    descriptor.setInt32(36, this.gridHeight, true);
    descriptor.setInt32(40, this.gridMinX, true);
    descriptor.setInt32(44, this.gridMinZ, true);
    descriptor.setFloat32(48, this.gridOriginX, true);
    descriptor.setFloat32(52, this.gridOriginZ, true);
    descriptor.setFloat32(56, this.gridSize, true);
    input.camera.forEach((value, axis) => descriptor.setFloat32(60 + axis * 4, value, true));
    descriptor.setFloat32(72, Math.max(0, input.maxDistance ?? 0), true);
    descriptor.setInt32(76, input.outsideWorldVisible === false ? 0 : 1, true);
    descriptor.setUint32(80, this.entityOutputPtr, true);
    descriptor.setUint32(84, this.entityFlagsPtr, true);
    const visibleCount = this.wasm.reduceEntityVisibility(this.entityDescriptorPtr);
    if (visibleCount < 0 || visibleCount > count) {
      throw new Error(`World entity reducer returned invalid visible count ${visibleCount}`);
    }
    return {
      visibleIndices: new Uint32Array(this.wasm.memory.buffer, this.entityOutputPtr, visibleCount),
      flags: new Uint8Array(this.wasm.memory.buffer, this.entityFlagsPtr, count),
    };
  }

  private worldReductionViews(
    visibleClusterCount: number,
    visiblePacketCount: number
  ): ShadoWorldReductionView {
    return {
      visibleClusters: new Uint32Array(
        this.wasm.memory.buffer,
        this.outputPtr,
        visibleClusterCount
      ),
      visiblePackets: new Uint32Array(
        this.wasm.memory.buffer,
        this.visiblePacketsPtr,
        visiblePacketCount
      ),
      clusterFlags: new Uint8Array(
        this.wasm.memory.buffer,
        this.clusterFlagsPtr,
        this.clusterCount
      ),
      cellFlags: new Uint8Array(this.wasm.memory.buffer, this.worldCellFlagsPtr, this.cellCount),
      regionFlags: new Uint8Array(this.wasm.memory.buffer, this.regionFlagsPtr, this.regionCount),
      packetFlags: new Uint8Array(this.wasm.memory.buffer, this.packetFlagsPtr, this.packetCount),
      visibleClustersSlice: { ptr: this.outputPtr, length: visibleClusterCount },
      visiblePacketsSlice: { ptr: this.visiblePacketsPtr, length: visiblePacketCount },
      clusterFlagsSlice: { ptr: this.clusterFlagsPtr, length: this.clusterCount },
      cellFlagsSlice: { ptr: this.worldCellFlagsPtr, length: this.cellCount },
      regionFlagsSlice: { ptr: this.regionFlagsPtr, length: this.regionCount },
      packetFlagsSlice: { ptr: this.packetFlagsPtr, length: this.packetCount },
      planesPtr: this.planesPtr,
    };
  }

  private ensureEntityCapacity(count: number): void {
    if (count <= this.entityCapacity) return;
    let capacity = Math.max(4, this.entityCapacity);
    while (capacity < count) capacity *= 2;
    this.entityCapacity = capacity;
    this.entityXPtr = this.wasm.alloc(capacity * 4);
    this.entityYPtr = this.wasm.alloc(capacity * 4);
    this.entityZPtr = this.wasm.alloc(capacity * 4);
    this.entityRadiusPtr = this.wasm.alloc(capacity * 4);
    this.entityOutputPtr = this.wasm.alloc(capacity * 4);
    this.entityFlagsPtr = this.wasm.alloc(capacity);
  }
}

function allocate(
  wasm: ReducerExports,
  values: Uint8Array | Uint16Array | Uint32Array | Int32Array
): number {
  const pointer = wasm.alloc(values.byteLength);
  if (values instanceof Uint8Array)
    new Uint8Array(wasm.memory.buffer, pointer, values.length).set(values);
  else if (values instanceof Uint16Array)
    new Uint16Array(wasm.memory.buffer, pointer, values.length).set(values);
  else if (values instanceof Int32Array)
    new Int32Array(wasm.memory.buffer, pointer, values.length).set(values);
  else new Uint32Array(wasm.memory.buffer, pointer, values.length).set(values);
  return pointer;
}

function copyFloat32(
  memory: WebAssembly.Memory,
  pointer: number,
  source: ArrayLike<number>,
  count: number
): void {
  const target = new Float32Array(memory.buffer, pointer, count);
  if (source instanceof Float32Array) {
    target.set(source.subarray(0, count));
    return;
  }
  for (let index = 0; index < count; index++) target[index] = Number(source[index] ?? 0);
}

function copyUint8(
  memory: WebAssembly.Memory,
  pointer: number,
  source: ArrayLike<number>,
  count: number
): void {
  const target = new Uint8Array(memory.buffer, pointer, count);
  if (source instanceof Uint8Array) {
    target.set(source.subarray(0, count));
    return;
  }
  for (let index = 0; index < count; index++) target[index] = Number(source[index] ?? 0);
}

function copyPolicy(
  memory: WebAssembly.Memory,
  pointer: number,
  count: number,
  source: ArrayLike<number> | undefined
): void {
  const target = new Uint8Array(memory.buffer, pointer, count);
  if (!source) {
    target.fill(1);
    return;
  }
  target.fill(0);
  copyUint8(memory, pointer, source, Math.min(count, source.length));
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
