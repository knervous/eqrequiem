import {
  buildShadoWorldLightingManifest,
  compileShadoWorld,
  validateShadoWorldLightingManifest,
  type ShadoWorldPrimitive,
} from '../src/world';

function quad(lightmapUvs = true): ShadoWorldPrimitive {
  return {
    name: 'town-square#0',
    material: 'stone',
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    lightmapUvs: lightmapUvs ? new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]) : undefined,
  };
}

describe('Shado per-zone lighting build manifest', () => {
  it('binds stable render chunks to UV2 and deterministic bake outputs', () => {
    const primitive = quad();
    const world = compileShadoWorld([primitive], { name: 'lighting-test' });
    const manifest = buildShadoWorldLightingManifest(world, [primitive]);

    expect(manifest).toMatchObject({
      kind: 'shado.world.lighting-build',
      version: 1,
      zone: 'lighting-test',
      status: 'ready-for-bake',
      encoding: 'rgbm',
      dependencies: {
        worldLayoutHash: world.integrity.layoutHash,
        plannerVersion: 'shado-zone-lighting-plan-v1',
      },
    });
    expect(manifest.dayKeyframes).toEqual([
      { phase: 0, name: 'night' },
      { phase: 0.25, name: 'dawn' },
      { phase: 0.5, name: 'noon' },
      { phase: 0.75, name: 'dusk' },
    ]);
    expect(manifest.chunks).toEqual([
      expect.objectContaining({
        id: 'chunk_000',
        renderChunk: 0,
        primitive: 0,
        primitiveName: 'town-square#0',
        material: 'stone',
        vertexCount: 4,
        uv2: { present: true, coordinateCount: 8 },
        outputs: {
          staticMap: 'lightmaps/chunk_000_static.ktx2',
          dayMaps: [
            'lightmaps/chunk_000_day_0.ktx2',
            'lightmaps/chunk_000_day_1.ktx2',
            'lightmaps/chunk_000_day_2.ktx2',
            'lightmaps/chunk_000_day_3.ktx2',
          ],
          nightLightMap: 'lightmaps/chunk_000_night_lights.ktx2',
        },
      }),
    ]);
    expect(manifest.dependencies.geometryHash).toMatch(/^[0-9a-f]{8}$/);
    expect(manifest.dependencies.uv2Hash).toMatch(/^[0-9a-f]{8}$/);
    expect(() => validateShadoWorldLightingManifest(manifest)).not.toThrow();
  });

  it('emits a blocked plan when a source zone still needs a UV2 unwrap', () => {
    const primitive = quad(false);
    const world = compileShadoWorld([primitive], { name: 'missing-uv2' });
    const manifest = buildShadoWorldLightingManifest(world, [primitive]);

    expect(manifest.status).toBe('blocked-missing-uv2');
    expect(manifest.chunks[0].uv2).toEqual({
      present: false,
      coordinateCount: 0,
    });
  });

  it('rejects malformed UV2 streams before handing work to a baker', () => {
    const primitive = quad();
    primitive.lightmapUvs = new Float32Array([0, 0]);
    const world = compileShadoWorld([primitive], { name: 'bad-uv2' });

    expect(() => buildShadoWorldLightingManifest(world, [primitive])).toThrow(
      /UV2 requires 8 coordinates/
    );
  });
});
