# Shado scalability benchmarks

`scalability-bench.mjs` exercises the dynamic-entity path at configurable
entity counts across the scenarios from `SHADO_SCALABILITY_SUGGESTIONS.md`:
static, 1% / 10% / 100% movers, and one versus eight mesh variants.

```bash
npm run build
node --experimental-vm-modules bench/scalability-bench.mjs --entities 100000
```

Reported per stage (p50/p95/p99): reducer transition stepping and GPU
synchronization (encode + recorded upload bytes). Runs on `NullEngine`, so GPU
submission cost is out of scope; upload bytes and call counts are the proxies.

## Architecture invariants (enforced in `tests/scalability-invariants.test.ts`)

- An unchanged frame uploads zero entity bytes (`syncGpu` is dirty-guarded).
- One container synchronizes at most once per frame id, regardless of how many
  mesh-variant renderers draw it.
- One changed entity uploads at most a couple of 4 KiB pages, not the arena.
- Dense changes and structural growth fall back to one full upload.
- Draw IDs are partitioned into contiguous per-mesh ranges: submitted
  instances across variants total the visible entities, an empty variant
  submits nothing, and mesh membership moves are bucket swap-remove/append.
