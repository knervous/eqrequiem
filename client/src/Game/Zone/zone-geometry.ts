import { BaseGltfModel, LoaderOptions } from "../GLTF/base";

export default class ZoneMesh extends BaseGltfModel {
  static zoneOptions: Partial<LoaderOptions> = {
    useStaticPhysics: true,
  };
  
  constructor(folder: string, model: string, usePhysics: boolean) {
    super(folder, model, { ...ZoneMesh.zoneOptions, useStaticPhysics: usePhysics });
  }
}
