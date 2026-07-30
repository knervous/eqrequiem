import type {
  EqShowcaseController,
  ShadoVatShowcaseDeferredStorage,
  ShadoVatShowcaseDeferredStorageSnapshot,
} from '@knervous/shado/showcase';
import { DeferredStorageSlabStore } from '@knervous/shado/storage';

const PACKED_TRANSFORM_BYTES = 16;
const SLAB_BYTES = 4 * 1024 * 1024;
const DEFAULT_HOT_INSTANCE_LIMIT = 20_000;
const PACKED_IDENTITY_XY = 0;
const PACKED_IDENTITY_ZW = 0x7fff0000;
const PACKED_Y_UNORM = 0x80000000;
const PACKED_SCALE_UNORM = 0x20000000;

export type ShowcaseOpfsBackingHandle = ShadoVatShowcaseDeferredStorage & {
  dispose(): Promise<void>;
};

export type ShowcaseOpfsBackingOptions = {
  hotInstanceLimit?: number;
  fileName?: string;
};

/**
 * Interactive showcase policy for the same packed cold-row ABI used by the
 * five-million integration proof. OPFS is a deferred tier: only actors below
 * the hot budget become JS/Babylon actor objects and enter culling/VAT.
 */
export function createShowcaseOpfsBacking(
  controller: EqShowcaseController,
  options: ShowcaseOpfsBackingOptions = {}
): ShowcaseOpfsBackingHandle {
  const hotInstanceLimit = Math.max(
    1,
    Math.floor(options.hotInstanceLimit ?? DEFAULT_HOT_INSTANCE_LIMIT)
  );
  const supported =
    typeof Worker !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof (navigator.storage as StorageManager & { getDirectory?: unknown })?.getDirectory ===
      'function';
  const fileName =
    options.fileName ??
    `showcase-${Date.now()}-${Math.random().toString(16).slice(2)}.packed-transforms`;
  let store: DeferredStorageSlabStore | undefined;
  let enabled = false;
  let busy = false;
  let disposed = false;
  let coldInstances = 0;
  let progress: number | undefined;
  let message: string | undefined;
  let error: string | undefined;
  let activeOperation: Promise<void> | undefined;

  const snapshot = (): ShadoVatShowcaseDeferredStorageSnapshot => ({
    supported,
    enabled,
    busy,
    coldInstances,
    logicalByteLength: store?.logicalByteLength ?? coldInstances * PACKED_TRANSFORM_BYTES,
    residentByteLength: store?.residentByteLength ?? 0,
    hotInstanceLimit,
    progress,
    message,
    error,
  });

  const assertUsable = () => {
    if (disposed) throw new Error('The OPFS showcase backing has been disposed.');
    if (busy) throw new Error('An OPFS cold-slab operation is already running.');
  };

  const open = async (): Promise<DeferredStorageSlabStore> => {
    if (store) return store;
    if (!supported) throw new Error('OPFS cold slabs are unavailable in this browser.');
    store = await DeferredStorageSlabStore.open({
      directory: ['shado-showcase'],
      fileName,
      initialByteLength: 0,
      slabByteLength: SLAB_BYTES,
      recordStrideBytes: PACKED_TRANSFORM_BYTES,
      maxResidentSlabs: 4,
      maxPendingWritebackBytes: 20 * 1024 * 1024,
      preferSharedArrayBuffer: true,
    });
    coldInstances = store.logicalRecordCount;
    return store;
  };

  const run = async (operation: () => Promise<void>): Promise<void> => {
    assertUsable();
    busy = true;
    error = undefined;
    try {
      activeOperation = operation();
      await activeOperation;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      busy = false;
      activeOperation = undefined;
      progress = undefined;
      message = undefined;
    }
  };

  const appendColdRows = async (count: number): Promise<void> => {
    if (count <= 0) return;
    const activeStore = await open();
    const firstRecord = coldInstances;
    const nextCount = firstRecord + count;
    message = `Allocating ${count.toLocaleString()} quantized cold rows`;
    progress = 0;
    await activeStore.resizeRecords(nextCount);

    const firstSlab = Math.floor(firstRecord / activeStore.recordsPerSlab);
    const lastSlab = Math.floor((nextCount - 1) / activeStore.recordsPerSlab);
    for (let slabIndex = firstSlab; slabIndex <= lastSlab; slabIndex++) {
      const slab = await activeStore.mapSlab(slabIndex);
      try {
        const globalStart = Math.max(firstRecord, slabIndex * activeStore.recordsPerSlab);
        const globalEnd = Math.min(nextCount, (slabIndex + 1) * activeStore.recordsPerSlab);
        const records = globalEnd - globalStart;
        const words = new Uint32Array(records * 4);
        for (let local = 0; local < records; local++) {
          // Two inexpensive integer hashes distribute the cold rows over the
          // projection domain while retaining the packed shader ABI.
          const actorIndex = globalStart + local;
          const x = Math.imul(actorIndex + 1, 0x9e3779b1) >>> 16;
          const z = Math.imul(actorIndex + 1, 0x85ebca6b) >>> 16;
          const offset = local * 4;
          words[offset] = (PACKED_Y_UNORM | x) >>> 0;
          words[offset + 1] = (PACKED_SCALE_UNORM | z) >>> 0;
          words[offset + 2] = PACKED_IDENTITY_XY;
          words[offset + 3] = PACKED_IDENTITY_ZW;
        }
        slab.writeRecords(globalStart - slabIndex * activeStore.recordsPerSlab, words);
      } finally {
        slab.release();
      }
      progress = (slabIndex - firstSlab + 1) / (lastSlab - firstSlab + 1);
      message = `Writing ${count.toLocaleString()} quantized cold rows`;
      if ((slabIndex - firstSlab) % 2 === 1) await yieldToUi();
      if (disposed) throw new Error('The OPFS cold-slab update was cancelled.');
    }
    await activeStore.flush();
    coldInstances = nextCount;
  };

  return {
    snapshot,
    async setEnabled(nextEnabled) {
      await run(async () => {
        if (nextEnabled) {
          message = 'Opening OPFS cold slabs';
          await open();
        }
        enabled = nextEnabled;
      });
    },
    async addRandom(count) {
      const requested = Math.max(0, Math.floor(count));
      if (requested === 0) return;
      await run(async () => {
        if (!enabled) {
          await controller.addRandom(requested);
          return;
        }
        const hotAvailable = Math.max(0, hotInstanceLimit - controller.stats.instances);
        const hotCount = Math.min(requested, hotAvailable);
        const coldCount = requested - hotCount;
        await appendColdRows(coldCount);
        if (disposed) return;
        if (hotCount > 0) {
          message = `Creating ${hotCount.toLocaleString()} hot preview actors`;
          await controller.addRandom(hotCount);
        }
      });
    },
    async removeRandom() {
      await run(async () => {
        if (enabled && coldInstances > 0) {
          const activeStore = await open();
          message = 'Removing one cold row';
          await activeStore.resizeRecords(coldInstances - 1);
          coldInstances--;
        } else {
          controller.removeRandom();
        }
      });
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      await activeOperation?.catch(() => undefined);
      if (store) {
        await store.destroy();
        store = undefined;
      }
    },
  };
}

function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
