import type * as BJS from '@babylonjs/core';


export type EntityMeshMetadata = {
    textureAttributesDirtyRef: {
        value: boolean;
    };
    submeshCount: number;
    atlasArrayTexture?: BJS.BaseTexture;
    cloakAtlasArrayTexture?: BJS.BaseTexture;
    helmAtlasArrayTexture?: BJS.BaseTexture;
    vatTexture?: BJS.BaseTexture;
    textureAttributeArray?: BJS.RawTexture;
};
