import type * as BJS from "@babylonjs/core";
type ModelKey = string;
export type ItemContainer = {
    container: BJS.AssetContainer;
    model: ModelKey;
    meshes: BJS.Mesh[];
};
export declare class ItemCache {
    private static containers;
    private static resolvedContainers;
    private static generation;
    /**
     * Retrieves or creates a shared parent node on the scene
     * under which all entities will be bucketed.
     */
    private static getOrCreateNodeContainer;
    /**
     * Loads (or returns cached) mesh/animation container for a given model.
     * @param model       model key (lowercased)
     * @param scene       Babylon scene
     * @param parentNode  parent under which to attach; defaults to shared container
     */
    static getContainer(model: string, vatOwnerItemModel: string, scene: BJS.Scene, manager?: BJS.BakedVertexAnimationManager | null, skeleton?: BJS.Skeleton | null, flip?: boolean, attachmentBoneIndex?: number, attachmentKey?: string, attachmentGeometryTransform?: BJS.Matrix): Promise<ItemContainer | null>;
    static dispose(model: ModelKey): void;
    static disposeAll(): void;
}
export default ItemCache;
