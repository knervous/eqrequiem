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

  // Optional semantic part id used by appearance extensions. Keeping this
  // generic lets clients define their own slot schema without coupling the
  // base container to EQ equipment names.
  if (meshes.some(mesh => mesh.isVerticesDataPresent('aPart'))) {
    const dst = new Float32Array(totalVerts);
    let w = 0;
    for (const mesh of meshes) {
      const count = mesh.getTotalVertices() || 0;
      const src = (mesh.getVerticesData('aPart') as Float32Array) ?? new Float32Array(count);
      dst.set(src, w);
      w += count;
    }
    merged.setVerticesData('aPart', dst, false, 1);
  }

  // Optional per-instance geometry variant selector. Every source mesh is
  // stamped (body=0, weapon variants=1..N), then concatenated explicitly;
  // Babylon's generic MergeMeshes path does not preserve arbitrary streams.
  if (meshes.some(mesh => mesh.isVerticesDataPresent('aWeapon'))) {
    const dst = new Float32Array(totalVerts);
    let w = 0;
    for (const mesh of meshes) {
      const count = mesh.getTotalVertices() || 0;
      const src = (mesh.getVerticesData('aWeapon') as Float32Array) ?? new Float32Array(count);
      dst.set(src, w);
      w += count;
    }
    merged.setVerticesData('aWeapon', dst, false, 1);
  }

  // Optional four-layer material lookup used by equipment systems. Each
  // component selects a texture-array layer for one complete appearance set.
  if (meshes.some(mesh => mesh.isVerticesDataPresent('aEqLayers'))) {
    const dst = new Float32Array(totalVerts * 4);
    dst.fill(-1);
    let w = 0;
    for (const mesh of meshes) {
      const count = mesh.getTotalVertices() || 0;
      const src = mesh.getVerticesData('aEqLayers') as Float32Array | null;
      if (src) dst.set(src, w * 4);
      w += count;
    }
    merged.setVerticesData('aEqLayers', dst, false, 4);
  }
}

const packLayerPair = (first: number, second: number): number => {
  const low = Math.max(0, Math.min(255, Math.round(first) + 1));
  const high = Math.max(0, Math.min(255, Math.round(second) + 1));
  return low | (high << 8);
};

/**
 * Compacts page, geometry variant, and four EQ texture-array layers into one
 * vec4 vertex stream. WebGPU implementations are only required to expose
 * eight vertex-buffer slots; leaving each scalar/vec4 in its own Babylon
 * VertexBuffer exceeded that limit once skinning streams were included.
 *
 * Layout: x=atlas page, y=geometry variant, z=layers 0/1, w=layers 2/3.
 * Layer indices are stored as two unsigned bytes after adding one, preserving
 * -1 as the no-override sentinel.
 */
export function compactShadoVertexMetadata(mesh: Mesh): void {
  const count = mesh.getTotalVertices() || 0;
  if (!count) return;
  const pages = mesh.getVerticesData('aPage') as ArrayLike<number> | null;
  const weapons = mesh.getVerticesData('aWeapon') as ArrayLike<number> | null;
  const layers = mesh.getVerticesData('aEqLayers') as ArrayLike<number> | null;
  const metadata = new Float32Array(count * 4);

  for (let vertex = 0; vertex < count; vertex++) {
    const offset = vertex * 4;
    metadata[offset] = pages?.[vertex] ?? 0;
    metadata[offset + 1] = weapons?.[vertex] ?? 0;
    metadata[offset + 2] = packLayerPair(layers?.[offset] ?? -1, layers?.[offset + 1] ?? -1);
    metadata[offset + 3] = packLayerPair(layers?.[offset + 2] ?? -1, layers?.[offset + 3] ?? -1);
  }

  mesh.setVerticesData('aMeta', metadata, false, 4);
  for (const kind of ['aPage', 'aPart', 'aWeapon', 'aEqLayers']) {
    if (mesh.isVerticesDataPresent(kind)) mesh.removeVerticesData(kind);
  }
  // ShaderMaterial automatically advertises a color buffer whenever one is
  // present. Shado appearance is instance-driven and never consumed this
  // stream, so retaining it would spend a ninth slot on eight-weight rigs.
  if (mesh.isVerticesDataPresent(BABYLON.VertexBuffer.ColorKind)) {
    mesh.removeVerticesData(BABYLON.VertexBuffer.ColorKind);
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
