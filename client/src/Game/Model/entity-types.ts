import type * as BJS from "@babylonjs/core";
import type { ShadoEntityPool } from "./shado-entity-pool";

export type EntityMeshMetadata = {
  textureAttributesDirtyRef: {
    value: boolean;
  };
  shadoPool: ShadoEntityPool;
  submeshCount: number;
  atlasArrayTexture?: BJS.BaseTexture;
  cloakAtlasArrayTexture?: BJS.BaseTexture;
  helmAtlasArrayTexture?: BJS.BaseTexture;
  vatTexture?: BJS.BaseTexture;
  vatTextureSizeInverted: BJS.Vector2;
  gpuPickingMaterial?: BJS.ShaderMaterial;
};
