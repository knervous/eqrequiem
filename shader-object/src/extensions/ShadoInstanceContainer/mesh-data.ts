// mesh-data.ts
import { BABYLON, type Mesh, type SubMesh } from '../../babylon';
import type { ArrayAtlas } from '../AtlasBuilder/AtlasBuilder';

/** Map for one mesh: subMesh.index -> atlas id string */
export type MeshSubmeshAtlasIds = Map<number, string>;
export type SubmeshIdResolver = (sm: SubMesh, smOrdinal: number) => string | undefined;

/**
 * For a single mesh, stamp aPage (float layer) and aRect (vec4 u0,v0,u1,v1)
 * into per-vertex streams, using each SubMesh's vertex span.
 */
export function stampSubmeshAtlasAttributes(
  mesh: Mesh,
  atlas: ArrayAtlas,
  resolveId: SubmeshIdResolver
) {
  const vcount = mesh.getTotalVertices();
  if (!vcount) return;

  const aPage = new Float32Array(vcount);
  const aRect = new Float32Array(vcount * 4);

  const defaultRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

  mesh.subMeshes.forEach((sm, ordinal) => {
    const id = resolveId(sm, ordinal);
    const entry = id ? atlas.entries[id] : undefined;
    const page = entry ? entry.layer : 0;
    const rect = entry ? entry.rect : defaultRect;

    const v0 = sm.verticesStart;
    const v1 = v0 + sm.verticesCount; // exclusive
    for (let vi = v0; vi < v1; vi++) {
      aPage[vi] = page;
      const o = vi * 4;
      aRect[o + 0] = rect.u0;
      aRect[o + 1] = rect.v0;
      aRect[o + 2] = rect.u1;
      aRect[o + 3] = rect.v1;
    }
  });

  mesh.setVerticesData('aPage', aPage, true, 1);
  mesh.setVerticesData('aRect', aRect, true, 4);
}

/**
 * After MergeMeshes, re-attach concatenated custom attributes so they line up.
 * Concatenation order must match the meshes[] you passed to MergeMeshes.
 */
export function mergeWithPreservedAtlasAttributes(meshes: Mesh[], merged: Mesh) {
  const totalVerts = meshes.reduce((n, m) => n + (m.getTotalVertices() || 0), 0);

  // aPage (stride 1)
  {
    const dst = new Float32Array(totalVerts);
    let w = 0;
    for (const m of meshes) {
      const v = m.getTotalVertices() || 0;
      const src = (m.getVerticesData('aPage') as Float32Array) ?? new Float32Array(v);
      dst.set(src, w);
      w += v;
    }
    merged.setVerticesData('aPage', dst, false, 1);
  }

  // aRect (stride 4)
  {
    const dst = new Float32Array(totalVerts * 4);
    let w = 0;
    for (const m of meshes) {
      const v = m.getTotalVertices() || 0;
      const src = (m.getVerticesData('aRect') as Float32Array) ?? new Float32Array(v * 4);
      dst.set(src, w * 4);
      w += v;
    }
    merged.setVerticesData('aRect', dst, false, 4);
  }
}

/**
 * Babylon's WebGPU path recompiles shaders when common vertex buffers are
 * stored as byte/short data. Shado's VAT shader reads bone indices as floats
 * and rounds them, so normalizing these streams up front keeps the WebGPU
 * attribute layout stable and avoids a second non-float shader rewrite.
 */
export function normalizeSkinningIndexAttributesForWebGPU(mesh: Mesh) {
  const kinds = [
    BABYLON.VertexBuffer.MatricesIndicesKind,
    BABYLON.VertexBuffer.MatricesIndicesExtraKind,
  ];

  for (const kind of kinds) {
    if (!mesh.isVerticesDataPresent(kind)) continue;
    const data = mesh.getVerticesData(kind);
    if (!data) continue;
    mesh.setVerticesData(kind, new Float32Array(Array.from(data)), false, 4);
  }
}
