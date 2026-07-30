import { FloatArena } from '../arena/FloatArena';
import type { DirtyRange } from '../arena/DirtyPageTracker';
import { OPFS_DEFERRED_STORAGE_WORKER_SOURCE } from './opfsWorkerSource';

export interface DeferredStorageWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  removeEventListener?(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener?(type: 'error', listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

export interface DeferredStorageSlabStoreOptions {
  /** Exact OPFS leaf name. Slashes and traversal segments are rejected. */
  fileName: string;
  /** Optional OPFS subdirectories below the origin-private root. */
  directory?: string | readonly string[];
  /** Minimum file size on first open. Existing larger files are preserved. */
  initialByteLength?: number;
  /** Fixed mapped working-set size. Must contain complete records. */
  slabByteLength?: number;
  /** Packed instance/AoS row stride. Slabs never split rows. */
  recordStrideBytes?: number;
  /** Maximum cached typed-array working set. */
  maxResidentSlabs?: number;
  /**
   * Sparse dirty snapshots are combined up to this bounded size before one
   * worker writeback. Explicit flush/close always drains and synchronizes.
   */
  maxPendingWritebackBytes?: number;
  /**
   * Let the OPFS worker populate a SharedArrayBuffer directly when the page is
   * cross-origin isolated. Dirty flushes are still snapshotted for consistency.
   */
  preferSharedArrayBuffer?: boolean;
  /** Test/host injection point. Defaults to a dedicated browser Worker. */
  workerFactory?: () => DeferredStorageWorkerLike;
}

export interface DeferredStorageStats {
  mapReads: number;
  cacheHits: number;
  evictions: number;
  flushes: number;
  bytesRead: number;
  bytesWritten: number;
  writebackBatches: number;
  syncs: number;
  pendingWritebackBytes: number;
  peakPendingWritebackBytes: number;
  peakResidentSlabs: number;
  peakResidentBytes: number;
}

type RpcResponse = {
  id: number;
  ok: boolean;
  result?: any;
  error?: string;
};

type PendingRpc = {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
};

type PendingWriteback = {
  fileOffset: number;
  bytes: Uint8Array;
};

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function validateLeaf(value: string, name: string): string {
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    /[/\\]/.test(value) ||
    value.includes(String.fromCharCode(0))
  ) {
    throw new Error(`${name} must be an exact OPFS path segment`);
  }
  return value;
}

function normalizeDirectory(directory: string | readonly string[] | undefined): string[] {
  if (directory == null || directory === '') return [];
  const segments = typeof directory === 'string' ? directory.split('/') : [...directory];
  return segments
    .filter(Boolean)
    .map((segment, index) => validateLeaf(segment, `directory[${index}]`));
}

function defaultWorkerFactory(): DeferredStorageWorkerLike {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    throw new Error('OPFS deferred storage requires a browser dedicated Worker');
  }
  const url = URL.createObjectURL(
    new Blob([OPFS_DEFERRED_STORAGE_WORKER_SOURCE], { type: 'text/javascript' })
  );
  try {
    return new Worker(url, { name: 'shado-opfs-deferred-storage' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * One explicitly mapped, fixed-capacity working-set slab.
 *
 * Its float access and dirty APIs intentionally mirror FloatArena. Unlike a
 * growable arena, ensureCapacity throws at the slab boundary; callers map the
 * next slab instead. `release()` is the equivalent of unmapping a lease.
 */
export class DeferredStorageSlab {
  public readonly slabIndex: number;
  public readonly byteOffset: number;
  public readonly byteLength: number;
  public readonly validByteLength: number;
  public readonly recordStrideBytes: number;
  public readonly recordCapacity: number;
  public readonly validRecordCount: number;

  private readonly arena: FloatArena;
  private mapped = true;
  private leases = 1;

  public constructor(
    private readonly owner: DeferredStorageSlabStore,
    slabIndex: number,
    buffer: ArrayBufferLike,
    validByteLength: number
  ) {
    this.slabIndex = slabIndex;
    this.byteOffset = slabIndex * owner.slabByteLength;
    this.byteLength = owner.slabByteLength;
    this.validByteLength = validByteLength;
    this.recordStrideBytes = owner.recordStrideBytes;
    this.recordCapacity = this.byteLength / this.recordStrideBytes;
    this.validRecordCount = Math.ceil(validByteLength / this.recordStrideBytes);
    this.arena = new FloatArena(0);
    this.arena.adopt(new Float32Array(buffer));
    this.arena.markClean();
  }

  public get isMapped(): boolean {
    return this.mapped;
  }

  public get leaseCount(): number {
    return this.leases;
  }

  public ensureCapacity(nextFloats: number): void {
    this.assertMapped();
    if (nextFloats > this.byteLength / 4) {
      throw new RangeError(
        `Deferred slab ${this.slabIndex} is fixed at ${this.byteLength / 4} floats`
      );
    }
  }

  public write(
    floatOffset: number,
    source: ArrayLike<number>,
    floatLength = (source as any).length ?? 0
  ): void {
    this.assertMapped();
    this.assertFloatRange(floatOffset, floatLength);
    this.arena.write(floatOffset, source, floatLength);
  }

  public view(floatOffset: number, floatLength: number): Float32Array {
    this.assertMapped();
    this.assertFloatRange(floatOffset, floatLength);
    return this.arena.view(floatOffset, floatLength);
  }

  public take(): Float32Array {
    this.assertMapped();
    return this.arena.take();
  }

  public dataView(): DataView {
    this.assertMapped();
    return this.arena.dataView();
  }

  public recordBytes(localRecordIndex: number): Uint8Array {
    this.assertRecord(localRecordIndex);
    return new Uint8Array(
      this.arena.take().buffer,
      localRecordIndex * this.recordStrideBytes,
      this.recordStrideBytes
    );
  }

  public recordDataView(localRecordIndex: number): DataView {
    this.assertRecord(localRecordIndex);
    return new DataView(
      this.arena.take().buffer,
      localRecordIndex * this.recordStrideBytes,
      this.recordStrideBytes
    );
  }

  public writeRecords(localRecordIndex: number, source: ArrayBufferView): void {
    this.assertMapped();
    if (source.byteLength % this.recordStrideBytes !== 0) {
      throw new RangeError('Record payload must contain complete packed records');
    }
    const byteOffset = localRecordIndex * this.recordStrideBytes;
    this.assertByteRange(byteOffset, source.byteLength);
    new Uint8Array(this.arena.take().buffer, byteOffset, source.byteLength).set(
      new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    );
    this.arena.markDirtyBytes(byteOffset, source.byteLength);
  }

  public isDirty(): boolean {
    this.assertMapped();
    return this.arena.isDirty();
  }

  public markClean(): void {
    this.assertMapped();
    this.arena.markClean();
  }

  public markDirty(): void {
    this.assertMapped();
    this.arena.markDirty();
  }

  public markDirtyFloats(floatOffset: number, floatLength: number): void {
    this.assertMapped();
    this.assertFloatRange(floatOffset, floatLength);
    this.arena.markDirtyFloats(floatOffset, floatLength);
  }

  public markDirtyBytes(byteOffset: number, byteLength: number): void {
    this.assertMapped();
    this.assertByteRange(byteOffset, byteLength);
    this.arena.markDirtyBytes(byteOffset, byteLength);
  }

  public consumeDirtyRanges(): readonly DirtyRange[] {
    this.assertMapped();
    return this.arena.consumeDirtyRanges();
  }

  public flush(): Promise<void> {
    this.assertMapped();
    return this.owner.flushSlab(this);
  }

  public release(): void {
    this.assertMapped();
    this.owner.releaseSlab(this);
  }

  /** @internal */
  public _acquire(): void {
    this.assertMapped();
    this.leases++;
  }

  /** @internal */
  public _releaseLease(): void {
    this.leases = Math.max(0, this.leases - 1);
  }

  /** @internal */
  public _consumeDirtyRanges(): readonly DirtyRange[] {
    return this.arena.consumeDirtyRanges();
  }

  /** @internal */
  public _restoreDirtyRanges(ranges: readonly DirtyRange[]): void {
    for (const range of ranges) {
      this.arena.markDirtyBytes(range.start, range.end - range.start);
    }
  }

  /** @internal */
  public _unmap(): void {
    this.mapped = false;
    this.leases = 0;
  }

  private assertMapped(): void {
    if (!this.mapped) {
      throw new Error(`Deferred slab ${this.slabIndex} has been unmapped`);
    }
  }

  private assertFloatRange(offset: number, length: number): void {
    this.assertByteRange(offset * 4, length * 4);
  }

  private assertByteRange(offset: number, length: number): void {
    nonNegativeInteger(offset, 'byteOffset');
    nonNegativeInteger(length, 'byteLength');
    if (offset + length > this.validByteLength) {
      throw new RangeError(
        `Range ${offset}..${offset + length} exceeds slab ${this.slabIndex} valid length ${this.validByteLength}`
      );
    }
  }

  private assertRecord(localRecordIndex: number): void {
    nonNegativeInteger(localRecordIndex, 'localRecordIndex');
    if (localRecordIndex >= this.validRecordCount) {
      throw new RangeError(
        `Record ${localRecordIndex} exceeds slab ${this.slabIndex} valid record count ${this.validRecordCount}`
      );
    }
  }
}

/**
 * Bounded working-set storage for packed instance rows in OPFS.
 *
 * OPFS is not a true operating-system mmap: mapping is explicit and async.
 * The dedicated worker owns the exclusive FileSystemSyncAccessHandle while
 * the main thread sees normal typed-array slabs. Sparse dirty pages are
 * snapshotted and flushed without putting the full file on the frame path.
 */
export class DeferredStorageSlabStore {
  public readonly slabByteLength: number;
  public readonly recordStrideBytes: number;
  public readonly recordsPerSlab: number;
  public readonly maxResidentSlabs: number;
  public readonly maxPendingWritebackBytes: number;

  private readonly worker: DeferredStorageWorkerLike;
  private readonly directory: string[];
  private readonly fileName: string;
  private readonly preferSharedArrayBuffer: boolean;
  private readonly pending = new Map<number, PendingRpc>();
  private readonly resident = new Map<number, DeferredStorageSlab>();
  private readonly loading = new Map<number, Promise<DeferredStorageSlab>>();
  private readonly pendingWritebacks: PendingWriteback[] = [];
  private pendingWritebackBytesValue = 0;
  private readonly statsValue: DeferredStorageStats = {
    mapReads: 0,
    cacheHits: 0,
    evictions: 0,
    flushes: 0,
    bytesRead: 0,
    bytesWritten: 0,
    writebackBatches: 0,
    syncs: 0,
    pendingWritebackBytes: 0,
    peakPendingWritebackBytes: 0,
    peakResidentSlabs: 0,
    peakResidentBytes: 0,
  };
  private nextRequestId = 1;
  private logicalBytes = 0;
  private closed = false;
  private loadQueue: Promise<void> = Promise.resolve();
  private writebackQueue: Promise<void> = Promise.resolve();
  private unsynchronizedWriteback = false;

  private readonly onMessage = (event: MessageEvent): void => {
    const response = event.data as RpcResponse;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error || 'Deferred storage worker failed'));
  };

  private readonly onError = (event: ErrorEvent): void => {
    const error = new Error(event.message || 'Deferred storage worker crashed');
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  };

  private constructor(options: DeferredStorageSlabStoreOptions) {
    this.fileName = validateLeaf(options.fileName, 'fileName');
    this.directory = normalizeDirectory(options.directory);
    this.recordStrideBytes = positiveInteger(options.recordStrideBytes ?? 16, 'recordStrideBytes');
    if (this.recordStrideBytes % 4 !== 0) {
      throw new RangeError('recordStrideBytes must be a multiple of four');
    }
    this.slabByteLength = positiveInteger(
      options.slabByteLength ?? 4 * 1024 * 1024,
      'slabByteLength'
    );
    if (this.slabByteLength % this.recordStrideBytes !== 0) {
      throw new RangeError('slabByteLength must contain complete packed records');
    }
    this.recordsPerSlab = this.slabByteLength / this.recordStrideBytes;
    this.maxResidentSlabs = positiveInteger(options.maxResidentSlabs ?? 4, 'maxResidentSlabs');
    this.maxPendingWritebackBytes = positiveInteger(
      options.maxPendingWritebackBytes ?? 1024 * 1024,
      'maxPendingWritebackBytes'
    );
    this.preferSharedArrayBuffer = options.preferSharedArrayBuffer ?? true;
    this.worker = (options.workerFactory ?? defaultWorkerFactory)();
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onError);
  }

  public static async open(
    options: DeferredStorageSlabStoreOptions
  ): Promise<DeferredStorageSlabStore> {
    const store = new DeferredStorageSlabStore(options);
    const minimumByteLength = nonNegativeInteger(
      options.initialByteLength ?? 0,
      'initialByteLength'
    );
    if (minimumByteLength % store.recordStrideBytes !== 0) {
      store.disposeWorker();
      throw new RangeError('initialByteLength must contain complete packed records');
    }
    try {
      const result = await store.rpc('open', {
        directory: store.directory,
        fileName: store.fileName,
        minimumByteLength,
      });
      store.logicalBytes = result.byteLength;
      return store;
    } catch (error) {
      store.disposeWorker();
      throw error;
    }
  }

  public get logicalByteLength(): number {
    return this.logicalBytes;
  }

  public get logicalRecordCount(): number {
    return this.logicalBytes / this.recordStrideBytes;
  }

  public get slabCount(): number {
    return Math.ceil(this.logicalBytes / this.slabByteLength);
  }

  public get residentSlabCount(): number {
    return this.resident.size;
  }

  public get residentByteLength(): number {
    return this.resident.size * this.slabByteLength;
  }

  public get stats(): Readonly<DeferredStorageStats> {
    return {
      ...this.statsValue,
      pendingWritebackBytes: this.pendingWritebackByteLength,
    };
  }

  public get pendingWritebackByteLength(): number {
    return this.pendingWritebackBytesValue;
  }

  public async resize(byteLength: number): Promise<void> {
    this.assertOpen();
    const next = nonNegativeInteger(byteLength, 'byteLength');
    if (next % this.recordStrideBytes !== 0) {
      throw new RangeError('byteLength must contain complete packed records');
    }
    await this.flush();
    await this.rpc('resize', { byteLength: next });
    this.logicalBytes = next;
    for (const [index, slab] of this.resident) {
      const expectedValidByteLength =
        index >= this.slabCount
          ? 0
          : Math.min(this.slabByteLength, next - index * this.slabByteLength);
      if (slab.validByteLength !== expectedValidByteLength) {
        slab._unmap();
        this.resident.delete(index);
      }
    }
  }

  public resizeRecords(recordCount: number): Promise<void> {
    return this.resize(nonNegativeInteger(recordCount, 'recordCount') * this.recordStrideBytes);
  }

  public async mapSlab(slabIndex: number): Promise<DeferredStorageSlab> {
    this.assertOpen();
    const index = nonNegativeInteger(slabIndex, 'slabIndex');
    if (index >= this.slabCount) {
      throw new RangeError(`Slab ${index} is outside 0..${this.slabCount - 1}`);
    }

    const cached = this.resident.get(index);
    if (cached) {
      cached._acquire();
      this.touch(index, cached);
      this.statsValue.cacheHits++;
      return cached;
    }
    const activeLoad = this.loading.get(index);
    if (activeLoad) {
      const slab = await activeLoad;
      slab._acquire();
      return slab;
    }

    const load = this.queueSlabLoad(index);
    this.loading.set(index, load);
    try {
      return await load;
    } finally {
      this.loading.delete(index);
    }
  }

  public mapRecordSlab(recordIndex: number): Promise<DeferredStorageSlab> {
    const index = nonNegativeInteger(recordIndex, 'recordIndex');
    if (index >= this.logicalRecordCount) {
      throw new RangeError(`Record ${index} is outside 0..${this.logicalRecordCount - 1}`);
    }
    return this.mapSlab(Math.floor(index / this.recordsPerSlab));
  }

  public localRecordIndex(recordIndex: number): number {
    return nonNegativeInteger(recordIndex, 'recordIndex') % this.recordsPerSlab;
  }

  /**
   * Page in selected slabs ahead of use, then leave them as unleased LRU
   * residents. Supplying more than maxResidentSlabs retains the newest set.
   */
  public async prefetchSlabs(slabIndices: Iterable<number>): Promise<void> {
    const unique = [...new Set(slabIndices)];
    for (const slabIndex of unique) {
      const slab = await this.mapSlab(slabIndex);
      slab.release();
    }
  }

  /** Prefetch every complete slab intersecting a packed-record range. */
  public prefetchRecordRange(startRecord: number, recordCount: number): Promise<void> {
    const start = nonNegativeInteger(startRecord, 'startRecord');
    const count = nonNegativeInteger(recordCount, 'recordCount');
    if (count === 0) return Promise.resolve();
    if (start + count > this.logicalRecordCount) {
      throw new RangeError(
        `Record range ${start}..${start + count} exceeds logical count ${this.logicalRecordCount}`
      );
    }
    const first = Math.floor(start / this.recordsPerSlab);
    const last = Math.floor((start + count - 1) / this.recordsPerSlab);
    return this.prefetchSlabs(
      Array.from({ length: last - first + 1 }, (_, index) => first + index)
    );
  }

  public async usingSlab<T>(
    slabIndex: number,
    callback: (slab: DeferredStorageSlab) => T | Promise<T>
  ): Promise<T> {
    const slab = await this.mapSlab(slabIndex);
    try {
      return await callback(slab);
    } finally {
      slab.release();
    }
  }

  public async flush(): Promise<void> {
    this.assertOpen();
    await this.queueWriteback(async () => {
      for (const slab of this.resident.values()) this.snapshotDirtySlab(slab);
      await this.drainPendingWritebacks(true);
    });
  }

  public async flushSlab(slab: DeferredStorageSlab): Promise<void> {
    this.assertOwned(slab);
    await this.queueWriteback(async () => {
      this.snapshotDirtySlab(slab);
      await this.drainPendingWritebacks(true);
    });
  }

  public releaseSlab(slab: DeferredStorageSlab): void {
    this.assertOwned(slab);
    slab._releaseLease();
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    await this.flush();
    await this.rpc('close', {});
    this.closed = true;
    for (const slab of this.resident.values()) slab._unmap();
    this.resident.clear();
    this.disposeWorker();
  }

  /**
   * Close and remove this exact OPFS leaf. Pending dirty bytes are discarded.
   * Intended for explicit cache invalidation and isolated benchmark/test files.
   */
  public async destroy(): Promise<void> {
    if (this.closed) return;
    await this.rpc('destroy', {});
    this.closed = true;
    for (const slab of this.resident.values()) slab._unmap();
    this.resident.clear();
    this.disposeWorker();
  }

  private async loadSlab(index: number): Promise<DeferredStorageSlab> {
    await this.makeResidentRoom();
    const byteOffset = index * this.slabByteLength;
    if (this.hasPendingWritebackOverlap(byteOffset, byteOffset + this.slabByteLength)) {
      await this.queueWriteback(() => this.drainPendingWritebacks(false));
    }
    const shared =
      this.preferSharedArrayBuffer &&
      typeof SharedArrayBuffer !== 'undefined' &&
      (globalThis as any).crossOriginIsolated === true
        ? new SharedArrayBuffer(this.slabByteLength)
        : undefined;
    const result = await this.rpc('map', {
      byteOffset: index * this.slabByteLength,
      byteLength: this.slabByteLength,
      sharedBuffer: shared,
    });
    const buffer = shared ?? result.buffer;
    const validByteLength = Math.min(
      this.slabByteLength,
      this.logicalBytes - index * this.slabByteLength
    );
    const slab = new DeferredStorageSlab(this, index, buffer, validByteLength);
    this.resident.set(index, slab);
    this.statsValue.mapReads++;
    this.statsValue.bytesRead += result.bytesRead;
    this.recordResidentPeak();
    return slab;
  }

  private queueSlabLoad(index: number): Promise<DeferredStorageSlab> {
    const operation = this.loadQueue.catch(() => undefined).then(() => this.loadSlab(index));
    this.loadQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private async makeResidentRoom(): Promise<void> {
    while (this.resident.size >= this.maxResidentSlabs) {
      const candidate = [...this.resident.entries()].find(([, slab]) => slab.leaseCount === 0);
      if (!candidate) {
        throw new Error(
          `All ${this.maxResidentSlabs} deferred slabs are leased; release one before mapping another`
        );
      }
      const [index, slab] = candidate;
      await this.queueWriteback(async () => {
        this.snapshotDirtySlab(slab);
        if (this.pendingWritebackByteLength >= this.maxPendingWritebackBytes) {
          await this.drainPendingWritebacks(false);
        }
      });
      this.resident.delete(index);
      slab._unmap();
      this.statsValue.evictions++;
    }
  }

  private snapshotDirtySlab(slab: DeferredStorageSlab): void {
    if (!slab.isDirty()) return;
    const ranges = slab
      ._consumeDirtyRanges()
      .map(range => ({ start: range.start, end: Math.min(range.end, slab.validByteLength) }))
      .filter(range => range.end > range.start);
    if (!ranges.length) return;
    const slabBytes = new Uint8Array(slab.take().buffer);
    for (const range of ranges) {
      const bytes = new Uint8Array(range.end - range.start);
      bytes.set(slabBytes.subarray(range.start, range.end));
      this.pendingWritebacks.push({
        fileOffset: slab.byteOffset + range.start,
        bytes,
      });
      this.pendingWritebackBytesValue += bytes.byteLength;
    }
    const pendingBytes = this.pendingWritebackByteLength;
    this.statsValue.pendingWritebackBytes = pendingBytes;
    this.statsValue.peakPendingWritebackBytes = Math.max(
      this.statsValue.peakPendingWritebackBytes,
      pendingBytes
    );
  }

  private async drainPendingWritebacks(synchronize: boolean): Promise<void> {
    if (!this.pendingWritebacks.length) {
      if (synchronize && this.unsynchronizedWriteback) {
        await this.rpc('sync', {});
        this.unsynchronizedWriteback = false;
        this.statsValue.syncs++;
      }
      return;
    }
    const entries = [...this.pendingWritebacks];
    const payloadByteLength = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
    const payload = new ArrayBuffer(payloadByteLength);
    const payloadBytes = new Uint8Array(payload);
    let payloadOffset = 0;
    const workerRanges = entries.map(entry => {
      const byteLength = entry.bytes.byteLength;
      payloadBytes.set(entry.bytes, payloadOffset);
      const next = {
        fileOffset: entry.fileOffset,
        payloadOffset,
        byteLength,
      };
      payloadOffset += byteLength;
      return next;
    });
    const result = await this.rpc('flush', { ranges: workerRanges, payload, synchronize }, [
      payload,
    ]);
    this.pendingWritebacks.splice(0, entries.length);
    this.pendingWritebackBytesValue -= payloadByteLength;
    this.statsValue.pendingWritebackBytes = this.pendingWritebackByteLength;
    this.statsValue.flushes++;
    this.statsValue.writebackBatches++;
    this.statsValue.bytesWritten += result.bytesWritten;
    if (synchronize) {
      this.unsynchronizedWriteback = false;
      this.statsValue.syncs++;
    } else {
      this.unsynchronizedWriteback = true;
    }
  }

  private hasPendingWritebackOverlap(start: number, end: number): boolean {
    return this.pendingWritebacks.some(
      entry => entry.fileOffset < end && entry.fileOffset + entry.bytes.byteLength > start
    );
  }

  private queueWriteback<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writebackQueue.catch(() => undefined).then(operation);
    this.writebackQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private touch(index: number, slab: DeferredStorageSlab): void {
    this.resident.delete(index);
    this.resident.set(index, slab);
  }

  private recordResidentPeak(): void {
    this.statsValue.peakResidentSlabs = Math.max(
      this.statsValue.peakResidentSlabs,
      this.resident.size
    );
    this.statsValue.peakResidentBytes = Math.max(
      this.statsValue.peakResidentBytes,
      this.residentByteLength
    );
  }

  private assertOwned(slab: DeferredStorageSlab): void {
    this.assertOpen();
    if (this.resident.get(slab.slabIndex) !== slab || !slab.isMapped) {
      throw new Error(`Deferred slab ${slab.slabIndex} does not belong to this resident set`);
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Deferred storage is closed');
  }

  private rpc(
    type: string,
    detail: Record<string, unknown>,
    transfer?: Transferable[]
  ): Promise<any> {
    this.assertOpen();
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ id, type, ...detail }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private disposeWorker(): void {
    this.worker.removeEventListener?.('message', this.onMessage);
    this.worker.removeEventListener?.('error', this.onError);
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Deferred storage worker was terminated'));
    }
    this.pending.clear();
  }
}
