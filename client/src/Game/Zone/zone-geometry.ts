import { BaseGltfModel, LoaderOptions } from "../GLTF/base";

export default class ZoneMesh extends BaseGltfModel {
  static zoneOptions: LoaderOptions = {
    useStaticPhysics: true,
  };
  
  constructor(folder: string, model: string) {
    super(folder, model, ZoneMesh.zoneOptions);
  }
}
