import type * as BJS from "@babylonjs/core";
import type { Entity } from "./entity";
export declare class DebugWireframe {
    private wireframeMesh;
    private scene;
    private entity;
    private static enabled;
    constructor(entity: Entity, scene: BJS.Scene);
    static toggleDebugWireframes(): void;
    createWireframe(): void;
    dispose(): void;
}
