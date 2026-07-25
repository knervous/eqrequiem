# Shado world spatial preprocessing

This is the first implementation slice from `rendering.md`. It keeps world
topology, render clusters, spatial queries, and semantic volumes as separate
layers rather than treating one structure as authoritative for every system.

The current slice builds the geometry-query layer:

- spatially coherent clusters of at most 128 triangles;
- conservative sphere and normal-cone bounds in SoA arrays;
- fixed outdoor streaming tiles;
- contiguous tile/material packet ranges;
- stable source-geometry render chunks with cluster-driven compacted indices;
- a flat, quantized BVH4;
- a JavaScript frustum-query oracle;
- an embedded AssemblyScript/WASM BVH4 reducer used by the browser runtime.

The `qey2hh1` reference candidate is configured in
`qey2hh1.shado.config.mjs`. Build it with:

```sh
npm run preprocess:qey2hh1:world
```

The default input is:

```text
assets/reference/everquest_rof2/zones/qey2hh1.glb.gz
```

Set `SHADO_QEY2HH1_GLB` to exercise another export without editing the config.
The output is `sandbox/public/shado/worlds/qey2hh1.spatial.json.gz` and can be
loaded in browser or Node runtimes with `deserializeShadoWorld()`. The source
GLB is copied alongside it as `qey2hh1.glb.gz` for the demo runtime.

The sandbox exposes two routes:

- `/world` loads the processed zone, rebuilds 45 render-chunk index ranges, and
  culls them through `ShadoWorldReducer` every frame;
- `/world-editor` adds cluster-bound and streaming-tile overlays, live package
  diagnostics, and a freeze-culling control for world development.

The main `/` VAT sandbox also attaches the prebuilt world. Its actor pools use
the same visibility frame as the world geometry through
`ShadoWorldVisibilityCoordinator`:

```text
camera + optional PVS row
        ↓
WASM BVH4 cluster reducer
        ↓
cluster flags → cell flags → material-packet flags
                         ↓
actor cell + sphere/frustum + range reducer
                         ↓
SoA culling-reason bytes + compact visible actor indices
```

Both the BVH4 traversal and the entity visibility/compaction loop execute in
the embedded AssemblyScript/WASM reducer. The artifact is format version 3;
the demo uses a versioned URL so stale browser caches cannot mix layouts.

Each actor culling byte records independent `Pvs`, `Geometry`, `Frustum`,
`Distance`, `Loaded`, `Phase`, and `PortalReachable` reasons plus a final `Visible` bit. The existing one-byte visibility
plane remains the renderer-facing boolean, while the reason plane makes reducer
composition and editor diagnostics explicit. World packages may include dense
`pvs.words` rows. The compiler emits stable outdoor cell records and conservative
all-visible rows when no trustworthy visual portal topology is available. Loaded,
phase, and portal-reachability byte sidecars then prune those candidates without
making terrain visibility a topology prerequisite. Runtime deserialization checks
all reducer-facing array lengths, references, and the package layout checksum.

Next layers are cell/portal/PVS import, semantic volumes, hierarchical LOD,
and reducer-side packet/LOD selection.

## Region authoring

`/world-editor` edits a versioned `shado.world.authoring` document. Regions have
durable IDs, AABB center/size, a semantic kind, enable and phase state, tags,
and an arbitrary JSON metadata object. The editor supports scene selection,
position/scale gizmos, duplication, type replacement, deletion, complete-file
replacement, and JSON export.

The browser keeps working changes under `shado-world-authoring:<world>` in local
storage. Export the document to:

```text
sandbox/public/shado/worlds/qey2hh1.authoring.json
```

Then run `npm run preprocess:qey2hh1:world`. The packer validates stable IDs and
compiles region bounds and phase data into SoA planes in the spatial artifact,
while retaining indexed tags and metadata for tools and gameplay. The same
document can optionally be stored in GLB root extras under
`EXT_shado_world_authoring`; the separate sidecar remains the preferred source
because it is diffable and can be replaced without rewriting the GLB binary.

## One-off zone migration

Convert every `.glb` and `.glb.gz` in a flat directory with the compiler defaults:

```sh
npm run migrate:zones -- --input-dir ../assets/reference/everquest_rof2/zones \
  --metadata-dir ../assets/reference/everquest_rof2/zones \
  --object-prefix /eqrequiem/objects \
  --out-dir sandbox/public/shado/worlds
```

Each zone produces a compressed spatial package, a copied runtime GLB, and an
editable `<zone>.authoring.json` sidecar. When `<zone>.json` exists in the
metadata directory, its regions and object placement table are promoted
automatically. Object model keys become deduplicated prototypes and placements
become stable stamps with explicit degree rotations. Every conversion merges
new prototype, placement, and region IDs from the metadata sidecar. Existing
rows remain authoring-owned, so editor changes are preserved rather than reset
to the legacy sidecar values.

The spatial package stores object transforms as SoA arrays, conservative stamp
radii and cell IDs, plus prototype-to-stamp reference ranges. At runtime,
`ShadoWorldVisibilityCoordinator.reduceWorldObjects()` intersects those stamps
with PVS, loaded-cell, frustum, distance and phase policy, returning visible
stamp indices already grouped by prototype for thin-instance uploads.

Existing spatial packages are skipped when their GLB, metadata JSON, and
authoring sidecar are unchanged. A newer input automatically rebuilds and
merges new metadata rows. Use `--dry-run` to inspect the migration and
`--overwrite` to force every spatial package to rebuild.
`--runtime-prefix /some/path` changes the world source URL stored in every
package; `--object-prefix /some/object/path` changes generated prototype URLs.
