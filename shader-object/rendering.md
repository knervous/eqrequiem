Rendering techniques. In my eq projects we noticed legacy used bsp and used that region data for lots of optimization early on. Things like visible regions from nodes etc as a rendering pass. Then it seems they offloaded later to something like AABB and have a dll sidecar that does the work. What are the best options for me for preprocessing world geo to translate in my wasm kernel reducer for culling and other ops like defining areas like water, pvp, lava etc
Worked for 2m 30s

What the legacy EQ pipeline got from BSP was not merely triangle partitioning. It got a world topology:

Which region contains the camera/entity?
Which regions can potentially see one another?
Which geometry belongs to each region?
Which transitions connect regions?
Which environmental rules apply there?

Replacing that with “AABBs” usually means those concerns were decoupled into a separate spatial-query system—likely an AABB tree, BVH, octree, or collision sidecar. An AABB by itself is only a bound; the acceleration structure around the bounds is what matters.

For your project, I would build a layered spatial database, not choose one universal structure.

Recommended architecture
Zone package
├── Cell/portal graph
│   ├── indoor visibility topology
│   ├── PVS bitsets
│   └── doors and dynamic portals
│
├── Geometry clusters
│   ├── GPU-ready index ranges
│   ├── bounds and normal cones
│   ├── material/draw packet IDs
│   └── hierarchical LOD
│
├── Static BVH
│   ├── cluster queries
│   ├── collision proxies
│   ├── line-of-sight
│   └── spatial fallback
│
├── World grid/quadtree
│   ├── outdoor coarse lookup
│   ├── streaming tiles
│   └── entity interest management
│
├── Semantic volumes
│   ├── water
│   ├── lava
│   ├── PvP
│   ├── safe zone
│   ├── indoors/outdoors
│   └── audio/weather/environment
│
└── Recast/Detour data
    ├── walkability
    ├── movement costs
    └── pathfinding regions

The key principle is:

Cells describe world topology, clusters describe render work, the BVH accelerates geometry queries, and semantic volumes describe gameplay.

Do not make the navmesh or render BSP the authoritative representation for everything.

1. Retain or rebuild cell/portal topology

For EQ-style indoor zones, dungeons, cities, and buildings, BSP-derived leaves or manually authored sectors remain extremely valuable.

Each cell would contain:

interface Cell {
  bounds: QuantizedAABB;
  firstPortal: number;
  portalCount: number;

  firstClusterRef: number;
  clusterRefCount: number;

  pvsOffset: number;
  semanticMask: number;
}

Portals connect cells:

interface Portal {
  fromCell: number;
  toCell: number;

  plane: QuantizedPlane;
  firstVertex: number;
  vertexCount: number;

  dynamicStateId: number; // door, gate, destructible wall
}

At runtime:

camera position
    ↓
locate current cell
    ↓
read conservative PVS bitset
    ↓
apply currently closed portal restrictions
    ↓
frustum-test candidate cells
    ↓
process only their geometry clusters

A PVS bitset is exceptionally reducer-friendly. With 4,096 cells, one uncompressed PVS row is only 512 bytes. You can intersect it with streaming, distance, phase, and portal masks using 128-bit Wasm SIMD:

visibleCells =
    pvs[cameraCell]
  & loadedCells
  & phaseMask
  & portalReachability

For predominantly outdoor areas, do not force portal topology onto everything. Use grid/quadtree tiles, with authored portal cells only where the terrain enters caves, buildings, canyons, tunnels, or walled settlements.

Deriving cells

In order of reliability:

Reuse original BSP leaves/region information where available.
Merge tiny or overfragmented BSP leaves into larger logical cells.
For new content, author room and portal volumes in Blender.
For mostly watertight interiors, voxelize free space, flood-fill cells, and derive candidate openings.
For open terrain, use fixed tiles or a quadtree instead.

Fully automatic portal generation from arbitrary decorative geometry tends to be fragile. Artist-authored cells and portals are a reasonable trade for important areas.

2. Preprocess static geometry into render clusters

Do not make one Babylon mesh per BSP leaf or per tiny cluster. Babylon’s normal active-mesh evaluation is CPU-side mesh frustum culling, and a large mesh becomes active when any portion intersects the frustum. Its built-in occlusion queries are asynchronous and generally operate on mesh bounds, which makes them more suitable for large objects or chunks than thousands of tiny world fragments.

Instead, split static geometry into small spatial clusters offline, then group those clusters into sensible draw packets.

A cluster might contain roughly:

32–128 triangles
one material
spatially compact geometry
one bounding sphere or AABB
optional normal cone
one or more LOD parents

meshoptimizer already provides meshlet construction, spatially coherent cluster generation, cluster bounds, normal-cone bounds, cluster partitioning, and GPU-friendly vertex/index optimization. Its bounds support sphere-based frustum/occlusion tests and normal-cone rejection of clusters whose triangles are guaranteed to face away from the camera.

Your runtime metadata could look like:

interface GeoCluster {
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;

  coneX: number;
  coneY: number;
  coneZ: number;
  coneCutoff: number;

  firstIndex: number;
  indexCount: number;
  baseVertex: number;

  materialPacket: number;
  lodParent: number;
  cellId: number;
}

For Wasm, store this as SoA:

clusterCenterX[]
clusterCenterY[]
clusterCenterZ[]
clusterRadius[]

clusterConeX[]
clusterConeY[]
clusterConeZ[]
clusterConeCutoff[]

clusterFirstIndex[]
clusterIndexCount[]
clusterMaterialPacket[]
clusterLodParent[]
Important WebGPU distinction

Although these are often called meshlets, WebGPU does not currently expose native mesh shaders. Also, current WebGPU supports individual indirect draws, but not standardized multi-draw-indirect in the core API; multi-draw remains an active GPUWeb design issue. Therefore, creating 100,000 clusters and issuing 100,000 indirect draw calls is not a workable browser rendering strategy.

Use clusters as:

culling units
LOD units
streaming units
occlusion units
geometry-building units

But aggregate visible clusters into a much smaller number of material draw packets, chunk submeshes, or instance batches.

For example:

Cell 181
├── stone packet
│   ├── cluster 100
│   ├── cluster 104
│   └── cluster 112
├── wood packet
└── water packet

The best static-world output may be several merged buffers per zone:

positions buffer
attributes buffer
indices buffer
cluster metadata
material packet metadata

Clusters reference contiguous index ranges where practical.

3. Build a quantized wide BVH

The cell graph answers topology questions efficiently, but you still want a BVH for:

camera-cell fallback lookup
cluster intersection
line-of-sight
projectiles
click/picking queries
collision broad phase
sound obstruction
irregular volumes
geometry that spans cells

For static world geometry, I would build an offline BVH4 or BVH8, using surface-area heuristics, and store quantized child bounds relative to the zone or parent node.

Conceptually:

interface BVHNode4 {
  childMinX: Uint16Array4;
  childMinY: Uint16Array4;
  childMinZ: Uint16Array4;

  childMaxX: Uint16Array4;
  childMaxY: Uint16Array4;
  childMaxZ: Uint16Array4;

  childRef: Uint32Array4;
}

A wide node maps well to branch-reduced SIMD testing in Wasm. Keep it:

flat
pointer-free
immutable
breadth-first or depth-first reordered for locality
quantized where precision permits

I would probably maintain two related structures:

Render BVH
└── bounds over geometry clusters

Query/collision BVH
└── bounds over simplified collision triangles and convex proxies

The renderer does not need every decorative collision triangle, and collision does not need UV seams, foliage cards, or small visual details.

4. Treat gameplay areas as explicit semantic volumes

Do not infer PvP, lava, safe zones, weather regions, or audio spaces from render leaves at runtime.

BSP leaves can seed the data, but the canonical representation should be explicit volumes:

enum VolumeKind {
  Water,
  Lava,
  PvP,
  Safe,
  NoLevitate,
  Indoor,
  Weather,
  Audio,
  ZoneLine,
  ScriptTrigger
}

interface SemanticVolume {
  bounds: QuantizedAABB;
  shapeType: number;
  kind: number;
  priority: number;
  flags: number;
  shapeOffset: number;
  payloadId: number;
}

Recommended shapes:

Use	Shape
PvP/safe/weather region	Extruded convex polygon
Simple trigger	AABB
Towers, wells, circular areas	Cylinder
Water/lava lake	Polygon footprint + surface plane/height
Irregular cave volume	Convex decomposition
Terrain-following environment	Tiled heightfield or coarse voxel field

For water, store more than an inside/outside flag:

interface LiquidVolume {
  footprintId: number;
  minY: number;
  surfaceType: number;

  // Plane, constant height, heightfield, or procedural surface.
  surfaceDataOffset: number;

  damagePerTick: number;
  movementProfile: number;
  materialId: number;
}

Then the query can return:

interface EnvironmentResult {
  regionId: number;
  flags: number;

  medium: Air | Water | Lava;
  liquidDepth: number;
  liquidSurfaceY: number;

  pvpRuleset: number;
  audioRegion: number;
  weatherRegion: number;
}

Use explicit precedence rules:

Medium:
lava > water > air

Gameplay rules:
bitwise additive

Audio/weather:
highest-priority containing volume

Cell metadata:
fallback only

This avoids bizarre behavior when volumes overlap.

5. Recast areas should be derived, not authoritative

Recast is useful here, but only for the movement interpretation of the world.

Recast can rasterize geometry into a compact heightfield, build regions, and mark box, convex-polygon, or cylinder areas with area IDs. That is excellent for representing movement categories such as walkable, water, lava, road, mud, or dangerous terrain on navigable spans.

However, Recast areas are tied to navigable spans. They are not sufficient for:

whether a flying entity is inside a PvP zone
whether the camera is underwater
an audio reverb volume above a staircase
weather exclusion inside a building
volumetric lava above or below a walkable surface
non-walkable trigger volumes

So derive Recast area IDs from your semantic volumes:

semantic water volume
    ├── environment query data
    ├── underwater rendering data
    └── Recast water area/cost

semantic lava volume
    ├── damage rules
    ├── visual data
    └── Recast lava/non-walkable area

One authored volume then generates several subsystem-specific artifacts.

6. The reducer pass I would implement

The Wasm reducer should not touch triangles during ordinary visibility determination.

Its inputs:

camera position
view frustum planes
projection parameters
current cell
portal states
loaded tile mask
render phase mask
previous visibility state

Its outputs:

visible cell bitset
visible cluster IDs
visible draw-packet ranges
requested streaming tiles
environment state

The pass:

1. Locate camera cell
2. Load cell PVS
3. Restrict it through dynamic portal reachability
4. Intersect with loaded/active cells
5. Frustum-test cell bounds
6. Iterate cluster references belonging to surviving cells
7. Sphere/AABB frustum test
8. Normal-cone backface test
9. Select LOD using projected size
10. Apply occlusion history or HZB result
11. Append visible clusters to material packet lists
12. Emit compact rendering commands

Pseudo-code:

function reduceVisibility(camera: CameraData): void {
  const cell = locateCell(camera.position);

  copyBitset(candidateCells, pvsForCell(cell));
  andBitset(candidateCells, loadedCells);
  andBitset(candidateCells, activePhaseCells);

  applyDynamicPortalReachability(cell, candidateCells);

  forEachSetBit(candidateCells, (cellId) => {
    if (!frustumIntersectsCell(camera.frustum, cellId)) {
      return;
    }

    forEachClusterInCell(cellId, (clusterId) => {
      if (!sphereInFrustum(clusterId, camera.frustum)) {
        return;
      }

      if (normalConeBackfacing(clusterId, camera.position)) {
        return;
      }

      const lodCluster = selectClusterLod(clusterId, camera);
      appendToPacket(clusterMaterialPacket[lodCluster], lodCluster);
    });
  });
}

This is an excellent workload for Wasm SIMD because it consists primarily of:

bitset operations
linear array traversal
plane/sphere tests
packed numeric metadata
append-only output queues
7. Occlusion strategy

I would use three levels.

Level 1: PVS and portals

This is your cheapest and most powerful indoor rejection. Entire rooms, tunnels, and wings disappear before geometric testing.

Level 2: CPU/Wasm bounds

Frustum, distance, projected-size, normal-cone, and LOD tests.

Level 3: GPU depth-pyramid occlusion

For dense outdoor cities or complicated terrain, render major opaque occluders or a depth prepass, build a hierarchical Z buffer, and test cluster or chunk bounds against it in WebGPU compute.

Because GPU visibility results should generally remain on the GPU, HZB is most attractive when the output can become:

instance compaction
indirect instance counts
a small collection of chunk flags
material-bucketed geometry

Avoid GPU culling followed by reading thousands of visibility flags back into Wasm. That introduces latency and synchronization that can erase the benefit.

Babylon’s normal occlusion queries are asynchronous and generally use earlier-frame results, so I would reserve them for a small number of expensive large chunks rather than treating them as the primary world visibility system.

8. Suggested offline build pipeline
Source GLB / original EQ zone data
            │
            ├── extract material and author tags
            ├── recover/rebuild cells and portals
            ├── generate conservative PVS
            ├── split static geometry by:
            │     cell → material → spatial cluster
            ├── optimize vertex/index order
            ├── create cluster bounds and normal cones
            ├── build hierarchical cluster LOD
            ├── build render BVH
            ├── build simplified collision BVH
            ├── rasterize Recast tiles
            ├── compile semantic volumes
            └── emit streaming packages

gltfpack can optimize vertex fetch/cache order, quantize geometry, merge compatible meshes, simplify content, and emit meshoptimizer-compressed glTF that Babylon supports. I would use that either as one stage or replicate the specific meshoptimizer operations inside your custom zone compiler.

Outputs:

zone.render.bin
├── vertices
├── indices
├── material packets
└── LOD geometry

zone.spatial.bin
├── cells
├── portals
├── PVS
├── cluster bounds
├── render BVH
└── semantic volumes

zone.collision.bin
├── simplified collision vertices
├── triangles
├── convex hulls
└── collision BVH

zone.nav.bin
└── Detour tiles

Your Babylon client and Node server can share zone.spatial.bin, while only the client needs the full rendering package.

My concrete recommendation for Requiem

Start with this hybrid:

Indoor visibility:
    BSP-derived cells + portals + PVS

Outdoor visibility and streaming:
    fixed grid/quadtree tiles

Static render geometry:
    meshoptimizer clusters grouped into material packets

Fine spatial queries:
    quantized BVH4

Water/lava/PvP/etc.:
    explicit semantic convex volumes

Pathfinding:
    Recast generated from collision geo + semantic volumes

Dynamic entities:
    separate uniform grid or hashed grid

The old BSP region data is worth preserving because it encodes information that an AABB tree cannot recover cheaply: connectivity and visibility topology. But the BSP should become an import source for your modern cell graph, not a monolithic structure that rendering, collision, navigation, scripting, liquids, and PvP rules must all traverse.

The optimal runtime arrangement is consequently:

topology → cells and portals
geometry → clusters and BVH
gameplay → semantic volumes
navigation → Recast
render submission → Babylon/WebGPU packets

That gives your Wasm kernel a compact, immutable, numeric scene representation while avoiding the original engine’s coupling between every world subsystem and its BSP.

Does recast already solve this or offer some level of compatibility 
Worked for 59s

Recast solves a meaningful part of this pipeline, but not the rendering-visibility part. It is highly compatible with the architecture I described, provided you treat it as the navigation-derived layer, not the master world partition.

A useful breakdown:

Requirement	Recast/Detour
Rasterize static world geometry	Yes
Generate walkable regions	Yes
Generate tiled spatial data	Yes
Mark water/lava/road terrain	Yes, on navigable surfaces
Apply movement costs and filters	Yes
Query nearby navigable polygons	Yes
Dynamic navigation obstacles	Partially, through TileCache
General 3D trigger volumes	No
Camera-underwater detection	Not reliably
PvP volumes independent of ground	No
Render-region generation	No
Portal/PVS visibility	No
Frustum or occlusion culling	No
Render-cluster generation	No
General collision BVH	No
What Recast already gives you

Recast takes triangle geometry, rasterizes it into a voxel heightfield, removes unusable spans, partitions the remaining walkable space into regions, and generates convex navmesh polygons. It can build this as a tiled navmesh suitable for streaming and partial rebuilds.

That means it already solves much of your:

world geometry
    ↓
walkable spatial representation
    ↓
connected regions
    ↓
compact convex polygon graph

The generated rcPolyMesh includes:

convex polygons
polygon neighbor information
region IDs
area IDs
user-defined flags
quantized vertices

That is already quite close to the sort of flat numeric data your Wasm kernels like.

Water, lava, roads, dangerous areas

Recast directly supports marking spans with area IDs using:

rcMarkBoxArea(...)
rcMarkConvexPolyArea(...)
rcMarkCylinderArea(...)

The convex-polygon version is essentially an XZ polygon extruded between minY and maxY. Those area IDs flow into the generated navmesh polygons.

Detour supports up to 64 area IDs, and its query filters can assign traversal costs and include/exclude polygons using 16-bit polygon flags.

So you can naturally define:

enum NavArea {
  Ground = 0,
  Water = 1,
  Lava = 2,
  Road = 3,
  Mud = 4,
  Door = 5,
  Jump = 6,
}

And configure agents differently:

Human:
    ground = 1.0
    road   = 0.8
    water  = excluded
    lava   = excluded

Swimming NPC:
    water  = 1.0
    ground = excluded

Fire elemental:
    lava   = 1.0
    ground = 1.2

That is exactly within Recast/Detour’s design.

But Recast areas only classify navigable spans

This is the critical limitation.

Suppose you create a water volume:

water surface: Y = 20
lake floor:    Y = 5

Recast may mark the navigable lake floor as Water, but it does not preserve a general volumetric statement that every point between Y=5 and Y=20 is underwater.

Therefore:

NPC standing on lake floor       → Recast can classify it
player swimming above navmesh    → not necessarily
camera underwater                → not reliably
flying entity inside PvP volume  → not covered
projectile passing through lava  → not covered

Recast’s marking functions modify spans in the compact heightfield and ultimately navmesh polygons. They do not create an arbitrary runtime volume database.

You should author the volume once, but compile it into two representations:

Authored water volume
├── Recast area marking
└── Runtime semantic volume

For example:

interface SemanticVolume {
  kind: VolumeKind;
  minY: number;
  maxY: number;

  firstVertex: number;
  vertexCount: number;

  priority: number;
  payload: number;
}

The same convex polygon can be passed to rcMarkConvexPolyArea() during the navmesh build and serialized into your Wasm environment-volume arrays.

Recast “regions” are not rendering regions

Recast does generate regions using watershed, monotone, or layer partitioning. It also retains a region ID per generated polygon.

But these regions are generated to produce good navmesh polygons. They are based on:

walkable spans
agent clearance
voxel resolution
slope rules
minimum region size
region merging
navmesh tile boundaries

They are not based on visual occlusion.

Consider two rooms separated by a wall with a doorway:

Room A ── doorway ── Room B

Recast sees connected walkable space and may represent the rooms as a continuously connected polygon graph.

A rendering portal system wants:

Room A cell
    ↓ doorway portal
Room B cell

because the doorway constrains visibility. Recast has no reason to preserve that distinction unless the navigation bake coincidentally produces it.

Conversely, one large outdoor field might be split into many Recast regions merely to make polygonization manageable, even though all of them are mutually visible.

So Recast region IDs can be useful as:

AI district seeds
local pathfinding islands
coarse spawn-area generation
walkable connected-component analysis
navigation streaming metadata

They should not be treated as:

stable zone region IDs
BSP leaves
visibility cells
PVS rows
render chunks

Because region formation depends on bake parameters, I would also avoid persisting game scripts against raw Recast region IDs. That recommendation is an architectural inference from how the documented partitioning pipeline works.

Detour has “portals,” but they are not rendering portals

Detour calls a passable edge between adjacent navigation polygons a portal. Its documentation distinguishes polygon edges as walls or portals depending on the query filter.

That portal means:

agent can cross from polygon A to polygon B

It does not mean:

camera in room A can see room B through this aperture

Detour portals do not preserve:

full doorway geometry
occlusion planes
room enclosure
portal clipping polygons suitable for rendering
potential visibility sets

You can use the navmesh adjacency graph for AI and local interest queries, but not directly as your render portal graph.

Useful runtime queries you get for free

Detour can already perform:

nearest polygon lookup
AABB-overlap polygon queries
local neighborhood queries
surface-constrained raycasts
wall-distance queries
polygon filtering by area and flags

For example, queryPolygons() finds navmesh polygons overlapping a search box.

That is useful for:

Which navigable polygons overlap this spawn volume?
Which nav areas are beneath this entity?
Which AI nodes are near this event?
Which nav tile should be streamed?

But it is not a substitute for a geometry BVH. A Detour raycast follows the navigable surface graph; it is not an arbitrary 3D triangle raycast through world geometry.

Best compatibility design for your pipeline

I would align the systems around one shared tile coordinate system:

Zone tile (x, z)
├── Recast/Detour nav tile
├── render-cluster references
├── collision BVH root
├── semantic-volume references
├── entity interest bucket
└── streaming package

Recast already provides world-space tile parameters including origin, tile width, and tile height.

That gives you immediate compatibility without forcing every subsystem to use the navmesh itself:

const tileX = Math.floor((worldX - originX) / tileWidth);
const tileZ = Math.floor((worldZ - originZ) / tileDepth);
const tileId = tileZ * tileCountX + tileX;

Then your Wasm reducer can start from the current tile and independently retrieve:

nav data
render candidates
collision nodes
semantic volumes
dynamic entities
I would use Recast offline, then flatten its output

Although Recast is designed for source-level integration, its native C++ structures are not necessarily the representation you want your visibility reducer traversing.

For your architecture, I would:

Offline zone compiler
├── run Recast
├── extract Detour nav tiles
├── extract useful region/area metadata
├── generate render cells separately
├── build render/collision BVHs
├── compile semantic volumes
└── serialize flat immutable arrays

Runtime:

Wasm
├── custom flat Detour-compatible nav representation
├── render-cell graph
├── cluster SoA
├── volume SoA
└── BVH4 arrays

You can still compile full Detour to Wasm for path queries, but avoid making the rendering reducer crawl Detour internals merely because the navmesh happens to be available.

Practical ownership model
Recast owns:
    walkable surfaces
    nav connectivity
    agent traversal areas
    traversal costs
    nav streaming tiles
    dynamic nav obstacles

Your spatial compiler owns:
    render cells
    BSP/portal conversion
    PVS
    cluster bounds
    collision acceleration
    general environment volumes
    stable game region IDs

The most useful integration is therefore:

                authored/source geometry
                         │
            ┌────────────┴────────────┐
            │                         │
          Recast              spatial compiler
            │                         │
      nav polygons            render cells/BVH
      areas/flags             semantic volumes
            │                         │
            └──────── shared tile IDs ┘

So, Recast solves most of navigation preprocessing and part of semantic ground classification. It gives you excellent compatibility through shared geometry, tiles, convex volume marking, area IDs, flags, and polygon adjacency. It does not remove the need for your rendering cell/PVS layer or a proper general-purpose semantic-volume representation.