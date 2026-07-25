import { type AbstractEngine, type Quaternion, type Vector3, type Vector4 } from "@babylonjs/core";
import type * as BJS from "@babylonjs/core";
import { ShadoActor, ShadoInstanceContainer } from "@knervous/shado";
/**
 * The client-side view of the shared entity record. All hot render state lives
 * in Shado's packed AoS arena; Babylon nodes and physics bodies are adapters.
 */
export declare class RequiemEntityActor extends ShadoActor {
    entityId: number;
    stateFlags: number;
    appearanceOffset: number;
    appearanceCount: number;
    initialize(): void;
}
export declare const REQUIEM_ACTOR_ACTIVE: number;
export declare const REQUIEM_ACTOR_SELECTED: number;
export declare class RequiemEntityContainer extends ShadoInstanceContainer<RequiemEntityActor> {
    appearance: Float32Array;
    ensureAppearanceCount(count: number): void;
    setAppearance(index: number, value: ArrayLike<number>): void;
}
export declare class ShadoEntityPool {
    readonly shado: RequiemEntityContainer;
    private readonly free;
    private readonly byEntityId;
    private reservedActors;
    static create(engine: AbstractEngine): Promise<ShadoEntityPool>;
    private constructor();
    reserve(actorCount: number, appearanceEntries: number): void;
    acquire(entityId: number, appearanceCount: number): {
        actor: RequiemEntityActor;
        index: number;
    };
    release(index: number): void;
    setTransform(actor: RequiementityActorCompat, position: Vector3, rotation: Quaternion, scale: number): void;
    setAnimation(actor: RequiementityActorCompat, animation: Vector4): void;
    setVisible(actor: RequiementityActorCompat, visible: boolean): void;
    setSelected(actor: RequiementityActorCompat, selected: boolean): void;
    setAppearance(instanceIndex: number, submeshIndex: number, submeshCount: number, slice: number, r: number, g: number, b: number): void;
    commit(): void;
    cull(camera: BJS.Camera, radius: number, maxDistance: number): void;
    dispose(): void;
}
type RequiementityActorCompat = RequiemEntityActor;
export {};
