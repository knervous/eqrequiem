import type * as BJS from "@babylonjs/core";
import type GameManager from "@game/Manager/game-manager";
import { PlayerProfile, Spawn } from "@game/Net/messages";
import type { NullableItemInstance } from "@game/Player/player-constants";
import { Entity } from "./entity";
import { ItemContainer } from "./item-cache";
import { ShadoEntityPool } from "./shado-entity-pool";
type ModelKey = string;
type SubmeshRange = {
    textureAttributesBuffer: Float32Array;
    isRobe: boolean;
    isHelm: boolean;
    atlasArray: string[];
    name: string;
    metadata: {
        model: string;
        piece: string;
        variation: string;
        texNum: string;
    };
};
export type EntityContainer = {
    container: BJS.AssetContainer;
    model: ModelKey;
    manager?: BJS.BakedVertexAnimationManager;
    shaderMaterial?: BJS.ShaderMaterial;
    pickingMaterial?: BJS.ShaderMaterial;
    mesh: BJS.Mesh;
    animations: AnimationEntry[];
    skeleton?: BJS.Skeleton;
    submeshRanges: Map<number, SubmeshRange>;
    itemPool?: Record<string, Promise<ItemContainer | null>>;
    textureAttributesDirtyRef: {
        value: boolean;
    };
    getItem?: (model: string, flip?: boolean, attachmentBoneIndex?: number, attachmentKey?: string) => Promise<ItemContainer | null>;
    attachmentBoneIndices: Readonly<Record<string, number>>;
    attachmentGeometryTransforms: Readonly<Record<string, BJS.Matrix>>;
    shadoPool: ShadoEntityPool;
    addThinInstance: (matrix: BJS.Matrix, entityId: number) => number;
    removeThinInstance: (index: number) => void;
    boundingBox?: {
        min: number[];
        max: number[];
        center: number[];
        yOffset: number;
    } | null;
};
export type AnimationEntry = {
    from: number;
    to: number;
    name: string;
    fps?: number;
};
export type BasisAtlas = {
    texture: BJS.RawTexture2DArray;
    atlas: string[];
};
export declare class EntityCache {
    private static readonly initialEntityCullDistance;
    private static containers;
    private static resolvedContainers;
    private static commonBasisAtlas;
    private static commonBasisAtlasLoaded;
    private static commonBasisAtlasPromise;
    private static generation;
    private static activePools;
    static gameManager: GameManager;
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
    static getContainer(model: string, scene: BJS.Scene): Promise<EntityContainer | null>;
    static entityInstances: Set<Entity>;
    private static renderObserver;
    private static cullObserver;
    private static observerScene;
    private static nameplateLayer;
    static initialize(scene: BJS.Scene): void;
    /**
     * Instantiates an Entity under the given parent (or shared container).
     */
    static getInstance(gameManager: GameManager, spawn: Spawn | PlayerProfile, scene: BJS.Scene, parentNode?: BJS.Node, itemResolver?: (slot: number) => NullableItemInstance): Promise<Entity | null>;
    static unregister(entity: Entity): void;
    static dispose(model: ModelKey): void;
    static disposeAll(scene: BJS.Scene): void;
    private static disposeContainer;
    private static loadCommonBasisAtlas;
}
export default EntityCache;
