import { SHADO_WORLD_REDUCER_WASM_BASE64 } from './world-reducer-wasm.generated';
import type { ShadoWorldSpatialPackage } from './types';

type ReducerExports = {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  queryWorldFrustum(descriptor: number): number;
  reduceEntityVisibility(descriptor: number): number;
};

const DESCRIPTOR_BYTES = 76;
const ENTITY_DESCRIPTOR_BYTES = 88;

export type ShadoWorldEntityReductionInput = {
  count: number;
  positionX: ArrayLike<number>;
  positionY: ArrayLike<number>;
  positionZ: ArrayLike<number>;
  radius: ArrayLike<number>;
  planes: ArrayLike<number>;
  cellFlags: ArrayLike<number>;
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
    private readonly gridWidth: number,
    private readonly gridHeight: number,
    private readonly gridMinX: number,
    private readonly gridMinZ: number
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
    const minTileX = world.tiles.x.length ? Math.min(...world.tiles.x) : 0;
    const maxTileX = world.tiles.x.length ? Math.max(...world.tiles.x) : 0;
    const minTileZ = world.tiles.z.length ? Math.min(...world.tiles.z) : 0;
    const maxTileZ = world.tiles.z.length ? Math.max(...world.tiles.z) : 0;
    const gridWidth = maxTileX - minTileX + 1;
    const gridHeight = maxTileZ - minTileZ + 1;
    const tileLookup = new Int32Array(gridWidth * gridHeight).fill(-1);
    world.tiles.x.forEach((x, cell) => {
      tileLookup[(world.tiles.z[cell] - minTileZ) * gridWidth + x - minTileX] = cell;
    });
    const tileLookupPtr = allocate(wasm, tileLookup);
    const cellFlagsPtr = wasm.alloc(Math.max(1, world.tiles.x.length));
    const entityDescriptorPtr = wasm.alloc(ENTITY_DESCRIPTOR_BYTES);
    return new ShadoWorldReducer(
      world, wasm, descriptorPtr, planesPtr, outputPtr,
      entityDescriptorPtr, cellFlagsPtr, tileLookupPtr,
      gridWidth, gridHeight, minTileX, minTileZ
    );
  }

  public queryFrustum(planes: ArrayLike<number>): Uint32Array {
    if (planes.length < 24) throw new Error('World reducer requires six vec4 frustum planes');
    new Float32Array(this.wasm.memory.buffer, this.planesPtr, 24).set(
      Array.from(planes).slice(0, 24)
    );
    const count = this.wasm.queryWorldFrustum(this.descriptorPtr);
    if (count < 0 || count > this.world.clusters.radius.length) {
      throw new Error(`World reducer returned invalid visible count ${count}`);
    }
    return new Uint32Array(this.wasm.memory.buffer, this.outputPtr, count).slice();
  }

  public reduceEntities(input: ShadoWorldEntityReductionInput): {
    visibleIndices: Uint32Array;
    flags: Uint8Array;
  } {
    if (input.planes.length < 24) throw new Error('Entity reducer requires six vec4 planes');
    const count = Math.max(0, input.count | 0);
    this.ensureEntityCapacity(count);
    new Float32Array(this.wasm.memory.buffer, this.entityXPtr, count).set(
      Float32Array.from(input.positionX as ArrayLike<number>).subarray(0, count)
    );
    new Float32Array(this.wasm.memory.buffer, this.entityYPtr, count).set(
      Float32Array.from(input.positionY as ArrayLike<number>).subarray(0, count)
    );
    new Float32Array(this.wasm.memory.buffer, this.entityZPtr, count).set(
      Float32Array.from(input.positionZ as ArrayLike<number>).subarray(0, count)
    );
    new Float32Array(this.wasm.memory.buffer, this.entityRadiusPtr, count).set(
      Float32Array.from(input.radius as ArrayLike<number>).subarray(0, count)
    );
    new Float32Array(this.wasm.memory.buffer, this.planesPtr, 24).set(
      Array.from(input.planes).slice(0, 24)
    );
    new Uint8Array(this.wasm.memory.buffer, this.cellFlagsPtr, this.world.tiles.x.length).set(
      Uint8Array.from(input.cellFlags as ArrayLike<number>).subarray(0, this.world.tiles.x.length)
    );
    const descriptor = new DataView(
      this.wasm.memory.buffer, this.entityDescriptorPtr, ENTITY_DESCRIPTOR_BYTES
    );
    [count, this.entityXPtr, this.entityYPtr, this.entityZPtr, this.entityRadiusPtr,
      this.planesPtr, this.cellFlagsPtr, this.tileLookupPtr].forEach((value, index) =>
      descriptor.setUint32(index * 4, value >>> 0, true)
    );
    descriptor.setInt32(32, this.gridWidth, true);
    descriptor.setInt32(36, this.gridHeight, true);
    descriptor.setInt32(40, this.gridMinX, true);
    descriptor.setInt32(44, this.gridMinZ, true);
    descriptor.setFloat32(48, this.world.tiles.originX, true);
    descriptor.setFloat32(52, this.world.tiles.originZ, true);
    descriptor.setFloat32(56, this.world.tiles.size, true);
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
      visibleIndices: new Uint32Array(
        this.wasm.memory.buffer, this.entityOutputPtr, visibleCount
      ).slice(),
      flags: new Uint8Array(this.wasm.memory.buffer, this.entityFlagsPtr, count).slice(),
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
  values: Uint16Array | Uint32Array | Int32Array
): number {
  const pointer = wasm.alloc(values.byteLength);
  if (values instanceof Uint16Array)
    new Uint16Array(wasm.memory.buffer, pointer, values.length).set(values);
  else if (values instanceof Int32Array)
    new Int32Array(wasm.memory.buffer, pointer, values.length).set(values);
  else new Uint32Array(wasm.memory.buffer, pointer, values.length).set(values);
  return pointer;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
