# Shado `net` layout

Status: first executable ABI slice.

## What `net` means

`layout: "net"` is a fixed-width, byte-addressed Shado layout for code-synchronized
clients and servers. It is intended for commands, events, world-state deltas, and
snapshot batches where turning every record into a JavaScript object would be wasted
work.

The received packet remains one buffer:

```text
32-byte checked header | record 0 | record 1 | ... | record N
                       ^ contiguous payload
```

Generated views read and write fields directly with `DataView` and typed arrays. The
payload is a `Uint8Array.subarray()`, not a decoded or repacked allocation. The same
layout can be backed by `ArrayBuffer`, `SharedArrayBuffer`, or a view of Wasm linear
memory.

`storage: "aos"` emits record views for commands and small messages.
`storage: "soa"` emits one typed plane per scalar field for snapshots and reducers.
Nested public projections flatten into names such as `statePosition`, so consumers do
not transpose entity records before a GPU upload.

WebTransport still creates or fills receive memory, and WebGPU's `writeBuffer()` still
performs the API's required upload. "Zero-copy" here means Shado adds no object decode,
no per-record allocation, and no serialization copy between receipt and those consumers.

## Schema example

```ts
const schemas = [
  {
    name: "WorldEntityState",
    layout: "net",
    schemaId: 0x2001,
    fields: [
      { id: 1, name: "position", type: "f32", count: 3 },
      { id: 2, name: "orientation", type: "f32", count: 4 },
      { id: 3, name: "velocity", type: "f32", count: 3 },
      { id: 4, name: "serverFlags", type: "u32" },
    ],
  },
  {
    name: "RenderSnapshot",
    layout: "net",
    schemaId: 0x2002,
    fields: [
      { id: 1, name: "entityId", type: "u32" },
      {
        id: 2,
        name: "state",
        type: {
          struct: "WorldEntityState",
          pick: ["position", "orientation", "velocity"],
        },
      },
    ],
  },
] as const satisfies readonly NetStructSpec[];
```

A struct reference is inline, never a pointer. `pick` creates a compiled projection of
the referenced struct, allowing a public render snapshot to reuse selected world-state
fields without exposing server-only state. Whole structs, projections, fixed scalar
arrays, and fixed arrays of structs all remain contiguous.

Fields marked `visibility: "private"` remain in the owning schema and schema hash, but
`{ struct: "Owner", visibility: "public" }` excludes them from public projections.
Polymorphism is data-oriented: a numeric `kind` plane and declared `variants` describe
player/NPC/etc. field sets without allocating subclass instances per entity.

Strings live in a separate UTF-8 sidecar. Fixed state carries offset/length pairs, so a
name change never forces numeric render planes to be decoded or repacked.

## Wire header

All integers are little-endian. Payload offset 32 is deliberately aligned for Wasm and
GPU copies.

| Offset | Type | Meaning |
| ---: | --- | --- |
| 0 | `u32` | magic (`SHNT`) |
| 4 | `u16` | net codec version |
| 6 | `u16` | flags, currently zero |
| 8 | `u32` | explicit schema ID |
| 12 | `u16` | schema version |
| 14 | `u16` | header bytes |
| 16 | `u64` | deterministic layout hash |
| 24 | `u32` | record stride |
| 28 | `u32` | record count |

Opening a generated view validates all ABI fields and the exact packet length before
exposing memory. The schema hash covers field IDs, scalar/nested types, counts, offsets,
nested hashes, stride, and schema version. It intentionally does not depend on
TypeScript property names.

## Generated use

```ts
const batch = createRenderSnapshotBatch(entityCount, receiveMemory);
batch.entityId[0] = 42;
batch.stateKind[0] = 2; // WorldEntityState variant: NPC
batch.statePosition.set([1, 2, 3], 0);

// No Shado copy or decode:
wasmConsumer(batch.payload);
gpuQueue.writeBuffer(storageBuffer, 0, batch.payload);
```

`encodeX` and `decodeX` remain as convenience helpers for low-rate request messages.
The hot path should use `XBatchView`, `record(index)`, and `payload`.

## Evolution rules

- Schema IDs, shipped field IDs, and schema versions are explicit.
- A packed `net` packet requires an exact schema hash; mismatched builds fail closed.
- Any offset, type, count, projection, or nested-layout change requires a new schema
  version for deployed peers.
- Adding a field changes the packed ABI. A future tagged/control codec can handle rolling
  upgrades for login and persistence-shaped traffic; snapshots should stay packed.
- Variable strings and lists do not belong inside direct GPU/Wasm records. Represent
  them with bounded fixed regions or offset/count pairs into a separately framed blob.
- Packet count and exact byte length are checked before any record view is returned.

## Next protocol slices

1. Negotiate the net codec/build manifest once per connection.
2. Move login and character-list messages to a bounded variable-data companion format.
3. Generate AssemblyScript/WGSL offset declarations from the same compiled `net` layout.
4. Feed WebTransport BYOB reads into preallocated Wasm/shared-memory packet regions where
   the platform permits it.
5. Generate WGSL storage declarations matching emitted SoA plane offsets.
