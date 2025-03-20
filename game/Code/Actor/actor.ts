import { BaseGltfModel, LoaderOptions } from "../GLTF/base";


export default class Actor extends BaseGltfModel {
    static actorOptions: LoaderOptions = {
        flipTextureY: true
    } 
    constructor(folder: string, model: string) {
        super(folder, model, true);
        this.LoaderOptions = Actor.actorOptions;
    }
    public Load(name: string) {

    }
}