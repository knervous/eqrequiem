export type WorldVec3 = [number, number, number];

export const SHADO_WORLD_AUTHORING_EXTRAS_KEY = 'EXT_shado_world_authoring';

export type ShadoWorldRegionKind =
  | 'visibility-cell'
  | 'streaming'
  | 'water'
  | 'lava'
  | 'safe'
  | 'zone-line'
  | 'audio'
  | 'trigger'
  | 'fx'
  | 'semantic';

export type ShadoWorldFxCullProfile = 'near-detail' | 'mid-atmosphere' | 'far-landmark' | 'always';

export type ShadoWorldFxPattern = {
  version: 1;
  /** Runtime factory key such as `grass`, `light-rays`, or `wind-volume`. */
  effect: string;
  placement: 'point' | 'volume' | 'surface';
  culling: {
    profile: ShadoWorldFxCullProfile;
    /** Optional profile override in final Babylon world units. */
    maxDistance?: number;
    /** Width of the shader/LOD transition before hard culling. */
    fadeDistance?: number;
    /** Optional reducer cadence override. */
    updateHz?: number;
    outsideWorldVisible?: boolean;
  };
  budget?: {
    qualityTier?: 'low' | 'medium' | 'high' | 'ultra';
    maximumInstances?: number;
    maximumDraws?: number;
  };
  /** Effect-owned payload kept off the reducer's hot SoA planes. */
  parameters?: Record<string, unknown>;
};

export type ShadoWorldAuthoringRegion = {
  /** Durable identity used by scripts, diffs, and replacement operations. */
  id: string;
  name: string;
  kind: ShadoWorldRegionKind;
  enabled: boolean;
  center: WorldVec3;
  size: WorldVec3;
  phaseMask: number;
  tags: string[];
  /** Tool/game-specific payload deliberately kept outside hot reducer planes. */
  metadata: Record<string, unknown>;
};

export type ShadoWorldObjectPrototype = {
  /** Stable model key used to batch stamped instances into one draw source. */
  id: string;
  /** Runtime asset URL. The client loads this once and creates visible instances from it. */
  source: string;
  /** Conservative unscaled sphere radius used before the model asset is resident. */
  boundsRadius: number;
  metadata: Record<string, unknown>;
};

export type ShadoWorldObjectStamp = {
  /** Durable identity retained across editor operations and migration reruns. */
  id: string;
  prototype: string;
  enabled: boolean;
  position: WorldVec3;
  /**
   * Babylon Y-X-Z Euler degrees. Legacy coordinate conversion happens during
   * preprocessing; renderers and clients must not invert or swap these axes.
   */
  rotationDegrees: WorldVec3;
  scale: WorldVec3;
  phaseMask: number;
  tags: string[];
  metadata: Record<string, unknown>;
};

export type ShadoWorldAuthoringObjects = {
  prototypes: ShadoWorldObjectPrototype[];
  stamps: ShadoWorldObjectStamp[];
};

export type ShadoWorldAuthoringDocument = {
  kind: 'shado.world.authoring';
  version: 1;
  world: string;
  coordinateSystem: 'babylon-y-up';
  revision: number;
  /** Durable tombstones preventing legacy metadata merges from restoring removed props. */
  legacyObjectExclusions?: string[];
  regions: ShadoWorldAuthoringRegion[];
  objects: ShadoWorldAuthoringObjects;
};

export type ShadoWorldPrimitive = {
  name: string;
  material: string;
  /** Optional material-authored runtime role retained by headless preprocessing. */
  extraShader?: string;
  /** Optional authored streaming profile retained from glTF extras. */
  visibilityProfile?: string;
  /** Optional authored PVS priority retained from glTF extras. */
  pvsPriority?: string;
  /** Bitwise ShadoCollisionFlags retained from glTF collision metadata. */
  collisionFlags?: number;
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** Optional glTF TEXCOORD_1 stream used by the offline lightmap baker. */
  lightmapUvs?: ArrayLike<number>;
};

export type ShadoWorldGrassCompileOptions = {
  cellSize?: number;
  density?: number;
  maxPlacements?: number;
  maxPlacementsPerPrimitive?: number;
  minimumUpNormal?: number;
  minHeight?: number;
  maxHeight?: number;
  bladeWidth?: number;
  seed?: number;
};

export type ShadoWorldGrassPackage = {
  version: 1;
  cellSize: number;
  cells: {
    x: number[];
    z: number[];
    firstPlacement: number[];
    placementCount: number[];
  };
  placements: {
    positionX: number[];
    positionY: number[];
    positionZ: number[];
    yaw: number[];
    width: number[];
    height: number[];
    phase: number[];
    stiffness: number[];
    colorVariation: number[];
  };
  /** Fixed-resolution authored-surface mask, including topmost non-grass blockers. */
  coverage?: {
    resolution: number;
    wordsPerCell: number;
    words: number[];
  };
};

export type ShadoWorldCompileOptions = {
  name: string;
  source?: string;
  /**
   * Transform applied to the source scene and its extracted geometry before
   * either becomes runtime Babylon Y-up world space.
   */
  sourceTransform?: ShadoWorldSourceTransform;
  tileSize?: number;
  maxClusterTriangles?: number;
  /**
   * Smallest triangle count a render chunk should reach before the compiler
   * stops merging neighbouring cells into it. Render chunks are draw units, so
   * a per-cell fragment of two triangles costs a full mesh and draw call for
   * almost no geometry. Merging trades culling granularity for draw calls.
   */
  minRenderChunkTriangles?: number;
  /**
   * Ceiling on how far a merged render chunk may span, in world units. Chunk
   * visibility is the union of its clusters, so an unbounded merge would keep
   * distant geometry resident whenever any part of it is on screen.
   */
  maxRenderChunkExtent?: number;
  /** Width/depth of continuous camera/entity visibility regions. */
  visibilityRegionSize?: number;
  /** Ordinary-region first-pass envelope. Persistent vista cells bypass it. */
  visibilityMaxDistance?: number;
  /** Offline proximity-grass conversion. Set false to omit tagged grass. */
  grass?: ShadoWorldGrassCompileOptions | false;
  /** Explicit runtime lighting authority. Vertex-color presence is never used to infer this. */
  runtimeLighting?: ShadoWorldRuntimeLighting;
  authoring?: ShadoWorldAuthoringDocument;
  /** Collision-selected primitives in final runtime coordinates. */
  collisionPrimitives?: readonly ShadoWorldPrimitive[];
  /** Width/depth of independently resident Havok collision chunks. */
  physicsChunkSize?: number;
  /** Runtime URL, normally a sibling of the spatial package. */
  collisionSource?: string;
};

export type ShadoWorldSourceTransform = 'identity' | 'mirror-x';

export type ShadoWorldRuntimeLighting = {
  mode: 'dynamic' | 'hybrid' | 'baked';
  /** Declares the semantic role of COLOR_0 instead of guessing from its presence. */
  vertexColors: 'material-tint' | 'baked-irradiance';
};

export type ShadoWorldNavigationModifier = {
  /** Stable authored region row supplying this build operation. */
  region: number;
  /** Recast area ID (0..63). */
  area: number;
  /** Detour polygon flags compiled for this area. */
  flags: number;
  /** Excluded spans are removed rather than assigned a traversable area. */
  excluded: number;
  /** Recast-space AABB center after the runtime-to-Recast boundary transform. */
  centerX: number;
  centerY: number;
  centerZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
};

export type ShadoWorldBounds = {
  min: WorldVec3;
  max: WorldVec3;
};

export type ShadoWorldCollisionDescriptor = {
  source: string;
  format: 'shado-collision-v2';
  chunkSize: number;
  chunkCount: number;
  /** Unique source triangles before conservative boundary duplication. */
  sourceTriangleCount: number;
  /** Stored chunk-local vertices, including cross-chunk duplication. */
  vertexCount: number;
  /** Stored triangles, including references duplicated across intersected chunks. */
  triangleCount: number;
  bounds: ShadoWorldBounds;
  /** FNV-1a hash of the uncompressed artifact bytes. */
  contentHash: string;
};

export type ShadoWorldSpatialPackage = {
  kind: 'shado.world.spatial';
  version: 5;
  name: string;
  /** Runtime geometry, regions, and object transforms are all Babylon Y-up. */
  coordinateSystem: 'babylon-y-up';
  sourceTransform: ShadoWorldSourceTransform;
  source?: string;
  bounds: ShadoWorldBounds;
  collision: ShadoWorldCollisionDescriptor;
  triangleCount: number;
  /** Runtime lighting policy authored by the packer; never inferred from mesh attributes. */
  lighting?: ShadoWorldRuntimeLighting;
  materials: string[];
  primitives: Array<{
    name: string;
    material: number;
    vertexCount: number;
    /** Authored vistas that bypass both world visibility and mesh-frustum culling. */
    persistent?: boolean;
  }>;
  clusterIndices: number[];
  /** Cluster IDs grouped by stable source-geometry render chunks. */
  renderChunkClusters: number[];
  clusters: {
    centerX: number[];
    centerY: number[];
    centerZ: number[];
    radius: number[];
    coneX: number[];
    coneY: number[];
    coneZ: number[];
    coneCutoff: number[];
    firstIndex: number[];
    indexCount: number[];
    primitive: number[];
    materialPacket: number[];
    renderChunk: number[];
    lodParent: number[];
    cellId: number[];
  };
  packets: {
    cellId: number[];
    material: number[];
    firstCluster: number[];
    clusterCount: number[];
  };
  renderChunks: {
    primitive: number[];
    material: number[];
    firstClusterRef: number[];
    clusterRefCount: number[];
  };
  /** Stable topology records. Kind 0 is an outdoor streaming tile. */
  cells: {
    kind: number[];
    minX: number[];
    minY: number[];
    minZ: number[];
    maxX: number[];
    maxY: number[];
    maxZ: number[];
    firstCluster: number[];
    clusterCount: number[];
    phaseMask: number[];
  };
  /** Authored visual portal edges. Outdoor-only packages intentionally emit none. */
  portals: {
    fromCell: number[];
    toCell: number[];
    dynamicStateId: number[];
    flags: number[];
  };
  /** Compiled region bounds; metadata remains indexed by the same stable row. */
  regions: {
    id: string[];
    name: string[];
    kind: ShadoWorldRegionKind[];
    enabled: number[];
    centerX: number[];
    centerY: number[];
    centerZ: number[];
    sizeX: number[];
    sizeY: number[];
    sizeZ: number[];
    phaseMask: number[];
    tags: string[][];
    metadata: Record<string, unknown>[];
  };
  /** Static-object batches and culling planes. Stamps retain authoring order. */
  objects?: {
    prototypes: {
      id: string[];
      source: string[];
      boundsRadius: number[];
      firstStampRef: number[];
      stampRefCount: number[];
      metadata: Record<string, unknown>[];
    };
    /** Stamp IDs grouped by prototype without duplicating transform records. */
    prototypeStampRefs: number[];
    stamps: {
      id: string[];
      prototype: number[];
      enabled: number[];
      positionX: number[];
      positionY: number[];
      positionZ: number[];
      rotationX: number[];
      rotationY: number[];
      rotationZ: number[];
      scaleX: number[];
      scaleY: number[];
      scaleZ: number[];
      /** Optional offline-baked irradiance, one linear RGBA value per stamp. */
      irradianceR?: number[];
      irradianceG?: number[];
      irradianceB?: number[];
      irradianceA?: number[];
      radius: number[];
      cellId: number[];
      phaseMask: number[];
      tags: string[][];
      metadata: Record<string, unknown>[];
    };
  };
  /** Offline-converted static grass placements grouped into proximity cells. */
  grass?: ShadoWorldGrassPackage;
  tiles: {
    size: number;
    originX: number;
    originZ: number;
    x: number[];
    z: number[];
    firstCluster: number[];
    clusterCount: number[];
  };
  /**
   * Limits the compiler applied when merging cell-bounded clusters into draw
   * units. A render chunk may span multiple cells, so consumers validating
   * culling granularity check against these rather than assuming one cell.
   */
  renderChunkLimits: {
    minTriangles: number;
    /** Ceiling on merged XZ extent. Persistent chunks are exempt. */
    maxExtent: number;
  };
  /**
   * Continuous, dense first-pass culling topology. Unlike geometry-derived
   * cells, these regions cover every point inside the package bounds.
   */
  visibility?: {
    version: 1;
    /** Conservative authority used to construct region rows. */
    mode: 'distance-flood';
    size: number;
    originX: number;
    originZ: number;
    width: number;
    height: number;
    maxDistance: number;
    /** Reserved for future authored/height-aware occluders; zero in distance-flood mode. */
    occluderCount: number;
    /** Directed set-bit count across all conservative PVS rows. */
    visibleRegionPairs: number;
    /** Exact render-cell to dense visibility-region ownership. */
    cellRegion: number[];
    /** Regions containing authored persistent vistas such as zoneline horizons. */
    persistentRegions: number[];
    /** Render cells that bypass regional occlusion without widening entity PVS. */
    persistentCells: number[];
    /** Conservative region-to-region potentially-visible rows. */
    pvs: {
      wordsPerRow: number;
      words: number[];
    };
  };
  /**
   * Navigation build inputs share authored identity and tile addressing with
   * the spatial package, but remain a separate Recast/Detour product.
   */
  navigation: {
    runtimeToRecast: 'z-y-negative-x';
    modifiers: {
      region: number[];
      area: number[];
      flags: number[];
      excluded: number[];
      centerX: number[];
      centerY: number[];
      centerZ: number[];
      sizeX: number[];
      sizeY: number[];
      sizeZ: number[];
    };
  };
  /** Optional conservative PVS rows. Bit N in row C means cell N may be visible from C. */
  pvs?: {
    wordsPerRow: number;
    words: number[];
  };
  integrity: {
    algorithm: 'fnv1a32-layout';
    layoutHash: string;
  };
  bvh: {
    root: number;
    nodeCount: number;
    quantizationMin: WorldVec3;
    quantizationExtent: WorldVec3;
    childMinX: number[];
    childMinY: number[];
    childMinZ: number[];
    childMaxX: number[];
    childMaxY: number[];
    childMaxZ: number[];
    childRef: number[];
  };
};
