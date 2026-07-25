import type * as BJS from "@babylonjs/core";
import { Transform } from "@game/Zone/zone-types";
type ModelKey = string;
type ContainerData = {
    container: BJS.AssetContainer;
    hasAnimations: boolean;
    animationRanges: BJS.Nullable<BJS.AnimationRange>[];
    physicsBodies: BJS.PhysicsBody[] | null;
    manager: BJS.BakedVertexAnimationManager | null;
    morphTargetManager: BJS.MorphTargetManager | undefined;
};
export default class ObjectCache {
    dataContainers: Record<ModelKey, Promise<ContainerData>>;
    private objectContainer;
    private animatedMaterialNames;
    private managerCallbacks;
    private promotedMeshes;
    constructor(zoneContainer?: BJS.TransformNode | null);
    getContainer(model: string, scene: BJS.Scene, promotedSource?: string): Promise<ContainerData | null>;
    addThinInstances(model: string, scene: BJS.Scene, instanceTranslations: Transform[]): Promise<BJS.AbstractMesh[]>;
    /**
     * Upload final Babylon-space matrices produced by a Shado world package.
     * Unlike the legacy Transform path, these matrices must not receive any
     * coordinate-system or yaw correction in the client.
     */
    setPromotedThinInstances(model: string, source: string, scene: BJS.Scene, matrixData: Float32Array): Promise<BJS.Mesh[]>;
    dispose(model: ModelKey): void;
    disposeAll(): void;
}
export {};
