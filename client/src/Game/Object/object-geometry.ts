import { BaseGltfModel, LoaderOptions } from "../GLTF/base";

export default class ObjectMesh extends BaseGltfModel {
  static objectOptions: LoaderOptions = {
    useStaticPhysics: true,
    flipTextureY: false,
    secondaryMeshIndex: 0,
    shadow: false,
    cullRange: 750,
    doCull: true,
  };
  
  constructor(folder: string, model: string) {
    super(folder, model, ObjectMesh.objectOptions);
  }
}
