import { describe, expect, test } from '@jest/globals';
import { DeferredStorageSlabStore, type DeferredStorageWorkerLike } from '../src/storage';

type WorkerRequest = Record<string, any> & { id: number; type: string };

class MemoryOpfs {
  public readonly files = new Map<string, Uint8Array>();

  public worker(): DeferredStorageWorkerLike {
    let messageListener: ((event: MessageEvent) => void) | undefined;
    let key = '';
    let terminated = false;
    const respond = (id: number, result: unknown): void => {
      queueMicrotask(() => messageListener?.({ data: { id, ok: true, result } } as MessageEvent));
    };
    const fail = (id: number, error: unknown): void => {
      queueMicrotask(() =>
        messageListener?.({
          data: { id, ok: false, error: error instanceof Error ? error.message : String(error) },
        } as MessageEvent)
      );
    };
    const resize = (length: number): Uint8Array => {
      const previous = this.files.get(key) ?? new Uint8Array(0);
      const next = new Uint8Array(length);
      next.set(previous.subarray(0, length));
      this.files.set(key, next);
      return next;
    };
    return {
      postMessage: (raw: unknown): void => {
        const message = raw as WorkerRequest;
        queueMicrotask(() => {
          if (terminated) return;
          try {
            switch (message.type) {
              case 'open': {
                key = `${message.directory.join('/')}/${message.fileName}`;
                const existing = this.files.get(key);
                if (!existing || existing.byteLength < message.minimumByteLength) {
                  resize(message.minimumByteLength);
                }
                respond(message.id, { byteLength: this.files.get(key)!.byteLength });
                break;
              }
              case 'map': {
                const file = this.files.get(key)!;
                const target = message.sharedBuffer ?? new ArrayBuffer(message.byteLength);
                const bytes = new Uint8Array(target);
                const available = Math.max(
                  0,
                  Math.min(message.byteLength, file.byteLength - message.byteOffset)
                );
                bytes.set(file.subarray(message.byteOffset, message.byteOffset + available));
                respond(message.id, {
                  bytesRead: available,
                  shared: Boolean(message.sharedBuffer),
                  buffer: message.sharedBuffer ? undefined : target,
                });
                break;
              }
              case 'flush': {
                const file = this.files.get(key)!;
                const payload = new Uint8Array(message.payload);
                let bytesWritten = 0;
                for (const range of message.ranges) {
                  const source = payload.subarray(
                    range.payloadOffset,
                    range.payloadOffset + range.byteLength
                  );
                  file.set(source, range.fileOffset);
                  bytesWritten += source.byteLength;
                }
                respond(message.id, { bytesWritten });
                break;
              }
              case 'sync':
                respond(message.id, {});
                break;
              case 'resize':
                resize(message.byteLength);
                respond(message.id, { byteLength: message.byteLength });
                break;
              case 'close':
                respond(message.id, {});
                break;
              case 'destroy':
                this.files.delete(key);
                respond(message.id, {});
                break;
              default:
                throw new Error(`Unknown request ${message.type}`);
            }
          } catch (error) {
            fail(message.id, error);
          }
        });
      },
      addEventListener: ((type: string, listener: (event: MessageEvent) => void): void => {
        if (type === 'message') messageListener = listener;
      }) as DeferredStorageWorkerLike['addEventListener'],
      removeEventListener: (() => {}) as DeferredStorageWorkerLike['removeEventListener'],
      terminate: (): void => {
        terminated = true;
      },
    };
  }
}

describe('OPFS-style deferred storage slabs', () => {
  test('preserves packed rows across dirty eviction and reopen with bounded residency', async () => {
    const opfs = new MemoryOpfs();
    const options = {
      fileName: 'actors.slabs',
      directory: ['shado-tests'],
      initialByteLength: 6 * 4096,
      slabByteLength: 4096,
      recordStrideBytes: 16,
      maxResidentSlabs: 2,
      preferSharedArrayBuffer: false,
      workerFactory: () => opfs.worker(),
    };
    const store = await DeferredStorageSlabStore.open(options);

    const first = await store.mapSlab(0);
    first.writeRecords(3, new Uint32Array([0xdeadbeef, 42, 0x3f800000, 0x40000000]));
    expect(first.isDirty()).toBe(true);
    first.release();

    const second = await store.mapSlab(1);
    second.release();
    const third = await store.mapSlab(2);
    third.release();

    expect(store.residentSlabCount).toBe(2);
    expect(store.residentByteLength).toBe(8192);
    expect(store.stats).toMatchObject({
      evictions: 1,
      flushes: 0,
      pendingWritebackBytes: 4096,
      peakResidentSlabs: 2,
      peakResidentBytes: 8192,
    });
    await store.close();

    const reopened = await DeferredStorageSlabStore.open({
      ...options,
      initialByteLength: 0,
    });
    const restored = await reopened.mapRecordSlab(3);
    expect([...new Uint32Array(restored.recordBytes(3).buffer, 3 * 16, 4)]).toEqual([
      0xdeadbeef, 42, 0x3f800000, 0x40000000,
    ]);
    restored.release();
    await reopened.destroy();
    expect(opfs.files.size).toBe(0);
  });

  test('mirrors arena access while requiring leases to be released before eviction', async () => {
    const opfs = new MemoryOpfs();
    const store = await DeferredStorageSlabStore.open({
      fileName: 'leased.slabs',
      initialByteLength: 8192,
      slabByteLength: 4096,
      recordStrideBytes: 16,
      maxResidentSlabs: 1,
      preferSharedArrayBuffer: false,
      workerFactory: () => opfs.worker(),
    });
    const first = await store.mapSlab(0);
    first.write(0, new Float32Array([1, 2, 3, 4]));
    expect([...first.view(0, 4)]).toEqual([1, 2, 3, 4]);
    expect(first.dataView().getFloat32(0, true)).toBe(1);

    await expect(store.mapSlab(1)).rejects.toThrow(/release one/i);
    first.release();
    const second = await store.mapSlab(1);
    expect(second.slabIndex).toBe(1);
    second.release();
    expect(store.stats.evictions).toBe(1);
    await store.destroy();
  });

  test('flushes only touched dirty pages and addresses records without conversion', async () => {
    const opfs = new MemoryOpfs();
    const store = await DeferredStorageSlabStore.open({
      fileName: 'sparse.slabs',
      initialByteLength: 64 * 1024,
      slabByteLength: 64 * 1024,
      recordStrideBytes: 16,
      maxResidentSlabs: 1,
      preferSharedArrayBuffer: false,
      workerFactory: () => opfs.worker(),
    });
    const slab = await store.mapRecordSlab(0);
    slab.writeRecords(1, new Uint32Array([1, 2, 3, 4]));
    slab.writeRecords(512, new Uint32Array([5, 6, 7, 8]));
    await slab.flush();

    expect(store.localRecordIndex(4095)).toBe(4095);
    expect(store.stats.bytesWritten).toBe(8192);
    expect(store.stats.bytesWritten).toBeLessThan(store.slabByteLength);
    slab.release();
    await store.destroy();
  });

  test('serializes concurrent page-ins so the resident bound cannot be oversubscribed', async () => {
    const opfs = new MemoryOpfs();
    const store = await DeferredStorageSlabStore.open({
      fileName: 'concurrent.slabs',
      initialByteLength: 4 * 4096,
      slabByteLength: 4096,
      recordStrideBytes: 16,
      maxResidentSlabs: 2,
      preferSharedArrayBuffer: false,
      workerFactory: () => opfs.worker(),
    });

    const [first, second] = await Promise.all([store.mapSlab(0), store.mapSlab(1)]);
    expect(store.residentSlabCount).toBe(2);
    first.release();
    second.release();
    const [third, fourth] = await Promise.all([store.mapSlab(2), store.mapSlab(3)]);
    expect(store.residentSlabCount).toBe(2);
    expect(store.stats.peakResidentSlabs).toBe(2);
    third.release();
    fourth.release();
    await store.destroy();
  });

  test('combines sparse dirty evictions into one writeback and one durability sync', async () => {
    const opfs = new MemoryOpfs();
    const store = await DeferredStorageSlabStore.open({
      fileName: 'batched.slabs',
      initialByteLength: 4 * 4096,
      slabByteLength: 4096,
      recordStrideBytes: 16,
      maxResidentSlabs: 1,
      maxPendingWritebackBytes: 64 * 1024,
      preferSharedArrayBuffer: false,
      workerFactory: () => opfs.worker(),
    });

    for (let slabIndex = 0; slabIndex < 4; slabIndex++) {
      const slab = await store.mapSlab(slabIndex);
      slab.writeRecords(0, new Uint32Array([slabIndex + 1, 2, 3, 4]));
      slab.release();
    }
    expect(store.stats).toMatchObject({
      evictions: 3,
      flushes: 0,
      pendingWritebackBytes: 3 * 4096,
    });

    await store.flush();
    expect(store.stats).toMatchObject({
      flushes: 1,
      writebackBatches: 1,
      syncs: 1,
      bytesWritten: 4 * 4096,
      pendingWritebackBytes: 0,
    });
    await store.destroy();
  });

  test('drains an overlapping queued write before remapping the same slab', async () => {
    const opfs = new MemoryOpfs();
    const store = await DeferredStorageSlabStore.open({
      fileName: 'overlap.slabs',
      initialByteLength: 2 * 4096,
      slabByteLength: 4096,
      recordStrideBytes: 16,
      maxResidentSlabs: 1,
      maxPendingWritebackBytes: 64 * 1024,
      preferSharedArrayBuffer: false,
      workerFactory: () => opfs.worker(),
    });
    const first = await store.mapSlab(0);
    first.writeRecords(0, new Uint32Array([99, 2, 3, 4]));
    first.release();
    const second = await store.mapSlab(1);
    second.release();
    expect(store.pendingWritebackByteLength).toBe(4096);

    const remapped = await store.mapSlab(0);
    expect(new Uint32Array(remapped.recordBytes(0).buffer, 0, 1)[0]).toBe(99);
    expect(store.stats.writebackBatches).toBe(1);
    remapped.release();
    await store.destroy();
  });

  test('rejects layouts which split packed records', async () => {
    const opfs = new MemoryOpfs();
    await expect(
      DeferredStorageSlabStore.open({
        fileName: 'bad.slabs',
        initialByteLength: 4096,
        slabByteLength: 4096,
        recordStrideBytes: 24,
        workerFactory: () => opfs.worker(),
      })
    ).rejects.toThrow(/complete packed records/i);
  });
});
