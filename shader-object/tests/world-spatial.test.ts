import {
  compileShadoWorld,
  decodeShadoWorldCollision,
  encodeShadoWorldCollision,
  createShadoWorldAuthoring,
  importLegacyZoneMetadata,
  mergeLegacyZoneMetadata,
  legacyZoneObjectTransformToBabylon,
  buildShadoWorldObjectRenderBatches,
  authoringFromGltfExtras,
  shadoWorldAuthoringExtras,
  queryShadoWorldFrustum,
  ShadoVisibilityBits,
  ShadoWorldReducer,
  ShadoWorldVisibilityCoordinator,
  stampShadoWorldIntegrity,
  validateShadoWorldPackage,
  validateShadoWorldAuthoring,
} from '../src/world';

function quad(x: number, material: string) {
  return {
    name: `quad-${x}`,
    material,
    positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

function joinedQuads(xs: readonly number[], material: string) {
  const positions: number[] = [];
  const indices: number[] = [];
  xs.forEach(x => {
    const vertex = positions.length / 3;
    positions.push(x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
  });
  return {
    name: 'joined-quads',
    material,
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

function grassGround(size = 32) {
  return {
    name: 'grass-ground',
    material: 'grass1',
    extraShader: 'grass',
    positions: new Float32Array([0, 0, 0, size, 0, 0, size, 0, size, 0, 0, size]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

describe('Shado world spatial compiler', () => {
  it('builds bounded clusters, tile/material packets, and a quantized BVH4', () => {
    const world = compileShadoWorld([quad(0, 'stone'), quad(20, 'wood')], {
      name: 'qey2hh1',
      tileSize: 16,
      maxClusterTriangles: 1,
    });

    expect(world.kind).toBe('shado.world.spatial');
    expect(world.version).toBe(5);
    expect(world.name).toBe('qey2hh1');
    expect(world.coordinateSystem).toBe('babylon-y-up');
    expect(world.sourceTransform).toBe('identity');
    expect(world.lighting).toEqual({
      mode: 'dynamic',
      vertexColors: 'material-tint',
    });
    expect(world.navigation.runtimeToRecast).toBe('z-y-negative-x');
    expect(world.collision).toMatchObject({
      source: 'qey2hh1.collision.bin.gz',
      format: 'shado-collision-v1',
      triangleCount: 4,
    });
    expect(world.triangleCount).toBe(4);
    expect(world.clusters.radius).toHaveLength(4);
    expect(world.clusters.indexCount.every(count => count === 3)).toBe(true);
    expect(world.tiles.x).toEqual([0, 1]);
    expect(world.packets.clusterCount.reduce((sum, count) => sum + count, 0)).toBe(4);
    expect(world.renderChunks.primitive).toHaveLength(2);
    expect(world.renderChunkClusters).toHaveLength(4);
    expect(world.clusters.renderChunk).toEqual([0, 0, 1, 1]);
    expect(world.bvh.nodeCount).toBeGreaterThan(0);
    expect(world.bvh.childRef).toHaveLength(world.bvh.nodeCount * 4);
    expect(world.cells.kind).toEqual([0, 0]);
    expect(world.cells.clusterCount).toEqual(world.tiles.clusterCount);
    expect(world.portals.fromCell).toHaveLength(0);
    expect(world.pvs).toEqual({ wordsPerRow: 1, words: [0b11, 0b11] });
    expect(world.integrity.layoutHash).toMatch(/^[0-9a-f]{8}$/);
    expect(() => validateShadoWorldPackage(world)).not.toThrow();
  });

  it('partitions triangles before clustering and emits primitive/cell render chunks', () => {
    const world = compileShadoWorld([joinedQuads([0, 40], 'stone')], {
      name: 'spatial-first',
      tileSize: 32,
      maxClusterTriangles: 128,
    });

    expect(world.tiles.x).toEqual([0, 1]);
    expect(world.clusters.radius).toHaveLength(2);
    expect(world.renderChunks.primitive).toEqual([0, 0]);
    expect(world.renderChunks.clusterRefCount).toEqual([1, 1]);
    expect(world.clusters.renderChunk).toEqual([0, 1]);
  });

  it('offline-converts tagged grass surfaces into deterministic placement cells', () => {
    const options = {
      name: 'grass-world',
      grass: {
        cellSize: 24,
        density: 0.1,
        maxPlacements: 64,
        maxPlacementsPerPrimitive: 64,
      },
    } as const;
    const first = compileShadoWorld([grassGround()], options);
    const second = compileShadoWorld([grassGround()], options);

    expect(first.grass?.version).toBe(1);
    expect(first.grass?.cellSize).toBe(24);
    expect(first.grass?.placements.positionX).toHaveLength(64);
    expect(first.grass?.cells.x.length).toBeGreaterThan(1);
    expect(first.grass?.cells.placementCount.reduce((sum, count) => sum + count, 0)).toBe(64);
    expect(first.grass?.coverage?.resolution).toBe(32);
    expect(first.grass?.coverage?.words).toHaveLength(
      first.grass!.cells.x.length * first.grass!.coverage!.wordsPerCell
    );
    expect(second.grass).toEqual(first.grass);
    expect(() => validateShadoWorldPackage(first)).not.toThrow();
  });

  it('encodes, hashes, and decodes the current dedicated collision artifact', () => {
    const artifact = encodeShadoWorldCollision([quad(0, 'stone'), quad(0, 'duplicate-material')]);
    const descriptor = {
      source: 'collision-test.collision.bin.gz',
      ...artifact.descriptor,
    };
    expect(descriptor.vertexCount).toBe(4);
    expect(descriptor.triangleCount).toBe(2);
    expect(descriptor.contentHash).toMatch(/^[0-9a-f]{8}$/);
    expect(decodeShadoWorldCollision(artifact.bytes, descriptor)).toEqual({
      positions: artifact.positions,
      indices: artifact.indices,
      bounds: artifact.bounds,
    });

    const corrupt = artifact.bytes.slice();
    corrupt[corrupt.length - 1] ^= 1;
    expect(() => decodeShadoWorldCollision(corrupt, descriptor)).toThrow(/integrity/);
  });

  it('rejects historical package layouts instead of entering compatibility mode', () => {
    const historical = structuredClone(
      compileShadoWorld([quad(0, 'stone')], {
        name: 'historical',
      })
    ) as { version: number };
    historical.version = 4;
    expect(() =>
      validateShadoWorldPackage(historical as Parameters<typeof validateShadoWorldPackage>[0])
    ).toThrow(/Unsupported/);
  });

  it('uses explicit lighting authority instead of inferring a bake from vertex colors', () => {
    const dynamic = compileShadoWorld([quad(0, 'stone')], {
      name: 'dynamic-lighting',
    });
    expect(dynamic.lighting?.mode).toBe('dynamic');

    const baked = compileShadoWorld([quad(0, 'stone')], {
      name: 'baked-lighting',
      runtimeLighting: {
        mode: 'baked',
        vertexColors: 'baked-irradiance',
      },
    });
    expect(baked.lighting?.mode).toBe('baked');
    expect(() => validateShadoWorldPackage(baked)).not.toThrow();

    baked.lighting = { mode: 'baked', vertexColors: 'material-tint' };
    stampShadoWorldIntegrity(baked);
    expect(() => validateShadoWorldPackage(baked)).toThrow(/Unsupported/);
  });

  it('validates authoring sidecars, supports GLB extras, and compiles region SoA metadata', () => {
    const authoring = createShadoWorldAuthoring('qey2hh1');
    authoring.regions.push({
      id: 'river-crossing',
      name: 'River crossing',
      kind: 'water',
      enabled: true,
      center: [4, 2, 8],
      size: [12, 4, 20],
      phaseMask: 0xffffffff,
      tags: ['outdoor', 'swim'],
      metadata: {
        damagePerSecond: 0,
        sound: 'river',
        navigation: { area: 3, flags: 5, excluded: false },
      },
    });
    expect(validateShadoWorldAuthoring(authoring, 'qey2hh1')).toBe(authoring);
    expect(authoringFromGltfExtras(shadoWorldAuthoringExtras(authoring), 'qey2hh1')).toEqual(
      authoring
    );

    const world = compileShadoWorld([quad(0, 'stone')], {
      name: 'qey2hh1',
      authoring,
    });
    expect(world.regions.id).toEqual(['river-crossing']);
    expect(world.regions.kind).toEqual(['water']);
    expect(world.regions.centerZ).toEqual([8]);
    expect(world.regions.tags).toEqual([['outdoor', 'swim']]);
    expect(world.regions.metadata).toEqual([
      {
        damagePerSecond: 0,
        sound: 'river',
        navigation: { area: 3, flags: 5, excluded: false },
      },
    ]);
    expect(world.navigation.modifiers).toEqual({
      region: [0],
      area: [3],
      flags: [5],
      excluded: [0],
      centerX: [8],
      centerY: [2],
      centerZ: [-4],
      sizeX: [20],
      sizeY: [4],
      sizeZ: [12],
    });
    expect(() => validateShadoWorldPackage(world)).not.toThrow();
  });

  it('promotes legacy object metadata into prototype batches and culling-ready stamp SoA', async () => {
    const authoring = importLegacyZoneMetadata(
      {
        version: 2.05,
        objects: {
          tree: [
            {
              x: 0.5,
              y: 2,
              z: 0,
              rotateX: 12,
              rotateY: 90,
              rotateZ: -7,
              scale: 2,
            },
            { x: -100, y: 0, z: 0, rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 },
          ],
        },
        regions: [
          {
            minVertex: [0, 0, 0],
            maxVertex: [4, 2, 4],
            center: [2, 1, 2],
            regionType: 1,
            zoneLineInfo: null,
          },
        ],
      },
      'legacy',
      { objectSourcePrefix: '/objects', defaultObjectBoundsRadius: 3 }
    );
    expect(authoring.objects.prototypes).toEqual([
      {
        id: 'tree',
        source: '/objects/tree/final.glb.gz',
        boundsRadius: 3,
        metadata: {
          legacyModel: 'tree',
          sourceCoordinateSystem: 'requiem-y-up',
          generatedAsset: 'final.glb.gz',
        },
      },
    ]);
    expect(authoring.objects.stamps[0]).toMatchObject({
      position: [0.5, 2, 0],
      rotationDegrees: [12, 90, -7],
      scale: [2, 2, 2],
      metadata: {
        legacyIndex: 0,
        sourceCoordinateSystem: 'requiem-y-up',
        transformNormalizedAtPreprocess: true,
        transformContract: 'requiem-y-up-v2',
      },
    });
    expect(authoring.regions[0].kind).toBe('water');
    expect(authoring.regions[0].center).toEqual([2, 1, 2]);
    expect(authoring.regions[0].metadata.transformContract).toBe('requiem-y-up-v2');

    const world = compileShadoWorld([quad(0, 'stone')], {
      name: 'legacy',
      tileSize: 16,
      authoring,
    });
    expect(world.objects?.prototypes.id).toEqual(['tree']);
    expect(world.objects?.prototypeStampRefs).toEqual([0, 1]);
    expect(world.objects?.stamps.radius).toEqual([6, 3]);
    expect(world.objects?.stamps.cellId).toEqual([0, -1]);

    const planes = new Float32Array([
      1, 0, 0, 10, -1, 0, 0, 10, 0, 1, 0, 10, 0, -1, 0, 10, 0, 0, 1, 10, 0, 0, -1, 10,
    ]);
    const coordinator = await ShadoWorldVisibilityCoordinator.create(world);
    const frame = coordinator.reduceWorld(planes, [0.5, 2, 0]);
    const objects = coordinator.reduceWorldObjects(planes, frame, {
      camera: [0.5, 2, 0],
      outsideWorldVisible: false,
    });
    expect(Array.from(objects.visibleIndices)).toEqual([0]);
    expect(Array.from(objects.byPrototype[0])).toEqual([0]);
    const [batch] = buildShadoWorldObjectRenderBatches(world, objects.byPrototype);
    expect(batch.source).toBe('/objects/tree/final.glb.gz');
    expect(Array.from(batch.stampIndices)).toEqual([0]);
    expect(Array.from(batch.matrices.slice(12, 16))).toEqual([0.5, 2, 0, 1]);
    expect(Array.from(batch.colors)).toEqual([1, 1, 1, 1]);
  });

  it('preserves source-space placement and yaw with non-uniform scale', () => {
    const source = {
      x: -11,
      y: 22,
      z: -33,
      rotateX: 14,
      rotateY: -27,
      rotateZ: 39,
      scale: 4,
      scaleX: 1.5,
      scaleZ: 2.5,
    };
    expect(legacyZoneObjectTransformToBabylon(source)).toEqual({
      position: [-11, 22, -33],
      rotationDegrees: [14, -27, 39],
      scale: [1.5, 4, 2.5],
    });
  });

  it('merges newly discovered metadata stamps without overwriting editor changes', () => {
    const initial = importLegacyZoneMetadata(
      {
        objects: {
          tree: [{ x: -1, y: 2, z: 3, rotateY: 10, scale: 1 }],
        },
      },
      'merge'
    );
    initial.objects.stamps[0].position = [77, 88, 99];
    const merged = mergeLegacyZoneMetadata(
      initial,
      {
        objects: {
          tree: [
            { x: -1, y: 2, z: 3, rotateY: 10, scale: 1 },
            { x: -4, y: 5, z: 6, rotateY: 20, scale: 2 },
          ],
          rock: [{ x: -7, y: 8, z: 9, rotateY: 0, scale: 1 }],
        },
      },
      'merge'
    );

    expect(merged.objects.prototypes.map(item => item.id)).toEqual(['tree', 'rock']);
    expect(merged.objects.stamps.map(item => item.id)).toEqual(['tree-0', 'rock-0', 'tree-1']);
    expect(merged.objects.stamps[0].position).toEqual([77, 88, 99]);
    expect(merged.objects.stamps.find(item => item.id === 'tree-1')?.position).toEqual([-4, 5, 6]);
    expect(merged.objects.prototypes[0].source).toBe('/eqrequiem/objects/tree/final.glb.gz');
  });

  it('removes the superseded authoring reflection exactly once', () => {
    const initial = importLegacyZoneMetadata(
      {
        objects: {
          tree: [{ x: -11, y: 22, z: -33, rotateY: -27, scale: 1 }],
        },
        regions: [
          {
            minVertex: [-4, 0, 0],
            maxVertex: [0, 2, 4],
            center: [-2, 1, 2],
            regionType: 1,
          },
        ],
      },
      'upgrade'
    );
    initial.objects.stamps[0].position[0] *= -1;
    initial.objects.stamps[0].rotationDegrees[1] *= -1;
    delete initial.objects.stamps[0].metadata.transformContract;
    initial.objects.stamps[0].metadata.positionMirroredAtPreprocess = true;
    initial.regions[0].center[0] *= -1;
    delete initial.regions[0].metadata.transformContract;
    initial.regions[0].metadata.positionMirroredAtPreprocess = true;

    const upgraded = mergeLegacyZoneMetadata(initial, {}, 'upgrade');
    expect(upgraded.objects.stamps[0].position).toEqual([-11, 22, -33]);
    expect(upgraded.objects.stamps[0].rotationDegrees).toEqual([0, -27, 0]);
    expect(upgraded.objects.stamps[0].metadata.transformContract).toBe('requiem-y-up-v2');
    expect(upgraded.objects.stamps[0].metadata.positionMirroredAtPreprocess).toBeUndefined();
    expect(upgraded.regions[0].center).toEqual([-2, 1, 2]);
    expect(upgraded.regions[0].metadata.transformContract).toBe('requiem-y-up-v2');
  });

  it('rejects duplicate region IDs before preprocessing', () => {
    const authoring = createShadoWorldAuthoring('qey2hh1');
    const region = {
      id: 'duplicate',
      name: 'Duplicate',
      kind: 'semantic' as const,
      enabled: true,
      center: [0, 0, 0] as [number, number, number],
      size: [1, 1, 1] as [number, number, number],
      phaseMask: 1,
      tags: [],
      metadata: {},
    };
    authoring.regions.push(region, structuredClone(region));
    expect(() => validateShadoWorldAuthoring(authoring)).toThrow(/duplicate stable ID/);
  });

  it('uses the BVH as a conservative frustum-query oracle', () => {
    const world = compileShadoWorld([quad(0, 'stone'), quad(20, 'stone')], {
      name: 'qey2hh1',
      tileSize: 16,
      maxClusterTriangles: 2,
    });
    const planes = new Float32Array([
      1, 0, 0, 1, -1, 0, 0, 3, 0, 1, 0, 1, 0, -1, 0, 3, 0, 0, 1, 1, 0, 0, -1, 1,
    ]);
    expect(Array.from(queryShadoWorldFrustum(world, planes))).toEqual([0]);
  });

  it('matches the JavaScript oracle in the precompiled WASM reducer', async () => {
    const world = compileShadoWorld([quad(0, 'stone'), quad(20, 'stone')], {
      name: 'qey2hh1',
      tileSize: 16,
      maxClusterTriangles: 1,
    });
    const planes = new Float32Array([
      1, 0, 0, 1, -1, 0, 0, 3, 0, 1, 0, 1, 0, -1, 0, 3, 0, 0, 1, 1, 0, 0, -1, 1,
    ]);
    const reducer = await ShadoWorldReducer.create(world);
    expect(Array.from(reducer.queryFrustum(planes))).toEqual(
      Array.from(queryShadoWorldFrustum(world, planes))
    );
  });

  it('coordinates geometry cells with SoA entity visibility reason flags', async () => {
    const world = compileShadoWorld([quad(0, 'stone'), quad(20, 'stone')], {
      name: 'qey2hh1',
      tileSize: 16,
      maxClusterTriangles: 2,
    });
    world.pvs = { wordsPerRow: 1, words: [0b01, 0b10] };
    stampShadoWorldIntegrity(world);
    const planes = new Float32Array([
      1, 0, 0, 2, -1, 0, 0, 32, 0, 1, 0, 2, 0, -1, 0, 2, 0, 0, 1, 2, 0, 0, -1, 2,
    ]);
    const coordinator = await ShadoWorldVisibilityCoordinator.create(world);
    const frame = coordinator.reduceWorld(planes, [1, 0, 0]);
    const result = coordinator.reduceEntities(
      {
        count: 2,
        positionX: new Float32Array([1, 20]),
        positionY: new Float32Array([0, 0]),
        positionZ: new Float32Array([0, 0]),
      },
      planes,
      frame,
      { camera: [1, 0, 0], maxDistance: 100, defaultRadius: 1 }
    );

    expect(frame.cameraCell).toBe(0);
    expect(Array.from(frame.visibleClusters)).toEqual([0]);
    expect(Array.from(result.visibleIndices)).toEqual([0]);
    expect(result.flags[0]).toBe(
      ShadoVisibilityBits.Pvs |
        ShadoVisibilityBits.Geometry |
        ShadoVisibilityBits.Frustum |
        ShadoVisibilityBits.Distance |
        ShadoVisibilityBits.Loaded |
        ShadoVisibilityBits.Phase |
        ShadoVisibilityBits.PortalReachable |
        ShadoVisibilityBits.Visible
    );
    expect(result.flags[1] & ShadoVisibilityBits.Visible).toBe(0);
  });

  it('intersects loaded, phase, and portal reachability masks before geometry and actors', async () => {
    const world = compileShadoWorld([quad(0, 'stone'), quad(20, 'stone')], {
      name: 'policy-masks',
      tileSize: 16,
      maxClusterTriangles: 2,
    });
    const planes = new Float32Array([
      1, 0, 0, 100, -1, 0, 0, 100, 0, 1, 0, 100, 0, -1, 0, 100, 0, 0, 1, 100, 0, 0, -1, 100,
    ]);
    const coordinator = await ShadoWorldVisibilityCoordinator.create(world);
    const frame = coordinator.reduceWorld(planes, [1, 0, 0], {
      loadedCells: new Uint8Array([1, 0]),
      phaseCells: new Uint8Array([1, 1]),
      portalReachableCells: new Uint8Array([1, 1]),
    });
    const actors = coordinator.reduceEntities(
      {
        count: 2,
        positionX: new Float32Array([1, 20]),
        positionY: new Float32Array(2),
        positionZ: new Float32Array(2),
      },
      planes,
      frame,
      { camera: [1, 0, 0], defaultRadius: 1 }
    );

    expect(Array.from(frame.visibleClusters)).toEqual([0]);
    expect(frame.cellFlags[1] & ShadoVisibilityBits.Loaded).toBe(0);
    expect(Array.from(actors.visibleIndices)).toEqual([0]);
    expect(actors.flags[1] & ShadoVisibilityBits.Visible).toBe(0);
  });

  it('rejects stale package topology using integrity metadata', () => {
    const world = compileShadoWorld([quad(0, 'stone')], { name: 'integrity' });
    world.clusters.cellId[0] = 99;
    expect(() => validateShadoWorldPackage(world)).toThrow(/cell reference|integrity mismatch/);
  });

  it('compacts 20k entity visibility results inside the WASM reducer', async () => {
    const world = compileShadoWorld([quad(0, 'stone')], {
      name: 'scale',
      tileSize: 16,
      maxClusterTriangles: 2,
    });
    const planes = new Float32Array([
      1, 0, 0, 100, -1, 0, 0, 100, 0, 1, 0, 100, 0, -1, 0, 100, 0, 0, 1, 100, 0, 0, -1, 100,
    ]);
    const coordinator = await ShadoWorldVisibilityCoordinator.create(world);
    const frame = coordinator.reduceWorld(planes, [1, 0, 0]);
    const count = 20_000;
    const result = coordinator.reduceEntities(
      {
        count,
        positionX: new Float32Array(count).fill(1),
        positionY: new Float32Array(count),
        positionZ: new Float32Array(count),
      },
      planes,
      frame,
      { camera: [1, 0, 0], defaultRadius: 1 }
    );

    expect(result.visibleIndices).toHaveLength(count);
    expect(result.flags).toHaveLength(count);
    expect(result.visibleIndices[19_999]).toBe(19_999);
    expect(result.flags.every(flag => !!(flag & ShadoVisibilityBits.Visible))).toBe(true);
  });

  it('rejects malformed GLB primitive data before preprocessing', () => {
    expect(() =>
      compileShadoWorld(
        [
          {
            name: 'broken',
            material: 'stone',
            positions: [0, 0, 0],
            indices: [0, 1, 2],
          },
        ],
        { name: 'qey2hh1' }
      )
    ).toThrow(/invalid vertex index/);
  });
});
