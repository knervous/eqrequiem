import type * as BJS from "@babylonjs/core";
import type Player from "./player";
export declare class PlayerKeyboard {
    private player;
    private scene;
    private handler;
    modifierKeys: {
        [key: string]: boolean;
    };
    private closestEntities;
    private currentSelectionIndex;
    private boundHandler;
    private readonly movementResetHandler;
    constructor(player: Player, scene: BJS.Scene);
    private resetIndex;
    dispose(): void;
    private updateClosestEntities;
    private handleKeyDownEvent;
    private handleKeyUpEvent;
}
