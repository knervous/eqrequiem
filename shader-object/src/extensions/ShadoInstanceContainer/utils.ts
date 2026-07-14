// utils.ts
import type {
  Mesh,
  Material,
  MultiMaterial,
  Texture,
  StandardMaterial,
  PBRMaterial,
  SubMesh,
} from '../../babylon';

export type Channel =
  | 'albedo'
  | 'diffuse'
  | 'opacity'
  | 'emissive'
  | 'normal'
  | 'ambientOcclusion'
  | 'metallic'
  | 'roughness'
  | 'metallicRoughness'
  | 'specularGlossiness'
  | 'lightmap'
  | 'detail'; // catch-alls some pipelines use

export type Source = { id: string; tex: Texture };

type Collected = {
  sources: Source[];
  byMeshId: Map<string, { [ch in Channel]?: string }>;
  byId: Map<string, { tex: Texture; channel: Channel; material: Material }>;
};

function isTexture(x: any): x is Texture {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof x.getClassName === 'function' &&
    /Texture$/.test(x.getClassName())
  );
}

// Prefer URL for stability across clones; fallback to internalTexture/texture unique ids.
function getTextureKey(tex: Texture): string {
  const any: any = tex;
  const it = any.getInternalTexture?.() ?? any._texture;
  if (it?.uniqueId != null) return `it:${it.uniqueId}`;
  if (tex.uniqueId != null) return `tx:${tex.uniqueId}`;
  // absolute fallback (shouldn’t usually happen)
  return `tx:${Math.random().toString(36).slice(2)}`;
}

// Extract ALL 2D texture slots we care about from a material
function texturesFromMaterial(mat: Material): Partial<Record<Channel, Texture>> {
  const any: any = mat;
  const out: Partial<Record<Channel, any>> = {};

  // StandardMaterial (legacy)
  if ((mat as StandardMaterial).diffuseTexture)
    out.diffuse = (mat as StandardMaterial).diffuseTexture!;
  if (any.opacityTexture) out.opacity = any.opacityTexture;
  if (any.emissiveTexture) out.emissive = any.emissiveTexture;
  if (any.bumpTexture) out.normal = any.bumpTexture;
  if (any.ambientTexture) out.ambientOcclusion = any.ambientTexture;
  if (any.specularTexture) out.specularGlossiness = any.specularTexture;
  if (any.lightmapTexture) out.lightmap = any.lightmapTexture;
  if (any.detailMap?.texture) out.detail = any.detailMap.texture;

  // PBRMaterial (Babylon)
  const pbr = mat as PBRMaterial;
  if (pbr.albedoTexture) out.albedo = pbr.albedoTexture;
  if (pbr.opacityTexture) out.opacity = pbr.opacityTexture ?? out.opacity;
  if (pbr.emissiveTexture) out.emissive = pbr.emissiveTexture ?? out.emissive;
  if ((pbr as any).normalTexture) out.normal = (pbr as any).normalTexture ?? out.normal;
  if (pbr.bumpTexture) out.normal = pbr.bumpTexture ?? out.normal; // some pipelines still set bump
  if (pbr.ambientTexture) out.ambientOcclusion = pbr.ambientTexture ?? out.ambientOcclusion;

  // Metallic/Roughness variants
  if (pbr.metallicTexture) out.metallicRoughness = pbr.metallicTexture;
  if ((pbr as any).metallicRoughnessTexture)
    out.metallicRoughness = (pbr as any).metallicRoughnessTexture;
  if ((pbr as any).metallicTexture) out.metallic = (pbr as any).metallicTexture;
  if ((pbr as any).roughnessTexture) out.roughness = (pbr as any).roughnessTexture;

  // Spec/Gloss (KHR_materials_pbrSpecularGlossiness)
  if (any.specularGlossinessTexture) out.specularGlossiness = any.specularGlossinessTexture;

  // Filter to 2D textures only (skip cube/env and 3D/array sources — those we don’t atlas here)
  for (const k of Object.keys(out) as Channel[]) {
    const t = out[k];
    if (!isTexture(t)) {
      delete out[k];
      continue;
    }
    const cls = (t as any).getClassName?.() ?? '';
    if (
      cls.includes('CubeTexture') ||
      cls.includes('HDRTexture') ||
      cls.includes('EquiRectangular')
    ) {
      delete out[k];
    }
  }
  return out;
}

/**
 * Walk all meshes and gather EVERY 2D texture channel found.
 * Dedupe by (channel + key(url|internalTextureId|textureId)).
 */
export function collectSourcesFromMeshes(meshes: Mesh[]): Collected {
  const byId = new Map<string, { tex: Texture; channel: Channel; material: Material }>();
  const byMeshId = new Map<string, { [ch in Channel]?: string }>();
  const seen = new Set<string>();

  const pushTex = (channel: Channel, tex: Texture, material: Material) => {
    const key = getTextureKey(tex);
    const id = `${channel}:${key}`;
    if (!seen.has(id)) {
      seen.add(id);
      byId.set(id, { tex, channel, material });
    }
    return id;
  };

  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat) continue;

    // MultiMaterial: honor subMeshes’ materialIndex ordering
    if ((mat as MultiMaterial).subMaterials) {
      const mm = mat as MultiMaterial;
      const rec: { [ch in Channel]?: string } = {};
      for (const sm of mesh.subMeshes) {
        const subMat = mm.subMaterials[sm.materialIndex];
        if (!subMat) continue;
        const texs = texturesFromMaterial(subMat);
        for (const ch of Object.keys(texs) as Channel[]) {
          const t = texs[ch];
          const id = pushTex(ch, t!, subMat);
          // Keep the first seen per channel for this mesh
          if (id && !rec[ch]) rec[ch] = id;
        }
      }
      if (Object.keys(rec).length) byMeshId.set(String(mesh.uniqueId), rec);
    } else {
      // Single material
      const texs = texturesFromMaterial(mat);
      const rec: { [ch in Channel]?: string } = {};
      for (const ch of Object.keys(texs) as Channel[]) {
        const t = texs[ch];
        const id = pushTex(ch, t!, mat);
        if (id) rec[ch] = id;
      }
      if (Object.keys(rec).length) byMeshId.set(String(mesh.uniqueId), rec);
    }
  }

  // Emit flat source list
  const sources: Source[] = Array.from(byId.entries()).map(([id, rec]) => ({ id, tex: rec.tex }));
  return { sources, byMeshId, byId };
}

// choose a preferred channel order for the atlas (albedo > diffuse > emissive ...)
const PREFERRED: Array<keyof ReturnType<typeof texturesFromMaterial>> = [
  'albedo',
  'diffuse',
  'emissive',
  'opacity',
  'normal',
];

export function makeResolverForMesh(
  mesh: Mesh,
  idForTexture: (tex: Texture) => string | undefined // map Texture -> atlas id (from your collector)
) {
  const mat = mesh.material as Material | MultiMaterial | null;

  return (sm: SubMesh, _ordinal: number): string | undefined => {
    const mtl: Material | null =
      mat && 'subMaterials' in (mat as any)
        ? ((mat as any).subMaterials[sm.materialIndex] ?? null)
        : (mat as Material | null);

    if (!mtl) return undefined;

    const texs = texturesFromMaterial(mtl);
    for (const key of PREFERRED) {
      const t = texs[key];
      if (t) {
        const id = idForTexture(t);
        if (id) return id;
      }
    }
    return undefined;
  };
}
