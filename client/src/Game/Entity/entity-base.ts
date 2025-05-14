import { BaseGltfModel, LoaderOptions } from "../GLTF/base";

export default class EntityBase extends BaseGltfModel {
  static objectOptions: Partial<LoaderOptions> = {
    secondaryMeshIndex: 0,
    shadow: false,
    cullRange: 250,
    doCull: true,
  };
  
  constructor(folder: string, model: string) {
    super(folder, model, { ...EntityBase.objectOptions });
  }
}
