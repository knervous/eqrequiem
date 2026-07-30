# OPFS deferred storage slabs

Status: browser proof implemented  
Scope: cold packed actor state beyond the renderer's resident working set

## Result

`DeferredStorageSlabStore` exposes a bounded typed-array working set over a
much larger OPFS file. It is an explicit, asynchronous analogue of `mmap`, not
an operating-system memory map:

- a dedicated worker exclusively owns `FileSystemSyncAccessHandle`;
- fixed-size slabs are aligned to the configured packed instance stride;
- mapped slabs use the familiar `FloatArena` access and dirty APIs;
- callers explicitly `release()` leases so an LRU slab can be evicted;
- eviction snapshots only dirty 4 KiB ranges into a bounded writeback queue;
- sparse evictions are combined into one worker write and one durability sync;
- clean slabs leave the frame and upload paths untouched;
- a `SharedArrayBuffer` is populated directly by the worker when the page is
  cross-origin isolated, with a transferable `ArrayBuffer` fallback;
- logical file size and resident typed-array size are independent.

The storage tier does not make every actor drawable. OPFS holds deferred/cold
rows. A visible or simulation working set is mapped, culled, projected into
the existing compact GPU streams, and drawn through the existing VAT
pipelines.

## API

```ts
import { DeferredStorageSlabStore } from '@knervous/shado/storage';

const actors = await DeferredStorageSlabStore.open({
  directory: ['world-cache'],
  fileName: 'qeynos.actors',
  initialByteLength: 10_000_000 * 16,
  recordStrideBytes: 16,
  slabByteLength: 4 * 1024 * 1024,
  maxResidentSlabs: 4,
  maxPendingWritebackBytes: 1024 * 1024,
});

await actors.prefetchRecordRange(6_750_000, 500_000);

const actorIndex = 7_000_000;
const slab = await actors.mapRecordSlab(actorIndex);
try {
  const localIndex = actors.localRecordIndex(actorIndex);
  const packedRow = slab.recordDataView(localIndex);
  packedRow.setUint32(0, actorIndex, true);
  slab.markDirtyBytes(localIndex * 16, 4);
} finally {
  slab.release();
}

// Loading/save code owns this await; it is not a per-frame operation.
await actors.flush();
await actors.close();
```

`DeferredStorageSlab` also supplies `write`, `view`, `take`, `dataView`,
`markDirtyFloats`, `markDirtyBytes`, `isDirty`, and `markClean`. Its
`ensureCapacity` is deliberately fixed: crossing a slab boundary maps another
slab instead of reallocating a giant arena.

## Integration shape

1. Keep stable entity handles and durable packed rows in OPFS.
2. Predict required world/cell slabs ahead of the camera or simulation tick.
3. Map and decode only those slabs into hot ECS/SoA component planes.
4. Run cell-first WASM culling on that bounded hot set.
5. Publish changed visible rows through the existing packed projection and
   adaptive compute-scatter pipeline.
6. Drain and synchronize queued writeback on an IO cadence or during idle time.

Do not scan all deferred slabs every visibility pass. OPFS solves durable
capacity, not search. A small persistent cell-to-slab index is required so
camera movement produces targeted prefetches.

## Interactive sandbox toggle

The root VAT sandbox now exposes **OPFS cold slab backing** in the shared
Crowd controls for both Babylon Lite and the full Babylon.js baseline. With
the option off, add buttons preserve the original all-resident behavior. With
it on:

- the renderer creates actors only until the 20,000-instance hot cap;
- additions above that cap are initialized as quantized 16-byte transform
  rows in OPFS;
- the controls and diagnostics report visible, hot, total, cold logical
  bytes, and currently mapped bytes separately;
- **Add 5,000,000 total-tier actors** exercises the large deferred shape
  without constructing five million JS actor objects;
- removing actors drains the cold tail first;
- switching the option off retains its cold rows until the sandbox is
  disposed, when the exact temporary OPFS file is destroyed.

Cold rows are deliberately outside the frame loop. This control proves
population capacity and stable hot-set cost; spatial indexing and predictive
promotion remain the application layer's responsibility.

## Costs and controls

| Cost                                         | Control                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| Explicit page-in latency                     | Predictive prefetch and two working-set generations                 |
| Exclusive sync handle                        | One dedicated worker per open file                                  |
| 4 KiB write amplification for tiny row edits | Cluster rows by locality and amortize flushes                       |
| Slab eviction while in use                   | Lease count; mapping fails if every resident slab is leased         |
| Main/worker mutation race                    | Dirty ranges are copied to a flush snapshot                         |
| Full-file traversal                          | Persistent spatial index; never use OPFS as an unindexed actor list |
| Browser quota/eviction                       | Treat as rebuildable cache or pair with network durability          |

Sparse dirty eviction now copies page snapshots into
`maxPendingWritebackBytes` instead of blocking on OPFS. Crossing the threshold
writes a combined batch without a durability sync; explicit `flush()` and
`close()` drain all resident/queued changes and perform one sync. Remapping an
overlapping slab first drains its queued writes, preserving read-after-write
behavior. Dense evictions can exceed the threshold by one slab and therefore
still write promptly.

## Validation

The deterministic Jest suite uses an in-memory worker protocol implementation
to verify row alignment, lease pressure, sparse page writes, dirty eviction,
and reopen persistence. The Playwright test exercises real OPFS and the
SharedArrayBuffer path with one million logical 16-byte actor rows while
holding at most two 1 MB slabs resident.

Run the large browser benchmark with:

```bash
npm run benchmark:opfs-slabs
npm run benchmark:opfs-slabs -- --actors 1000000 --resident-slabs 2
```

The default is ten million logical 16-byte rows, 4 MB slabs, and a four-slab
resident cap. It walks every slab to force page-in/eviction, writes one
sentinel row per slab, reports dirty-page amplification and map latency, then
reopens the file and verifies distant sentinels before removing the exact
benchmark file.

On the 2026-07-30 system-Chromium run, ten million rows produced a 152.59 MiB
logical file with a 16 MiB peak typed-array working set (9.54:1). Traversing
all 39 slabs read 160 MB; map/modify/previous-dirty-evict latency was 3.53 ms
p50 and 4.92 ms p95. The original implementation issued 39 writeback/sync
cycles. The optimized run combined the same 159,744 dirty bytes into one
writeback and one sync while three distant rows still matched after reopen.
Cached maps measured at the timer floor. This demonstrates bounded capacity
and persistence, while identifying full traversal as loading-path work that
cannot enter a 60 FPS frame.

## Five-million live proof

The sandbox route `scenario=five-million-opfs-integration` connects the cold
tier to the existing live benchmark:

- five million valid initialized 16-byte rows / 76.29 MiB logical OPFS state;
- four 4 MiB slabs / 16 MiB maximum mapped working set;
- one million prefetched hot rows uploaded directly from mapped
  `SharedArrayBuffer` slabs to the packed GPU buffer, with no intermediate
  concatenated host buffer;
- cell-first WASM visibility over the one-million hot set;
- compact visible IDs and the real 27-bone half-float DQ VAT draw;
- a distant cold sentinel verified after close/reopen;
- zero OPFS reads, writebacks, or syncs during measured frames.

Run the promotion gate with:

```bash
npm run benchmark:five-million-opfs -- --require-target
```

On the 2026-07-30 Apple `metal-3` run, five million cold / one million hot /
8,000 visible full-quality VAT actors sustained 60.03 FPS mean across 120
measured frames with no missed refreshes. Complete frame work was 11.47 ms
p95, the timestamp-query VAT pass was 9.67 ms p95, recurring visibility was
0.22 ms p50, OPFS prefetch was 13.01 ms, and the cold file remained at a
4.77:1 logical-to-mapped ratio. At 20,000 visible actors the same cold/hot
shape missed the gate because the 32.28-million-invocation VAT pass measured
21.45 ms p95. Cold capacity did not affect the frame path; visible vertex work
remains the adapter-specific limit.
