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
  | 'semantic';

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
  regions: ShadoWorldAuthoringRegion[];
  objects: ShadoWorldAuthoringObjects;
};

export type ShadoWorldPrimitive = {
  name: string;
  material: string;
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** Optional glTF TEXCOORD_1 stream used by the offline lightmap baker. */
  lightmapUvs?: ArrayLike<number>;
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
  authoring?: ShadoWorldAuthoringDocument;
  /** Collision-selected primitives in final runtime coordinates. */
  collisionPrimitives?: readonly ShadoWorldPrimitive[];
  /** Runtime URL, normally a sibling of the spatial package. */
  collisionSource?: string;
};

export type ShadoWorldSourceTransform = 'identity' | 'mirror-x';

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
  format: 'shado-collision-v1';
  vertexCount: number;
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
  materials: string[];
  primitives: Array<{ name: string; material: number; vertexCount: number }>;
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
      radius: number[];
      cellId: number[];
      phaseMask: number[];
      tags: string[][];
      metadata: Record<string, unknown>[];
    };
  };
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
