import { DeferredStorageSlabStore, type DeferredStorageSlab } from '@knervous/shado/storage';
import {
  createPackedResidentActors,
  runMillionActorIntegrationBenchmark,
} from './MillionActorIntegrationBenchmark';

const PACKED_ACTOR_BYTES = 16;
const SLAB_BYTES = 4 * 1024 * 1024;
const MAX_RESIDENT_SLABS = 4;

/**
 * Five-million durable actors with a one-million-actor live working set.
 *
 * The cold file remains open during the existing WASM visibility + VAT frame
 * benchmark. Frame-path OPFS counters are compared before/after to enforce
 * that paging was completed by the loading phase.
 */
export async function runFiveMillionOpfsIntegrationBenchmark(): Promise<Record<string, unknown>> {
  const params = new URLSearchParams(location.search);
  const coldActorCount = boundedInteger(params.get('count'), 5_000_000, 1, 20_000_000);
  const hotActorCount = boundedInteger(
    params.get('hot'),
    Math.min(1_000_000, coldActorCount),
    1,
    Math.min(2_000_000, coldActorCount)
  );
  const visibleCount = boundedInteger(
    params.get('visible'),
    Math.min(8_000, hotActorCount),
    1,
    hotActorCount
  );
  const fileName = `five-million-live-${Date.now()}-${Math.random().toString(16).slice(2)}.slabs`;
  const options = {
    directory: ['shado-five-million-live'],
    fileName,
    initialByteLength: coldActorCount * PACKED_ACTOR_BYTES,
    slabByteLength: SLAB_BYTES,
    recordStrideBytes: PACKED_ACTOR_BYTES,
    maxResidentSlabs: MAX_RESIDENT_SLABS,
    // Dense initialization is written in bounded multi-slab batches; the
    // final batch performs the single durability sync.
    maxPendingWritebackBytes: 20 * 1024 * 1024,
    preferSharedArrayBuffer: true,
  };
  const openStarted = performance.now();
  let store = await DeferredStorageSlabStore.open(options);
  const openMs = performance.now() - openStarted;
  try {
    const initializeStarted = performance.now();
    {
      const packedHotWords = createPackedResidentActors(hotActorCount, visibleCount);
      const packedColdDefault = createPackedResidentActors(1, 0);
      const packedHotBytes = new Uint8Array(
        packedHotWords.buffer,
        packedHotWords.byteOffset,
        packedHotWords.byteLength
      );
      for (let slabIndex = 0; slabIndex < store.slabCount; slabIndex++) {
        const slab = await store.mapSlab(slabIndex);
        const words = slab.take();
        const validWordLength = slab.validByteLength / Uint32Array.BYTES_PER_ELEMENT;
        const packedWords = new Uint32Array(words.buffer, 0, validWordLength);
        for (let wordOffset = 0; wordOffset < validWordLength; wordOffset += 4) {
          packedWords.set(packedColdDefault, wordOffset);
        }
        const hotSourceByteOffset = slab.byteOffset;
        if (hotSourceByteOffset < packedHotBytes.byteLength) {
          const hotByteLength = Math.min(
            slab.validByteLength,
            packedHotBytes.byteLength - hotSourceByteOffset
          );
          new Uint8Array(words.buffer, 0, hotByteLength).set(
            packedHotBytes.subarray(hotSourceByteOffset, hotSourceByteOffset + hotByteLength)
          );
        }
        slab.markDirtyBytes(0, slab.validByteLength);
        slab.release();
      }
    }

    const coldSentinelActor = coldActorCount - 1;
    const sentinel = new Uint32Array([coldSentinelActor, 0xc01dcafe, 0x55aa55aa, 0x12345678]);
    const coldSlab = await store.mapRecordSlab(coldSentinelActor);
    coldSlab.writeRecords(store.localRecordIndex(coldSentinelActor), sentinel);
    coldSlab.release();
    await store.flush();
    const initializeMs = performance.now() - initializeStarted;
    const initializeStats = store.stats;
    await store.close();

    const reopenStarted = performance.now();
    store = await DeferredStorageSlabStore.open({
      ...options,
      initialByteLength: 0,
    });
    const reopenMs = performance.now() - reopenStarted;
    const verifySlab = await store.mapRecordSlab(coldSentinelActor);
    const verifyBytes = verifySlab.recordBytes(store.localRecordIndex(coldSentinelActor));
    const restoredSentinel = [...new Uint32Array(verifyBytes.buffer, verifyBytes.byteOffset, 4)];
    verifySlab.release();

    const prefetchStarted = performance.now();
    await store.prefetchRecordRange(0, hotActorCount);
    const prefetchMs = performance.now() - prefetchStarted;
    const hotPackedBytes = hotActorCount * PACKED_ACTOR_BYTES;
    const liveSlabs: DeferredStorageSlab[] = [];
    for (
      let slabIndex = 0;
      slabIndex < Math.ceil(hotPackedBytes / store.slabByteLength);
      slabIndex++
    ) {
      liveSlabs.push(await store.mapSlab(slabIndex));
    }
    const beforeFrames = store.stats;
    let live: Record<string, any>;
    try {
      live = (await runMillionActorIntegrationBenchmark({
        actorCount: hotActorCount,
        visibleCount,
        packedResidentSource: {
          byteLength: hotPackedBytes,
          upload(device, destination) {
            let destinationByteOffset = 0;
            for (const slab of liveSlabs) {
              const byteLength = Math.min(
                slab.validByteLength,
                hotPackedBytes - destinationByteOffset
              );
              device.queue.writeBuffer(
                destination,
                destinationByteOffset,
                new Uint8Array(slab.take().buffer, 0, byteLength)
              );
              destinationByteOffset += byteLength;
            }
          },
        },
      })) as Record<string, any>;
    } finally {
      for (const slab of liveSlabs) slab.release();
    }
    const afterFrames = store.stats;
    const framePathOpfsOperations = ioOperationCount(afterFrames) - ioOperationCount(beforeFrames);

    return {
      coldActorCount,
      hotActorCount,
      visibleCount: live.visibleCount,
      packedBytesPerActor: PACKED_ACTOR_BYTES,
      coldLogicalBytes: store.logicalByteLength,
      coldLogicalMiB: store.logicalByteLength / 1024 / 1024,
      coldResidentBytes: store.residentByteLength,
      coldResidentMiB: store.residentByteLength / 1024 / 1024,
      coldToResidentRatio: store.logicalByteLength / Math.max(1, store.residentByteLength),
      hotPackedBytes,
      openMs,
      initializeMs,
      reopenMs,
      prefetchMs,
      allActorRowsInitialized: initializeStats.bytesWritten === coldActorCount * PACKED_ACTOR_BYTES,
      coldSentinelPersisted: restoredSentinel.every((word, index) => word === sentinel[index]),
      framePathOpfsOperations,
      opfsInitialize: initializeStats,
      opfsBeforeFrames: beforeFrames,
      opfsAfterFrames: afterFrames,
      live,
      sustained60Fps: live.sustained60Fps,
      frameMs: live.frameMs,
      frameWorkMs: live.frameWorkMs,
      gpuVatPassMs: live.gpuVatPassMs,
      visibility: live.visibility,
      crossOriginIsolated,
    };
  } finally {
    await store.destroy();
  }
}

function ioOperationCount(stats: {
  mapReads: number;
  writebackBatches: number;
  syncs: number;
}): number {
  return stats.mapReads + stats.writebackBatches + stats.syncs;
}

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value ?? fallback) || fallback)));
}
